# Chrome DevTools MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io/)

> **Control Chrome browser directly from AI assistants using the Model Context Protocol (MCP)**

A powerful Chrome extension + MCP server that gives AI assistants (like Claude) full control over Chrome DevTools capabilities. Monitor network requests, capture console logs, take screenshots, interact with DOM elements, and automate browser tasks.

## Features

### Browser Control
- **Tab Management** - Create, close, navigate, and manage Chrome tabs
- **Navigation** - Go back, forward, reload, navigate to URLs
- **Screenshots** - Capture full page or specific element screenshots

### DevTools Integration
- **Network Monitoring** - Capture HTTP requests/responses with headers, timing, and body
- **Console Logs** - Real-time console messages (log, error, warn, info, debug)
- **Performance Metrics** - Performance timing and resource metrics

### DOM Manipulation
- **Element Selection** - CSS selectors, XPath, text search, attribute matching
- **Element Inspection** - Get computed styles, attributes, dimensions, visibility
- **Data Extraction** - Extract tables, lists, forms, JSON-LD structured data

### Browser Automation
- **Click & Type** - Click elements, fill forms, type with natural delays
- **Scroll & Wait** - Smart scrolling, wait for elements/conditions/AJAX
- **Drag & Drop** - Drag elements between locations
- **Form Handling** - Batch fill forms, select dropdowns, trigger events

### Extension Debugging
- **Extension Management** - List, inspect, reload Chrome extensions
- **Service Worker Logs** - Capture logs from extension service workers
- **External Extension Debugging** - Debug other extensions with helper script

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Browser                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Chrome Extension (Manifest V3)            │   │
│  │  • chrome.debugger API for DevTools access          │   │
│  │  • chrome.tabs API for tab management               │   │
│  │  • chrome.scripting API for DOM interaction         │   │
│  └──────────────────────┬──────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP (localhost:3456)
┌─────────────────────────┼───────────────────────────────────┐
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │              MCP Server (Node.js)                   │   │
│  │  • Express HTTP server for extension communication  │   │
│  │  • MCP protocol for AI assistant integration        │   │
│  │  • 70+ tools for browser control                    │   │
│  └──────────────────────┬──────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │ MCP Protocol (HTTP)
┌─────────────────────────┼───────────────────────────────────┐
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │            AI Assistant (Claude, etc.)              │   │
│  │  • Uses MCP tools to control browser               │   │
│  │  • Automates web tasks                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/maximeallanic/chrome-devtools-mcp.git
cd chrome-devtools-mcp/server
npm install
```

### 2. Load Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Note the Extension ID displayed

### 3. Start the MCP Server

```bash
cd server
npm start
```

The server starts on `http://localhost:3456`

### 4. Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path/to/chrome-devtools-mcp/server/mcp-server.js"]
    }
  }
}
```

Or for HTTP mode:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "http",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

### 5. Use It!

In Claude Code, you can now:

```
"Take a screenshot of the current tab"
"Get all network requests from the last minute"
"Click the login button and fill in the form"
"Extract all links from the page"
"Wait for the loading spinner to disappear"
```

## Available Tools (70+)

<details>
<summary><b>Tab Management</b></summary>

| Tool | Description |
|------|-------------|
| `create_tab` | Create a new tab, optionally navigate to URL |
| `list_tabs` | List all open tabs |
| `close_tab` | Close a tab by ID |
| `get_tab` | Get tab details |
| `navigate_to` | Navigate tab to URL |
| `navigate_back` | Go back in history |
| `navigate_forward` | Go forward in history |
| `reload_tab` | Reload a tab |

</details>

<details>
<summary><b>DevTools & Debugging</b></summary>

| Tool | Description |
|------|-------------|
| `attach_debugger` | Attach DevTools debugger to tab |
| `detach_debugger` | Detach debugger from tab |
| `list_attached_tabs` | List tabs with debugger attached |
| `get_network_requests` | Get captured network requests |
| `get_console_logs` | Get console log messages |
| `get_performance_metrics` | Get performance metrics |
| `clear_devtools_data` | Clear captured data |

</details>

<details>
<summary><b>Screenshots</b></summary>

| Tool | Description |
|------|-------------|
| `capture_screenshot` | Screenshot visible area |
| `capture_element_screenshot` | Screenshot specific element |

</details>

<details>
<summary><b>DOM Selection</b></summary>

| Tool | Description |
|------|-------------|
| `query_selector_all` | Query elements by CSS selector |
| `xpath_query` | Query elements by XPath |
| `get_elements_by_attribute` | Find by attribute |
| `find_elements_by_text` | Find by text content |
| `get_parent_element` | Get parent element |
| `get_sibling_elements` | Get sibling elements |
| `get_child_elements` | Get child elements |
| `get_element_path` | Get CSS path to element |
| `validate_selector` | Check if selector matches |

</details>

<details>
<summary><b>Element Inspection</b></summary>

| Tool | Description |
|------|-------------|
| `inspect_element` | Get comprehensive element info |
| `get_element_text` | Get text content |
| `get_computed_styles` | Get CSS computed styles |
| `highlight_element` | Visually highlight element |

</details>

<details>
<summary><b>Interaction</b></summary>

| Tool | Description |
|------|-------------|
| `click_element` | Click an element |
| `fill_input` | Fill input field |
| `type_with_delay` | Type with natural delays |
| `hover_element` | Hover over element |
| `drag_and_drop` | Drag element to target |
| `scroll_to` | Scroll to element |
| `select_dropdown_option` | Select from dropdown |
| `trigger_event` | Trigger custom event |
| `fill_form_batch` | Fill multiple fields |
| `bulk_click_elements` | Click multiple elements |
| `auto_scroll_to_bottom` | Infinite scroll handling |

</details>

<details>
<summary><b>Data Extraction</b></summary>

| Tool | Description |
|------|-------------|
| `extract_table_data` | Extract HTML tables as JSON |
| `extract_list_data` | Extract lists as arrays |
| `extract_structured_data` | Extract repeating patterns |
| `extract_json_ld` | Extract Schema.org data |
| `extract_form_data` | Extract form fields/values |
| `get_all_links` | Get all page links |
| `get_all_images` | Get all page images |
| `get_page_context` | Get page metadata |
| `get_local_storage` | Read localStorage |
| `get_session_storage` | Read sessionStorage |
| `paginate_and_collect` | Paginate and extract data |

</details>

<details>
<summary><b>Waiting & Conditions</b></summary>

| Tool | Description |
|------|-------------|
| `wait_for_element` | Wait for element to appear |
| `wait_for_element_advanced` | Wait with visibility check |
| `wait_for_text` | Wait for text to appear |
| `wait_for_condition` | Wait for custom condition |
| `wait_for_ajax` | Wait for AJAX to complete |
| `wait_for_url_change` | Wait for navigation |
| `wait_for_images` | Wait for images to load |
| `smart_wait` | Wait for page to be ready |

</details>

<details>
<summary><b>Extension Management</b></summary>

| Tool | Description |
|------|-------------|
| `list_extensions` | List installed extensions |
| `get_extension_info` | Get extension details |
| `reload_extension` | Reload an extension |
| `get_manifest` | Get extension manifest |
| `get_service_worker_logs` | Get SW logs |
| `clear_service_worker_logs` | Clear SW logs |
| `list_external_extensions` | List debugged extensions |
| `get_external_extension_logs` | Get external ext logs |

</details>

<details>
<summary><b>Script Execution</b></summary>

| Tool | Description |
|------|-------------|
| `execute_script` | Execute JavaScript in page |

</details>

## Use Cases

### Web Scraping
```
"Extract all product names and prices from this e-commerce page"
"Navigate through pagination and collect all article titles"
"Get all images larger than 200x200 pixels"
```

### Testing & QA
```
"Fill out the registration form and submit it"
"Check if the error message appears when submitting empty form"
"Take screenshots of all pages in the navigation"
```

### Monitoring
```
"Watch for any console errors on this page"
"Monitor network requests and alert on failed API calls"
"Track page load performance metrics"
```

### Automation
```
"Log into the admin panel and export the daily report"
"Click through the checkout flow and verify each step"
"Auto-scroll to load all comments, then extract them"
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | HTTP server port |

### Extension Popup

The extension popup provides:
- **Attach/Detach** buttons for DevTools capture
- **Status indicators** for connection state
- **Counters** for captured data (network, console, metrics)

## Troubleshooting

### Extension won't attach
- Ensure you're on a regular webpage (not `chrome://` pages)
- Check Chrome DevTools console for errors
- Try reloading the extension

### MCP Server disconnected
- Verify server is running: `npm start`
- Check port 3456 availability: `lsof -i :3456`
- Restart Claude Code to reconnect

### Tools not responding
- Ensure extension is attached to target tab
- Check server logs for errors
- Verify tab ID is correct

## Development

### Project Structure

```
chrome-devtools-mcp/
├── extension/                  # Chrome Extension
│   ├── manifest.json           # Extension manifest (v3)
│   ├── background.js           # Service worker
│   ├── popup.html/js           # Extension popup UI
│   ├── debug-helper.js         # External extension debugging
│   ├── icons/                  # Extension icons
│   └── content-scripts/        # DOM utility scripts
│       ├── dom-utilities.js
│       ├── interaction.js
│       ├── extraction.js
│       └── observer.js
│
├── server/                     # MCP Server (Node.js)
│   ├── mcp-server.js           # Main server
│   ├── package.json            # Dependencies
│   └── node_modules/
│
├── scripts/                    # Admin scripts
│   ├── start-server.sh
│   ├── stop-server.sh
│   ├── install-service.sh      # Systemd service setup
│   └── chrome-devtools-mcp.service
│
├── LICENSE
└── README.md
```

### Running in Development

```bash
cd server

# Start server with auto-reload (if using nodemon)
npm run dev

# Or standard start
npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

Built as a robust alternative to existing Chrome MCP implementations, using a standalone HTTP-based architecture for better reliability and multi-client support.

---

**Made with love for the AI-assisted development community**
