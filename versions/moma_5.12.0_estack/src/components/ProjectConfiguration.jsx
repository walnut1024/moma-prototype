import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { PROJECT_ADMIN, PROJECT_MEMBER } from '../project-access.mjs';
import { departmentPath } from '../organization-data.mjs';

export const projectTime = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false }) : '—';
export const projectMoney = value => value == null ? '—' : value.toLocaleString('zh-CN', {
  style:'currency', currency:'CNY', maximumFractionDigits:6,
});
const budgetValue = value => value == null ? '' : String(value / 1_000_000);
const projectRoleOptions = [PROJECT_MEMBER, PROJECT_ADMIN];
const saveOptions = tenant => ({ expectedRevision:tenant.revision, identityKey:tenant.identity.key });

export function ProjectFields({ value, setValue, tenant }) {
  const change = (key, field) => setValue({ ...value, [key]:field });
  return <>
    <label>项目名称<Input disabled={tenant.identity.spaceId === 'personal'} required maxLength={60} value={value.name} onChange={event => change('name', event.target.value)} /></label>
    {tenant.identity.spaceId !== 'personal' && <label>主责部门
      <select value={value.departmentId} onChange={event => change('departmentId', event.target.value)}>
        <option value="">暂不设置</option>
        {tenant.organization.departments.filter(row => row.status !== '停用').map(row => <option key={row.id} value={row.id}>{departmentPath(tenant.organization.departments, row.id)}</option>)}
        {value.departmentId && !tenant.organization.departments.some(row => row.id === value.departmentId && row.status !== '停用') &&
          <option value={value.departmentId}>原部门已不可用</option>}
      </select>
    </label>}
    <label>项目描述<textarea maxLength={200} rows={3} value={value.description} onChange={event => change('description', event.target.value)} /></label>
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
  return <section className="project-panel" aria-label="项目成员">
    {project.canEdit && eligible.length > 0 && <form className="project-controls" onSubmit={event => { event.preventDefault(); save(choice, role); }}>
      <select aria-label="选择企业成员" value={choice} onChange={event => setChoice(event.target.value)}>
        <option value="">选择企业成员</option>
        {eligible.map(row => <option key={row.id} value={row.id}>{row.name}{row.departmentId ? ' · ' + departmentPath(tenant.organization.departments, row.departmentId === tenant.organization.rootId ? 'root' : row.departmentId) : ''}</option>)}
      </select>
      <select aria-label="新增成员角色" value={role} onChange={event => setRole(event.target.value)}>{projectRoleOptions.map(value => <option key={value}>{value}</option>)}</select>
      <Button type="submit" disabled={saving || !eligible.some(row => row.id === choice)}>添加成员</Button>
    </form>}
    {feedback && !removing && <p className={feedback.error ? 'project-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    <div className="project-table-scroll" tabIndex={0} aria-label="项目成员表">
      <table><thead><tr><th scope="col">成员</th><th scope="col">所属部门</th><th scope="col">项目角色</th>{project.canEdit && <th scope="col">操作</th>}</tr></thead>
        <tbody>{members.filter(row => row.role).map(row => <tr key={row.id}>
          <td>{row.name}{row.self && '（本人）'}</td><td>{row.departmentId ? departmentPath(tenant.organization.departments, row.departmentId === tenant.organization.rootId ? 'root' : row.departmentId) : '—'}</td>
          <td>{project.canEdit ? <select aria-label={row.name + ' 的项目角色'} value={row.role} disabled={saving} onChange={event => save(row.id, event.target.value)}>
            {projectRoleOptions.map(value => <option key={value}>{value}</option>)}
          </select> : row.role}</td>
          {project.canEdit && <td><Button variant="link" onClick={() => { setFeedback(null); setRemoving({ ...row, options:saveOptions(tenant) }); }}>移除</Button></td>}
        </tr>)}</tbody>
      </table>
    </div>
    {!members.some(row => row.role) && <p className="project-empty">暂无项目成员</p>}
    <Dialog open={Boolean(removing)} onOpenChange={open => { if (!open) setRemoving(null); }}>
      {removing && <DialogContent><DialogHeader><DialogTitle>移除项目成员</DialogTitle>
        <DialogDescription>{removing.name}的项目成员权限将被撤销。企业成员关系继续有效。</DialogDescription></DialogHeader>
        {feedback?.error && <p className="project-error" role="alert">{feedback.text}</p>}
        <DialogFooter><Button variant="outline" onClick={() => setRemoving(null)}>取消</Button>
          <Button variant="destructive" disabled={saving} onClick={() => save(removing.id, null, removing.options)}>确认移除</Button></DialogFooter>
      </DialogContent>}
    </Dialog>
  </section>;
}

export function ProjectModels({ tenant, project, onExperience }) {
  const available = new Map();
  for (const service of tenant.projectServices) {
    if (!available.get(service.modelKey)?.callable) available.set(service.modelKey,service);
  }
  const personal = tenant.identity.spaceId === 'personal';
  const saved = personal ? [...new Set([...available.keys(), ...(project.modelPermissions || []).map(row => row.modelId)])].map(modelId => project.modelPermissions?.find(row => row.modelId === modelId) || { modelId, rpm:null, tpm:null }) : project.modelPermissions ?? [...available.keys()].map(modelId => ({ modelId, rpm:null, tpm:null }));
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
  return <form className="project-panel" aria-label="模型权限" onSubmit={submit}>
    {project.canEdit && <div className="project-controls">
      <Button type="submit" disabled={!draft || saving}>保存模型权限</Button>
      {draft && <Button type="button" variant="outline" disabled={saving} onClick={() => { setDraft(null); setFeedback(null); }}>放弃修改</Button>}
    </div>}
    {feedback && <p className={feedback.error ? 'project-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    {ids.length ? <div className="project-table-scroll" tabIndex={0} aria-label="项目模型表">
      <table><thead><tr>{['模型', '项目权限', 'RPM', 'TPM', '操作'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{ids.map(id => {
          const row = permissions.find(item => item.modelId === id);
          const live = available.get(id);
          if (!project.canEdit && !row) return null;
          const name = live?.name || tenant.models.find(model => model.id === id)?.name || id;
          const editable = project.canEdit && row && live;
          const inService = Boolean(live && (personal || saved.some(item => item.modelId === id)));
          return <tr key={id}><td>{name}{live && <small>{live.modelId}</small>}</td>
            <td>{project.canEdit ? <label className="project-check"><input aria-label={'开通 ' + name} type="checkbox" checked={Boolean(row)}
              disabled={personal || saving || !live && !row} onChange={event => update(id, event.target.checked ? { rpm:null, tpm:null } : null)} />{!live ? '空间已收回授权' : personal ? '随订购生效' : row ? '已开通' : '未开通'}</label> : live ? '已开通' : '空间已收回授权'}</td>
            {['rpm', 'tpm'].map(key => <td key={key}>{editable && (key === 'rpm' || ['text','multimodal','embedding','rerank'].includes(live.type))
              ? <Input className="project-limit" aria-label={name + ' ' + key.toUpperCase()} type="number" min="1" step="1" placeholder="不限" disabled={saving}
                value={row[key] ?? ''} onChange={event => update(id, { ...row, [key]:event.target.value })} />
              : row?.[key] ?? (row ? '不限' : '—')}</td>)}
            <td>{project.status === '正常' && inService && live.callable ? <Button type="button" variant="link" onClick={() => onExperience(live)}>在线体验</Button> : '—'}</td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <p className="project-empty">当前空间暂无可开通的模型</p>}
    {ids.length > 0 && !project.canEdit && !permissions.length && <p className="project-empty">暂无已开通模型</p>}
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
  return <>
    <section className="project-panel" aria-label="项目设置">
      {draft ? <form className="project-form project-settings-form" onSubmit={event => { event.preventDefault(); save('settings', draft.values, draft.options); }}>
        <ProjectFields tenant={tenant} value={draft.values} setValue={values => setDraft({ ...draft, values })} />
        <div className="project-fields">
          <label>累计消费预算（人民币）<Input inputMode="decimal" value={draft.values.amount} placeholder="留空表示不限"
            onChange={event => setDraft({ ...draft, values:{ ...draft.values, amount:event.target.value } })} /></label>
          <label>预算预警阈值（%）<Input type="number" min="1" max="100" value={draft.values.warnAt} disabled={!draft.values.amount}
            onChange={event => setDraft({ ...draft, values:{ ...draft.values, warnAt:event.target.value } })} /></label>
        </div>
        <label className="project-check"><input type="checkbox" checked={draft.values.stop} disabled={!draft.values.amount}
          onChange={event => setDraft({ ...draft, values:{ ...draft.values, stop:event.target.checked } })} />达到预算上限时停止按量调用</label>
        <label className="project-check"><input type="checkbox" checked={draft.values.retainContent}
          onChange={event => setDraft({ ...draft, values:{ ...draft.values, retainContent:event.target.checked } })} />记录新请求的输入输出</label>
        {draft.values.retainContent && <p className="project-muted">输入输出仅向项目管理员展示。</p>}
        <div className="project-controls"><Button type="submit" disabled={saving}>保存项目设置</Button>
          <Button type="button" variant="outline" onClick={() => { setDraft(null); setFeedback(null); }}>取消</Button></div>
      </form> : <>
        <dl className="project-facts">
          <div><dt>累计消费预算</dt><dd>{config.amount ? projectMoney(Number(config.amount)) : '不限'}</dd></div>
          <div><dt>预算处理</dt><dd>{config.amount ? `${config.warnAt}% 预警 · ${config.stop ? '超限停服' : '仅预警'}` : '—'}</dd></div>
          <div><dt>调用日志</dt><dd>{config.retainContent ? '记录输入输出及元数据' : '仅记录元数据'}</dd></div>
        </dl>
        <div className="project-controls project-lifecycle">
          {editable && <>
            <Button variant="outline" onClick={() => { setFeedback(null); setDraft({ values:config, options:saveOptions(tenant) }); }}>{personal ? '编辑使用设置' : '编辑项目设置'}</Button>
            {!personal && <Button variant="outline" onClick={() => project.status === '正常'
              ? open('停用项目','status',{ status:'停用' },'停用后该项目的 API Key 和在线体验将停止接受新调用。')
              : open('启用项目','status',{ status:'正常' },'项目将恢复接收通过权限与额度校验的调用。')}>{project.status === '正常' ? '停用项目' : '启用项目'}</Button>}
            {!personal && <Button variant="destructive" onClick={() => open('删除项目','status',{ status:'已删除' },'项目将停止调用，历史用量和审计保留。此操作不可撤销。')}>删除项目</Button>}
          </>}
          {!personal && self && project.status !== '已删除' && <Button variant="outline" onClick={() => open('退出项目','exit',{},'退出后将失去本项目的成员权限。企业空间和历史调用保留。')}>退出项目</Button>}
        </div>
      </>}
      {feedback && !action && <p className={feedback.error ? 'project-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </section>
    {project.canManage && <section className="project-panel" aria-label="项目操作记录" id="project-audit">
      <h2>项目操作记录</h2>
      {audits.length ? <div className="project-table-scroll" tabIndex={0} aria-label="项目操作记录表"><table>
        <thead><tr>{['时间','操作人','操作','对象 ID','结果'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{audits.slice(0, 30).map(row => <tr key={row.id}><td>{projectTime(row.createdAt)}</td><td>{row.actor}</td><td>{row.action}</td><td>{row.objectId}</td><td>{row.result}</td></tr>)}</tbody>
      </table></div> : <p className="project-empty">暂无项目操作记录</p>}
    </section>}
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open) setAction(null); }}>
      {action && <DialogContent><DialogHeader><DialogTitle>{action.label}</DialogTitle><DialogDescription>{action.detail}</DialogDescription></DialogHeader>
        {feedback?.error && <p className="project-error" role="alert">{feedback.text}</p>}
        <DialogFooter><Button variant="outline" onClick={() => setAction(null)}>取消</Button>
          <Button disabled={saving} variant={action.input.status === '已删除' ? 'destructive' : 'default'} onClick={() => save(action.type, action.input, action.options)}>确认{action.label}</Button></DialogFooter>
      </DialogContent>}
    </Dialog>
  </>;
}
