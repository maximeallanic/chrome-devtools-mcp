// Chrome DevTools MCP Custom - Background Service Worker
// Manages chrome.debugger API, tab control, and HTTP communication with MCP server

const MCP_SERVER_URL = 'http://localhost:3456';

// Multi-tab data storage
const attachedTabs = new Map(); // tabId -> { debuggerAttached, networkRequests, consoleLogs, performanceMetrics }
let mcpServerConnected = false;

// Service Worker log capture
const serviceWorkerLogs = [];
const MAX_LOGS = 500;

// External extension logs storage
const externalExtensionLogs = new Map(); // extensionId -> { logs: [], lastSeen: timestamp }
const MAX_LOGS_PER_EXTENSION = 1000;

// Intercept console methods to capture logs
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

function captureLog(level, args) {
  const timestamp = new Date().toISOString();
  const message = Array.from(args).map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');

  serviceWorkerLogs.push({
    timestamp,
    level,
    message
  });

  // Keep only last MAX_LOGS entries
  if (serviceWorkerLogs.length > MAX_LOGS) {
    serviceWorkerLogs.shift();
  }
}

// Override console methods
console.log = function(...args) {
  captureLog('log', args);
  originalConsole.log.apply(console, args);
};

console.error = function(...args) {
  captureLog('error', args);
  originalConsole.error.apply(console, args);
};

console.warn = function(...args) {
  captureLog('warn', args);
  originalConsole.warn.apply(console, args);
};

console.info = function(...args) {
  captureLog('info', args);
  originalConsole.info.apply(console, args);
};

console.debug = function(...args) {
  captureLog('debug', args);
  originalConsole.debug.apply(console, args);
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Chrome DevTools MCP Custom installed');
  checkMcpServerConnection();
});

// Handle messages from popup and MCP server
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // Keep channel open for async responses
});

// Handle messages from external extensions (for debug helper)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'external_extension_log') {
    const extensionId = sender.id || message.extensionId;

    if (!externalExtensionLogs.has(extensionId)) {
      externalExtensionLogs.set(extensionId, { logs: [], lastSeen: Date.now() });
    }

    const extData = externalExtensionLogs.get(extensionId);
    extData.logs.push({
      level: message.level,
      message: message.message,
      timestamp: message.timestamp,
      context: message.context
    });
    extData.lastSeen = Date.now();

    // Limit the number of logs per extension
    if (extData.logs.length > MAX_LOGS_PER_EXTENSION) {
      extData.logs = extData.logs.slice(-MAX_LOGS_PER_EXTENSION);
    }

    // Send to MCP server
    sendToMcpServer('external_extension_log', {
      extensionId,
      level: message.level,
      message: message.message,
      timestamp: message.timestamp,
      context: message.context
    });

    sendResponse({ success: true });
  }
  return true;
});

async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.action) {
      // Tab management
      case 'create_tab':
        const newTab = await chrome.tabs.create({ url: request.url, active: request.active !== false });
        sendResponse({ success: true, tab: serializeTab(newTab) });
        break;

      case 'list_tabs':
        const tabs = await chrome.tabs.query({});
        sendResponse({ success: true, tabs: tabs.map(serializeTab) });
        break;

      case 'close_tab':
        await chrome.tabs.remove(request.tabId);
        if (attachedTabs.has(request.tabId)) {
          await detachDebugger(request.tabId);
        }
        sendResponse({ success: true });
        break;

      case 'get_tab':
        const tab = await chrome.tabs.get(request.tabId);
        sendResponse({ success: true, tab: serializeTab(tab) });
        break;

      // Navigation
      case 'navigate_to':
        await chrome.tabs.update(request.tabId, { url: request.url });
        sendResponse({ success: true });
        break;

      case 'navigate_back':
        await chrome.tabs.goBack(request.tabId);
        sendResponse({ success: true });
        break;

      case 'navigate_forward':
        await chrome.tabs.goForward(request.tabId);
        sendResponse({ success: true });
        break;

      case 'reload_tab':
        await chrome.tabs.reload(request.tabId);
        sendResponse({ success: true });
        break;

      // Debugger attachment
      case 'attach_debugger':
        await attachDebugger(request.tabId);
        sendResponse({ success: true });
        break;

      case 'detach_debugger':
        await detachDebugger(request.tabId);
        sendResponse({ success: true });
        break;

      case 'list_attached_tabs':
        sendResponse({ success: true, tabIds: Array.from(attachedTabs.keys()) });
        break;

      // DevTools data
      case 'get_network_requests':
        const networkData = getTabData(request.tabId);
        sendResponse({ success: true, requests: networkData.networkRequests });
        break;

      case 'get_console_logs':
        const consoleData = getTabData(request.tabId);
        sendResponse({ success: true, logs: consoleData.consoleLogs });
        break;

      case 'get_performance_metrics':
        const perfData = getTabData(request.tabId);
        sendResponse({ success: true, metrics: perfData.performanceMetrics });
        break;

      case 'clear_data':
        if (request.tabId) {
          clearTabData(request.tabId);
        } else {
          // Clear all tabs
          attachedTabs.forEach((_, tabId) => clearTabData(tabId));
        }
        sendResponse({ success: true });
        break;

      // Script execution
      case 'execute_script':
        const result = await executeScript(request.tabId, request.code);
        sendResponse({ success: true, result });
        break;

      // Screenshot
      case 'capture_screenshot':
        const screenshot = await captureScreenshot(request.tabId, request.format || 'png');
        sendResponse({ success: true, screenshot });
        break;

      case 'capture_element_screenshot':
        const elemScreenshot = await captureElementScreenshot(request.tabId, request.selector, request.padding);
        sendResponse({ success: true, screenshot: elemScreenshot });
        break;

      // Page interaction
      case 'click_element':
        await clickElement(request.tabId, request.selector);
        sendResponse({ success: true });
        break;

      case 'fill_input':
        await fillInput(request.tabId, request.selector, request.value);
        sendResponse({ success: true });
        break;

      case 'get_element_text':
        const text = await getElementText(request.tabId, request.selector);
        sendResponse({ success: true, text });
        break;

      case 'wait_for_element':
        await waitForElement(request.tabId, request.selector, request.timeout || 30000);
        sendResponse({ success: true });
        break;

      case 'scroll_to':
        await scrollTo(request.tabId, request.selector);
        sendResponse({ success: true });
        break;

      case 'inspect_element':
        const elementInfo = await inspectElement(request.tabId, request.selector);
        sendResponse({ success: true, element: elementInfo });
        break;

      // Extension Management
      case 'list_extensions':
        const extensions = await chrome.management.getAll();
        sendResponse({ success: true, extensions });
        break;

      case 'get_extension_info':
        const extInfo = await chrome.management.get(request.extensionId);
        sendResponse({ success: true, extension: extInfo });
        break;

      case 'reload_extension':
        await chrome.management.setEnabled(request.extensionId, false);
        await chrome.management.setEnabled(request.extensionId, true);
        sendResponse({ success: true });
        break;

      case 'get_manifest':
        const manifest = chrome.runtime.getManifest();
        sendResponse({ success: true, manifest });
        break;

      case 'get_service_worker_logs':
        const limit = request.limit || 100;
        const levelFilter = request.levelFilter;
        let logs = [...serviceWorkerLogs];

        if (levelFilter) {
          logs = logs.filter(log => log.level === levelFilter);
        }

        logs = logs.slice(-limit);
        sendResponse({ success: true, logs, total: serviceWorkerLogs.length });
        break;

      case 'clear_service_worker_logs':
        serviceWorkerLogs.length = 0;
        sendResponse({ success: true });
        break;

      // External extension logs
      case 'list_external_extensions':
        const extList = [];
        for (const [extId, data] of externalExtensionLogs) {
          extList.push({
            extensionId: extId,
            logCount: data.logs.length,
            lastSeen: data.lastSeen
          });
        }
        sendResponse({ success: true, extensions: extList });
        break;

      case 'get_external_extension_logs':
        const targetExtId = request.extensionId;
        const targetExtData = externalExtensionLogs.get(targetExtId);
        if (!targetExtData) {
          sendResponse({ success: false, error: 'Extension not found. Make sure the extension has the debug helper installed and has logged something.' });
          break;
        }

        let extLogs = [...targetExtData.logs];
        if (request.levelFilter) {
          extLogs = extLogs.filter(l => l.level === request.levelFilter);
        }
        extLogs = extLogs.slice(-(request.limit || 100));

        sendResponse({ success: true, logs: extLogs, total: targetExtData.logs.length });
        break;

      case 'clear_external_extension_logs':
        if (request.extensionId) {
          externalExtensionLogs.delete(request.extensionId);
        } else {
          externalExtensionLogs.clear();
        }
        sendResponse({ success: true });
        break;

      // Status
      case 'get_status':
        sendResponse({
          success: true,
          mcpServerConnected,
          attachedTabs: Array.from(attachedTabs.keys()),
          totalTabs: (await chrome.tabs.query({})).length
        });
        break;

      // Advanced content script utilities
      case 'call_utility':
        const utilityResult = await callContentScriptUtility(
          request.tabId,
          request.utility,
          request.method,
          request.args || []
        );
        sendResponse({ success: true, result: utilityResult });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action: ' + request.action });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Serialize tab object for JSON
function serializeTab(tab) {
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
    windowId: tab.windowId,
    index: tab.index,
    pinned: tab.pinned,
    status: tab.status,
    favIconUrl: tab.favIconUrl
  };
}

// Get or create tab data
function getTabData(tabId) {
  if (!attachedTabs.has(tabId)) {
    attachedTabs.set(tabId, {
      debuggerAttached: false,
      networkRequests: [],
      consoleLogs: [],
      performanceMetrics: {}
    });
  }
  return attachedTabs.get(tabId);
}

// Clear tab data
function clearTabData(tabId) {
  const data = getTabData(tabId);
  data.networkRequests = [];
  data.consoleLogs = [];
  data.performanceMetrics = {};
}

// Attach debugger to tab
async function attachDebugger(tabId) {
  const tabData = getTabData(tabId);

  if (tabData.debuggerAttached) {
    console.log('Debugger already attached to tab', tabId);
    return;
  }

  const debuggee = { tabId };

  try {
    await chrome.debugger.attach(debuggee, '1.3');
    tabData.debuggerAttached = true;

    // Enable domains
    await chrome.debugger.sendCommand(debuggee, 'Network.enable');
    await chrome.debugger.sendCommand(debuggee, 'Console.enable');
    await chrome.debugger.sendCommand(debuggee, 'Performance.enable');
    await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
    await chrome.debugger.sendCommand(debuggee, 'Page.enable');

    console.log('Debugger attached to tab', tabId);

    // Clear previous data
    clearTabData(tabId);

    // Notify MCP server
    sendToMcpServer('tab_attached', { tabId });

  } catch (error) {
    tabData.debuggerAttached = false;
    throw error;
  }
}

// Detach debugger from tab
async function detachDebugger(tabId) {
  const tabData = attachedTabs.get(tabId);
  if (!tabData || !tabData.debuggerAttached) {
    return;
  }

  const debuggee = { tabId };

  try {
    await chrome.debugger.detach(debuggee);
  } catch (error) {
    console.error('Error detaching debugger from tab', tabId, error);
  }

  tabData.debuggerAttached = false;

  // Notify MCP server
  sendToMcpServer('tab_detached', { tabId });
}

// Constants for body capture
const MAX_BODY_SIZE = 50000; // 50KB max per body
const CAPTURABLE_MIME_TYPES = ['json', 'text', 'xml', 'javascript', 'html'];

// Handle debugger events
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const tabId = source.tabId;
  const tabData = attachedTabs.get(tabId);

  if (!tabData || !tabData.debuggerAttached) return;

  switch (method) {
    // Network events
    case 'Network.requestWillBeSent':
      const networkData = {
        tabId,
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        headers: params.request.headers,
        timestamp: params.timestamp,
        type: params.type,
        // Capture POST data if available
        hasPostData: params.request.hasPostData || false,
        postData: params.request.postData || null
      };

      // If hasPostData but postData not directly available, fetch it
      if (params.request.hasPostData && !networkData.postData) {
        try {
          const postDataResult = await chrome.debugger.sendCommand(
            { tabId },
            'Network.getRequestPostData',
            { requestId: params.requestId }
          );
          networkData.postData = postDataResult.postData;
          // Truncate if too large
          if (networkData.postData && networkData.postData.length > MAX_BODY_SIZE) {
            networkData.postData = networkData.postData.substring(0, MAX_BODY_SIZE);
            networkData.postDataTruncated = true;
          }
        } catch (e) {
          // POST data may not be available (e.g., for redirects)
        }
      }

      tabData.networkRequests.push(networkData);

      // Keep only last 1000 requests per tab
      if (tabData.networkRequests.length > 1000) {
        tabData.networkRequests = tabData.networkRequests.slice(-1000);
      }
      break;

    case 'Network.responseReceived':
      const request = tabData.networkRequests.find(r => r.requestId === params.requestId);
      if (request) {
        request.response = {
          status: params.response.status,
          statusText: params.response.statusText,
          headers: params.response.headers,
          mimeType: params.response.mimeType
        };
        // Don't send yet - wait for loadingFinished to capture body
      }
      break;

    case 'Network.loadingFinished':
      const finishedRequest = tabData.networkRequests.find(r => r.requestId === params.requestId);
      if (finishedRequest) {
        // Add timing info
        finishedRequest.timing = {
          duration: params.timestamp - finishedRequest.timestamp,
          encodedDataLength: params.encodedDataLength
        };

        // Capture response body for text-based MIME types
        if (finishedRequest.response) {
          const mimeType = finishedRequest.response.mimeType || '';
          const shouldCaptureBody = CAPTURABLE_MIME_TYPES.some(type => mimeType.includes(type));

          if (shouldCaptureBody) {
            try {
              const bodyResult = await chrome.debugger.sendCommand(
                { tabId },
                'Network.getResponseBody',
                { requestId: params.requestId }
              );

              let body = bodyResult.base64Encoded
                ? atob(bodyResult.body)
                : bodyResult.body;

              // Truncate if too large
              if (body && body.length > MAX_BODY_SIZE) {
                body = body.substring(0, MAX_BODY_SIZE);
                finishedRequest.response.bodyTruncated = true;
              }

              finishedRequest.response.body = body;
            } catch (e) {
              // Body may not be available (streaming, errors, etc.)
            }
          }
        }

        // Now send the complete request data to MCP server
        sendToMcpServer('network', finishedRequest);
      }
      break;

    // Console events
    case 'Console.messageAdded':
      const consoleData = {
        tabId,
        level: params.message.level,
        text: params.message.text,
        timestamp: Date.now(),
        source: params.message.source
      };
      tabData.consoleLogs.push(consoleData);

      // Keep only last 1000 logs per tab
      if (tabData.consoleLogs.length > 1000) {
        tabData.consoleLogs = tabData.consoleLogs.slice(-1000);
      }

      sendToMcpServer('console', consoleData);
      break;

    case 'Runtime.consoleAPICalled':
      const logMessage = {
        tabId,
        level: params.type,
        args: params.args,
        timestamp: params.timestamp
      };
      tabData.consoleLogs.push(logMessage);

      if (tabData.consoleLogs.length > 1000) {
        tabData.consoleLogs = tabData.consoleLogs.slice(-1000);
      }

      sendToMcpServer('console', logMessage);
      break;

    // Performance events
    case 'Performance.metrics':
      tabData.performanceMetrics = params.metrics;
      sendToMcpServer('performance', { tabId, metrics: params.metrics });
      break;
  }
});

// Handle debugger detach (e.g., tab closed)
chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  const tabData = attachedTabs.get(tabId);

  if (tabData) {
    console.log('Debugger detached from tab', tabId, ':', reason);
    tabData.debuggerAttached = false;

    // Remove tab data after a delay (in case tab is being reloaded)
    setTimeout(() => {
      chrome.tabs.get(tabId).catch(() => {
        // Tab no longer exists, remove data
        attachedTabs.delete(tabId);
        sendToMcpServer('tab_removed', { tabId });
      });
    }, 1000);
  }
});

// Execute script in tab
async function executeScript(tabId, code) {
  const tabData = attachedTabs.get(tabId);

  if (tabData && tabData.debuggerAttached) {
    // Use debugger protocol for more power
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: code,
        returnByValue: true,
        awaitPromise: true
      }
    );

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Script execution failed');
    }

    return result.result.value;
  } else {
    // Fallback to scripting API
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: new Function(code)
    });

    return results[0]?.result;
  }
}

// Call content script utility function
async function callContentScriptUtility(tabId, utility, method, args) {
  const tabData = attachedTabs.get(tabId);

  // Map of utility names to their file paths
  const utilityFiles = {
    'DOMUtilities': 'content-scripts/dom-utilities.js',
    'InteractionUtilities': 'content-scripts/interaction.js',
    'ExtractionUtilities': 'content-scripts/extraction.js',
    'ObserverUtilities': 'content-scripts/observer.js'
  };

  if (!utilityFiles[utility]) {
    throw new Error(`Unknown utility: ${utility}`);
  }

  // Read the utility file content
  const utilityPath = chrome.runtime.getURL(utilityFiles[utility]);
  const response = await fetch(utilityPath);
  const utilityCode = await response.text();

  // Build the complete code to execute
  const code = `
    (async function() {
      try {
        // Load the utility code
        ${utilityCode}

        // Verify utility loaded
        if (typeof ${utility} === 'undefined') {
          throw new Error('${utility} failed to load');
        }

        // Call the method with arguments
        const result = await ${utility}.${method}(...${JSON.stringify(args)});
        return result;
      } catch (error) {
        throw new Error('${utility}.${method} failed: ' + error.message);
      }
    })();
  `;

  if (tabData && tabData.debuggerAttached) {
    // Use debugger protocol for more power
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: code,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true
      }
    );

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || `${utility}.${method} execution failed`);
    }

    return result.result.value;
  } else {
    // Fallback to scripting API
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: new Function('return (' + code + ')'),
      world: 'MAIN'
    });

    if (results[0]?.error) {
      throw new Error(results[0].error);
    }

    return results[0]?.result;
  }
}

// Capture screenshot of tab
async function captureScreenshot(tabId) {
  // Make sure tab is active for screenshot
  const tab = await chrome.tabs.get(tabId);

  if (!tab.active) {
    await chrome.tabs.update(tabId, { active: true });
    // Wait a bit for the tab to render
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Capture at full quality first
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

  // Compress the image by resizing and converting to JPEG
  // Using very aggressive compression: 600px max width, 30% quality
  const compressed = await compressImage(dataUrl, 600, 0.3);
  return compressed;
}

// Compress image by resizing and converting to JPEG
async function compressImage(dataUrl, maxWidth = 1280, quality = 0.7) {
  // Convert data URL to blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  // Create ImageBitmap from blob
  const imageBitmap = await createImageBitmap(blob);

  // Calculate new dimensions
  let width = imageBitmap.width;
  let height = imageBitmap.height;

  if (width > maxWidth) {
    height = (height * maxWidth) / width;
    width = maxWidth;
  }

  // Create canvas and draw resized image
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  // Convert to JPEG blob with compression
  const compressedBlob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality
  });

  // Convert blob to base64
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(compressedBlob);
  });
}

// Capture screenshot of a specific element
async function captureElementScreenshot(tabId, selector, padding = 0) {
  const escapedSelector = selector.replace(/'/g, "\\'");

  // 1. Get the element's bounding box and scroll it into view
  const boundingBox = await executeScript(tabId, `
    (function() {
      const element = document.querySelector('${escapedSelector}');
      if (!element) throw new Error('Element not found: ${escapedSelector}');
      element.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })();
  `);

  // Wait for scroll to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  // 2. Capture via CDP Page.captureScreenshot with clip
  const clip = {
    x: Math.max(0, boundingBox.x - padding),
    y: Math.max(0, boundingBox.y - padding),
    width: boundingBox.width + (padding * 2),
    height: boundingBox.height + (padding * 2),
    scale: 1
  };

  const result = await chrome.debugger.sendCommand(
    { tabId },
    'Page.captureScreenshot',
    { format: 'png', clip }
  );

  // 3. Compress the image
  const dataUrl = 'data:image/png;base64,' + result.data;
  return await compressImage(dataUrl, 800, 0.5);
}

// Click on an element
async function clickElement(tabId, selector) {
  const code = `
    (function() {
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!element) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      element.click();
      return true;
    })();
  `;
  return await executeScript(tabId, code);
}

// Fill an input field
async function fillInput(tabId, selector, value) {
  const code = `
    (function() {
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!element) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      element.value = '${String(value).replace(/'/g, "\\'")}';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })();
  `;
  return await executeScript(tabId, code);
}

// Get text content of an element
async function getElementText(tabId, selector) {
  const code = `
    (function() {
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!element) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      return element.textContent || element.innerText || '';
    })();
  `;
  return await executeScript(tabId, code);
}

// Wait for an element to appear
async function waitForElement(tabId, selector, timeout = 30000) {
  const code = `
    (async function() {
      const startTime = Date.now();
      while (Date.now() - startTime < ${timeout}) {
        const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (element) return true;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Element not found within timeout: ${selector.replace(/'/g, "\\'")}');
    })();
  `;
  return await executeScript(tabId, code);
}

// Scroll to an element
async function scrollTo(tabId, selector) {
  const code = `
    (function() {
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!element) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    })();
  `;
  return await executeScript(tabId, code);
}

// Inspect an element - returns comprehensive information
async function inspectElement(tabId, selector) {
  const code = `
    (function() {
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!element) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');

      // Get all attributes
      const attributes = {};
      for (let attr of element.attributes) {
        attributes[attr.name] = attr.value;
      }

      // Get computed styles (only important ones)
      const computedStyle = window.getComputedStyle(element);
      const styles = {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        position: computedStyle.position,
        width: computedStyle.width,
        height: computedStyle.height,
        color: computedStyle.color,
        backgroundColor: computedStyle.backgroundColor,
        fontSize: computedStyle.fontSize,
        fontFamily: computedStyle.fontFamily,
        zIndex: computedStyle.zIndex,
        opacity: computedStyle.opacity
      };

      // Get bounding box
      const rect = element.getBoundingClientRect();
      const boundingBox = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      };

      // Get structure info
      const structure = {
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        className: element.className || null,
        childrenCount: element.children.length,
        parentTag: element.parentElement ? element.parentElement.tagName.toLowerCase() : null,
        textContent: element.textContent ? element.textContent.substring(0, 200) : null,
        innerHTML: element.innerHTML ? element.innerHTML.substring(0, 500) : null
      };

      // Get properties
      const properties = {
        value: element.value || null,
        checked: element.checked || null,
        disabled: element.disabled || null,
        readOnly: element.readOnly || null,
        href: element.href || null,
        src: element.src || null,
        type: element.type || null
      };

      return {
        selector: '${selector.replace(/'/g, "\\'")}',
        attributes,
        styles,
        boundingBox,
        structure,
        properties,
        isVisible: rect.width > 0 && rect.height > 0 && computedStyle.visibility !== 'hidden' && computedStyle.display !== 'none'
      };
    })();
  `;
  return await executeScript(tabId, code);
}

// Check MCP server connection
async function checkMcpServerConnection() {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/status`, {
      method: 'GET',
    });
    mcpServerConnected = response.ok;
    console.log('MCP server connection:', mcpServerConnected ? 'Connected' : 'Disconnected');
  } catch (error) {
    mcpServerConnected = false;
    console.error('MCP server not reachable:', error.message);
  }
}

// Send data to MCP server
async function sendToMcpServer(type, data) {
  if (!mcpServerConnected) {
    return;
  }

  try {
    await fetch(`${MCP_SERVER_URL}/devtools-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, data }),
    });
  } catch (error) {
    console.error('Error sending to MCP server:', error);
    mcpServerConnected = false;
  }
}

// Periodic connection check
setInterval(() => {
  checkMcpServerConnection();
}, 5000);

// Poll for commands from MCP server
async function pollMcpCommands() {
  if (!mcpServerConnected) return;

  try {
    const response = await fetch(`${MCP_SERVER_URL}/poll-commands`);
    const { commands } = await response.json();

    for (const command of commands) {
      executeCommand(command);
    }
  } catch (error) {
    console.error('Error polling MCP commands:', error);
  }
}

// Execute command from MCP server
async function executeCommand(command) {
  const { id, action, params } = command;

  try {
    // Create a promise to handle the command
    const resultPromise = new Promise((resolve) => {
      handleMessage({ action, ...params }, null, resolve);
    });

    const result = await resultPromise;

    // Send result back to MCP server
    await fetch(`${MCP_SERVER_URL}/command-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandId: id,
        success: result.success !== false,
        result: result,
        error: result.error
      }),
    });
  } catch (error) {
    console.error('Error executing command:', error);

    // Send error back to MCP server
    await fetch(`${MCP_SERVER_URL}/command-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandId: id,
        success: false,
        error: error.message
      }),
    });
  }
}

// Poll every 500ms
setInterval(pollMcpCommands, 500);

console.log('Background service worker initialized');
