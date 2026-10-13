import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { maskApiKey } from '../api-key-utils.mjs';
import { CALCLOUD_TYPES, CALCLOUD_PERIODS, MATCH_MODES, emptyBinding, validateIcon } from './calcloud-domain.mjs';
import { PageHead, DataTable, Field, TextField, Choice, Check, Modal, Confirm, FormFooter, Refresh, time, useDraftGuard, ModelSwitch, PickValues } from './CalcloudUI';

import { RichStatement, cleanStatement } from './CalcloudRichText';
import TargetServices from './CalcloudTargets';

const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const flags = [['enabled','启用模型'],['smartRouting','智能路由'],['visible','现网用户可见'],['agent','支持Agent'],['mcp','支持MCP'],['upload','支持文件上传']];
const priceLabels = [['costInput','成本输入价格'],['costCached','成本缓存命中价格'],['costOutput','成本输出价格'],['saleInput','目录输入价格'],['saleCached','目录缓存命中价格'],['saleOutput','目录输出价格']];
const customLabels = [['context','上下文长度'],['step','上下文步长'],['input','输入长度'],['output','输出长度']];
const blankModel = providerId => ({id:id('base-model'),name:'',icon:'',tags:[],type:'text',series:'',parameters:'',subtype:'',description:'',protocol:'',precision:'',statement:'',updatedAt:new Date().toISOString(),examples:{},enabled:false,visible:false,smartRouting:false,agent:false,mcp:false,upload:false,bindings:[emptyBinding(providerId)]});
const rowActions = (edit, remove) => <div className="cc-actions"><Button variant="ghost" size="sm" onClick={edit}>编辑</Button><Button variant="ghost" size="sm" onClick={remove}>删除</Button></div>;

function ModelEditor({ record, config, save, close, dirty }) {
  const [form,setForm]=useState(()=>structuredClone(record)),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[customType,setCustomType]=useState(!Object.hasOwn(CALCLOUD_TYPES,record.type));
  const set=(key,value)=>{setForm(f=>({...f,[key]:value}));dirty(true);setError('');};
  const binding=(index,key,value)=>set('bindings',form.bindings.map((b,i)=>i===index?{...b,[key]:value}:b));
  const upload=async file=>{
    if(!file)return;setUploading(true);setError('');
    try {
      if(file.size>102400||!['image/png','image/jpeg'].includes(file.type))throw new Error('请选择100KB以内的PNG或JPEG图片');
      const bitmap=await createImageBitmap(file);try {validateIcon({size:file.size,type:file.type,width:bitmap.width,height:bitmap.height});} finally {bitmap.close();}
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片读取失败，请重新上传'));reader.readAsDataURL(file);});
      set('icon',data);
    } catch(e){setError(e.message);} finally {setUploading(false);}
  };
  return <form className="cc-form cc-editor" onSubmit={e=>{e.preventDefault();const result=save({...form,statement:cleanStatement(form.statement)});if(result!==true)setError(result);}}>
    <h2>基本信息</h2><div className="cc-form-grid">
      <Field label="模型名称" required><Input aria-label="模型名称" value={form.name} onChange={e=>set('name',e.target.value)} required maxLength={50}/><small>2–50个字母、数字及 _ . : -；大小写须与推理脚本一致。</small></Field>
      <Field label="模型图标" required><Input type="file" aria-label="上传模型图标" accept="image/png,image/jpeg" disabled={uploading} onChange={e=>upload(e.target.files[0])}/>{form.icon&&<img className="cc-icon-preview" src={form.icon} alt="模型图标"/>}<small>PNG / JPEG，100×100以内，最大100KB</small></Field>
      <Field label="模型标签" required><PickValues label="模型标签" values={form.tags} options={config.models.flatMap(m=>m.tags)} multiple creatable onChange={v=>set('tags',v)}/></Field>
      <Field label="模型类型" required><Choice label="模型类型" value={customType?'custom':form.type} options={[...Object.entries(CALCLOUD_TYPES),['custom','自定义类型']]} onChange={v=>{setCustomType(v==='custom');set('type',v==='custom'?'':v);}}/>{customType&&<Input aria-label="自定义模型类型" required value={form.type} onChange={e=>set('type',e.target.value)}/>}</Field>
      <Field label="模型系列" required><PickValues label="模型系列" values={form.series?[form.series]:[]} options={config.models.map(m=>m.series)} creatable onChange={v=>set('series',v[0]||'')}/></Field>
      <TextField label="参数量" value={form.parameters} onChange={v=>set('parameters',v)}/>
      <Field label="模型子类型"><PickValues label="模型子类型" values={form.subtype?[form.subtype]:[]} options={config.models.map(m=>m.subtype)} creatable onChange={v=>set('subtype',v[0]||'')}/></Field>
      <TextField label="模型精度" value={form.precision} onChange={v=>set('precision',v)} required/>
      <Field label="模型简介" required wide><Textarea aria-label="模型简介" required maxLength={1000} value={form.description} onChange={e=>set('description',e.target.value)} rows={3}/></Field>
      <TextField label="模型协议" value={form.protocol} onChange={v=>set('protocol',v)}/>
      <TextField label="模型更新时间" type="datetime-local" step="1" required onInput={e=>set('updatedAt',e.currentTarget.value?e.currentTarget.value+'+08:00':'')} value={form.updatedAt?new Date(Date.parse(form.updatedAt)+8*3600000).toISOString().slice(0,19):''} onChange={v=>set('updatedAt',v?v+'+08:00':'')}/>
      <Field label="功能开关" wide><div className="cc-flags">{flags.map(([key,label])=><Check key={key} label={label} value={form[key]} onChange={v=>set(key,v)}/>)}</div></Field>
      <Field label="模型使用声明" wide><RichStatement value={form.statement} onChange={v=>set('statement',v)}/></Field>
    </div>
    <h2>调用示例</h2><div className="cc-form-grid">{['API','Python','Java','Golang','Curl'].map(key=><Field key={key} label={`${key}示例`} wide><Textarea aria-label={`${key}示例`} value={form.examples[key]||''} onChange={e=>set('examples',{...form.examples,[key]:e.target.value})} rows={3}/></Field>)}</div>
    <h2>绑定模型服务商</h2><div>{form.bindings.map((b,index)=><div className="cc-binding" key={index}>
      <div className="cc-form-grid"><Field label="模型服务商" required><Choice label={`服务商${index+1}`} value={b.providerId} options={config.providers} onChange={v=>binding(index,'providerId',v)}/></Field><Field label="绑定操作"><Button type="button" variant="outline" disabled={form.bindings.length===1} onClick={()=>set('bindings',form.bindings.filter((_,i)=>i!==index))}><Trash2/>移除服务商</Button></Field>
      <Field label="输入格式" required><PickValues label={`输入格式${index+1}`} values={b.inputs} options={['TEXT','IMAGE','AUDIO','VIDEO']} multiple creatable onChange={v=>binding(index,'inputs',v)}/></Field>
      <Field label="输出格式" required><PickValues label={`输出格式${index+1}`} values={b.outputs} options={['TEXT','IMAGE','AUDIO','VIDEO']} multiple creatable onChange={v=>binding(index,'outputs',v)}/></Field>
      <Field label="模型特性" wide><div className="cc-flags">{['Function Call','结构化输出','联网搜索'].map(feature=><Check key={feature} label={feature} value={b.features.includes(feature)} onChange={v=>binding(index,'features',v?[...b.features,feature]:b.features.filter(f=>f!==feature))}/>)}</div></Field>
      <Check label="需要订购" value={b.needsSubscription} onChange={v=>binding(index,'needsSubscription',v)}/><Check label="预配置" value={b.preset} onChange={v=>binding(index,'preset',v)}/></div>
      <details><summary>自定义配置</summary><div className="cc-form-grid">{customLabels.map(([key,label])=><TextField key={key} label={label} type="number" min="1" step="1" value={b.custom[key]} onChange={v=>binding(index,'custom',{...b.custom,[key]:v})}/>)}<TextField label="函数调用类型" value={b.custom.functionType} onChange={v=>binding(index,'custom',{...b.custom,functionType:v})}/><div className="cc-flags"><Check label="启用在线体验" value={b.custom.online} onChange={v=>binding(index,'custom',{...b.custom,online:v})}/><Check label="启用API调用" value={b.custom.api} onChange={v=>binding(index,'custom',{...b.custom,api:v})}/></div></div></details>
      <details><summary>计费价格（元 / 百万 Tokens）</summary><div className="cc-form-grid">{priceLabels.map(([key,label])=><TextField key={key} label={label} type="number" min="0" step="any" value={b.prices[key]} onChange={v=>binding(index,'prices',{...b.prices,[key]:v})}/>)}</div></details>
    </div>)}</div><div><Button type="button" variant="outline" disabled={form.bindings.length>=10} onClick={()=>set('bindings',[...form.bindings,emptyBinding('')])}><Plus/>添加模型服务商</Button></div>
    <FormFooter error={error} close={close} saving={uploading}/>
  </form>;
}

export function BaseModelsPage({ config, run, params, blocked, reload }) {
  const [filters,setFilters]=useState({}),[applied,setApplied]=useState({}),[target,setTarget]=useState(null),[dirty,setDirty]=useState(false);
  const {proceed,guard}=useDraftGuard(dirty,()=>setDirty(false)), edit=params.get('edit');
  const record=edit==='new'?null:config.models.find(m=>m.id===edit);
  const go=value=>{location.hash=`/admin-2/base-models${value?`?edit=${encodeURIComponent(value)}`:''}`;};
  const close=()=>proceed(()=>{setDirty(false);go('');});
  const match=m=>Object.entries(applied).every(([key,value])=>{
    if(!value||Array.isArray(value)&&!value.length)return true;
    if(key==='name')return m.name.toLowerCase().includes(value.toLowerCase());
    if(key==='tags')return value.every(t=>m.tags.includes(t));
    if(Array.isArray(value))return value.includes(m[key]);
    return ['enabled','visible'].includes(key)?String(m[key])===value:m[key]===value;
  });
  const rows=config.models.filter(match);
  const filter=(key,value)=>setFilters(f=>({...f,[key]:value}));
  return <><PageHead title={edit?(edit==='new'?'新建基础模型':'编辑基础模型'):'基础模型管理'} note="维护基础模型信息、服务商绑定与调用配置。">{edit?<Button variant="outline" onClick={close}><ArrowLeft/>返回列表</Button>:<><Button disabled={blocked} onClick={()=>go('new')}><Plus/>新建模型</Button><Refresh onClick={reload}/></>}</PageHead>
    {edit?<section className="cc-surface">{edit!=='new'&&!record?<div className="cc-editor" role="alert">模型不存在，请返回列表。</div>:<ModelEditor key={edit} record={record||blankModel(config.providers[0]?.id||'')} config={config} dirty={setDirty} close={close} save={value=>{const result=run({collection:'models',operation:'save',record:value});if(result===true){setDirty(false);go('');}return result;}}/>}</section>:<section className="cc-surface"><form className="cc-toolbar" onSubmit={e=>{e.preventDefault();setApplied(filters);}}>
      <TextField label="模型名称" value={filters.name} onChange={v=>filter('name',v)}/><Field label="模型标签"><PickValues label="筛选模型标签" values={filters.tags||[]} options={config.models.flatMap(m=>m.tags)} multiple onChange={v=>filter('tags',v)}/></Field>
      <Field label="模型类型"><PickValues label="筛选模型类型" values={[...new Set((filters.type||[]).map(t=>CALCLOUD_TYPES[t]||t))]} options={[...new Set([...Object.values(CALCLOUD_TYPES),...config.models.map(m=>CALCLOUD_TYPES[m.type]||m.type)])]} multiple onChange={labels=>filter('type',[...new Set([...Object.keys(CALCLOUD_TYPES),...config.models.map(m=>m.type)])].filter(t=>labels.includes(CALCLOUD_TYPES[t]||t)))}/></Field>
      <Field label="模型系列"><PickValues label="筛选模型系列" values={filters.series||[]} options={config.models.map(m=>m.series)} multiple onChange={v=>filter('series',v)}/></Field>
      <Field label="模型子类型"><Choice label="模型子类型" value={filters.subtype} all options={[...new Set(config.models.map(m=>m.subtype).filter(Boolean))].map(v=>[v,v])} onChange={v=>filter('subtype',v)}/></Field>
      {['enabled','visible'].map(key=><Field key={key} label={key==='enabled'?'启用状态':'现网用户可见'}><Choice label={key==='enabled'?'启用状态':'可见状态'} value={filters[key]} all options={[['true','是'],['false','否']]} onChange={v=>filter(key,v)}/></Field>)}
      <Button type="submit">查询</Button><Button type="button" variant="outline" onClick={()=>{setFilters({});setApplied({});}}>重置</Button>
    </form><DataTable key={JSON.stringify(applied)} rows={rows} columns={[
      ['模型名称',m=><strong>{m.name}</strong>],['服务商名称',m=>m.bindings.map(b=>config.providers.find(p=>p.id===b.providerId)?.name||'—').join('、')||'—'],
      ['模型属性',m=><>{CALCLOUD_TYPES[m.type]||m.type}<small>{[m.series,m.parameters,m.subtype,...m.tags].filter(Boolean).join(' · ')||'—'}</small></>],['状态',m=><ModelSwitch label={`启用${m.name}`} value={m.enabled} disabled={blocked} onChange={enabled=>run({collection:'models',operation:'status',id:m.id,record:{enabled}})}/>],['现网可见',m=><ModelSwitch label={`现网可见${m.name}`} value={m.visible} disabled={blocked} onChange={visible=>run({collection:'models',operation:'visibility',id:m.id,record:{visible}})}/>],['更新时间',m=>time(m.updatedAt)],
      ['操作',m=><div className="cc-actions"><Button variant="ghost" size="sm" onClick={()=>toast.info('上下架配置暂不可用')}>上下架</Button><Button variant="ghost" size="sm" onClick={()=>go(m.id)}>编辑</Button><Button variant="ghost" size="sm" disabled={m.enabled||blocked} onClick={()=>setTarget({id:m.id,name:m.name})}>删除</Button></div>]
    ]}/></section>}
    <Confirm target={target} close={()=>setTarget(null)} run={()=>run({collection:'models',operation:'delete',id:target.id})===true}/>{guard}</>;
}

function ProviderForm({record,save,close,dirty}) {
  const [form,setForm]=useState(()=>structuredClone(record)),[error,setError]=useState(''),[showKey,setShowKey]=useState(false);
  const set=(key,value)=>{setForm(f=>({...f,[key]:value}));dirty(true);setError('');};
  return <form className="cc-form" onSubmit={e=>{e.preventDefault();const result=save(form);if(result!==true)setError(result);}}><div className="cc-form-grid">
    <Field label="服务商归属" required><Choice label="服务商归属" value={form.ownership} options={[['OpenAI/OpenAI兼容服务','OpenAI/OpenAI兼容服务']]} onChange={v=>set('ownership',v)}/></Field>
    <TextField label="英文名称" value={form.code} onChange={v=>set('code',v)} required/>
    <TextField label="中文名称" value={form.name} onChange={v=>set('name',v)} required/>
    <TextField label="API Base URL" value={form.baseUrl} onChange={v=>set('baseUrl',v)} required type="url"/>
    <Field label="API Key" required><div className="cc-secret"><Input aria-label="服务商API Key" value={form.credential} onChange={e=>set('credential',e.target.value)} required type={showKey?'text':'password'} autoComplete="new-password"/><Button type="button" variant="outline" size="sm" aria-label={showKey?'隐藏API Key':'显示API Key'} onClick={()=>setShowKey(v=>!v)}>{showKey?'隐藏':'显示'}</Button></div></Field>
    <Check label="外部服务商" value={form.external} onChange={v=>set('external',v)}/>
    <Field label="服务商描述" wide><Textarea aria-label="服务商描述" maxLength={500} value={form.description} onChange={e=>set('description',e.target.value)}/></Field>
  </div><FormFooter close={close} error={error}/></form>;
}
export function ModelProvidersPage({config,run,blocked,reload}) {
  const [editing,setEditing]=useState(null),[target,setTarget]=useState(null),[dirty,setDirty]=useState(false),{proceed,guard}=useDraftGuard(dirty,()=>setDirty(false));
  const close=()=>proceed(()=>{setDirty(false);setEditing(null);});
  return <><PageHead title="模型服务商管理" note="配置模型服务商连接信息。"><Button disabled={blocked} onClick={()=>setEditing({id:id('provider'),ownership:'OpenAI/OpenAI兼容服务',code:'',name:'',baseUrl:'',credential:'',description:'',external:false})}><Plus/>创建模型服务商</Button><Refresh onClick={reload}/></PageHead>
    <section className="cc-surface"><DataTable rows={config.providers} columns={[
      ['服务商归属',p=>p.ownership],['英文名称',p=>p.code],['中文名称',p=>p.name],['API Base URL',p=>p.baseUrl||'—'],['外部服务商',p=>p.external?'是':'否'],['操作',p=>rowActions(()=>setEditing(p),()=>setTarget(p))]
    ]}/></section><Modal drawer title="模型服务商配置" open={!!editing} close={close}>{editing&&<ProviderForm key={editing.id} record={editing} dirty={setDirty} close={close} save={value=>{const result=run({collection:'providers',operation:'save',record:value});if(result===true){setDirty(false);setEditing(null);}return result;}}/>}</Modal>
    <Confirm target={target} close={()=>setTarget(null)} run={()=>run({collection:'providers',operation:'delete',id:target.id})===true}/>{guard}</>;
}

function TrafficForm({record,state,save,close,dirty}) {
  const [form,setForm]=useState(()=>structuredClone(record)),[error,setError]=useState('');
  const set=(key,value)=>{setForm(f=>({...f,[key]:value,...(key==='projectId'?{keyId:''}:{})}));dirty(true);setError('');};
  return <form className="cc-form" onSubmit={e=>{e.preventDefault();const result=save(form);if(result!==true)setError(result);}}><div className="cc-form-grid">
    <Field label="项目空间" required><Choice label="项目空间" value={form.projectId} options={state.projects} onChange={v=>set('projectId',v)}/></Field>
    <Field label="API Key" required><Choice label="API Key" value={form.keyId} options={state.apiKeys.filter(k=>k.projectId===form.projectId).map(k=>[k.id,`${k.name} · ${k.keyId||k.id}`])} onChange={v=>set('keyId',v)} disabled={!form.projectId}/></Field>
    {['token','request','total'].map(prefix=><Field key={prefix} label={{token:'Token限流',request:'请求限流',total:'用户总Token限额'}[prefix]} wide><Check label={`启用${{token:'Token限流',request:'请求限流',total:'总Token限额'}[prefix]}`} value={form[prefix+'Enabled']} onChange={v=>set(prefix+'Enabled',v)}/>{form[prefix+'Enabled']&&<div className="cc-inline-row">{prefix!=='total'&&<Choice label={`${prefix==='token'?'Token':'请求'}限流周期`} value={form[prefix+'Period']} options={CALCLOUD_PERIODS.map(v=>[v,v])} onChange={v=>set(prefix+'Period',v)}/>}<TextField label={prefix==='request'?'请求次数上限':'Token上限'} type="number" min="1" step="1" value={form[prefix+'Limit']} onChange={v=>set(prefix+'Limit',v)} required/></div>}</Field>)}
  </div><FormFooter close={close} error={error}/></form>;
}
export function TrafficManagementPage({config,run,blocked,reload,state}) {
  const [editing,setEditing]=useState(null),[target,setTarget]=useState(null),[dirty,setDirty]=useState(false),{proceed,guard}=useDraftGuard(dirty,()=>setDirty(false));
  const close=()=>proceed(()=>{setDirty(false);setEditing(null);});
  const keyOf=r=>state.apiKeys.find(k=>k.id===r.keyId);
  return <><PageHead title="流量管理" note="按项目与API Key维护请求限流、Token限流和总额度。"><Button disabled={blocked} onClick={()=>setEditing({id:id('traffic'),projectId:state.projects[0]?.id||'',keyId:'',tokenEnabled:true,requestEnabled:true,totalEnabled:false,tokenPeriod:'分钟',requestPeriod:'分钟',tokenLimit:1000,requestLimit:1000,totalLimit:''})}><Plus/>创建规则</Button><Refresh onClick={reload}/></PageHead><section className="cc-surface"><DataTable rows={config.traffic} empty="暂无限流规则，可为API Key创建规则。" columns={[
    ['项目空间',r=>state.projects.find(p=>p.id===r.projectId)?.name||r.projectId],['API Key名称',r=>keyOf(r)?.name||'—'],['API Key',r=>maskApiKey(keyOf(r)?.secretPreview)],
    ['限制',r=><>{r.tokenEnabled&&<div>{r.tokenLimit} Tokens / {r.tokenPeriod}</div>}{r.requestEnabled&&<div>{r.requestLimit} 次 / {r.requestPeriod}</div>}{r.totalEnabled&&<div>总额度 {r.totalLimit} Tokens</div>}</>],['操作',r=>rowActions(()=>setEditing(r),()=>setTarget({...r,name:keyOf(r)?.name||r.id}))]
  ]}/></section><Modal title="限流规则" open={!!editing} close={close}>{editing&&<TrafficForm key={editing.id} record={editing} state={state} dirty={setDirty} close={close} save={value=>{const result=run({collection:'traffic',operation:'save',record:value});if(result===true){setDirty(false);setEditing(null);}return result;}}/>}</Modal><Confirm target={target} close={()=>setTarget(null)} run={()=>run({collection:'traffic',operation:'delete',id:target.id})===true}/>{guard}</>;
}

function RoutingForm({record,config,save,close,dirty}) {
  const [form,setForm]=useState(()=>structuredClone(record)),[error,setError]=useState('');
  const set=(key,value)=>{setForm(f=>({...f,[key]:value}));dirty(true);setError('');};
  const rules=key=><Field label={key==='headers'?'Header匹配':'Query参数匹配'} wide><div className="cc-inline-list">{form[key].map((rule,index)=><div key={index} className="cc-inline-row"><TextField label="参数名称" value={rule.name} onChange={v=>set(key,form[key].map((r,i)=>i===index?{...r,name:v}:r))} required/><Field label="条件" required><Choice label={`${key==='headers'?'Header':'Query'}条件${index+1}`} value={rule.condition} options={MATCH_MODES.map(v=>[v,v])} onChange={v=>set(key,form[key].map((r,i)=>i===index?{...r,condition:v}:r))}/></Field><TextField label="匹配值" value={rule.value} onChange={v=>set(key,form[key].map((r,i)=>i===index?{...r,value:v}:r))} required/><Button type="button" variant="outline" aria-label={`移除${key}匹配${index+1}`} onClick={()=>set(key,form[key].filter((_,i)=>i!==index))}><Trash2/></Button></div>)}</div><Button type="button" variant="outline" onClick={()=>set(key,[...form[key],{name:'',condition:'精确匹配',value:''}])}><Plus/>添加参数</Button></Field>;
  const targets=key=><TargetServices value={form[key]} config={config} onChange={v=>set(key,v)} fallback={key==='fallback'}/>;
  return <form className="cc-form" onSubmit={e=>{e.preventDefault();const result=save(form);if(result!==true)setError(result);}}><div className="cc-form-grid">
    <TextField label="路由名称" value={form.name} required maxLength={63} onChange={v=>set('name',v)}/><Field label="路径匹配"><Choice label="路径匹配方式" value={form.pathMatch} options={['前缀匹配','精确匹配','正则匹配'].map(v=>[v,v])} onChange={v=>set('pathMatch',v)}/></Field>
    <TextField label="路径匹配值" value={form.path} required onChange={v=>set('path',v)}/><Check label="忽略路径大小写" value={form.ignoreCase} onChange={v=>set('ignoreCase',v)}/>
    {rules('headers')}{rules('query')}
  </div><h2>目标AI服务</h2>{targets('targets')}<Check label="启用降级配置" value={form.fallbackEnabled} onChange={v=>{set('fallbackEnabled',v);if(v&&!form.fallback.length)set('fallback',[{providerId:'',mappings:[]}]);}}/>{form.fallbackEnabled&&<><Field label="需要降级的响应码" required><PickValues label="需要降级的响应码" values={form.fallbackCodes||[]} options={['4xx','5xx']} multiple onChange={v=>set('fallbackCodes',v)}/></Field><h2>降级目标AI服务</h2>{targets('fallback')}</>}<FormFooter close={close} error={error}/></form>;
}
export function ModelRoutingPage({config,run,blocked,reload}) {
  const [query,setQuery]=useState(''),[applied,setApplied]=useState(''),[editing,setEditing]=useState(null),[target,setTarget]=useState(null),[dirty,setDirty]=useState(false),{proceed,guard}=useDraftGuard(dirty,()=>setDirty(false));
  const close=()=>proceed(()=>{setDirty(false);setEditing(null);});
  return <><PageHead title="模型路由管理" note="配置请求匹配、目标服务分配和降级路由。"><Button disabled={blocked} onClick={()=>setEditing({id:id('route'),name:'',pathMatch:'前缀匹配',path:'/',ignoreCase:true,headers:[],query:[],targets:[{providerId:'',mappings:[],percent:100}],fallbackEnabled:false,fallbackCodes:[],fallback:[]})}><Plus/>创建模型路由</Button><Refresh onClick={reload}/></PageHead><section className="cc-surface"><form className="cc-toolbar" onSubmit={e=>{e.preventDefault();setApplied(query);}}><TextField label="名称、路径或模型" value={query} onChange={setQuery}/><Button type="submit">查询</Button><Button type="button" variant="outline" onClick={()=>{setQuery('');setApplied('');}}>重置</Button></form><DataTable key={applied} rows={config.routes.filter(r=>`${r.name} ${r.path} ${r.targets.flatMap(t=>(t.mappings||[]).map(m=>m.targetName)).join(' ')}`.toLowerCase().includes(applied.toLowerCase()))} columns={[
    ['名称',r=>r.name],['路径匹配规则',r=><>{r.pathMatch}<small>{r.path}</small></>],['模型匹配规则',r=>r.targets.flatMap(t=>(t.mappings||[]).map(m=>'精确匹配 | '+(config.models.find(model=>model.id===m.modelId)?.name||m.modelId)+' → '+m.targetName)).join('；')||'未配置'],['AI服务提供商',r=>r.targets.map(t=>`${config.providers.find(p=>p.id===t.providerId)?.name||'—'} ${t.percent}%`).join('、')],['操作',r=>rowActions(()=>setEditing(r),()=>setTarget(r))]
  ]}/></section><Modal drawer title="模型路由配置" open={!!editing} close={close} wide>{editing&&<RoutingForm key={editing.id} record={editing} config={config} dirty={setDirty} close={close} save={value=>{const result=run({collection:'routes',operation:'save',record:value});if(result===true){setDirty(false);setEditing(null);}return result;}}/>}</Modal><Confirm target={target} close={()=>setTarget(null)} run={()=>run({collection:'routes',operation:'delete',id:target.id})===true}/>{guard}</>;
}
