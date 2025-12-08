// DOM Utilities for Generic Web Automation
// Provides powerful, site-agnostic DOM selection and inspection tools

const DOMUtilities = {
  /**
   * Query all elements matching a CSS selector
   * @param {string} selector - CSS selector
   * @param {Element} context - Root element (default: document)
   * @returns {Array} Array of elements with their properties
   */
  querySelectorAll(selector, context = document) {
    try {
      const elements = Array.from(context.querySelectorAll(selector));
      return elements.map(el => this._serializeElement(el));
    } catch (error) {
      throw new Error(`Invalid selector "${selector}": ${error.message}`);
    }
  },

  /**
   * Query elements using XPath (more powerful than CSS selectors)
   * @param {string} xpath - XPath expression
   * @param {Element} context - Root element (default: document)
   * @returns {Array} Array of matching elements
   */
  xpathQuery(xpath, context = document) {
    try {
      const result = document.evaluate(
        xpath,
        context,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const elements = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        elements.push(this._serializeElement(result.snapshotItem(i)));
      }
      return elements;
    } catch (error) {
      throw new Error(`Invalid XPath "${xpath}": ${error.message}`);
    }
  },

  /**
   * Find elements by attribute value
   * @param {string} attribute - Attribute name (e.g., 'data-id', 'aria-label')
   * @param {string} value - Attribute value (optional, finds all if not specified)
   * @param {Element} context - Root element
   * @returns {Array} Matching elements
   */
  getElementsByAttribute(attribute, value = null, context = document) {
    const selector = value
      ? `[${attribute}="${value}"]`
      : `[${attribute}]`;
    return this.querySelectorAll(selector, context);
  },

  /**
   * Find elements containing specific text
   * @param {string} text - Text to search for
   * @param {boolean} exactMatch - If true, match exact text; if false, partial match
   * @param {string} tag - Limit search to specific tag (optional)
   * @returns {Array} Matching elements
   */
  findElementsByText(text, exactMatch = false, tag = '*') {
    const xpath = exactMatch
      ? `//${tag}[normalize-space(text())="${text}"]`
      : `//${tag}[contains(normalize-space(.), "${text}")]`;
    return this.xpathQuery(xpath);
  },

  /**
   * Get parent element of a given element
   * @param {string} selector - CSS selector for the child element
   * @param {number} levels - Number of levels to go up (default: 1)
   * @returns {Object} Parent element info
   */
  getParentElement(selector, levels = 1) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    let parent = element;
    for (let i = 0; i < levels; i++) {
      parent = parent.parentElement;
      if (!parent) {
        throw new Error(`No parent at level ${i + 1}`);
      }
    }

    return this._serializeElement(parent);
  },

  /**
   * Get sibling elements (next/previous)
   * @param {string} selector - CSS selector for the reference element
   * @param {string} direction - 'next', 'previous', or 'all'
   * @returns {Array} Sibling elements
   */
  getSiblingElements(selector, direction = 'all') {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const siblings = [];

    if (direction === 'next' || direction === 'all') {
      let sibling = element.nextElementSibling;
      while (sibling) {
        siblings.push(this._serializeElement(sibling));
        if (direction === 'next') break;
        sibling = sibling.nextElementSibling;
      }
    }

    if (direction === 'previous' || direction === 'all') {
      let sibling = element.previousElementSibling;
      const prevSiblings = [];
      while (sibling) {
        prevSiblings.unshift(this._serializeElement(sibling));
        if (direction === 'previous') break;
        sibling = sibling.previousElementSibling;
      }
      siblings.unshift(...prevSiblings);
    }

    return siblings;
  },

  /**
   * Get all child elements
   * @param {string} selector - CSS selector for parent element
   * @param {boolean} directOnly - If true, only direct children; if false, all descendants
   * @returns {Array} Child elements
   */
  getChildElements(selector, directOnly = true) {
    const parent = document.querySelector(selector);
    if (!parent) {
      throw new Error(`Element not found: ${selector}`);
    }

    const children = directOnly
      ? Array.from(parent.children)
      : Array.from(parent.querySelectorAll('*'));

    return children.map(el => this._serializeElement(el));
  },

  /**
   * Extract structured data from repeating patterns (lists, grids, tables)
   * @param {string} containerSelector - Selector for the container
   * @param {string} itemSelector - Selector for each item within the container
   * @param {Object} schema - Map of field names to selectors within each item
   * @returns {Array} Array of extracted objects
   */
  extractStructuredData(containerSelector, itemSelector, schema) {
    const container = document.querySelector(containerSelector);
    if (!container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    const items = container.querySelectorAll(itemSelector);
    const results = [];

    items.forEach((item, index) => {
      const data = { _index: index };

      for (const [fieldName, fieldSelector] of Object.entries(schema)) {
        const element = item.querySelector(fieldSelector);
        if (element) {
          data[fieldName] = {
            text: element.textContent.trim(),
            html: element.innerHTML,
            attributes: this._getAttributes(element)
          };
        } else {
          data[fieldName] = null;
        }
      }

      results.push(data);
    });

    return results;
  },

  /**
   * Get computed CSS styles for an element
   * @param {string} selector - CSS selector
   * @param {Array} properties - Specific properties to get (optional)
   * @returns {Object} Computed styles
   */
  getComputedStyles(selector, properties = null) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const computed = window.getComputedStyle(element);

    if (properties && Array.isArray(properties)) {
      const styles = {};
      properties.forEach(prop => {
        styles[prop] = computed.getPropertyValue(prop);
      });
      return styles;
    }

    // Return all computed styles
    const allStyles = {};
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      allStyles[prop] = computed.getPropertyValue(prop);
    }
    return allStyles;
  },

  /**
   * Get all links on the page
   * @param {Object} filters - Filter options (href, text, domain)
   * @returns {Array} Array of link objects
   */
  getAllLinks(filters = {}) {
    const links = Array.from(document.querySelectorAll('a[href]'));

    let filtered = links.map(link => ({
      href: link.href,
      text: link.textContent.trim(),
      title: link.title,
      target: link.target,
      domain: new URL(link.href).hostname
    }));

    if (filters.href) {
      filtered = filtered.filter(link => link.href.includes(filters.href));
    }
    if (filters.text) {
      filtered = filtered.filter(link => link.text.includes(filters.text));
    }
    if (filters.domain) {
      filtered = filtered.filter(link => link.domain === filters.domain);
    }

    return filtered;
  },

  /**
   * Get all images on the page
   * @param {Object} filters - Filter options
   * @returns {Array} Array of image objects
   */
  getAllImages(filters = {}) {
    const images = Array.from(document.querySelectorAll('img'));

    return images.map(img => ({
      src: img.src,
      alt: img.alt,
      title: img.title,
      width: img.naturalWidth,
      height: img.naturalHeight,
      displayWidth: img.width,
      displayHeight: img.height,
      loading: img.loading
    })).filter(img => {
      if (filters.minWidth && img.width < filters.minWidth) return false;
      if (filters.minHeight && img.height < filters.minHeight) return false;
      return true;
    });
  },

  /**
   * Extract JSON-LD structured data (Schema.org)
   * @returns {Array} Array of structured data objects
   */
  extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const data = [];

    scripts.forEach(script => {
      try {
        const json = JSON.parse(script.textContent);
        data.push(json);
      } catch (error) {
        console.warn('Failed to parse JSON-LD:', error);
      }
    });

    return data;
  },

  /**
   * Get complete element path (CSS selector path)
   * @param {string} selector - CSS selector for target element
   * @returns {string} Full CSS path from root
   */
  getElementPath(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }

      if (current.className) {
        const classes = Array.from(current.classList).join('.');
        if (classes) selector += `.${classes}`;
      }

      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          el => el.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  },

  /**
   * Validate if a selector matches any elements
   * @param {string} selector - CSS selector to validate
   * @param {Element} context - Root element
   * @returns {Object} Validation result with count and first match
   */
  validateSelector(selector, context = document) {
    try {
      const elements = context.querySelectorAll(selector);
      return {
        valid: true,
        count: elements.length,
        firstMatch: elements.length > 0 ? this._serializeElement(elements[0]) : null
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        count: 0,
        firstMatch: null
      };
    }
  },

  /**
   * Highlight an element visually (for debugging)
   * @param {string} selector - CSS selector
   * @param {string} color - Highlight color (default: yellow)
   * @param {number} duration - Duration in ms (0 = permanent)
   */
  highlightElement(selector, color = 'yellow', duration = 3000) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const originalOutline = element.style.outline;
    const originalBackgroundColor = element.style.backgroundColor;

    element.style.outline = `3px solid ${color}`;
    element.style.backgroundColor = `${color}33`; // 20% opacity

    if (duration > 0) {
      setTimeout(() => {
        element.style.outline = originalOutline;
        element.style.backgroundColor = originalBackgroundColor;
      }, duration);
    }

    return { success: true, message: `Element highlighted for ${duration}ms` };
  },

  // ==================== Private Helper Methods ====================

  /**
   * Serialize an element to a JSON-friendly object
   * @private
   */
  _serializeElement(element) {
    if (!element) return null;

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      textContent: element.textContent?.trim().substring(0, 200), // Limit text length
      innerHTML: element.innerHTML?.substring(0, 500), // Limit HTML length
      attributes: this._getAttributes(element),
      rect: element.getBoundingClientRect(),
      visible: this._isVisible(element),
      selector: this._generateSelector(element)
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
  },

  /**
   * Check if element is visible
   * @private
   */
  _isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  },

  /**
   * Generate a unique selector for an element
   * @private
   */
  _generateSelector(element) {
    if (element.id) return `#${element.id}`;

    let selector = element.tagName.toLowerCase();
    if (element.className) {
      const classes = Array.from(element.classList).join('.');
      if (classes) selector += `.${classes}`;
    }

    return selector;
  }
};

// Export for use in content scripts and injection
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMUtilities;
}
