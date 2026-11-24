import { strToU8, zipSync } from 'fflate';

const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const officeRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const xml = '<?xml version="1.0" encoding="UTF-8"?>';

const xmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\r': '&#13;' };
// eslint-disable-next-line no-control-regex -- XML 1.0 permits only tab, line feed and carriage return among control characters below U+0020.
const invalidXml = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
const encodeText = value => value
  .replace(invalidXml, '')
  .replace(/_[xX][\da-fA-F]{4}_/g, match => '_x005F_' + match.slice(1))
  .replace(/[&<>"'\r]/g, character => xmlEntities[character]);

function columnName(index) {
  let name = '';
  for (let column = index + 1; column > 0; column = Math.floor((column - 1) / 26)) {
    name = String.fromCharCode(65 + (column - 1) % 26) + name;
  }
  return name;
}

function cellXml(value, address) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${address}"><v>${value}</v></c>` : '';
  if (typeof value === 'boolean') return `<c r="${address}" t="b"><v>${Number(value)}</v></c>`;
  // Inline string cells keep user-supplied identifiers and formula-like text literal.
  return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${encodeText(String(value))}</t></is></c>`;
}

export function callLogWorkbook(rows, sheetName) {
  const sheetRows = rows.map((row, index) => {
    const rowNumber = index + 1;
    const cells = row.map((value, column) => cellXml(value, columnName(column) + rowNumber)).join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');

  return zipSync({
    '[Content_Types].xml': strToU8(`${xml}
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`),
    '_rels/.rels': strToU8(`${xml}
      <Relationships xmlns="${packageRel}">
        <Relationship Id="rId1" Type="${officeRel}/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`),
    'xl/workbook.xml': strToU8(`${xml}
      <workbook xmlns="${spreadsheet}" xmlns:r="${officeRel}">
        <sheets><sheet name="${encodeText(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`${xml}
      <Relationships xmlns="${packageRel}">
        <Relationship Id="rId1" Type="${officeRel}/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`${xml}
      <worksheet xmlns="${spreadsheet}"><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}
