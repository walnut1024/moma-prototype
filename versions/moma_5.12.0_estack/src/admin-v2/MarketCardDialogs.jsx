import { useChannelText } from './channel-language';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, DatePicker, Input, InputNumber, RadioGroup, Select, Space, TagInput, TextArea, Typography, Upload } from '@douyinfe/semi-ui';
import { IconSearch, IconUpload } from '@douyinfe/semi-icons';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { CopyId, Field, Modal, Notice } from './ServiceUI';
import { marketCardFeatures, marketCardFieldError, marketCardFieldValues, marketCardIssues, marketCardOutputOptions,
  marketCardDeleteIssue, marketCardLinkableServices, marketCardServices, marketCardStatus, marketCardStatuses, marketScopeOptions } from '../market-cards.mjs';
import { MODEL_TYPES } from './model-management';
import { INPUT_MODALITY_OPTIONS } from './model-profile';
import { materialContextUnit, materialContextUnits } from './model-material-fields';
import { readMaterialLogo } from './MaterialLogo';

const modalityOptions = values => values.map(value => ({ value, label: value }));
const contextOptions = modalityOptions(Object.keys(materialContextUnits));
const cardContext = tokens => {
  const unit = materialContextUnit(tokens);
  return { unit, amount: tokens > 0 ? String(tokens / materialContextUnits[unit]) : '' };
};

export default function MarketCardDialogs({ kind, row, state, ops, materials, internal, close, open }) {
  const translateLabel = useChannelText();
  const options = entries => Object.entries(entries).map(([value, label]) => ({ value, label:translateLabel(label) }));
  const creating = kind === 'create';
  const linking = kind === 'link';
  const [sourceId, setSourceId] = useState('');
  const [revision] = useState(state.revision);
  const [values, setValues] = useState(() => marketCardFieldValues(row));
  const [context, setContext] = useState(() => cardContext(values.context_length));
  const [importMaterial, setImportMaterial] = useState(false);
  const formId = useId();
  const services = useMemo(() => row ? marketCardServices(state) : [], [state, row]);
  const [linked, setLinked] = useState(row?.card.linked || []);
  const [status, setStatus] = useState(() => row && marketCardStatus(row.card));
  const [tenantIds, setTenantIds] = useState(() => row?.card.scope.tenantIds || []);
  const [shown, setShown] = useState(() => row?.card.shown.length
    ? row.card.shown.filter(id => linked.includes(id))
    : services.filter(service => service.started && linked.includes(service.id)).map(service => service.id));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const logoUpload = useRef(0);
  useEffect(() => () => { logoUpload.current++; }, []);
  const changed = revision !== state.revision;
  const cancel = () => { if (!busy) ops.proceed(close); };
  const save = async (operation, data, goNext = false) => {
    setBusy(true);
    try {
      const next = await ops.run(operation, { ...data, ...(row && { card_id: row.cardId }), expectedRevision: revision }, row?.modelId);
      if (next) {
        if (goNext) open('link', next.audits[0].objectId);
        else close(kind === 'delete');
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
    <Button disabled={busy} onClick={cancel}>{translateLabel("取消")}</Button>
    <Button theme="solid" type={danger ? 'danger' : 'primary'} loading={busy} disabled={unavailable || disabled}
      onClick={onClick}>{translateLabel(label)}</Button>
  </>;

  if (kind === 'delete') {
    const issue = marketCardDeleteIssue(row.card);
    return <Modal title="删除模型卡片" description={row.name} centered onClose={cancel}
      footer={footer('确认删除', () => save('marketCardDelete', { confirmed: true }), Boolean(issue), true)}>
      {issue ? <Notice error>{translateLabel(issue)}</Notice>
        : <Typography.Paragraph>{translateLabel('删除后，卡片信息及其与模型服务的关联一并删除，模型服务和模型售卖保留，不可恢复。')}</Typography.Paragraph>}
      {errors}
    </Modal>;
  }

  if (creating || kind === 'edit') {
    const disabled = unavailable || uploading || importMaterial && !sourceId;
    const canonicalSlug = materials.find(item => item.id === sourceId)?.modelId || row?.canonicalSlug;
    const uploadLogo = async ([file]) => {
      if (!file || unavailable || uploading) return;
      const request = ++logoUpload.current;
      setUploading(true);
      setLogoError('');
      try {
        const logo = await readMaterialLogo(file, 1024 * 1024, 128);
        if (logoUpload.current === request) update('logo', logo);
      } catch (error) {
        if (logoUpload.current === request) setLogoError(error.message);
      } finally {
        if (logoUpload.current === request) setUploading(false);
      }
    };
    const tokens = context.amount.trim() ? Number(context.amount) * materialContextUnits[context.unit] : '';
    const submit = (goNext = false) => {
      if (disabled) return;
      const data = { ...values, context_length: tokens, ...(importMaterial && { source_model_id: sourceId }) };
      const error = marketCardFieldError(data);
      if (error) { ops.setError(error); return; }
      void save(creating ? 'marketCardCreate' : 'marketCardEdit', data, goNext);
    };
    const chooseModel = id => {
      setSourceId(id);
      const model = materials.find(item => item.id === id);
      if (!model) return;
      const info = marketCardFieldValues(model);
      const provided = Object.fromEntries(Object.entries(info).filter(([key, value]) =>
        !['name', 'heat', 'features', 'context_length'].includes(key) && (Array.isArray(value) ? value.length : value !== '')));
      setValues(current => ({ ...current, ...provided }));
      setLogoError('');
      if (Number.isSafeInteger(info.context_length) && info.context_length > 0) setContext(cardContext(info.context_length));
      ops.setError('');
      ops.dirty(true);
    };
    const numberField = (key, properties = {}) => <InputNumber style={{ width: '100%' }} {...properties}
      value={values[key]} onChange={value => update(key, value === '' ? '' : Number(value))}/>;
    const multi = (key, choices) => <Select multiple style={{ width: '100%' }} optionList={modalityOptions(choices)}
      value={values[key]} onChange={value => update(key, value)}/>;
    return <Modal wide centered title={creating ? '新建模型卡片' : '编辑信息'} onClose={cancel}
      footer={creating ? <>
        <Button disabled={busy} onClick={cancel}>{translateLabel("取消")}</Button>
        <Button form={formId} htmlType="submit" disabled={disabled}>{translateLabel("仅创建")}</Button>
        <Button theme="solid" loading={busy} disabled={disabled} onClick={() => submit(true)}>{translateLabel("创建并关联模型服务")}</Button>
      </> : <>
        <Button disabled={busy} onClick={cancel}>{translateLabel("取消")}</Button>
        <Button form={formId} htmlType="submit" theme="solid" loading={busy} disabled={disabled}>{translateLabel("保存修改")}</Button>
      </>}>
      <form id={formId} onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="ss-form-grid">
          <Field label="模型展示名称" required><Input value={values.name} maxLength={100} onChange={value => update('name', value)}/></Field>
          <Field label="热度设置">{numberField('heat', { min: 0 })}</Field>
        </div>
        <Field label="图标" hint="支持 PNG、JPEG、WebP，最大 1 MB。" error={logoError}>
          <Space>
            {values.logo && <img src={values.logo} alt="模型卡片图标预览" width={64} height={64}
              style={{ objectFit: 'contain' }} referrerPolicy="no-referrer"/>}
            <Upload accept="image/png,image/jpeg,image/webp" uploadTrigger="custom" fileList={[]} showUploadList={false}
              disabled={unavailable || uploading} onFileChange={uploadLogo}>
              <Button icon={<IconUpload aria-hidden/>} loading={uploading} disabled={unavailable}>
                {values.logo ? translateLabel('更换图片') : translateLabel('上传图片')}
              </Button>
            </Upload>
            {values.logo && <Button theme="borderless" disabled={unavailable || uploading}
              onClick={() => { setLogoError(''); update('logo', ''); }}>{translateLabel("移除图片")}</Button>}
          </Space>
        </Field>
        <Space wrap style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography.Title heading={6}>{translateLabel("卡片信息")}</Typography.Title>
          <RadioGroup type="button" aria-label="卡片信息填写方式" disabled={unavailable || uploading}
            value={importMaterial ? 'import' : 'manual'} options={options({ manual: '手动填写', import: '从基础资料导入' })}
            onChange={event => {
              setImportMaterial(event.target.value === 'import');
              setSourceId('');
              ops.dirty(true);
            }}/>
        </Space>
        {importMaterial && <Field label="模型资料" required>
          <Select filter style={{ width: '100%' }} placeholder={translateLabel("请选择模型资料")} value={sourceId || undefined} disabled={unavailable || uploading}
            optionList={materials.map(item => ({ value: item.id, label: `${item.name} · ${item.modelId}` }))}
            onChange={chooseModel}/>
        </Field>}
        {canonicalSlug && <Field label="模型编码"><Input readOnly value={canonicalSlug}/></Field>}
        <div className="ss-form-grid">
          <Field label="模型中文简介" required><TextArea rows={3} value={values.description} maxLength={5000} onChange={value => update('description', value)}/></Field>
          <Field label="模型英文简介" required><TextArea rows={3} value={values.description_en} maxLength={5000} onChange={value => update('description_en', value)}/></Field>
          <Field label="模型类型" required><Select style={{ width: '100%' }} optionList={options(MODEL_TYPES)} value={values.type || undefined} onChange={value => update('type', value)}/></Field>
          <Field label="上下文长度" required>
            <div className="market-context-field">
              <Input aria-label={translateLabel("上下文长度")} aria-required inputMode="decimal" value={context.amount}
                onChange={amount => { setContext({ ...context, amount }); ops.dirty(true); }}/>
              <Select aria-label={translateLabel("上下文长度单位")} value={context.unit} optionList={contextOptions}
                onChange={unit => {
                  setContext({ unit, amount: Number.isFinite(tokens) ? String(tokens / materialContextUnits[unit]) : context.amount });
                  ops.dirty(true);
                }}/>
            </div>
          </Field>
          <Field label="模型系列" required><Input value={values.family} maxLength={100} onChange={value => update('family', value)}/></Field>
          <Field label="模型精度" required><Input value={values.precision} maxLength={100} onChange={value => update('precision', value)}/></Field>
          <Field label="输入模态" required>{multi('input_modalities', INPUT_MODALITY_OPTIONS)}</Field>
          <Field label="输出模态" required>{multi('output_modalities', marketCardOutputOptions)}</Field>
          <Field label="模型标签" required><TagInput aria-label={translateLabel("模型标签")} max={20} maxLength={50} addOnBlur
            placeholder={translateLabel("输入后按回车添加")} value={values.tags} onChange={value => update('tags', value)}/></Field>
          <Field label={<span id={formId + '-release'}>{translateLabel("模型发布日期")}</span>} required><DatePicker style={{ width: '100%' }}
            aria-labelledby={formId + '-release'} aria-required type="date" onChangeWithDateFirst={false} format="yyyy-MM-dd"
            value={values.release_date.length === 10 ? values.release_date : undefined}
            placeholder={values.release_date || '选择日期'} onChange={value => update('release_date', value || '')}/></Field>
          <Field label="参数量">{numberField('parameters', { min: 0, step: 0.1, suffix: 'B' })}</Field>
        </div>
        <Typography.Title heading={6}>{translateLabel("功能")}</Typography.Title>
        <Space wrap>{Object.entries(marketCardFeatures).map(([key, label]) => <Checkbox key={key} checked={values.features[key] === true}
          onChange={event => update('features', { ...values.features, [key]: event.target.checked })}>{label}</Checkbox>)}</Space>
        {errors}
      </form>
    </Modal>;
  }

  const listing = status === 'formal' || status === 'gray';
  const savedLinks = new Set(row.card.linked);
  const serviceById = new Map(services.map(service => [service.id, service]));
  const linkedRows = linked.filter(id => savedLinks.has(id)).map(id => serviceById.get(id) || { id });
  const candidates = marketCardLinkableServices(services, linked, row.card.linked)
    .filter(service => !(savedLinks.has(service.id) && linked.includes(service.id)));
  const matches = service => [service.serviceName, service.name, service.callId, service.id].join(' ')
    .toLowerCase().includes(search.trim().toLowerCase());
  const showing = service => row.card.status === 'listed' && row.card.shown.includes(service.id) && serviceById.has(service.id);
  const changeLink = id => { setLinked(current => toggle(current, id)); ops.dirty(true); };
  const callIdColumn = { title: '模型 ID', render: (_, service) => <CopyId value={service.callId} label="模型 ID" copyAtStart ellipsis/> };
  const stateColumn = { title: '服务状态', width: 100, render: (_, service) =>
    service.callId ? <AdminStatus value={service.started ? '服务中' : '已停服'}/> : '不可用' };
  const serviceColumns = [
    { title: '模型服务名称 / ID', render: (_, service) => <div className="market-link-service-identity">
      {service.serviceName && <Typography.Text ellipsis={{ showTooltip: true }}>{service.serviceName}</Typography.Text>}
      <CopyId value={service.id} label="模型服务 ID" copyAtStart ellipsis/>
    </div> },
    callIdColumn, stateColumn,
  ];
  const scopeOptions = marketScopeOptions(state).filter(row => !internal || row.value === state.spacePolicy?.internalTenantId);
  const scope = { type: 'selected', tenantIds };
  const issues = linking || !listing ? [] : marketCardIssues({
    ...row.card, content: row.card.content || { name: row.name, description: row.description }, shown,
    scope: status === 'gray' ? scope : { type: 'all' },
  }, services);
  const linkChanged = linked.length !== row.card.linked.length || linked.some(id => !row.card.linked.includes(id));
  return <Modal wide centered={!linking} drawer={linking} className={linking ? 'market-link-dialog' : ''} title={linking ? '关联模型服务' : '设置可见性'}
    description={row.name} onClose={cancel}
    footer={linking ? footer('保存关联', () => save('marketCardLink', { serviceIds: linked }), !linkChanged)
      : footer('保存可见性', () => save('marketCardSetStatus', {
        listing_stage: status, ...(listing && { serviceIds: shown }), ...(status === 'gray' && { scope }),
      }), !Object.hasOwn(marketCardStatuses, status) || issues.length > 0, status === 'withdrawn')}>
    {linking && <>
      <section aria-label={translateLabel("已关联模型服务")}>
        <Typography.Title heading={6}>已关联模型服务（{linkedRows.length}）</Typography.Title>
        <Table rowKey="id" dataSource={linkedRows} pagination={false} scroll={{ x: 'max(100%, 600px)' }}
          empty="还没有关联模型服务" columns={[...serviceColumns, {
            title: '操作', width: 88, fixed: 'right', render: (_, service) => showing(service)
              ? <Typography.Text type="tertiary">{translateLabel("展示中")}</Typography.Text>
              : <Button theme="borderless" size="small" type="danger" disabled={unavailable}
                aria-label={`移除 ${service.callId || service.id}`} onClick={() => changeLink(service.id)}>{translateLabel("移除")}</Button>,
          }]}/>
        {linkedRows.some(showing) && <Typography.Text type="tertiary">展示中的服务需先在「设置可见性」中取消展示，再移除关联。</Typography.Text>}
      </section>
      <section aria-label={translateLabel("可关联的模型服务")}>
        <Typography.Title heading={6}>{translateLabel("可关联的模型服务")}</Typography.Title>
        <Input showClear prefix={<IconSearch aria-hidden="true"/>} aria-label="搜索可关联模型服务" value={search}
          placeholder="搜索服务名称、模型 ID 或模型服务 ID" onChange={setSearch}/>
        <Typography.Text type="tertiary">{translateLabel("请确认所选服务与卡片展示的是同一款模型。")}</Typography.Text>
        <Table rowKey="id" dataSource={candidates.filter(matches)} pagination={false} scroll={{ x: 'max(100%, 600px)' }}
          empty={search.trim() ? '没有匹配的模型服务' : '暂无可关联的模型服务'}
          columns={[{ title: '选择', width: 64, render: (_, service) => <Checkbox aria-label={`选择 ${service.callId}`}
            checked={linked.includes(service.id)} disabled={unavailable}
            onChange={() => changeLink(service.id)}/> }, ...serviceColumns]}/>
        {linked.length > linkedRows.length && <Typography.Text type="tertiary">已选 {linked.length - linkedRows.length} 个待添加服务</Typography.Text>}
      </section>
    </>}
    {!linking && <Field label="可见性" required><Select style={{ width: '100%' }} optionList={options(marketCardStatuses)}
      placeholder="请选择可见性" value={Object.hasOwn(marketCardStatuses, status) ? status : undefined}
      onChange={value => { setStatus(value); ops.dirty(true); }}/></Field>}
    {!linking && status === 'preview' && <p>前台卡片显示「敬请期待」，用户无法进入详情。关联服务的售卖状态保持不变。</p>}
    {!linking && status === 'withdrawn' && <p>卡片将从前台模型广场移除，关联服务的售卖状态保持不变。</p>}
    {!linking && listing && <Typography.Title heading={6}>{translateLabel("展示服务")}</Typography.Title>}
    {!linking && listing && <Table size="small" rowKey="id" dataSource={services.filter(service => linked.includes(service.id))} pagination={false}
      empty="请先关联可用于展示的模型服务" columns={[
        { title: '选择', width: 70, render: (_, service) => <Checkbox aria-label={`选择 ${service.callId}`}
          checked={shown.includes(service.id)} disabled={unavailable || !service.started && !shown.includes(service.id)}
          onChange={() => {
            setShown(current => toggle(current, service.id));
            ops.dirty(true);
          }}/> },
        ...serviceColumns,
      ]}/>}
    {!linking && listing && <>
      {status === 'formal' && <Typography.Text>可见范围为全部用户。</Typography.Text>}
      {status === 'gray' && <Field label="可见范围" required>
        <Select multiple filter searchPosition="dropdown" searchPlaceholder="搜索租户名称或 ID" maxTagCount={3} showRestTagsPopover
          style={{ width: '100%' }} value={tenantIds} optionList={scopeOptions} placeholder={translateLabel("选择租户")}
          onChange={ids => { setTenantIds(ids); ops.dirty(true); }}/>
      </Field>}
      {issues.map(issue => <Notice key={issue} error>{issue}</Notice>)}
    </>}
    {errors}
  </Modal>;
}
