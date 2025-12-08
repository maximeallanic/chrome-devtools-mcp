// Chrome DevTools MCP Custom - Popup UI

const attachBtn = document.getElementById('attach-btn');
const clearBtn = document.getElementById('clear-btn');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('status-text');
const networkCount = document.getElementById('network-count');
const consoleCount = document.getElementById('console-count');
const totalTabsCount = document.getElementById('total-tabs');
const mcpStatus = document.getElementById('mcp-status');
const tabList = document.getElementById('tab-list');
const attachedCount = document.getElementById('attached-count');

// Initialize
updateStatus();
setInterval(updateStatus, 2000); // Update every 2 seconds

// Attach debugger to current tab
attachBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      alert('No active tab found');
      return;
    }

    attachBtn.disabled = true;
    attachBtn.textContent = 'Attaching...';

    const response = await chrome.runtime.sendMessage({
      action: 'attach_debugger',
      tabId: tab.id
    });

    if (response.success) {
      attachBtn.disabled = false;
      attachBtn.textContent = 'Attach to Current Tab';
      updateStatus();
    } else {
      alert('Failed to attach debugger: ' + response.error);
      attachBtn.disabled = false;
      attachBtn.textContent = 'Attach to Current Tab';
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
    attachBtn.disabled = false;
    attachBtn.textContent = 'Attach to Current Tab';
  }
});

// Clear all data
clearBtn.addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'clear_data'
    });

    if (response.success) {
      updateStatus();
    }
  } catch (error) {
    console.error('Error:', error);
  }
});

// Detach tab
async function detachTab(tabId) {
  try {
    await chrome.runtime.sendMessage({
      action: 'detach_debugger',
      tabId: tabId
    });
    updateStatus();
  } catch (error) {
    console.error('Error detaching:', error);
  }
}

// Clear tab data
async function clearTabData(tabId) {
  try {
    await chrome.runtime.sendMessage({
      action: 'clear_data',
      tabId: tabId
    });
    updateStatus();
  } catch (error) {
    console.error('Error clearing data:', error);
  }
}

// Update status and tab list
async function updateStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ action: 'get_status' });

    // Update MCP connection status
    if (status.mcpServerConnected) {
      statusDiv.className = 'status connected';
      statusText.textContent = 'Connected';
      mcpStatus.textContent = '✓ Connected';
    } else {
      statusDiv.className = 'status disconnected';
      statusText.textContent = 'Disconnected';
      mcpStatus.textContent = '✗ Disconnected';
    }

    // Update total tabs count
    totalTabsCount.textContent = status.totalTabs || 0;

    // Update attached tabs
    const attachedTabs = status.attachedTabs || [];
    attachedCount.textContent = attachedTabs.length;

    if (attachedTabs.length === 0) {
      tabList.innerHTML = '<div class="empty-state">No tabs attached yet</div>';
    } else {
      // Get tab details and stats for each attached tab
      const tabElements = await Promise.all(
        attachedTabs.map(async (tabId) => {
          try {
            const [tabInfo, networkResp, consoleResp] = await Promise.all([
              chrome.runtime.sendMessage({ action: 'get_tab', tabId }),
              chrome.runtime.sendMessage({ action: 'get_network_requests', tabId }),
              chrome.runtime.sendMessage({ action: 'get_console_logs', tabId })
            ]);

            const tab = tabInfo.tab;
            const networkReqs = networkResp.requests?.length || 0;
            const consoleLogs = consoleResp.logs?.length || 0;

            return `
              <div class="tab-item">
                <div class="tab-info">
                  <div class="tab-title" title="${tab.title}">${tab.title || 'Untitled'}</div>
                  <div class="tab-stats">ID: ${tabId} | Net: ${networkReqs} | Logs: ${consoleLogs}</div>
                </div>
                <div class="tab-actions">
                  <button class="tab-btn" onclick="clearTabData(${tabId})">Clear</button>
                  <button class="tab-btn danger" onclick="detachTab(${tabId})">Detach</button>
                </div>
              </div>
            `;
          } catch (error) {
            console.error('Error getting tab info for', tabId, error);
            return `
              <div class="tab-item">
                <div class="tab-info">
                  <div class="tab-title">Tab ${tabId}</div>
                  <div class="tab-stats">Error loading tab info</div>
                </div>
                <div class="tab-actions">
                  <button class="tab-btn danger" onclick="detachTab(${tabId})">Detach</button>
                </div>
              </div>
            `;
          }
        })
      );

      tabList.innerHTML = tabElements.join('');
    }

    // Update global stats (sum of all tabs)
    let totalNetwork = 0;
    let totalConsole = 0;

    for (const tabId of attachedTabs) {
      try {
        const [networkResp, consoleResp] = await Promise.all([
          chrome.runtime.sendMessage({ action: 'get_network_requests', tabId }),
          chrome.runtime.sendMessage({ action: 'get_console_logs', tabId })
        ]);

        totalNetwork += networkResp.requests?.length || 0;
        totalConsole += consoleResp.logs?.length || 0;
      } catch (error) {
        console.error('Error getting stats for tab', tabId, error);
      }
    }

    networkCount.textContent = totalNetwork;
    consoleCount.textContent = totalConsole;

  } catch (error) {
    console.error('Error updating status:', error);
  }
}

// Make functions globally available for onclick handlers
window.detachTab = detachTab;
window.clearTabData = clearTabData;
