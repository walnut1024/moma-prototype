import { useId, useState } from 'react';
import { Button, Checkbox, Input, Popover, Space, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown } from '@douyinfe/semi-icons';
import { Choice } from './ServiceUI';

export default function UsageCascade({ label, parentLabel, groups, items, value, onChange }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState([]);
  const selected = new Set(draft);
  const visible = items.filter(item => (group === null || item.groupId === group)
    && `${item.name} ${item.code || item.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const checked = visible.filter(item => selected.has(item.id)).length;
  const toggle = (ids, include) => {
    const changed = new Set(ids);
    setDraft(previous => include ? [...new Set([...previous, ...ids])] : previous.filter(item => !changed.has(item)));
  };
  const openPicker = next => {
    setOpen(next);
    if (next) {
      setDraft(value === null ? items.map(item => item.id) : value);
      setGroup(null);
      setQuery('');
    }
  };
  const apply = () => {
    onChange(items.length > 0 && draft.length === items.length && items.every(item => selected.has(item.id)) ? null : draft);
    setOpen(false);
  };
  return <Popover trigger="click" position="bottomLeft" motion={false} visible={open} onVisibleChange={openPicker} zIndex={1200}
    content={({ initialFocusRef }) => <div id={id} ref={initialFocusRef} tabIndex={-1} className="admin-analytics-picker admin-analytics-fields"
      aria-label={`${parentLabel}与${label}筛选`}>
      <Input aria-label={`搜索${label}`} placeholder={`搜索${label}名称 / ID`} value={query} onChange={setQuery}/>
      <Space wrap>
        <Choice label={parentLabel} size="small" value={group ?? '__all__'} motion={false} getPopupContainer={() => document.getElementById(id)}
          options={[[ '__all__', '全部类型' ], ...groups.map(item => [item.id, item.name])]} onSelect={value => setGroup(value === '__all__' ? null : value)}/>
        <Checkbox aria-label="全选当前结果" disabled={!visible.length} checked={checked > 0 && checked === visible.length}
          indeterminate={checked > 0 && checked < visible.length} onChange={event => toggle(visible.map(item => item.id), event.target.checked)}>全选</Checkbox>
      </Space>
      <div className="admin-analytics-options" role="group" aria-label={`${label}选项`}>
        {visible.map(item => <Checkbox key={item.id} checked={selected.has(item.id)}
          aria-label={`${item.name}（${item.code || item.id}）`} onChange={event => toggle([item.id], event.target.checked)}>
          <Typography.Text>{item.name}</Typography.Text><Typography.Text size="small" type="tertiary">（{item.code || item.id}）</Typography.Text>
        </Checkbox>)}
        {!visible.length && <Typography.Text type="secondary">暂无匹配{label}</Typography.Text>}
      </div>
      <div className="admin-analytics-picker-footer">
        <Typography.Text type="secondary">已选 {draft.length} 个{label}</Typography.Text>
        <Space>
          <Button theme="borderless" size="small" disabled={!draft.length} onClick={() => setDraft([])}>清空</Button>
          <Button size="small" onClick={() => setOpen(false)}>取消</Button>
          <Button size="small" theme="solid" onClick={apply}>确定</Button>
        </Space>
      </div>
    </div>}>
    <Button size="small" icon={<IconChevronDown aria-hidden="true"/>} iconPosition="right" aria-label={`${label}二级筛选`} aria-expanded={open}>
      {label}：{value === null ? '全部' : `${value.length}个`}
    </Button>
  </Popover>;
}
