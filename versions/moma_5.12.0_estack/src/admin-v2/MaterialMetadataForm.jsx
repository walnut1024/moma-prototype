import { cloneElement, useEffect, useRef, useState } from 'react';
import { Banner, Button, Collapse, Form, Input, InputNumber, Select, Space, TextArea, Tooltip, Typography, Upload } from '@douyinfe/semi-ui';
import { IconHelpCircle, IconUpload } from '@douyinfe/semi-icons';
import {modelFieldDescriptions} from './model-field-descriptions';
import { modelMetadataDraft as blankModel } from './model-metadata-draft';
import { modelCategory } from './model-management';
import { MODEL_CATALOGUE_TYPES } from './model-library';
import { IDENTITY_FIELDS, TECHNICAL_FIELDS, PRESENTATION_FIELDS, COMMON_FIELDS, INTERFACE_FIELDS, RECORD_FIELDS, FEATURE_FIELDS, ARCHITECTURE_OPTIONS, LICENSE_OPTIONS, LANGUAGE_OPTIONS, INPUT_MODALITY_OPTIONS, OUTPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS, SCENARIO_OPTIONS, TASK_OPTIONS, specificationFields, normalizeModelLogo } from './model-profile';

const supports = [['unknown','未填写'],['supported','支持'],['unsupported','不支持']];
const optionList = entries => entries.map(([value,label])=>({value,label}));
const display = value => value == null || value === '' ? '—' : Array.isArray(value) ? value.join('、') || '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export default function MaterialMetadataForm({model,initial,readOnly,can,dirty,onCancel,onSubmit,sourceLabel}) {
  const [form,setForm] = useState(()=>blankModel(model || initial)), [error,setError] = useState(''), [uploading,setUploading] = useState(false), [saving,setSaving] = useState(false);
  const [contextUnit,setContextUnit] = useState(form.capabilities.context > 0 && form.capabilities.context % 1024 === 0 ? 'K' : 'Token');
  const version = useRef(0);
  useEffect(()=>()=>{version.current++;},[]);
  const editable = !readOnly && can;
  const change = (key,value) => {
    setForm(current=>{
      const next={...current,[key]:value};
      if(key==='type'){
        const descriptors=[...IDENTITY_FIELDS,...TECHNICAL_FIELDS,...PRESENTATION_FIELDS,...COMMON_FIELDS,...INTERFACE_FIELDS,...RECORD_FIELDS,...FEATURE_FIELDS,...specificationFields(value,current.usageUnit,current.profile)];
        next.profile=Object.fromEntries(descriptors.filter(field=>current.profile[field.key]!=null).map(field=>[field.key,current.profile[field.key]]));
        next.profile.tasks=(current.profile.tasks || []).filter(task=>TASK_OPTIONS[value].includes(task));
        next.profile.detailDescription=current.profile.detailDescription;
      }
      return next;
    });setError('');dirty(true);
  };
  const profileChange = (key,value) => {setForm(current=>({...current,capabilities:{...current.capabilities,...(key==='supportedParameters' && value.includes('tools')?{tools:true}:{})},profile:{...current.profile,[key]:value,...(key==='supportedParameters' && value.includes('reasoning')?{reasoning:'supported'}:{}),...(key==='supportedParameters' && value.includes('structured_outputs')?{structured:'supported'}:{})}}));setError('');dirty(true);};
  const capabilityChange = (key,value) => change('capabilities',{...form.capabilities,[key]:value});
  const logoUpload = async files => {
    const file=files[0];if(!file)return;
    const current=++version.current;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>1048576){setError('Logo 仅支持 1 MB 以内的 PNG、JPEG 或 WebP 图片');return;}
    setUploading(true);setError('');
    try{
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('读取图片失败，请重新选择'));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(file);});
      const logo=normalizeModelLogo(data),image=document.createElement('img');image.src=logo;await image.decode();
      if(version.current===current)profileChange('logo',logo);
    }catch{if(version.current===current)setError('图片无法读取，请选择有效的 PNG、JPEG 或 WebP 图片');}
    finally{if(version.current===current)setUploading(false);}
  };
  const slot = (label,children,key=label,wide=false) => <Form.Slot key={key} label={{text:<Space>{label}{modelFieldDescriptions[label.replace(' *','')] && <Tooltip content={modelFieldDescriptions[label.replace(' *','')]}><Button theme="borderless" type="tertiary" size="small" icon={<IconHelpCircle aria-hidden/>} aria-label={label.replace(' *','')+'说明'}/></Tooltip>}</Space>,id:'material-label-'+key}} className={wide?'materials-wide-field':undefined}>{children?.type===Select?cloneElement(children,{'aria-labelledby':'material-label-'+key}):children}</Form.Slot>;
  const field = (label,value,onChange,extra={}) => slot(label,readOnly?<Typography.Text>{display(value)}</Typography.Text>:<Input aria-label={label.replace(' *','')} value={value ?? ''} disabled={!editable} onChange={onChange} {...extra}/>);
  const fields = descriptors => descriptors.map(({key,label,kind,placeholder,unit})=>{
    const value=form.profile[key];
    const choices=kind==='architecture'?ARCHITECTURE_OPTIONS:kind==='license'?LICENSE_OPTIONS:kind==='confirmation'?[['pending','待核对'],['confirmed','已核对']]:kind==='lifecycle'?[['stable','稳定版'],['preview','预览版'],['deprecated','已退役']]:kind==='support'?supports:null;
    const multi={languages:LANGUAGE_OPTIONS,modalities:key==='inputModalities'?INPUT_MODALITY_OPTIONS:OUTPUT_MODALITY_OPTIONS,tasks:TASK_OPTIONS[form.type],results:RESULT_TYPE_OPTIONS,scenarios:SCENARIO_OPTIONS,methods:['文件上传','URL','Base64','文本内容'],parameters:['temperature','top_p','top_k','max_tokens','seed','stop','tools','tool_choice','reasoning','include_reasoning','structured_outputs','response_format','frequency_penalty','presence_penalty']}[kind];
    if(readOnly)return slot(label,<Typography.Text>{choices?choices.find(([id])=>id===value)?.[1] || '未填写':display(value)+(value!=null && value!=='' && unit?' '+unit:'')}</Typography.Text>,key,kind==='json');
    const options=choices && [['unknown','未填写'],...choices.filter(([id])=>id!=='unknown'),...(value && value!=='unknown' && !choices.some(([id])=>id===value)?[[value,value]]:[])];
    const control=multi?<Select aria-label={label} multiple filter showClear value={value || []} optionList={[...new Set([...multi,...(value || [])])].map(value=>({value,label:value}))} disabled={!editable} onChange={value=>profileChange(key,value)}/>:choices?<Select aria-label={label} value={value || 'unknown'} optionList={optionList(options)} disabled={!editable} onChange={value=>profileChange(key,value)}/>:kind==='json'?<TextArea aria-label={label} value={typeof value==='string'?value:JSON.stringify(value ?? {},null,2)} rows={4} disabled={!editable} onChange={value=>profileChange(key,value)}/>:['number','decimal'].includes(kind)?<InputNumber aria-label={label} value={value ?? ''} min={kind==='decimal'?0:1} step={kind==='decimal'?0.1:1} suffix={unit} disabled={!editable} onChange={value=>profileChange(key,value)}/>:<Input aria-label={label} value={value ?? ''} placeholder={kind==='date'?'YYYY-MM-DD 或 YYYY-MM':placeholder} disabled={!editable} onChange={value=>profileChange(key,value)}/>;
    return slot(label,control,key,kind==='json');
  });
  const capabilities = <>
    {['text','multimodal','embedding','rerank'].includes(form.type) && slot('上下文窗口',readOnly?<Typography.Text>{form.capabilities.context?form.capabilities.context.toLocaleString()+' Token':'—'}</Typography.Text>:<InputNumber aria-label="上下文窗口" value={form.capabilities.context==null || form.capabilities.context===''?'':Number(form.capabilities.context)/(contextUnit==='K'?1024:1)} min={1} step={1} disabled={!editable} suffix={<Select aria-label="上下文窗口单位" value={contextUnit} optionList={optionList([['K','K Token'],['Token','Token']])} onChange={setContextUnit}/>} onChange={value=>capabilityChange('context',value===''?'':Number(value)*(contextUnit==='K'?1024:1))}/>)}
    {['text','multimodal'].includes(form.type) && slot('最大输出',readOnly?<Typography.Text>{form.capabilities.output?form.capabilities.output.toLocaleString()+' Token':'—'}</Typography.Text>:<InputNumber aria-label="最大输出" value={form.capabilities.output ?? ''} min={1} suffix="Token" disabled={!editable} onChange={value=>capabilityChange('output',value)}/>)}
    {['text','multimodal','audio'].includes(form.type) && ['streaming',...(['text','multimodal'].includes(form.type)?['tools']:[])].map(key=>slot(key==='streaming'?'流式响应':'工具调用',readOnly?<Typography.Text>{form.capabilities[key]==null?'未填写':form.capabilities[key]?'支持':'不支持'}</Typography.Text>:<Select aria-label={key==='streaming'?'流式响应':'工具调用'} value={form.capabilities[key]==null?'unknown':form.capabilities[key]?'supported':'unsupported'} optionList={optionList(supports)} disabled={!editable} onChange={value=>capabilityChange(key,value==='unknown'?null:value==='supported')}/>))}
  </>;
  return <Form onSubmit={async()=>{
    if(!editable || saving || uploading)return;
    if(!form.name.trim() || !form.modelId.trim()){setError('请填写模型展示名和规范模型标识');return;}
    setSaving(true);try{await onSubmit({...form,capabilities:['text','multimodal','embedding','rerank'].includes(form.type)?form.capabilities:{streaming:form.type==='audio'?form.capabilities.streaming:null,tools:null,context:null,output:null}});}finally{setSaving(false);}
  }}>
    <Typography.Title heading={6}>基本信息</Typography.Title>
    <div className="materials-field-grid">
      {field('模型展示名'+(readOnly?'':' *'),form.name,value=>change('name',value))}
      {slot('模型 Logo',<Space vertical align="start">{form.profile.logo?<img className="materials-logo-preview" src={form.profile.logo} alt="模型 Logo"/>:readOnly?<Typography.Text type="tertiary">未填写</Typography.Text>:null}{!readOnly && <Space><Upload accept="image/png,image/jpeg,image/webp" uploadTrigger="custom" fileList={[]} showUploadList={false} disabled={!editable || uploading} onFileChange={logoUpload}><Button icon={<IconUpload aria-hidden/>} loading={uploading} disabled={!editable}>{form.profile.logo?'更换图片':'上传图片'}</Button></Upload>{form.profile.logo && <Button type="danger" theme="borderless" disabled={!editable} onClick={()=>{version.current++;setUploading(false);profileChange('logo','');}}>移除图片</Button>}</Space>}{!readOnly && <Typography.Text type="tertiary" size="small">PNG、JPEG、WebP，最大 1 MB</Typography.Text>}</Space>)}
      {slot('模型类型',readOnly?<Typography.Text>{MODEL_CATALOGUE_TYPES[modelCategory(form.type)]}</Typography.Text>:<Select aria-label="模型类型" value={modelCategory(form.type)} optionList={optionList(Object.entries(MODEL_CATALOGUE_TYPES))} disabled={!editable} onChange={value=>change('type',value==='visual'?'image':value)}/>)}
      {modelCategory(form.type)==='visual' && slot('视觉任务类型',readOnly?<Typography.Text>{form.type==='video'?'视频':'图像'}</Typography.Text>:<Select aria-label="视觉任务类型" value={form.type} optionList={optionList([['image','图像'],['video','视频']])} disabled={!editable} onChange={value=>change('type',value)}/>)}
      {field('规范模型标识'+(readOnly?'':' *'),form.modelId,value=>change('modelId',value),{readOnly:Boolean(model)})}
      {fields([...PRESENTATION_FIELDS.filter(item=>item.key==='author'),...IDENTITY_FIELDS.filter(item=>['family','version','releaseDate'].includes(item.key))])}
      {slot('简短介绍',readOnly?<Typography.Text>{display(form.description)}</Typography.Text>:<TextArea aria-label="简短介绍" rows={3} value={form.description} disabled={!editable} onChange={value=>change('description',value)}/>,'description',true)}
    </div>
    <Collapse keepDOM>
      <Collapse.Panel header="模态与任务" itemKey="modalities"><div className="materials-field-grid">{fields([...COMMON_FIELDS,...PRESENTATION_FIELDS.filter(item=>['languages','scenarios'].includes(item.key))])}</div></Collapse.Panel>
      <Collapse.Panel header="调用能力" itemKey="capabilities"><div className="materials-field-grid">{capabilities}{fields(FEATURE_FIELDS.filter(item=>['text','multimodal'].includes(form.type) || item.key==='batch'))}{fields(specificationFields(form.type,form.usageUnit,form.profile))}</div></Collapse.Panel>
      <Collapse.Panel header="支持参数" itemKey="parameters"><div className="materials-field-grid">{fields(INTERFACE_FIELDS)}</div></Collapse.Panel>
      <Collapse.Panel header="技术与来源" itemKey="source"><div className="materials-field-grid">{slot('资料来源',<Typography.Text>{sourceLabel}</Typography.Text>)}{fields(TECHNICAL_FIELDS)}{fields(IDENTITY_FIELDS.filter(item=>['lifecycle','retirementDate','replacement'].includes(item.key)))}{fields(RECORD_FIELDS)}{slot('详细介绍',readOnly?<Typography.Text>{display(form.profile.detailDescription)}</Typography.Text>:<TextArea aria-label="详细介绍" rows={4} value={form.profile.detailDescription || ''} disabled={!editable} onChange={value=>profileChange('detailDescription',value)}/>,'detailDescription',true)}</div></Collapse.Panel>
    </Collapse>
    {error && <Banner type="danger" description={error}/>}
    <div className="materials-form-footer"><Button onClick={onCancel}>{readOnly?'关闭':'取消'}</Button>{!readOnly && <Button htmlType="submit" theme="solid" loading={saving} disabled={!editable || uploading}>保存</Button>}</div>
  </Form>;
}
