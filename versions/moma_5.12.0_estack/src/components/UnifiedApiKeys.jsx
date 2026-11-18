import { resourceId } from '../resource-id.mjs';
import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, Search } from 'lucide-react';
import { AutoComplete, Banner, Button, Checkbox, Empty, Input, Modal, Progress, RadioGroup, Switch, Table, Tabs, Tag, TextArea, Toast } from '@douyinfe/semi-ui';
import { AdminSideSheet as SideSheet } from '../admin-v2/AdminOverlay';
import { useTenantData } from '../useTenantData';
import { maskApiKey, parseIpAllowlist } from '../api-key-utils.mjs';
import { projectModelEnabled } from '../project-access.mjs';
import { parseBudgetAmount } from '../project-call.mjs';
import { projectMoney, projectTime } from './ProjectConfiguration';
import { DEFAULT_PAGE_SIZE, FilterPagination } from './FilterControls';
import FrontPageHeader from './FrontPageHeader';

const billingTypes = ['按量付费', 'Token Plan'];
const newSecret = () => 'sk-' + crypto.randomUUID().replaceAll('-', '');

export default function UnifiedApiKeys({ project, internal, embedded = false, onProjects, onModels, onAudit }) {
  if (!project) return <div className="api-key-unified us-page">
    <FrontPageHeader title="API 密钥" description="选择项目后管理其 API 密钥" icon={KeyRound} />
    <Button onClick={onProjects}>前往项目管理</Button>
  </div>;
  return <div className="api-key-unified us-page">
    {!embedded && <FrontPageHeader title="API 密钥" description={`所属项目 · ${project.name}`} icon={KeyRound} />}
    {embedded && project.canManage && <Button theme="borderless" onClick={onAudit}>查看操作记录</Button>}
    {internal ? <ApiKeys billing="按量付费" project={project} onModels={onModels} /> : <Tabs className="tenant-key-tabs" defaultActiveKey="按量付费" aria-label="API 密钥计费方式" keepDOM>
      {billingTypes.map(type=><Tabs.TabPane key={type} itemKey={type} tab={type==='Token Plan'?'订阅套餐':type}>
        {type==='Token Plan'?<TokenPlanApiKeys project={project} onModels={onModels}/>
          :<ApiKeys billing={type} project={project} onModels={onModels}/>}
      </Tabs.TabPane>)}
    </Tabs>}
  </div>;
}

function TokenPlanApiKeys({ project, onModels }) {
  const tenant=useTenantData();
  const tokenPlanSubscriptions=tenant.plans.map(row=>({id:row.id,name:row.product.name,modelIds:row.modelIds,startAt:row.createdAt?.slice(0,10) || '',endAt:row.expiresAt || '长期有效'}));
  const [planId, setPlanId] = useState(tokenPlanSubscriptions[0]?.id || "");
  const [planQuery, setPlanQuery] = useState("");
  const selectedPlan = tokenPlanSubscriptions.find(plan => plan.id === planId) || tokenPlanSubscriptions[0];
  const effectivePlanId=selectedPlan?.id;
  const visiblePlans = tokenPlanSubscriptions.filter(plan => `${plan.name} ${plan.id}`.toLowerCase().includes(planQuery.trim().toLowerCase()));
  if (!selectedPlan) return <Empty className="tenant-key-empty" title="暂无订阅套餐">
    <Button theme="outline" onClick={()=>{location.href='?page=model-order';}}>前往模型订购</Button>
  </Empty>;
  return <div className="token-plan-workspace">
    <nav className="token-plan-sidebar" aria-label="已购订阅套餐">
      <h2>已购套餐</h2>
      <Input prefix={<Search size={16}/>} aria-label="搜索套餐名称或订阅编号" placeholder="搜索套餐名称或编号" value={planQuery} onChange={setPlanQuery} />
      <div className="token-plan-list">
        {visiblePlans.map(plan => <Button key={plan.id} theme="borderless" type="tertiary" className="token-plan-item" aria-label={`选择套餐：${plan.name} ${plan.id}`} aria-pressed={plan.id === effectivePlanId} onClick={() => setPlanId(plan.id)}>
          <strong>{plan.name}</strong><span>{plan.id}</span><small>{plan.startAt} 至 {plan.endAt}</small>
        </Button>)}
        {!visiblePlans.length && <p className="token-plan-empty" role="status">没有匹配的套餐</p>}
      </div>
    </nav>
    <div className="token-plan-detail">
      {tokenPlanSubscriptions.map(plan => <div key={plan.id} hidden={plan.id !== effectivePlanId}><ApiKeys billing="Token Plan" subscription={plan} project={project} onModels={onModels} /></div>)}
    </div>
  </div>;
}

const keyExpiryInput = value => Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : '';

function ApiKeys({ billing, subscription, project, onModels }) {
  const tenant=useTenantData();
  const keyScope=subscription?.id || billing;
  const [reveal, setReveal] = useState(null);
  const [secretFeedback, setSecretFeedback] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [expiry, setExpiry] = useState('');
  const editModels = [...new Map((tenant.projectServices || []).filter(row=>projectModelEnabled(project,row.modelKey) && (!subscription?.modelIds || subscription.modelIds.includes(row.modelKey))).map(row=>[row.modelId,[row.modelId,row.typeLabel || row.type]])).values()];
  const keys=tenant.keys.filter(row=>row.projectId===project.id && (row.billingType || '按量付费')===billing && (row.subscriptionId || '')===(subscription?.id || '')).map(row=>({...row,key:row.secretPreview || '****',desc:row.description,created:row.createdAt,enabled:row.status==='有效',models:row.modelIds?.map(id=>tenant.models.find(model=>model.id===id)?.modelId || id) || [],ips:row.ipAllowlist || []}));
  const [saving, setSaving] = useState(false);
  const setKeys = async rows => {
    if (saving) return false;
    setSaving(true);
    try {
      await tenant.saveProjectKeys(rows, {projectId:project.id,billing,subscriptionId:subscription?.id,expectedRevision:panel?.revision ?? action?.revision ?? tenant.revision});
      return true;
    } catch (error) {
      setFormError(error.message); Toast.error(error.message); return false;
    } finally { setSaving(false); }
  };
  const revealSecret = value => { setSecretFeedback(''); setReveal(value); };
  const [query, setQuery] = useState(""),
    [selectedSearchId, setSelectedSearchId] = useState(null),
    [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE),
    [panel, setPanel] = useState(null),
    [name, setName] = useState(""),
    [desc, setDesc] = useState(""),
    [ipList, setIpList] = useState(""),
    [quotaEnabled, setQuotaEnabled] = useState(true),
    [quotaType, setQuotaType] = useState("日"),
    [quota, setQuota] = useState("10000"),
    [tpmEnabled, setTpmEnabled] = useState(false),
    [qpmEnabled, setQpmEnabled] = useState(false),
    [tpmLimit,setTpmLimit]=useState("100000"),
    [qpmLimit,setQpmLimit]=useState("1000"),
    [modelScope, setModelScope] = useState("限定范围"),
    [selectedModels, setSelectedModels] = useState([]),
    [copied, setCopied] = useState(""),
    [copiedValue, setCopiedValue] = useState(""),
    [action, setActionState] = useState(null),
    [formError, setFormError] = useState(""),
    [scopeQuery, setScopeQuery] = useState("");
  const setAction=value=>setActionState(value?{...value,revision:tenant.revision,
    ...(value.kind === 'reset' ? { secret:newSecret() } : {})}:null);
  useEffect(() => {
    if (!copied && !copiedValue) return;
    const timer = setTimeout(() => { setCopied(""); setCopiedValue(""); }, 2000);
    return () => clearTimeout(timer);
  }, [copied, copiedValue]);
  const openPanel = (kind, key) => {
    setPanel({ kind, key, revision:tenant.revision, ...(kind === 'create' ? {
      draft:{ id:resourceId('api-key'), key:newSecret(), created:new Date().toISOString() },
    } : {}) });
    setName(key?.name || "");
    setDesc(key?.desc || "");
    setIpList((key?.ips || []).join("\n"));
    setExpiry(keyExpiryInput(key?.expiresAt));
    setBudgetAmount(subscription ? String(key?.planBudgetTokens ?? '') : key?.budgetMicros == null ? '' : String(key.budgetMicros / 1_000_000));
    setTpmEnabled(key?.tpmLimit!=null);setQpmEnabled(key?.qpmLimit!=null);
    setTpmLimit(String(key?.tpmLimit ?? 100000));setQpmLimit(String(key?.qpmLimit ?? 1000));
    setFormError("");
    setSelectedModels(key?.models || []);
    setQuotaEnabled(key?.quotaLimit!=null);
    setQuotaType(key?.quotaType || '不限额度');
    setQuota(key?.quotaLimit==null?(kind==='edit'?'':'10000'):String(key.quotaLimit));
    setModelScope(key?.models ? "限定范围" : "全选");
  };
  const save = async () => {
    if (saving || !project.canEdit || name.trim().length < 2) return;
    let ips, budgetMicros, expiresAt, planBudgetTokens = null;
    try {
      ips = parseIpAllowlist(ipList);
      budgetMicros = subscription ? null : parseBudgetAmount(budgetAmount);
      if (subscription && budgetAmount.trim()) {
        planBudgetTokens = Number(budgetAmount);
        if (!/^\d+$/.test(budgetAmount.trim()) || !Number.isSafeInteger(planBudgetTokens) || planBudgetTokens < 1) throw Error('套餐 Key 的 Token 预算须为正整数');
      }
      expiresAt = expiry === keyExpiryInput(panel.key?.expiresAt) ? panel.key?.expiresAt ?? null
        : expiry ? new Date(expiry + ':00+08:00').toISOString() : null;
    } catch (error) { setFormError(error.message); return; }
    if (modelScope === "限定范围" && !selectedModels.length) { setFormError("请至少选择一个模型"); return; }
    const access = { ips,budgetMicros,planBudgetTokens,expiresAt,tpmLimit:tpmEnabled?Number(tpmLimit):null,qpmLimit:qpmEnabled?Number(qpmLimit):null,quotaType,quotaEnabled:quotaEnabled && quotaType!=='不限额度',quotaLimit:!quotaEnabled || quotaType==='不限额度'?null:Number(quota), models: modelScope === "全选" ? null : selectedModels };
    const secret = panel.draft?.key;
    let saved;
    if (panel.kind === "create")
      saved=await setKeys([
        {
          name: name.trim(),
          ...panel.draft,
          ...(subscription ? { subscriptionId: subscription.id } : {}),
          ...access,
          desc,
          enabled: true,
        },
        ...keys,
      ]);
    else
      saved=await setKeys(
        keys.map((k) =>
          k.id === panel.key.id ? { ...k, name: name.trim(), desc, ...access } : k,
        ),
      );
    if(!saved)return;
    setPanel(null);
    if (secret) revealSecret(secret);
    else setCopied("API Key 已保存");
  };
  const toggle = (key) =>
    setKeys(keys.map((k) => (k.id === key.id ? { ...k, enabled: !k.enabled } : k)));
  const copyText = (value, label) =>
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(`${label} 已复制到剪贴板`);
        setCopiedValue(value);
      })
      .catch(() => { setCopiedValue(""); setCopied("复制失败，请允许剪贴板访问后重试"); });
  const suggestions=keys.filter(key=>`${key.name} ${key.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filteredKeys=selectedSearchId?keys.filter(key=>key.id===selectedSearchId):suggestions;
  const currentPage=Math.min(page,Math.max(1,Math.ceil(filteredKeys.length/size)));
  const visibleKeys=filteredKeys.slice((currentPage-1)*size,currentPage*size);
  const actionTitles={models:'可访问模型',ip:'IP 白名单',reset:'重置 API Key',delete:'删除 API Key'};
  const actionDescriptions={
    models:'查看此 Key 允许访问的模型',
    ip:'仅允许白名单来源调用，留空表示不限制。',
    reset:'重置后旧密钥立即失效，请及时替换业务系统中的密钥。Key ID、额度和访问权限保持不变。',
    delete:'删除后该 Key 将无法继续调用，且不可恢复。',
  };
  const saveAction=async()=>{
    if(saving || !action || !project.canEdit)return;
    const target=action.key.id;
    if(action.kind==='ip'){
      let ips;
      try{ips=parseIpAllowlist(ipList);}catch(error){setFormError(error.message);return;}
      if(!await setKeys(keys.map(key=>key.id===target?{...key,ips}:key)))return;
      setCopied('IP 白名单已保存');
    }else if(action.kind==='reset'){
      if(!await setKeys(keys.map(key=>key.id===target?{...key,key:action.secret,credentialVersion:(key.credentialVersion || 1)+1}:key)))return;
      revealSecret(action.secret);
    }else if(action.kind==='delete'){
      if(!await setKeys(keys.filter(key=>key.id!==target)))return;
      setCopied('API Key 已删除');
    }
    setAction(null);
  };
  const showIp=key=>{
    setIpList(key.ips.join('\n'));setFormError('');setAction({kind:'ip',key});
  };
  const ipLink=key=><Button theme="borderless" size="small" onClick={()=>showIp(key)}>
    IP 白名单：{key.ips.length?key.ips.length+' 项':'不限制'}
  </Button>;
  const scopeModels=action?.key.models===null?editModels.map(([model])=>model):action?.key.models || [];
  const scopeOptions=scopeModels.filter(model=>model.toLowerCase().includes(scopeQuery.trim().toLowerCase()));
  const columns=[
    {title:'Key 名称 / Key ID',width:220,render:(_,key)=><div className="key-identity">
      <strong>{key.name}</strong><div><code>{key.id}</code>
        <Button theme="borderless" size="small" icon={copiedValue===key.id?<Check size={14}/>:<Copy size={14}/>}
          aria-label={'复制 Key ID '+key.name} onClick={()=>copyText(key.id,'Key ID')} />
      </div><small>创建于 {key.created}</small>
    </div>},
    {title:'API Key',width:142,render:(_,key)=><code>{maskApiKey(key.key)}</code>},
    {title:'状态',width:125,render:(_,key)=><div className="key-identity">
      <Switch checked={key.enabled} disabled={!project.canEdit || saving}
        aria-label={(key.enabled?'停用':'启用')+key.name} onChange={()=>toggle(key)}/>
      {key.expiresAt && <small title={projectTime(key.expiresAt)}>{Date.parse(key.expiresAt)<=Date.now()?'已过期':'到期 '+projectTime(key.expiresAt)}</small>}
    </div>},
    {title:subscription?'访问权限':'访问范围',width:176,render:(_,key)=><div className="key-identity">
      {key.models===null?<Tag>无限制</Tag>:<Button theme="borderless" size="small"
        onClick={()=>{setScopeQuery('');setAction({kind:'models',key});}}>{key.models.length} 个模型</Button>}
      {subscription && <>{ipLink(key)}{key.desc && <small>{key.desc}</small>}
        {key.planBudgetTokens!=null && <small>套餐抵扣预算 {key.planBudgetTokens.toLocaleString('zh-CN')} Token</small>}</>}
    </div>},
    ...(!subscription?[{title:'安全与额度',width:200,render:(_,key)=><div className="key-identity">
      <strong>{key.quotaLimit==null?'Token 不限额':key.quota+' Token'}</strong>
      {key.quotaLimit!=null && <Progress percent={Math.min(100,Math.max(0,key.progress || 0))} size="small" />}
      {key.budgetMicros!=null && <small>消费预算 {projectMoney(key.budgetMicros/1_000_000)}</small>}
      {ipLink(key)}{key.desc && <small>{key.desc}</small>}
    </div>}]:[]),
    {title:'操作',width:142,fixed:'right',render:(_,key)=>project.canEdit?<div className="key-actions">
      <Button theme="borderless" size="small" onClick={()=>openPanel('edit',key)}>编辑</Button>
      <Button theme="borderless" size="small" onClick={()=>setAction({kind:'reset',key})}>重置</Button>
      <Button theme="borderless" size="small" type="danger" onClick={()=>setAction({kind:'delete',key})}>删除</Button>
    </div>:'—'},
  ];
  const quotaOptions=(panel?.kind==='edit'?['不限额度','日','月','总额度']:['日','月','总额度']).map(value=>({value,label:value}));
  const formId=keyScope+'-key-editor';
  const isEditing=panel?.kind==='edit';
  const allowsQuota=quotaEnabled && quotaType!=='不限额度';
  return <div className="tenant-keys-panel">
    {tenant.error && <Banner type="danger" description={tenant.error}/>}
    <div className="key-toolbar">
      {subscription && <h2>{subscription.name}</h2>}
      {project.canEdit && <Button theme="solid" onClick={()=>openPanel('create')}>创建 API Key</Button>}
      <AutoComplete className="key-search" aria-label="搜索 Key 名称或 Key ID" placeholder="搜索 Key 名称或 Key ID"
        prefix={<Search size={16}/>} showClear value={query}
        data={[{value:'',label:'全部 Key'},...suggestions.map(key=>({value:key.id,label:key.name}))]}
        renderItem={item=><span>{item.label}{item.value && <small> · {item.value}</small>}</span>}
        renderSelectedItem={item=>item.value?item.label:''} onSelectWithObject
        onSearch={value=>{setQuery(value);setSelectedSearchId(null);setPage(1);}}
        onSelect={item=>{setQuery(item.value?item.label:'');setSelectedSearchId(item.value || null);setPage(1);}} />
      <Button type="tertiary" aria-label="刷新 API Key" icon={<RefreshCw size={16}/>} onClick={tenant.reload}/>
    </div>
    <Table className="tenant-keys-table" rowKey="id" dataSource={visibleKeys} columns={columns} size="small" pagination={false}
      scroll={{x:subscription?850:1000}} empty={<Empty className="tenant-key-empty"
        title={query?'没有匹配的 API Key':'暂无 API Key'} />} />
    <FilterPagination total={filteredKeys.length} page={currentPage} size={size} onPageChange={setPage}
      onSizeChange={value=>{setSize(value);setPage(1);}} />
    {copied && <div className="copy-toast" role="status">{copied}</div>}

    {action && <Modal visible title={actionTitles[action.kind]} width="min(500px, calc(100vw - 24px))"
      onCancel={()=>{if(!saving)setAction(null);}} closable={!saving} closeOnEsc={!saving} maskClosable={false}
      footer={<><Button type="tertiary" disabled={saving} onClick={()=>setAction(null)}>{action.kind==='models'?'关闭':'取消'}</Button>
        {action.kind!=='models' && project.canEdit && <Button theme="solid" type={action.kind==='delete'?'danger':'primary'}
          loading={saving} onClick={saveAction}>{action.kind==='ip'?'保存':action.kind==='reset'?'确认重置':'确认删除'}</Button>}
      </>}>
      <p>{action.key.name} · {actionDescriptions[action.kind]}</p>
      {action.kind==='models' && <>
        <Input aria-label="搜索可访问模型" placeholder="搜索模型名称" value={scopeQuery} onChange={setScopeQuery}/>
        <div className="key-model-options">{scopeOptions.map(model=><Tag key={model}>{model}</Tag>)}
          {!scopeOptions.length && <p>没有匹配的模型</p>}</div>
      </>}
      {action.kind==='ip' && <TextArea aria-label="IP 白名单" rows={5} readonly={!project.canEdit} value={ipList}
        onChange={value=>{setIpList(value);setFormError('');}} placeholder={'例如：10.0.1.100\n192.168.1.0/24'} />}
      {formError && <Banner type="danger" description={formError}/>}
    </Modal>}
    {reveal && <Modal visible title="保存 API Key" width="min(500px, calc(100vw - 24px))"
      onCancel={()=>setReveal(null)} maskClosable={false} footer={<>
        <Button onClick={async()=>{try{await navigator.clipboard.writeText(reveal);setSecretFeedback('API Key 已复制');}
          catch{setSecretFeedback('复制失败，请选中密钥后手动复制');}}}>复制 API Key</Button>
        <Button theme="solid" onClick={()=>setReveal(null)}>完成</Button>
      </>}>
      <p>密钥明文仅展示一次，请保存后关闭。</p>
      <code className="key-secret" aria-label="API Key 明文">{reveal}</code>
      {secretFeedback && <p role="status">{secretFeedback}</p>}
    </Modal>}
    {panel && <SideSheet visible title={(isEditing?'编辑':'创建')+' API Key'} width="min(560px, 100vw)"
      onCancel={()=>{if(!saving)setPanel(null);}} closable={!saving} closeOnEsc={!saving}
      footer={<>
        <Button type="tertiary" disabled={saving} onClick={()=>setPanel(null)}>取消</Button>
        <Button theme="solid" htmlType="submit" form={formId} loading={saving} disabled={name.trim().length<2}>确定</Button>
      </>}>
      <form id={formId} className="tenant-key-form" onSubmit={event=>{event.preventDefault();void save();}}>
        <p>所属项目 · {project.name}{subscription && ' · '+subscription.name+' · '+subscription.id}</p>
        <label>Key 名称<Input value={name} aria-label="Key 名称" placeholder="请输入 Key 名称" onChange={setName} /></label>
        <label>说明（选填）<TextArea value={desc} maxLength={200} onChange={setDesc} /></label>
        <label>IP 白名单（选填）<TextArea value={ipList} onChange={setIpList}
          placeholder="IPv4 或 CIDR 网段，用逗号或换行分隔，留空不限制" /></label>
        <label>{subscription?'套餐抵扣预算（Token）':'累计消费预算（人民币）'}
          <Input inputMode={subscription?'numeric':'decimal'} value={budgetAmount} placeholder="留空表示不限" onChange={setBudgetAmount} />
        </label>
        <label>有效期（北京时间）<Input type="datetime-local" value={expiry} onChange={setExpiry} /></label>
        {!subscription && <fieldset>
          <legend>额度与限流</legend>
          {!isEditing && <div className="key-switch-row">额度限制
            <Switch aria-label="额度限制" checked={quotaEnabled} onChange={value=>{
              if(value && quotaType==='不限额度')setQuotaType('日');
              setQuotaEnabled(value);
            }}/>
          </div>}
          {(isEditing || quotaEnabled) && <RadioGroup type="button" aria-label="限额策略" value={quotaType} options={quotaOptions}
            onChange={event=>{const value=event.target.value;setQuotaType(value);setQuotaEnabled(value!=='不限额度');}}/>}
          {allowsQuota && <>
            <label>额度上限（Tokens）<Input inputMode="numeric" aria-label="额度上限" value={quota}
              onChange={value=>setQuota(value.replace(/\D/g,''))}/></label>
            <small>{quotaType==='日'?'按北京时间自然日重置。':quotaType==='月'?'按北京时间自然月重置。':'总额度持续累积。'}切换额度周期后重新累计用量。</small>
          </>}
          {isEditing && allowsQuota && <>
            <div className="key-switch-row">TPM 限制<Switch aria-label="TPM 限制" checked={tpmEnabled} onChange={setTpmEnabled}/>
              <Input inputMode="numeric" aria-label="TPM 上限" disabled={!tpmEnabled} value={tpmLimit} onChange={setTpmLimit}/></div>
            <div className="key-switch-row">QPM 限制<Switch aria-label="QPM 限制" checked={qpmEnabled} onChange={setQpmEnabled}/>
              <Input inputMode="numeric" aria-label="QPM 上限" disabled={!qpmEnabled} value={qpmLimit} onChange={setQpmLimit}/></div>
          </>}
        </fieldset>}
        <fieldset>
          <legend>可访问范围</legend>
          <RadioGroup type="button" aria-label="模型访问范围" value={modelScope}
            onChange={event=>setModelScope(event.target.value)} options={[{value:'全选',label:subscription?'本套餐全部可用模型':'全部已开通模型'},{value:'限定范围',label:'限定模型'}]}/>
          {modelScope==='限定范围' && <div className="key-model-options">{editModels.map(([model,type])=><Checkbox
            key={model} checked={selectedModels.includes(model)} onChange={event=>{
              const checked=event.target.checked;
              setSelectedModels(previous=>checked?[...previous,model]:previous.filter(value=>value!==model));
            }}>{model} · {type}</Checkbox>)}</div>}
          {!editModels.length && onModels && <div className="key-switch-row">当前项目尚未开通模型<Button theme="borderless" onClick={onModels}>查看模型权限</Button></div>}
        </fieldset>
        {formError && <Banner type="danger" description={formError}/>}
      </form>
    </SideSheet>}
  </div>;
}
