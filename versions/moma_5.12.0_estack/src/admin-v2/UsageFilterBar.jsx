import { Button } from '@douyinfe/semi-ui';
import { MultiPick } from './AnalyticsFilters';
import UsageCascade from './UsageCascade';
import UsageSupplyPicker from './UsageSupplyPicker';
import { usageFilterOptions, usageModelTypes } from './usage-analysis';

export default function UsageFilterBar({ state, filters, onChange, title, controls, children }) {
  const options = usageFilterOptions(state);
  const active = filters.model !== null || filters.channels !== null || filters.providers.length > 0 || filters.user !== null;
  return <div className="ua-native-filters" role="group" aria-label={`${title}筛选`}>
    <div className="admin-filter-toolbar">
      <UsageCascade label="模型" parentLabel="模型类型" groups={usageModelTypes} items={options.models}
        value={filters.model} onChange={model => onChange({ ...filters, model })}/>
      <UsageSupplyPicker filters={filters} options={options} onChange={onChange}/>
      <MultiPick compact label="用户" value={filters.user} onChange={user => onChange({ ...filters, user })} items={options.users}
        searchPlaceholder="搜索用户 ID" hint={!options.users.some(item => item.id !== '__unknown__') ? '当前调用记录未记录用户 ID，按未归属用户展示。' : undefined}/>
      {controls}
    </div>
    <div className="admin-filter-toolbar">
      <Button theme="borderless" type="tertiary" size="small" disabled={!active}
        onClick={() => onChange({ types: null, tenant: null, model: null, providers: [], channels: null, user: null })}>重置</Button>
      {children}
    </div>
  </div>;
}
