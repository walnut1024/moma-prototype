import { BookOpen, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../components/ui/button';
import source from '../../MODEL_OPERATIONS_GUIDE.md?raw';
import { findOperationsGuide, parseOperationsGuide } from './model-operations-guide.mjs';
import './getting-started.css';

const sections = parseOperationsGuide(source);
const guideHref = id => `#/admin-2/getting-started?guide=${encodeURIComponent(id)}`;

function inline(text) {
  return text.split(/(`[^`]+`|\[[^\]]+\]\(#[^)]+\))/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(#([^)]+)\)$/);
    return link ? <a key={i} href={guideHref(link[2])}>{link[1]}</a> : part;
  });
}

function Blocks({ blocks }) {
  return blocks.map((block, index) => {
    if (block.type === 'anchor') return <span key={index} id={block.id} className="gs-anchor" tabIndex={-1}/>;
    if (block.type === 'table') return <div key={index} className="gs-table-scroll"><table><thead><tr>{block.headings.map((cell, i) => <th key={i} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
    if (block.type === 'list') {
      const Tag = block.ordered ? 'ol' : 'ul';
      return <Tag key={index} start={block.ordered ? block.start : undefined}>{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</Tag>;
    }
    return <p key={index}>{inline(block.text)}</p>;
  });
}

export default function GettingStarted({ guideId }) {
  const section = findOperationsGuide(sections, guideId);
  useEffect(() => {
    if (!guideId) return;
    const target = document.getElementById(guideId) || document.getElementById(section.id);
    if (target?.tagName === 'DETAILS') target.open = true;
    (target?.tagName === 'DETAILS' ? target : target?.closest('article'))?.scrollIntoView({ block: 'start' });
    (target?.querySelector('summary') || target)?.focus({ preventScroll: true });
  }, [guideId, section.id]);
  return <article className="getting-started">
    <div className="gs-heading"><div><h1><BookOpen aria-hidden="true"/>模型运营</h1><p>按任务阅读：先接通模型，再开放使用；需要收费时再定价。</p></div><Button asChild variant="outline"><a href="#/admin-2/listing?perspective=models">打开模型服务<ArrowRight aria-hidden="true"/></a></Button></div>
    <nav className="gs-section-nav" aria-label="模型运营指导">{sections.map(guide => <a key={guide.id} href={guideHref(guide.id)} aria-current={section.id === guide.id ? 'page' : undefined}>{guide.title}</a>)}</nav>
    <section key={section.id} className="gs-panel" aria-labelledby={section.id}>
      <h2 id={section.id} tabIndex={-1}>{section.title}</h2>
      <div className="gs-copy"><Blocks blocks={section.blocks}/></div>
      {section.tasks.length > 0 && <div className="gs-tasks">{section.tasks.map(task => <details key={task.id} id={task.id}><summary><h3>{task.title}</h3></summary><div className="gs-copy"><Blocks blocks={task.blocks}/></div></details>)}</div>}
    </section>
  </article>;
}
