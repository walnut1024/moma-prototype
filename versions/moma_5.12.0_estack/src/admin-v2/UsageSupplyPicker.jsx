import { useId, useState } from 'react';
import { Button, Checkbox, Input, Popover, Space, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown, IconChevronRight } from '@douyinfe/semi-icons';
import { supplySummary, toggleSupplyGroup, toggleSupplyChannel } from './usage-trends';
import { supplyPickerGroups, supplyPickerName, supplyPickerSelectionSummary } from './usage-supply-picker';

const { Text } = Typography;
const emptySupply = () => ({ providers: [], channels: [] });

export default function UsageSupplyPicker({ filters, options, onChange }) {
  const treeId = useId();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(emptySupply);
  const [all, setAll] = useState(false);
  const channels = options.channels;
  const selected = item => all || draft.providers.includes(item.groupId) || draft.channels.includes(item.id);
  const materialized = () => all ? { providers: options.providers.map(item => item.id), channels: [] } : draft;
  const groups = supplyPickerGroups(options, query);
  const summary = supplyPickerSelectionSummary(draft, channels, all);
  const openPicker = next => {
    setOpen(next);
    if (next) {
      setDraft({ providers: [...filters.providers], channels: [...(filters.channels || [])] });
      setAll(filters.channels === null && !filters.providers.length);
      setExpanded([]);
      setQuery('');
    }
  };
  return <Popover trigger="click" position="bottomLeft" motion={false} visible={open} onVisibleChange={openPicker} zIndex={1200}
    content={({ initialFocusRef }) => <div ref={initialFocusRef} tabIndex={-1} className="admin-analytics-picker admin-analytics-fields ua-native-supply-picker"
      aria-label="服务商与渠道多选">
      <Input aria-label="搜索服务商或渠道" placeholder="搜索服务商 / 渠道名称或 ID" value={query} onChange={value => {
        setQuery(value);
        setExpanded(value.trim() ? supplyPickerGroups(options, value).map(item => item.id) : []);
      }}/>
      <Checkbox checked={all} indeterminate={!all && Boolean(draft.providers.length || draft.channels.length)}
        onChange={event => { setAll(event.target.checked); setDraft(emptySupply()); }}>全部服务商</Checkbox>
      <div className="admin-analytics-options" role="group" aria-label="服务商与渠道选项">
        {groups.map((item, index) => {
          const whole = all || draft.providers.includes(item.id);
          const count = whole ? item.totalChannels : channels.filter(channel => channel.groupId === item.id && draft.channels.includes(channel.id)).length;
          const checked = whole || (count > 0 && count === item.totalChannels);
          const isExpanded = expanded.includes(item.id);
          const panelId = `${treeId}-${index}`;
          const duplicate = options.providers.some(provider => provider.id !== item.id && supplyPickerName(provider) === item.displayName);
          const name = duplicate ? `${item.displayName} · ${item.code || item.id}` : item.displayName;
          return <div key={item.id}>
            <div className="ua-native-supply-row">
              <Button theme="borderless" size="small" type="tertiary" icon={isExpanded ? <IconChevronDown aria-hidden="true"/> : <IconChevronRight aria-hidden="true"/>}
                aria-label={`${isExpanded ? '收起' : '展开'} ${name} 的渠道`} aria-expanded={isExpanded} aria-controls={isExpanded ? panelId : undefined}
                disabled={!item.totalChannels} onClick={() => setExpanded(previous => isExpanded ? previous.filter(id => id !== item.id) : [...previous, item.id])}/>
              <Checkbox checked={checked} indeterminate={!checked && count > 0} aria-describedby={panelId + "-count"} aria-label={`选择服务商 ${name} 的全部渠道`}
                title="选择该服务商的全部渠道，包含后续新增渠道" onChange={event => {
                  setDraft(toggleSupplyGroup(materialized(), item.id, channels, event.target.checked));
                  setAll(false);
                }}>
                <Text>{name}</Text>
              </Checkbox>
              <Text id={panelId + "-count"} size="small" type="tertiary">{!item.totalChannels ? '暂无渠道' : whole ? `全部 ${item.totalChannels} 渠道`
                : count ? `已选 ${count}/${item.totalChannels} 渠道` : `${item.totalChannels} 渠道`}</Text>
            </div>
            {isExpanded && <div className="ua-native-supply-children" id={panelId} role="group" aria-label={`${name}的渠道`}>
              {item.channels.map(channel => <Checkbox key={channel.id} checked={selected(channel)}
                aria-label={`选择渠道 ${channel.name} ${channel.code || channel.id}`} onChange={event => {
                  setDraft(toggleSupplyChannel(materialized(), channel, channels, event.target.checked));
                  setAll(false);
                }}>
                <Text>{channel.name}</Text><Text size="small" type="tertiary">（{channel.code || channel.id}）</Text>
              </Checkbox>)}
            </div>}
          </div>;
        })}
        {!groups.length && <Text type="secondary">暂无匹配结果</Text>}
      </div>
      <div className="admin-analytics-picker-footer">
        <Text type="secondary" title={summary}>{summary}</Text>
        <Space>
          <Button size="small" theme="borderless" onClick={() => { setAll(false); setDraft(emptySupply()); }}>清空</Button>
          <Button size="small" onClick={() => setOpen(false)}>取消</Button>
          <Button size="small" theme="solid" onClick={() => {
            onChange({ ...filters, providers: all ? [] : draft.providers, channels: all ? null : draft.channels });
            setOpen(false);
          }}>确定</Button>
        </Space>
      </div>
    </div>}>
    <Button size="small" icon={<IconChevronDown aria-hidden="true"/>} iconPosition="right" aria-label="服务商与渠道筛选" aria-expanded={open}
      title={supplySummary(filters, options, true)}>{supplySummary(filters, options)}</Button>
  </Popover>;
}
