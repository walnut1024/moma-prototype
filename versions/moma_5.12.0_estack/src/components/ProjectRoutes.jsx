import { projectModelEnabled } from '../project-access.mjs';
import { useState } from 'react';
import { Button, Input, Modal, Select, Table } from '@douyinfe/semi-ui';

const empty = { projects: [], routes: [], keys: [] };
const fields = [['apikey', 'API Key'], ['metadata._user', '用户标签（metadata._user）']];
const moveUp = (items, index) => items.toSpliced(index - 1, 2, items[index], items[index - 1]);

function RouteSelect({ label, options, value, onChange, disabled, placeholder = '请选择' }) {
  return <Select className="project-route-select" aria-label={label} disabled={disabled} value={value || undefined}
    onChange={onChange} placeholder={placeholder} filter
    optionList={[...options.map(([id,name]) => ({value:id,label:name})),
      ...(value && !options.some(([id]) => id === value) ? [{value,label:'当前选项不可用',disabled:true}] : [])]} />;
}

export default function ProjectRoutes({ tenant, projectId, openApi }) {
  const {projects, routes, keys} = tenant.projectRouting ?? empty;
  const [draft, setDraft] = useState(null);
  const [revision, setRevision] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const selected = projects.find(project => project.id === projectId);
  const editingProject = tenant.projects.find(row=>row.id===draft?.projectId);
  const serviceOptions = (tenant.projectServices || []).filter(service => service.projectServiceId && editingProject && projectModelEnabled(editingProject,service.modelKey))
    .map(service => [service.projectServiceId, service.name + ' · ' + service.callId]);
  const keyOptions = keys.filter(key => key.projectId === draft?.projectId).map(key => [key.id, key.name]);
  const projectName = id => projects.find(project => project.id === id)?.name;
  const open = (route, remove = false) => {
    setDraft(route ? structuredClone(route) : {
      projectId,
      name:'', code:'', defaultService:'', rules:[], fallback:[],
    });
    setRevision(tenant.revision);
    setRemoving(remove);
    setError('');
  };
  const close = () => { setDraft(null); setError(''); setConfirmDiscard(false); };
  const current = routes.find(route => route.id === draft?.id);
  const dirty = draft && !removing && (current ? JSON.stringify(draft) !== JSON.stringify(current) :
    Boolean(draft.name || draft.code || draft.defaultService || draft.rules.length || draft.fallback.length));
  const dismiss = () => { if (saving) return; if (dirty) setConfirmDiscard(true); else close(); };
  const update = patch => { setDraft(previous => ({...previous,...patch})); setError(''); };
  const patchRule = (index, patch) => update({rules:draft.rules.map((rule,i) => i===index ? {...rule,...patch} : rule)});
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try { await tenant.command('projectRoute', {route:draft, remove:removing}, revision); close(); }
    catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const visible = routes.filter(route => route.projectId === projectId);
  const editable = projects.filter(project => project.canEdit);
  const mainServices = draft ? [draft.defaultService,...draft.rules.map(rule=>rule.service)] : [];
  const columns = [
    { title:'策略名称', dataIndex:'name' },
    { title:'所属项目', dataIndex:'projectId', render:projectName },
    { title:'策略标识', dataIndex:'code', render:code => <code>{code}</code> },
    { title:'匹配规则', dataIndex:'rules', render:rules => rules.length + ' 条' },
    { title:'备用模型', dataIndex:'fallback', render:fallback => fallback.length + ' 个' },
    { title:'操作', width:210, render:(_,route) => <div className="sr-row">
      <Button theme="borderless" size="small" onClick={() => openApi(route)}>API 调用</Button>
      {editable.some(project => project.id === route.projectId) && <>
        <Button theme="borderless" size="small" onClick={() => open(route)}>编辑</Button>
        <Button theme="borderless" type="danger" size="small" onClick={() => open(route,true)}>删除</Button>
      </>}
    </div> },
  ];
  return <section className="route-list" aria-label="项目分流">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button theme="solid" disabled={!selected?.canEdit} onClick={() => open(null)}>新建项目分流</Button>
      {selected && <span>当前项目 · {selected.name}</span>}
    </div>
    {tenant.error && <p role="status" className="mt-3 text-muted-foreground">{tenant.error}</p>}
    <Table className="project-route-table" columns={columns} dataSource={visible} rowKey="id" pagination={false} size="small"
      scroll={{x:660}} empty={selected ? '暂无项目分流' : '请先选择项目'} />
    <Modal visible={Boolean(draft)} footer={null} width={760} className="project-modal" maskClosable={false}
      title={confirmDiscard ? '放弃未保存的修改' : removing ? '删除项目分流' : draft?.id ? '编辑项目分流' : '新建项目分流'}
      closeOnEsc={!saving} closable={!saving} onCancel={confirmDiscard ? () => setConfirmDiscard(false) : dismiss}>
      {draft && <>
        <p className="project-muted">{confirmDiscard ? '关闭后，本次修改将丢失。' : removing ? '确认删除「' + draft.name + '」？' : '按规则顺序匹配，未命中时调用默认模型服务。'}</p>
        {confirmDiscard ? <div className="project-dialog-actions">
          <Button onClick={()=>setConfirmDiscard(false)}>继续编辑</Button><Button type="danger" theme="solid" onClick={close}>放弃修改</Button>
        </div> : <form className="space-y-4" onSubmit={submit}>
          {!removing && <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">所属项目
                <span>{projectName(draft.projectId)}</span>
              </label>
              <label className="grid gap-1 text-sm">策略名称<Input aria-label="策略名称" required maxLength={50} value={draft.name} onChange={name=>update({name})}/></label>
              <label className="grid gap-1 text-sm">策略标识<Input aria-label="策略标识" required readonly={Boolean(draft.id)} maxLength={50} value={draft.code} onChange={code=>update({code})}/></label>
              <label className="grid gap-1 text-sm">默认模型服务<RouteSelect label="默认模型服务" options={serviceOptions} value={draft.defaultService} onChange={defaultService=>update({defaultService})}/></label>
            </div>
            {!serviceOptions.length && <p role="status" className="text-sm text-muted-foreground">当前账号暂无可调用的模型服务。</p>}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">匹配规则</legend>
              {draft.rules.map((rule,index)=><div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <RouteSelect label={`规则 ${index+1} 条件`} options={fields} value={rule.field} onChange={field=>patchRule(index,{field,value:''})}/>
                {rule.field === 'apikey'
                  ? <RouteSelect label={`规则 ${index+1} API Key`} options={keyOptions} value={rule.value} onChange={value=>patchRule(index,{value})}/>
                  : <Input aria-label={`规则 ${index+1} 用户标签`} placeholder="用户标签" maxLength={128} required value={rule.value} onChange={value=>patchRule(index,{value})}/>}
                <RouteSelect label={`规则 ${index+1} 目标模型服务`} options={serviceOptions} value={rule.service} onChange={service=>patchRule(index,{service})}/>
                <div>
                  <Button theme="borderless" size="small" disabled={index===0} aria-label={`上移规则 ${index+1}`} onClick={()=>update({rules:moveUp(draft.rules,index)})}>上移</Button>
                  <Button theme="borderless" size="small" aria-label={`移除规则 ${index+1}`} onClick={()=>update({rules:draft.rules.toSpliced(index,1)})}>移除</Button>
                </div>
              </div>)}
              <Button size="small" disabled={draft.rules.length>=20} onClick={()=>update({rules:[...draft.rules,{field:'apikey',value:'',service:''}]})}>添加规则</Button>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">备用模型服务（按顺序尝试）</legend>
              {draft.fallback.map((id,index)=><div key={id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{index+1}. {serviceOptions.find(([serviceId])=>serviceId===id)?.[1] ?? '当前模型服务不可用'}</span>
                <Button theme="borderless" size="small" disabled={index===0} aria-label={`上移备用模型 ${index+1}`} onClick={()=>update({fallback:moveUp(draft.fallback,index)})}>上移</Button>
                <Button theme="borderless" size="small" aria-label={`移除备用模型 ${index+1}`} onClick={()=>update({fallback:draft.fallback.toSpliced(index,1)})}>移除</Button>
              </div>)}
              <RouteSelect label="添加备用模型服务" placeholder="添加备用模型服务" value="" disabled={draft.fallback.length>=5}
                options={serviceOptions.filter(([id])=>!mainServices.includes(id) && !draft.fallback.includes(id))}
                onChange={id=>{if(id)update({fallback:[...draft.fallback,id]});}}/>
            </fieldset>
          </>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="project-dialog-actions">
            <Button disabled={saving} onClick={dismiss}>取消</Button>
            <Button htmlType="submit" theme="solid" type={removing ? 'danger' : 'primary'} loading={saving}
              disabled={!editable.some(project=>project.id===draft.projectId)}>{removing ? '确认删除' : '保存'}</Button>
          </div>
        </form>}
      </>}
    </Modal>
  </section>;
}
