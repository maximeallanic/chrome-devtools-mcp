/**
 * Debug Helper for Chrome DevTools MCP
 *
 * This file should be copied to the extension you want to debug.
 * It intercepts console.* calls and sends them to the MCP extension.
 *
 * SETUP:
 * 1. Copy this file to your extension's directory
 * 2. Replace MCP_EXTENSION_ID below with the actual ID of Chrome DevTools MCP Custom extension
 *    (You can find it in chrome://extensions)
 * 3. Import this file at the beginning of your service worker and/or popup:
 *    - For ES modules: import './debug-helper.js';
 *    - For scripts: importScripts('./debug-helper.js');
 *
 * USAGE:
 * Once installed, all console.log, console.error, console.warn, console.info, and console.debug
 * calls will be captured and sent to the MCP extension, where you can retrieve them with:
 *   - list_external_extensions - See connected extensions
 *   - get_external_extension_logs - Get logs from a specific extension
 *   - clear_external_extension_logs - Clear captured logs
 */

(function() {
  // ============================================================
  // CONFIGURATION - Replace with your MCP extension ID
  // ============================================================
  const MCP_EXTENSION_ID = "REPLACE_WITH_YOUR_MCP_EXTENSION_ID";
  // ============================================================

  // Don't initialize if ID not configured
  if (MCP_EXTENSION_ID === "REPLACE_WITH_YOUR_MCP_EXTENSION_ID") {
    console.warn("[Debug Helper] MCP_EXTENSION_ID not configured. Please edit debug-helper.js and set your MCP extension ID.");
    return;
  }

  // Store original console methods
  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console)
  };

  // Detect context (service_worker or popup)
  function getContext() {
    if (typeof window === 'undefined') {
      return 'service_worker';
    }
    if (window.location.href.includes('popup')) {
      return 'popup';
    }
    if (window.location.href.includes('options')) {
      return 'options';
    }
    if (window.location.href.includes('devtools')) {
      return 'devtools';
    }
    return 'page';
  }

  // Send log to MCP extension
  function sendLog(level, args) {
    try {
      const message = Array.from(args).map(arg => {
        if (arg === undefined) return 'undefined';
        if (arg === null) return 'null';
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      chrome.runtime.sendMessage(MCP_EXTENSION_ID, {
        type: 'external_extension_log',
        extensionId: chrome.runtime.id,
        level,
        timestamp: Date.now(),
        message,
        context: getContext()
      }).catch(() => {
        // Silently ignore if MCP extension is not available
      });
    } catch (e) {
      // Silently fail if MCP extension not available
    }
  }

  // Override console methods
  console.log = function(...args) {
    sendLog('log', args);
    originalConsole.log.apply(console, args);
  };

  console.error = function(...args) {
    sendLog('error', args);
    originalConsole.error.apply(console, args);
  };

  console.warn = function(...args) {
    sendLog('warn', args);
    originalConsole.warn.apply(console, args);
  };

  console.info = function(...args) {
    sendLog('info', args);
    originalConsole.info.apply(console, args);
  };

  console.debug = function(...args) {
    sendLog('debug', args);
    originalConsole.debug.apply(console, args);
  };

  // Send initial connection message
  sendLog('info', [`[Debug Helper] Connected from ${getContext()} - Extension ID: ${chrome.runtime.id}`]);
})();
