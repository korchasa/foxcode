const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { renderMarkdown } = require('./markdown.js')

describe('renderMarkdown', () => {
  it('escapes HTML entities', () => {
    const html = renderMarkdown('<script>alert("xss")</script>')
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;script&gt;'))
  })

  it('renders code blocks', () => {
    const html = renderMarkdown('```js\nconst x = 1\n```')
    assert.ok(html.includes('<pre><code>'))
    assert.ok(html.includes('const x = 1'))
  })

  it('renders inline code', () => {
    const html = renderMarkdown('use `npm install`')
    assert.ok(html.includes('<code>npm install</code>'))
  })

  it('renders bold', () => {
    const html = renderMarkdown('this is **bold** text')
    assert.ok(html.includes('<strong>bold</strong>'))
  })

  it('renders italic', () => {
    const html = renderMarkdown('this is *italic* text')
    assert.ok(html.includes('<em>italic</em>'))
  })

  it('does not confuse bold and italic', () => {
    const html = renderMarkdown('**bold** and *italic*')
    assert.ok(html.includes('<strong>bold</strong>'))
    assert.ok(html.includes('<em>italic</em>'))
  })

  it('renders headings', () => {
    assert.ok(renderMarkdown('# H1').includes('<h1>H1</h1>'))
    assert.ok(renderMarkdown('## H2').includes('<h2>H2</h2>'))
    assert.ok(renderMarkdown('### H3').includes('<h3>H3</h3>'))
  })

  it('renders blockquotes', () => {
    const html = renderMarkdown('> quoted text')
    assert.ok(html.includes('<blockquote>quoted text</blockquote>'))
  })

  it('renders list items', () => {
    const html = renderMarkdown('- item one\n- item two')
    assert.ok(html.includes('<ul>'))
    assert.ok(html.includes('<li>item one</li>'))
    assert.ok(html.includes('<li>item two</li>'))
  })

  it('renders links with target="_blank"', () => {
    const html = renderMarkdown('[click](https://example.com)')
    assert.ok(html.includes('href="https://example.com"'))
    assert.ok(html.includes('target="_blank"'))
    assert.ok(html.includes('>click</a>'))
  })

  it('wraps text in paragraphs', () => {
    const html = renderMarkdown('first\n\nsecond')
    assert.ok(html.includes('<p>first</p>'))
    assert.ok(html.includes('<p>second</p>'))
  })

  it('handles plain text', () => {
    const html = renderMarkdown('just plain text')
    assert.equal(html, '<p>just plain text</p>')
  })

  it('does not double-escape HTML inside code blocks', () => {
    const html = renderMarkdown('```\na < b & c\n```')
    assert.ok(html.includes('a &lt; b &amp; c'))
    assert.ok(!html.includes('&amp;lt;'))
    assert.ok(!html.includes('&amp;amp;'))
  })

  it('merges consecutive list items into one <ul>', () => {
    const html = renderMarkdown('- a\n- b\n- c')
    const ulCount = (html.match(/<ul>/g) || []).length
    assert.equal(ulCount, 1, 'expected single <ul> wrapping all items')
  })

  it('does not wrap block elements in <p>', () => {
    const html = renderMarkdown('# Heading')
    assert.ok(!html.includes('<p><h1>'))
    assert.ok(!html.includes('</h1></p>'))
  })

  it('does not wrap <pre> in <p>', () => {
    const html = renderMarkdown('```\ncode\n```')
    assert.ok(!html.includes('<p><pre>'))
    assert.ok(!html.includes('</pre></p>'))
  })

  it('does not wrap <ul> in <p>', () => {
    const html = renderMarkdown('- one\n- two')
    assert.ok(!html.includes('<p><ul>'))
    assert.ok(!html.includes('</ul></p>'))
  })

  it('renders combined content correctly', () => {
    const input = '# Hello\n\nThis is **bold** and `code`.\n\n- one\n- two'
    const html = renderMarkdown(input)
    assert.ok(html.includes('<h1>Hello</h1>'))
    assert.ok(html.includes('<strong>bold</strong>'))
    assert.ok(html.includes('<code>code</code>'))
    assert.ok(html.includes('<li>one</li>'))
  })

  it('returns empty paragraph-free result for empty string', () => {
    const html = renderMarkdown('')
    assert.ok(!html.includes('<p></p>') || html === '<p></p>')
  })
})
