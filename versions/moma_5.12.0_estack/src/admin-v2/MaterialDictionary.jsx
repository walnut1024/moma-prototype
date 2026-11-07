import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import {useEffect, useRef, useState} from 'react';
import { Banner, Button, Form, Input, Modal, Space, Typography } from '@douyinfe/semi-ui';
import {IconPlus, IconSearch} from '@douyinfe/semi-icons';
import {TARIFF_KINDS, tariffDictionaryEntries, tariffDictionaryId} from './tariff-dictionary';

function DictionaryEditor({entry,kind,ops,close}) {
  const [value,setValue]=useState({name:entry?.name || '',englishName:entry?.englishName || '',code:entry?.code || '',description:entry?.description || ''});
  const [saving,setSaving]=useState(false);
  const change=(key,input)=>{setValue(current=>({...current,[key]:input}));ops.dirty(true);ops.setError('');};
  const cancel=()=>ops.proceed(close);
  return <Modal visible className="semi-materials" title={entry?'编辑'+TARIFF_KINDS[kind]:kind==='unit'?'新增单位':'新增'+TARIFF_KINDS[kind]} onCancel={cancel} footer={null}>
    <Typography.Paragraph type="secondary">{kind==='scenario'?'成本与售价共用此计费项。已被引用的名称不能更改。':'用于采购与平台售价。已被引用的名称、单位及货币代码不能更改；停用后已有配置和历史保留。'}</Typography.Paragraph>
    <Form onSubmit={async()=>{if(saving || !ops.can)return;setSaving(true);try{if(await ops.run('tariffDictionary',{operation:'save',id:entry?.id,kind,...value}))close();}finally{setSaving(false);}}}>
      <Form.Slot label={kind==='scenario'?'计费项名称':'中文名称'}><Input aria-label={kind==='scenario'?'计费项名称':'中文名称'} maxLength={kind==='unit'?40:80} value={value.name} disabled={!ops.can} onChange={input=>change('name',input)}/></Form.Slot>
      {kind!=='scenario' && <Form.Slot label="英文名称"><Input aria-label="英文名称" maxLength={80} value={value.englishName} disabled={!ops.can} onChange={input=>change('englishName',input)}/></Form.Slot>}
      {kind==='scenario' && <><Form.Slot label="计费说明"><Input aria-label="计费说明" maxLength={160} value={value.description} disabled={!ops.can} onChange={input=>change('description',input)}/></Form.Slot></>}
      {kind==='currency' && <Form.Slot label="货币代码"><Input aria-label="货币代码" maxLength={3} placeholder="ISO 4217 代码，如 CNY、USD" value={value.code} disabled={!ops.can} onChange={input=>change('code',input.toUpperCase())}/></Form.Slot>}
      {ops.error && <Banner type="danger" description={ops.error}/>}
      <div className="materials-form-footer"><Button onClick={cancel}>取消</Button><Button htmlType="submit" theme="solid" loading={saving} disabled={!ops.can}>保存字典项</Button></div>
    </Form>
  </Modal>;
}

export default function MaterialDictionary({state,ops,kind}) {
  const [query,setQuery]=useState(''),[editing,setEditing]=useState(null),[removing,setRemoving]=useState(null),[ids,setIds]=useState({}),[idError,setIdError]=useState(''),[busy,setBusy]=useState(false);
  const trigger=useRef(null),entries=tariffDictionaryEntries(state),label=TARIFF_KINDS[kind];
  useEffect(()=>{let active=true;Promise.all(tariffDictionaryEntries(state).filter(row=>row.kind!=='scenario').map(async row=>[row.id,await tariffDictionaryId(row.id)])).then(rows=>{if(active)setIds(Object.fromEntries(rows));}).catch(()=>{if(active)setIdError('字典 ID 加载失败，请刷新后重试。');});return()=>{active=false;};},[state.tariffDictionary]);
  const rows=entries.filter(row=>row.kind===kind && [row.name,kind==='scenario'?'':row.englishName,row.code,ids[row.id]].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const close=()=>{setEditing(null);setRemoving(null);ops.setError('');requestAnimationFrame(()=>trigger.current?.isConnected && trigger.current.focus());};
  const columns=[
    {title:kind==='scenario'?'计费项名称':'名称',width:280,render:(_,row)=>kind==='scenario'?<Typography.Text strong>{row.name}</Typography.Text>:<Space vertical align="start" spacing={2}><Typography.Text strong>{row.name}</Typography.Text><Typography.Text type="tertiary" size="small">{row.englishName}</Typography.Text></Space>},
    ...(kind==='scenario'?[]:[{title:label+' ID',width:230,render:(_,row)=><Typography.Text className="materials-code" copyable={Boolean(ids[row.id])}>{ids[row.id] || '—'}</Typography.Text>}]),
    ...(kind==='currency'?[{title:'货币代码',dataIndex:'code',width:120}]:[]),
    {title:'来源',width:100,render:(_,row)=>row.builtin?'内置':'自定义'},
    ...(kind==='scenario'?[]:[{title:'状态',width:110,render:(_,row)=><AdminStatus value={row.status}/>}]),
    {title:'操作',width:220,fixed:'right',render:(_,row)=>row.builtin?<Typography.Text type="tertiary">内置只读</Typography.Text>:<Space><Button theme="borderless" disabled={!ops.can} aria-label={'编辑 '+row.name} onClick={event=>{trigger.current=event.currentTarget;ops.setError('');setEditing({entry:row,kind});}}>编辑</Button>{kind!=='scenario' && <Button theme="borderless" disabled={!ops.can || busy} aria-label={(row.status==='已启用'?'停用 ':'启用 ')+row.name} onClick={async()=>{setBusy(true);try{await ops.run('tariffDictionary',{operation:'status',id:row.id,status:row.status==='已启用'?'已停用':'已启用'});}finally{setBusy(false);}}}>{row.status==='已启用'?'停用':'启用'}</Button>}<Button type="danger" theme="borderless" disabled={!ops.can} aria-label={'删除 '+row.name} onClick={event=>{trigger.current=event.currentTarget;ops.setError('');setRemoving(row);}}>删除</Button></Space>},
  ];
  return <>
    <div className="materials-toolbar"><div className="materials-filters"><Input prefix={<IconSearch aria-hidden/>} showClear aria-label={'搜索'+label} placeholder={kind==='scenario'?'搜索计费项名称':'搜索'+label+'名称、英文或 ID'} value={query} onChange={setQuery}/></div><Button theme="solid" icon={<IconPlus aria-hidden/>} disabled={!ops.can} onClick={event=>{trigger.current=event.currentTarget;ops.setError('');setEditing({kind});}}>{kind==='unit'?'新增单位':'新增'+label}</Button></div>
    {idError && <Banner type="danger" description={idError}/>}
    <Table rowKey="id" columns={columns} dataSource={rows} scroll={{x:kind==='scenario'?700:1000,y:'calc(100vh - 365px)'}} pagination={false} empty={'没有符合条件的'+label}/>
    {editing && <DictionaryEditor key={editing.entry?.id || kind} {...editing} ops={ops} close={close}/>}
    <Modal visible={Boolean(removing)} className="semi-materials" title="删除自定义字典项" onCancel={close} okText="确认删除" cancelText="取消" confirmLoading={busy} okButtonProps={{type:'danger',disabled:!ops.can}} onOk={async()=>{setBusy(true);try{if(await ops.run('tariffDictionary',{operation:'delete',id:removing.id}))close();}finally{setBusy(false);}}}>
      <Typography.Paragraph>确认删除“{removing?.name}”？仅可删除未被价格、草稿或计费项引用的条目。{kind!=='scenario' && '已有历史引用时，可改为停用。'}</Typography.Paragraph>{ops.error && <Banner type="danger" description={ops.error}/>}
    </Modal>
  </>;
}
