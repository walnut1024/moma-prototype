const mappingLine = /^( *)(?:([A-Za-z0-9_.-]+)|"([^"\\]+)"|'([^']+)'):(?=\s|$)(.*)$/;
const insignificantLine = /^(?:\s*(?:#.*)?|(?:---|\.\.\.)(?:\s+#.*)?)$/;
const emptyMappingValue = /^(?:\s|&[A-Za-z0-9_-]+)*(?:#.*)?$/;
const versionKey = /^[A-Za-z0-9._-]+$/;
const leadingSpaces = line => line.match(/^ */)[0].length;

function mappingFromLine(line) {
  const fields = line.match(mappingLine);
  return fields ? { indent: fields[1].length, key: fields[2] || fields[3] || fields[4], value: fields[5] } : null;
}

function parentMappings(lines, lineIndex, indentation) {
  const parents = [];
  let threshold = indentation;
  for (let index = lineIndex - 1; index >= 0 && threshold > 0; index--) {
    const line = lines[index];
    if (insignificantLine.test(line)) continue;
    const indent = leadingSpaces(line);
    if (indent >= threshold) continue;
    const field = mappingFromLine(line);
    if (!field || !emptyMappingValue.test(field.value)) return null;
    parents.unshift({ ...field, index });
    threshold = indent;
  }
  return threshold === 0 ? parents : null;
}

function fieldsAtPosition(schema, parents) {
  if (!parents) return [];
  if (!parents.length) return schema.fields;
  if (parents.length !== 2 || !versionKey.test(parents[1].key)) return [];
  if (parents[0].key === 'version_configs') return schema.versionFields;
  if (parents[0].key === 'built_in_version_configs') return schema.managedVersionFields;
  return [];
}

function siblingKeys(lines, lineIndex, indent, parent) {
  const keys = new Set();
  for (let index = (parent?.index ?? -1) + 1; index < lines.length; index++) {
    if (index === lineIndex || insignificantLine.test(lines[index])) continue;
    const currentIndent = leadingSpaces(lines[index]);
    if (parent && currentIndent <= parent.indent) break;
    const field = currentIndent === indent ? mappingFromLine(lines[index]) : null;
    if (field) keys.add(field.key);
  }
  return keys;
}

function valueCompletion(line, column, lineStart, fields) {
  const mapping = mappingFromLine(line);
  const field = fields.find(field => field.key === mapping?.key);
  if (!field?.values?.length) return null;
  const valueStart = line.length - mapping.value.length;
  const match = mapping.value.match(/^( *)([A-Za-z]*)(?:\s*(?:#.*)?)$/);
  if (!match) return null;
  const start = valueStart + match[1].length;
  const end = start + match[2].length;
  if (column < start || column > end || (line[column] === '#' && column === valueStart)) return null;
  return {
    start: lineStart + start, end: lineStart + end,
    options: field.values.map(String).filter(value => value.startsWith(line.slice(start, column)) && value !== match[2])
      .map(value => ({ label: value, insert: (start === valueStart ? ' ' : '') + value })),
  };
}

export function backendYamlCompletion(content, caret, schema, { explicit = false } = {}) {
  if (content.length > 128 * 1024) return null;
  const lineStart = caret > 0 ? content.lastIndexOf('\n', caret - 1) + 1 : 0;
  const before = content.slice(0, lineStart).split('\n');
  const lineIndex = before.length - 1;
  const lines = before.slice(0, -1).concat(content.slice(lineStart).split('\n'));
  const line = lines[lineIndex];
  const column = caret - lineStart;
  const indent = leadingSpaces(line);
  const parents = parentMappings(lines, lineIndex, indent);
  const fields = fieldsAtPosition(schema, parents);
  if (!fields.length) return null;
  const literal = valueCompletion(line, column, lineStart, fields);
  if (literal) return literal.options.length ? { ...literal, caret } : null;

  const token = line.slice(indent).match(/^([A-Za-z0-9_.-]*)(?:\s*:(?=\s|$)|\s*(?:#|$))/);
  const length = token?.[1].length ?? 0;
  if (!token || column < indent || column > indent + length || (!length && !explicit && !indent)) return null;
  if (!length && line.slice(indent).startsWith('#')) return null;
  const existing = siblingKeys(lines, lineIndex, indent, parents?.at(-1));
  const suffix = line.slice(indent + length);
  const separator = /^\s*:/.test(suffix) ? '' : ': ';
  const options = fields.filter(({ key }) => !existing.has(key) && (key !== token[1] || separator) && key.startsWith(line.slice(indent, column)))
    .map(({ key, type }) => ({ label: key, type, insert: key + separator }));
  return options.length ? { start: lineStart + indent, end: lineStart + indent + length, caret, options } : null;
}

export function backendYamlNewline(content, caret) {
  const prefix = content.slice(caret > 0 ? content.lastIndexOf('\n', caret - 1) + 1 : 0, caret);
  const indent = prefix.match(/^ */)[0];
  const mapping = mappingFromLine(prefix);
  return `\n${indent}${mapping && !mapping.value.trim() ? '  ' : ''}`;
}

const closingPairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };

export function backendYamlPair(content, start, end, key) {
  const close = Object.hasOwn(closingPairs, key) ? closingPairs[key] : null;
  if (!close || (start === end && /\S/.test(content[end] || '') && !/[\]})#,]/.test(content[end]))) return null;
  if (start === end && key === close && /[\w'"]/.test(content[start - 1] || '')) return null;
  const selected = content.slice(start, end);
  return { insert: key + selected + close, selection: [start + 1, end + 1] };
}
