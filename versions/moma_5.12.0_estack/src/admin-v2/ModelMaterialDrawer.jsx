import {useLayoutEffect, useRef} from 'react';
import {Button, SideSheet, Space, Typography} from '@douyinfe/semi-ui';
import ModelLibraryEditor from './ModelLibraryEditor';

export default function ModelMaterialDrawer({state,record,ops,initial,onClose,onSaved}) {
  const editing=!record || ops.params.get('materialMode')!=='view';
  const body=useRef(null),scroll=useRef(0),opened=useRef(false);
  const changeMode=mode=>{
    scroll.current=body.current?.scrollTop || 0;
    ops.go({materialMode:mode},{saved:true,replace:true,preserveScroll:true});
  };
  useLayoutEffect(()=>{
    if(body.current){body.current.scrollTop=scroll.current;if(opened.current)body.current.focus({preventScroll:true});}
    opened.current=true;
  },[editing]);
  return <SideSheet visible className="semi-materials" title={<Space><Typography.Text strong>{record?.name || '新建模型资料'}</Typography.Text>{!editing && <Button disabled={!ops.can} onClick={()=>changeMode('edit')}>编辑</Button>}</Space>} placement={ops.params.get('drawerSide')==='left'?'left':'right'} width="min(880px, 100vw)" closeOnEsc onCancel={onClose} bodyStyle={{overflow:'hidden',padding:24}}>
    <div ref={body} className="materials-editor-body" tabIndex={-1}><ModelLibraryEditor key={`${record?.id || 'new'}:${editing?'edit':record?.updatedAt}`} state={state} record={record} initial={initial} onboardingId={ops.params.get('returnDraft')} ops={ops} readOnly={!editing} scrollable onCancel={record && editing?()=>ops.proceed(()=>changeMode('view')):onClose} onSaved={(next,id)=>{scroll.current=body.current?.scrollTop || 0;onSaved(next,id);}}/></div>
  </SideSheet>;
}
