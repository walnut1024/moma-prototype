import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

const canonical = fileURLToPath(new URL('../../prd/MoMA模型服务平台政企标准版-模型运营需求文档.md', import.meta.url));
const snapshot = fileURLToPath(new URL('../versions/moma_5.12.0_estack/server/.private/model-operations-requirements.md', import.meta.url));

const styles = `
  :root { font: 15px/1.75 system-ui, sans-serif; }
  body { margin: 0; color: #22252b; background: #fff; overflow-wrap: anywhere; }
  main { max-width: 1040px; margin: auto; padding: 24px clamp(16px, 4vw, 40px) 56px; }
  h1, h2, h3, h4, h5, h6 { color: inherit; line-height: 1.4; scroll-margin-top: 12px; }
  h1 { margin: 0 0 20px; font-size: clamp(22px, 3vw, 30px); }
  h2 { margin-top: 2rem; border-bottom: 1px solid #dce0e6; padding-bottom: .375rem; }
  h3, h4, h5, h6 { margin-top: 1.5rem; font-size: 1.05rem; }
  ul, ol { padding-left: 1.6em; }
  a { color: #065bc9; text-underline-offset: .21em; }
  :focus-visible { outline: 2px solid #2581fb; outline-offset: 3px; }
  :target { text-decoration: underline; text-underline-offset: .21em; }
  .table-scroll { overflow-x: auto; margin: 1rem 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #dce0e6; padding: 7px 10px; vertical-align: top; text-align: left; }
  th, code, pre { background: #f3f5f8; }
  code, pre { border-radius: 4px; }
  code { padding: .05em .25em; }
  pre { padding: 12px; overflow-x: auto; }
  blockquote { margin: 1em 0; border-left: 3px solid #a7b4c5; padding-left: 1em; }
`;

function headingSlug(html) {
  return html.replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '')
    .replace(/\s/g, '-');
}

export function renderModelOperationsRequirements(markdown) {
  const anchors = new Set();
  const body = micromark(markdown, { extensions: [gfm()], htmlExtensions: [gfmHtml()] })
    .replace(/<h([1-6])>([^\n]*?)<\/h\1>/g, (heading, rank, content) => {
      const base = headingSlug(content);
      if (!base) return heading;
      let id = base;
      for (let index = 1; anchors.has(id); index++) id = base + '-' + index;
      anchors.add(id);
      return '<h' + rank + ' id="' + id + '">' + content + '</h' + rank + '>';
    })
    .replace(/^<p>&lt;a id=&quot;(req-(3\.1(?:\.\d+){3}-\d+))&quot;&gt;&lt;\/a&gt;<\/p>\n<p>(?=<strong>\2 「)/gm, (_, id) => {
      if (anchors.has(id)) throw Error('需求文档包含重复的需求锚点');
      anchors.add(id);
      return '<p id="' + id + '">';
    })
    .replace(/<a href="#([^"]+)"/g, (_, fragment) => {
      if (!anchors.has(decodeURIComponent(fragment))) throw Error('需求文档包含无法定位的章节链接');
      return '<a href="about:srcdoc#' + fragment + '"';
    })
    .replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"')
    .replaceAll('<table>', '<div class="table-scroll" tabindex="0" role="region" aria-label="文档表格"><table>')
    .replaceAll('</table>', '</table></div>');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>模型运营需求文档</title>
<style>${styles}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export async function loadModelOperationsRequirements() {
  const override = process.env.MOMA_REQUIREMENTS_SOURCE;
  const candidates = override ? [resolve(override)] : [canonical, snapshot];
  for (const source of candidates) {
    try {
      const markdown = await readFile(source, 'utf8');
      if (!markdown.trim()) throw Error('模型运营需求文档为空');
      return { html: renderModelOperationsRequirements(markdown), source };
    } catch (error) {
      if (override || error.code !== 'ENOENT') throw error;
    }
  }
  return { html: '', source: null };
}
