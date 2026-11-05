// The guide uses this small, local Markdown subset; no HTML is executed.
export function parseOperationsGuide(source) {
  const lines = source.split(/\r?\n/), blocks = [];
  const anchor = line => line.match(/^<a id="([a-z0-9-]+)"><\/a>$/);
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || line.startsWith('>') || line.startsWith('# ')) { index++; continue; }
    const id = anchor(line), heading = line.match(/^(#{2,3}) (.+)$/), picture = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (id) { blocks.push({ type: 'anchor', id: id[1] }); index++; }
    else if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); index++; }
    else if (picture) { blocks.push({ type: 'image', alt: picture[1], source: picture[2] }); index++; }
    else if (line.startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(cells(lines[index++]));
      blocks.push({ type: 'table', headings: rows[0], rows: rows.slice(1).filter(row => !row.every(cell => /^:?-+:?$/.test(cell))) });
    } else if (/^\d+\. /.test(line) || line.startsWith('- ')) {
      const ordered = /^\d/.test(line), items = [], start = ordered ? Number(line.match(/^\d+/)[0]) : undefined;
      const pattern = ordered ? /^\d+\. (.+)$/ : /^- (.+)$/;
      while (index < lines.length && pattern.test(lines[index].trim())) items.push(lines[index++].trim().match(pattern)[1]);
      blocks.push({ type: 'list', ordered, start, items });
    } else {
      const text = [line]; index++;
      while (index < lines.length && lines[index].trim() && !/^(?:#{1,3} |<a |!\[|\||\d+\. |- |>)/.test(lines[index].trim())) text.push(lines[index++].trim());
      blocks.push({ type: 'paragraph', text: text.join(' ') });
    }
  }
  const sections = [];
  let section, task, pendingId;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'anchor' && blocks[i + 1]?.type === 'heading') { pendingId = block.id; continue; }
    if (block.type === 'heading' && block.level === 2) {
      section = { id: pendingId || `guide-section-${sections.length}`, title: block.text, blocks: [], tasks: [] };
      sections.push(section); task = null; pendingId = null;
    } else if (block.type === 'heading') {
      task = { id: pendingId || `guide-task-${section.tasks.length}-${sections.length}`, title: block.text, blocks: [] };
      section.tasks.push(task); pendingId = null;
    } else if (section) (task || section).blocks.push(block);
  }
  return sections;
}
