import { useEffect, useRef, useState } from 'react';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { IconArrowLeft, IconBolt, IconChevronRight, IconCloud, IconSetting } from '@douyinfe/semi-icons';
import SupplierCreationDialog from './SupplierCreationDialog';
import { Choice, Field } from './ServiceUI';
import { Notice } from './ModelOperationsUI';
import { OFFICIAL_CHANNEL_PRESETS } from './official-channel-presets';
import { officialChannelReferences } from './onboarding-presets';
import { providerApiKeyRows, providerApiKeysDraft } from './provider-management';
import { providerKeyGroupKeys } from './provider-key-groups';
import { modelCatalogue } from './model-library';
import SupplierChannelFields from './SupplierChannelFields';
import { supplierBaseUrls } from './supplier-resources';
import { chooseChannelModel } from './channel-create-fields';
import { MODEL_TYPES } from './model-management';

const sources = [
  { code: 'moma', name: '移动云 MoMA', icon: IconCloud, detail: '接入移动云 MoMA 提供的模型' },
  { code: 'deepseek', name: 'DeepSeek', icon: IconBolt, detail: '直连 DeepSeek 官方 API' },
];

const modelSearch = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const initialFields = () => ({
  modelId: '', modelName: '', modelCode: '', modelType: '', name: '自营', baseUrl: '', upstreamModelId: '', interfaceType: 'openai', protocol: 'OpenAI', independent: true, keyGroupId: 'default',
});

export default function CreateChannelDrawer({ state, providers, fixedProvider, libraryId, ops, close, saved }) {
  const [code, setCode] = useState(fixedProvider ? 'manual' : '');
  const [providerId, setProviderId] = useState(fixedProvider?.id || '');
  const [providerName, setProviderName] = useState('');
  const [value, setValue] = useState(() => ({ ...initialFields(), modelId: libraryId || '', baseUrl: supplierBaseUrls(state, fixedProvider)[0] || '' }));
  const [rawKey, setRawKey] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const firstSource = useRef(null);
  const firstField = useRef(null);
  const source = sources.find(row => row.code === code);
  const preset = OFFICIAL_CHANNEL_PRESETS.find(row => row.code === code);
  const models = preset?.models || (code ? modelCatalogue(state) : []);
  const model = models.find(row => row.id === value.modelId);
  const references = preset && officialChannelReferences(state, preset, model);
  const owner = state.providers.find(row => !row.deletedAt && row.id === (preset ? references.supplier.providerId : providerId));
  const keys = owner ? providerApiKeyRows(state, owner).map(row => row.apiKey) : [];
  const groupKey = owner && providerKeyGroupKeys(owner, value.keyGroupId, true, keys)[0];
  const hasKey = value.independent ? Boolean(rawKey.trim()) : groupKey && groupKey.status !== 'disabled' && !groupKey.revokedAt;
  const newProvider = code === 'manual' && providerId === 'new';
  const disabled = saving || !ops.can;
  const customModel = !model && value.modelName.trim() && value.modelCode.trim() && value.modelType;
  const incomplete = (!model && !customModel) || references?.archived || (!preset && !owner && !(newProvider && providerName.trim()))
    || !value.name.trim() || !value.baseUrl.trim() || !value.upstreamModelId.trim() || !hasKey;
  useEffect(() => { if (!ops.can) setRawKey(''); }, [ops.can]);
  useEffect(() => {
    firstField.current?.focus({ preventScroll: true });
  }, [code]);

  const dirty = () => { ops.setError(''); ops.dirty(true); };
  const change = patch => {
    setValue(current => ({ ...current, ...patch }));
    dirty();
  };
  const back = () => ops.proceed(() => {
    setCode('');
    setProviderId('');
    setProviderName('');
    setRawKey('');
    setValue(initialFields());
    ops.setError('');
    requestAnimationFrame(() => firstSource.current?.querySelector('button')?.focus());
  });
  const chooseProvider = id => {
    setProviderId(id);
    setProviderName('');
    setRawKey('');
    change({ independent: true, keyGroupId: 'default', baseUrl: supplierBaseUrls(state, state.providers.find(row => row.id === id))[0] || '' });
  };
  const chooseModel = id => {
    const next = models.find(row => row.id === id);
    change({
      modelId: id,
      ...(next && preset ? {
        baseUrl: !value.baseUrl || value.baseUrl === model?.baseUrl ? next.baseUrl : value.baseUrl,
        upstreamModelId: next.upstreamModelId,
      } : {}),
    });
  };
  const chooseIdentity = (field, input) => change(chooseChannelModel(models, value, field, input));
  const submit = async () => {
    if (busy.current || disabled || incomplete) return;
    busy.current = true;
    setSaving(true);
    try {
      const channelApiKey = value.independent ? (await providerApiKeysDraft([rawKey])).apiKeys[0] : undefined;
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      const supplier = references?.supplier || (newProvider ? { newProvider: { name: providerName } } : { providerId: owner.id });
      const next = await ops.run('channelQuickCreate', {
        ...supplier, ...(channelApiKey ? { channelApiKey } : {}),
        values: {
          interfaceType: value.interfaceType,
          protocol: value.protocol, baseUrl: value.baseUrl, name: value.name,
          authMode: 'group', keyGroupId: value.independent ? 'default' : value.keyGroupId,
          models: [{ ...(references?.model || (model ? { libraryId: model.id } : { newModel: { name: value.modelName, modelId: value.modelCode, type: value.modelType } })), upstreamModelId: value.upstreamModelId }],
        },
      });
      if (next) saved(next, next.audits[0].objectId);
    } catch (error) { ops.setError(error.message); }
    finally { busy.current = false; setSaving(false); }
  };
  return <SupplierCreationDialog drawer title={fixedProvider ? '新增渠道' : '创建渠道'}
    description={source?.name || fixedProvider?.name || (code ? '手动配置' : '选择接入来源')}
    cancel={() => { if (!busy.current) ops.proceed(close); }} submit={submit}
    action={code ? (saving ? '保存中…' : '保存渠道') : null} disabled={disabled || incomplete}
    footer={code && !fixedProvider && <Button disabled={disabled} icon={<IconArrowLeft aria-hidden="true"/>} onClick={back}>返回选择</Button>}>
    {!code ? <>
      <div className="channel-source-grid" ref={firstSource}>
        {sources.map(({ code, name, icon: Icon, detail }) => <Button key={code} block theme="outline" type="tertiary"
          className="channel-source-card" contentClassName="channel-source-content" disabled={disabled} onClick={() => setCode(code)}>
          <span className="channel-source-icon"><Icon size="large" aria-hidden="true"/></span>
          <span className="channel-source-text"><strong>{name}</strong><small>{detail}</small></span>
          <IconChevronRight aria-hidden="true"/>
        </Button>)}
      </div>
      <div><Button type="tertiary" theme="borderless" disabled={disabled} icon={<IconSetting aria-hidden="true"/>} onClick={() => setCode('manual')}>手动配置</Button></div>
    </> : <div className="supplier-configuration-body" ref={firstField} tabIndex={-1}>
      {code === 'manual' && !fixedProvider && <>
        <Field label="服务商 *"><Choice label="服务商" placeholder="选择服务商" value={providerId || undefined}
          options={[...providers.map(row => [row.id, row.name]), ['new', '新增服务商']]} disabled={disabled} onChange={chooseProvider}/></Field>
        {newProvider && <Field label="服务商名称 *"><Input aria-label="服务商名称" value={providerName} maxLength={100} disabled={disabled}
          onChange={name => { setProviderName(name); dirty(); }}/></Field>}
      </>}
      {preset ? <Field label="模型 *"><Choice label="模型" placeholder="搜索模型名称或模型编码" value={model?.id}
        filter={(input, option) => modelSearch(option.label).includes(modelSearch(input))}
        options={models.map(row => [row.id, `${row.name} · ${row.upstreamModelId || row.modelId}`])}
        disabled={disabled} onChange={chooseModel}/></Field> : <>
        <Field label="模型 *"><Choice label="模型" placeholder="选择或输入模型" value={model?.id || value.modelName || undefined} filter allowCreate
          options={models.map(row => [row.id, `${row.name} · ${row.modelId}`])} disabled={disabled} onChange={input => chooseIdentity('modelName', input)}/></Field>
        <Field label="模型编码 *"><Choice label="模型编码" placeholder="选择或输入新模型编码" value={model?.id || value.modelCode || undefined} filter allowCreate
          options={models.map(row => [row.id, row.modelId])} disabled={disabled} onChange={input => chooseIdentity('modelCode', input)}/></Field>
        {!model && <Field label="模型类型 *"><Choice label="模型类型" placeholder="选择新模型类型" value={value.modelType || undefined} options={Object.entries(MODEL_TYPES)} disabled={disabled} onChange={modelType => change({ modelType })}/></Field>}
      </>}
      {references?.archived && <Notice>该模型资料已归档，请选择其他模型。</Notice>}
      {(!preset || model) && <SupplierChannelFields hideModel allowSharedKey={Boolean(owner)}
        state={state} provider={owner} models={model ? models : [{ id: '', type: value.modelType }]} value={value} rawKey={rawKey} disabled={disabled} ops={ops}
        onChange={change} onKeyChange={key => { setRawKey(key); dirty(); }}/>}
      {preset && <Typography.Paragraph type="tertiary">
        <a href={preset.catalogueSource} target="_blank" rel="noreferrer">接入文档</a>
        {model && <> · <a href={model.profile.documentation} target="_blank" rel="noreferrer">模型文档</a></>}
      </Typography.Paragraph>}
    </div>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
