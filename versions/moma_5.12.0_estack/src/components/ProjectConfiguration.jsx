import { useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Table, TextArea } from '@douyinfe/semi-ui';
import { PROJECT_ADMIN, PROJECT_MEMBER } from '../project-access.mjs';
import { departmentPath } from '../organization-data.mjs';

export const projectTime = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false }) : '—';
export const projectMoney = value => value == null ? '—' : value.toLocaleString('zh-CN', {
  style:'currency', currency:'CNY', maximumFractionDigits:6,
});
const budgetValue = value => value == null ? '' : String(value / 1_000_000);
const projectRoleOptions = [PROJECT_MEMBER, PROJECT_ADMIN].map(value => ({ value,label:value }));
const saveOptions = tenant => ({ expectedRevision:tenant.revision, identityKey:tenant.identity.key });

export function ProjectFields({ value, setValue, tenant }) {
  const change = (key, field) => setValue({ ...value, [key]:field });
  const departments = tenant.organization.departments.filter(row => row.status !== '停用');
  return <>
    <label>项目名称<Input aria-label="项目名称" required maxLength={60} readonly={tenant.identity.spaceId === 'personal'} value={value.name} onChange={name => change('name',name)} /></label>
    {tenant.identity.spaceId !== 'personal' && <label>主责部门
      <Select aria-label="主责部门" value={value.departmentId} onChange={id => change('departmentId',id)}
        optionList={[{value:'',label:'暂不设置'}, ...departments.map(row => ({ value:row.id,label:departmentPath(tenant.organization.departments,row.id) })),
          ...(value.departmentId && !departments.some(row => row.id === value.departmentId) ? [{value:value.departmentId,label:'原部门已不可用'}] : [])]} />
    </label>}
    <label>项目描述<TextArea aria-label="项目描述" maxLength={200} rows={3} value={value.description} onChange={description => change('description',description)} /></label>
  </>;
}

export function ProjectMembers({ tenant, project }) {
  const members = tenant.projectMembers[project.id] || [];
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
  const columns = [
    { title:'成员', render:(_, row) => row.name + (row.self ? '（本人）' : '') },
    { title:'所属部门', render:(_, row) => row.departmentId
      ? departmentPath(tenant.organization.departments, row.departmentId === tenant.organization.rootId ? 'root' : row.departmentId) : '—' },
    { title:'项目角色', render:(_, row) => project.canEdit
      ? <Select aria-label={row.name + ' 的项目角色'} value={row.role} disabled={saving}
          onChange={value => save(row.id,value)} optionList={projectRoleOptions} /> : row.role },
    ...(project.canEdit ? [{ title:'操作', render:(_, row) => <Button theme="borderless" onClick={() => {
      setFeedback(null);
      setRemoving({ ...row, options:saveOptions(tenant) });
    }}>移除</Button> }] : []),
  ];
  return <section className="project-panel" aria-label="项目成员">
    {project.canEdit && eligible.length > 0 && <form className="project-controls" onSubmit={event => { event.preventDefault(); save(choice, role); }}>
      <Select aria-label="选择企业成员" placeholder="选择企业成员" value={choice || undefined} onChange={setChoice} filter
        optionList={eligible.map(row => ({ value:row.id, label:row.name + (row.departmentId ? ' · ' + departmentPath(tenant.organization.departments, row.departmentId === tenant.organization.rootId ? 'root' : row.departmentId) : '') }))} />
      <Select aria-label="新增成员角色" value={role} onChange={setRole} optionList={projectRoleOptions} />
      <Button htmlType="submit" theme="solid" disabled={saving || !eligible.some(row => row.id === choice)}>添加成员</Button>
    </form>}
    {feedback && !removing && <p className={feedback.error ? 'project-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    <Table columns={columns} dataSource={members.filter(row => row.role)} rowKey="id" pagination={false} size="small"
      scroll={{x:500}} empty="暂无项目成员" />
    <Modal visible={Boolean(removing)} title="移除项目成员" maskClosable={false} closable={!saving} closeOnEsc={!saving}
      onCancel={() => setRemoving(null)} onOk={() => save(removing.id,null,removing.options)}
      okText="确认移除" okButtonProps={{type:'danger'}} confirmLoading={saving}>
      {removing && <p>{removing.name}的项目成员权限将被撤销。企业成员关系继续有效。</p>}
      {feedback?.error && <p className="project-error" role="alert">{feedback.text}</p>}
    </Modal>
  </section>;
}

export function ProjectModels({ tenant, project, onExperience }) {
  const personal = tenant.identity.spaceId === 'personal';
  const available = new Map();
  for (const service of tenant.projectServices) {
    if (personal && !service.callable) continue;
    if (!available.get(service.modelKey)?.callable) available.set(service.modelKey,service);
  }
  const saved = personal ? [...new Set([...available.keys(), ...(project.modelPermissions || []).map(row => row.modelId)])]
    .map(modelId => project.modelPermissions?.find(row => row.modelId === modelId) || {modelId,rpm:null,tpm:null})
    : project.modelPermissions ?? [...available.keys()].map(modelId => ({ modelId, rpm:null, tpm:null }));
  const [draft, setDraft] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
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
    { title:'操作', render:(_, {id,service}) => project.status === '正常' && service?.callable && saved.some(item => item.modelId === id)
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

export function ProjectSettings({ tenant, project, onList }) {
  const [draft, setDraft] = useState(null);
  const [action, setAction] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const personal = tenant.identity.spaceId === 'personal';
  const editable = project.canManage && project.status !== '已删除';
  const self = tenant.projectMembers[project.id]?.find(row => row.self && row.role);
  const config = {
    name:project.name, description:project.description || '',
    departmentId:project.organizationId && project.organizationId === tenant.organization.rootId ? 'root' : project.organizationId || '',
    amount:budgetValue(project.spendBudget?.amountMicros), warnAt:project.spendBudget?.warnAt ?? 80,
    stop:project.spendBudget?.stop === true, retainContent:project.retainContent === true,
  };
  const open = (label, type, input, detail) => {
    setFeedback(null);
    setAction({ label, type, input, detail, options:saveOptions(tenant) });
  };
  async function save(type, input, options) {
    if (saving) return;
    setSaving(true);
    try {
      await tenant.updateProject(project.id, type, input, options);
      setDraft(null);
      setAction(null);
      setFeedback({ text:'项目配置已更新' });
      if (type === 'exit' || input.status === '已删除') onList();
    } catch (error) { setFeedback({ error:true, text:error.message }); }
    finally { setSaving(false); }
  }
  const audits = tenant.projectAudits.filter(row => row.projectId === project.id);
  const auditColumns = [
    {title:'时间',dataIndex:'createdAt',render:projectTime},
    {title:'操作人',dataIndex:'actor'},
    {title:'操作',dataIndex:'action'},
    {title:'对象 ID',dataIndex:'objectId'},
    {title:'结果',dataIndex:'result'},
  ];
  return <>
    <section className="project-panel" aria-label="项目设置">
      {draft ? <form className="project-form project-settings-form" onSubmit={event => { event.preventDefault(); save('settings', draft.values, draft.options); }}>
        <ProjectFields tenant={tenant} value={draft.values} setValue={values => setDraft({ ...draft, values })} />
        <div className="project-fields">
          <label>累计消费预算（人民币）<Input inputMode="decimal" value={draft.values.amount} placeholder="留空表示不限"
            onChange={amount => setDraft({ ...draft, values:{ ...draft.values, amount } })} /></label>
          <label>预算预警阈值（%）<Input type="number" min="1" max="100" value={draft.values.warnAt} disabled={!draft.values.amount}
            onChange={warnAt => setDraft({ ...draft, values:{ ...draft.values, warnAt } })} /></label>
        </div>
        <Checkbox checked={draft.values.stop} disabled={!draft.values.amount}
          onChange={event => setDraft({ ...draft, values:{ ...draft.values, stop:event.target.checked } })} >达到预算上限时停止按量调用</Checkbox>
        <Checkbox checked={draft.values.retainContent}
          onChange={event => setDraft({ ...draft, values:{ ...draft.values, retainContent:event.target.checked } })} >记录新请求的输入输出</Checkbox>
        {draft.values.retainContent && <p className="project-muted">输入输出仅向项目管理员展示。</p>}
        <div className="project-controls"><Button htmlType="submit" theme="solid" disabled={saving}>保存项目设置</Button>
          <Button onClick={() => { setDraft(null); setFeedback(null); }}>取消</Button></div>
      </form> : <>
        <dl className="project-facts">
          <div><dt>累计消费预算</dt><dd>{config.amount ? projectMoney(Number(config.amount)) : '不限'}</dd></div>
          <div><dt>预算处理</dt><dd>{config.amount ? `${config.warnAt}% 预警 · ${config.stop ? '超限停服' : '仅预警'}` : '—'}</dd></div>
          <div><dt>调用日志</dt><dd>{config.retainContent ? '记录输入输出及元数据' : '仅记录元数据'}</dd></div>
        </dl>
        <div className="project-controls project-lifecycle">
          {editable && <>
            <Button onClick={() => { setFeedback(null); setDraft({ values:config, options:saveOptions(tenant) }); }}>编辑项目设置</Button>
            {!personal && <><Button onClick={() => project.status === '正常'
              ? open('停用项目','status',{ status:'停用' },'停用后该项目的 API Key 和在线体验将停止接受新调用。')
              : open('启用项目','status',{ status:'正常' },'项目将恢复接收通过权限与额度校验的调用。')}>{project.status === '正常' ? '停用项目' : '启用项目'}</Button>
            <Button type="danger" theme="solid" onClick={() => open('删除项目','status',{ status:'已删除' },'项目将停止调用，历史用量和审计保留。此操作不可撤销。')}>删除项目</Button></>}
          </>}
          {!personal && self && project.status !== '已删除' && <Button onClick={() => open('退出项目','exit',{},'退出后将失去本项目的成员权限。企业空间和历史调用保留。')}>退出项目</Button>}
        </div>
      </>}
      {feedback && !action && <p className={feedback.error ? 'project-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </section>
    {project.canManage && <section className="project-panel" aria-label="项目操作记录" id="project-audit">
      <h2>项目操作记录</h2>
      <Table columns={auditColumns} dataSource={audits.slice(0,30)} rowKey="id" pagination={false} size="small"
        scroll={{x:500}} empty="暂无项目操作记录" />
    </section>}
    <Modal visible={Boolean(action)} title={action?.label} maskClosable={false} closable={!saving} closeOnEsc={!saving}
      onCancel={() => setAction(null)} onOk={() => save(action.type,action.input,action.options)}
      okText={'确认' + (action?.label || '')} okButtonProps={{type:action?.input.status === '已删除' ? 'danger' : 'primary'}} confirmLoading={saving}>
      {action && <p>{action.detail}</p>}
      {feedback?.error && <p className="project-error" role="alert">{feedback.text}</p>}
    </Modal>
  </>;
}
