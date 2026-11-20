import { resourceId } from '../resource-id.mjs';
import { AdminModal, AdminSideSheet } from '../admin-v2/AdminOverlay';
import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, Search, Settings } from 'lucide-react';
import { AutoComplete, Banner, Button, Empty, Input, Progress, Switch, Table, Tabs, Tag, TextArea, Toast } from '@douyinfe/semi-ui';
import { useTenantData } from '../useTenantData';
import { maskApiKey, parseIpAllowlist } from '../api-key-utils.mjs';
import { projectModelEnabled } from '../project-access.mjs';
import { parseBudgetAmount } from '../project-call.mjs';
import { projectMoney, projectTime } from './ProjectConfiguration';
import { DEFAULT_PAGE_SIZE, FilterPagination } from './FilterControls';
import FrontPageHeader from './FrontPageHeader';

const billingTypes = ['按量付费', 'Token Plan'];

export default function UnifiedApiKeys({ project, embedded = false, onProjects, onModels, onAudit, internal }) {
  if (!project) return <div className="api-key-unified us-page">
    <FrontPageHeader title="API Key 管理" description="选择项目后管理其 API Key" icon={KeyRound} />
    <Button onClick={onProjects}>前往项目管理</Button>
  </div>;
  return <div className="api-key-unified us-page">
    {!embedded && <FrontPageHeader title="API Key 管理" description={`所属项目 · ${project.name}`} icon={KeyRound} />}
    {embedded && project.canManage && <Button theme="borderless" onClick={onAudit}>查看操作记录</Button>}
    {internal ? <ApiKeys billing="按量付费" project={project} onModels={onModels} internal={internal}/> : <Tabs className="tenant-key-tabs" defaultActiveKey="按量付费" aria-label="API Key 计费方式" keepDOM>
      {billingTypes.map(type=><Tabs.TabPane key={type} itemKey={type} tab={type}>
        {type==='Token Plan'?<TokenPlanApiKeys project={project} onModels={onModels}/>
          :<ApiKeys billing={type} project={project} onModels={onModels}/>}
      </Tabs.TabPane>)}
    </Tabs>}
  </div>;
}

function TokenPlanApiKeys({ project, onModels }) {
  const tenant=useTenantData();
  const tokenPlanSubscriptions=tenant.plans.map(row=>({id:row.id,name:row.product.name,startAt:row.createdAt?.slice(0,10) || '',endAt:row.expiresAt || '长期有效'}));
  const [planId, setPlanId] = useState(tokenPlanSubscriptions[0]?.id || "");
  const [planQuery, setPlanQuery] = useState("");
  const selectedPlan = tokenPlanSubscriptions.find(plan => plan.id === planId) || tokenPlanSubscriptions[0];
  const effectivePlanId=selectedPlan?.id;
  const visiblePlans = tokenPlanSubscriptions.filter(plan => `${plan.name} ${plan.id}`.toLowerCase().includes(planQuery.trim().toLowerCase()));
  if (!selectedPlan) return <Empty className="tenant-key-empty" title="暂无 Token Plan 订阅">
    <Button theme="outline" onClick={()=>{location.href='?page=model-order';}}>前往模型订购</Button>
  </Empty>;
  return <div className="token-plan-workspace">
    <nav className="token-plan-sidebar" aria-label="已购 Token Plan">
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

function ApiKeys({ billing, subscription, project, onModels, internal }) {
  const tenant=useTenantData();
  const [reveal, setReveal] = useState(null);
  const [secretFeedback, setSecretFeedback] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [expiry, setExpiry] = useState('');
  const editModels = [...new Map((tenant.projectServices || []).filter(row=>projectModelEnabled(project,row.modelKey)).map(row=>[row.modelId,[row.modelId,row.typeLabel || row.type]])).values()];
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
  const setAction=value=>setActionState(value?{...value,revision:tenant.revision}:null);
  useEffect(() => {
    if (!copied && !copiedValue) return;
    const timer = setTimeout(() => { setCopied(""); setCopiedValue(""); }, 2000);
    return () => clearTimeout(timer);
  }, [copied, copiedValue]);
  const openPanel = (kind, key) => {
    setPanel({ kind, key, revision:tenant.revision });
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
    const secret = panel.kind === 'create' ? 'sk-' + crypto.randomUUID().replaceAll('-', '') : null;
    let saved;
    if (panel.kind === "create")
      saved=await setKeys([
        {
          name: name.trim(),
          id: resourceId('api-key'),
          key: secret,
          ...(subscription ? { subscriptionId: subscription.id } : {}),
          ...access,
          created: new Date().toLocaleString("sv-SE"),
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
      const secret = 'sk-' + crypto.randomUUID().replaceAll('-', '');
      if(!await setKeys(keys.map(key=>key.id===target?{...key,key:secret,credentialVersion:(key.credentialVersion || 1)+1}:key)))return;
      revealSecret(secret);
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
      <Button type="tertiary" aria-label="刷新" icon={<RefreshCw size={16}/>} onClick={tenant.reload}/>
      <Button type="tertiary" aria-label="设置" icon={<Settings size={16}/>}/>
    </div>
    <Table className="tenant-keys-table" rowKey="id" dataSource={visibleKeys} columns={columns} size="small" pagination={false}
      scroll={{x:subscription?850:1000}} empty={<Empty className="tenant-key-empty"
        title={query?'没有匹配的 API Key':'暂无 API Key'} />} />
    <FilterPagination total={filteredKeys.length} page={currentPage} size={size} onPageChange={setPage}
      onSizeChange={setSize} />
    {copied && <div className="copy-toast" role="status">{copied}</div>}

    {action && <AdminModal visible title={actionTitles[action.kind]} width="min(500px, calc(100vw - 24px))"
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
    </AdminModal>}
    {reveal && <AdminModal visible title="保存 API Key" width="min(500px, calc(100vw - 24px))"
      onCancel={()=>setReveal(null)} maskClosable={false} footer={<>
        <Button onClick={async()=>{try{await navigator.clipboard.writeText(reveal);setSecretFeedback('API Key 已复制');}
          catch{setSecretFeedback('复制失败，请选中密钥后手动复制');}}}>复制 API Key</Button>
        <Button theme="solid" onClick={()=>setReveal(null)}>完成</Button>
      </>}>
      <p>密钥明文仅展示一次，请保存后关闭。</p>
      <code className="key-secret" aria-label="API Key 明文">{reveal}</code>
      {secretFeedback && <p role="status">{secretFeedback}</p>}
    </AdminModal>}
    {panel && <AdminSideSheet visible title={(panel.kind === 'edit' ? '编辑' : '创建') + ' API Key'} width="min(560px, 100vw)"
      onCancel={()=>{if(!saving)setPanel(null);}} closable={!saving} closeOnEsc={!saving} maskClosable={!saving}
      footer={<div className="key-editor-footer">
        {formError && <p className="key-error" role="alert">{formError}</p>}
        <div className="key-editor-actions">
          <span>已选范围 <small>{modelScope === '全选' ? '全部模型和服务' : selectedModels.length + ' 个模型'}</small></span>
          <div className="key-actions">
            <Button type="tertiary" disabled={saving} onClick={()=>setPanel(null)}>取消</Button>
            <Button theme="solid" loading={saving} disabled={name.trim().length < 2} onClick={save}>确定</Button>
          </div>
        </div>
      </div>}>
      <div className="drawer-form tenant-key-form">
              <div className="token-plan-drawer-context">所属项目<strong>{project.name}</strong></div>
              {subscription && <div className="token-plan-drawer-context">所属 Token Plan<strong>{subscription.name}</strong><small>订阅编号：{subscription.id}</small></div>}
              {!editModels.length && onModels && <div className="token-plan-drawer-context">当前项目尚未开通模型<Button theme="borderless" onClick={onModels}>查看模型权限</Button></div>}
              <section className="edit-section">
                <h3>消费预算与有效期</h3>
                <label><span>{subscription ? '套餐抵扣预算（Token）' : '累计消费预算（人民币）'}</span><Input inputMode={subscription ? 'numeric' : 'decimal'} value={budgetAmount}
                  placeholder="留空表示不限" onChange={setBudgetAmount} /></label>
                <label><span>有效期（北京时间）</span><Input type="datetime-local" value={expiry}
                  onChange={setExpiry} /></label>
              </section>
              {panel.kind === "edit" ? (
                <>
                  <section className="edit-section">
                    <h3>基本信息</h3>
                    <label>
                      <span>
                        <i>*</i> Key 名称
                      </span>
                      <div>
                        <Input
                          value={name}
                          onChange={setName}
                          placeholder="请输入 Key 名称"
                        />
                        <small>
                          长度为3–24个字符，支持中文、英文、数字、下划线和中划线字符
                        </small>
                      </div>
                    </label>
                    <label>
                      <span>描述</span>
                      <TextArea
                        maxLength={200}
                        value={desc}
                        onChange={setDesc}
                        placeholder="请输入描述"
                      />
                    </label>
                  </section>
                  {!subscription && <section className="edit-section">
                    <h3>
                      额度限制{" "}
                      <small>
                        API key限额仅对域名为 https://moma.cmecloud.cn
                        且消耗tokens的按量计费文本模型生效。
                      </small>
                    </h3>
                    <label>
                      <span>Tokens限额策略</span>
                      <div>
                        <div className="radio-row">
                          {["不限额度", "日", "月", "总额度"].map((x) => (
                            <button
                              className={quotaType === x ? "active" : ""}
                              onClick={() => { setQuotaType(x); setQuotaEnabled(x !== "不限额度"); }}
                              key={x}
                            >
                              <i />
                              {x}
                            </button>
                          ))}
                        </div>
                        <small className="quota-help">
                          {quotaType === "日" ? (
                            "按自然日统计，每日 00:00 重置用量重新累积，后续编辑更换限额策略时，历史用量会清空，用量重新统计"
                          ) : quotaType === "月" ? (
                            <>
                              1、按自然月统计，每月1日00:00重置用量重新累积，后续编辑更换限额策略时，历史用量会清空，用量重新统计；
                              <br />
                              2、按所选生效日统计，周期结束自动重置。默认每月1日至月末。
                            </>
                          ) : quotaType === "总额度" ? (
                            "开启后持续累积用量，不自动重置，后续编辑更换限额策略时，历史用量会清空，用量重新统计"
                          ) : (
                            "后续编辑更换限额策略时，历史用量会清空，用量重新统计"
                          )}
                        </small>
                      </div>
                    </label>
                    {quotaType !== "不限额度" && (
                      <div className="token-quota-panel">
                        <div className="token-quota-notice">
                          <Info size={15} />
                          切换限额策略或修改月度生效日后，历史用量将清零，并按新规则重新累积。
                        </div>
                        {quotaType !== "总额度" && (
                          <label>
                            <span>生效范围</span>
                            {quotaType === "月" ? (
                              <div className="month-range">
                                <select>
                                  <option>每月</option>
                                </select>
                                <select>
                                  <option>1日</option>
                                </select>
                                <Input value="00:00:00" readonly />
                                <b>至</b>
                                <Input value="每月30/31日 23:59:00" readonly />
                                <small>自动续配</small>
                                <button
                                  className="switch"
                                  aria-label="自动续配"
                                >
                                  <i />
                                </button>
                              </div>
                            ) : (
                              <Input value="00:00:00 ~ 23:59:59" readonly />
                            )}
                          </label>
                        )}
                        <label>
                          <span>额度上限</span>
                          <div className="quota-input">
                            <Input
                              value={quota}
                              placeholder="请输入限额"
                              onChange={value => setQuota(value.replace(/\D/g, ""))
                              }
                            />
                            <b>Tokens</b>
                          </div>
                        </label>
                      </div>
                    )}
                    {quotaType !== "不限额度" && (
                      <>
                        <label>
                          <span>TPM 限制</span>
                          <div className="rate-limit">
                            <Switch aria-label="TPM 限制" checked={tpmEnabled} onChange={setTpmEnabled}/>
                            <small>
                              当实时TPM达到设定阈值时，将触发限流策略
                            </small>
                            <Input
                              disabled={!tpmEnabled}
                              aria-label="TPM 上限" value={tpmLimit} onChange={setTpmLimit}
                            />
                          </div>
                        </label>
                        <label>
                          <span>QPM 限制</span>
                          <div className="rate-limit">
                            <Switch aria-label="QPM 限制" checked={qpmEnabled} onChange={setQpmEnabled}/>
                            <small>
                              当实时QPM达到设定阈值时，将触发限流策略
                            </small>
                            <Input aria-label="QPM 上限" disabled={!qpmEnabled} value={qpmLimit} onChange={setQpmLimit} />
                          </div>
                        </label>
                      </>
                    )}
                  </section>}
                  <section className="edit-section"><h3>IP 白名单</h3><label><span>允许的来源</span><div><TextArea aria-label="编辑 IP 白名单" value={ipList} onChange={setIpList} placeholder="IPv4 或 CIDR 网段，用逗号或换行分隔；留空不限制"/></div></label></section>
                  <section className="edit-section access-edit">
                    <h3>可访问范围</h3>
                    <label>
                      <span>模型限制</span>
                      <div className="radio-row">
                        {["全选", "限定范围"].map((x) => (
                          <button
                            className={modelScope === x ? "active" : ""}
                            onClick={() => setModelScope(x)}
                            key={x}
                          >
                            <i />
                            {x}
                          </button>
                        ))}
                      </div>
                    </label>
                    {modelScope === "限定范围" && (
                      <>
                        <div className="model-filter-row">
                          <select>
                            <option>全部模型系列</option>
                          </select>
                          <select>
                            <option>全部模型类别</option>
                          </select>
                          <select>
                            <option>全部模型服务商</option>
                          </select>
                          <label>
                            <Input placeholder="按规格名称搜索" />
                            <Search size={16} />
                          </label>
                          <label className="hide-models">
                            <input type="checkbox" /> 隐藏不可选模型
                          </label>
                        </div>
                        <div className="scope-table">
                          <div className="scope-row scope-head">
                            <span>
                              <input type="checkbox" />
                            </span>
                            <b>模型名称</b>
                            <b>{internal ? '授权状态' : '订购状态'}</b>
                            <b>模型类别</b>
                          </div>
                          {editModels.map(([model, type]) => (
                            <div className="scope-row" key={model}>
                              <span>
                                <input
                                  type="checkbox"
                                  checked={selectedModels.includes(model)}
                                  onChange={() =>
                                    setSelectedModels(
                                      selectedModels.includes(model)
                                        ? selectedModels.filter(
                                            (x) => x !== model,
                                          )
                                        : [...selectedModels, model],
                                    )
                                  }
                                />
                              </span>
                              <span>{model}</span>
                              <span>
                                {internal ? <em>已授权</em> : tenant.orders.some(order=>['生效中','已开通'].includes(order.status)&&tenant.services.some(service=>service.id===order.serviceId&&service.modelId===model)) ? <em>已订购</em> : <><em>未订购</em><button onClick={()=>window.open(`/${'moma_5.12.0_estack'}/?page=model-order`,'_blank','noopener')}>去订购 →</button></>}
                              </span>
                              <span>{type}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <label>
                    <span>Key 名称</span>
                    <Input
                      value={name}
                      onChange={setName}
                      placeholder="请输入 Key 名称"
                    />
                  </label>
                  <label>
                    <span>说明（选填）</span>
                    <TextArea
                      value={desc}
                      onChange={setDesc}
                      placeholder="用于区分 Key 的用法"
                    />
                  </label>
                  <label>
                    <span>IP 白名单（选填）</span>
                    <TextArea
                      value={ipList}
                      onChange={setIpList}
                      placeholder={
                        "多个 IP 用逗号或换行分隔，例如：\n10.0.1.100, 10.0.1.101"
                      }
                    />
                  </label>
                  {!subscription && <div className="quota-label">
                    <span>额度限制</span>
                    <button
                      className={`switch ${quotaEnabled ? "on" : ""}`}
                      aria-label="额度限制"
                      onClick={() => { if (!quotaEnabled && quotaType === "不限额度") setQuotaType("日"); setQuotaEnabled(!quotaEnabled); }}
                    >
                      <i />
                    </button>
                    <small>
                      开启后，该 API Key 的 token 用量达到配额上限将停止服务。
                    </small>
                  </div>}
                  {!subscription && quotaEnabled && (
                    <section className="quota-settings">
                      <div className="quota-warning">
                        切换限额策略或修改生效日后，历史用量将清零，并按新规则重新累积。
                      </div>
                      <label>
                        <span>限额策略</span>
                        <div className="radio-row">
                          {["日", "月", "总额度"].map((x) => (
                            <button
                              className={quotaType === x ? "active" : ""}
                              onClick={() => { setQuotaType(x); setQuotaEnabled(x !== "不限额度"); }}
                              key={x}
                            >
                              <i />
                              {x}
                            </button>
                          ))}
                        </div>
                      </label>
                      <label>
                        <span>生效范围</span>
                        <Input disabled value="00:00:00 ~ 23:59:59" readonly />
                      </label>
                      <label>
                        <span>额度上限</span>
                        <div className="quota-input">
                          <Input
                            value={quota}
                            onChange={value => setQuota(value.replace(/\D/g, ""))
                            }
                          />
                          <b>tokens</b>
                        </div>
                      </label>
                    </section>
                  )}
                  <div className="access-scope">
                    <span>可访问范围</span>
                    <label>
                      <input type="radio" checked={modelScope === "全选"} onChange={() => setModelScope("全选")} name="scope" /> 全选{" "}
                      <small>（可访问当前项目已开通模型）</small>
                    </label>
                    <label>
                      <input type="radio" checked={modelScope === "限定范围"} onChange={() => setModelScope("限定范围")} name="scope" /> 限定范围{" "}
                      <small>
                        （包含模型对应的默认和自定义推理服务接入点）
                      </small>
                    </label>
                  </div>
                  {modelScope === "限定范围" && <div className="key-model-list">{editModels.map(([model]) => <label key={model}><input type="checkbox" checked={selectedModels.includes(model)} onChange={e => setSelectedModels(e.target.checked ? [...selectedModels, model] : selectedModels.filter(value => value !== model))}/>{model}</label>)}</div>}
                </>
              )}
            </div>
    </AdminSideSheet>}
  </div>;
}
