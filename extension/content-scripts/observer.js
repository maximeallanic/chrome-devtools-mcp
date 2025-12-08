// Observer Utilities for Generic Web Monitoring
// Provides powerful waiting, observing, and monitoring capabilities

const ObserverUtilities = {
  /**
   * Wait for element to appear in DOM
   * @param {string} selector - CSS selector
   * @param {Object} options - Wait options
   * @returns {Promise<Object>} Found element info
   */
  waitForElement(selector, options = {}) {
    const {
      timeout = 10000,
      checkInterval = 100,
      visible = false
    } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkElement = () => {
        const element = document.querySelector(selector);

        if (element) {
          if (visible && !this._isVisible(element)) {
            // Element exists but not visible, keep waiting
          } else {
            resolve({
              success: true,
              found: true,
              element: this._serializeElement(element),
              waitedMs: Date.now() - startTime
            });
            return;
          }
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Element not found after ${timeout}ms: ${selector}`));
          return;
        }

        setTimeout(checkElement, checkInterval);
      };

      checkElement();
    });
  },

  /**
   * Wait for custom condition to become true
   * @param {Function} conditionFn - Function that returns boolean
   * @param {Object} options - Wait options
   * @returns {Promise<Object>} Result
   */
  waitForCondition(conditionFn, options = {}) {
    const {
      timeout = 10000,
      checkInterval = 100,
      errorMessage = 'Condition not met'
    } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkCondition = async () => {
        try {
          const result = await conditionFn();

          if (result) {
            resolve({
              success: true,
              result,
              waitedMs: Date.now() - startTime
            });
            return;
          }
        } catch (error) {
          // Condition threw error, keep waiting
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`${errorMessage} after ${timeout}ms`));
          return;
        }

        setTimeout(checkCondition, checkInterval);
      };

      checkCondition();
    });
  },

  /**
   * Wait for all AJAX/Fetch requests to complete
   * @param {Object} options - Wait options
   * @returns {Promise<Object>} Result
   */
  waitForAjax(options = {}) {
    const {
      timeout = 10000,
      idleTime = 500 // No requests for this long = idle
    } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let pendingRequests = 0;
      let lastRequestTime = Date.now();

      // Intercept XMLHttpRequest
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(...args) {
        this._url = args[1];
        return originalXHROpen.apply(this, args);
      };

      XMLHttpRequest.prototype.send = function(...args) {
        pendingRequests++;
        lastRequestTime = Date.now();

        this.addEventListener('loadend', () => {
          pendingRequests--;
          lastRequestTime = Date.now();
        });

        return originalXHRSend.apply(this, args);
      };

      // Intercept Fetch
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        pendingRequests++;
        lastRequestTime = Date.now();

        return originalFetch.apply(this, args).finally(() => {
          pendingRequests--;
          lastRequestTime = Date.now();
        });
      };

      const checkIdle = () => {
        const idle = pendingRequests === 0 && (Date.now() - lastRequestTime > idleTime);

        if (idle) {
          // Restore original methods
          XMLHttpRequest.prototype.open = originalXHROpen;
          XMLHttpRequest.prototype.send = originalXHRSend;
          window.fetch = originalFetch;

          resolve({
            success: true,
            message: 'All AJAX requests completed',
            waitedMs: Date.now() - startTime
          });
          return;
        }

        if (Date.now() - startTime > timeout) {
          // Restore original methods
          XMLHttpRequest.prototype.open = originalXHROpen;
          XMLHttpRequest.prototype.send = originalXHRSend;
          window.fetch = originalFetch;

          reject(new Error(`AJAX wait timeout after ${timeout}ms. Pending: ${pendingRequests}`));
          return;
        }

        setTimeout(checkIdle, 100);
      };

      checkIdle();
    });
  },

  /**
   * Observe DOM changes (mutations)
   * @param {string} targetSelector - Element to observe
   * @param {Object} options - Observer options
   * @returns {Object} Observer control object
   */
  observeDomChanges(targetSelector, options = {}) {
    const target = document.querySelector(targetSelector);
    if (!target) {
      throw new Error(`Target element not found: ${targetSelector}`);
    }

    const {
      childList = true,
      attributes = true,
      characterData = true,
      subtree = true,
      attributeOldValue = true,
      characterDataOldValue = true,
      maxRecords = 100,
      callback = null
    } = options;

    const mutations = [];
    let observer;

    const mutationCallback = (mutationsList) => {
      mutationsList.forEach(mutation => {
        const record = {
          type: mutation.type,
          timestamp: Date.now()
        };

        if (mutation.type === 'attributes') {
          record.attributeName = mutation.attributeName;
          record.oldValue = mutation.oldValue;
          record.newValue = mutation.target.getAttribute(mutation.attributeName);
        } else if (mutation.type === 'characterData') {
          record.oldValue = mutation.oldValue;
          record.newValue = mutation.target.textContent;
        } else if (mutation.type === 'childList') {
          record.addedNodes = mutation.addedNodes.length;
          record.removedNodes = mutation.removedNodes.length;
        }

        mutations.push(record);

        // Limit stored records
        if (mutations.length > maxRecords) {
          mutations.shift();
        }

        // Call user callback if provided
        if (callback) {
          callback(record, mutations);
        }
      });
    };

    observer = new MutationObserver(mutationCallback);

    observer.observe(target, {
      childList,
      attributes,
      characterData,
      subtree,
      attributeOldValue,
      characterDataOldValue
    });

    // Return control object
    return {
      stop: () => {
        observer.disconnect();
        return {
          success: true,
          message: 'Observer stopped',
          totalMutations: mutations.length
        };
      },
      getMutations: () => mutations,
      clearMutations: () => {
        mutations.length = 0;
        return { success: true };
      },
      isObserving: () => true
    };
  },

  /**
   * Intercept network requests and modify/monitor them
   * @param {Object} options - Interception options
   * @returns {Object} Interceptor control object
   */
  interceptNetworkRequest(options = {}) {
    const {
      urlPattern = null,
      method = null,
      onRequest = null,
      onResponse = null,
      modifyRequest = null,
      maxRecords = 100
    } = options;

    const requests = [];

    // Store original methods
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalFetch = window.fetch;

    // Intercept XMLHttpRequest
    XMLHttpRequest.prototype.open = function(methodArg, url, ...rest) {
      this._method = methodArg;
      this._url = url;

      // Check if should intercept
      const shouldIntercept =
        (!urlPattern || url.includes(urlPattern)) &&
        (!method || methodArg.toUpperCase() === method.toUpperCase());

      if (shouldIntercept) {
        const request = {
          method: methodArg,
          url,
          timestamp: Date.now(),
          type: 'XHR'
        };

        requests.push(request);
        if (requests.length > maxRecords) requests.shift();

        if (onRequest) {
          onRequest(request);
        }
      }

      return originalXHROpen.call(this, methodArg, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;

      if (xhr._url) {
        const shouldIntercept =
          (!urlPattern || xhr._url.includes(urlPattern)) &&
          (!method || xhr._method.toUpperCase() === method.toUpperCase());

        if (shouldIntercept) {
          // Modify request if callback provided
          if (modifyRequest) {
            body = modifyRequest({ url: xhr._url, method: xhr._method, body });
          }

          // Add response listener
          xhr.addEventListener('load', function() {
            if (onResponse) {
              onResponse({
                url: xhr._url,
                method: xhr._method,
                status: xhr.status,
                responseText: xhr.responseText
              });
            }
          });
        }
      }

      return originalXHRSend.call(this, body);
    };

    // Intercept Fetch
    window.fetch = function(url, config = {}) {
      const methodArg = (config.method || 'GET').toUpperCase();

      const shouldIntercept =
        (!urlPattern || url.includes(urlPattern)) &&
        (!method || methodArg === method.toUpperCase());

      if (shouldIntercept) {
        const request = {
          method: methodArg,
          url,
          timestamp: Date.now(),
          type: 'Fetch'
        };

        requests.push(request);
        if (requests.length > maxRecords) requests.shift();

        if (onRequest) {
          onRequest(request);
        }

        // Modify request if callback provided
        if (modifyRequest) {
          const modified = modifyRequest({ url, method: methodArg, config });
          if (modified.config) config = modified.config;
        }
      }

      return originalFetch.call(this, url, config).then(response => {
        if (shouldIntercept && onResponse) {
          response.clone().text().then(text => {
            onResponse({
              url,
              method: methodArg,
              status: response.status,
              responseText: text
            });
          });
        }
        return response;
      });
    };

    // Return control object
    return {
      stop: () => {
        XMLHttpRequest.prototype.open = originalXHROpen;
        XMLHttpRequest.prototype.send = originalXHRSend;
        window.fetch = originalFetch;
        return {
          success: true,
          message: 'Interceptor stopped',
          totalRequests: requests.length
        };
      },
      getRequests: () => requests,
      clearRequests: () => {
        requests.length = 0;
        return { success: true };
      }
    };
  },

  /**
   * Wait for specific text to appear on page
   * @param {string} text - Text to wait for
   * @param {Object} options - Wait options
   * @returns {Promise<Object>} Result
   */
  waitForText(text, options = {}) {
    const {
      timeout = 10000,
      exactMatch = false,
      selector = 'body'
    } = options;

    return this.waitForCondition(
      () => {
        const container = document.querySelector(selector);
        if (!container) return false;

        const content = container.textContent;
        return exactMatch
          ? content.includes(text)
          : content.toLowerCase().includes(text.toLowerCase());
      },
      { timeout, errorMessage: `Text "${text}" not found` }
    );
  },

  /**
   * Wait for URL to change
   * @param {Object} options - Wait options
   * @returns {Promise<Object>} Result
   */
  waitForUrlChange(options = {}) {
    const {
      timeout = 30000,
      expectedUrl = null
    } = options;

    const startUrl = window.location.href;

    return this.waitForCondition(
      () => {
        const currentUrl = window.location.href;
        if (expectedUrl) {
          return currentUrl.includes(expectedUrl);
        }
        return currentUrl !== startUrl;
      },
      { timeout, errorMessage: 'URL did not change' }
    );
  },

  /**
   * Monitor element's visibility changes
   * @param {string} selector - Element selector
   * @param {Function} callback - Called when visibility changes
   * @returns {Object} Observer control object
   */
  monitorVisibility(selector, callback) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          callback({
            isVisible: entry.isIntersecting,
            intersectionRatio: entry.intersectionRatio,
            boundingRect: entry.boundingClientRect,
            timestamp: Date.now()
          });
        });
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    observer.observe(element);

    return {
      stop: () => {
        observer.disconnect();
        return { success: true, message: 'Visibility monitor stopped' };
      }
    };
  },

  /**
   * Monitor performance metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    if (!window.performance) {
      return { error: 'Performance API not available' };
    }

    const navigation = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');

    const metrics = {
      timestamp: Date.now(),
      navigation: navigation ? {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        domInteractive: navigation.domInteractive,
        responseTime: navigation.responseEnd - navigation.requestStart,
        transferSize: navigation.transferSize,
        encodedBodySize: navigation.encodedBodySize,
        decodedBodySize: navigation.decodedBodySize
      } : null,
      paint: {},
      memory: null
    };

    // Paint timing
    paint.forEach(entry => {
      metrics.paint[entry.name] = entry.startTime;
    });

    // Memory (if available)
    if (performance.memory) {
      metrics.memory = {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }

    // Resource timing
    const resources = performance.getEntriesByType('resource');
    metrics.resourceCount = resources.length;
    metrics.totalResourceSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

    return metrics;
  },

  /**
   * Wait for images to load
   * @param {string} selector - Image selector (optional, waits for all if not provided)
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Object>} Result
   */
  waitForImages(selector = 'img', timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const images = Array.from(document.querySelectorAll(selector));

      if (images.length === 0) {
        resolve({ success: true, message: 'No images found', count: 0 });
        return;
      }

      let loadedCount = 0;
      const totalImages = images.length;

      const checkComplete = () => {
        if (loadedCount === totalImages) {
          resolve({
            success: true,
            message: `All ${totalImages} images loaded`,
            count: totalImages,
            waitedMs: Date.now() - startTime
          });
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Image load timeout. Loaded: ${loadedCount}/${totalImages}`));
        }
      };

      images.forEach(img => {
        if (img.complete && img.naturalHeight !== 0) {
          loadedCount++;
        } else {
          img.addEventListener('load', () => {
            loadedCount++;
            checkComplete();
          });
          img.addEventListener('error', () => {
            loadedCount++; // Count errors as "loaded" to avoid infinite wait
            checkComplete();
          });
        }
      });

      checkComplete();
    });
  },

  // ==================== Private Helper Methods ====================

  /**
   * Check if element is visible
   * @private
   */
  _isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           element.offsetHeight > 0;
  },

  /**
   * Serialize element to JSON-friendly object
   * @private
   */
  _serializeElement(element) {
    if (!element) return null;

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      textContent: element.textContent?.trim().substring(0, 200),
      attributes: this._getAttributes(element),
      rect: element.getBoundingClientRect(),
      visible: this._isVisible(element)
    };
  },

  /**
   * Get all attributes of an element
   * @private
   */
  _getAttributes(element) {
    const attrs = {};
    for (const attr of element.attributes) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }
};

// Export for use in content scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ObserverUtilities;
}
