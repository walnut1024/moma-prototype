import { useEffect, useId, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { Button, Card, Checkbox, Input, Select } from './xa24/HaloUI.jsx';
import { useChannelText } from './channel-language';
import { analysisProjects, unassignedProject } from './analysis-projects.mjs';
import { SemiDateRange as DateRange } from './SemiAnalyticsFilters';
import { usageFilterOptions, usageModelTypes, usagePresets, usagePreset, usageWindow } from './usage-analysis';

export default function UsageStatisticsFilters({ selection, state, onApply, onReset, views, details, live, clock, onRefresh }) {
  const t = useChannelText();
  const id = useId();
  const [draft, setDraft] = useState(selection);
  const [context, setContext] = useState(Boolean(selection.scope.tenant || selection.scope.project));
  useEffect(() => {
    setDraft(selection);
    if (selection.scope.tenant || selection.scope.project) setContext(true);
  }, [selection]);
  const catalog = useMemo(() => usageFilterOptions(state), [state]);
  const projects = useMemo(() => analysisProjects(state, draft.scope.tenant), [state, draft.scope.tenant]);
  const days = usageWindow(draft.range)?.days;
  const change = next => setDraft(value => ({ ...value, ...next }));
  const setPreset = period => change({ period, range: usagePreset(period) });
  const changeTypes = types => {
    const compatible = types.length ? new Set(catalog.models.filter(model => types.includes(model.groupId)).map(model => model.id)) : null;
    setDraft(value => ({ ...value, types, models: compatible ? value.models.filter(model => compatible.has(model)) : value.models }));
  };
  const options = items => items.map(({ id: value, name }) => ({ value, label: name }));
  const matches = (query, option) => [option.label, option.code, option.value].some(value =>
    value?.toLowerCase().includes(query.trim().toLowerCase()));
  const control = (key, heading, children) => <div className="ua-statistics-field">
    <span className="ua-statistics-field-label" id={id + key}>{t(heading)}</span>{children}
  </div>;
  return <Card className="ua-statistics-filters">
    <form onSubmit={event => { event.preventDefault(); if (days) onApply(draft); }}>
      {live ? <div className="ua-statistics-live">
        <span>数据截至 {new Date(clock).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）</span>
        <Button type="primary" theme="light" onClick={onRefresh}>{t('刷新')}</Button>
      </div> : <div className="ua-statistics-filter-grid">
        {control('-period', '时间范围', <div className="ua-statistics-pills" role="group" aria-labelledby={id + '-period'}>
          {usagePresets.map(([period, label]) => <Button key={period} size="small" theme={draft.period === period ? 'light' : 'borderless'}
            aria-pressed={draft.period === period} onClick={() => setPreset(period)}>{t(label)}</Button>)}
          <DateRange start={draft.range.start} end={draft.range.end} allowLongRange
            trigger={<Button icon={draft.period === 'custom' ? <CalendarDays size={14} aria-hidden="true"/> : undefined}
              aria-pressed={draft.period === 'custom'} aria-label={t('自定义日期范围')}>
              {draft.period === 'custom' ? `${draft.range.start} — ${draft.range.end}` : t('自定义')}
            </Button>}
            onChange={range => change({ period: 'custom', range })}/>
        </div>)}
        <div className="ua-statistics-scale">
          <Checkbox checked={draft.million} onChange={event => change({ million: event.target.checked })}>
            {t('调用量按百万 Tokens 单位展示')}
          </Checkbox>
        </div>
        {control('-type', '模型类型', <Select multiple value={draft.types} optionList={options(usageModelTypes)} showClear
          aria-labelledby={id + '-type'} placeholder={t('请选择模型类型')} onChange={changeTypes}/>)}
        {control('-provider', '服务商', <Select multiple filter={matches} value={draft.providers} showClear
          aria-labelledby={id + '-provider'} placeholder={t('请选择服务商')} onChange={providers => change({ providers })}
          optionList={catalog.providers.map(({ id: value, name, code }) => ({ value, label: name, code }))}/>)}
        {control('-model', '模型名称', <div className="ua-statistics-model-select">
          <Select multiple filter={matches} value={draft.models} maxTagCount={1} showClear
            aria-labelledby={id + '-model'} aria-describedby={id + '-limit'} placeholder={t('请选择模型名称')}
            onChange={models => change({ models: models.slice(0, 5) })}
            optionList={catalog.models.filter(model => !draft.types.length || draft.types.includes(model.groupId))
              .map(({ id: value, name, code }) => ({ value, label: name, code, disabled: draft.models.length >= 5 && !draft.models.includes(value) }))}/>
          <span id={id + '-limit'} className="ua-statistics-selection-count">{draft.models.length}/5</span>
        </div>)}
        {control('-precision', '时间精度', <Input value={t(days <= 1 ? '按小时' : days > 30 ? '按周' : '按日')}
          aria-labelledby={id + '-precision'} readOnly/>)}
        {context && <>
          {control('-tenant', '租户', <Select value={draft.scope.tenant} filter aria-labelledby={id + '-tenant'}
            optionList={[{ value: '', label: t('全部租户') }, ...options(state.tenants)]}
            onChange={tenant => change({ scope: { tenant, project: '' } })}/>)}
          {control('-project', '项目', <Select value={draft.scope.project} filter aria-labelledby={id + '-project'}
            optionList={[{ value: '', label: t('全部项目') }, ...projects.map(row => ({
              value: row.id, label: row.id === unassignedProject ? row.name : row.name + ' · ' + row.id,
            })), ...(draft.scope.project && !projects.some(row => row.id === draft.scope.project)
              ? [{ value: draft.scope.project, label: draft.scope.project }] : [])]}
            onChange={project => change({ scope: { ...draft.scope, project } })}/>)}
        </>}
      </div>}
      <div className="ua-statistics-actions">
        <div className="ua-statistics-actions-start">
          {views}
          {!live && <Button size="small" theme="borderless" aria-expanded={context}
            icon={<ChevronDown size={14} aria-hidden="true"/>} onClick={() => setContext(value => !value)}>{t('租户与项目')}</Button>}
          {details}
        </div>
        {!live && <div className="ua-statistics-actions-end">
          <Button htmlType="submit" type="primary" theme="solid" disabled={!days}>{t('查询')}</Button>
          <Button onClick={() => setDraft(onReset())}>{t('重置')}</Button>
        </div>}
      </div>
    </form>
  </Card>;
}
