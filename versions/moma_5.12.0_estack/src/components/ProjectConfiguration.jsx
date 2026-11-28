import { use, useContext, useEffect, useState } from 'react';
import {
  Button as FrontButton, Checkbox as FrontCheckbox, Input as FrontInput, Modal as FrontModal,
  Select as FrontSelect, Table as FrontTable, TextArea as FrontTextArea,
} from '@douyinfe/semi-ui';
import { AdminUIContext } from './admin-ui-context';
import { PROJECT_ADMIN, PROJECT_MEMBER, projectRoleLabel, projectServiceEnabled } from '../project-access.mjs';
import { departmentPath } from '../organization-data.mjs';
import { millionTokens, PROJECT_BUDGET_PERIODS } from '../project-token-budget.mjs';

const frontControls = {
  Button: FrontButton, Checkbox: FrontCheckbox, Input: FrontInput, Modal: FrontModal,
  Select: FrontSelect, Table: FrontTable, TextArea: FrontTextArea,
};
let adminControls;

function useProjectControls() {
  if (!useContext(AdminUIContext)) return frontControls;
  // Resolve the kit before mounting the panel so opening an editor does not suspend its form.
  adminControls ??= import('../admin-v2/xa24/HaloUI.jsx');
  return use(adminControls);
}

export const projectTime = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false }) : '—';
export const projectMoney = value => value == null ? '—' : value.toLocaleString('zh-CN', {
  style:'currency', currency:'CNY', maximumFractionDigits:6,
});
const budgetValue = value => value == null ? '' : String(value / 1_000_000);
const projectRoleOptions = [PROJECT_MEMBER, PROJECT_ADMIN].map(value => ({ value,label:projectRoleLabel(value) }));
const saveOptions = tenant => ({ expectedRevision:tenant.revision, identityKey:tenant.identity.key });
const budgetPeriods = Object.entries(PROJECT_BUDGET_PERIODS).map(([value, label]) => ({ value, label }));

export function ProjectFields({ value, setValue, tenant }) {
  const { Input, TextArea } = useProjectControls();
  const change = (key, field) => setValue({ ...value, [key]:field });
  return <>
    <label>项目名称<Input aria-label="项目名称" required maxLength={60} readonly={tenant.identity.spaceId === 'personal'} value={value.name} onChange={name => change('name',name)} /></label>
    <label>项目描述<TextArea aria-label="项目描述" maxLength={200} rows={3} value={value.description} onChange={description => change('description',description)} /></label>
  </>;
}

export function ProjectCreateDialog({ tenant, onClose, onCreated }) {
  const { Button, Modal, Select } = useProjectControls();
  const [draft,setDraft] = useState({name:'',description:''});
  const [options] = useState(()=>saveOptions(tenant));
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const administrators = tenant.systemAdministrator ? tenant.organization.members.filter(row=>row.status==='已加入') : [];

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    let created;
    try {
      created = await tenant.createProject({name:draft.name,description:draft.description,
        ...(tenant.systemAdministrator && {administratorId:draft.administratorId})},options);
    } catch (issue) { setError(issue.message); }
    finally { setSaving(false); }
    if (created) onCreated(created);
  }

  return <Modal visible title="新建项目" footer={null} maskClosable={false} closeOnEsc={!saving}
    closable={!saving} onCancel={onClose} className="project-modal">
    <p className="project-muted">{tenant.systemAdministrator ? '所属租户' : '所属空间'} · {tenant.identity.tenantName}</p>
    <form className="project-form" onSubmit={submit} onInvalid={event=>{setError('请填写项目名称');event.target.focus();}}>
      {tenant.systemAdministrator && <label>项目管理员
        <Select aria-label="项目管理员" value={draft.administratorId} onChange={administratorId=>setDraft({...draft,administratorId})}
          optionList={administrators.map(row=>({value:row.id,label:row.name+' · '+row.account}))} />
      </label>}
      <ProjectFields tenant={tenant} value={draft} setValue={setDraft}/>
      {error && <p role="alert">{error}</p>}
      <div className="project-dialog-actions">
        <Button disabled={saving} onClick={onClose}>取消</Button>
        <Button htmlType="submit" theme="solid" loading={saving}>创建</Button>
      </div>
    </form>
  </Modal>;
}

export function ProjectMembers({ tenant, project, adminMembers }) {
  const { Button, Modal, Select, Table } = useProjectControls();
  const members = tenant.projectMembers[project.id] || [];
  const canManage = project.canManage && project.status !== '已删除';
  const [choice, setChoice] = useState('');
  const [role, setRole] = useState(PROJECT_MEMBER);
  const [removing, setRemoving] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async (memberId, next, options = saveOptions(tenant)) => {
    if (saving) return;
    setSaving(true);
    try {
      await tenant.updateProject(project.id, 'members', { memberId, role:next }, options);
      setFeedback({ text:'成员已更新' });
      setChoice('');
      setRemoving(null);
    } catch (error) { setFeedback({ error:true, text:error.message }); }
    finally { setSaving(false); }
  };
  const eligible = members.filter(row => !row.role);
  const statuses = new Map(adminMembers?.map(row=>[row.id,row]));
  const columns = [
    { title:'成员', render:(_, row) => <span id={'project-member-' + row.id}>{row.name}{row.self ? '（本人）' : ''}</span> },
    { title:'所属部门', render:(_, row) => row.departmentId
      ? departmentPath(tenant.organization.departments, row.departmentId === tenant.organization.rootId ? 'root' : row.departmentId) : '—' },
    { title:<span id="project-member-role">项目角色</span>, dataIndex:'role', render:(value, row) => canManage && !row.inactive
      ? <Select size="small" aria-labelledby={'project-member-' + row.id + ' project-member-role'} value={value}
        optionList={projectRoleOptions} disabled={saving} onChange={value => save(row.id, value)} />
      : projectRoleLabel(value) },
    ...(adminMembers ? [
      { title:'企业成员状态', render:(_,row)=>statuses.get(row.id)?.memberStatus ?? '已启用' },
      { title:'登录身份状态', render:(_,row)=>statuses.get(row.id)?.loginStatus ?? '已启用' },
    ] : []),
    ...(canManage ? [{ title:'操作', render:(_, row) => row.inactive ? '—' : <Button theme="borderless" disabled={saving} onClick={() => {
      setFeedback(null);
      setRemoving({ ...row, options:saveOptions(tenant) });
    }}>移除</Button> }] : []),
  ];
  return <section className="project-panel" aria-label="项目成员">
    {canManage && eligible.length > 0 && <form className="project-controls" onSubmit={event => {
      event.preventDefault();
      if (eligible.some(row => row.id === choice)) save(choice, role);
    }}>
      <Select aria-label="选择企业成员" placeholder="选择企业成员" value={choice || undefined} onChange={setChoice} filter disabled={saving}
        optionList={eligible.map(row => ({ value:row.id, label:row.name + (row.departmentId ? ' · ' + departmentPath(tenant.organization.departments, row.departmentId === tenant.organization.rootId ? 'root' : row.departmentId) : '') }))} />
      <Select aria-label="新增成员角色" value={role} onChange={setRole} optionList={projectRoleOptions} disabled={saving} />
      <Button htmlType="submit" theme="solid" disabled={saving || !eligible.some(row => row.id === choice)}>添加成员</Button>
    </form>}
    {feedback && !removing && <p className={feedback.error ? 'project-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    <Table columns={columns} dataSource={[
      ...members.filter(row=>row.role),
      ...(adminMembers || []).filter(row=>row.inactive && !members.some(member=>member.id===row.id)),
    ]} rowKey="id" pagination={false} size="small"
      scroll={{x:500}} empty="暂无项目成员" />
    <Modal visible={Boolean(removing)} title="移除项目成员" maskClosable={false} closable={!saving} closeOnEsc={!saving}
      onCancel={() => setRemoving(null)} onOk={() => save(removing.id,null,removing.options)}
      okText="确认移除" okButtonProps={{type:'danger'}} confirmLoading={saving}>
      {removing && <p>{removing.name}的项目成员权限将被撤销。企业成员关系继续有效。</p>}
      {feedback?.error && <p className="project-error" role="alert">{feedback.text}</p>}
    </Modal>
  </section>;
}

export function ProjectModels({ tenant, project, onExperience, dirtyRef }) {
  const { Button, Checkbox, Input, Table } = useProjectControls();
  const personal = tenant.identity.spaceId === 'personal';
  const available = new Map();
  for (const service of tenant.projectServices) {
    if (personal && !service.callable) continue;
    if (!available.get(service.modelKey)?.callable) available.set(service.modelKey,service);
  }
  const saved = personal ? [...new Set([...available.keys(), ...(project.modelPermissions || []).map(row => row.modelId)])]
    .map(modelId => project.modelPermissions?.find(row => row.modelId === modelId) || {modelId,rpm:null,tpm:null})
    : project.modelPermissions ?? [...available.values()].filter(service => projectServiceEnabled(project,service))
      .map(({modelKey:modelId}) => ({ modelId, rpm:null, tpm:null }));
  const [draft, setDraft] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const dirty = Boolean(draft);
  useEffect(()=>{
    if (!dirtyRef || !dirty) return;
    dirtyRef.current=true;
    return ()=>{dirtyRef.current=false;};
  },[dirtyRef,dirty]);
  const permissions = draft?.permissions ?? saved;
  const ids = [...new Set([...available.keys(), ...saved.map(row => row.modelId)])];
  const update = (modelId, permission) => {
    const updated = permissions.filter(row => row.modelId !== modelId);
    if (permission) updated.push({ modelId, ...permission });
    setDraft({ options:draft?.options ?? saveOptions(tenant), permissions:updated });
    setFeedback(null);
  };
  const submit = async event => {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    try {
      await tenant.updateProject(project.id, 'models', permissions.map(row => ({
        ...row, rpm:row.rpm === '' || row.rpm == null ? null : Number(row.rpm),
        tpm:row.tpm === '' || row.tpm == null ? null : Number(row.tpm),
      })), draft.options);
      setDraft(null);
      setFeedback({ text:'模型权限已保存' });
    } catch (error) { setFeedback({ error:true, text:error.message }); }
    finally { setSaving(false); }
  };
  const models = ids.map(id => {
    const permission = permissions.find(item => item.modelId === id);
    const service = available.get(id);
    return { id,permission,service,name:service?.name || tenant.models.find(model => model.id === id)?.name || id };
  }).filter(row => project.canEdit || row.permission);
  const columns = [
    { title:'模型', render:(_,row) => <>{row.name}{row.service && <small>{row.service.modelId}</small>}</> },
    { title:'项目权限', render:(_, {id,name,permission,service}) => {
      const label = !service ? '空间订购或授权不可用' : permission ? service.callable ? '已开通' : '待空间订购' : '未开通';
      return !personal && project.canEdit ? <Checkbox aria-label={'开通 ' + name} checked={Boolean(permission)}
        disabled={saving || !service && !permission} onChange={event => update(id,event.target.checked ? {rpm:null,tpm:null} : null)}>{label}</Checkbox> : label;
    } },
    ...['rpm','tpm'].map(key => ({
      title:key.toUpperCase(), render:(_, {id,name,permission,service}) =>
        project.canEdit && permission && service && (key === 'rpm' || ['text','multimodal','embedding','rerank'].includes(service.type))
          ? <Input className="project-limit" aria-label={name + ' ' + key.toUpperCase()} type="number" min="1" step="1" placeholder="不限"
              disabled={saving} value={permission[key] ?? ''} onChange={value => update(id,{...permission,[key]:value})} />
          : permission?.[key] ?? (permission ? '不限' : '—'),
    })),
    { title:'操作', render:(_, {id,service}) => onExperience && project.status === '正常' && service?.callable &&
      (!(service.internal && service.independentService) || service.tasks?.length) && saved.some(item => item.modelId === id)
      ? <Button theme="borderless" onClick={() => onExperience(service)}>在线体验</Button> : '—' },
  ];
  return <form className="project-panel" aria-label="模型权限" onSubmit={submit}>
    {personal && <p className="project-muted">模型范围随个人空间的订购和授权生效。</p>}
    {project.canEdit && <div className="project-controls">
      <Button htmlType="submit" theme="solid" disabled={!draft || saving}>{personal ? '保存模型限流' : '保存模型权限'}</Button>
      {draft && <Button disabled={saving} onClick={() => { setDraft(null); setFeedback(null); }}>放弃修改</Button>}
    </div>}
    {feedback && <p className={feedback.error ? 'project-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    <Table columns={columns} dataSource={models} rowKey="id" pagination={false} size="small" scroll={{x:580}}
      empty={ids.length ? '暂无已开通模型' : '当前空间暂无可开通的模型'} />
  </form>;
}

export const projectLifecycle = {
  exit:{label:'退出项目',type:'exit',input:{},detail:'退出后失去本项目的成员权限，企业成员关系和历史调用保留。'},
  start:{label:'启用项目',type:'status',input:{status:'正常'},detail:'项目将恢复接收通过权限与额度校验的调用。'},
  delete:{label:'删除项目',type:'status',input:{status:'已删除'},detail:'项目将停止调用，历史用量和审计保留。此操作不可撤销。'},
};

export function ProjectLifecycleDialog({ tenant, project, intent, onClose, onDone }) {
  const { Modal } = useProjectControls();
  const [options] = useState(() => saveOptions(tenant));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const action = projectLifecycle[intent];
  const canExit = project.canManage && tenant.projectMembers[project.id]?.some(row=>row.self && row.role);
  if (!action || tenant.identity.spaceId==='personal' || project.status==='已删除' ||
    !(intent==='exit' ? canExit : tenant.canCreateProject)) return null;
  async function confirm() {
    if (saving) return;
    setSaving(true);
    try {
      await tenant.updateProject(project.id,action.type,action.input,options);
      onDone();
    } catch(issue) { setError(issue.message); }
    finally { setSaving(false); }
  }
  return <Modal visible title={action.label} maskClosable={false} closable={!saving} closeOnEsc={!saving}
    onCancel={onClose} onOk={confirm} confirmLoading={saving} okText={'确认'+action.label}
    okButtonProps={{type:intent==='delete' ? 'danger' : 'primary'}} cancelButtonProps={{disabled:saving}}>
    <p>「{project.name}」 · {action.detail}</p>
    {error && <p className="project-error" role="alert">{error}</p>}
  </Modal>;
}

export function ProjectTokenBudget({ tenant, project }) {
  const { Button, Input, Modal, Select } = useProjectControls();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const budget = project.tokenBudget;
  const used = tenant.projectBudgets[project.id]?.tokens;
  const period = budget?.period ?? 'total';
  const canSetBudget = project.canManage && project.status !== '已删除';
  const fields = [
    ['Token 预算', budget?.limit ? millionTokens(budget.limit) + ' 百万 Tokens' : '不限'],
    ['预算周期', PROJECT_BUDGET_PERIODS[period]],
    ...(budget?.limit && used != null ? [['本周期已用', millionTokens(used) + ' 百万 Tokens']] : []),
    ['TPM', budget?.tpm ? budget.tpm.toLocaleString('zh-CN') + ' Tokens/分钟' : '不限'],
    ['RPM', budget?.rpm ? budget.rpm.toLocaleString('zh-CN') + ' 次/分钟' : '不限'],
    ['每日批处理 Token 限额', budget?.dailyBatchLimit ? millionTokens(budget.dailyBatchLimit) + ' 百万 Tokens' : '不限'],
  ];
  function edit() {
    setError('');
    setSaved(false);
    setDraft({
      options:saveOptions(tenant),
      values:{ limit:millionTokens(budget?.limit), period, tpm:String(budget?.tpm ?? ''),
        rpm:String(budget?.rpm ?? ''), dailyBatchLimit:millionTokens(budget?.dailyBatchLimit) },
    });
  }
  function change(key, value) {
    setDraft(previous => ({ ...previous, values:{ ...previous.values, [key]:value } }));
  }
  async function save(event) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    try {
      await tenant.updateProject(project.id, 'tokenBudget', draft.values, draft.options);
      setDraft(null);
      setSaved(true);
    } catch (issue) { setError(issue.message); }
    finally { setSaving(false); }
  }
  function limitInput(key, label, inputMode, placeholder = '不限') {
    return <label>{label}
      <Input aria-label={label} inputMode={inputMode} placeholder={placeholder} value={draft.values[key]}
        disabled={saving} onChange={value => change(key, value)} />
    </label>;
  }
  return <section className="project-panel" aria-label="项目预算">
    <div className="project-controls project-panel-heading">
      <h2>项目预算</h2>
      {canSetBudget && <Button theme="solid" onClick={edit}>设置额度</Button>}
    </div>
    <dl className="project-facts">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {saved && <p role="status">项目额度已保存</p>}
    <Modal visible={Boolean(draft)} title="设置额度" width={452} footer={null} className="project-modal"
      maskClosable={false} closable={!saving} closeOnEsc={!saving} onCancel={() => setDraft(null)}>
      {draft && <form className="project-form project-budget-form" onSubmit={save}>
        <label>当前项目<Input aria-label="当前项目名称" readonly value={project.name} /></label>
        <section aria-labelledby="project-budget-limit">
          <h3 id="project-budget-limit">预算</h3>
          <div className="project-budget-fields">
            {limitInput('limit', '预算（百万 Tokens）', 'decimal', '如 10，留空不限')}
            <label><span id="project-budget-period-label">预算周期</span>
              <Select aria-labelledby="project-budget-period-label" value={draft.values.period} optionList={budgetPeriods} disabled={saving}
                onChange={value => change('period', value)} />
            </label>
          </div>
        </section>
        <section aria-labelledby="project-budget-rate">
          <h3 id="project-budget-rate">速率限制</h3>
          <div className="project-budget-fields">
            {limitInput('tpm', 'TPM（Tokens/分钟）', 'numeric')}
            {limitInput('rpm', 'RPM（次/分钟）', 'numeric')}
            <div className="project-budget-batch">
              {limitInput('dailyBatchLimit', '每日批处理 Token 限额（百万 Tokens）', 'decimal')}
              <p className="project-muted">批处理接入后生效</p>
            </div>
          </div>
        </section>
        {error && <p className="project-error" role="alert">{error}</p>}
        <div className="project-dialog-actions">
          <Button disabled={saving} onClick={() => setDraft(null)}>取消</Button>
          <Button htmlType="submit" theme="solid" loading={saving}>确认</Button>
        </div>
      </form>}
    </Modal>
  </section>;
}

export function ProjectSettings({ tenant, project, mode = 'personal', showAudit = true }) {
  const { Button, Checkbox, Input, Modal, Table } = useProjectControls();
  const editable = project.canManage && project.status !== '已删除';
  const editingDetails = mode === 'details';
  const fields = mode === 'personal' || editingDetails;
  const budget = mode === 'personal';
  const logs = mode === 'personal' || mode === 'logs';
  const title = {details:'项目信息',logs:'日志留存',personal:'项目设置'}[mode];
  const config = {
    name:project.name, description:project.description || '',
    amount:budgetValue(project.spendBudget?.amountMicros), warnAt:project.spendBudget?.warnAt ?? 80,
    stop:project.spendBudget?.stop === true, retainContent:project.retainContent === true,
  };
  const [draft, setDraft] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await tenant.updateProject(project.id,'settings',draft.values,draft.options);
      setDraft(null);
      if (!editingDetails) setFeedback({ text:'项目配置已更新' });
    } catch (error) { setFeedback({ error:true, text:error.message }); }
    finally { setSaving(false); }
  }
  function cancel() {
    if (saving) return;
    setDraft(null);
    setFeedback(null);
  }
  function edit() {
    setFeedback(null);
    setDraft({ values:config, options:saveOptions(tenant) });
  }
  const audits = tenant.projectAudits.filter(row => row.projectId === project.id);
  const auditColumns = [
    {title:'时间',dataIndex:'createdAt',render:projectTime},
    {title:'操作人',dataIndex:'actor'},
    {title:'操作',dataIndex:'action'},
    {title:'对象 ID',dataIndex:'objectId'},
    {title:'结果',dataIndex:'result'},
  ];
  const message = feedback && <p className={feedback.error ? 'project-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>;
  const form = draft && <form className="project-form project-settings-form" onSubmit={event => { event.preventDefault(); save(); }}>
        {fields && <ProjectFields tenant={tenant} value={draft.values} setValue={values => setDraft({ ...draft, values })} />}
        {budget && <><div className="project-fields">
          <label>累计消费预算（人民币）<Input inputMode="decimal" value={draft.values.amount} placeholder="留空表示不限"
            onChange={amount => setDraft({ ...draft, values:{ ...draft.values, amount } })} /></label>
          <label>预算预警阈值（%）<Input type="number" min="1" max="100" value={draft.values.warnAt} disabled={!draft.values.amount}
            onChange={warnAt => setDraft({ ...draft, values:{ ...draft.values, warnAt } })} /></label>
        </div>
        <Checkbox checked={draft.values.stop} disabled={!draft.values.amount}
          onChange={event => setDraft({ ...draft, values:{ ...draft.values, stop:event.target.checked } })} >达到预算上限时停止按量调用</Checkbox></>}
        {logs && <><Checkbox checked={draft.values.retainContent}
          onChange={event => setDraft({ ...draft, values:{ ...draft.values, retainContent:event.target.checked } })} >记录新请求的输入输出</Checkbox>
        {draft.values.retainContent && <p className="project-muted">输入输出仅向项目管理员展示。</p>}</>}
        <div className="project-controls"><Button htmlType="submit" theme="solid" disabled={saving}>保存{title}</Button>
          <Button disabled={saving} onClick={cancel}>取消</Button></div>
      </form>;
  if (editingDetails) return <>
    <Button theme="outline" onClick={edit}>编辑项目</Button>
    <Modal visible={Boolean(draft)} title="编辑项目" footer={null} maskClosable={false}
      closable={!saving} closeOnEsc={!saving} onCancel={cancel} className="project-modal">
      {form}
      {message}
    </Modal>
  </>;
  return <>
    {mode !== 'audit' && <section className="project-panel" aria-label={title}>
      {form || <>
        <dl className="project-facts">
          {budget && <>
            <div><dt>累计消费预算</dt><dd>{config.amount ? projectMoney(Number(config.amount)) : '不限'}</dd></div>
            <div><dt>预算处理</dt><dd>{config.amount ? `${config.warnAt}% 预警 · ${config.stop ? '超限停服' : '仅预警'}` : '—'}</dd></div>
          </>}
          {logs && <div><dt>调用日志</dt><dd>{config.retainContent ? '记录输入输出及元数据' : '仅记录元数据'}</dd></div>}
        </dl>
        {editable && <div className="project-controls project-lifecycle">
            <Button onClick={edit}>编辑{title}</Button>
        </div>}
      </>}
      {message}
    </section>}
    {showAudit && project.canManage && (mode === 'personal' || mode === 'audit') && <section className="project-panel" aria-label="项目操作记录">
      <h2>项目操作记录</h2>
      <Table columns={auditColumns} dataSource={audits.slice(0,30)} rowKey="id" pagination={false} size="small"
        scroll={{x:500}} empty="暂无项目操作记录" />
    </section>}
  </>;
}
