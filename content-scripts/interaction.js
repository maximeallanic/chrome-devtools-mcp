// Interaction Utilities for Generic Web Automation
// Provides advanced, site-agnostic user interaction simulation

const InteractionUtilities = {
  /**
   * Simulate mouse hover over an element
   * @param {string} selector - CSS selector
   * @param {number} duration - How long to hover (ms)
   * @returns {Object} Result object
   */
  async hoverElement(selector, duration = 1000) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Create and dispatch mouse events
    const rect = element.getBoundingClientRect();
    const events = ['mouseenter', 'mouseover', 'mousemove'];

    events.forEach(eventType => {
      const event = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      });
      element.dispatchEvent(event);
    });

    // Wait for duration
    if (duration > 0) {
      await this._sleep(duration);

      // Dispatch mouse leave events
      const leaveEvents = ['mouseleave', 'mouseout'];
      leaveEvents.forEach(eventType => {
        const event = new MouseEvent(eventType, {
          view: window,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(event);
      });
    }

    return { success: true, message: `Hovered over element for ${duration}ms` };
  },

  /**
   * Drag and drop from source to target element
   * @param {string} sourceSelector - Source element selector
   * @param {string} targetSelector - Target element selector
   * @param {number} duration - Animation duration (ms)
   * @returns {Object} Result object
   */
  async dragAndDrop(sourceSelector, targetSelector, duration = 500) {
    const source = document.querySelector(sourceSelector);
    const target = document.querySelector(targetSelector);

    if (!source) throw new Error(`Source element not found: ${sourceSelector}`);
    if (!target) throw new Error(`Target element not found: ${targetSelector}`);

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    // Create drag start event
    const dragStartEvent = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer()
    });
    source.dispatchEvent(dragStartEvent);

    await this._sleep(duration / 2);

    // Create drag over event on target
    const dragOverEvent = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dragStartEvent.dataTransfer
    });
    target.dispatchEvent(dragOverEvent);

    await this._sleep(duration / 2);

    // Create drop event
    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dragStartEvent.dataTransfer,
      clientX: targetRect.left + targetRect.width / 2,
      clientY: targetRect.top + targetRect.height / 2
    });
    target.dispatchEvent(dropEvent);

    // Create drag end event
    const dragEndEvent = new DragEvent('dragend', {
      bubbles: true,
      cancelable: true
    });
    source.dispatchEvent(dragEndEvent);

    return {
      success: true,
      message: `Dragged from "${sourceSelector}" to "${targetSelector}"`
    };
  },

  /**
   * Type text with natural delays between keystrokes
   * @param {string} selector - Input element selector
   * @param {string} text - Text to type
   * @param {number} delayMs - Delay between keystrokes (default: 50-150ms random)
   * @param {boolean} clear - Clear existing text first
   * @returns {Object} Result object
   */
  async typeWithDelay(selector, text, delayMs = null, clear = false) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Focus the element
    element.focus();

    if (clear) {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Type each character
    for (const char of text) {
      // Random delay between 50-150ms if not specified
      const delay = delayMs !== null ? delayMs : Math.random() * 100 + 50;

      // Dispatch keydown event
      const keydownEvent = new KeyboardEvent('keydown', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(keydownEvent);

      // Update value
      element.value += char;

      // Dispatch input event
      const inputEvent = new Event('input', { bubbles: true });
      element.dispatchEvent(inputEvent);

      // Dispatch keyup event
      const keyupEvent = new KeyboardEvent('keyup', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(keyupEvent);

      await this._sleep(delay);
    }

    // Dispatch change event at the end
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return {
      success: true,
      message: `Typed "${text}" into element`,
      charactersTyped: text.length
    };
  },

  /**
   * Select option from dropdown (select element)
   * @param {string} selector - Select element selector
   * @param {string} optionValue - Option value or text to select
   * @param {string} matchBy - 'value', 'text', or 'index'
   * @returns {Object} Result object
   */
  selectDropdownOption(selector, optionValue, matchBy = 'value') {
    const select = document.querySelector(selector);
    if (!select || select.tagName !== 'SELECT') {
      throw new Error(`Select element not found: ${selector}`);
    }

    let option;

    if (matchBy === 'value') {
      option = select.querySelector(`option[value="${optionValue}"]`);
    } else if (matchBy === 'text') {
      const options = Array.from(select.options);
      option = options.find(opt => opt.textContent.trim() === optionValue);
    } else if (matchBy === 'index') {
      option = select.options[parseInt(optionValue)];
    }

    if (!option) {
      throw new Error(`Option not found: ${optionValue} (matchBy: ${matchBy})`);
    }

    // Select the option
    option.selected = true;
    select.value = option.value;

    // Dispatch change event
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));

    return {
      success: true,
      message: `Selected option: ${option.textContent}`,
      selectedValue: option.value,
      selectedText: option.textContent
    };
  },

  /**
   * Upload file to input[type="file"]
   * @param {string} selector - File input selector
   * @param {string} fileName - File name
   * @param {string} fileContent - File content (base64 or text)
   * @param {string} mimeType - MIME type
   * @returns {Object} Result object
   */
  uploadFile(selector, fileName, fileContent, mimeType = 'text/plain') {
    const input = document.querySelector(selector);
    if (!input || input.type !== 'file') {
      throw new Error(`File input not found: ${selector}`);
    }

    // Create a File object
    const blob = new Blob([fileContent], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    // Create DataTransfer to hold the file
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Assign to input
    input.files = dataTransfer.files;

    // Dispatch change event
    input.dispatchEvent(new Event('change', { bubbles: true }));

    return {
      success: true,
      message: `Uploaded file: ${fileName}`,
      fileName,
      fileSize: blob.size
    };
  },

  /**
   * Trigger a custom event on an element
   * @param {string} selector - Element selector
   * @param {string} eventType - Event type (e.g., 'change', 'input', 'focus')
   * @param {Object} eventOptions - Additional event options
   * @returns {Object} Result object
   */
  triggerEvent(selector, eventType, eventOptions = {}) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const options = {
      bubbles: true,
      cancelable: true,
      ...eventOptions
    };

    let event;

    // Create appropriate event type
    if (['click', 'dblclick', 'mousedown', 'mouseup'].includes(eventType)) {
      event = new MouseEvent(eventType, options);
    } else if (['keydown', 'keyup', 'keypress'].includes(eventType)) {
      event = new KeyboardEvent(eventType, options);
    } else if (['focus', 'blur', 'change', 'input', 'submit'].includes(eventType)) {
      event = new Event(eventType, options);
    } else {
      event = new CustomEvent(eventType, { detail: options, ...options });
    }

    const dispatched = element.dispatchEvent(event);

    return {
      success: true,
      message: `Triggered ${eventType} event`,
      dispatched,
      defaultPrevented: event.defaultPrevented
    };
  },

  /**
   * Wait for navigation (page change)
   * @param {number} timeout - Timeout in ms
   * @returns {Object} Result object
   */
  async waitForNavigation(timeout = 30000) {
    const startUrl = window.location.href;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const currentUrl = window.location.href;
        const elapsed = Date.now() - startTime;

        if (currentUrl !== startUrl) {
          clearInterval(checkInterval);
          resolve({
            success: true,
            message: 'Navigation detected',
            fromUrl: startUrl,
            toUrl: currentUrl,
            elapsedMs: elapsed
          });
        }

        if (elapsed > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Navigation timeout after ${timeout}ms`));
        }
      }, 100);
    });
  },

  /**
   * Fill an entire form with multiple fields
   * @param {Object} formData - Map of selectors to values
   * @param {number} delayBetweenFields - Delay between filling fields (ms)
   * @returns {Object} Result object
   */
  async fillFormBatch(formData, delayBetweenFields = 200) {
    const results = [];

    for (const [selector, value] of Object.entries(formData)) {
      try {
        const element = document.querySelector(selector);
        if (!element) {
          results.push({
            selector,
            success: false,
            error: 'Element not found'
          });
          continue;
        }

        // Handle different input types
        if (element.tagName === 'SELECT') {
          this.selectDropdownOption(selector, value);
        } else if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // Regular input/textarea
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }

        results.push({
          selector,
          success: true,
          value
        });

        if (delayBetweenFields > 0) {
          await this._sleep(delayBetweenFields);
        }
      } catch (error) {
        results.push({
          selector,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return {
      success: successCount === results.length,
      message: `Filled ${successCount}/${results.length} fields`,
      results
    };
  },

  /**
   * Click multiple elements in sequence
   * @param {Array} selectors - Array of CSS selectors
   * @param {number} delayBetweenClicks - Delay between clicks (ms)
   * @returns {Object} Result object
   */
  async bulkClickElements(selectors, delayBetweenClicks = 500) {
    const results = [];

    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (!element) {
          results.push({
            selector,
            success: false,
            error: 'Element not found'
          });
          continue;
        }

        element.click();

        results.push({
          selector,
          success: true
        });

        if (delayBetweenClicks > 0) {
          await this._sleep(delayBetweenClicks);
        }
      } catch (error) {
        results.push({
          selector,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return {
      success: successCount === results.length,
      message: `Clicked ${successCount}/${results.length} elements`,
      results
    };
  },

  /**
   * Retry an action until it succeeds or times out
   * @param {Function} action - Function to retry (must return Promise)
   * @param {number} maxAttempts - Maximum attempts
   * @param {number} delayBetweenAttempts - Delay between attempts (ms)
   * @returns {Object} Result object
   */
  async retryUntilSuccess(action, maxAttempts = 3, delayBetweenAttempts = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await action();
        return {
          success: true,
          message: `Action succeeded on attempt ${attempt}`,
          attempt,
          result
        };
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          await this._sleep(delayBetweenAttempts);
        }
      }
    }

    throw new Error(`Action failed after ${maxAttempts} attempts. Last error: ${lastError.message}`);
  },

  /**
   * Scroll to bottom of page (for infinite scroll)
   * @param {number} scrollDelay - Delay between scrolls (ms)
   * @param {number} maxScrolls - Maximum number of scrolls
   * @param {string} containerSelector - Container to scroll (optional, defaults to window)
   * @returns {Object} Result object
   */
  async autoScrollToBottom(scrollDelay = 1000, maxScrolls = 10, containerSelector = null) {
    const container = containerSelector
      ? document.querySelector(containerSelector)
      : window;

    if (containerSelector && !container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    let scrollCount = 0;
    let previousHeight = this._getScrollHeight(container);

    while (scrollCount < maxScrolls) {
      // Scroll to bottom
      if (container === window) {
        window.scrollTo(0, document.body.scrollHeight);
      } else {
        container.scrollTop = container.scrollHeight;
      }

      await this._sleep(scrollDelay);

      const currentHeight = this._getScrollHeight(container);

      // Check if new content loaded
      if (currentHeight === previousHeight) {
        // No new content, we've reached the end
        break;
      }

      previousHeight = currentHeight;
      scrollCount++;
    }

    return {
      success: true,
      message: `Scrolled ${scrollCount} times`,
      scrollCount,
      finalHeight: previousHeight
    };
  },

  /**
   * Smart wait for page to be fully loaded (network + DOM)
   * @param {number} timeout - Timeout in ms
   * @returns {Object} Result object
   */
  async smartWait(timeout = 10000) {
    const startTime = Date.now();

    // Wait for DOM ready
    if (document.readyState !== 'complete') {
      await new Promise((resolve) => {
        const checkReady = () => {
          if (document.readyState === 'complete') {
            resolve();
          } else if (Date.now() - startTime > timeout) {
            resolve(); // Timeout
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
    }

    // Wait for network idle (no pending requests for 500ms)
    const performance = window.performance;
    if (performance && performance.getEntriesByType) {
      let lastRequestTime = Date.now();

      const checkNetworkIdle = () => {
        const resources = performance.getEntriesByType('resource');
        const recentRequests = resources.filter(r => r.responseEnd > Date.now() - 1000);

        if (recentRequests.length === 0 && Date.now() - lastRequestTime > 500) {
          return true;
        }

        if (recentRequests.length > 0) {
          lastRequestTime = Date.now();
        }

        return false;
      };

      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (checkNetworkIdle() || Date.now() - startTime > timeout) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }

    return {
      success: true,
      message: 'Page fully loaded',
      elapsedMs: Date.now() - startTime
    };
  },

  // ==================== Private Helper Methods ====================

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Get scroll height of container
   * @private
   */
  _getScrollHeight(container) {
    if (container === window) {
      return document.body.scrollHeight;
    }
    return container.scrollHeight;
  }
};

// Export for use in content scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InteractionUtilities;
}
