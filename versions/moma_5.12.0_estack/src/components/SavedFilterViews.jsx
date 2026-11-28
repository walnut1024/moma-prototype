import { workspaceStoragePrefix } from '../workspace-storage.mjs';
import { resourceId } from '../resource-id.mjs';
import * as Semi from '@douyinfe/semi-ui';
import { AdminModal as Modal } from '../admin-v2/AdminOverlay';
import { IconBookmark, IconChevronDown, IconDelete } from '@douyinfe/semi-icons';
import { Bookmark, ChevronDown, Trash2 } from 'lucide-react';
import { useCallback, useContext, useEffect, useState } from 'react';
import { AdminUIContext } from './admin-ui-context';
import { XaButton, XaInput, XaPopover, XaSpace, XaTag, XaTypography } from '../admin-v2/xa24/HaloComponents.jsx';
import { Form as HaloForm } from '../admin-v2/xa24/HaloForm.jsx';
import '../admin-v2/semi-analytics.css';
import './saved-filter-views.css';

const frontControls = { Button: Semi.Button, Form: Semi.Form, Input: Semi.Input, Space: Semi.Space,
  Tag: Semi.Tag, Typography: Semi.Typography, BookmarkIcon: IconBookmark, Down: IconChevronDown, Delete: IconDelete };
const adminControls = { Button: XaButton, Form: HaloForm, Input: XaInput, Space: XaSpace,
  Tag: XaTag, Typography: XaTypography, BookmarkIcon: Bookmark, Down: ChevronDown, Delete: Trash2 };

const signature = value => {
  const copy = { ...value };
  if (copy.preset && copy.preset !== 'custom' || copy.period && copy.period !== 'custom') delete copy.range;
  if (copy.period && copy.period !== 'custom' && copy.filters) { copy.filters = { ...copy.filters }; delete copy.filters.start; delete copy.filters.end; }
  if (['1', '7', '30'].includes(copy.range)) { delete copy.start; delete copy.end; }
  return JSON.stringify(copy);
};

function groupText(group) {
  if (!('items' in group)) return group.label ? `${group.label}：${group.text}` : group.text;
  if (group.items === null) return `${group.label}：${group.all || '全部'}`;
  if (!group.items.length) return `${group.label}：未选择`;
  if (group.items.length === 1) return `${group.label}：${group.items[0]}`;
  return `${group.label}：${group.items.length} 个 · ${group.items[0]} 等`;
}

function ViewsPopover({ children, position, visible, onVisibleChange, content }) {
  const admin = useContext(AdminUIContext);
  const [open, setOpen] = useState(false);
  const active = visible ?? open;
  const initialFocusRef = useCallback(node => {
    if (node && active) node.focus({ preventScroll: true });
  }, [active]);
  if (!admin) return <Semi.Popover trigger="click" position={position} visible={visible}
    onVisibleChange={onVisibleChange} content={content}>{children}</Semi.Popover>;
  return <XaPopover open={active} placement={position === 'bottomLeft' ? 'bottom-start' : 'bottom-end'}
    onChange={next => {
      if (visible == null) setOpen(next);
      onVisibleChange?.(next);
    }} content={typeof content === 'function' ? content({ initialFocusRef }) : content}>{children}</XaPopover>;
}

function FilterCondition({ group }) {
  const admin = useContext(AdminUIContext);
  const { Button, Input, Tag, Typography, Down } = admin ? adminControls : frontControls;
  const [query, setQuery] = useState('');
  const label = groupText(group);
  if (!Array.isArray(group.items) || group.items.length < 2) return <Tag title={label}>{label}</Tag>;
  const visible = group.items.filter(item => item.toLowerCase().includes(query.trim().toLowerCase()));
  return <ViewsPopover position="bottomLeft" onVisibleChange={open => { if (open) setQuery(''); }}
    content={<div className="admin-analytics-picker admin-analytics-fields">
      <Typography.Text strong>已选{group.label}（{group.items.length}）</Typography.Text>
      {group.items.length > 5 && <Input aria-label={`搜索已选${group.label}`} value={query} onChange={setQuery}/>}
      <div className="admin-analytics-options">
        {visible.map((item, index) => <Typography.Text key={`${item}-${index}`}>{item}</Typography.Text>)}
        {!visible.length && <Typography.Text type="secondary">没有匹配项</Typography.Text>}
      </div>
    </div>}>
    <Button size="small" type="tertiary" icon={<Down {...(admin && { size: 16 })} aria-hidden="true"/>} iconPosition="right"
      aria-label={`${group.label}已选 ${group.items.length} 个，查看完整清单`} title={label}>{label}</Button>
  </ViewsPopover>;
}

export function SelectedConditions({ groups, label = '已选条件' }) {
  const admin = useContext(AdminUIContext);
  const { Space, Typography } = admin ? adminControls : frontControls;
  return <Space wrap>
    <Typography.Text type="secondary">{label}</Typography.Text>
    {groups.map(group => <FilterCondition key={`${group.label}-${group.text}`} group={group}/>)}
  </Space>;
}

export default function SavedFilterViews({ scope, value, onApply, summary = '', conditions, groups, currentGroups = groups, saveDescription = '核对当前筛选条件并命名，保存后可快速应用。', showCurrent = true, disabled = false, notify }) {
  const admin = useContext(AdminUIContext);
  const { Button, Form, Input, Space, Tag, Typography, BookmarkIcon, Down, Delete } = admin ? adminControls : frontControls;
  const iconSize = admin ? { size: 16 } : {};
  const key = workspaceStoragePrefix + 'filter-views:' + scope;
  const [views, setViews] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      const rows = JSON.parse(stored ?? '[]');
      return Array.isArray(rows) ? rows.filter(row => row.name && (row.value || row.filters)).map(row => ({ id: row.id || resourceId('filter-view'), name: row.name, value: row.value || { filters: row.filters, granularity: row.granularity } })) : [];
    } catch { return []; }
  });
  const [name, setName] = useState(''), [error, setError] = useState(''), [open, setOpen] = useState(false), [creating, setCreating] = useState(false);
  const [applied, setApplied] = useState(null), [pending, setPending] = useState(null);
  useEffect(() => {
    if (!pending) return;
    setApplied({ ...pending, signature: signature(value) });
    setPending(null);
  }, [pending, value]);
  const persist = next => {
    try { localStorage.setItem(key, JSON.stringify(next)); setViews(next); setError(''); return true; }
    catch { if (notify) notify.error('视图保存失败，请稍后重试'); setError('视图保存失败，请稍后重试'); return false; }
  };
  const save = () => {
    const label = name.trim();
    if (!label) return;
    if (views.some(view => view.name === label)) { setError('名称已存在，请使用其他名称'); return; }
    const id = resourceId('filter-view');
    if (persist([...views, { id, name: label, value }])) { setCreating(false); setName(''); setApplied({ id, name: label, signature: signature(value) }); notify?.success('筛选视图已保存'); }
  };
  const currentConditions = (conditions ?? summary.split(' · ')).filter(Boolean);
  const activeGroups = currentGroups || currentConditions.map(text => ({ text }));
  const viewLabel = applied ? `${applied.name}${signature(value) === applied.signature ? '' : ' · 已修改'}` : '当前筛选';
  return <div className="admin-saved-views">
    {showCurrent && <SelectedConditions groups={activeGroups}/>}
    <Space wrap>
      <ViewsPopover position="bottomRight" visible={open} onVisibleChange={setOpen} content={({ initialFocusRef }) =>
        <div ref={initialFocusRef} tabIndex={-1} className="admin-analytics-picker admin-analytics-fields">
          <div className="admin-analytics-options">
            {views.map(view => <div className="admin-analytics-picker-footer" key={view.id}>
              <Button theme="borderless" onClick={() => {
                if (onApply(view.value) === false) return;
                setOpen(false);
                setPending({ id: view.id, name: view.name });
                notify?.success(`已应用视图：${view.name}`);
              }}>{view.name}</Button>
              <Button theme="borderless" type="tertiary" icon={<Delete {...iconSize} aria-hidden="true"/>} aria-label={`删除视图 ${view.name}`}
                onClick={() => {
                  if (!persist(views.filter(item => item.id !== view.id))) return;
                  if (applied?.id === view.id) setApplied(null);
                  notify?.success('筛选视图已删除');
                }}/>
            </div>)}
            {!views.length && <Typography.Text type="secondary">暂无视图，请先设置筛选条件。</Typography.Text>}
          </div>
          {error && <Typography.Text type="danger" role="alert">{error}</Typography.Text>}
        </div>
      }>
        <Button icon={<Down {...iconSize} aria-hidden="true"/>} iconPosition="right" aria-expanded={open}>视图：{viewLabel}</Button>
      </ViewsPopover>
      <Button icon={<BookmarkIcon {...iconSize} aria-hidden="true"/>} disabled={disabled} onClick={() => { setError(''); setCreating(true); }}>保存为视图</Button>
    </Space>
    {creating && <Modal visible title="保存为视图" width="min(480px, calc(100vw - 32px))" closeOnEsc maskClosable={false}
      okText="保存视图" onOk={save} onCancel={() => setCreating(false)}
      okButtonProps={{ disabled: !name.trim() || disabled, 'aria-label': '保存视图' }} cancelButtonProps={{ 'aria-label': '取消' }}>
      <Typography.Paragraph type="secondary">{saveDescription}</Typography.Paragraph>
      <dl className="admin-saved-summary">{groups ? groups.map(group => <div key={group.label}>
        <dt><Typography.Text strong>{group.label}</Typography.Text></dt>
        {group.scope && <dd><Typography.Text size="small" type="tertiary">{group.scope}</Typography.Text></dd>}
        <dd>{Array.isArray(group.items) && group.items.length ? <Space wrap>{group.items.map((item, index) => <Tag key={index}>{item}</Tag>)}</Space>
          : 'items' in group ? group.items === null ? group.all || '全部' : '未选择' : group.text}</dd>
      </div>) : <dd>{currentConditions.join('；')}</dd>}</dl>
      <Form.Slot label={{ text: '视图名称', name: `saved-view-${scope}` }}>
        <Input id={`saved-view-${scope}`} maxLength={40} placeholder="输入视图名称" value={name} onChange={setName}
          onEnterPress={() => { if (!disabled) save(); }}/>
      </Form.Slot>
      {error && <Typography.Text type="danger" role="alert">{error}</Typography.Text>}
    </Modal>}
  </div>;
}
