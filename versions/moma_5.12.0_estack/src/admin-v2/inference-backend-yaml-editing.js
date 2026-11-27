import { JSON_SCHEMA, load } from 'js-yaml';

const keyPattern = String.raw`(?:[A-Za-z0-9._-]+|"(?:\\.|[^"\\])*"|'(?:''|[^'])*')`;
const blockMapping = new RegExp(String.raw`^( *)(- +)?(${keyPattern})[ \t]*:(?=[ \t]|$)[ \t]*(.*)$`);
const blockScalar = /^(?:(?:[&!][^ \t]+)[ \t]+)*[>|](?:[1-9][+-]?|[+-][1-9]?)?(?:\s+#.*)?\s*$/;
const colorTokens = new RegExp(String.raw`"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|(?<!\S)#.*|${keyPattern}(?=\s*:(?:\s|$))|(?:[&*!][^\s,\]}]+)|[-+]?\b(?:\d+(?:\.\d+)?(?:e[+-]?\d+)?|0x[\da-f]+|0o[0-7]+)\b|\b(?:true|false|null)\b|[\[\]{},]|[-?:](?=\s|$)|[>|](?:[+-]?\d?|\d?[+-]?)|^%.*|^---$|^\.\.\.$|(?<!\S)~(?=\s|$)`, 'gi');
const documentMarker = /^(?:---|\.\.\.)(?:\s*#.*)?$/;

function quoteEnd(line, quote, start) {
  for (let index = start; index < line.length; index++) {
    if (quote === '"' && line[index] === '\\') { index++; continue; }
    if (line[index] !== quote) continue;
    if (quote === "'" && line[index + 1] === quote) { index++; continue; }
    return index;
  }
  return -1;
}

function scanYamlLines(content) {
  let scalarIndent = null;
  let quote = null;
  return content.split('\n').map(line => {
    const stripped = line.trim();
    const indent = line.match(/^ */)[0].length;
    if (scalarIndent != null) {
      if (!stripped || indent > scalarIndent) return { line, protectedLength: line.length, multiline: true };
      scalarIndent = null;
    }
    if (quote) {
      const end = quoteEnd(line, quote, 0);
      if (end >= 0) quote = null;
      return { line, protectedLength: end < 0 ? line.length : end + 1, multiline: true };
    }
    const mapping = line.match(blockMapping);
    const rawScalar = mapping ? mapping[4] : (stripped.startsWith('- ') ? stripped.slice(2).trimStart() : '');
    const scalar = rawScalar.trimStart();
    if (blockScalar.test(scalar)) {
      scalarIndent = indent + (mapping?.[2]?.length || 0);
      return { line, mapping, indent, multiline: true };
    }
    if (/^['"]/.test(scalar) && quoteEnd(scalar, scalar[0], 1) < 0) {
      quote = scalar[0];
      const quoteStart = line.length - scalar.length;
      return { line, mapping, indent, multiline: true, quoteStart };
    }
    return { line, mapping, indent };
  });
}

function syntaxTone(line, token, end) {
  if (token.startsWith('#')) return 'comment';
  if (/^\s*:(?=\s|$)/.test(line.slice(end)) && !/^[-?:]$/.test(token)) return 'key';
  if (/^['"]/.test(token)) return 'string';
  if (/^(true|false|null|~)$/i.test(token)) return 'keyword';
  if (/^[-+]?\d/.test(token)) return 'number';
  if (/^[&*!%]/.test(token)) return 'marker';
  return 'punctuation';
}

export function backendYamlSyntax(content) {
  return scanYamlLines(content).flatMap(({ line, protectedLength, quoteStart }, index) => {
    const tokens = [];
    if (index > 0) tokens.push(['\n']);
    let offset = protectedLength || 0;
    if (offset) tokens.push([line.slice(0, offset), 'string']);
    for (const match of line.matchAll(colorTokens)) {
      const end = match.index + match[0].length;
      if (match.index < offset || quoteStart != null && match.index >= quoteStart) continue;
      if (match.index > offset) tokens.push([line.slice(offset, match.index)]);
      tokens.push([match[0], syntaxTone(line, match[0], end)]);
      offset = end;
    }
    if (quoteStart != null && offset < quoteStart) {
      tokens.push([line.slice(offset, quoteStart)]);
      offset = quoteStart;
    }
    if (offset < line.length) tokens.push([line.slice(offset), quoteStart != null ? 'string' : undefined]);
    return tokens;
  });
}

function equivalentYaml(before, after) {
  const beforeAliases = new Map();
  const afterAliases = new Set();
  const pending = [[before, after]];
  while (pending.length) {
    const [left, right] = pending.pop();
    if (Object.is(left, right)) continue;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
    if (beforeAliases.has(left)) {
      if (beforeAliases.get(left) !== right) return false;
      continue;
    }
    if (afterAliases.has(right)) return false;
    beforeAliases.set(left, right);
    afterAliases.add(right);
    const keys = Object.keys(left);
    const candidateKeys = Object.keys(right);
    if (keys.length !== candidateKeys.length || keys.some((key, index) => key !== candidateKeys[index])) return false;
    for (const key of keys) pending.push([left[key], right[key]]);
  }
  return true;
}

export function formatBackendYaml(content) {
  if (content.length > 512 * 1024) throw Error('YAML 太长，无法格式化。');
  const before = load(content, { schema: JSON_SCHEMA });
  const lines = scanYamlLines(content);
  // Only reindent simple mappings. Keep block scalars, sequences and flow continuations where the author put them.
  const canReindent = lines.every(({ line, mapping, multiline }) =>
    !multiline && (mapping && !mapping[2] || !line.trim() || line.trimStart().startsWith('#') || documentMarker.test(line)));
  const levels = [];
  const formatted = lines.map(({ line, mapping, indent }) => {
    if (!mapping) return line;
    const [, leading, sequence = '', key, value] = mapping;
    let padding = leading;
    if (canReindent) {
      while (levels.length && levels.at(-1) > indent) levels.pop();
      if (levels.at(-1) !== indent) levels.push(indent);
      padding = '  '.repeat(levels.length - 1);
    }
    return `${padding}${sequence ? '- ' : ''}${key}:${value ? ` ${value}` : ''}`;
  }).join('\n');
  if (formatted === content) return content;
  let after;
  try { after = load(formatted, { schema: JSON_SCHEMA }); }
  catch { throw Error('无法安全格式化此 YAML，已保留原文。'); }
  if (!equivalentYaml(before, after)) throw Error('无法安全格式化此 YAML，已保留原文。');
  return formatted;
}
