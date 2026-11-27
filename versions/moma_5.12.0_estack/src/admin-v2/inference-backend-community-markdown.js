export function communityProjectUrl(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
}

const inlineMarkup = /`([^`\r\n]+)`|(?<![^\s(])(https?:\/\/[^\s<>"'`]+)/gi;

function parseInline(text) {
  const tokens = [];
  let start = 0;
  for (const match of text.matchAll(inlineMarkup)) {
    const [raw, code, link] = match;
    const label = link?.replace(/[).,;!?]+$/, '');
    const href = communityProjectUrl(label);
    if (!code && !href) continue;
    if (match.index > start) tokens.push({ type: 'text', text: text.slice(start, match.index) });
    tokens.push(code ? { type: 'code', text: code } : { type: 'link', text: label, href });
    start = match.index + (code ? raw.length : label.length);
  }
  if (start < text.length) tokens.push({ type: 'text', text: text.slice(start) });
  return tokens;
}

// The packaged market descriptions use paragraphs, unordered lists, inline code, and bare links.
export function parseCommunityMarkdown(description) {
  const blocks = [];
  let current;
  for (const line of description.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) {
      current = undefined;
      continue;
    }
    const type = text.startsWith('- ') ? 'list' : 'paragraph';
    if (current?.type !== type) {
      current = { type, lines: [] };
      blocks.push(current);
    }
    current.lines.push(type === 'list' ? text.slice(2) : text);
  }
  return blocks.map(({ type, lines }) => type === 'list'
    ? { type, items: lines.map(parseInline) } : { type, content: parseInline(lines.join(' ')) });
}
