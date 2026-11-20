import { useId, useMemo, useState } from 'react';
import { Button, Space } from '@douyinfe/semi-ui';
import { IconChevronDown, IconChevronRight } from '@douyinfe/semi-icons';
import { jsonDocument } from './json-document.mjs';
import './json-document.css';

function JsonNode({ node, collapsed, toggle, id }) {
  const folded = collapsed.has(node.key), childrenId = `${id}-${encodeURIComponent(node.key)}`;
  const style = { '--json-depth': node.depth };
  return <>
    <div className="model-json-line" style={style}>
      <span className="model-json-disclosure">{node.children && <Button size="small" theme="borderless" type="tertiary"
        icon={folded ? <IconChevronRight/> : <IconChevronDown/>}
        aria-label={`${folded ? '展开' : '收起'} ${node.location}`} aria-expanded={!folded} aria-controls={folded ? undefined : childrenId}
        onClick={() => toggle(node.key)}/>}</span>
      <span className="model-json-text">{node.children ? <>{node.prefix}{node.open}{folded && <>…{node.close}{node.comma ? ',' : ''}<span className="model-json-count">（{node.children.length} {node.open === '[' ? '项' : '个字段'}）</span></>}</> : node.text}</span>
    </div>
    {node.children && !folded && <div id={childrenId}>
      {node.children.map(child => <JsonNode key={child.key} node={child} collapsed={collapsed} toggle={toggle} id={id}/>)}
      <div className="model-json-line" style={style}><span className="model-json-disclosure"/><span className="model-json-text">{node.close}{node.comma ? ',' : ''}</span></div>
    </div>}
  </>;
}

export default function JsonDocument({ text, label = '模型运营维护 JSON', actions }) {
  const document = useMemo(() => jsonDocument(JSON.parse(text)), [text]);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const id = useId();
  const toggle = key => setCollapsed(previous => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return <div className="model-resource-document" role="region" aria-label={label}>
    <Space className="model-json-toolbar" wrap>
      <Button size="small" disabled={!collapsed.size} onClick={() => setCollapsed(new Set())}>全部展开</Button>
      <Button size="small" disabled={collapsed.size === document.containerKeys.length} onClick={() => setCollapsed(new Set(document.containerKeys))}>全部收起</Button>
      {actions}
    </Space>
    <JsonNode node={document.root} collapsed={collapsed} toggle={toggle} id={id}/>
  </div>;
}
