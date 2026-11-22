import { useId, useRef, useState } from 'react';
import { Button, Input, Select, Tag, Toast } from '@douyinfe/semi-ui';
import { IconFilter, IconSearch } from '@douyinfe/semi-icons';
import { ObservationIdentitySearch, ObservationSupplyPick, useObservationSupply } from './CallObservationControls';
import { SemiDateRange } from './SemiAnalyticsFilters';
import { dayOf } from './analytics';
import { callPresets, changeObservationTenant, httpLabel, modelTypes, observationKey, observationOptions,
  observationTime, outcomes, preflightTypes } from './call-observations.mjs';

const labels = {
  query: 'Request ID', request: 'Request ID', period: '时间范围', outcome: '请求结果', preflightType: '错误类型',
  tenant: '客户', project: '项目', model: '模型', upstreamModelId: '上游模型', supply: '服务商 / 渠道',
  http: 'HTTP 状态码', user: '调用用户', key: 'API 密钥', userRecord: '用户标识采集', source: '请求来源',
  purpose: '调用类型', callId: '模型调用标识', endpoint: '端点', errorCode: '错误码', type: '模型类型',
};
const layouts = {
  requests: [['query', 'period', 'outcome'],
    ['tenant', 'project', 'model', 'supply', 'callId', 'endpoint', 'user', 'key', 'userRecord', 'source', 'purpose', 'http']],
  upstream: [['query', 'period', 'supply'],
    ['outcome', 'upstreamModelId', 'http', 'tenant', 'project', 'callId', 'endpoint', 'user', 'key', 'userRecord', 'source', 'purpose']],
  preflight: [['query', 'period', 'preflightType'], ['tenant', 'project', 'model', 'callId', 'errorCode', 'http']],
};
const outcomeOptions = [...Object.entries(outcomes), ['other', '其他状态']];
const userRecordOptions = [['recorded', '已采集'], ['uncollected', '未采集']];
const optionList = entries => entries.map(([value, label]) => ({ value, label }));
const httpCodeLabel = code => httpLabel(code === 'unreported' ? null : Number(code));

function LogFilterField({ id, view, pool, values, window, errors, onChange }) {
  const label = labels[id];
  const value = values[id];
  const supply = useObservationSupply(id === 'supply' ? pool : [], id === 'supply' ? value : null);
  const change = patch => onChange('tenant' in patch ? changeObservationTenant(pool, values, patch.tenant) : patch);
  if (id === 'query') return <Input aria-label={label} prefix={<IconSearch aria-hidden="true"/>}
    placeholder={view === 'upstream' ? '客户或上游 Request ID' : '搜索 Request ID'} value={value} showClear
    onChange={query => change({ query, request: '' })}/>;
  if (id === 'period') return <div className="admin-log-period">
    <Select aria-label={label} motion={false} value={value}
      optionList={optionList(value === 'custom' ? [...callPresets, ['custom', '自定义']] : callPresets)}
      onChange={period => { if (period !== 'custom') change({ period, start: '', end: '' }); }}/>
    <SemiDateRange start={dayOf(window?.start ?? Date.now())} end={dayOf((window?.end ?? Date.now()) - 1)}
      maxDays={365} presets={[]} rangeHint="单次最多 365 天"
      trigger={<Button aria-label="自定义日期范围">{value === 'custom' ? '修改日期' : '自定义'}</Button>}
      onChange={dates => change({ ...dates, period: 'custom' })}/>
  </div>;
  if (id === 'supply') return <ObservationSupplyPick {...supply} onChange={change}/>;
  if (id === 'user' || id === 'key') return <div className="admin-log-identity">
    <ObservationIdentitySearch key={JSON.stringify(values.tenant)} dimension={id} label={label} rows={pool} filters={values}
      onChange={patch => change(id === 'user' ? { ...patch, userRecord: '' } : patch)}/>
    {value?.length > 0 && <div>已选 {value.length} 项 <Button size="small" theme="borderless"
      onClick={() => change({ [id]: null })}>清除</Button></div>}
  </div>;
  const scalarOptions = {
    outcome: outcomeOptions, preflightType: preflightTypes, userRecord: userRecordOptions,
    http: () => [...new Set([...pool.map(row => String(row.status ?? 'unreported')), value].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })).map(code => [code, httpCodeLabel(code)]),
    errorCode: () => [...errors.keys()].map(code => [code, code]),
  };
  const options = scalarOptions[id];
  if (options) return <Select aria-label={label} motion={false} value={value || ''}
    optionList={optionList([['', '全部'], ...(typeof options === 'function' ? options() : options)])}
    onChange={next => change({ [id]: next, ...(id === 'userRecord' && next === 'uncollected' && { user: null }) })}/>;
  const scoped = pool.filter(row => (id !== 'project' || values.tenant == null || values.tenant.includes(observationKey(row, 'tenant')))
    && (id !== 'callId' || values.model == null || values.model.includes(observationKey(row, 'model'))));
  const available = observationOptions(scoped, id);
  const selected = (value ?? []).filter(key => !available.some(item => item.id === key));
  return <Select multiple filter showClear maxTagCount={1} aria-label={label} placeholder="全部" motion={false}
    optionList={optionList([...available.map(item => [item.id, item.name]), ...selected.map(key => [key, key])])}
    value={value || []} onChange={ids => change({ [id]: ids?.length ? ids : null, ...(id === 'model' && { callId: null }) })}/>;
}

export default function CallLogFilters({ view, pool, filters, window, errors, onChange, onReset }) {
  const [draft, setDraft] = useState(null);
  const moreId = useId();
  const moreButton = useRef(null);
  const [primary, extra] = layouts[view];
  const active = Object.keys(labels).filter(id => !primary.includes(id) && id !== 'query' && id !== 'period' && Boolean(filters[id]));
  const supply = useObservationSupply(pool, filters.supply);
  const closeDraft = () => { setDraft(null); moreButton.current?.focus(); };
  const fields = (ids, values, change) => ids.map(id => <div key={id} className={'admin-log-filter-field field-' + id}>
    <span>{labels[id]}</span>
    <LogFilterField id={id} view={view} pool={pool} values={values} window={window} errors={errors} onChange={change}/>
  </div>);
  const describe = id => {
    const value = filters[id];
    if (id === 'supply') return supply.group.items?.join('、') || '未选择';
    if (Array.isArray(value)) {
      const names = new Map(observationOptions(pool, id).map(item => [item.id, item.name]));
      return value.map(key => names.get(key) || key).join('、') || '未选择';
    }
    if (id === 'http') return httpCodeLabel(value);
    return { ...outcomes, ...Object.fromEntries([...userRecordOptions, ...modelTypes, ...preflightTypes]) }[value] || value;
  };
  return <section className="admin-log-filters" aria-label="查询条件">
    <div className="admin-log-primary">
      {fields(primary, filters, patch => onChange(patch))}
      <div className="admin-log-filter-actions">
        <Button icon={<IconFilter aria-hidden="true"/>} aria-expanded={draft !== null} aria-controls={moreId}
          onClick={event => {
            moreButton.current = event.currentTarget;
            setDraft(draft === null ? {} : null);
          }}>{draft === null ? '更多筛选' : '收起筛选'}{active.length ? ' · ' + active.length : ''}</Button>
        <Button type="tertiary" theme="borderless" onClick={() => { setDraft(null); onReset(); }}>重置</Button>
      </div>
    </div>
    <div id={moreId} hidden={draft === null}>
      {draft !== null && <div className="admin-log-filter-draft">
        <div className="admin-log-extra-fields">
          {fields(extra, { ...filters, ...draft }, patch => setDraft(current => ({ ...current, ...patch })))}
        </div>
        <div className="admin-log-filter-actions admin-log-apply">
          <Button theme="borderless" onClick={closeDraft}>取消</Button>
          <Button theme="solid" onClick={() => {
            if ('tenant' in draft && Object.keys(changeObservationTenant(pool, filters, draft.tenant)).length > 1) {
              Toast.info('已移除新客户范围之外的调用方条件');
            }
            onChange(draft);
            closeDraft();
          }}>应用筛选</Button>
        </div>
      </div>}
    </div>
    {(active.length > 0 || filters.period === 'custom' && window) && <div className="admin-log-active-values" role="group" aria-label="已选条件">
      {filters.period === 'custom' && window && <span>{observationTime(window.start)} 至 {observationTime(window.end)}</span>}
      {active.map(id => <Tag key={id} color="blue" closable onClose={() => {
        setDraft(null);
        onChange(id === 'tenant' ? changeObservationTenant(pool, filters, null) : { [id]: Array.isArray(filters[id]) ? null : '' });
      }}>{labels[id]} · {describe(id)}</Tag>)}
    </div>}
  </section>;
}
