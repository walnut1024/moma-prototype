import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, RadioGroup, Select, Space, TextArea, Typography } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { CopyId, Field, Modal, Notice } from './ServiceUI';
import { marketCardIssues, marketCardServices, marketScopeOptions, scopeFields } from '../market-cards.mjs';
import { MODEL_CATALOGUE_TYPES } from './model-library';
import { modelCategory } from './model-management';
import { normalizeModelLogo } from './model-profile';

const fieldValues = row => ({ name: row?.name || '', description: row?.description || '', logo: row?.profile?.logo || '' });

export default function MarketCardDialogs({ kind, row, state, ops, materials, internal, close, open }) {
  const creating = kind === 'create';
  const [modelId, setModelId] = useState(row?.modelId || '');
  const [revision] = useState(state.revision);
  const [values, setValues] = useState(() => fieldValues(row));
  const services = useMemo(() => marketCardServices(state, modelId), [state, modelId]);
  const [linked, setLinked] = useState(() => (row?.card.linked || []).filter(id => services.some(service => service.id === id)));
  const [scope, setScope] = useState(row?.card.scope || { type: 'all', tenantIds: [] });
  const [shown, setShown] = useState(() => row?.card.status === 'listed'
    ? row.card.shown.filter(id => linked.includes(id))
    : services.filter(service => service.started && linked.includes(service.id)).map(service => service.id));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const material = materials.find(item => item.id === modelId);
  const source = material || row;
  const changed = revision !== state.revision;
  const cancel = () => { if (!busy) ops.proceed(close); };
  const save = async (operation, data, goNext = false) => {
    if (data.logo && data.logo !== source?.profile?.logo) {
      try { normalizeModelLogo(data.logo.trim()); }
      catch (error) { ops.setError(error.message); return; }
    }
    setBusy(true);
    try {
      const next = await ops.run(operation, { ...data, expectedRevision: revision }, modelId);
      if (next) {
        if (goNext) open('link', modelId);
        else close();
      }
    } finally {
      setBusy(false);
    }
  };
  const update = (key, value) => { setValues({ ...values, [key]: value }); ops.dirty(true); };
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
    const valid = modelId && values.name.trim() && values.description.trim() && !material?.hasCard;
    const disabled = creating ? !valid : !values.name.trim() || !values.description.trim();
    return <Modal wide centered title={creating ? '新建模型卡片' : '编辑模型卡片'} onClose={cancel}
      footer={creating ? <>
        <Button disabled={busy} onClick={cancel}>取消</Button>
        <Button disabled={unavailable || disabled} onClick={() => save('marketCardCreate', values)}>仅创建</Button>
        <Button theme="solid" loading={busy} disabled={unavailable || disabled}
          onClick={() => save('marketCardCreate', values, true)}>创建并关联服务</Button>
      </> : footer('保存修改', () => save('marketCardEdit', values), disabled)}>
      {creating ? <Field label="关联模型" required>
        <Select filter style={{ width: '100%' }} placeholder="请选择已登记模型" value={modelId || undefined}
          optionList={materials.map(item => ({ value: item.id, label: `${item.name} · ${item.modelId}${item.hasCard ? '（已有卡片）' : ''}` }))}
          onChange={id => { setModelId(id); const next = materials.find(item => item.id === id); setValues(fieldValues(next)); ops.dirty(!next?.hasCard); }}/>
      </Field> : <Field label="关联模型"><Input readOnly value={material?.name || row.name}/></Field>}
      {creating && material?.hasCard && <Notice>该模型已存在卡片。 <Button theme="borderless" size="small" onClick={() => open('edit', modelId)}>编辑已有卡片</Button></Notice>}
      <Field label="模型展示名称" required><Input value={values.name} maxLength={100} onChange={value => update('name', value)}/></Field>
      <Space wrap>
        <Field label="模型编码"><Input readOnly value={material?.modelId || row?.canonicalSlug || ''}/></Field>
        <Field label="模型类型"><Input readOnly value={source ? MODEL_CATALOGUE_TYPES[modelCategory(source.type)] || source.type : ''}/></Field>
      </Space>
      <Field label="模型简介" required><TextArea value={values.description} maxLength={5000} onChange={value => update('description', value)}/></Field>
      <Field label="图标 URL（选填）"><Input value={values.logo} onChange={value => update('logo', value)}/></Field>
      {errors}
    </Modal>;
  }

  if (kind === 'unlist') return <Modal centered title="下架模型卡片" description={row.name} onClose={cancel}
    footer={footer('确认下架', () => save('marketCardUnlist', { confirmed: true }), false, true)}>
    <p>下架后，用户将无法在模型广场查看该卡片。已有调用权限、服务状态与销售状态保留。</p>
    {errors}
  </Modal>;

  const linking = kind === 'link';
  const selected = linking ? linked : shown;
  const entries = (linking ? services : services.filter(service => linked.includes(service.id)))
    .filter(service => service.callId.toLowerCase().includes(search.trim().toLowerCase()));
  const scopeOptions = marketScopeOptions(state);
  const companyId = internal ? state.spacePolicy?.internalTenantId : null;
  const updateScope = value => { setScope(value); ops.dirty(true); };
  const issues = linking ? [] : marketCardIssues({
    ...row.card, content: row.card.content || { name: row.name, description: row.description }, shown, scope,
  }, services);
  const linkChanged = linked.length !== row.card.linked.length || linked.some(id => !row.card.linked.includes(id));
  return <Modal wide centered={!linking} drawer={linking} title={linking ? '关联服务' : row.card.status === 'listed' ? '调整上架' : '上架模型卡片'}
    description={row.name} onClose={cancel}
    footer={linking ? footer('保存关联', () => save('marketCardLink', { serviceIds: linked }), !linkChanged)
      : footer(row.card.status === 'listed' ? '保存调整' : '确认上架', () => save('marketCardList', { serviceIds: shown, scope }), issues.length > 0)}>
    {linking && <Field label="筛选服务"><Input value={search} placeholder="搜索模型调用标识" onChange={setSearch}/></Field>}
    {!linking && <Typography.Title heading={6}>展示服务</Typography.Title>}
    <Table size="small" rowKey="id" dataSource={entries} pagination={false}
      empty={linking ? '暂无可关联的模型服务' : '请先关联模型服务'} columns={[
        { title: '选择', width: 70, render: (_, service) => <Checkbox aria-label={`选择 ${service.callId}`}
          checked={selected.includes(service.id)} disabled={unavailable || (linking
            ? row.card.status === 'listed' && row.card.shown.includes(service.id)
            : !service.started && !selected.includes(service.id))}
          onChange={() => {
            (linking ? setLinked : setShown)(toggle(selected, service.id));
            ops.dirty(true);
          }}/> },
        { title: '模型调用标识', render: (_, service) => <CopyId value={service.callId}/> },
        { title: '技术状态', render: (_, service) => <AdminStatus value={service.started ? '已启动' : '已停止'}/> },
        ...(linking ? [{ title: '当前展示', render: (_, service) => row.card.status === 'listed' && row.card.shown.includes(service.id) ? '展示中' : '未展示' }] : []),
      ]}/>
    {linking ? <>
      <Typography.Text type="tertiary">已选择 {linked.length} 个服务。解除关联前，请先在「调整上架」中移除正在展示的服务。</Typography.Text>
      {!services.length && <Button theme="borderless" onClick={() => ops.go({}, { base: 'listing', reset: true })}>前往模型服务</Button>}
    </> : <>
      <Field label="可见范围">
        <RadioGroup aria-label="可见范围" value={scope.type}
          options={[{ value: 'all', label: '全部用户' }, { value: 'selected', label: '指定范围' }]}
          onChange={event => updateScope({ type: event.target.value, tenantIds: [] })}/>
      </Field>
      {scope.type === 'selected' && Object.entries(scopeFields).filter(([key]) => !internal || key !== 'tenantIds').map(([key, label]) => (
        <Field key={key} label={'可见' + label}>
          <Select multiple filter maxTagCount={3} showRestTagsPopover style={{ width: '100%' }} value={scope[key] || []}
            optionList={scopeOptions[key].filter(row => !internal || row.tenantId === companyId)}
            placeholder={'选择' + label} onChange={ids => updateScope({ ...scope, [key]: ids })}/>
        </Field>
      ))}
      <Typography.Text type="tertiary">命中任一所选范围即可查看。模型调用仍按现有权限校验。</Typography.Text>
      {issues.map(issue => <Notice key={issue} error>{issue}</Notice>)}
      {!issues.length && <Typography.Text type="success">上架检查通过</Typography.Text>}
    </>}
    {errors}
  </Modal>;
}
