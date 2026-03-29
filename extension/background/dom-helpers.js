/**
 * Pure functions generating injectable JS code strings for DOM operations.
 * No browser API dependency - fully testable in Node.js.
 *
 * Plain function declarations: global in browser background, importable via test wrapper.
 */

/* eslint-disable no-unused-vars */

function escapeSelector(selector) {
  return JSON.stringify(selector)
}

function buildWaitAndAct(selector, timeout, actionCode) {
  const escaped = escapeSelector(selector)
  return `
    (() => {
      const timeout = ${timeout};
      const start = Date.now();
      const poll = (resolve) => {
        const el = document.querySelector(${escaped});
        if (el) {
          ${actionCode}
        }
        if (Date.now() - start > timeout)
          return resolve({ok: false, error: 'Timeout (' + timeout + 'ms) waiting for ' + ${escaped}});
        setTimeout(() => poll(resolve), 100);
      };
      return new Promise(poll);
    })()
  `
}

function buildWaitFor(selector, timeout, visible) {
  const escaped = escapeSelector(selector)
  const visCheck = visible ? ' && el.offsetWidth > 0 && el.offsetHeight > 0' : ''
  return `
    (() => {
      const start = Date.now();
      const poll = (resolve) => {
        const el = document.querySelector(${escaped});
        if (el${visCheck})
          return resolve({ok:true, tag:el.tagName, id:el.id, className:el.className,
            text:(el.textContent||'').slice(0,200), value:el.value,
            rect:el.getBoundingClientRect().toJSON()});
        if (Date.now() - start > ${timeout})
          return resolve({ok:false, error:'Timeout (${timeout}ms) waiting for '+${escaped}});
        setTimeout(() => poll(resolve), 100);
      };
      return new Promise(poll);
    })()
  `
}

function buildClickAction() {
  return 'el.click(); return resolve({ok:true, tag:el.tagName, id:el.id})'
}

function buildDblclickAction() {
  return `el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); return resolve({ok:true, tag:el.tagName, id:el.id})`
}

function buildFillAction(value) {
  const escaped = JSON.stringify(value)
  return `
    const nativeSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el).constructor === HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if (nativeSetter) nativeSetter.call(el, ${escaped});
    else el.value = ${escaped};
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return resolve({ok:true, tag:el.tagName, id:el.id})
  `
}

function buildTypeAction(text) {
  const escaped = JSON.stringify(text)
  return `
    el.focus();
    for (const ch of ${escaped}) {
      el.dispatchEvent(new KeyboardEvent('keydown',{key:ch,bubbles:true}));
      el.dispatchEvent(new KeyboardEvent('keypress',{key:ch,bubbles:true}));
      el.value += ch;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new KeyboardEvent('keyup',{key:ch,bubbles:true}));
    }
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return resolve({ok:true, tag:el.tagName, id:el.id})
  `
}

function buildSelectAction(value) {
  const escaped = JSON.stringify(value)
  return `
    el.value = ${escaped};
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return resolve({ok:true, tag:el.tagName, id:el.id})
  `
}

function buildCheckAction(checked) {
  return `
    el.checked = ${checked};
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return resolve({ok:true, tag:el.tagName, id:el.id, checked:el.checked})
  `
}

function buildHoverAction() {
  return `
    el.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));
    el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    return resolve({ok:true, tag:el.tagName, id:el.id})
  `
}

function buildQueryAction() {
  return `return resolve({ok:true, tag:el.tagName, id:el.id, className:el.className,
    text:(el.textContent||'').slice(0,200), value:el.value, href:el.href,
    rect:el.getBoundingClientRect().toJSON(),
    visible:el.offsetWidth>0&&el.offsetHeight>0, checked:el.checked})`
}

function buildQueryAllCode(selector) {
  const escaped = escapeSelector(selector)
  return `
    Array.from(document.querySelectorAll(${escaped})).map(el => ({
      tag:el.tagName, id:el.id, className:el.className,
      text:(el.textContent||'').slice(0,200), value:el.value, href:el.href,
      rect:el.getBoundingClientRect().toJSON(),
      visible:el.offsetWidth>0&&el.offsetHeight>0, checked:el.checked
    }))
  `
}

function buildSnapshotAction(selector) {
  const rootExpr = selector
    ? `document.querySelector(${escapeSelector(selector)})`
    : 'document.body||document.documentElement'
  return `
    (() => {
      const root = ${rootExpr};
      if (!root) return {ok:false, error:'Element not found'};
      const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','CANVAS','VIDEO','AUDIO','IFRAME','OBJECT','EMBED']);
      const parts = [];
      if (!${!!selector}) {
        if (document.title) parts.push('# '+document.title);
        parts.push('URL: '+location.href, '');
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const el = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          if (SKIP.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          if (el.offsetParent===null && el.tagName!=='BODY') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent.trim();
        if (t) parts.push(t);
      }
      return parts.join('\\n');
    })()
  `
}

// Node.js ESM export support (no-op in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeSelector, buildWaitAndAct, buildWaitFor, buildClickAction,
    buildDblclickAction, buildFillAction, buildTypeAction, buildSelectAction,
    buildCheckAction, buildHoverAction, buildQueryAction, buildQueryAllCode,
    buildSnapshotAction,
  }
}
