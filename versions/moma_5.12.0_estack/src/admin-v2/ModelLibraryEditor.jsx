import Table from './AdminTable';
import { useRef, useState } from 'react';
import { Banner, Button } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import MaterialMetadataForm from './MaterialMetadataForm';

import { materialBase } from './model-operations';
import { IDENTITY_FIELDS, TECHNICAL_FIELDS, PRESENTATION_FIELDS, COMMON_FIELDS, INTERFACE_FIELDS, RECORD_FIELDS, FEATURE_FIELDS, specificationFields } from './model-profile';

function MaterialChanges({record,value}) {
  const fields=[['name','模型展示名称'],['maker','模型作者'],['type','模型类型'],['description','模型中文简介'],['usageUnit','计量单位']];
  const labels={logo:'模型图标',precision:'模型精度',parameters:'参数量（B）',releaseDate:'模型发布日期'};
  const rows=[...fields.map(([key,label])=>[label,record[key],value[key]]),...['context','output','streaming','tools'].map((key,index)=>[['上下文窗口','最大输出 Token 数','流式响应','工具调用'][index],record.capabilities?.[key],value.capabilities?.[key]]),...[...IDENTITY_FIELDS,...TECHNICAL_FIELDS,...PRESENTATION_FIELDS,...COMMON_FIELDS,...INTERFACE_FIELDS,...RECORD_FIELDS,...FEATURE_FIELDS,...specificationFields(value.type,value.usageUnit,value.profile),{key:'descriptionEn',label:'模型英文简介'},{key:'tags',label:'模型标签'}].map(({key,label})=>[labels[key] || label,record.profile?.[key],value.profile?.[key]])].filter((row,index,all)=>JSON.stringify(row[1] ?? '')!==JSON.stringify(row[2] ?? '') && all.findIndex(item=>item[0]===row[0])===index);
  const display=value=>Array.isArray(value)?value.join('、'):value==null || value===''?'未填写':typeof value==='boolean'?value?'支持':'不支持':typeof value==='object'?JSON.stringify(value):String(value);
  return <Table size="small" pagination={false} rowKey="field" dataSource={rows.map(([label,before,after])=>({field:label,before:label==='模型图标'&&before?'原图片':display(before),after:label==='模型图标'&&after?'图片已变更':display(after)}))} columns={[{title:'字段',dataIndex:'field'},{title:'修改前',dataIndex:'before'},{title:'修改后',dataIndex:'after'}]}/>;
}

export default function ModelLibraryEditor({ state, record, initial, onboardingId, ops, onSaved, onCancel, readOnly = false, footerTarget }) {
  const base = useRef(record && materialBase(state, record));
  const [preview, setPreview] = useState(null);
  const save = async value => { const next = await ops.run('templateSave', { ...value, onboardingId }); if (next) onSaved(next, next.audits[0].objectId); return next; };
  const inspect = value => setPreview(value);
  return <>
    <MaterialMetadataForm state={state} reload={ops.reload} conflict={ops.conflict} footerTarget={footerTarget} key={record?.id || 'new'} model={record} initial={initial} readOnly={readOnly} can={ops.can} dirty={ops.dirty} onCancel={onCancel} onSubmit={record ? inspect : save}/>
    {ops.error && <Banner type="danger" description={ops.error}/>}
    {preview && <Modal visible className="semi-materials" title="确认资料变更" onCancel={() => setPreview(null)}
      footer={<><Button theme="light" onClick={() => setPreview(null)}>返回修改</Button><Button disabled={!ops.can} onClick={async () => {
        const next = await ops.run('templatePublish', { id: record.id, value: preview, expectedBase: base.current, confirmed: true });
        if (next) { setPreview(null); onSaved(next, record.id); }
      }}>确认保存</Button></>}>
      <MaterialChanges record={record} value={preview}/>
      {ops.error && <Banner type="danger" description={ops.error}/>}
    </Modal>}
  </>;
}
