export function parseDelimitedCells(text) {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = source.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell) quoted = !quoted;
      else cell += c;
    } else if (!quoted && (c === delimiter || c === "\n" || c === "\r")) {
      row.push(cell); cell = "";
      if (c !== delimiter) { rows.push(row); row = []; if (c === "\r" && source[i + 1] === "\n") i++; }
    } else cell += c;
  }
  if (quoted) throw new Error("引号未闭合，请检查文件或粘贴内容");
  row.push(cell); rows.push(row);
  return rows;
}
