import Table from './AdminTable';
import AdminCollapsePanel from './AdminCollapsePanel';
import AdminPageHeading from './AdminPageHeading';
import { useEffect, useState } from 'react';
import { Card, Collapse, Typography } from '@douyinfe/semi-ui';
import source from '../../MODEL_OPERATIONS_GUIDE.md?raw';
import { parseOperationsGuide } from './model-operations-guide.mjs';
import './getting-started.css';

const [guide] = parseOperationsGuide(source);
const guideHref = id => `#/admin-2/getting-started?guide=${encodeURIComponent(id)}`;

function inline(text) {
  return text.split(/(`[^`]+`|\[[^\]]+\]\((?:#|https:\/\/)[^)]+\))/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('`')) return <Typography.Text key={index} code>{part.slice(1, -1)}</Typography.Text>;
    const link = part.match(/^\[([^\]]+)\]\((#[^)]+|https:\/\/[^)\s]+)\)$/);
    if (!link) return part;
    if (link[2].startsWith('https://')) return <Typography.Text key={index} link={{ href: link[2], target: '_blank', rel: 'noreferrer' }}>{link[1]}</Typography.Text>;
    const href = link[2].startsWith('#/admin-2/') ? link[2] : guideHref(link[2].slice(1));
    return <Typography.Text key={index} link={{ href }}>{link[1]}</Typography.Text>;
  });
}

function Blocks({ blocks }) {
  return blocks.map((block, index) => {
    if (block.type === 'anchor') return <span key={index} id={block.id} className="gs-anchor" tabIndex={-1}/>;
    if (block.type === 'table') {
      const columns = block.headings.map((heading, column) => ({
        key: column, title: inline(heading), render: (_, row) => inline(row.cells[column] ?? ''),
      }));
      const rows = block.rows.map((cells, id) => ({ id, cells }));
      return <Table size="small" key={index} columns={columns} dataSource={rows} rowKey="id" pagination={false}/>;
    }
    if (block.type === 'list') {
      const Tag = block.ordered ? 'ol' : 'ul';
      return <Tag key={index} start={block.ordered ? block.start : undefined}>
        {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
      </Tag>;
    }
    return <Typography.Paragraph key={index}>{inline(block.text)}</Typography.Paragraph>;
  });
}

function GuideTasks({ tasks, guideId }) {
  const linkedTask = tasks.find(task => task.id === guideId);
  const [openTasks, setOpenTasks] = useState(() => linkedTask ? [linkedTask.id] : []);
  useEffect(() => {
    if (linkedTask) setOpenTasks(current => current.includes(linkedTask.id) ? current : [...current, linkedTask.id]);
  }, [linkedTask]);
  return <Collapse activeKey={openTasks} onChange={setOpenTasks} className="gs-tasks">
    {tasks.map(task => <AdminCollapsePanel key={task.id} itemKey={task.id} header={<Typography.Text id={task.id} strong>{task.title}</Typography.Text>}>
      <div className="gs-copy"><Blocks blocks={task.blocks}/></div>
    </AdminCollapsePanel>)}
  </Collapse>;
}

export default function GettingStarted({ guideId }) {
  useEffect(() => {
    if (!guideId) return;
    const target = document.getElementById(guideId);
    const focus = target?.closest('[role="button"]') ?? target;
    focus?.scrollIntoView({ block: 'start' });
    focus?.focus({ preventScroll: true });
  }, [guideId]);
  return (
    <article id={guide.id} className="getting-started admin-page-stack" tabIndex={-1}>
      <AdminPageHeading title={guide.title}/>
      <Card>
        <div className="gs-copy"><Blocks blocks={guide.blocks}/></div>
        <GuideTasks tasks={guide.tasks} guideId={guideId}/>
      </Card>
    </article>
  );
}
