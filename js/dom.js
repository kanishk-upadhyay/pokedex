// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * dom.js - Minimal DOM helper utilities
 *
 * Small helpers to reduce repetitive DOM boilerplate.
 * - `el(tag, attrs, ...children)` creates elements with attributes and children
 * - `img(src, attrs)` creates image elements with lazy loading
 */

function isNode(o) {
  return (
    o instanceof Node ||
    (o && typeof o === "object" && typeof o.nodeType === "number")
  );
}

/**
 * Set attributes and special keys on an element.
 * Supported keys:
 *  - `class` / `className` / `cls` (string or array)
 *  - `style` (string or object)
 *  - `dataset` (object)
 *  - Event listeners: attributes starting with "on" (e.g., onClick or onclick)
 *  - Any other key -> element.setAttribute(key, value)
 */
function _applyAttributes(el, attrs = {}) {
  if (!attrs || typeof attrs !== "object") return;

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;

    // class handling
    if (key === "class" || key === "className" || key === "cls") {
      if (Array.isArray(value)) {
        el.className = value.filter(Boolean).join(" ");
      } else {
        el.className = String(value);
      }
      return;
    }

    // style handling
    if (key === "style") {
      if (typeof value === "string") {
        el.setAttribute("style", value);
      } else if (typeof value === "object") {
        Object.assign(el.style, value);
      }
      return;
    }

    // dataset handling
    if (key === "dataset" && typeof value === "object") {
      Object.entries(value).forEach(([dKey, dVal]) => {
        if (dVal === undefined || dVal === null || dVal === false) return;
        el.dataset[dKey] = String(dVal);
      });
      return;
    }


    // Event listeners: onClick, onclick, onkeydown etc.
    if (/^on[A-Za-z0-9_]/.test(key)) {
      // Accept both camelCase (onClick) and lowercase (onclick)
      const eventName = key.replace(/^on/, "").toLowerCase();
      if (typeof value === "function") {
        el.addEventListener(eventName, value);
      }
      return;
    }

    // boolean attributes (checked, disabled, hidden, etc.)
    if (typeof value === "boolean") {
      if (value) el.setAttribute(key, "");
      else el.removeAttribute(key);
      // also set property if present
      try {
        if (key in el) {
          el[key] = value;
        }
      } catch (e) {
        console.warn(`Failed to set property '${key}' on element:`, el, `with value:`, value, e);
      }
      return;
    }

    // default: set attribute
    el.setAttribute(key, String(value));
  });
}

/**
 * Create an element with attributes and children.
 *
 * @param {string} tag - Tag name (e.g., 'div', 'img')
 * @param {Object} [attrs] - Attributes and special keys
 * @param {...(Node|string|Array)} children - Child nodes or strings (strings become Text nodes)
 * @returns {Element}
 */
function el(tag, attrs = {}, ...children) {
  // Allow calling with el('div', child1, child2) where attrs omitted
  if (
    attrs &&
    (isNode(attrs) || typeof attrs === "string" || Array.isArray(attrs))
  ) {
    children = [attrs, ...children];
    attrs = {};
  }

  const node = document.createElement(tag);

  _applyAttributes(node, attrs);

  // Append children safely
  children.flat(1).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    node.append(c);
  });

  return node;
}

/**
 * Convenience helper to create an image element with lazy loading by default.
 * Usage: img(src, { alt: 'name', class: '...' })
 */
function img(src, attrs = {}) {
  const base = Object.assign({}, attrs);
  if (!("loading" in base)) base.loading = "lazy";
  if (!base.alt) base.alt = "";
  base.src = src;
  return el("img", base);
}

export { el, img };
