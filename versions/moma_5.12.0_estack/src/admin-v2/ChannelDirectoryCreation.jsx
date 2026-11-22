import { useChannelText } from './channel-language';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, Select, Space, TabPane, Table, Tabs, TextArea, Typography } from '@douyinfe/semi-ui';
import ChannelAdvancedFields from './ChannelAdvancedFields';
import ChannelProtocolFields from './ChannelProtocolFields';
import { Modal, Notice } from './ModelOperationsUI';
import { Choice, Field } from './ServiceUI';
import SupplierCreationDialog from './SupplierCreationDialog';
import { ChannelKeyStrategyField } from './ChannelCredentials';
import SupplierApiKeyField from './SupplierApiKeyField';
import { CHANNEL_LIST_TYPES, CHANNEL_SOURCE_TYPES, channelProtocolPaths, channelSourceTypeLabel, prepareListedChannelInterface } from './channel-connection-directory';
import { CHANNEL_INTERFACES, prepareChannelAdapterOptions, prepareChannelInterface, suggestChannelRoot } from './channel-interface';
import { PROVIDER_API_KEY_LIMIT, maskProviderApiKey, providerApiKeysDraft } from './provider-management';
import { workspaceStoragePrefix } from '../workspace-storage.mjs';
import { adapterDraftTypes, normalizeAdapterDraft } from './channel-adapter-catalogue';

const keyInput = () => ({ id: crypto.randomUUID(), raw: '', name: '' });
const adapters = [...CHANNEL_INTERFACES, { id: 'custom', label: '自定义任务 API', protocol: '其他' }];

export default function ChannelDirectoryCreation({ state, providers, connections, source, ops, close, locate, reference = false }) {
  const t = useChannelText();
  const [providerId, setProviderId] = useState(source?.provider.id || 'unselected');
  const [adapterTab, setAdapterTab] = useState('common');
  const [configuring, setConfiguring] = useState(Boolean(source));
  const [createdId, setCreatedId] = useState('');
  const [pendingValues, setPendingValues] = useState({});
  const provider = providers.find(item => item.id === providerId);
  const endpoint = source?.endpoint;
  const [value, setValue] = useState(() => ({
    name: source ? (source.name.slice(0, 57) + '-副本') : '',
    interfaceType: endpoint?.interfaceType || adapters.find(row => row.protocol === endpoint?.protocol)?.id || (reference ? '' : 'openai'),
    endpointPath: null, channelSourceType: null,
    baseUrl: endpoint?.baseUrl || '', taskUrls: endpoint?.taskUrls || {}, adapterOptions: endpoint?.adapterOptions || {},
    timeoutSeconds: endpoint?.timeoutSeconds || 60, capacity: '',
    authMode: 'independent', apiKeyId: '', mode: 'single', keyStrategy: 'priority', note: '',
  }));
  const [inputs, setInputs] = useState(() => [keyInput()]);
  const [models, setModels] = useState(() => [...new Map((source?.models || []).map(({ association }) =>
    [association.modelId, { modelId: association.modelId, upstreamModelId: association.upstreamModelId }])).values()]);
  const [copyOptions, setCopyOptions] = useState({ rules: true, commercial: false, suffix: '-副本' });
  const [importText, setImportText] = useState(null), [importError, setImportError] = useState('');
  const draftKey = workspaceStoragePrefix + 'channel-directory-batch:' + (state.adminSession?.accountId || state.currentRole);
  const [recoverable, setRecoverable] = useState(() => {
    try { return !source && JSON.parse(localStorage.getItem(draftKey)); } catch { return null; }
  });
  const [preview, setPreview] = useState(null), [saved, setSaved] = useState([]);
  const [failed, setFailed] = useState({});
  const [suggestedRoot, setSuggestedRoot] = useState('');
  const [busy, setBusy] = useState(false);
  const listedType = reference ? CHANNEL_LIST_TYPES.find(item => item.id === value.interfaceType) : null;
  const channelSourceType = value.channelSourceType ??
    (CHANNEL_SOURCE_TYPES.includes(provider?.sourceType) ? provider.sourceType : 'thirdParty');
  const allowHttp = provider?.sourceType === 'selfHosted';
  const endpointPath = reference ? value.endpointPath ??
    channelProtocolPaths({ interfaceType: value.interfaceType, baseUrl: value.baseUrl, allowHttp })[0] ?? '' : undefined;
  const lock = useRef(false);
  const creationId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!ops.can) {
      setInputs(items => items.map(row => ({ ...row, raw: '' })));
      setPreview(null);
      setImportText(null);
    }
  }, [ops.can]);
  const writing = busy || !ops.can;
  const savedAddresses = new Set(connections.filter(row => row.provider.id === providerId && row.endpoint.interfaceType === value.interfaceType)
    .map(row => row.endpoint.baseUrl));
  const providerAddress = provider?.baseUrl;
  if (!source && typeof providerAddress === 'string' && providerAddress && value.interfaceType !== 'custom' && !value.interfaceType.startsWith('draft:') &&
    (provider.defaultProtocol || []).includes(adapters.find(row => row.id === value.interfaceType)?.protocol)) {
    try {
      savedAddresses.add(suggestChannelRoot({ interfaceType: value.interfaceType, baseUrl: providerAddress, allowHttp: provider.sourceType === 'selfHosted' }) || providerAddress);
    } catch { /* Current provider lacks a valid default for this adapter. */ }
  }
  const reusableAddresses = [...savedAddresses].filter(Boolean);
  const pendingType = adapterDraftTypes.find(row => 'draft:' + row.id === value.interfaceType);
  const independent = !pendingType && value.authMode === 'independent';
  const batch = independent && value.mode === 'batch';
  const multi = independent && value.mode === 'multi';
  const change = () => { setSuggestedRoot(''); ops.setError(''); ops.dirty(true); };
  const set = patch => { setValue(current => ({ ...current, ...patch })); change(); };
  const editInput = (id, patch) => {
    setInputs(items => items.map(row => row.id === id ? { ...row, ...patch } : row));
    setFailed(previous => ({ ...previous, [id]: null }));
    change();
  };
  const pasteKeys = (event, index) => {
    const text = event.clipboardData.getData('text');
    if (!/[\r\n]/.test(text)) return;
    event.preventDefault();
    const lines = text.split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return;
    const following = inputs.slice(index + 1);
    let consumed = 0;
    while (consumed < lines.length - 1 && following[consumed] && !following[consumed].raw.trim()) consumed++;
    const after = following.slice(consumed);
    if (index + lines.length + after.length > PROVIDER_API_KEY_LIMIT) {
      ops.setError(`每批最多录入 ${PROVIDER_API_KEY_LIMIT} 把密钥，请分批粘贴`);
      return;
    }
    const pasted = lines.map((raw, offset) => ({ ...(offset ? keyInput() : inputs[index]), raw }));
    setInputs([...inputs.slice(0, index), ...pasted, ...after]);
    change();
  };
  const saveBatchDraft = (plan, completed, errors) => {
    if (!batch) return;
    const pending = inputs.filter(row => !completed.some(item => item.creationId === row.id));
    try {
      if (!pending.length) { localStorage.removeItem(draftKey); setRecoverable(null); return; }
      const stored = { providerId, value: {
        name: value.name, baseUrl: plan.baseUrl, interfaceType: plan.interfaceType, adapterOptions: plan.adapterOptions, taskUrls: plan.taskUrls,
        capacity: value.capacity, timeoutSeconds: value.timeoutSeconds, authMode: 'independent', mode: 'batch', keyStrategy: value.keyStrategy,
      }, models: plan.models, completed, errors, inputs: inputs.map(row => ({ id: row.id, name: row.name })) };
      localStorage.setItem(draftKey, JSON.stringify(stored));
      setRecoverable(stored);
    } catch { ops.setError('批量草稿未能保存到当前浏览器。'); }
  };
  const resumeBatch = () => ops.proceed(() => {
    if (!recoverable || !providers.some(row => row.id === recoverable.providerId)) {
      ops.setError('草稿服务商已不存在，请重新创建'); return;
    }
    setProviderId(recoverable.providerId); setValue(current => ({ ...current, ...recoverable.value }));
    setInputs(recoverable.inputs.map(row => ({ ...row, raw: '' })));
    setModels(recoverable.models); setSaved(recoverable.completed); setFailed(recoverable.errors);
    setConfiguring(true);
    ops.setError('');
  });
  const importConnection = () => {
    try {
      const entry = JSON.parse(importText);
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Object.keys(entry).some(key => !['name', 'baseUrl', 'keys', 'models'].includes(key)) ||
        typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 60 ||
        typeof entry.baseUrl !== 'string' || entry.baseUrl.length > 2048 || !Array.isArray(entry.keys) || !entry.keys.length ||
        entry.keys.length > 20 || entry.keys.some(raw => typeof raw !== 'string' || raw.length > 512)) {
        throw Error('请填写连接名称、根地址和 1–20 把密钥，模型可选');
      }
      if (entry.models !== undefined && (!Array.isArray(entry.models) || entry.models.length > 50 ||
        new Set(entry.models.map(row => row?.modelId)).size !== entry.models.length ||
        entry.models.some(row => !row || !provider?.catalogModels?.some(item => item.modelId === row.modelId && item.libraryId) ||
          typeof row.upstreamModelId !== 'string' || !row.upstreamModelId.trim() ||
          Object.keys(row).some(key => !['modelId', 'upstreamModelId'].includes(key))))) throw Error('请使用当前服务商已登记的模型和上游调用标识');
      set({ name: entry.name, baseUrl: entry.baseUrl, authMode: 'independent', mode: entry.keys.length > 1 ? 'multi' : 'single' });
      setInputs(entry.keys.map(raw => ({ ...keyInput(), raw })));
      setModels(entry.models || []);
      setImportText(null); setImportError('');
    } catch (error) { setImportError(error instanceof SyntaxError ? '连接信息须为有效 JSON' : error.message); }
  };
  const review = async () => {
    if (lock.current || writing) return;
    lock.current = true;
    setBusy(true);
    ops.setError('');
    try {
      if (!provider) throw Error('请选择服务商');
      if (!pendingType && value.authMode === 'specific' && !provider.apiKeys?.some(key => key.id === value.apiKeyId && key.status !== 'disabled' && !key.revokedAt)) throw Error('请选择可用的 API 密钥');
      const adapterDraft = pendingType ? normalizeAdapterDraft({ kind: pendingType.id, values: pendingValues }) : null;
      const address = { ...value, endpointPath, allowHttp };
      const config = adapterDraft ? { protocol: '其他', baseUrl: value.baseUrl.trim() } :
        reference ? prepareListedChannelInterface(address) : prepareChannelInterface(address);
      const adapterOptions = adapterDraft ? {} : prepareChannelAdapterOptions(value.adapterOptions);
      const name = value.name.trim();
      if (models.some(row => !row.upstreamModelId.trim() || row.upstreamModelId.length > 200 || /\s/u.test(row.upstreamModelId.trim())) ||
        new Set(models.map(row => row.upstreamModelId.trim())).size !== models.length) throw Error('请填写不重复且有效的上游模型调用标识');
      const validateName = input => {
        if (!input || input.length > 60 || /[\r\n]/.test(input)) throw Error('请填写有效的连接名称，最多 60 字');
        if (connections.some(row => row.provider.id === providerId && row.name === input)) throw Error('此服务商已有同名连接');
      };
      const remaining = inputs.filter(row => !saved.some(item => item.creationId === row.id));
      const rows = [];
      if (batch) {
        const names = new Set(), keys = new Set(connections.filter(row => row.provider.id === providerId)
          .map(row => row.endpoint.directoryBatchCredential).filter(Boolean));
        for (const input of remaining) {
          if (reference && !input.raw.trim()) continue;
          const ordinal = inputs.findIndex(row => row.id === input.id) + 1;
          const candidate = { creationId: input.id, line: ordinal,
            name: input.name.trim() || (name ? name + '-' + String(ordinal).padStart(2, '0') : ''), keys: [] };
          try {
            candidate.keys = (await providerApiKeysDraft([input.raw])).apiKeys;
            if (keys.has(candidate.keys[0].fingerprint)) {
              candidate.duplicate = true;
              throw Error('重复密钥，跳过');
            }
            validateName(candidate.name);
            if (names.has(candidate.name)) throw Error('本批次包含重复名称');
            names.add(candidate.name);
            keys.add(candidate.keys[0].fingerprint);
          } catch (error) {
            candidate.error = reference ? error.message.replace(/^第 1 条 /, '') : error.message;
          }
          rows.push(candidate);
        }
      } else {
        validateName(name);
        const keys = independent ? (await providerApiKeysDraft((value.mode === 'single' ? remaining.slice(0, 1) : remaining).map(row => row.raw))).apiKeys : [];
        if (independent && value.mode === 'multi' && keys.length < 2) throw Error('多密钥模式至少需要两把密钥');
        rows.push({ creationId: creationId.current, name, keys });
      }
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      const next = { providerId, ...config, adapterOptions, timeoutSeconds: value.timeoutSeconds, capacity: value.capacity,
        authMode: adapterDraft ? 'pending' : value.authMode, ...(value.authMode === 'specific' ? { apiKeyId: value.apiKeyId } : {}), keyStrategy: value.keyStrategy, perCredential: batch, rows,
        ...(reference ? { note: value.note, channelSourceType } : {}),
        ...(adapterDraft ? { adapterDraft } : {}),
        ...(source ? { copyFrom: { endpointId: source.id, expectedUpdatedAt: endpoint.updatedAt,
          expectedProviderUpdatedAt: provider.updatedAt, rules: copyOptions.rules, commercial: copyOptions.commercial } } : {}),
        models: models.map(row => ({ ...row, upstreamModelId: row.upstreamModelId.trim() })) };
      if (reference && !batch) {
        const savedState = await ops.run('channelDirectoryCreate', next);
        if (savedState) {
          const id = savedState.endpoints.find(item => item.providerId === providerId && item.directoryCreationId === rows[0].creationId)?.id;
          if (id) setCreatedId(id); else close();
        }
        return;
      }
      if (!reference) saveBatchDraft(next, saved, Object.fromEntries(rows.filter(row => row.error).map(row => [row.creationId, row.error])));
      setPreview(next);
    } catch (error) {
      if (error.suggestedBaseUrl) setSuggestedRoot(error.suggestedBaseUrl);
      ops.setError(error.message);
    } finally { lock.current = false; setBusy(false); }
  };
  const create = async () => {
    if (lock.current || writing) return;
    lock.current = true;
    setBusy(true);
    const rows = preview.rows.filter(row => !row.error).map(({ creationId, name, keys }) => ({ creationId, name, keys }));
    try {
      const next = await ops.run('channelDirectoryCreate', { ...preview, rows });
      if (!next) return;
      if (!batch) {
        const id = next.endpoints.find(item => item.providerId === providerId && item.directoryCreationId === rows[0].creationId)?.id;
        if (id) setCreatedId(id); else close();
        return;
      }
      const created = rows.map(row => ({
        creationId: row.creationId, name: row.name, credential: row.keys[0].maskedKey,
        endpointId: next.endpoints.find(item => item.providerId === providerId && item.directoryCreationId === row.creationId)?.id,
        modelCount: preview.models.length,
      })).filter(row => row.endpointId);
      if (reference) {
        if (created.length) { setSaved(created); setPreview(null); } else close();
        return;
      }
      setSaved(previous => [...previous, ...created]);
      setInputs(items => items.map(row => created.some(item => item.creationId === row.id) ? { ...row, raw: '' } : row));
      setFailed(Object.fromEntries(preview.rows.filter(row => row.error).map(row => [row.creationId, row.error])));
      saveBatchDraft(preview, [...saved, ...created], Object.fromEntries(preview.rows.filter(row => row.error).map(row => [row.creationId, row.error])));
      setPreview(null);
      ops.dirty(preview.rows.some(row => row.error));
    } finally { lock.current = false; setBusy(false); }
  };

  const createdConnections = <Table size="small" rowKey="endpointId" pagination={false} dataSource={saved} columns={[
        { title: '连接名称', dataIndex: 'name' }, { title: '凭证摘要', dataIndex: 'credential' }, { title: '连接 ID', dataIndex: 'endpointId' },
        { title: '待验证模型', dataIndex: 'modelCount' },
        { title: '操作', render: (_, row) => <Button theme="borderless" size="small" onClick={() => locate(row.endpointId, true)}>打开连接（新页签）</Button> },
      ]}/>;

  if (createdId) return <Modal drawer wide title="连接已创建" description={[provider?.name, value.name.trim()].filter(Boolean).join(' / ')}
    onClose={close} footer={<>
      <Button onClick={close}>返回连接列表</Button>
      <Button theme="solid" onClick={() => locate(createdId)}>查看新连接</Button>
    </>}>
    <Typography.Paragraph>{pendingType ? '连接已保存为待适配草稿。' : models.length
      ? `已接入 ${models.length} 款待验证模型。测试通过后可启用连接。`
      : '连接尚未启用。打开连接后可接入模型，再测试并启用。'}</Typography.Paragraph>
  </Modal>;

  if (reference && saved.length) return <Modal drawer wide title={t('批量创建完成')} description={provider?.name}
    onClose={close} footer={<Button onClick={close}>{t('返回连接列表')}</Button>}>
    {createdConnections}
  </Modal>;

  if (reference && !preview) return <SupplierCreationDialog wide className="channel-directory-create-dialog"
    title={t('添加新的渠道')} cancelLabel={t('取消')} cancel={() => !busy && ops.proceed(close)}
    submit={review} action={batch ? t('预览批量创建') : t('创建 1 个渠道')}
    disabled={writing || !provider || !listedType || !value.name.trim() || !value.baseUrl.trim() || !endpointPath.trim() ||
      (batch || multi ? inputs.filter(row => row.raw.trim()).length < (multi ? 2 : 1) : !inputs[0].raw.trim())}>
    <Field label={t(batch ? '渠道名称前缀' : '渠道名称')} required help={t('填写便于识别的名称，同一服务商下不可重复。')} hint={batch ? t('根据录入行号添加编号，例如「渠道-01」。') : undefined}>
      <Input aria-label={t(batch ? '渠道名称前缀' : '渠道名称')} value={value.name} maxLength={batch ? 57 : 60}
        disabled={writing} onChange={name => set({ name })}/>
    </Field>
    <Field label={t('服务商')} required help={t('选择提供上游服务的已启用服务商。')}><Choice label={t('服务商')} value={providerId} disabled={writing}
      options={[[ 'unselected', t('请选择服务商') ], ...providers.filter(row => row.status === '已启用').map(row => [row.id, row.name])]}
      onChange={id => { setProviderId(id); change(); }}/></Field>
    <Field label={t('渠道类型')} required help={t('选择第三方模型服务或自有模型推理服务。选择服务商时会带出默认值。')}>
      <Choice label={t('渠道类型')} value={channelSourceType} disabled={writing}
        options={CHANNEL_SOURCE_TYPES.map(type => [type, t(channelSourceTypeLabel(type))])}
        onChange={channelSourceType => set({ channelSourceType })}/>
    </Field>
    <ChannelProtocolFields protocol={value.interfaceType} baseUrl={value.baseUrl} allowHttp={allowHttp}
      disabled={writing} root={suggestedRoot} endpointPath={value.endpointPath} showHelp
      onProtocolChange={interfaceType => set({ interfaceType, endpointPath: null })}
      onEndpointPathChange={endpointPath => set({ endpointPath })} onBaseUrlChange={baseUrl => set({ baseUrl })}/>
    <Field label={t('创建方式')}><Choice label={t('创建方式')} value={value.mode} disabled={writing} options={[
      ['single', t('单密钥')], ['batch', t('批量创建渠道')], ['multi', t('一个渠道使用多把密钥')],
    ]} onChange={mode => {
      if (mode === 'multi' && inputs.length === 1) setInputs(items => [...items, keyInput()]);
      set({ mode });
    }}/></Field>
    {(batch || multi) && <Typography.Text type="secondary">{batch
      ? t('每行一把密钥，可在输入框中粘贴多行。预览时核对渠道名称、重复项和创建数量。')
      : t('多把密钥组成同一个渠道的密钥池。可在输入框中粘贴多行，至少填写两把不同密钥。')}</Typography.Text>}
    {(batch || multi ? inputs : inputs.slice(0, 1)).map((input, index) => {
      const label = batch || multi ? t('API 密钥') + ' ' + (index + 1) : t('API 密钥');
      return <Field key={input.id} label={label} required={!batch && !multi} help={!batch && !multi ? t('填写上游服务商签发的 API 密钥。') : undefined}>
        <Input aria-label={label} mode="password" autoComplete="new-password" value={input.raw}
          maxLength={512} disabled={writing} onChange={raw => editInput(input.id, { raw })}
          onPaste={batch || multi ? event => pasteKeys(event, index) : undefined}
          suffix={(batch || multi) && inputs.length > 1 ? <Button theme="borderless" size="small" type="tertiary" disabled={writing}
            aria-label={'移除第 ' + (index + 1) + ' 把密钥'}
            onClick={() => { setInputs(items => items.filter(row => row.id !== input.id)); change(); }}>移除</Button> : undefined}/>
      </Field>;
    })}
    {(batch || multi) && <Space><Button theme="light" disabled={writing || inputs.length >= PROVIDER_API_KEY_LIMIT}
      onClick={() => { setInputs(items => [...items, keyInput()]); change(); }}>{t('添加一把密钥')}</Button></Space>}
    {multi && <ChannelKeyStrategyField value={value.keyStrategy} disabled={writing} onChange={keyStrategy => set({ keyStrategy })}/>}
    <Field label={t('简介')}><TextArea aria-label={t('简介')} value={value.note} maxLength={300} disabled={writing} onChange={note => set({ note })}/></Field>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;

  if (preview) {
    const createCount = preview.rows.filter(row => !row.error).length;
    const duplicateCount = preview.rows.filter(row => row.duplicate).length;
    const invalidCount = preview.rows.length - createCount - duplicateCount;
    return <SupplierCreationDialog drawer={!reference} wide title={reference ? t('预览批量创建') : '核对创建连接'}
      cancel={() => !busy && setPreview(null)} cancelLabel="返回修改" submit={create}
      action={reference ? `创建 ${createCount} 个渠道` : '确认创建'} disabled={writing || !createCount}>
      <Typography.Paragraph>{provider?.name} · {preview.baseUrl}</Typography.Paragraph>
      {reference && <Typography.Paragraph aria-live="polite">
        将创建 {createCount} 个渠道 · 跳过 {duplicateCount} 条重复密钥
        {invalidCount > 0 && ` · ${invalidCount} 条待修正`}
      </Typography.Paragraph>}
      <Table size="small" rowKey="creationId" pagination={false} dataSource={preview.rows} columns={[
        ...(reference ? [{ title: '行号', dataIndex: 'line' }] : []),
        { title: reference ? '渠道名称' : '连接名称', dataIndex: 'name' },
        { title: '凭证摘要', render: (_, row) => row.keys.map(key => key.maskedKey).join('、') || (pendingType ? '待适配' : independent ? '—' : value.authMode === 'none' ? '无需认证' : maskProviderApiKey(provider.apiKeys?.find(key => key.id === value.apiKeyId)?.maskedKey)) },
        { title: '预检结果', render: (_, row) => row.error || (preview.adapterDraft ? '待适配 · 未启用' : '待创建 · 未启用') },
      ]}/>
      <Typography.Paragraph type="tertiary">{preview.models.length ? '每条连接加入 ' + preview.models.length + ' 款待验证模型。' : '可在创建后新增模型渠道，再进行验证和启用。'}</Typography.Paragraph>
      {preview.copyFrom && <Typography.Paragraph>请求规则：{preview.copyFrom.rules ? '复制' : '不复制'} · 容量和采购价：{preview.copyFrom.commercial ? '复制容量和报价草稿' : '后续配置'}</Typography.Paragraph>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </SupplierCreationDialog>;
  }

  return <><SupplierCreationDialog drawer wide title={source ? '复制连接' : '创建连接'}
    description={configuring ? [provider?.name, pendingType?.name || adapters.find(row => row.id === value.interfaceType)?.label].filter(Boolean).join(' / ') : '选择服务商与上游接口'}
    cancel={() => !busy && ops.proceed(close)}
    footer={!source && configuring && !saved.length && <Button disabled={busy} onClick={() => setConfiguring(false)}>返回选择接口</Button>}
    submit={configuring ? review : () => { ops.setError(''); setConfiguring(true); }}
    action={!configuring ? '下一步：配置连接' : batch && saved.length === inputs.length ? undefined : saved.length ? '核对待重试连接' : '核对创建'}
    disabled={writing || !provider}>
    {!source && recoverable && !batch && <Button theme="light" disabled={writing} onClick={resumeBatch}>继续本地批量草稿</Button>}
    {batch && recoverable && inputs.some(row => !row.raw && !saved.some(item => item.creationId === row.id)) &&
      <Notice>刷新后可继续编辑失败行。待重试的密钥需重新输入。</Notice>}
    {saved.length > 0 && <><Typography.Title heading={5}>已创建 {saved.length} 条连接</Typography.Title>
      {createdConnections}</>}
    {(!batch || saved.length !== inputs.length) && <>
      {source && <Notice>复制接口和地址设置。请重新选择凭证，并核对要复制的模型。新连接以未启用的状态保存。</Notice>}
      {source && <Space wrap>
        <Checkbox checked={copyOptions.rules} disabled={writing} onChange={event => { setCopyOptions(current => ({ ...current, rules: event.target.checked })); change(); }}>复制请求规则</Checkbox>
        <Checkbox checked={copyOptions.commercial} disabled={writing || !models.length} onChange={event => { setCopyOptions(current => ({ ...current, commercial: event.target.checked })); change(); }}>复制容量与采购价草稿</Checkbox>
      </Space>}
      {!source && !configuring && <>
      <div className="channel-operation-fields">
        <Field label="服务商 *"><Choice label="服务商" value={providerId} disabled={writing} options={[
          ['unselected', t('请选择服务商')], ...providers.filter(row => row.status === '已启用').map(row => [row.id, row.name]),
        ]} onChange={id => {
          if (id === providerId) return;
          const apply = () => {
            setProviderId(id);
            setModels([]);
            setInputs([keyInput()]);
            setPendingValues({});
            set({ baseUrl: '', taskUrls: {}, adapterOptions: {}, apiKeyId: '', authMode: 'independent', mode: 'single' });
          };
          if (value.baseUrl || models.length || inputs.some(row => row.raw) || Object.keys(pendingValues).length) ops.proceed(apply);
          else apply();
        }}/></Field>
      </div>
      <Tabs activeKey={adapterTab} onChange={setAdapterTab} aria-label="接口类型筛选">
        {[['common', '常用'], ['all', '全部类型'], ['tasks', '任务插件'], ['gateway', '网关'], ['advanced', '高级自定义']]
          .map(([id, label]) => <TabPane key={id} itemKey={id} tab={label}/>)}
      </Tabs>
      </>}
      {(!configuring || source) &&
      <div className="channel-operation-fields">
        <Field label="上游接口 *"><Choice label="上游接口" value={value.interfaceType} disabled={writing || !provider || Boolean(saved.length)} filter
          options={[...adapters.filter(row => source || adapterTab === 'all' || adapterTab === 'common' || row.id === value.interfaceType ||
            adapterTab === 'gateway' && row.id.startsWith('openai') || ['advanced', 'tasks'].includes(adapterTab) && row.id === 'custom')
            .map(row => [row.id, row.id === 'custom' ? '高级自定义 / 任务接口' : row.label]),
          ...adapterDraftTypes.filter(row => !source && (adapterTab === 'all' || 'draft:' + row.id === value.interfaceType ||
            adapterTab === 'tasks' && [57, 61].includes(row.number) || adapterTab === 'gateway' && [59, 60].includes(row.number)))
            .map(row => ['draft:' + row.id, row.name + ' · ' + row.number + ' · 待适配'])]}
          onChange={interfaceType => {
            const apply = () => {
              setPendingValues({});
              if (interfaceType.startsWith('draft:')) { setInputs([keyInput()]); setModels([]); }
              set({ interfaceType, taskUrls: {}, adapterOptions: {}, ...(interfaceType.startsWith('draft:') ? { mode: 'single' } : {}) });
            };
            if (Object.keys(value.taskUrls).length || Object.keys(value.adapterOptions).length ||
              interfaceType.startsWith('draft:') && (models.length || inputs.some(row => row.raw))) ops.proceed(apply);
            else apply();
          }}/></Field>
      </div>}
      {configuring && <>
      {!source && !pendingType && <Button theme="light" disabled={writing || !provider || Boolean(saved.length)} onClick={() => setImportText('')}>粘贴连接信息</Button>}
      <Typography.Title heading={5} component="h3">连接信息</Typography.Title>
      <div className="channel-operation-fields">
        <Field label={batch ? '批量命名前缀' : '连接名称 *'}><Input aria-label={batch ? '批量命名前缀' : '连接名称'} value={value.name} maxLength={60}
          disabled={writing} onChange={name => set({ name })}/></Field>
        {source && <Field label="名称后缀"><Input aria-label="名称后缀" value={copyOptions.suffix} maxLength={20} disabled={writing}
          onChange={suffix => { setCopyOptions(current => ({ ...current, suffix })); set({ name: source.name.slice(0, 60 - suffix.length) + suffix }); }}/></Field>}
        <Field label={value.interfaceType === 'custom' ? '完整任务地址 *' : 'API 根地址 *'}>
          <Input aria-label="上游 API 地址" value={value.baseUrl} placeholder="https://api.example.com/v1" maxLength={2048}
            disabled={writing} onChange={baseUrl => set({ baseUrl })}/>
        </Field>
        {!source && !pendingType && reusableAddresses.length > 0 && <Field label="沿用已有地址"><Choice label="沿用已有地址"
          value={reusableAddresses.includes(value.baseUrl) ? value.baseUrl : 'manual'} disabled={writing}
          options={[[ 'manual', '手工填写' ], ...reusableAddresses.map(url => [url, url])]}
          onChange={baseUrl => set({ baseUrl: baseUrl === 'manual' ? '' : baseUrl })}/></Field>}
        {!pendingType && <Field label="凭证来源"><Choice label="凭证来源" value={value.authMode} disabled={writing || Boolean(saved.length)} options={[
          ['independent', '渠道专属密钥'], ['specific', '选择服务商密钥'],
          ...(provider?.sourceType === 'selfHosted' ? [['none', '无需认证']] : []),
        ]} onChange={authMode => {
          setInputs([keyInput()]);
          set({ authMode, mode: 'single' });
        }}/></Field>}
        {independent && <Field label="添加模式"><Choice label="添加模式" value={value.mode} disabled={writing || Boolean(saved.length)}
          options={[['single', '单密钥'], ['multi', '多密钥 · 一个连接'], ...(!source ? [['batch', '逐行批量 · 每行一个连接']] : [])]}
          onChange={mode => {
            setInputs([keyInput()]);
            set({ mode });
          }}/></Field>}
        {independent && value.mode === 'multi' && <Field label="池内选择策略"><Choice label="池内选择策略" value={value.keyStrategy}
          disabled={writing} options={[['priority', '按优先级'], ['random', '随机'], ['roundRobin', '轮询']]}
          onChange={keyStrategy => set({ keyStrategy })}/></Field>}
      </div>
      {suggestedRoot && <Button disabled={writing} onClick={() => set({ baseUrl: suggestedRoot })}>使用根地址 {suggestedRoot}</Button>}
      {pendingType && <><Notice>此类型可保存为未启用草稿。完成适配后再接入模型并测试。</Notice>
        {pendingType.fields.map(([key, title]) => <Field key={key} label={title}><Input aria-label={title} maxLength={100} disabled={writing}
          value={pendingValues[key] || ''} onChange={text => { setPendingValues(current => ({ ...current, [key]: text })); change(); }}/></Field>)}</>}
      {!pendingType && value.authMode === 'specific' && provider && <SupplierApiKeyField provider={provider}
        value={value.apiKeyId} disabled={writing} onChange={apiKeyId => set({ apiKeyId })}/>}
      {independent && <>
        {inputs.flatMap((input, index) => saved.some(row => row.creationId === input.id) ? [] : [<div className="channel-operation-fields" key={input.id}>
          {batch && <Field label={'连接名称 ' + (index + 1)}><Input aria-label={'连接名称 ' + (index + 1)} value={input.name}
            maxLength={60} placeholder={value.name ? value.name + '-' + String(index + 1).padStart(2, '0') : '填写名称或使用批量前缀'}
            disabled={writing} onChange={name => editInput(input.id, { name })}/></Field>}
          <Field label={'API 密钥 ' + (index + 1)} error={failed[input.id]}><Input mode="password" autoComplete="new-password" value={input.raw}
            aria-label={'API 密钥 ' + (index + 1)} maxLength={512} disabled={writing} onChange={raw => editInput(input.id, { raw })}/></Field>
          {inputs.length > 1 && <Space><Button theme="borderless" disabled={writing}
            onClick={() => { setInputs(items => items.filter(row => row.id !== input.id)); change(); }}>移除此行</Button></Space>}
        </div>])}
        {value.mode !== 'single' && <Button theme="light" disabled={writing || inputs.length >= 20}
          onClick={() => { setInputs(items => [...items, keyInput()]); change(); }}>添加一把密钥</Button>}
      </>}
      {!pendingType && provider && <>
        <Typography.Title heading={5} component="h3">接入模型（选填）</Typography.Title>
        <Field label="服务商已登记模型"><Select multiple filter maxTagCount={4} aria-label="模型接入范围"
          disabled={writing} value={models.map(row => row.modelId)}
          optionList={(provider.catalogModels || []).filter(row => row.libraryId).map(row => ({ value: row.modelId, label: row.name || row.modelId }))}
          onChange={ids => { setModels(ids.map(modelId => models.find(row => row.modelId === modelId) || { modelId, upstreamModelId: modelId })); change(); }}/></Field>
        {models.map(row => <Field key={row.modelId} label={row.modelId + ' · 上游调用标识'}><Input aria-label={row.modelId + ' 上游调用标识'}
          value={row.upstreamModelId} maxLength={200} disabled={writing} onChange={upstreamModelId => {
            setModels(items => items.map(model => model.modelId === row.modelId ? { ...model, upstreamModelId } : model)); change();
          }}/></Field>)}
      </>}
      {!pendingType && <ChannelAdvancedFields value={value} onChange={set} disabled={writing}/>}
      </>}
    </>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>
  {importText !== null && <Modal wide title="粘贴连接信息" onClose={() => setImportText(null)} footer={<>
    <Button onClick={() => setImportText(null)}>取消</Button>
    <Button theme="solid" disabled={!importText.trim() || writing} onClick={importConnection}>带入创建表单</Button>
  </>}>
    <Field label="连接信息 JSON"><TextArea aria-label="连接信息 JSON" value={importText} maxLength={30000}
      placeholder='{"name":"示例连接","baseUrl":"https://example.invalid/v1","keys":["占位密钥"],"models":[]}'
      autosize={{ minRows: 6, maxRows: 12 }} onChange={value => { setImportText(value); setImportError(''); }}/></Field>
    {importError && <Notice error>{importError}</Notice>}
  </Modal>}</>;
}
