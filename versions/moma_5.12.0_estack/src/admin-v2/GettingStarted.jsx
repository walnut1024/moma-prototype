import Table from './AdminTable';
import AdminCollapsePanel from './AdminCollapsePanel';
import AdminPageHeading from './AdminPageHeading';
import { useEffect, useState } from 'react';
import { Card, Collapse, Space, Typography } from '@douyinfe/semi-ui';
import { IconArrowRight } from '@douyinfe/semi-icons';
import source from '../../MODEL_OPERATIONS_GUIDE.md?raw';
import { findOperationsGuide, parseOperationsGuide } from './model-operations-guide.mjs';
import './getting-started.css';

const sections = parseOperationsGuide(source);
const guideHref = id => `#/admin-2/getting-started?guide=${encodeURIComponent(id)}`;

function inline(text) {
  return text.split(/(`[^`]+`|\[[^\]]+\]\(#[^)]+\))/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('`')) return <Typography.Text key={index} code>{part.slice(1, -1)}</Typography.Text>;
    const link = part.match(/^\[([^\]]+)\]\(#([^)]+)\)$/);
    return link ? <Typography.Text key={index} link={{ href: guideHref(link[2]) }}>{link[1]}</Typography.Text> : part;
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
      return <Table size="small" key={index} columns={columns} dataSource={rows} rowKey="id" pagination={false} scroll={{ x: 'max(100%, 420px)' }}/>;
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
  const section = findOperationsGuide(sections, guideId);
  useEffect(() => {
    if (!guideId) return;
    const target = document.getElementById(guideId) || document.getElementById(section.id);
    const focus = target?.closest('[role="button"]') ?? target;
    focus?.scrollIntoView({ block: 'start' });
    focus?.focus({ preventScroll: true });
  }, [guideId, section.id]);
  return (
    <article className="getting-started admin-page-stack">
      <AdminPageHeading title="模型运营" description="按任务阅读：先接通模型，再开放使用；需要收费时再定价。">
        <Typography.Text link={{ href: '#/admin-2/listing?perspective=models' }}>
          <Space spacing={4}>打开模型服务<IconArrowRight aria-hidden="true"/></Space>
        </Typography.Text>
      </AdminPageHeading>
      <nav aria-label="模型运营指导">
        <Space wrap spacing={16}>
          {sections.map(guide => <Typography.Text key={guide.id} strong={section.id === guide.id}
            link={{ href: guideHref(guide.id), 'aria-current': section.id === guide.id ? 'page' : undefined }}>{guide.title}</Typography.Text>)}
        </Space>
      </nav>
      <section key={section.id} aria-labelledby={section.id}>
        <Card>
          <Typography.Title heading={4} component="h2" id={section.id} tabIndex={-1}>{section.title}</Typography.Title>
          <div className="gs-copy"><Blocks blocks={section.blocks}/></div>
          {section.tasks.length > 0 && <GuideTasks tasks={section.tasks} guideId={guideId}/>}
        </Card>
      </section>
    </article>
  );
}
