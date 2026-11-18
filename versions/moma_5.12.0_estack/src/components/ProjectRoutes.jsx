import { projectModelEnabled } from '../project-access.mjs';
import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { saveProjectRoute } from '../tenant-data.mjs';

const empty = { projects: [], routes: [], keys: [] };
const fields = [['apikey', 'API Key'], ['metadata._user', '用户标签（metadata._user）']];
const moveUp = (items, index) => items.toSpliced(index - 1, 2, items[index], items[index - 1]);

function RouteSelect({ label, options, value, onChange, disabled, placeholder = '请选择' }) {
  return <select className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
    aria-label={label} disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">{placeholder}</option>
    {value && !options.some(([id]) => id === value) && <option value={value} disabled>当前选项不可用</option>}
    {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select>;
}

export default function ProjectRoutes({ tenant, projectId }) {
  const {projects, routes, keys} = tenant.projectRouting ?? empty;
  const [apiRoute, setApiRoute] = useState(null);
  const [filter, setFilter] = useState(projectId || '');
  const [draft, setDraft] = useState(null);
  const [revision, setRevision] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const editable = projects.filter(project => project.canEdit && (!projectId || project.id === projectId));
  const editingProject=tenant.projects.find(row=>row.id===draft?.projectId);
  const serviceOptions = (tenant.projectServices || []).filter(service => editingProject && projectModelEnabled(editingProject,service.modelKey))
    .map(service => [service.id, service.name + ' · ' + service.callId]);
  const keyOptions = keys.filter(key => key.projectId === draft?.projectId).map(key => [key.id, key.name]);
  const projectName = id => projects.find(project => project.id === id)?.name;
  const open = (route, remove = false) => {
    setDraft(route ? structuredClone(route) : {
      projectId: editable.find(project => project.id === filter)?.id ?? editable[0]?.id ?? '',
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
  const dismiss = () => { if (dirty) setConfirmDiscard(true); else close(); };
  const update = patch => { setDraft(previous => ({...previous,...patch})); setError(''); };
  const patchRule = (index, patch) => update({rules:draft.rules.map((rule,i) => i===index ? {...rule,...patch} : rule)});
  const submit = event => {
    event.preventDefault();
    try { saveProjectRoute(draft, {expectedRevision:revision, remove:removing}); close(); }
    catch (cause) { setError(cause.message); }
  };
  const visible = routes.filter(route => projectId ? route.projectId === projectId : !filter || route.projectId === filter);
  const mainServices = draft ? [draft.defaultService,...draft.rules.map(rule=>rule.service)] : [];
  return <section className="route-list" aria-label="项目分流">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button disabled={!editable.length} onClick={() => open(null)}>新建项目分流</Button>
      {!projectId && <RouteSelect label="筛选项目" placeholder="全部项目" options={projects.map(project=>[project.id,project.name])} value={filter} onChange={setFilter}/>}
    </div>
    {tenant.error && <p role="status" className="mt-3 text-muted-foreground">{tenant.error}</p>}
    <div className="route-table">
      <table className="w-full min-w-[660px] text-left text-sm">
        <thead className="route-table-head"><tr>{['策略名称','所属项目','策略标识','匹配规则','备用模型','操作'].map(label=><th key={label} scope="col" className="px-3">{label}</th>)}</tr></thead>
        <tbody>{visible.map(route => {
          const project = projects.find(item=>item.id===route.projectId);
          return <tr key={route.id} className="border-b">
            <td className="px-3">{route.name}</td><td className="px-3">{project?.name}</td>
            <td className="px-3"><code>{route.code}</code></td>
            <td className="px-3">{route.rules.length} 条</td><td className="px-3">{route.fallback.length} 个</td>
            <td className="whitespace-nowrap px-3">
              <Button variant="ghost" size="sm" onClick={()=>setApiRoute(route)}>API 调用</Button>
              {project?.canEdit && <>
                <Button variant="ghost" size="sm" onClick={()=>open(route)}>编辑</Button>
                <Button variant="ghost" size="sm" onClick={()=>open(route,true)}>删除</Button>
              </>}
            </td>
          </tr>;
        })}</tbody>
      </table>
      {!visible.length && <p className="route-no-data">{projects.length ? '暂无项目分流' : '暂无可访问的项目'}</p>}
    </div>
    <Dialog open={Boolean(draft)} onOpenChange={open=>{if (!open) dismiss();}}>
      {draft && <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{confirmDiscard ? '放弃未保存的修改' : removing ? '删除项目分流' : draft.id ? '编辑项目分流' : '新建项目分流'}</DialogTitle>
          <DialogDescription>{confirmDiscard ? '关闭后，本次修改将丢失。' : removing ? `确认删除「${draft.name}」？` : '按规则顺序匹配，未命中时调用默认模型服务。'}</DialogDescription>
        </DialogHeader>
        {confirmDiscard ? <DialogFooter>
          <Button variant="outline" onClick={()=>setConfirmDiscard(false)}>继续编辑</Button><Button variant="destructive" onClick={close}>放弃修改</Button>
        </DialogFooter> : <form className="space-y-4" onSubmit={submit}>
          {!removing && <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">所属项目
                {draft.id ? <span>{projectName(draft.projectId)}</span> : <RouteSelect label="所属项目" options={editable.map(project=>[project.id,project.name])}
                  value={draft.projectId} onChange={projectId=>update({projectId,rules:draft.rules.map(rule=>rule.field==='apikey' ? {...rule,value:''} : rule)})}/>}
              </label>
              <label className="grid gap-1 text-sm">策略名称<Input required maxLength={50} value={draft.name} onChange={event=>update({name:event.target.value})}/></label>
              <label className="grid gap-1 text-sm">策略标识<Input required readOnly={Boolean(draft.id)} maxLength={50} value={draft.code} onChange={event=>update({code:event.target.value})}/></label>
              <label className="grid gap-1 text-sm">默认模型服务<RouteSelect label="默认模型服务" options={serviceOptions} value={draft.defaultService} onChange={defaultService=>update({defaultService})}/></label>
            </div>
            {!serviceOptions.length && <p role="status" className="text-sm text-muted-foreground">当前账号暂无可调用的模型服务。</p>}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">匹配规则</legend>
              {draft.rules.map((rule,index)=><div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <RouteSelect label={`规则 ${index+1} 条件`} options={fields} value={rule.field} onChange={field=>patchRule(index,{field,value:''})}/>
                {rule.field === 'apikey'
                  ? <RouteSelect label={`规则 ${index+1} API Key`} options={keyOptions} value={rule.value} onChange={value=>patchRule(index,{value})}/>
                  : <Input aria-label={`规则 ${index+1} 用户标签`} placeholder="用户标签" maxLength={128} required value={rule.value} onChange={event=>patchRule(index,{value:event.target.value})}/>}
                <RouteSelect label={`规则 ${index+1} 目标模型服务`} options={serviceOptions} value={rule.service} onChange={service=>patchRule(index,{service})}/>
                <div>
                  <Button type="button" variant="ghost" size="sm" disabled={index===0} aria-label={`上移规则 ${index+1}`} onClick={()=>update({rules:moveUp(draft.rules,index)})}>上移</Button>
                  <Button type="button" variant="ghost" size="sm" aria-label={`移除规则 ${index+1}`} onClick={()=>update({rules:draft.rules.toSpliced(index,1)})}>移除</Button>
                </div>
              </div>)}
              <Button type="button" variant="outline" size="sm" disabled={draft.rules.length>=20} onClick={()=>update({rules:[...draft.rules,{field:'apikey',value:'',service:''}]})}>添加规则</Button>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">备用模型服务（按顺序尝试）</legend>
              {draft.fallback.map((id,index)=><div key={id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{index+1}. {serviceOptions.find(([serviceId])=>serviceId===id)?.[1] ?? '当前模型服务不可用'}</span>
                <Button type="button" variant="ghost" size="sm" disabled={index===0} aria-label={`上移备用模型 ${index+1}`} onClick={()=>update({fallback:moveUp(draft.fallback,index)})}>上移</Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`移除备用模型 ${index+1}`} onClick={()=>update({fallback:draft.fallback.toSpliced(index,1)})}>移除</Button>
              </div>)}
              <RouteSelect label="添加备用模型服务" placeholder="添加备用模型服务" value="" disabled={draft.fallback.length>=5}
                options={serviceOptions.filter(([id])=>!mainServices.includes(id) && !draft.fallback.includes(id))}
                onChange={id=>{if(id)update({fallback:[...draft.fallback,id]});}}/>
            </fieldset>
          </>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismiss}>取消</Button>
            <Button type="submit" variant={removing ? 'destructive' : 'default'} disabled={!editable.some(project=>project.id===draft.projectId)}>{removing ? '确认删除' : '保存'}</Button>
          </DialogFooter>
        </form>}
      </DialogContent>}
    </Dialog>
    <Dialog open={Boolean(apiRoute)} onOpenChange={open => { if (!open) setApiRoute(null); }}>
      <DialogContent><DialogHeader><DialogTitle>项目分流 API 调用</DialogTitle>
        <DialogDescription>使用当前项目的有效 API Key 调用平台接口。</DialogDescription></DialogHeader>
        <code>project@{apiRoute?.code}</code>
        <pre className="whitespace-pre-wrap">{JSON.stringify({model:'project@' + (apiRoute?.code || ''),messages:[{role:'user',content:'你好'}]}, null, 2)}</pre>
        <DialogFooter><Button onClick={() => setApiRoute(null)}>关闭</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
