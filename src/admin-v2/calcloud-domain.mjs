import { dayOf } from './analytics.js';
import { usageMeter, usageValue } from './usage-analysis.js';

export const CALCLOUD_STORAGE_KEY = 'moma.5110.calcloud-config.v1';
export const CALCLOUD_PAGE_IDS = ['base-models','cost-analysis','customer-analysis','provider-analysis','model-analysis','model-providers','business-call-statistics','performance-statistics','error-statistics','traffic-management','model-routing'];
export const CALCLOUD_TYPES = { text:'语言模型',multimodal:'多模态模型',image:'视觉模型',video:'视觉模型',audio:'语音模型',embedding:'向量模型',rerank:'排序模型' };
export const CALCLOUD_PERIODS = ['分钟','日','月'];
export const MATCH_MODES = ['前缀匹配','精确匹配','正则匹配'];
export const emptyBinding = providerId => ({providerId,inputs:providerId?['TEXT']:[],outputs:providerId?['TEXT']:[],features:['Function Call','结构化输出','联网搜索'],custom:{context:16384,step:2048,input:8192,output:8192,functionType:'NO_CALL',online:false,api:false},prices:{costInput:3,costCached:1,costOutput:5,saleInput:4,saleCached:2,saleOutput:6},needsSubscription:false,preset:false});
export const modelSubtypes = value => (value||'').split('、').filter(Boolean);
const displayPrice = value => Number.isFinite(value) ? value / 1e6 : null;
const nowText = () => new Date().toISOString();

export function createCalcloudSeed(state) {
  const providers=state.providers.map(p=>({id:p.id,ownership:'OpenAI/OpenAI兼容服务',code:p.code||p.id.replace(/^provider-/,''),name:p.name,description:p.description||'',baseUrl:state.endpoints.find(e=>e.providerId===p.id)?.baseUrl||'',credential:state.endpoints.find(e=>e.providerId===p.id)?.credentialRef||'',external:p.sourceType==='thirdParty',updatedAt:p.updatedAt}));
  const models=state.models.map(m=>({id:m.id,name:m.name,type:m.type,series:m.profile?.family||m.maker||'',parameters:m.profile?.parameters||'',tags:m.profile?.tasks||[],subtype:m.profile?.subtype||'',description:m.description||'',protocol:m.profile?.license||'',icon:m.icon||'',precision:m.profile?.precision||'',statement:'',examples:{},enabled:!!m.callsEnabled,visible:m.visibility==='公开',smartRouting:false,agent:false,mcp:false,upload:false,createdAt:m.createdAt,updatedAt:m.updatedAt,bindings:[...new Set(state.modelSupplies.filter(s=>s.modelId===m.id).map(s=>state.endpoints.find(e=>e.id===s.endpointId)?.providerId).filter(Boolean))].slice(0,10).map(providerId=>{
    const purchase=state.supplyPrices.filter(p=>p.modelId===m.id&&p.providerId===providerId).sort((a,b)=>Date.parse(b.effectiveAt)-Date.parse(a.effectiveAt))[0];
    const sale=state.modelSalePrices.filter(p=>p.modelId===m.id&&!p.supplyId).sort((a,b)=>Date.parse(b.effectiveAt)-Date.parse(a.effectiveAt))[0];
    return {...emptyBinding(providerId),prices:{costInput:displayPrice(purchase?.inputPrice),costCached:displayPrice(purchase?.cachedPrice),costOutput:displayPrice(purchase?.outputPrice),saleInput:displayPrice(sale?.inputPrice),saleCached:displayPrice(sale?.cachedPrice),saleOutput:displayPrice(sale?.outputPrice)}};
  })}));
  const routes=state.routes.filter(r=>models.some(m=>m.id===r.modelId)).map(r=>({id:r.id,name:r.routeId||r.id,pathMatch:'前缀匹配',path:'/v1/chat/completions',ignoreCase:true,headers:[],query:[],targets:r.targets.map(t=>({providerId:state.endpoints.find(e=>e.id===t.endpointId)?.providerId,mappings:[{modelId:r.modelId,condition:'精确匹配',targetName:state.models.find(m=>m.id===r.modelId)?.modelId||''}],percent:t.weight})).filter(t=>providers.some(p=>p.id===t.providerId)),fallbackEnabled:false,fallbackCodes:[],fallback:[],updatedAt:r.updatedAt}));
  const traffic=state.limits.filter(l=>l.scopeType==='key').flatMap(l=>{const key=state.apiKeys.find(k=>k.id===l.scopeId);return key?[{id:l.id,projectId:key.projectId,keyId:key.id,tokenEnabled:l.tpm>0,tokenPeriod:'分钟',tokenLimit:l.tpm||1000,requestEnabled:l.rpm>0,requestPeriod:'分钟',requestLimit:l.rpm||1000,totalEnabled:false,totalLimit:10000}]:[];});
  return {version:1,providers,models,routes,traffic,priceVersions:[]};
}

export function validateIcon({size,width,height,type}) {
  if (!['image/png','image/jpeg'].includes(type)||size>102400||width>100||height>100||width<1||height<1) throw new Error('图标须为100×100以内、100KB以内的PNG或JPEG图片');
}
const positive = value => Number.isSafeInteger(Number(value)) && Number(value)>0;
export function calcloudTransaction(current, command, state, now=nowText()) {
  const {collection,operation,record,id}=command;
  const allowed={models:['平台管理员','运营人员'],providers:['平台管理员','运营人员'],traffic:['平台管理员','运维人员'],routes:['平台管理员','运维人员']};
  if (!allowed[collection]?.includes(state.currentRole)) throw new Error('当前角色不能修改此配置');
  if (!['save','delete','status','visibility'].includes(operation)) throw new Error('不支持的操作');
  const next=structuredClone(current), rows=next[collection];
  const existing=rows.find(r=>r.id===(id||record?.id));
  if (operation==='status'||operation==='visibility') {
    const key=operation==='status'?'enabled':'visible';
    if (collection!=='models'||!existing||typeof record[key]!=='boolean') throw new Error('无效的模型状态变更');
    next.models=rows.map(r=>r.id===id?{...r,[key]:record[key]}:r);return next;
  }
  if (operation==='delete') {
    if (!existing) throw new Error('记录已不存在，请刷新');
    if (collection==='providers'&&(next.models.some(m=>m.bindings.some(b=>b.providerId===id))||next.routes.some(r=>[...r.targets,...r.fallback].some(t=>t.providerId===id)))) throw new Error('服务商仍被模型或路由引用，不能删除');
    if (collection==='models'&&(existing.enabled||next.routes.some(r=>[...r.targets,...r.fallback].some(t=>t.modelId===id||t.mappings?.some(m=>m.modelId===id))))) throw new Error('请先停用模型并解除路由引用');
    next[collection]=rows.filter(r=>r.id!==id);return next;
  }
  const value=structuredClone(record);
  if (!value?.id) throw new Error('缺少记录ID');
  if (collection==='providers') {
    if (!value.name?.trim()||!value.code?.trim()||!value.ownership||!value.credential?.trim()) throw new Error('请填写服务商归属、中英文名称和API Key');
    if (value.ownership!=='OpenAI/OpenAI兼容服务') throw new Error('服务商归属须为OpenAI/OpenAI兼容服务');
    if (existing && ['ownership','code','name'].some(key=>value[key]!==existing[key])) throw new Error('服务商归属及中英文名称创建后不可修改');
    if (value.code.length>200||value.name.length>100||value.baseUrl.length>500||value.credential.length>500) throw new Error('服务商字段超过长度限制');
    if ((value.description||'').length>500) throw new Error('服务商描述不能超过500个字符');
    if (!/^[a-zA-Z0-9_.-]+$/.test(value.code)) throw new Error('英文名称仅支持字母、数字、点、下划线和连字符');
    let url;try {url=new URL(value.baseUrl);} catch {throw new Error('请填写有效的API Base URL');}
    if (!['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('服务地址须使用HTTP或HTTPS，不能包含账号密码');
    if (rows.some(r=>r.id!==value.id&&r.code.toLowerCase()===value.code.toLowerCase())) throw new Error('服务商英文名称已存在');
  }
  if (collection==='models') {
    if (existing&&value.name!==existing.name) throw new Error('模型名称创建后不可修改');
    if (!['agent','mcp','upload'].every(key=>typeof value[key]==='boolean')) throw new Error('请选择是否支持Agent、MCP及上传文件');
    if (!/^[A-Za-z0-9_.:-]{2,50}$/.test(value.name||'')) throw new Error('模型名称须为2–50个字母、数字、连字符、下划线、冒号或点');
    if (!value.type||!value.series?.trim()||!value.description?.trim()||value.description.length>1000||!value.tags?.length||!value.precision?.trim()||!value.icon) throw new Error('请填写图标、标签、类型、系列、简介和精度');
    if (!Number.isFinite(Date.parse(value.updatedAt))) throw new Error('请填写模型更新时间');
    if (rows.some(r=>r.id!==value.id&&r.name.toLowerCase()===value.name.toLowerCase())) throw new Error('模型名称已存在');
    if (!value.bindings?.length||value.bindings.length>10||new Set(value.bindings.map(b=>b.providerId)).size!==value.bindings.length) throw new Error('请配置1–10个不同的模型服务商');
    for (const b of value.bindings) {
      if (!next.providers.some(p=>p.id===b.providerId)||!b.inputs.length||!b.outputs.length) throw new Error('请选择有效服务商及输入输出格式');
      for (const price of Object.values(b.prices)) if (price!==null&&price!==''&&(!Number.isFinite(Number(price))||Number(price)<0)) throw new Error('价格须为非负数，未配置的价格请留空');
      for (const key of ['context','step','input','output']) if (b.custom[key]!=null&&b.custom[key]!==''&&!positive(b.custom[key])) throw new Error('上下文和输入输出长度须为正整数');
    }
  }
  if (collection==='traffic') {
    if (existing&&value.keyId!==existing.keyId) throw new Error('API Key创建规则后不可修改');
    const key=state.apiKeys.find(k=>k.id===value.keyId);
    if (!state.projects.some(p=>p.id===value.projectId)||!key||key.projectId!==value.projectId) throw new Error('API Key必须属于所选项目空间');
    if (rows.some(r=>r.id!==value.id&&r.keyId===value.keyId)) throw new Error('该API Key已有规则，请编辑现有规则');
    if (!value.tokenEnabled&&!value.requestEnabled&&!value.totalEnabled) throw new Error('请至少启用一种限制');
    for (const prefix of ['token','request','total']) if (value[prefix+'Enabled']&&!positive(value[prefix+'Limit'])) throw new Error('额度和请求次数须为正整数');
    if (value.tokenEnabled&&!CALCLOUD_PERIODS.includes(value.tokenPeriod)) throw new Error('请选择分钟、日或月周期');
    if (value.requestEnabled&&value.requestPeriod!=='分钟') throw new Error('请求限流仅支持分钟周期');
  }
  if (collection==='routes') {
    if (!/^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?$/.test(value.name||'')) throw new Error('名称须为1–63个小写字母、数字、点或连字符，首尾不能为特殊字符');
    if (rows.some(r=>r.id!==value.id&&r.name===value.name)) throw new Error('路由名称已存在');
    if (!value.path?.startsWith('/')) throw new Error('路径匹配值须以 / 开头');
    if (!['前缀匹配','精确匹配','正则匹配'].includes(value.pathMatch)) throw new Error('请选择有效路径匹配方式');
    for (const rule of [...value.headers,...value.query]) {
      if (!rule.name?.trim()||!rule.value?.trim()) throw new Error('请求头和Query参数名称、匹配值不能为空');
      if (!MATCH_MODES.includes(rule.condition)) throw new Error('请选择Header和Query参数的匹配条件');
      if (rule.condition==='正则匹配') try {new RegExp(rule.value);} catch {throw new Error('参数正则表达式无效');}
    }
    if (!value.targets.length||new Set(value.targets.map(t=>t.providerId)).size!==value.targets.length) throw new Error('请配置不同的目标AI服务');
    if (value.targets.some(t=>!positive(t.percent))||value.targets.reduce((n,t)=>n+Number(t.percent),0)!==100) throw new Error('目标服务的请求比例合计须为100%');
    if (value.fallbackEnabled&&(!Array.isArray(value.fallbackCodes)||!value.fallbackCodes.length||value.fallbackCodes.some(c=>!['4xx','5xx'].includes(c))||value.fallback.length!==1)) throw new Error('请选择4xx或5xx响应码和一个降级服务');
    for (const target of [...value.targets,...(value.fallbackEnabled?value.fallback:[])]) {
      if (!next.providers.some(p=>p.id===target.providerId)) throw new Error('请选择有效服务商');
      if (!Array.isArray(target.mappings)||!target.mappings.length||new Set(target.mappings.map(m=>m.modelId)).size!==target.mappings.length) throw new Error('请配置不同的模型名称映射规则');
      for (const mapping of target.mappings) if (mapping.condition!=='精确匹配'||!mapping.targetName?.trim()||!next.models.find(m=>m.id===mapping.modelId)?.bindings.some(b=>b.providerId===target.providerId)) throw new Error('模型名称映射须选择服务商的模型、精确匹配并填写上游名称');
    }
    if (value.pathMatch==='正则匹配') try {new RegExp(value.path);} catch {throw new Error('路径正则表达式无效');}
  }
  if (collection==='models') {
    const versions=[];
    for (const binding of value.bindings) {
      const prior=existing?.bindings.find(b=>b.providerId===binding.providerId);
      const numeric=v=>v==null||v===''?null:Number(v);
      if (prior&&['costInput','costCached','costOutput','saleInput','saleCached','saleOutput'].every(key=>numeric(prior.prices[key])===numeric(binding.prices[key]))) continue;
      for (const kind of ['cost','sale']) {
        const price=key=>binding.prices[kind+key]==null||binding.prices[kind+key]===''?null:Math.round(Number(binding.prices[kind+key])*1e6);
        versions.push({id:"cc-price-"+value.id+"-"+binding.providerId+"-"+kind+"-"+now,modelId:value.id,providerId:binding.providerId,kind,unit:"元/百万 Token",status:"生效中",effectiveAt:now,inputPrice:price("Input"),cachedPrice:price("Cached"),outputPrice:price("Output")});
      }
    }
    next.priceVersions=[...(current.priceVersions||[]),...versions];
  }
  if (collection!=='models') value.updatedAt=now;
  value.createdAt=existing?.createdAt||now;
  if (existing) next[collection]=rows.map(r=>r.id===value.id?value:r);else rows.unshift(value);
  return next;
}

export function calcloudFacts(state,range,filters={},now=Date.now()) {
  const from=range.from??Date.parse(range.start+'T00:00:00+08:00');
  const to=Math.min(range.to??Date.parse(range.end+'T00:00:00+08:00')+86400000,now);
  const models=new Map([...(state.historicalModels||[]),...state.models].map(m=>[m.id,m])), endpoints=new Map(state.endpoints.map(e=>[e.id,e]));
  const unique=new Map();
  for (const r of state.requests) {
    const at=Date.parse(r.createdAt),m=models.get(r.modelId),providerId=endpoints.get(r.endpointId)?.providerId;
    if (at<from||at>=to||!Number.isFinite(at)||(filters.model&&r.modelId!==filters.model)||(filters.provider&&providerId!==filters.provider)||(filters.type&&m?.type!==filters.type)||(filters.customer&&r.tenantId!==filters.customer)) continue;
    const meter=usageMeter(m,r), value=usageValue(r,meter.fields),token=meter.unit==='Token';
    unique.set(r.requestId||r.id,{...r,at,providerId,token,tokenFields:meter.fields,input:token?value.input??null:null,output:token?value.output??null:null,total:token&&value.complete?value.total:null,cached:token&&value.complete&&Number.isFinite(r.usage?.cached)&&r.usage.cached>=0?r.usage.cached:null});
  }
  return {rows:[...unique.values()],from,to};
}
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const sumKnown=(rows,key)=>rows.every(r=>Number.isFinite(r[key]))?rows.reduce((sum,r)=>sum+r[key],0):null;
export function calcloudSummary(rows) {
  const tokenRows=rows.filter(r=>r.token),known=rows.filter(r=>Number.isFinite(r.httpStatus)),failed=known.filter(r=>!(r.httpStatus>=200&&r.httpStatus<300));
  const tokens=key=>{const supported=key==='total'?tokenRows:tokenRows.filter(r=>!r.tokenFields||r.tokenFields.includes(key));return rows.length&&!supported.length?null:sumKnown(supported,key);};
  const customers=rows.every(r=>r.userId)?new Set(rows.map(r=>r.userId)).size:null;
  const total=tokens('total');
  return {calls:rows.length,customers,averageCustomer:!rows.length?0:customers&&total!=null?total/customers:null,averageRequest:!rows.length?0:total!=null?total/rows.length:null,failed:known.length===rows.length?failed.length:null,errorRate:known.length===rows.length&&rows.length?failed.length/rows.length*100:null,input:tokens('input'),output:tokens('output'),cached:rows.length&&!tokenRows.some(r=>!r.tokenFields||r.tokenFields.includes('input'))?null:sumKnown(tokenRows.filter(r=>!r.tokenFields||r.tokenFields.includes('input')),'cached'),total,latency:mean(rows.map(r=>r.durationMs).filter(Number.isFinite)),ttft:mean(rows.map(r=>r.ttftMs).filter(Number.isFinite)),timeout:failed.filter(r=>[408,504].includes(r.httpStatus)||r.attempts?.some(a=>/timeout/i.test(a.error||''))).length,four:failed.filter(r=>r.httpStatus>=400&&r.httpStatus<500).length,five:failed.filter(r=>r.httpStatus>=500&&r.httpStatus<600).length,other:failed.filter(r=>r.httpStatus<400||r.httpStatus>=600).length};
}
export function calcloudBuckets(facts) {
  const step=facts.to-facts.from<=3600000?60000:facts.to-facts.from<=86400000?3600000:86400000;
  const buckets=Array.from({length:Math.min(366,Math.ceil((facts.to-facts.from)/step))},(_,i)=>({start:facts.from+i*step,end:Math.min(facts.to,facts.from+(i+1)*step),rows:[]}));
  for (const row of facts.rows) buckets[Math.floor((row.at-facts.from)/step)]?.rows.push(row);
  return buckets.map(b=>({...b,...calcloudSummary(b.rows),label:new Date(b.start+8*3600000).toISOString().slice(5,step<86400000?16:10).replace('T',' '),minutes:(b.end-b.start)/60000}));
}
export function calcloudGroups(rows,key,collection) {
  const map=new Map();for (const row of rows) {const id=row[key];if(id){if(!map.has(id))map.set(id,[]);map.get(id).push(row);}}
  return [...map].map(([id,group])=>({id,name:collection.find(c=>c.id===id)?.name||id,rows:group,...calcloudSummary(group)})).sort((a,b)=>b.calls-a.calls);
}

export function pricedUsage(row,quote) {
  if (row.total===null||!quote||quote.unit!=='元/百万 Token') return null;
  const input=row.input??0,output=row.output??0,cached=quote.cachedPrice==null?0:row.cached;
  if (cached===null||cached<0||cached>input) return null;
  const parts=[[input-cached,quote.inputPrice],[cached,quote.cachedPrice],[output,quote.outputPrice]];
  if (parts.some(([amount,price])=>amount>0&&(!Number.isFinite(price)||price<0))) return null;
  if ((row.usage?.cacheWrite||0)>0) return null;
  return parts.reduce((sum,[amount,price])=>sum+amount*(price??0),0)/1e12;
}
export function calcloudCosts(state,facts,filter={}) {
  const history=(collection,modelId,providerId,at,supplyId)=>collection.filter(p=>p.modelId===modelId&&(!p.providerId||!providerId||p.providerId===providerId)&&(!p.supplyId||p.supplyId===supplyId)&&['生效中','已发布'].includes(p.status)&&Date.parse(p.effectiveAt)<=at).sort((a,b)=>Date.parse(b.effectiveAt)-Date.parse(a.effectiveAt)||Number(!!b.supplyId)-Number(!!a.supplyId))[0];
  const groups=new Map();for (const r of facts.rows) {const key=JSON.stringify([r.modelId,r.providerId]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  for (const supply of state.modelSupplies) {const providerId=state.endpoints.find(e=>e.id===supply.endpointId)?.providerId;if(providerId&&!groups.has(JSON.stringify([supply.modelId,providerId]))) groups.set(JSON.stringify([supply.modelId,providerId]),[]);}
  const collect=values=>values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
  return [...groups].map(([id,rows])=>{
    const [modelId,providerId]=JSON.parse(id),model=state.models.find(m=>m.id===modelId),provider=state.providers.find(p=>p.id===providerId);
    const supplyId=state.modelSupplies.find(s=>s.modelId===modelId&&state.endpoints.find(e=>e.id===s.endpointId)?.providerId===providerId)?.id;
    const currentPrices=state.configuredPrices?.find(p=>p.modelId===modelId&&p.providerId===providerId);
    const amounts=rows.map(row=>{const supply=state.modelSupplies.find(s=>s.modelId===modelId&&s.endpointId===row.endpointId)?.id;return {income:pricedUsage(row,row.priceSnapshot||history(state.modelSalePrices,modelId,providerId,row.at,supply)),cost:pricedUsage(row,row.procurementPriceSnapshot||history(state.supplyPrices,modelId,providerId,row.at,supply))};});
    const income=collect(amounts.map(a=>a.income)),cost=collect(amounts.map(a=>a.cost));
    return {id,modelId,providerId,name:model?.name||modelId,provider:provider?.name||providerId,createdAt:history(state.supplyPrices,modelId,providerId,Date.now(),supplyId)?.effectiveAt||model?.createdAt,rows,...calcloudSummary(rows),uncached:rows.length&&!rows.some(r=>r.token)?null:collect(rows.filter(r=>r.token).map(r=>Number.isFinite(r.input)&&Number.isFinite(r.cached)&&r.cached<=r.input?r.input-r.cached:null)),income,cost,profit:income!==null&&cost!==null?income-cost:null,purchase:currentPrices?.cost||history(state.supplyPrices,modelId,providerId,Date.now(),supplyId),sale:currentPrices?.sale||history(state.modelSalePrices,modelId,providerId,Date.now(),supplyId)};
  }).filter(r=>(!filter.model||r.modelId===filter.model)&&(!filter.provider||r.providerId===filter.provider));
}

// Price intervals follow actual price-version boundaries, independent of chart time buckets.
export function calcloudCostHistory(state,facts,modelId,providerId) {
  const supplies=state.modelSupplies.filter(s=>s.modelId===modelId&&state.endpoints.find(e=>e.id===s.endpointId)?.providerId===providerId).map(s=>s.id);
  const prices=[...state.supplyPrices.filter(p=>p.providerId===providerId),...state.modelSalePrices.filter(p=>!p.providerId||p.providerId===providerId)].filter(p=>p.modelId===modelId&&(!p.supplyId||supplies.includes(p.supplyId))&&['生效中','已发布'].includes(p.status)&&Number.isFinite(Date.parse(p.effectiveAt)));
  const boundaries=[...new Set(prices.map(p=>Date.parse(p.effectiveAt)))].sort((a,b)=>a-b);
  const relevant=calcloudFacts(state,{from:boundaries[0],to:Date.now()}).rows.filter(r=>r.modelId===modelId&&r.providerId===providerId);
  if (!boundaries.length) return [];
  return boundaries.flatMap((start,index)=>{
    const end=boundaries[index+1]??Infinity,from=start,to=Math.min(end,Date.now());
    if (from>=to) return [];
    const rows=relevant.filter(r=>r.at>=from&&r.at<to);
    const summary=calcloudCosts(state,{rows,from,to:to-1},{model:modelId,provider:providerId})[0];
    return summary?[{...summary,purchase:state.supplyPrices.filter(p=>p.modelId===modelId&&p.providerId===providerId&&Date.parse(p.effectiveAt)<=start).sort((a,b)=>Date.parse(b.effectiveAt)-Date.parse(a.effectiveAt))[0],id:`${modelId}:${providerId}:${start}`,effectiveFrom:start,effectiveTo:Number.isFinite(end)?end:null}]:[];
  }).reverse();
}
export const beijingDay=dayOf;

// The legacy pages share their configured catalogue and price versions without mutating the original workspaces.
export function calcloudAnalyticsState(state,config) {
  const endpoints=[...state.endpoints];
  const modelSupplies=config.models.flatMap(model=>model.bindings.flatMap(binding=>{
    const existing=state.modelSupplies.filter(s=>s.modelId===model.id&&state.endpoints.find(e=>e.id===s.endpointId)?.providerId===binding.providerId);
    if(existing.length)return existing;
    let endpoint=endpoints.find(e=>e.providerId===binding.providerId);
    if(!endpoint){endpoint={id:'cc-endpoint-'+binding.providerId,providerId:binding.providerId};endpoints.push(endpoint);}
    return [{id:'cc-supply-'+model.id+'-'+binding.providerId,modelId:model.id,endpointId:endpoint.id}];
  }));
  const versions=config.priceVersions||[];
  const configuredPrices=config.models.flatMap(model=>model.bindings.map(binding=>{
    const quote=prefix=>({unit:'元/百万 Token',...Object.fromEntries(['Input','Cached','Output'].map(key=>[key.toLowerCase()+'Price',binding.prices[prefix+key]==null||binding.prices[prefix+key]===''?null:Math.round(Number(binding.prices[prefix+key])*1e6)]))});
    return {modelId:model.id,providerId:binding.providerId,cost:quote('cost'),sale:quote('sale')};
  }));
  return {...state,configuredPrices,historicalModels:state.models,models:config.models.map(model=>({...state.models.find(m=>m.id===model.id),...model})),providers:config.providers,endpoints,modelSupplies,supplyPrices:[...state.supplyPrices,...versions.filter(v=>v.kind==='cost')],modelSalePrices:[...state.modelSalePrices,...versions.filter(v=>v.kind==='sale')]};
}

export function observationWindow(preset,clock,custom) {
  if(preset==='custom') {
    const from=Date.parse(custom?.start),to=Date.parse(custom?.end);
    if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to||to>clock)throw new Error('请选择有效且不晚于当前时刻的时间范围');
    return {from,to};
  }
  const midnight=Date.parse(dayOf(clock)+'T00:00:00+08:00');
  return {from:preset==='5m'?clock-300000:midnight-(preset==='3d'?2:preset==='7d'?6:0)*86400000,to:clock};
}

export const calcloudKeyValue = key => key?.secret || (key?.keyId?.startsWith('ak-demo-')?'sk-local-fixture-'+key.keyId:key?.secretPreview);
