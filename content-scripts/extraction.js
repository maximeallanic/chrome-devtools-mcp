// Extraction Utilities for Generic Web Scraping
// Provides powerful data extraction from any website structure

const ExtractionUtilities = {
  /**
   * Extract data from HTML tables
   * @param {string} selector - Table selector
   * @param {Object} options - Extraction options
   * @returns {Object} Table data with headers and rows
   */
  extractTableData(selector, options = {}) {
    const table = document.querySelector(selector);
    if (!table) {
      throw new Error(`Table not found: ${selector}`);
    }

    const {
      hasHeader = true,
      includeIndex = false,
      trimWhitespace = true
    } = options;

    const result = {
      headers: [],
      rows: [],
      rowCount: 0,
      columnCount: 0
    };

    // Extract headers
    if (hasHeader) {
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (headerRow) {
        const headerCells = headerRow.querySelectorAll('th, td');
        result.headers = Array.from(headerCells).map(cell => {
          const text = cell.textContent;
          return trimWhitespace ? text.trim() : text;
        });
      }
    }

    // Extract rows
    const rows = table.querySelectorAll(hasHeader ? 'tbody tr, tr:not(:first-child)' : 'tr');
    result.rows = Array.from(rows).map((row, rowIndex) => {
      const cells = row.querySelectorAll('td, th');
      const rowData = Array.from(cells).map(cell => {
        const text = cell.textContent;
        return trimWhitespace ? text.trim() : text;
      });

      if (includeIndex) {
        return { index: rowIndex, data: rowData };
      }

      // Convert to object if we have headers
      if (result.headers.length > 0) {
        const rowObj = {};
        result.headers.forEach((header, i) => {
          rowObj[header] = rowData[i] || null;
        });
        return rowObj;
      }

      return rowData;
    });

    result.rowCount = result.rows.length;
    result.columnCount = result.headers.length || (result.rows[0]?.length || 0);

    return result;
  },

  /**
   * Extract data from lists (ul/ol)
   * @param {string} selector - List selector
   * @param {Object} options - Extraction options
   * @returns {Array} Array of list items
   */
  extractListData(selector, options = {}) {
    const list = document.querySelector(selector);
    if (!list) {
      throw new Error(`List not found: ${selector}`);
    }

    const {
      includeNested = false,
      extractLinks = false,
      extractHtml = false
    } = options;

    const itemSelector = includeNested ? 'li' : '> li';
    const items = list.querySelectorAll(itemSelector);

    return Array.from(items).map((item, index) => {
      const data = {
        index,
        text: item.textContent.trim()
      };

      if (extractHtml) {
        data.html = item.innerHTML;
      }

      if (extractLinks) {
        const link = item.querySelector('a');
        if (link) {
          data.link = {
            href: link.href,
            text: link.textContent.trim()
          };
        }
      }

      // Extract nested list if present
      if (includeNested) {
        const nestedList = item.querySelector('ul, ol');
        if (nestedList) {
          data.nested = this.extractListData(`#${nestedList.id || nestedList.className}`, options);
        }
      }

      return data;
    });
  },

  /**
   * Paginate through pages and collect data
   * @param {string} nextButtonSelector - Selector for "next" button
   * @param {Function} extractionFn - Function to extract data from each page
   * @param {Object} options - Options
   * @returns {Array} Collected data from all pages
   */
  async paginateAndCollect(nextButtonSelector, extractionFn, options = {}) {
    const {
      maxPages = 10,
      delayBetweenPages = 1000,
      stopWhenNoData = true
    } = options;

    const allData = [];
    let currentPage = 1;

    while (currentPage <= maxPages) {
      // Extract data from current page
      const pageData = await extractionFn(currentPage);

      if (stopWhenNoData && (!pageData || pageData.length === 0)) {
        break;
      }

      allData.push(...(Array.isArray(pageData) ? pageData : [pageData]));

      // Find next button
      const nextButton = document.querySelector(nextButtonSelector);

      if (!nextButton || nextButton.disabled || nextButton.classList.contains('disabled')) {
        break; // No more pages
      }

      // Click next button
      nextButton.click();

      // Wait for new page to load
      await this._sleep(delayBetweenPages);

      currentPage++;
    }

    return {
      data: allData,
      pagesCollected: currentPage - 1,
      totalItems: allData.length
    };
  },

  /**
   * Extract all metadata from the page
   * @returns {Object} Page metadata
   */
  getPageContext() {
    const meta = {};

    // Basic page info
    meta.url = window.location.href;
    meta.title = document.title;
    meta.domain = window.location.hostname;
    meta.protocol = window.location.protocol;
    meta.pathname = window.location.pathname;

    // Meta tags
    meta.description = document.querySelector('meta[name="description"]')?.content || null;
    meta.keywords = document.querySelector('meta[name="keywords"]')?.content || null;
    meta.author = document.querySelector('meta[name="author"]')?.content || null;
    meta.ogTitle = document.querySelector('meta[property="og:title"]')?.content || null;
    meta.ogDescription = document.querySelector('meta[property="og:description"]')?.content || null;
    meta.ogImage = document.querySelector('meta[property="og:image"]')?.content || null;

    // Canonical URL
    meta.canonical = document.querySelector('link[rel="canonical"]')?.href || null;

    // Detect frameworks and libraries
    meta.frameworks = this._detectFrameworks();

    // Page size and load time
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      meta.loadTime = timing.loadEventEnd - timing.navigationStart;
      meta.domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
    }

    // Count elements
    meta.elementCounts = {
      links: document.querySelectorAll('a').length,
      images: document.querySelectorAll('img').length,
      scripts: document.querySelectorAll('script').length,
      stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
      forms: document.querySelectorAll('form').length,
      buttons: document.querySelectorAll('button').length,
      inputs: document.querySelectorAll('input').length
    };

    // Language
    meta.language = document.documentElement.lang || null;

    // Viewport
    const viewport = document.querySelector('meta[name="viewport"]');
    meta.viewport = viewport?.content || null;

    return meta;
  },

  /**
   * Extract form data (all inputs and their current values)
   * @param {string} formSelector - Form selector
   * @returns {Object} Form data
   */
  extractFormData(formSelector) {
    const form = document.querySelector(formSelector);
    if (!form) {
      throw new Error(`Form not found: ${formSelector}`);
    }

    const formData = {
      action: form.action,
      method: form.method,
      fields: []
    };

    // Extract all form inputs
    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
      const field = {
        name: input.name,
        type: input.type || input.tagName.toLowerCase(),
        id: input.id,
        value: null,
        placeholder: input.placeholder,
        required: input.required,
        disabled: input.disabled
      };

      // Get value based on input type
      if (input.type === 'checkbox' || input.type === 'radio') {
        field.checked = input.checked;
        field.value = input.value;
      } else if (input.tagName === 'SELECT') {
        field.value = input.value;
        field.options = Array.from(input.options).map(opt => ({
          value: opt.value,
          text: opt.textContent,
          selected: opt.selected
        }));
      } else {
        field.value = input.value;
      }

      formData.fields.push(field);
    });

    return formData;
  },

  /**
   * Extract all external resources (scripts, stylesheets, images)
   * @returns {Object} External resources
   */
  extractExternalResources() {
    return {
      scripts: Array.from(document.querySelectorAll('script[src]')).map(script => ({
        src: script.src,
        async: script.async,
        defer: script.defer,
        type: script.type
      })),
      stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => ({
        href: link.href,
        media: link.media
      })),
      images: Array.from(document.querySelectorAll('img[src]')).map(img => ({
        src: img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight
      })),
      videos: Array.from(document.querySelectorAll('video[src], video source')).map(video => ({
        src: video.src,
        type: video.type
      })),
      iframes: Array.from(document.querySelectorAll('iframe[src]')).map(iframe => ({
        src: iframe.src,
        title: iframe.title
      }))
    };
  },

  /**
   * Extract all cookies as key-value pairs
   * @returns {Object} Cookies
   */
  extractCookies() {
    const cookies = {};
    document.cookie.split(';').forEach(cookie => {
      const [key, value] = cookie.split('=').map(s => s.trim());
      if (key) {
        cookies[key] = decodeURIComponent(value || '');
      }
    });
    return cookies;
  },

  /**
   * Extract local storage data
   * @returns {Object} Local storage data
   */
  getLocalStorage() {
    const storage = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        // Try to parse as JSON
        storage[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        // If not JSON, store as string
        storage[key] = localStorage.getItem(key);
      }
    }
    return storage;
  },

  /**
   * Extract session storage data
   * @returns {Object} Session storage data
   */
  getSessionStorage() {
    const storage = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      try {
        storage[key] = JSON.parse(sessionStorage.getItem(key));
      } catch {
        storage[key] = sessionStorage.getItem(key);
      }
    }
    return storage;
  },

  /**
   * Extract data from repeating card/item patterns
   * @param {string} containerSelector - Container with repeating items
   * @param {string} itemSelector - Individual item selector
   * @param {Object} fieldSelectors - Map of field names to selectors
   * @returns {Array} Extracted items
   */
  extractRepeatingPatterns(containerSelector, itemSelector, fieldSelectors) {
    const container = document.querySelector(containerSelector);
    if (!container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    const items = container.querySelectorAll(itemSelector);
    const results = [];

    items.forEach((item, index) => {
      const data = { _index: index };

      for (const [fieldName, selector] of Object.entries(fieldSelectors)) {
        const element = item.querySelector(selector);

        if (element) {
          // Check what type of data to extract
          if (element.tagName === 'IMG') {
            data[fieldName] = {
              src: element.src,
              alt: element.alt
            };
          } else if (element.tagName === 'A') {
            data[fieldName] = {
              href: element.href,
              text: element.textContent.trim()
            };
          } else {
            data[fieldName] = element.textContent.trim();
          }
        } else {
          data[fieldName] = null;
        }
      }

      results.push(data);
    });

    return results;
  },

  /**
   * Extract breadcrumb navigation
   * @param {string} breadcrumbSelector - Breadcrumb container selector
   * @returns {Array} Breadcrumb items
   */
  extractBreadcrumbs(breadcrumbSelector) {
    const breadcrumb = document.querySelector(breadcrumbSelector);
    if (!breadcrumb) {
      throw new Error(`Breadcrumb not found: ${breadcrumbSelector}`);
    }

    const items = breadcrumb.querySelectorAll('a, li, span');

    return Array.from(items).map((item, index) => ({
      index,
      text: item.textContent.trim(),
      href: item.tagName === 'A' ? item.href : null,
      active: item.classList.contains('active') || item.getAttribute('aria-current') === 'page'
    }));
  },

  /**
   * Extract pricing/product information
   * @param {string} containerSelector - Container with pricing info
   * @returns {Object} Pricing data
   */
  extractPricingInfo(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    // Common price patterns
    const pricePatterns = [
      /\$[\d,]+\.?\d*/,
      /€[\d,]+\.?\d*/,
      /£[\d,]+\.?\d*/,
      /[\d,]+\.?\d*\s*(USD|EUR|GBP)/i
    ];

    const text = container.textContent;
    const prices = [];

    pricePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        prices.push(...matches);
      }
    });

    return {
      prices: [...new Set(prices)], // Remove duplicates
      fullText: text.trim(),
      currency: this._detectCurrency(text)
    };
  },

  // ==================== Private Helper Methods ====================

  /**
   * Detect frameworks used on the page
   * @private
   */
  _detectFrameworks() {
    const frameworks = [];

    // React
    if (window.React || document.querySelector('[data-reactroot], [data-reactid]')) {
      frameworks.push('React');
    }

    // Vue
    if (window.Vue || document.querySelector('[data-v-]')) {
      frameworks.push('Vue');
    }

    // Angular
    if (window.angular || document.querySelector('[ng-app], [ng-version]')) {
      frameworks.push('Angular');
    }

    // jQuery
    if (window.jQuery || window.$) {
      frameworks.push('jQuery');
    }

    // Next.js
    if (document.getElementById('__next')) {
      frameworks.push('Next.js');
    }

    // Svelte
    if (document.querySelector('[class*="svelte-"]')) {
      frameworks.push('Svelte');
    }

    return frameworks;
  },

  /**
   * Detect currency from text
   * @private
   */
  _detectCurrency(text) {
    if (text.includes('$')) return 'USD';
    if (text.includes('€')) return 'EUR';
    if (text.includes('£')) return 'GBP';
    if (/USD/i.test(text)) return 'USD';
    if (/EUR/i.test(text)) return 'EUR';
    if (/GBP/i.test(text)) return 'GBP';
    return 'UNKNOWN';
  },

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Export for use in content scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExtractionUtilities;
}
