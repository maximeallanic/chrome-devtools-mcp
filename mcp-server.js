#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

// Data storage
const devToolsData = {
  networkRequests: [],
  consoleLogs: [],
  performanceMetrics: [],
  lastUpdate: null,
};

// Command queue for bidirectional communication
const commandQueue = new Map(); // commandId -> { action, params, timestamp, status, result }
let commandIdCounter = 0;

// HTTP Server to receive data from Chrome extension
const app = express();
app.use(express.json({ limit: '50mb' }));

// Receive DevTools data from extension
app.post('/devtools-data', (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'network') {
      devToolsData.networkRequests.push(data);
      if (devToolsData.networkRequests.length > 5000) {
        devToolsData.networkRequests = devToolsData.networkRequests.slice(-5000);
      }
    } else if (type === 'console') {
      devToolsData.consoleLogs.push(data);
      if (devToolsData.consoleLogs.length > 5000) {
        devToolsData.consoleLogs = devToolsData.consoleLogs.slice(-5000);
      }
    } else if (type === 'performance') {
      devToolsData.performanceMetrics.push(data);
      if (devToolsData.performanceMetrics.length > 500) {
        devToolsData.performanceMetrics = devToolsData.performanceMetrics.slice(-500);
      }
    }

    devToolsData.lastUpdate = new Date().toISOString();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send command to extension via queue
async function sendCommandToExtension(action, params = {}) {
  const commandId = ++commandIdCounter;
  const command = {
    id: commandId,
    action,
    params,
    timestamp: Date.now(),
    status: 'pending',
    result: null,
  };

  commandQueue.set(commandId, command);

  // Wait for result with timeout
  const timeout = 30000; // 30 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const cmd = commandQueue.get(commandId);
    if (cmd.status === 'completed') {
      commandQueue.delete(commandId);
      return cmd.result;
    } else if (cmd.status === 'error') {
      commandQueue.delete(commandId);
      throw new Error(cmd.result?.error || 'Command failed');
    }

    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  commandQueue.delete(commandId);
  throw new Error('Command timeout');
}

// Extension polls this endpoint to get pending commands
app.get('/poll-commands', (req, res) => {
  const pendingCommands = Array.from(commandQueue.values())
    .filter(cmd => cmd.status === 'pending')
    .map(({ id, action, params }) => ({ id, action, params }));

  res.json({ commands: pendingCommands });
});

// Extension sends command results to this endpoint
app.post('/command-result', (req, res) => {
  const { commandId, success, result, error } = req.body;

  const command = commandQueue.get(commandId);
  if (command) {
    command.status = success ? 'completed' : 'error';
    command.result = success ? result : { error };
  }

  res.json({ success: true });
});

app.get('/status', (req, res) => {
  res.json({
    networkRequests: devToolsData.networkRequests.length,
    consoleLogs: devToolsData.consoleLogs.length,
    performanceMetrics: devToolsData.performanceMetrics.length,
    lastUpdate: devToolsData.lastUpdate,
    pendingCommands: Array.from(commandQueue.values()).filter(c => c.status === 'pending').length,
  });
});

const HTTP_PORT = 3456;
const httpServer = app.listen(HTTP_PORT, 'localhost', () => {
  console.error(`HTTP server listening on http://localhost:${HTTP_PORT}`);
});

// Cleanup old commands every minute
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const maxAge = 60000; // 1 minute

  for (const [id, cmd] of commandQueue.entries()) {
    if (now - cmd.timestamp > maxAge) {
      commandQueue.delete(id);
    }
  }
}, 60000);

// MCP Server
const server = new Server(
  {
    name: "chrome-devtools",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Tab Management
      {
        name: "create_tab",
        description: "Create a new Chrome tab and optionally navigate to a URL",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to navigate to (optional, defaults to new tab page)",
            },
            active: {
              type: "boolean",
              description: "Whether to make the tab active (default: true)",
              default: true,
            },
          },
        },
      },
      {
        name: "list_tabs",
        description: "List all open Chrome tabs with their URLs and titles",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "close_tab",
        description: "Close a specific Chrome tab by its ID",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab to close",
            },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "get_tab",
        description: "Get details about a specific tab",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
          },
          required: ["tab_id"],
        },
      },

      // Navigation
      {
        name: "navigate_to",
        description: "Navigate a tab to a specific URL",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab to navigate",
            },
            url: {
              type: "string",
              description: "The URL to navigate to",
            },
          },
          required: ["tab_id", "url"],
        },
      },
      {
        name: "navigate_back",
        description: "Navigate back in tab history",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "navigate_forward",
        description: "Navigate forward in tab history",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "reload_tab",
        description: "Reload a tab",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab to reload",
            },
          },
          required: ["tab_id"],
        },
      },

      // DevTools Attachment
      {
        name: "attach_debugger",
        description: "Attach Chrome DevTools debugger to a tab to start capturing network, console, and performance data",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab to attach to",
            },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "detach_debugger",
        description: "Detach Chrome DevTools debugger from a tab",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab to detach from",
            },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "list_attached_tabs",
        description: "List all tabs that have the debugger attached",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },

      // DevTools Data Access
      {
        name: "get_network_requests",
        description: "Get captured network requests from Chrome DevTools for a specific tab. Returns HTTP requests with headers, status, timing, and response data.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab (optional - returns all tabs if not specified)",
            },
            limit: {
              type: "number",
              description: "Maximum number of requests to return (default: 50)",
              default: 50,
            },
            url_filter: {
              type: "string",
              description: "Optional URL filter (substring match)",
            },
          },
        },
      },
      {
        name: "get_console_logs",
        description: "Get console logs and messages from Chrome DevTools for a specific tab. Includes console.log, console.error, console.warn, etc.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab (optional - returns all tabs if not specified)",
            },
            limit: {
              type: "number",
              description: "Maximum number of log entries to return (default: 50)",
              default: 50,
            },
            level_filter: {
              type: "string",
              description: "Filter by log level: log, error, warn, info, debug",
              enum: ["log", "error", "warn", "info", "debug"],
            },
          },
        },
      },
      {
        name: "get_performance_metrics",
        description: "Get performance metrics from Chrome DevTools for a specific tab. Includes timing, resources, and performance data.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab (optional - returns all tabs if not specified)",
            },
            limit: {
              type: "number",
              description: "Maximum number of metric entries to return (default: 20)",
              default: 20,
            },
          },
        },
      },
      {
        name: "clear_devtools_data",
        description: "Clear all captured DevTools data (network requests, console logs, performance metrics) for a specific tab or all tabs",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab to clear data for (optional - clears all tabs if not specified)",
            },
          },
        },
      },

      // Script Execution
      {
        name: "execute_script",
        description: "Execute JavaScript code in a tab's context. Returns the result of the script execution.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab to execute script in",
            },
            code: {
              type: "string",
              description: "JavaScript code to execute",
            },
          },
          required: ["tab_id", "code"],
        },
      },

      // Screenshot
      {
        name: "capture_screenshot",
        description: "Capture a screenshot of a tab's visible area. Returns a compressed JPEG image as base64 data URL (max width 600px, quality 30%).",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab to capture",
            },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "capture_element_screenshot",
        description: "Capture a screenshot of a specific element identified by CSS selector. Returns a compressed JPEG image as base64 data URL.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab containing the element",
            },
            selector: {
              type: "string",
              description: "CSS selector for the element to capture",
            },
            padding: {
              type: "number",
              description: "Optional padding around the element in pixels (default: 0)",
            },
          },
          required: ["tab_id", "selector"],
        },
      },

      // Page Interaction
      {
        name: "click_element",
        description: "Click on an element in the page using a CSS selector",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
            selector: {
              type: "string",
              description: "CSS selector for the element to click",
            },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "fill_input",
        description: "Fill an input field or textarea with a value",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
            selector: {
              type: "string",
              description: "CSS selector for the input element",
            },
            value: {
              type: "string",
              description: "Value to fill into the input",
            },
          },
          required: ["tab_id", "selector", "value"],
        },
      },
      {
        name: "get_element_text",
        description: "Get the text content of an element",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
            selector: {
              type: "string",
              description: "CSS selector for the element",
            },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "wait_for_element",
        description: "Wait for an element to appear in the page",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
            selector: {
              type: "string",
              description: "CSS selector for the element to wait for",
            },
            timeout: {
              type: "number",
              description: "Maximum time to wait in milliseconds (default: 30000)",
              default: 30000,
            },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "scroll_to",
        description: "Scroll to an element in the page",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
            selector: {
              type: "string",
              description: "CSS selector for the element to scroll to",
            },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "inspect_element",
        description: "Inspect an element and get comprehensive information: attributes, styles, position, dimensions, structure, properties, and visibility",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: {
              type: "number",
              description: "The ID of the tab",
            },
            selector: {
              type: "string",
              description: "CSS selector for the element to inspect",
            },
          },
          required: ["tab_id", "selector"],
        },
      },

      // Extension Management
      {
        name: "list_extensions",
        description: "List all installed Chrome extensions with their details",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_extension_info",
        description: "Get detailed information about a specific Chrome extension",
        inputSchema: {
          type: "object",
          properties: {
            extension_id: {
              type: "string",
              description: "The ID of the extension",
            },
          },
          required: ["extension_id"],
        },
      },
      {
        name: "reload_extension",
        description: "Reload a Chrome extension by disabling and re-enabling it",
        inputSchema: {
          type: "object",
          properties: {
            extension_id: {
              type: "string",
              description: "The ID of the extension to reload",
            },
          },
          required: ["extension_id"],
        },
      },
      {
        name: "get_manifest",
        description: "Get the manifest.json of the current extension",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_service_worker_logs",
        description: "Get console logs from the extension's service worker (log, error, warn, info, debug)",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of log entries to return (default: 100)",
              default: 100,
            },
            level_filter: {
              type: "string",
              description: "Filter by log level: log, error, warn, info, debug",
              enum: ["log", "error", "warn", "info", "debug"],
            },
          },
        },
      },
      {
        name: "clear_service_worker_logs",
        description: "Clear all captured service worker logs",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },

      // ============ EXTERNAL EXTENSION DEBUGGING TOOLS ============
      {
        name: "list_external_extensions",
        description: "List extensions that have sent logs via the debug helper. These are external extensions you are debugging that have the debug-helper.js installed.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_external_extension_logs",
        description: "Get console logs from an external extension using the debug helper. The target extension must have debug-helper.js installed.",
        inputSchema: {
          type: "object",
          properties: {
            extension_id: {
              type: "string",
              description: "The extension ID to get logs from",
            },
            limit: {
              type: "number",
              description: "Maximum number of logs to return (default: 100)",
              default: 100,
            },
            level_filter: {
              type: "string",
              description: "Filter by log level",
              enum: ["log", "error", "warn", "info", "debug"],
            },
          },
          required: ["extension_id"],
        },
      },
      {
        name: "clear_external_extension_logs",
        description: "Clear captured logs from external extensions",
        inputSchema: {
          type: "object",
          properties: {
            extension_id: {
              type: "string",
              description: "Optional: specific extension ID to clear. If omitted, clears all.",
            },
          },
        },
      },

      // ============ ADVANCED DOM SELECTION TOOLS ============
      {
        name: "query_selector_all",
        description: "Query all elements matching a CSS selector and return their properties",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "CSS selector" },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "xpath_query",
        description: "Query elements using XPath (more powerful than CSS selectors)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            xpath: { type: "string", description: "XPath expression" },
          },
          required: ["tab_id", "xpath"],
        },
      },
      {
        name: "get_elements_by_attribute",
        description: "Find elements by attribute value (e.g., data-id, aria-label)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            attribute: { type: "string", description: "Attribute name" },
            value: { type: "string", description: "Attribute value (optional)" },
          },
          required: ["tab_id", "attribute"],
        },
      },
      {
        name: "find_elements_by_text",
        description: "Find elements containing specific text",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            text: { type: "string", description: "Text to search for" },
            exact_match: { type: "boolean", description: "Exact match or partial", default: false },
            tag: { type: "string", description: "Limit to specific tag", default: "*" },
          },
          required: ["tab_id", "text"],
        },
      },
      {
        name: "get_parent_element",
        description: "Get parent element of a given element",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Child element selector" },
            levels: { type: "number", description: "Levels to go up", default: 1 },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "get_sibling_elements",
        description: "Get sibling elements (next/previous/all)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Reference element selector" },
            direction: { type: "string", enum: ["next", "previous", "all"], default: "all" },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "get_child_elements",
        description: "Get all child elements of a parent",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Parent selector" },
            direct_only: { type: "boolean", description: "Direct children only", default: true },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "extract_structured_data",
        description: "Extract data from repeating patterns (lists, grids, tables)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            container_selector: { type: "string", description: "Container selector" },
            item_selector: { type: "string", description: "Item selector" },
            schema: { type: "object", description: "Map of field names to selectors" },
          },
          required: ["tab_id", "container_selector", "item_selector", "schema"],
        },
      },
      {
        name: "get_computed_styles",
        description: "Get computed CSS styles for an element",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Element selector" },
            properties: { type: "array", items: { type: "string" }, description: "Specific properties" },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "get_all_links",
        description: "Get all links on the page with optional filters",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            filters: { type: "object", description: "Filter options (href, text, domain)" },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "get_all_images",
        description: "Get all images on the page with dimensions",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            filters: { type: "object", description: "Filter options (minWidth, minHeight)" },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "extract_json_ld",
        description: "Extract JSON-LD structured data (Schema.org)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "get_element_path",
        description: "Get complete CSS path of an element from root",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Element selector" },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "validate_selector",
        description: "Validate if a selector matches any elements",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Selector to validate" },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "highlight_element",
        description: "Visually highlight an element (for debugging)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Element selector" },
            color: { type: "string", description: "Highlight color", default: "yellow" },
            duration: { type: "number", description: "Duration in ms (0 = permanent)", default: 3000 },
          },
          required: ["tab_id", "selector"],
        },
      },

      // ============ ADVANCED INTERACTION TOOLS ============
      {
        name: "hover_element",
        description: "Simulate mouse hover over an element",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Element selector" },
            duration: { type: "number", description: "Hover duration in ms", default: 1000 },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "drag_and_drop",
        description: "Drag element from source to target",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            source_selector: { type: "string", description: "Source element" },
            target_selector: { type: "string", description: "Target element" },
            duration: { type: "number", description: "Animation duration", default: 500 },
          },
          required: ["tab_id", "source_selector", "target_selector"],
        },
      },
      {
        name: "type_with_delay",
        description: "Type text with natural delays between keystrokes",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Input element selector" },
            text: { type: "string", description: "Text to type" },
            delay_ms: { type: "number", description: "Delay between keys (random if null)" },
            clear: { type: "boolean", description: "Clear existing text", default: false },
          },
          required: ["tab_id", "selector", "text"],
        },
      },
      {
        name: "select_dropdown_option",
        description: "Select option from dropdown (select element)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Select element selector" },
            option_value: { type: "string", description: "Option value or text" },
            match_by: { type: "string", enum: ["value", "text", "index"], default: "value" },
          },
          required: ["tab_id", "selector", "option_value"],
        },
      },
      {
        name: "trigger_event",
        description: "Trigger a custom event on an element",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Element selector" },
            event_type: { type: "string", description: "Event type (change, input, focus, etc.)" },
            event_options: { type: "object", description: "Additional event options" },
          },
          required: ["tab_id", "selector", "event_type"],
        },
      },
      {
        name: "fill_form_batch",
        description: "Fill multiple form fields at once",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            form_data: { type: "object", description: "Map of selectors to values" },
            delay_between_fields: { type: "number", description: "Delay in ms", default: 200 },
          },
          required: ["tab_id", "form_data"],
        },
      },
      {
        name: "bulk_click_elements",
        description: "Click multiple elements in sequence",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selectors: { type: "array", items: { type: "string" }, description: "Array of selectors" },
            delay_between_clicks: { type: "number", description: "Delay in ms", default: 500 },
          },
          required: ["tab_id", "selectors"],
        },
      },
      {
        name: "auto_scroll_to_bottom",
        description: "Automatically scroll to bottom (for infinite scroll)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            scroll_delay: { type: "number", description: "Delay between scrolls", default: 1000 },
            max_scrolls: { type: "number", description: "Maximum scrolls", default: 10 },
            container_selector: { type: "string", description: "Container selector (optional)" },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "smart_wait",
        description: "Wait for page to be fully loaded (network + DOM)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            timeout: { type: "number", description: "Timeout in ms", default: 10000 },
          },
          required: ["tab_id"],
        },
      },

      // ============ DATA EXTRACTION TOOLS ============
      {
        name: "extract_table_data",
        description: "Extract data from HTML tables as JSON",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Table selector" },
            options: { type: "object", description: "Extraction options" },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "extract_list_data",
        description: "Extract data from lists (ul/ol) as array",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "List selector" },
            options: { type: "object", description: "Extraction options" },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "paginate_and_collect",
        description: "Navigate pagination and collect data from multiple pages",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            next_button_selector: { type: "string", description: "Next button selector" },
            extraction_function: { type: "string", description: "JS function to extract data" },
            options: { type: "object", description: "Options (maxPages, delayBetweenPages)" },
          },
          required: ["tab_id", "next_button_selector", "extraction_function"],
        },
      },
      {
        name: "get_page_context",
        description: "Get comprehensive page metadata (title, URL, meta tags, frameworks, etc.)",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "extract_form_data",
        description: "Extract all form fields and their current values",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            form_selector: { type: "string", description: "Form selector" },
          },
          required: ["tab_id", "form_selector"],
        },
      },
      {
        name: "get_local_storage",
        description: "Read all local storage data",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "get_session_storage",
        description: "Read all session storage data",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
          },
          required: ["tab_id"],
        },
      },

      // ============ OBSERVER/MONITORING TOOLS ============
      {
        name: "wait_for_element_advanced",
        description: "Wait for element to appear in DOM with visibility option",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Element selector" },
            timeout: { type: "number", description: "Timeout in ms", default: 10000 },
            visible: { type: "boolean", description: "Wait for visibility", default: false },
          },
          required: ["tab_id", "selector"],
        },
      },
      {
        name: "wait_for_condition",
        description: "Wait for a custom condition to become true",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            condition_function: { type: "string", description: "JS function returning boolean" },
            timeout: { type: "number", description: "Timeout in ms", default: 10000 },
          },
          required: ["tab_id", "condition_function"],
        },
      },
      {
        name: "wait_for_ajax",
        description: "Wait for all AJAX/Fetch requests to complete",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            timeout: { type: "number", description: "Timeout in ms", default: 10000 },
            idle_time: { type: "number", description: "Idle time in ms", default: 500 },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "wait_for_text",
        description: "Wait for specific text to appear on page",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            text: { type: "string", description: "Text to wait for" },
            timeout: { type: "number", description: "Timeout in ms", default: 10000 },
            exact_match: { type: "boolean", description: "Exact match", default: false },
          },
          required: ["tab_id", "text"],
        },
      },
      {
        name: "wait_for_url_change",
        description: "Wait for URL to change",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            expected_url: { type: "string", description: "Expected URL (optional)" },
            timeout: { type: "number", description: "Timeout in ms", default: 30000 },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "wait_for_images",
        description: "Wait for all images to load",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "number", description: "Tab ID" },
            selector: { type: "string", description: "Image selector", default: "img" },
            timeout: { type: "number", description: "Timeout in ms", default: 10000 },
          },
          required: ["tab_id"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // DevTools Data Access (these work with stored data)
      case "get_network_requests": {
        const limit = args.limit || 50;
        const urlFilter = args.url_filter;
        const tabId = args.tab_id;

        let requests = [...devToolsData.networkRequests];

        if (tabId) {
          requests = requests.filter(req => req.tabId === tabId);
        }

        if (urlFilter) {
          requests = requests.filter(req =>
            req.url?.toLowerCase().includes(urlFilter.toLowerCase())
          );
        }

        requests = requests.slice(-limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                total: devToolsData.networkRequests.length,
                filtered: requests.length,
                tabId: tabId || 'all',
                lastUpdate: devToolsData.lastUpdate,
                requests: requests,
              }, null, 2),
            },
          ],
        };
      }

      case "get_console_logs": {
        const limit = args.limit || 50;
        const levelFilter = args.level_filter;
        const tabId = args.tab_id;

        let logs = [...devToolsData.consoleLogs];

        if (tabId) {
          logs = logs.filter(log => log.tabId === tabId);
        }

        if (levelFilter) {
          logs = logs.filter(log => log.level === levelFilter);
        }

        logs = logs.slice(-limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                total: devToolsData.consoleLogs.length,
                filtered: logs.length,
                tabId: tabId || 'all',
                lastUpdate: devToolsData.lastUpdate,
                logs: logs,
              }, null, 2),
            },
          ],
        };
      }

      case "get_performance_metrics": {
        const limit = args.limit || 20;
        const tabId = args.tab_id;

        let metrics = [...devToolsData.performanceMetrics];

        if (tabId) {
          metrics = metrics.filter(m => m.tabId === tabId);
        }

        metrics = metrics.slice(-limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                total: devToolsData.performanceMetrics.length,
                returned: metrics.length,
                tabId: tabId || 'all',
                lastUpdate: devToolsData.lastUpdate,
                metrics: metrics,
              }, null, 2),
            },
          ],
        };
      }

      case "clear_devtools_data": {
        const tabId = args.tab_id;

        if (tabId) {
          devToolsData.networkRequests = devToolsData.networkRequests.filter(r => r.tabId !== tabId);
          devToolsData.consoleLogs = devToolsData.consoleLogs.filter(l => l.tabId !== tabId);
          devToolsData.performanceMetrics = devToolsData.performanceMetrics.filter(m => m.tabId !== tabId);
        } else {
          devToolsData.networkRequests = [];
          devToolsData.consoleLogs = [];
          devToolsData.performanceMetrics = [];
        }

        devToolsData.lastUpdate = null;

        return {
          content: [
            {
              type: "text",
              text: `Cleared DevTools data for ${tabId ? 'tab ' + tabId : 'all tabs'}`,
            },
          ],
        };
      }

      // Screenshot tools - return native MCP image content type
      case "capture_screenshot":
      case "capture_element_screenshot": {
        try {
          const camelCaseArgs = {};
          for (const [key, value] of Object.entries(args)) {
            const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            camelCaseArgs[camelKey] = value;
          }

          const result = await sendCommandToExtension(name, camelCaseArgs);

          if (result && result.success && result.screenshot) {
            // Extract base64 from data URL "data:image/jpeg;base64,<data>"
            const dataUrl = result.screenshot;
            const base64Prefix = 'base64,';
            const base64Index = dataUrl.indexOf(base64Prefix);

            if (base64Index !== -1) {
              const base64Data = dataUrl.substring(base64Index + base64Prefix.length);
              const mimeType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

              return {
                content: [{ type: "image", data: base64Data, mimeType }],
              };
            }
          }

          // Fallback if extraction fails
          return {
            content: [{
              type: "text",
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error capturing screenshot: ${error.message}` }],
            isError: true,
          };
        }
      }

      // Tab management, interaction, and extension management tools
      case "create_tab":
      case "list_tabs":
      case "close_tab":
      case "get_tab":
      case "navigate_to":
      case "navigate_back":
      case "navigate_forward":
      case "reload_tab":
      case "attach_debugger":
      case "detach_debugger":
      case "list_attached_tabs":
      case "execute_script":
      case "click_element":
      case "fill_input":
      case "get_element_text":
      case "wait_for_element":
      case "scroll_to":
      case "inspect_element":
      case "list_extensions":
      case "get_extension_info":
      case "reload_extension":
      case "get_manifest":
      case "get_service_worker_logs":
      case "clear_service_worker_logs":
      case "list_external_extensions":
      case "get_external_extension_logs":
      case "clear_external_extension_logs": {
        try {
          // Convert snake_case params to camelCase for extension
          const camelCaseArgs = {};
          for (const [key, value] of Object.entries(args)) {
            const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            camelCaseArgs[camelKey] = value;
          }

          const result = await sendCommandToExtension(name, camelCaseArgs);
          return {
            content: [
              {
                type: "text",
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error executing command: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      // ============ GENERIC HANDLER FOR NEW UTILITY TOOLS ============
      default: {
        // Map tool names to their utility classes and methods
        const utilityTools = {
          // DOM Utilities
          'query_selector_all': { utility: 'DOMUtilities', method: 'querySelectorAll', args: ['selector'] },
          'xpath_query': { utility: 'DOMUtilities', method: 'xpathQuery', args: ['xpath'] },
          'get_elements_by_attribute': { utility: 'DOMUtilities', method: 'getElementsByAttribute', args: ['attribute', 'value'] },
          'find_elements_by_text': { utility: 'DOMUtilities', method: 'findElementsByText', args: ['text', 'exact_match', 'tag'] },
          'get_parent_element': { utility: 'DOMUtilities', method: 'getParentElement', args: ['selector', 'levels'] },
          'get_sibling_elements': { utility: 'DOMUtilities', method: 'getSiblingElements', args: ['selector', 'direction'] },
          'get_child_elements': { utility: 'DOMUtilities', method: 'getChildElements', args: ['selector', 'direct_only'] },
          'extract_structured_data': { utility: 'DOMUtilities', method: 'extractStructuredData', args: ['container_selector', 'item_selector', 'schema'] },
          'get_computed_styles': { utility: 'DOMUtilities', method: 'getComputedStyles', args: ['selector', 'properties'] },
          'get_all_links': { utility: 'DOMUtilities', method: 'getAllLinks', args: ['filters'] },
          'get_all_images': { utility: 'DOMUtilities', method: 'getAllImages', args: ['filters'] },
          'extract_json_ld': { utility: 'DOMUtilities', method: 'extractJsonLd', args: [] },
          'get_element_path': { utility: 'DOMUtilities', method: 'getElementPath', args: ['selector'] },
          'validate_selector': { utility: 'DOMUtilities', method: 'validateSelector', args: ['selector'] },
          'highlight_element': { utility: 'DOMUtilities', method: 'highlightElement', args: ['selector', 'color', 'duration'] },

          // Interaction Utilities
          'hover_element': { utility: 'InteractionUtilities', method: 'hoverElement', args: ['selector', 'duration'] },
          'drag_and_drop': { utility: 'InteractionUtilities', method: 'dragAndDrop', args: ['source_selector', 'target_selector', 'duration'] },
          'type_with_delay': { utility: 'InteractionUtilities', method: 'typeWithDelay', args: ['selector', 'text', 'delay_ms', 'clear'] },
          'select_dropdown_option': { utility: 'InteractionUtilities', method: 'selectDropdownOption', args: ['selector', 'option_value', 'match_by'] },
          'trigger_event': { utility: 'InteractionUtilities', method: 'triggerEvent', args: ['selector', 'event_type', 'event_options'] },
          'fill_form_batch': { utility: 'InteractionUtilities', method: 'fillFormBatch', args: ['form_data', 'delay_between_fields'] },
          'bulk_click_elements': { utility: 'InteractionUtilities', method: 'bulkClickElements', args: ['selectors', 'delay_between_clicks'] },
          'auto_scroll_to_bottom': { utility: 'InteractionUtilities', method: 'autoScrollToBottom', args: ['scroll_delay', 'max_scrolls', 'container_selector'] },
          'smart_wait': { utility: 'InteractionUtilities', method: 'smartWait', args: ['timeout'] },

          // Extraction Utilities
          'extract_table_data': { utility: 'ExtractionUtilities', method: 'extractTableData', args: ['selector', 'options'] },
          'extract_list_data': { utility: 'ExtractionUtilities', method: 'extractListData', args: ['selector', 'options'] },
          'get_page_context': { utility: 'ExtractionUtilities', method: 'getPageContext', args: [] },
          'extract_form_data': { utility: 'ExtractionUtilities', method: 'extractFormData', args: ['form_selector'] },
          'get_local_storage': { utility: 'ExtractionUtilities', method: 'getLocalStorage', args: [] },
          'get_session_storage': { utility: 'ExtractionUtilities', method: 'getSessionStorage', args: [] },

          // Observer Utilities
          'wait_for_element_advanced': { utility: 'ObserverUtilities', method: 'waitForElement', args: ['selector', 'options'] },
          'wait_for_condition': { utility: 'ObserverUtilities', method: 'waitForCondition', args: ['condition_function', 'options'] },
          'wait_for_ajax': { utility: 'ObserverUtilities', method: 'waitForAjax', args: ['options'] },
          'wait_for_text': { utility: 'ObserverUtilities', method: 'waitForText', args: ['text', 'options'] },
          'wait_for_url_change': { utility: 'ObserverUtilities', method: 'waitForUrlChange', args: ['options'] },
          'wait_for_images': { utility: 'ObserverUtilities', method: 'waitForImages', args: ['selector', 'timeout'] },
        };

        // Check if this is one of our utility tools
        if (utilityTools[name]) {
          const toolConfig = utilityTools[name];
          const tabId = args.tab_id;

          if (!tabId) {
            return {
              content: [{ type: "text", text: "Error: tab_id is required" }],
              isError: true,
            };
          }

          // Build arguments array from args object
          const methodArgs = toolConfig.args.map(argName => args[argName]).filter(arg => arg !== undefined);

          try {
            const result = await sendCommandToExtension('call_utility', {
              tabId: tabId,
              utility: toolConfig.utility,
              method: toolConfig.method,
              args: methodArgs
            });

            if (!result.success) {
              throw new Error(result.error || 'Utility call failed');
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result.result, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error calling ${name}: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        // Unknown tool
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
      }
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Create HTTP transport for MCP (stateless mode for multiple clients)
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless mode - allows multiple Claude instances
});

// Connect MCP server to HTTP transport
await server.connect(transport);

// Add MCP endpoint to existing Express app
app.post('/mcp', async (req, res) => {
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  await transport.handleRequest(req, res);
});

console.error("Chrome DevTools MCP Server running (HTTP mode)");
console.error("MCP endpoint: http://localhost:3456/mcp");

// Handle cleanup on exit
const cleanup = () => {
  console.error("Shutting down MCP server...");

  // Close HTTP server
  httpServer.close(() => {
    console.error("HTTP server closed");
  });

  // Clear interval timer
  clearInterval(cleanupInterval);

  // Exit after a short delay to allow cleanup
  setTimeout(() => process.exit(0), 100);
};

// Listen for various termination signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGHUP', cleanup);
process.on('uncaughtException', (error) => {
  console.error("Uncaught exception:", error);
  cleanup();
});
