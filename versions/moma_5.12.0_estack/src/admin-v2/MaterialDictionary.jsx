import Table from './AdminTable';
import {useId, useRef, useState} from 'react';
import { Tag, Button, Form, Input, Space, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import {IconPlus, IconSearch} from '@douyinfe/semi-icons';
import {TARIFF_KINDS, tariffDictionaryEntries} from './tariff-dictionary';

function DictionaryEditor({entry,kind,ops,close}) {
  const formId = useId();
  const [value,setValue]=useState({name:entry?.name || '',englishName:entry?.englishName || '',code:entry?.code || '',description:entry?.description || ''});
  const [saving,setSaving]=useState(false);
  const change=(key,input)=>{setValue(current=>({...current,[key]:input}));ops.dirty(true);ops.setError('');};
  const cancel=()=>ops.proceed(close);
  return <Modal visible className="semi-materials" title={entry?'编辑'+TARIFF_KINDS[kind]:kind==='unit'?'新增计费单位':'新增货币'} onCancel={cancel} footer={<><Button onClick={cancel}>取消</Button><Button form={formId} htmlType="submit" theme="solid" loading={saving} disabled={!ops.can}>保存字典项</Button></>}>
    <Typography.Paragraph type="secondary">{kind==='scenario'?'成本与售价共用此计费项。已被引用的名称不能更改。':'用于采购与平台售价。已被引用的名称、单位及货币代码不能更改；停止选用后已有配置和历史保留。'}</Typography.Paragraph>
    <Form id={formId} onSubmit={async()=>{if(saving || !ops.can)return;setSaving(true);try{if(await ops.run('tariffDictionary',{operation:'save',id:entry?.id,kind,...value}))close();}finally{setSaving(false);}}}>
      <Form.Slot label={kind==='scenario'?'计费项名称':'中文名称'}><Input aria-label={kind==='scenario'?'计费项名称':'中文名称'} maxLength={kind==='unit'?40:80} value={value.name} disabled={!ops.can} onChange={input=>change('name',input)}/></Form.Slot>
      {kind!=='scenario' && <Form.Slot label="英文名称"><Input aria-label="英文名称" maxLength={80} value={value.englishName} disabled={!ops.can} onChange={input=>change('englishName',input)}/></Form.Slot>}
      {kind==='scenario' && <><Form.Slot label="计费说明"><Input aria-label="计费说明" maxLength={160} value={value.description} disabled={!ops.can} onChange={input=>change('description',input)}/></Form.Slot></>}
      {kind==='currency' && <Form.Slot label="货币代码"><Input aria-label="货币代码" maxLength={3} placeholder="ISO 4217 代码，如 CNY、USD" value={value.code} disabled={!ops.can} onChange={input=>change('code',input.toUpperCase())}/></Form.Slot>}
      {ops.error && <Banner type="danger" description={ops.error}/>}
    </Form>
  </Modal>;
}

export default function MaterialDictionary({state,ops,kind}) {
  const [query,setQuery]=useState(''),[editing,setEditing]=useState(null),[removing,setRemoving]=useState(null),[page,setPage]=useState(1),[busy,setBusy]=useState(false);
  const trigger=useRef(null),entries=tariffDictionaryEntries(state),label=TARIFF_KINDS[kind];
  const rows=entries.filter(row=>row.kind===kind && [row.name,kind==='scenario'?'':row.englishName,row.code].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const pageSize = 20;
  const currentPage = Math.min(page, Math.ceil(rows.length / pageSize) || 1);
  const close=()=>{setEditing(null);setRemoving(null);ops.setError('');requestAnimationFrame(()=>trigger.current?.isConnected && trigger.current.focus());};
  const columns=[
    {title:kind==='scenario'?'计费项名称':kind==='unit'?'单位名称':'货币名称',width:230,render:(_,row)=><Space><Typography.Text strong>{row.name}</Typography.Text>{kind!=='scenario' && row.status==='已停用' && <Tag>已停止选用</Tag>}</Space>},
    ...(kind==='currency'?[{title:'货币代码',dataIndex:'code',width:120}]:[]),
    {title:'来源',width:100,render:(_,row)=>row.builtin?'内置':'自定义'},
    {title:'操作',width:220,fixed:'right',render:(_,row)=>row.builtin?<Typography.Text type="tertiary">—</Typography.Text>:<Space><Button theme="borderless" disabled={!ops.can} aria-label={'编辑 '+row.name} onClick={event=>{trigger.current=event.currentTarget;ops.setError('');setEditing({entry:row,kind});}}>编辑</Button>{kind!=='scenario' && <Button theme="borderless" disabled={!ops.can || busy} aria-label={(row.status==='已启用'?'停止选用 ':'恢复选用 ')+row.name} onClick={async()=>{setBusy(true);try{await ops.run('tariffDictionary',{operation:'status',id:row.id,status:row.status==='已启用'?'已停用':'已启用'});}finally{setBusy(false);}}}>{row.status==='已启用'?'停止选用':'恢复选用'}</Button>}<Button type="danger" theme="borderless" disabled={!ops.can} aria-label={'删除 '+row.name} onClick={event=>{trigger.current=event.currentTarget;ops.setError('');setRemoving(row);}}>删除</Button></Space>},
  ];
  return <>
    <div className="materials-toolbar">
      <div className="materials-filters"><Input prefix={<IconSearch aria-hidden/>} showClear aria-label={'搜索'+label} placeholder={kind==='scenario'?'搜索计费项名称':kind==='unit'?'搜索单位名称或英文名':'搜索货币名称、英文名或代码'} value={query} onChange={value=>{setQuery(value);setPage(1);}}/></div>
      {kind!=='scenario' && <Button className="materials-toolbar-actions" theme="solid" icon={<IconPlus aria-hidden/>} disabled={!ops.can} onClick={event=>{trigger.current=event.currentTarget;ops.setError('');setEditing({kind});}}>{kind==='unit'?'新增计费单位':'新增货币'}</Button>}
    </div>
    <Table rowKey="id" columns={columns} dataSource={rows.slice((currentPage-1)*pageSize,currentPage*pageSize)} scroll={{x:kind==='currency'?'max(100%, 670px)':'max(100%, 550px)'}}
      pagination={{currentPage,pageSize,total:rows.length,onPageChange:setPage}} empty={'没有符合条件的'+label}/>
    {editing && <DictionaryEditor key={editing.entry?.id || kind} {...editing} ops={ops} close={close}/>}
    <Modal visible={Boolean(removing)} className="semi-materials" title="删除自定义字典项" onCancel={close} okText="确认删除" cancelText="取消" confirmLoading={busy} okButtonProps={{type:'danger',disabled:!ops.can}} onOk={async()=>{setBusy(true);try{if(await ops.run('tariffDictionary',{operation:'delete',id:removing.id}))close();}finally{setBusy(false);}}}>
      <Typography.Paragraph>确认删除“{removing?.name}”？仅可删除未被价格、草稿或计费项引用的条目。{kind!=='scenario' && '已有历史引用时，可停止选用。'}</Typography.Paragraph>{ops.error && <Banner type="danger" description={ops.error}/>}
    </Modal>
  </>;
}
