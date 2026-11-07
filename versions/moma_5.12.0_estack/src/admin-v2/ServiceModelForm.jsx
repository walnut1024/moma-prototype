import { useState } from 'react';
import { Button, Descriptions, Form, Input, Select, Typography } from '@douyinfe/semi-ui';
import { Choice, Field, Modal, Notice } from './ServiceUI';
import { serviceModelSources } from './supply-models';
import { modelMetadataDraft } from './model-metadata-draft';
import { MODEL_CATALOGUE_TYPES } from './model-library';
import { modelCategory } from './model-management';
import { serviceMetadataReady, serviceModelSourceDraft } from './model-profile';

export default function ServiceModelForm({state,sourceState=state,ops,close,saved}) {
  const library = serviceModelSources(sourceState), initial = library.find(record => record.id === ops.params.get('sourceLibrary'));
  const [source,setSource] = useState(initial?.id || ''), [callId,setCallId] = useState(initial ? serviceModelSourceDraft(sourceState,initial).modelId : '');
  const [replacement,setReplacement] = useState(null), [serviceMode,setServiceMode] = useState(''), [purpose,setPurpose] = useState('');
  const selected = library.find(row => row.id === source), metadata = selected && modelMetadataDraft(selected);
  const select = record => {setSource(record.id);setCallId(serviceModelSourceDraft(sourceState,record).modelId);setReplacement(null);ops.dirty(true);ops.setError('');};
  const maintainSource = () => {const back = new URLSearchParams(ops.params);back.set('view','add');back.set('sourceLibrary',source);ops.go({view:'template',template:source,materialMode:'edit',returnListing:'#/admin-2/listing?'+back},{base:'model-templates'});};
  return <Form className="ss-body" aria-label="新增模型服务" onSubmit={async () => {
    if(!selected){ops.setError('请先选择已接入模型');return;}
    if(!purpose){ops.setError('请选择服务用途');return;}
    if(!serviceMode){ops.setError('请选择服务模式');return;}
    const next = await ops.run('createServiceModel',{...serviceModelSourceDraft(sourceState,selected),modelId:callId,libraryId:source,serviceMode,purpose});
    if(next)saved(next,next.audits[0].objectId);
  }}>
    <Typography.Title heading={4}>新增模型服务</Typography.Title>
    <div><div className="ss-section-bar"><Typography.Text id="ss-source-label" strong>已接入模型 *</Typography.Text><Button htmlType="button" theme="borderless" onClick={() => ops.go({view:null,template:null,model:null,sourceLibrary:null,listingReturn:null,panel:null,perspective:'models'},{base:'providers'})}>前往渠道接入</Button></div>
      <Select aria-labelledby="ss-source-label" filter optionList={library.map(item => ({value:item.id,label:item.name+' · '+item.modelId+(state.models.some(row => row.id === item.id || row.templateId === item.id) ? ' · 已有服务' : ''),disabled:state.models.some(row => row.id === item.id || row.templateId === item.id)}))} placeholder="从渠道接入中搜索并选择模型" value={source || undefined} disabled={!ops.can} onChange={id => {const record=library.find(row => row.id===id);if(!record)return;if(source || callId)setReplacement(record);else select(record);}} emptyContent="暂无可选的已接入模型，请先在渠道接入中添加模型。"/>
    </div>
    {selected && <section aria-label="引用的模型资料"><div className="ss-section-bar"><Typography.Title heading={5}>模型资料</Typography.Title><Button htmlType="button" theme="borderless" onClick={maintainSource}>维护模型资料</Button></div><Descriptions data={[{key:'模型展示名',value:selected.name},{key:'规范模型标识',value:selected.profile?.canonicalModelId || selected.modelId},{key:'模型作者',value:selected.maker || selected.author || '未填写'},{key:'模型 Logo',value:metadata.profile.logo ? <img className="ss-model-logo" src={metadata.profile.logo} alt="模型 Logo"/> : '未填写'},{key:'模型类型',value:MODEL_CATALOGUE_TYPES[modelCategory(metadata.type)]},{key:'输入模态',value:metadata.profile.inputModalities?.join('、') || '未填写'},{key:'输出模态',value:metadata.profile.outputModalities?.join('、') || '未填写'},{key:'上下文窗口',value:metadata.capabilities.context > 0 ? metadata.capabilities.context.toLocaleString('zh-CN')+' Token' : '未填写'},{key:'原厂发布日期',value:metadata.profile.releaseDate || '未填写'},...(modelCategory(metadata.type)==='visual'?[{key:'视觉任务类型',value:metadata.type==='video'?'视频':'图像'}]:[]),{key:'简介',value:metadata.description || '未填写'}]}/>{!serviceMetadataReady(selected) && <Notice error>模型资料尚未完善，请先维护作者、发布时间、支持任务、模态及简介。</Notice>}</section>}
    <div className="ss-form-grid"><Field label="服务用途 *"><Choice label="服务用途" value={purpose || undefined} options={[[ 'internal','内部使用' ],['commercial','对外经营']]} placeholder="请选择服务用途" disabled={!ops.can} onChange={value => {setPurpose(value);ops.dirty(true);}}/></Field><Field label="服务模式 *"><Choice label="服务模式" value={serviceMode || undefined} options={[[ 'standard','统一模型服务模式' ],['provider','渠道直选模式']]} placeholder="请选择服务模式" disabled={!ops.can} onChange={value => {setServiceMode(value);ops.dirty(true);}}/></Field><Field label="对外调用标识 *" hint="客户请求平台时填写的 model 参数；渠道直选模式还需配置各服务商的调用标识。"><Input aria-label="对外调用标识" value={callId} maxLength={80} disabled={!ops.can} onChange={value => {setCallId(value);ops.dirty(true);ops.setError('');}}/></Field></div>
    {serviceMode && <Typography.Paragraph type="tertiary">{serviceMode==='standard' ? '客户使用一个调用标识和统一售价，平台选择供应渠道。' : '客户选择服务商，使用各服务商的调用标识和售价。'}</Typography.Paragraph>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="ss-footer"><Button htmlType="button" onClick={close}>取消</Button><Button theme="solid" htmlType="submit" disabled={!ops.can || !selected || !purpose || !serviceMode || !serviceMetadataReady(selected)}>完成添加</Button></div>
    {replacement && <Modal title="替换引用模型" onClose={() => setReplacement(null)} footer={<><Button htmlType="button" onClick={() => setReplacement(null)}>保留当前内容</Button><Button htmlType="button" onClick={() => select(replacement)}>确认引入</Button></>}>引入“{replacement.name}”将替换当前已填写的模型资料和对外调用标识。</Modal>}
  </Form>;
}
