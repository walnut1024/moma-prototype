import { useId, useMemo, useState } from 'react';
import { Button, Checkbox, DatePicker, Input, InputNumber, RadioGroup, Select, Space, TagInput, TextArea, Typography } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { CopyId, Field, Modal, Notice } from './ServiceUI';
import { internalEnterprise } from './enterprise';
import { marketCardFeatures, marketCardFieldError, marketCardFieldValues, marketCardIssues, marketCardOutputOptions,
  marketCardLinkableServices, marketCardServices, marketCardStatus, marketCardStatuses, marketScopeOptions, scopeFields } from '../market-cards.mjs';
import { MODEL_TYPES } from './model-management';
import { INPUT_MODALITY_OPTIONS } from './model-profile';

const options = entries => Object.entries(entries).map(([value, label]) => ({ value, label }));
const modalityOptions = values => values.map(value => ({ value, label: value }));
const blankScope = { type: 'selected', tenantIds: [] };

export default function MarketCardDialogs({ kind, row, state, ops, materials, internal, close, open }) {
  const creating = kind === 'create';
  const linking = kind === 'link';
  const [sourceId, setSourceId] = useState('');
  const [revision] = useState(state.revision);
  const [values, setValues] = useState(() => marketCardFieldValues(row));
  const [importMaterial, setImportMaterial] = useState(false);
  const formId = useId();
  const services = useMemo(() => linking ? marketCardLinkableServices(state, row.modelId)
    : row?.modelId ? marketCardServices(state, row.modelId) : [], [state, linking, row?.modelId]);
  const [linked, setLinked] = useState(() => (row?.card.linked || []).filter(id => services.some(service => service.id === id)));
  const [status, setStatus] = useState(() => row && marketCardStatus(row.card));
  const [scope, setScope] = useState(() => row?.card.scope.type === 'selected' ? row.card.scope : blankScope);
  const [shown, setShown] = useState(() => row?.card.shown.length
    ? row.card.shown.filter(id => linked.includes(id))
    : services.filter(service => service.started && linked.includes(service.id)).map(service => service.id));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = revision !== state.revision;
  const cancel = () => { if (!busy) ops.proceed(close); };
  const save = async (operation, data, goNext = false) => {
    setBusy(true);
    try {
      const next = await ops.run(operation, { ...data, ...(row && { card_id: row.cardId }), expectedRevision: revision }, row?.modelId);
      if (next) {
        if (goNext) open('link', next.audits[0].objectId);
        else close();
      }
    } finally {
      setBusy(false);
    }
  };
  const update = (key, value) => { setValues(current => ({ ...current, [key]: value })); ops.dirty(true); };
  const toggle = (ids, id) => ids.includes(id) ? ids.filter(key => key !== id) : [...ids, id];
  const unavailable = !ops.can || busy || changed;
  const errors = <>
    {changed && <Notice error>工作区已更新，请重新打开后核对。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </>;
  const footer = (label, onClick, disabled, danger = false) => <>
    <Button disabled={busy} onClick={cancel}>取消</Button>
    <Button theme="solid" type={danger ? 'danger' : 'primary'} loading={busy} disabled={unavailable || disabled}
      onClick={onClick}>{label}</Button>
  </>;

  if (creating || kind === 'edit') {
    const disabled = unavailable || creating && importMaterial && !sourceId;
    const submit = (goNext = false) => {
      if (disabled) return;
      const error = marketCardFieldError(values);
      if (error) { ops.setError(error); return; }
      void save(creating ? 'marketCardCreate' : 'marketCardEdit', {
        ...values, ...(creating && importMaterial && { source_model_id: sourceId }),
      }, goNext);
    };
    const chooseModel = id => {
      setSourceId(id);
      copyCardInfo(materials.find(item => item.id === id));
      ops.dirty(true);
    };
    const copyCardInfo = model => {
      if (!model) return;
      const info = marketCardFieldValues(model);
      setValues(current => ({ ...info, name: current.name, heat: current.heat, features: current.features }));
    };
    const numberField = (key, properties = {}) => <InputNumber style={{ width: '100%' }} {...properties}
      value={values[key]} onChange={value => update(key, value === '' ? '' : Number(value))}/>;
    const multi = (key, choices) => <Select multiple style={{ width: '100%' }} optionList={modalityOptions(choices)}
      value={values[key]} onChange={value => update(key, value)}/>;
    return <Modal wide centered title={creating ? '新建模型卡片' : '编辑信息'} onClose={cancel}
      footer={creating ? <>
        <Button disabled={busy} onClick={cancel}>取消</Button>
        <Button form={formId} htmlType="submit" disabled={disabled}>仅创建</Button>
        <Button theme="solid" loading={busy} disabled={disabled} onClick={() => submit(true)}>创建并关联服务</Button>
      </> : <>
        <Button disabled={busy} onClick={cancel}>取消</Button>
        <Button form={formId} htmlType="submit" theme="solid" loading={busy} disabled={disabled}>保存修改</Button>
      </>}>
      <form id={formId} onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="ss-form-grid">
          <Field label="模型展示名" required><Input value={values.name} maxLength={100} onChange={value => update('name', value)}/></Field>
          <Field label="热度设置">{numberField('heat', { min: 0 })}</Field>
        </div>
        <Space wrap style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography.Title heading={6}>卡片信息</Typography.Title>
          {creating && <RadioGroup type="button" aria-label="卡片信息填写方式"
            value={importMaterial ? 'import' : 'manual'} options={options({ manual: '手动填写', import: '从基础资料导入' })}
            onChange={event => {
              setImportMaterial(event.target.value === 'import');
              setSourceId('');
              ops.dirty(true);
            }}/>}
        </Space>
        {creating && importMaterial && <Field label="模型资料名称" required>
          <Select filter style={{ width: '100%' }} placeholder="请选择模型资料" value={sourceId || undefined}
            optionList={materials.map(item => ({ value: item.id, label: `${item.name} · ${item.modelId}` }))}
            onChange={chooseModel}/>
        </Field>}
        {!creating && row.canonicalSlug && <Field label="模型编码"><Input readOnly value={row.canonicalSlug}/></Field>}
        <div className="ss-form-grid">
          <Field label="模型中文简介" required><TextArea rows={3} value={values.description} maxLength={5000} onChange={value => update('description', value)}/></Field>
          <Field label="模型英文简介" required><TextArea rows={3} value={values.description_en} maxLength={5000} onChange={value => update('description_en', value)}/></Field>
          <Field label="模型类型" required><Select style={{ width: '100%' }} optionList={options(MODEL_TYPES)} value={values.type || undefined} onChange={value => update('type', value)}/></Field>
          <Field label="上下文长度" required>{numberField('context_length', { min: 1, suffix: 'Token' })}</Field>
          <Field label="模型系列" required><Input value={values.family} maxLength={100} onChange={value => update('family', value)}/></Field>
          <Field label="模型精度" required><Input value={values.precision} maxLength={100} onChange={value => update('precision', value)}/></Field>
          <Field label="输入模态" required>{multi('input_modalities', INPUT_MODALITY_OPTIONS)}</Field>
          <Field label="输出模态" required>{multi('output_modalities', marketCardOutputOptions)}</Field>
          <Field label="模型标签" required><TagInput aria-label="模型标签" max={20} maxLength={50} addOnBlur
            placeholder="输入后按回车添加" value={values.tags} onChange={value => update('tags', value)}/></Field>
          <Field label={<span id={formId + '-release'}>模型发布日期</span>} required><DatePicker style={{ width: '100%' }}
            aria-labelledby={formId + '-release'} aria-required type="date" onChangeWithDateFirst={false} format="yyyy-MM-dd"
            value={values.release_date.length === 10 ? values.release_date : undefined}
            placeholder={values.release_date || '选择日期'} onChange={value => update('release_date', value || '')}/></Field>
          <Field label="参数量">{numberField('parameters', { min: 0, step: 0.1, suffix: 'B' })}</Field>
        </div>
        <Typography.Title heading={6}>功能</Typography.Title>
        <Space wrap>{Object.entries(marketCardFeatures).map(([key, label]) => <Checkbox key={key} checked={values.features[key] === true}
          onChange={event => update('features', { ...values.features, [key]: event.target.checked })}>{label}</Checkbox>)}</Space>
        {errors}
      </form>
    </Modal>;
  }

  const listing = status === 'formal' || status === 'gray';
  const selected = linking ? linked : shown;
  const selectedModel = linking && services.find(service => linked.includes(service.id))?.modelId;
  const entries = (linking ? services : services.filter(service => linked.includes(service.id)))
    .filter(service => `${service.name} ${service.callId}`.toLowerCase().includes(search.trim().toLowerCase()));
  const scopeOptions = marketScopeOptions(state);
  const companyId = internal ? internalEnterprise(state)?.id : null;
  const updateScope = value => { setScope(value); ops.dirty(true); };
  const issues = linking || !listing ? [] : marketCardIssues({
    ...row.card, content: row.card.content || { name: row.name, description: row.description }, shown,
    scope: status === 'gray' ? scope : { type: 'all' },
  }, services);
  const linkChanged = linked.length !== row.card.linked.length || linked.some(id => !row.card.linked.includes(id));
  return <Modal wide centered={!linking} drawer={linking} title={linking ? '关联服务' : '上架状态设置'}
    description={row.name} onClose={cancel}
    footer={linking ? footer('保存关联', () => save('marketCardLink', { serviceIds: linked }), !linkChanged)
      : footer(status === 'withdrawn' ? '确认下架' : '保存状态', () => save('marketCardSetStatus', {
        listing_stage: status, ...(listing && { serviceIds: shown }), ...(status === 'gray' && { scope }),
      }), !Object.hasOwn(marketCardStatuses, status) || issues.length > 0, status === 'withdrawn')}>
    {linking && <Field label="筛选服务"><Input value={search} placeholder="搜索模型或模型调用标识" onChange={setSearch}/></Field>}
    {!linking && <Field label="上架状态" required><Select style={{ width: '100%' }} optionList={options(marketCardStatuses)}
      placeholder="请选择上架状态" value={Object.hasOwn(marketCardStatuses, status) ? status : undefined}
      onChange={value => { setStatus(value); ops.dirty(true); }}/></Field>}
    {!linking && status === 'preview' && <p>前台卡片显示「敬请期待」，用户无法进入详情。</p>}
    {!linking && status === 'withdrawn' && <p>卡片将从前台模型广场移除。</p>}
    {!linking && listing && <Typography.Title heading={6}>展示服务</Typography.Title>}
    {(linking || listing) && <Table size="small" rowKey="id" dataSource={entries} pagination={false}
      empty={linking ? '暂无可关联的模型服务' : '请先关联模型服务'} columns={[
        { title: '选择', width: 70, render: (_, service) => <Checkbox aria-label={`选择 ${service.callId}`}
          checked={selected.includes(service.id)} disabled={unavailable || (linking
            ? (selectedModel && selectedModel !== service.modelId) || row.card.status === 'listed' && row.card.shown.includes(service.id)
            : !service.started && !selected.includes(service.id))}
          onChange={() => {
            (linking ? setLinked : setShown)(toggle(selected, service.id));
            ops.dirty(true);
          }}/> },
        ...(linking && !row.modelId ? [{ title: '模型', dataIndex: 'name' }] : []),
        { title: '模型调用标识', render: (_, service) => <CopyId value={service.callId}/> },
        { title: '服务状态', render: (_, service) => <AdminStatus value={service.started ? '已启动' : '已停止'}/> },
        ...(linking ? [{ title: '当前展示', render: (_, service) => row.card.status === 'listed' && row.card.shown.includes(service.id) ? '展示中' : '未展示' }] : []),
      ]}/>}
    {linking ? <Typography.Text type="tertiary">已选择 {linked.length} 个服务。解除关联前，请先在「上架状态设置」中移除正在展示的服务。</Typography.Text>
    : listing && <>
      {status === 'formal' && <Typography.Text>可见范围为全部用户。</Typography.Text>}
      {status === 'gray' && Object.entries(scopeFields).filter(([key]) => !internal || key !== 'tenantIds').map(([key, label]) => (
        <Field key={key} label={'可见' + label}>
          <Select multiple filter maxTagCount={3} showRestTagsPopover style={{ width: '100%' }} value={scope[key] || []}
            optionList={scopeOptions[key].filter(row => !internal || row.tenantId === companyId)}
            placeholder={'选择' + label} onChange={ids => updateScope({ ...scope, [key]: ids })}/>
        </Field>
      ))}
      {issues.map(issue => <Notice key={issue} error>{issue}</Notice>)}
    </>}
    {errors}
  </Modal>;
}
