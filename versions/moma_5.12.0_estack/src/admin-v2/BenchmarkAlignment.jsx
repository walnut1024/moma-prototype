import { useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Card, Cascader, Input, InputNumber, Select, Space, Switch, Tabs, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconMinus, IconPlus } from '@douyinfe/semi-icons';
import AdminDescriptions from './AdminDescriptions';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import { serviceOperationsUi } from './ServiceUI';
import { useChannelText } from './channel-language';
import {
  BENCHMARK_LOAD_PATTERNS, BENCHMARK_LOAD_TYPES, BENCHMARK_PROFILES, BENCHMARK_SLO, BENCHMARK_TARGETS,
  benchmarkArchiveCapacity, benchmarkArchiveStorageKey, benchmarkArchiveUsage, benchmarkBytesToGiB, benchmarkInstanceTree, benchmarkProfilePatch,
  benchmarkTargets, benchmarkTargetValue, initialBenchmarkDraft, MAX_BENCHMARK_STAGES, saveAlignedBenchmark, updateBenchmarkDraft,
} from './benchmark-alignment';
import './benchmark-alignment.css';

const { Text } = Typography;
const options = (items, t = value => value) => items.map(value => ({ value, label: t(value) }));
const isSet = value => value != null && value !== '';

function Field({ label, required, children }) {
  const id = useId();
  return <div className="benchmark-field"><label id={`${id}-label`} htmlFor={id}>{label}
    {required && <span aria-hidden="true" className="benchmark-required"> *</span>}
  </label>{children({ id, 'aria-labelledby': `${id}-label`, 'aria-required': required })}</div>;
}

function NumberField({ label, value, onChange, min = 1, max, step = 1, required, disabled, suffix }) {
  return <Field label={label} required={required}>{props => <InputNumber {...props} min={min} max={max} step={step}
    value={value ?? ''} onChange={onChange} disabled={disabled} suffix={suffix}/>}</Field>;
}

function Toggle({ label, checked, onChange, disabled }) {
  return <div className="benchmark-toggle"><Text>{label}</Text><Switch aria-label={label}
    checked={Boolean(checked)} onChange={onChange} disabled={disabled}/></div>;
}

function EditorRows({ label, addLabel, rows, update, blank, limit, disabled, children }) {
  const t = useChannelText();
  const patch = (index, change) => update(rows.map((item, position) => position === index ? { ...item, ...change } : item));
  const remove = index => update(rows.filter((_, position) => position !== index));
  return <fieldset className="benchmark-editor-rows">
    <legend>{label}</legend>
    {rows.map((row, index) => <div className="benchmark-editor-row" key={index}>
      <div className="benchmark-field-grid">
        {children(row, index, change => patch(index, change))}
      </div>
      {!disabled && <Button aria-label={`${t('移除')} ${label} ${index + 1}`} htmlType="button" theme="borderless" type="tertiary"
        icon={<IconMinus aria-hidden="true"/>} onClick={() => remove(index)}/>}
    </div>)}
    {!disabled && <Button htmlType="button" icon={<IconPlus aria-hidden="true"/>} theme="borderless"
      disabled={limit != null && rows.length >= limit} onClick={() => update([...rows, { ...blank }])}>{addLabel}</Button>}
  </fieldset>;
}

function BenchmarkBasic({ records, draft, row, update }) {
  const t = useChannelText();
  const current = Boolean(row);
  const targets = current ? [] : benchmarkTargets(records, draft.clusterId, draft.targetMode);
  const isRoute = draft.targetMode === '路由';
  const modelTree = isRoute || current ? [] : benchmarkInstanceTree(records, draft.clusterId);
  const routeTargets = !current && isRoute && draft.targetId ? benchmarkTargets(records, draft.clusterId, '路由', draft.targetId) : targets;
  const selectedRoute = isRoute && routeTargets.find(item => item.value === draft.targetSelection);
  const instanceTarget = isRoute ? undefined : targets.find(item => benchmarkTargetValue(item) === draft.targetSelection);
  const currentModel = modelTree.find(item => item.value === (instanceTarget?.deployment.id || draft.targetId));
  const instanceValue = currentModel && (instanceTarget && !instanceTarget.deployment.roles
    ? [currentModel.value, instanceTarget.value] : [currentModel.value]);
  const pickerNodes = modelTree.map(model => ({
    value: model.value, label: model.reason ? `${model.label} · ${t(model.reason)}` : model.label, disabled: model.disabled,
    children: model.children?.map(item => ({ ...item, label: item.reason ? `${item.label} · ${t(item.reason)}` : item.label })),
  }));
  const clusterOptions = (records.clusters || []).filter(cluster => cluster.status === '运行中' || current && cluster.id === draft.clusterId)
    .map(cluster => ({ value: cluster.id, label: cluster.name }));
  const routeUnavailable = !current && isRoute && (
    !clusterOptions.some(cluster => cluster.value === draft.clusterId) ? '请先选择运行中的集群。' :
      !targets.length ? '该集群没有指向可服务语言模型的路由，请改用模型实例。' :
        draft.targetSelection && !selectedRoute ? '已选路由不再指向所选模型，请重新选择。' : ''
  );
  const changeContext = (clusterId, targetMode) => {
    const candidates = benchmarkTargets(records, clusterId, targetMode);
    const selection = targetMode === '路由' && candidates.length !== 1 ? undefined : candidates[0];
    update({ clusterId, targetMode, targetSelection: selection ? benchmarkTargetValue(selection) : '', targetId: selection?.deployment.id || '' });
  };
  const changeInstance = path => {
    const model = modelTree.find(item => item.value === path?.[0]);
    update({ targetId: model?.value || '', targetSelection: path?.[1] || model?.target || '' });
  };
  const changeRoute = selection => {
    const target = targets.find(item => item.value === selection);
    update({ targetSelection: target?.value || '', targetId: target?.deployment.id || '' });
  };
  const labels = Array.isArray(draft.labels) ? draft.labels : Object.entries(draft.labels || {}).map(([key,value]) => ({ key,value }));
  return <div className="benchmark-fields">
    <Field label={t('名称')} required>{props => <Input {...props} value={draft.name} onChange={name => update({ name })}/>}</Field>
    <Field label={t('集群')} required>{props => <Select {...props} optionList={clusterOptions} value={draft.clusterId || undefined}
      disabled={current} filter onChange={clusterId => changeContext(clusterId, draft.targetMode)}/>}</Field>
    <Field label={t('测试目标类型')}>{props => <Select {...props} optionList={options(BENCHMARK_TARGETS, t)} value={draft.targetMode} disabled={current}
      onChange={targetMode => changeContext(draft.clusterId, targetMode)}/>}</Field>
    <Field label={t(isRoute ? '路由' : '测试目标')} required>{props => current
      ? <Input {...props} value={(isRoute ? row.routeName || row.targetName || row.routeId : row.targetName || row.modelInstanceName || row.modelName) || '—'} disabled/>
      : isRoute ? <Select {...props} optionList={targets.map(({ value, label }) => ({ value, label }))} filter showClear
        value={selectedRoute?.value || undefined} onChange={changeRoute} emptyContent={t('该集群没有可用路由')}/>
        : <Cascader {...props} treeData={pickerNodes} value={instanceValue || []} filterTreeNode showClear
          changeOnSelect={false} expandTrigger="hover" onChange={changeInstance} placeholder={t('请选择模型和实例')}
          emptyContent={t('该集群没有就绪模型实例')} style={{ width: '100%' }}/>}</Field>
    {isRoute && <Text size="small" type="tertiary">{t('请求经过模型路由，测试结果包含网关开销。')}</Text>}
    {routeUnavailable && <Text size="small" type="warning" role="status">{t(routeUnavailable)}</Text>}
    <Field label={t('描述')}>{props => <TextArea {...props} rows={3} value={draft.description} onChange={description => update({ description })}/>}</Field>
    {!current && <EditorRows label={t('标签')} addLabel={t('添加标签')} rows={labels}
      update={labels => update({ labels })} blank={{ key: '', value: '' }}>
      {(item, index, patch) => <>
        <Input value={item.key} aria-label={`${t('标签')} ${index + 1} ${t('名称')}`} placeholder={t('标签名称')} onChange={key => patch({ key })}/>
        <Input value={item.value} aria-label={`${t('标签')} ${index + 1} ${t('值')}`} placeholder={t('标签值')} onChange={value => patch({ value })}/>
      </>}
    </EditorRows>}
  </div>;
}

function BenchmarkWorkload({ draft, update, disabled }) {
  const t = useChannelText();
  const random = draft.dataset === 'Random';
  const token = (key, label, fields) => <NumberField key={key} label={t(label)} value={draft[key]}
    onChange={value => update({ [key]: value })} disabled={disabled} {...fields}/>;
  const windows = [
    ['inputMin', '最短输入'], ['inputMax', '最长输入'], ['outputMin', '最短输出'], ['outputMax', '最长输出'],
  ];
  return <div className="benchmark-fields">
    <Field label={t('模式')} required>{props => <Select {...props} value={draft.profile} optionList={options(Object.keys(BENCHMARK_PROFILES), t)}
      disabled={disabled} onChange={profile => update(benchmarkProfilePatch(profile))}/>}</Field>
    <Field label={t('数据集')} required>{props => <Select {...props} value={draft.dataset} optionList={options(['Random', 'ShareGPT'])}
      disabled={disabled} onChange={dataset => update({ dataset })}/>}</Field>
    {random ? <>
      <div className="benchmark-field-grid">
        {token('inputTokens', '输入 Token 长度', { required: true })}
        {token('outputTokens', '输出 Token 长度', { required: true })}
      </div>
      <Toggle label={t('固定随机种子')} checked={draft.pinSeed} onChange={pinSeed => update({ pinSeed })} disabled={disabled}/>
      {draft.pinSeed && token('randomSeed', '随机种子', { required: true, max: 2147483647 })}
      {draft.loadPattern !== '单次' && <Toggle label={t('每个阶段递增种子')} checked={draft.incrementSeed}
        onChange={incrementSeed => update({ incrementSeed })} disabled={disabled}/>}
      <Toggle label={t('Token 长度分布')} checked={draft.tokenDistribution}
        onChange={tokenDistribution => update({ tokenDistribution })} disabled={disabled}/>
      {draft.tokenDistribution && <div className="benchmark-field-grid">
        {token('inputStdev', '输入长度标准差', { min: 0, step: 0.1 })}
        {token('outputStdev', '输出长度标准差', { min: 0, step: 0.1 })}
        {windows.map(([key,label]) => token(key,label))}
      </div>}
      <Toggle label={t('共享前缀')} checked={Boolean(draft.prefixBuckets.length)} disabled={disabled}
        onChange={enabled => update({ prefixBuckets: enabled ? [{ tokens: '', count: 1, weight: 100 }] : [] })}/>
      {!!draft.prefixBuckets.length && <EditorRows label={t('前缀桶')} addLabel={t('添加前缀桶')} rows={draft.prefixBuckets}
        update={prefixBuckets => update({ prefixBuckets })} blank={{ tokens: '', count: 1, weight: 100 }} disabled={disabled}>
        {(item, _index, patch) => [['tokens','前缀 Token 数'], ['count','前缀数量'], ['weight','桶权重']].map(([key,label]) =>
          <NumberField key={key} label={t(label)} value={item[key]} onChange={value => patch({ [key]: value })} disabled={disabled} required/>)}</EditorRows>}
      <Toggle label={t('多轮对话')} checked={draft.turnsEnabled} disabled={disabled}
        onChange={turnsEnabled => update({ turnsEnabled, turns: turnsEnabled ? 2 : '' })}/>
      {draft.turnsEnabled && token('turns', '对话轮数', { min: 2, max: 64, required: true })}
    </> : <>
      <Toggle label={t('筛选 ShareGPT 数据')} checked={draft.shareGptFilter} onChange={shareGptFilter => update({ shareGptFilter })} disabled={disabled}/>
      {draft.shareGptFilter && <div className="benchmark-field-grid">
        {windows.slice(0,2).map(([key,label]) => token(key,label))}{token('outputTokens', '输出 Token 长度')}
      </div>}
    </>}
  </div>;
}

function BenchmarkSloFields({ draft, update, disabled }) {
  const t = useChannelText();
  const selected = Object.entries(draft.sloTargets || {}).filter(([key]) => BENCHMARK_SLO.some(([candidate]) => candidate === key));
  const remaining = BENCHMARK_SLO.filter(([key]) => !Object.hasOwn(draft.sloTargets || {}, key));
  return <div className="benchmark-fields">
    {selected.map(([key,value]) => <div className="benchmark-editor-row" key={key}>
      <NumberField label={t(BENCHMARK_SLO.find(([name]) => name === key)[1])} value={value} min={0.001} step={0.1} suffix="ms"
        onChange={next => update({ sloTargets: { ...draft.sloTargets, [key]: next } })} disabled={disabled}/>
      {!disabled && <Button htmlType="button" theme="borderless" aria-label={`${t('移除')} ${BENCHMARK_SLO.find(([name]) => name === key)[1]}`}
        icon={<IconMinus aria-hidden="true"/>} onClick={() => update({ sloTargets: Object.fromEntries(selected.filter(([name]) => name !== key)) })}/>}
    </div>)}
    {!disabled && remaining.length > 0 && <Select aria-label={t('添加 SLO 目标')} placeholder={t('添加 SLO 目标')}
      value={undefined} optionList={remaining.map(([value,label]) => ({ value,label:t(label) }))}
      onChange={key => update({ sloTargets: { ...draft.sloTargets, [key]: '' } })}/>}
  </div>;
}

function BenchmarkLoadFields({ draft, update, disabled }) {
  const t = useChannelText();
  const presetLocked = draft.profile !== '自定义';
  const fixed = draft.loadType === '固定请求速率';
  const loadLabel = fixed ? '请求速率（req/s）' : '并发数';
  const loadUnits = fixed ? { min: 0.001, step: 0.001 } : {};
  const budgets = draft.loadPattern === '自动调优';
  const stages = draft.loadPattern === '手工分阶段';
  const patterns = BENCHMARK_LOAD_PATTERNS.filter(pattern => pattern !== '单次' || draft.loadPattern === '单次');
  const number = (key,label,config) => <NumberField key={key} label={t(label)} value={draft[key]} disabled={disabled}
    onChange={value => update({ [key]: value })} {...config}/>;
  return <div className="benchmark-fields">
    <div className="benchmark-field-grid">
      <Field label={t('负载类型')} required>{props => <Select {...props} optionList={options(BENCHMARK_LOAD_TYPES, t)} value={draft.loadType}
        disabled={disabled || presetLocked} onChange={loadType => update({ loadType })}/>}</Field>
      <Field label={t('负载模式')} required>{props => <Select {...props} optionList={options(patterns, t)} value={draft.loadPattern}
        disabled={disabled || presetLocked} onChange={loadPattern => update({ loadPattern })}/>}</Field>
    </div>
    {budgets && <div className="benchmark-field-grid">
      {number('minLoad', fixed ? '起始速率（req/s）' : '起始并发数', loadUnits)}
      {number('maxLoad', fixed ? '结束速率（req/s）' : '结束并发数', loadUnits)}
      {number('maxPoints', '最大测量点数', { max: MAX_BENCHMARK_STAGES })}
      {number('maxTotalSeconds', '最大总耗时（秒）')}
    </div>}
    {!stages && !budgets && <div className="benchmark-field-grid">
      {number('load', loadLabel, { ...loadUnits, required: true })}
      {number('requests', '最大请求数')}
      {number('duration', '最大耗时（秒）')}
    </div>}
    {stages && <EditorRows label={t('阶段列表')} addLabel={t('添加阶段')} rows={draft.stagePlans} update={stagePlans => update({ stagePlans })}
      blank={{ load: '', requests: '', duration: '' }} limit={MAX_BENCHMARK_STAGES} disabled={disabled}>
      {(item,_index,patch) => <>
        <NumberField label={t(loadLabel)} value={item.load} {...loadUnits} required disabled={disabled} onChange={load => patch({ load })}/>
        <NumberField label={t('最大请求数')} value={item.requests} disabled={disabled} onChange={requests => patch({ requests })}/>
        <NumberField label={t('最大耗时（秒）')} value={item.duration} disabled={disabled} onChange={duration => patch({ duration })}/>
      </>}
    </EditorRows>}
  </div>;
}

function BenchmarkStopFields({ draft, update, disabled }) {
  const t = useChannelText();
  return <div className="benchmark-fields">
    <div className="benchmark-field-grid">
      {[['executionWarmup', '预热（%）', 0, 100, 0.1], ['executionCooldown', '冷却（%）', 0, 100, 0.1],
        ['maxErrors', '错误数上限', 0], ['maxErrorPercent', '错误率上限（%）', 1, 99, 0.1]].map(([key,label,min,max,step]) =>
        <NumberField key={key} label={t(label)} value={draft[key]} min={min} max={max} step={step} disabled={disabled}
          onChange={value => update({ [key]: value })}/>)}
    </div>
    <Toggle label={t('过饱和时停止')} checked={draft.stopOnSaturation} disabled={disabled} onChange={stopOnSaturation => update({ stopOnSaturation })}/>
  </div>;
}

function BenchmarkEditor({ editor, records, commit, busy, onClose, dirtyRef }) {
  const t = useChannelText();
  const formId = useId();
  const row = editor.row;
  const pending = useRef(false);
  const message = useRef(null);
  const [dirty,setDirty] = useState(false);
  const [discard,setDiscard] = useState(false);
  const [section,setSection] = useState('basic');
  const [error,setError] = useState('');
  const [draft,setDraft] = useState(() => initialBenchmarkDraft(records, row, editor.preset, { clone: Boolean(editor.action || editor.title?.includes('克隆')) }));
  useEffect(() => { if (error) message.current?.focus(); }, [error]);
  const update = patch => {
    const now = new Date();
    const random = Math.random();
    setDraft(previous=>row ? {...previous,...patch} : updateBenchmarkDraft(records,previous,patch,now,random));
    setError('');
    setDirty(true);
    dirtyRef.current = true;
  };
  const close = () => {
    if (busy || pending.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const submit = async event => {
    event.preventDefault();
    if (busy || pending.current) return;
    pending.current = true;
    setError('');
    try {
      await commit((latest, all) => saveAlignedBenchmark(latest, all, draft, row), '已保存');
      onClose();
    } catch (issue) { setError(issue.message); }
    finally { pending.current = false; }
  };
  const shared = { draft, update, disabled: Boolean(row) };
  const subpages = [
    ['basic', '基本信息', <BenchmarkBasic {...shared} records={records} row={row}/>],
    ['workload', '数据集与工作负载', <BenchmarkWorkload {...shared}/>],
    ...(draft.profile !== '最大吞吐量' ? [['slo', '延迟 SLO', <BenchmarkSloFields {...shared}/>]] : []),
    ['load', '负载配置', <BenchmarkLoadFields {...shared}/>],
    ['execution', '停止条件', <BenchmarkStopFields {...shared}/>],
  ];
  return <>
    <AdminSideSheet visible title={t(editor.title || (row ? '编辑基准测试' : '添加基准测试'))} width="min(760px, 100vw)"
      onCancel={close} closeOnEsc={!busy && !discard} className="benchmark-editor" footer={<>
        <Button disabled={busy} onClick={close}>{t('取消')}</Button>
        <Button form={formId} htmlType="submit" theme="solid" type="primary" loading={busy}>{t('确定')}</Button>
      </>}>
      <form id={formId} onSubmit={submit}>
        {error && <div ref={message} tabIndex={-1}><Banner type="danger" fullMode={false} closeIcon={null} description={t(error)}/></div>}
        <Tabs activeKey={section} onChange={setSection}>
          {subpages.map(([key,label,content]) => <Tabs.TabPane key={key} itemKey={key} tab={t(label)}>{section === key && content}</Tabs.TabPane>)}
        </Tabs>
      </form>
    </AdminSideSheet>
    {discard && serviceOperationsUi.renderLeaveDialog({ cancel: () => setDiscard(false), discard: onClose })}
  </>;
}

export function BenchmarkAdvancedFacts({ row }) {
  const t = useChannelText();
  const labels = Array.isArray(row.labels) ? row.labels : Object.entries(row.labels || {}).map(([key,value]) => ({ key,value }));
  const facts = [
    ['最大总耗时（秒）', row.maxTotalSeconds], ['错误率上限（%）', row.maxErrorPercent],
    ...BENCHMARK_SLO.map(([key,label]) => [`${label}（ms）`, row.sloTargets?.[key]]),
  ].filter(([,value]) => isSet(value));
  if (!facts.length && !labels.length) return null;
  return <Card title={t('执行条件')} style={{ width: '100%' }}>
    {!!facts.length && <AdminDescriptions align="left" data={facts.map(([label,value]) => ({ key:t(label),value }))}/>}
    {!!labels.length && <Space wrap>{labels.map(item => <Tag key={item.key}>{`${item.key}=${item.value}`}</Tag>)}</Space>}
  </Card>;
}

function readArchiveSettings() {
  const settings = JSON.parse(localStorage.getItem(benchmarkArchiveStorageKey) || '{}');
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('归档空间设置格式有误。');
  return settings;
}

function capacityText(bytes) {
  if (bytes == null) return '不限容量';
  if (bytes === 0) return '0 B';
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} MiB`;
  return `${benchmarkBytesToGiB(bytes).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GiB`;
}

export function BenchmarkArchiveSettings({ records }) {
  const t = useChannelText();
  const [draft,setDraft] = useState(null);
  const [error,setError] = useState('');
  const [readFailed,setReadFailed] = useState(false);
  if (records.actorRole !== '平台管理员') return null;
  const used = draft ? benchmarkArchiveUsage(records['ops-benchmarks'] || []) : 0;
  const load = () => {
    setError('');
    setReadFailed(false);
    try {
      const existing = readArchiveSettings().benchmarkArchive;
      setDraft({ unlimited: existing?.unlimited ?? true, limit: existing?.limit ?? 20, existing });
    } catch (issue) {
      setReadFailed(true);
      setDraft({ unlimited: true, limit: 20 });
      setError(issue.message);
    }
  };
  const save = () => {
    try {
      const capacity = benchmarkArchiveCapacity(draft.unlimited, draft.limit);
      const latest = readArchiveSettings();
      if (JSON.stringify(latest.benchmarkArchive) !== JSON.stringify(draft.existing)) throw Error('归档空间设置已更新，请重新打开。');
      localStorage.setItem(benchmarkArchiveStorageKey, JSON.stringify({ ...latest, benchmarkArchive: {
        unlimited: draft.unlimited, limit: capacity === null ? null : benchmarkBytesToGiB(capacity),
      } }));
      Toast.success(t('归档空间设置已保存'));
      setDraft(null);
    } catch (issue) { setError(issue.message); }
  };
  let capacity, invalidLimit = false;
  if (draft) {
    try { capacity = benchmarkArchiveCapacity(draft.unlimited, draft.limit); }
    catch { invalidLimit = true; }
  }
  const remaining = capacity == null ? null : Math.max(0, capacity - used);
  return <><Button onClick={load}>{t('归档空间')}</Button>
    {draft && <AdminModal title={t('基准测试归档空间')} visible onCancel={() => setDraft(null)} okText={t('保存')}
      onOk={save} okButtonProps={{ disabled: readFailed || invalidLimit }}>
      <Space vertical align="start" style={{ width:'100%' }}>
        {error && <Banner type="danger" closeIcon={null} description={t(error)}/>}
        {readFailed ? <Button onClick={load}>{t('重新加载')}</Button> : <>
          <AdminDescriptions align="left" data={[
            { key:t('已保存的模拟监控数据'), value:capacityText(used) },
            { key:t('剩余空间'), value:capacityText(remaining) },
          ]}/>
          {capacity != null && capacity < used && <Banner type="warning" fullMode={false} closeIcon={null}
            description={t('容量上限低于已使用空间。现有归档会保留。')}/>}
          {capacity != null && capacity === used && <Banner type="danger" fullMode={false} closeIcon={null}
            description={t('归档空间已满。')}/>}
          {capacity != null && capacity > used && used / capacity >= 0.9 && <Banner type="warning" fullMode={false} closeIcon={null}
            description={t('归档空间使用率达到 90%。')}/>}
          <Toggle label={t('不限容量')} checked={draft.unlimited} onChange={unlimited => { setDraft({ ...draft, unlimited }); setError(''); }}/>
          {!draft.unlimited && <NumberField label={t('容量上限（GiB）')} value={draft.limit} min={1 / 1024 ** 3} suffix="GiB"
            onChange={limit => { setDraft({ ...draft, limit }); setError(''); }}/>}</>}
      </Space>
    </AdminModal>}</>;
}

export const BENCHMARK_ALIGNMENT_VIEW = { Editor: BenchmarkEditor, Header: BenchmarkArchiveSettings };
