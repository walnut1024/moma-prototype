import { BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import source from '../../MODEL_OPERATIONS_GUIDE.md?raw';
import workflow from '../../guide-assets/workflow.svg';
import mapping from '../../guide-assets/mapping.svg';
import { parseOperationsGuide } from './model-operations-guide.mjs';
import './getting-started.css';

const sections = parseOperationsGuide(source);
const pictures = { 'guide-assets/workflow.svg': workflow, 'guide-assets/mapping.svg': mapping };

function jump(event, id) {
  event.preventDefault();
  const target = document.getElementById(id);
  if (!target) return;
  const details = target.closest('details');
  if (details) details.open = true;
  target.scrollIntoView({ block: 'start' });
  (details?.querySelector('summary') || target).focus({ preventScroll: true });
}

function inline(text) {
  return text.split(/(`[^`]+`|\[[^\]]+\]\(#[^)]+\))/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(#([^)]+)\)$/);
    return link ? <a key={i} href={`#${link[2]}`} onClick={event => jump(event, link[2])}>{link[1]}</a> : part;
  });
}

function Blocks({ blocks }) {
  return blocks.map((block, index) => {
    if (block.type === 'anchor') return <span key={index} id={block.id} className="gs-anchor" tabIndex={-1}/>;
    if (block.type === 'image') return <figure key={index}><img src={pictures[block.source]} alt={block.alt}/></figure>;
    if (block.type === 'table') return <div key={index} className="gs-table-scroll"><table><thead><tr>{block.headings.map((cell, i) => <th key={i} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
    if (block.type === 'list') {
      const Tag = block.ordered ? 'ol' : 'ul';
      return <Tag key={index} start={block.ordered ? block.start : undefined}>{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</Tag>;
    }
    return <p key={index}>{inline(block.text)}</p>;
  });
}

export default function GettingStarted() {
  return <article className="getting-started">
    <div className="gs-heading"><div><h1><BookOpen aria-hidden="true"/>模型运营</h1><p>首次上架按步骤操作，已有模型直接查找维护任务。</p><p>部分日常维护和退出操作将陆续完善。</p></div><Button asChild variant="outline"><a href="#/admin-2/listing?perspective=models">打开模型服务<ArrowRight aria-hidden="true"/></a></Button></div>
    <nav className="gs-section-nav" aria-label="指南章节">{sections.map(section => <a key={section.id} href={`#${section.id}`} onClick={event => jump(event, section.id)}>{section.title}</a>)}</nav>
    {sections.map(section => <section key={section.id} className="gs-panel" aria-labelledby={section.id}>
      <h2 id={section.id} tabIndex={-1}>{section.title}</h2>
      <div className="gs-copy"><Blocks blocks={section.blocks}/></div>
      {section.tasks.length > 0 && <div className="gs-tasks">{section.tasks.map(task => <details key={task.id} id={task.id}><summary><h3>{task.title}</h3></summary><div className="gs-copy"><Blocks blocks={task.blocks}/></div></details>)}</div>}
    </section>)}
  </article>;
}
