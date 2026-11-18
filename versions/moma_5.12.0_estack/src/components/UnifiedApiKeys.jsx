import { resourceId } from '../resource-id.mjs';
import { useEffect, useState } from 'react';
import { Check, Copy, Info, KeyRound, RefreshCw, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantData } from '../useTenantData';
import { maskApiKey, parseIpAllowlist } from '../api-key-utils.mjs';
import { projectModelEnabled } from '../project-access.mjs';
import { parseBudgetAmount } from '../project-call.mjs';
import { projectMoney, projectTime } from './ProjectConfiguration';
import { DEFAULT_PAGE_SIZE, FilterPagination } from './FilterControls';
import FrontPageHeader from './FrontPageHeader';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

const billingTypes = ['按量付费', 'Token Plan'];

export default function UnifiedApiKeys({ project, embedded = false, onProjects, onModels, onAudit, internal }) {
  if (!project) return <div className="api-key-unified us-page">
    <FrontPageHeader title="API Key 管理" description="选择项目后管理其 API Key" icon={KeyRound} />
    <Button onClick={onProjects}>前往项目管理</Button>
  </div>;
  return <div className="api-key-unified us-page">
    {!embedded && <FrontPageHeader title="API Key 管理" description={`所属项目 · ${project.name}`} icon={KeyRound} />}
    {embedded && project.canManage && <Button variant="link" onClick={onAudit}>查看操作记录</Button>}
    {internal ? <ApiKeys billing="按量付费" project={project} hideHeading onModels={onModels} internal/> : <Tabs defaultValue="按量付费">
      <TabsList variant="line" className="us-tabs" aria-label="API Key 计费方式">
        {billingTypes.map(type => <TabsTrigger key={type} value={type}>{type}</TabsTrigger>)}
      </TabsList>
      {billingTypes.map(type => <TabsContent key={type} value={type} forceMount className="api-key-billing-panel">{type === "Token Plan" ? <TokenPlanApiKeys project={project} onModels={onModels} /> : <ApiKeys billing={type} project={project} hideHeading onModels={onModels} />}</TabsContent>)}
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
  if (!selectedPlan) return <div className="v2-empty">暂无 Token Plan 订阅，<a href="?page=model-order">前往模型订购</a></div>;
  return <div className="token-plan-workspace">
    <nav className="token-plan-sidebar" aria-label="已购 Token Plan">
      <h2>已购套餐</h2>
      <div className="token-plan-search"><Search size={16} aria-hidden="true" /><Input aria-label="搜索套餐名称或订阅编号" placeholder="搜索套餐名称或编号" value={planQuery} onChange={e => setPlanQuery(e.target.value)} /></div>
      <div className="token-plan-list">
        {visiblePlans.map(plan => <Button key={plan.id} variant="ghost" className="token-plan-item" aria-label={`选择套餐：${plan.name} ${plan.id}`} aria-pressed={plan.id === effectivePlanId} onClick={() => setPlanId(plan.id)}>
          <strong>{plan.name}</strong><span>{plan.id}</span><small>{plan.startAt} 至 {plan.endAt}</small>
        </Button>)}
        {!visiblePlans.length && <p className="token-plan-empty" role="status">没有匹配的套餐</p>}
      </div>
    </nav>
    <div className="token-plan-detail">
      {tokenPlanSubscriptions.map(plan => <div key={plan.id} hidden={plan.id !== effectivePlanId}><ApiKeys billing="Token Plan" subscription={plan} project={project} hideHeading onModels={onModels} /></div>)}
    </div>
  </div>;
}

const keyExpiryInput = value => Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : '';

function ApiKeys({ billing, subscription, project, hideHeading = false, onModels, internal }) {
  const tenant=useTenantData();
  const keyScope=subscription?.id || billing;
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
      setFormError(error.message); toast.error(error.message); return false;
    } finally { setSaving(false); }
  };
  const revealSecret = value => { setSecretFeedback(''); setReveal(value); };
  const     [query, setQuery] = useState(""),
    [selectedSearchId, setSelectedSearchId] = useState(null),
    [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE),
    [searchOpen, setSearchOpen] = useState(false),
    [activeSuggestion, setActiveSuggestion] = useState(0),
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
    if (name.trim().length < 2) return;
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
  const suggestions = keys.filter((k) => `${k.name} ${k.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filteredKeys = selectedSearchId ? keys.filter((k) => k.id === selectedSearchId) : suggestions;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredKeys.length / size)));
  const visibleKeys = filteredKeys.slice((currentPage - 1) * size, currentPage * size);
  const chooseSuggestion = (key) => {
    setPage(1);
    setSelectedSearchId(key.id);
    setQuery(key.name);
    setSearchOpen(false);
  };
  return (
    <div className="api-key-page">
      {tenant.error && <p role="alert">{tenant.error}</p>}
      {!hideHeading && <div className="api-key-heading">
        <h1>API Key 管理</h1>
        <span>{billing}</span>
      </div>}
      <div className="api-key-tools">
        <div className="api-key-tools-leading">
        {subscription && <h2 className="token-plan-title" title={subscription.name}>{subscription.name}</h2>}
        {project.canEdit && <button className="primary" onClick={() => openPanel("create")}>
          创建 API Key
        </button>}
        </div>
        <div>
          <div className="api-key-search" onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setSearchOpen(false);
          }}>
            <label>
              <Search size={16} />
              <input
                role="combobox"
                aria-label="搜索 Key 名称或 Key ID"
                aria-autocomplete="list"
                aria-expanded={searchOpen}
                aria-controls={`api-key-suggestions-${keyScope}`}
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => { setQuery(e.target.value); setPage(1); setSelectedSearchId(null); setActiveSuggestion(0); setSearchOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                  if (e.key === "ArrowDown") { e.preventDefault(); setSearchOpen(true); setActiveSuggestion((activeSuggestion + 1) % Math.max(suggestions.length, 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActiveSuggestion((activeSuggestion - 1 + Math.max(suggestions.length, 1)) % Math.max(suggestions.length, 1)); }
                  if (e.key === "Enter" && searchOpen && suggestions.length) { e.preventDefault(); chooseSuggestion(suggestions[activeSuggestion]); }
                }}
                placeholder="搜索 Key 名称或 Key ID"
              />
            </label>
            {searchOpen && <div className="api-key-search-menu" id={`api-key-suggestions-${keyScope}`} role="listbox" aria-label="Key 搜索建议">
              <button role="option" aria-selected={!query} onClick={() => { setQuery(""); setSelectedSearchId(null); setSearchOpen(false); }}>全部 Key</button>
              {suggestions.map((key, index) => <button key={key.id} role="option" aria-selected={selectedSearchId === key.id} className={index === activeSuggestion ? "is-active" : ""} onClick={() => chooseSuggestion(key)}><strong>{key.name}</strong><small>{key.id}</small></button>)}
              {!suggestions.length && <p>没有匹配的 Key</p>}
            </div>}
          </div>
          <button aria-label="刷新" onClick={tenant.reload}>
            <RefreshCw size={17} />
          </button>
          <button aria-label="设置">
            <Settings size={17} />
          </button>
        </div>
      </div>
      <div className="api-key-table">
        <div className="api-key-row api-key-head">
          {[
            "Key 名称/Key ID",
            "API Key",
            "状态",
            ...(subscription ? ["访问权限"] : ["访问范围", "安全与额度"]),
            "操作",
          ].map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        {visibleKeys
          .map((k) => (
            <div className="api-key-row" key={k.id}>
              <span className="api-key-identity">
                <b>{k.name}</b>
                <small className="key-id-line">
                  {k.id}
                  <button
                    className="inline-action"
                    aria-label={copiedValue === k.id ? "Key ID 已复制到剪贴板" : "复制 Key ID"}
                    title={copiedValue === k.id ? "已复制到剪贴板" : "复制 Key ID"}
                    onClick={() => copyText(k.id, "Key ID")}
                  >
                    {copiedValue === k.id ? <Check size={14} className="copy-success" /> : <Copy size={14} />}
                  </button>
                </small>
                <small>创建于 {k.created}</small>
              </span>
              <span className="api-key-value">
                {maskApiKey(k.key)}
              </span>
              <span>
                <button
                  className={`switch ${k.enabled ? "on" : ""}`}
                  aria-label={`${k.enabled ? "停用" : "启用"}${k.name}`}
                  disabled={!project.canEdit || saving}
                  onClick={() => toggle(k)}
                >
                  <i />
                </button>
                {k.expiresAt && <small title={projectTime(k.expiresAt)}>{Date.parse(k.expiresAt) <= Date.now() ? '已过期' : `到期 ${projectTime(k.expiresAt)}`}</small>}
              </span>
              <span className={subscription ? "api-key-security" : undefined}>
                {k.models === null ? <span className="key-unrestricted">无限制</span> : <button className="key-scope-link" onClick={() => { setAction({ kind: "models", key: k }); setScopeQuery(""); }}>{k.models.length} 个模型</button>}
                {subscription && <small><button className="key-ip-link" onClick={() => { setAction({ kind: "ip", key: k }); setIpList(k.ips.join("\n")); setFormError(""); }}>IP 白名单：{k.ips.length ? `${k.ips.length} 项` : "不限制"}</button>{k.desc ? ` · ${k.desc}` : ""}</small>}
                {subscription && k.planBudgetTokens != null && <small>套餐抵扣预算 {k.planBudgetTokens.toLocaleString('zh-CN')} Token</small>}
              </span>
              {!subscription && <span className="api-key-security">
                <b>{k.quotaLimit == null ? 'Token 不限额' : k.quota + ' Token'}</b>
                {k.quotaLimit != null && <i className="quota-bar">
                  <i style={{ width: `${k.progress || 0}%` }} />
                </i>}
                {k.budgetMicros != null && <small>消费预算 {projectMoney(k.budgetMicros / 1_000_000)}</small>}
                <small>
                  <button className="key-ip-link" onClick={() => { setAction({ kind: "ip", key: k }); setIpList(k.ips.join("\n")); setFormError(""); }}>IP 白名单：{k.ips.length ? `${k.ips.length} 项` : "不限制"}</button>
                  {k.desc ? ` · ${k.desc}` : ""}
                </small>
              </span>}
              <span className="api-key-actions">
                {project.canEdit ? <><button onClick={() => openPanel("edit", k)}>编辑</button>
                <button onClick={() => setAction({ kind: "reset", key: k })}>重置</button>
                <button className="danger-link" onClick={() => setAction({ kind: "delete", key: k })}>删除</button></> : '—'}
              </span>
            </div>
          ))}
      </div>
      {!visibleKeys.length && <div className="v2-empty">{query ? "没有匹配的 API Key" : "暂无 API Key"}</div>}
      {copied && (
        <div className="copy-toast" role="status">
          {copied}
        </div>
      )}
      <Dialog open={Boolean(action)} onOpenChange={open => { if (!open) setAction(null); }}>
        <DialogContent className="key-action-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{action?.kind === "models" ? "可访问模型" : action?.kind === "ip" ? "IP 白名单" : action?.kind === "reset" ? "重置 API Key" : "删除 API Key"}</DialogTitle>
            <DialogDescription>{action?.key.name} · {action?.kind === "models" ? "查看此 Key 允许访问的模型" : action?.kind === "ip" ? "仅允许白名单来源调用；留空表示不限制。" : action?.kind === "reset" ? "重置后旧密钥立即失效，请及时替换业务系统中的密钥。Key ID、额度和访问权限保持不变。" : "删除后该 Key 将无法继续调用，且不可恢复。"}</DialogDescription>
          </DialogHeader>
          {action?.kind === "models" && <><input aria-label="搜索可访问模型" className="key-dialog-input" placeholder="搜索模型名称" value={scopeQuery} onChange={e => setScopeQuery(e.target.value)} /><div className="key-model-list">{(action.key.models === null ? editModels.map(([model]) => model) : action.key.models).filter(model => model.toLowerCase().includes(scopeQuery.toLowerCase())).map(model => <div key={model}>{model}</div>)}{!(action.key.models === null ? editModels.map(([model]) => model) : action.key.models).some(model => model.toLowerCase().includes(scopeQuery.toLowerCase())) && <div>没有匹配的模型</div>}</div><small>{action.key.models === null ? "可访问当前已授权的全部模型。" : `共 ${action.key.models.length} 个模型`}</small></>}
          {action?.kind === "ip" && <label className="key-ip-field">IPv4 地址 / CIDR 网段<textarea aria-label="IP 白名单" rows={5} value={ipList} onChange={e => { setIpList(e.target.value); setFormError(""); }} placeholder={"例如：10.0.1.100\n192.168.1.0/24"}/><small>多个地址用逗号或换行分隔，重复项自动合并。</small>{formError && <span role="alert" className="key-error">{formError}</span>}</label>}
          <DialogFooter><Button variant="outline" onClick={() => setAction(null)}>{action?.kind === "models" ? "关闭" : "取消"}</Button>{action?.kind !== "models" && <Button variant={action?.kind === "delete" ? "destructive" : "default"} disabled={saving} onClick={async () => {
            const target = action.key.id;
            if (action.kind === "ip") { let ips; try { ips = parseIpAllowlist(ipList); } catch (error) { setFormError(error.message); return; } if(!await setKeys(keys.map(key => key.id === target ? { ...key, ips } : key)))return; setCopied("IP 白名单已保存"); }
            else if (action.kind === "reset") {
              const secret = 'sk-' + crypto.randomUUID().replaceAll('-', '');
              if(!await setKeys(keys.map(key => key.id === target ? { ...key, key:secret,credentialVersion:(key.credentialVersion || 1)+1 } : key)))return;
              revealSecret(secret);
            }
            else { if(!await setKeys(keys.filter(key => key.id !== target)))return; setCopied("API Key 已删除"); }
            setAction(null);
          }}>{action?.kind === "ip" ? "保存" : action?.kind === "reset" ? "确认重置" : "确认删除"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reveal)} onOpenChange={open => { if (!open) setReveal(null); }}>
        {reveal && <DialogContent><DialogHeader><DialogTitle>保存 API Key</DialogTitle>
          <DialogDescription>密钥明文仅展示一次，请保存后关闭。</DialogDescription></DialogHeader>
          <code className="break-all" aria-label="API Key 明文">{reveal}</code>
          {secretFeedback && <p role="status">{secretFeedback}</p>}
          <DialogFooter><Button variant="outline" onClick={async () => {
            try { await navigator.clipboard.writeText(reveal); setSecretFeedback('API Key 已复制'); }
            catch { setSecretFeedback('复制失败，请选中密钥后手动复制'); }
          }}>复制 API Key</Button><Button onClick={() => setReveal(null)}>完成</Button></DialogFooter>
        </DialogContent>}
      </Dialog>
      <FilterPagination total={filteredKeys.length} page={currentPage} size={size} onPageChange={setPage} onSizeChange={setSize}/>
      {panel && (
        <div className="drawer-backdrop" onClick={() => setPanel(null)}>
          <aside
            className={`api-key-drawer ${panel.kind === "edit" ? "edit-drawer" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{panel.kind === "edit" ? "编辑" : "创建"} API Key</h2>
              <button aria-label="关闭" onClick={() => setPanel(null)}>
                ×
              </button>
            </header>
            <div className="drawer-form">
              <div className="token-plan-drawer-context">所属项目<strong>{project.name}</strong></div>
              {subscription && <div className="token-plan-drawer-context">所属 Token Plan<strong>{subscription.name}</strong><small>订阅编号：{subscription.id}</small></div>}
              {!editModels.length && onModels && <div className="token-plan-drawer-context">当前项目尚未开通模型<Button variant="link" onClick={onModels}>查看模型权限</Button></div>}
              <section className="edit-section">
                <h3>消费预算与有效期</h3>
                <label><span>{subscription ? '套餐抵扣预算（Token）' : '累计消费预算（人民币）'}</span><input inputMode={subscription ? 'numeric' : 'decimal'} value={budgetAmount}
                  placeholder="留空表示不限" onChange={event => setBudgetAmount(event.target.value)} /></label>
                <label><span>有效期（北京时间）</span><input type="datetime-local" value={expiry}
                  onChange={event => setExpiry(event.target.value)} /></label>
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
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="请输入 Key 名称"
                        />
                        <small>
                          长度为3–24个字符，支持中文、英文、数字、下划线和中划线字符
                        </small>
                      </div>
                    </label>
                    <label>
                      <span>描述</span>
                      <textarea
                        maxLength="200"
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
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
                                <input value="00:00:00" readOnly />
                                <b>至</b>
                                <input value="每月30/31日 23:59:00" readOnly />
                                <small>自动续配</small>
                                <button
                                  className="switch"
                                  aria-label="自动续配"
                                >
                                  <i />
                                </button>
                              </div>
                            ) : (
                              <input value="00:00:00 ~ 23:59:59" readOnly />
                            )}
                          </label>
                        )}
                        <label>
                          <span>额度上限</span>
                          <div className="quota-input">
                            <input
                              value={quota}
                              placeholder="请输入限额"
                              onChange={(e) =>
                                setQuota(e.target.value.replace(/\D/g, ""))
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
                            <button
                              className={`switch ${tpmEnabled ? "on" : ""}`}
                              onClick={() => setTpmEnabled(!tpmEnabled)}
                            >
                              <i />
                            </button>
                            <small>
                              当实时TPM达到设定阈值时，将触发限流策略
                            </small>
                            <input
                              disabled={!tpmEnabled}
                              aria-label="TPM 上限" value={tpmLimit} onChange={e=>setTpmLimit(e.target.value)}
                            />
                          </div>
                        </label>
                        <label>
                          <span>QPM 限制</span>
                          <div className="rate-limit">
                            <button
                              className={`switch ${qpmEnabled ? "on" : ""}`}
                              onClick={() => setQpmEnabled(!qpmEnabled)}
                            >
                              <i />
                            </button>
                            <small>
                              当实时QPM达到设定阈值时，将触发限流策略
                            </small>
                            <input aria-label="QPM 上限" disabled={!qpmEnabled} value={qpmLimit} onChange={e=>setQpmLimit(e.target.value)} />
                          </div>
                        </label>
                      </>
                    )}
                  </section>}
                  <section className="edit-section"><h3>IP 白名单</h3><label><span>允许的来源</span><div><textarea aria-label="编辑 IP 白名单" value={ipList} onChange={e => setIpList(e.target.value)} placeholder="IPv4 或 CIDR 网段，用逗号或换行分隔；留空不限制"/></div></label></section>
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
                            <input placeholder="按规格名称搜索" />
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
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="请输入 Key 名称"
                    />
                  </label>
                  <label>
                    <span>说明（选填）</span>
                    <textarea
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="用于区分 Key 的用法"
                    />
                  </label>
                  <label>
                    <span>IP 白名单（选填）</span>
                    <textarea
                      value={ipList}
                      onChange={(e) => setIpList(e.target.value)}
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
                        <input disabled value="00:00:00 ~ 23:59:59" readOnly />
                      </label>
                      <label>
                        <span>额度上限</span>
                        <div className="quota-input">
                          <input
                            value={quota}
                            onChange={(e) =>
                              setQuota(e.target.value.replace(/\D/g, ""))
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
            {formError && <p role="alert" className="key-error">{formError}</p>}
            <footer>
              <span>
                已选范围　<small>{modelScope === "全选" ? "全部模型和服务" : `${selectedModels.length} 个模型`}</small>
              </span>
              <div>
                <button onClick={() => setPanel(null)}>取消</button>
                <button
                  className="primary"
                  disabled={saving || name.trim().length < 2}
                  onClick={save}
                >
                  确定
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

