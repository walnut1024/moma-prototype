import { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import ModelMetadataForm from './ModelMetadataForm';
import { Modal, Notice } from './ModelOperationsUI';
import { materialBase, materialImpact, listed } from './model-operations';
import { IDENTITY_FIELDS, TECHNICAL_FIELDS, PRESENTATION_FIELDS, COMMON_FIELDS, INTERFACE_FIELDS, RECORD_FIELDS, FEATURE_FIELDS, specificationFields } from './model-profile';

function MaterialChanges({record,value,cardOnly}) {
  const fields=[['name','模型名称'],['maker','模型作者'],['type','模型类型'],['description','简短介绍'],['usageUnit','计量单位']];
  const rows=[...fields.map(([key,label])=>[label,record[key],value[key]]),...['context','output','streaming','tools'].map((key,index)=>[['上下文大小','最大输出','流式响应','工具调用'][index],record.capabilities?.[key],value.capabilities?.[key]]),...[...IDENTITY_FIELDS,...TECHNICAL_FIELDS,...PRESENTATION_FIELDS,...COMMON_FIELDS,...INTERFACE_FIELDS,...RECORD_FIELDS,...FEATURE_FIELDS,...specificationFields(value.type,value.usageUnit,value.profile)].map(({key,label})=>[label,record.profile?.[key],value.profile?.[key]])].filter((row,index,all)=>JSON.stringify(row[1] ?? '')!==JSON.stringify(row[2] ?? '') && all.findIndex(item=>item[0]===row[0])===index);
  const display=value=>Array.isArray(value)?value.join('、'):value==null || value===''?'未填写':typeof value==='boolean'?value?'支持':'不支持':String(value);
  return <dl className="sm-metadata-grid">{rows.map(([label,before,after])=><div key={label}><dt>{cardOnly?({'简短介绍':'模型简介','上下文大小':'上下文窗口','发布日期':'模型发布时间'}[label] || label):label}</dt><dd>{label==='模型 Logo'?'图片已变更':`${display(before)} → ${display(after)}`}</dd></div>)}</dl>;
}

export default function ModelLibraryEditor({ state, record, initial, onboardingId, ops, onSaved, onCancel, cardOnly = false, readOnly = false, scrollable = false }) {
  const base = useRef(record && materialBase(state, record));
  const [preview, setPreview] = useState(null), [downlist, setDownlist] = useState(false);
  const save = async value => { const next = await ops.run('templateSave', { ...value, onboardingId }); if (next) onSaved(next, next.audits[0].objectId); return next; };
  const inspect = value => { try { setDownlist(false); setPreview({ value, impact: materialImpact(state, record, value) }); } catch (error) { ops.setError(error.message); } };
  const online = preview?.impact.changed ? preview.impact.services.filter(listed) : [];
  return <>
    <ModelMetadataForm sourceLabel={record ? Object.values(state.modelData?.userIds || {}).some(ids=>ids.includes(record.id))?'用户配置':Object.values(state.modelData?.builtinIds || {}).some(ids=>ids.includes(record.id))?'内置资料':'已有资料' : '用户配置'} key={record?.id || 'new'} model={record} initial={initial} readOnly={readOnly} scrollable={scrollable} startEditing={!readOnly} can={ops.can} dirty={ops.dirty} cardOnly={cardOnly} title="" submitLabel={scrollable?'保存':record ? cardOnly?'保存卡片':'预览资料变更' : '保存模型资料'} onCancel={onCancel} onSubmit={record ? inspect : save}/>
    {ops.error && <Notice error>{ops.error}</Notice>}
    {preview && <Modal title={cardOnly?'核对卡片修改':scrollable?'确认资料变更':'发布共享模型资料'} description={record.name} onClose={() => setPreview(null)}>
      <MaterialChanges cardOnly={cardOnly} record={record} value={preview.value}/><p>{preview.impact.changed ? '调用能力变更，相关供应需重新验证。' : '展示资料变更，保留现有调用验证。'}</p>
      <h3>影响的模型服务（{preview.impact.services.length}）</h3><ul>{preview.impact.services.map(row => <li key={row.id}>{row.name} · <code>{row.modelId}</code> · {row.listingStatus || '未上架'}</li>)}</ul>
      {!preview.impact.services.length && <p>尚无模型服务引用，发布后更新模型资料。</p>}
      {online.length > 0 && <Notice error><label><input type="checkbox" checked={downlist} onChange={event => setDownlist(event.target.checked)}/>确认下架以上 {online.length} 个在线服务后发布；完成供应重验和平台验证后再重新上架。</label></Notice>}
      {ops.error && <Notice error>{ops.error}</Notice>}
      <div className="mo-footer"><Button variant="outline" onClick={() => setPreview(null)}>返回修改</Button><Button disabled={!ops.can || online.length > 0 && !downlist} onClick={async () => { const next = await ops.run('templatePublish', { id: record.id, value: preview.value, expectedBase: base.current, confirmed: true, confirmDownlist: downlist }); if (next) { setPreview(null); onSaved(next, record.id); } }}>{online.length ? cardOnly?'下架受影响服务并保存卡片':'下架受影响服务并发布资料' : cardOnly?'确认保存卡片':'确认发布资料'}</Button></div>
    </Modal>}
  </>;
}
