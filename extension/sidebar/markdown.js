/**
 * FoxCode - Markdown renderer for sidebar messages.
 * Converts a subset of markdown to HTML. Pure function, no DOM dependencies.
 */

/**
 * Convert a subset of Markdown to HTML.
 * Processing order matters: code blocks are replaced first to prevent
 * inline formatting (bold, italic, links) from being applied inside them.
 * @param {string} text - Raw markdown text
 * @returns {string} HTML string
 */
// eslint-disable-next-line no-unused-vars
function renderMarkdown(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre><code>${code.trimEnd()}</code></pre>`)

  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
  html = html.replace(/<\/ul>\s*<ul>/g, '')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`
  html = html.replace(/<p>\s*<\/p>/g, '')
  html = html.replace(/<p>(<(?:pre|h[1-3]|ul|blockquote))/g, '$1')
  html = html.replace(/(<\/(?:pre|h[1-3]|ul|blockquote)>)<\/p>/g, '$1')

  return html
}

// Export for Node.js test runner, no-op in browser
if (typeof module !== 'undefined') module.exports = { renderMarkdown }
