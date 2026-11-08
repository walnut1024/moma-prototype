import {useLayoutEffect, useRef, useState} from 'react';
import {Button, Space, Tabs, Typography} from '@douyinfe/semi-ui';
import { AdminSideSheet as SideSheet } from './AdminOverlay';
import ModelLibraryEditor from './ModelLibraryEditor';
import Table from './AdminTable';
import MaterialLogo from './MaterialLogo';
import SupplyRegistrationDialog from './SupplyRegistrationDialog';
import { providerCode, PROVIDER_TYPES } from './provider-management';
import { materialChannelCount, materialSource, modelMaterialProviders, viewMaterialChannels } from './provider-materials';

function ModelSuppliers({ state, model, ops }) {
  const [registering, setRegistering] = useState(false);
  const trigger = useRef(null);
  const rows = modelMaterialProviders(state, model.id);
  return <>
    <div className="materials-toolbar"><Button theme="solid" disabled={!ops.can} onClick={event => {
      trigger.current = event.currentTarget; setRegistering(true);
    }}>关联服务商</Button></div>
    <Table rowKey={row => row.owner.id} dataSource={rows} scroll={{ x: 'max(100%, 740px)' }} empty="暂无供应服务商" columns={[
      { title: '服务商名称', width: 180, render: (_, { owner }) => <Button theme="borderless" onClick={() =>
        ops.go({ provider: owner.id, returnTo: materialSource(location.hash) }, { base: 'provider-materials', reset: true })}>{owner.name}</Button> },
      { title: '服务商编码', width: 130, render: (_, { owner }) => <Typography.Text className="materials-code">{providerCode(owner)}</Typography.Text> },
      { title: '服务商 Logo', width: 100, render: (_, { owner }) => <MaterialLogo key={owner.logo || ''} src={owner.logo} alt={owner.name + '的服务商 Logo'}/> },
      { title: '供给类型', width: 130, render: (_, { owner }) => PROVIDER_TYPES[owner.sourceType] || '—' },
      { title: '渠道数', align: 'right', width: 80, render: (_, row) => materialChannelCount(row) },
      { title: '操作', width: 110, render: (_, { owner }) => <Button theme="borderless" onClick={() => viewMaterialChannels(ops, owner.id, model.id)}>查看渠道</Button> },
    ]}/>
    {registering && <SupplyRegistrationDialog state={state} ops={ops} model={model} close={() => {
      setRegistering(false);
      ops.setError('');
      requestAnimationFrame(() => trigger.current?.focus());
    }}/>}
  </>;
}

export default function ModelMaterialDrawer({state,record,ops,initial,onClose,onSaved}) {
  const [footerTarget, setFooterTarget] = useState(null);
  const editing=!record || ops.params.get('materialMode')!=='view';
  const suppliers = !editing && ops.params.get('materialTab') === 'suppliers';
  const body=useRef(null),scroll=useRef(0),opened=useRef(false);
  const changeMode=mode=>{
    scroll.current=body.current?.scrollTop || 0;
    ops.go({materialMode:mode,materialTab:null},{saved:true,replace:true,preserveScroll:true});
  };
  useLayoutEffect(()=>{
    if(body.current){body.current.scrollTop=scroll.current;if(opened.current)body.current.focus({preventScroll:true});}
    opened.current=true;
  },[editing]);
  const metadata = <ModelLibraryEditor footerTarget={footerTarget} key={`${record?.id || 'new'}:${editing?'edit':record?.updatedAt}`}
    state={state} record={record} initial={initial} onboardingId={ops.params.get('returnDraft')} ops={ops} readOnly={!editing} scrollable
    onCancel={record && editing ? () => ops.proceed(() => changeMode('view')) : onClose}
    onSaved={(next,id) => { scroll.current=body.current?.scrollTop || 0; onSaved(next,id); }}/>;
  return <SideSheet visible className="semi-materials" label={record?.name || '新建模型资料'} title={<Space><Typography.Text strong>{record?.name || '新建模型资料'}</Typography.Text>{!editing && !suppliers && <Button disabled={!ops.can} onClick={()=>changeMode('edit')}>编辑</Button>}</Space>} placement={ops.params.get('drawerSide')==='left'?'left':'right'} width="min(880px, 100vw)" closeOnEsc onCancel={onClose} footer={suppliers ? null : <div className="admin-sheet-actions" ref={setFooterTarget}/>} bodyStyle={{overflow:'hidden',padding:24}}>
    <div ref={body} className="materials-editor-body" tabIndex={-1}>
      {editing ? metadata : <Tabs activeKey={suppliers ? 'suppliers' : 'profile'}
        onChange={tab => ops.go({ materialTab: tab === 'suppliers' ? tab : null }, { preserveScroll: true })} aria-label="模型详情">
        <Tabs.TabPane itemKey="profile" tab="模型资料">{!suppliers && metadata}</Tabs.TabPane>
        <Tabs.TabPane itemKey="suppliers" tab="供应服务商">{suppliers && <ModelSuppliers state={state} model={record} ops={ops}/>}</Tabs.TabPane>
      </Tabs>}
    </div>
  </SideSheet>;
}
