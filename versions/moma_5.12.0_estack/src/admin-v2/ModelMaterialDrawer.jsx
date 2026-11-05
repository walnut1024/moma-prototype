import {useLayoutEffect, useRef} from 'react';
import {Button} from '../components/ui/button';
import {Modal} from './ModelOperationsUI';
import ModelLibraryEditor from './ModelLibraryEditor';

export default function ModelMaterialDrawer({state,record,ops,initial,onClose,onSaved}) {
  const editing=!record || ops.params.get('materialMode')!=='view';
  const body=useRef(null),scroll=useRef(0),opened=useRef(false);
  const changeMode=mode=>{
    scroll.current=body.current?.querySelector('.mm-form-scroll')?.scrollTop || 0;
    ops.go({materialMode:mode},{saved:true,replace:true,preserveScroll:true});
  };
  useLayoutEffect(()=>{
    const content=body.current?.querySelector('.mm-form-scroll');
    if(content){content.scrollTop=scroll.current;if(opened.current)content.focus({preventScroll:true});}
    opened.current=true;
  },[editing]);
  return <Modal drawer drawerSide={ops.params.get('drawerSide')==='left'?'left':'right'} className="mo-material-drawer" title={record?.name || '新建模型资料'} description={record?.modelId || '模型资料'} onClose={onClose} headerActions={!editing && <Button variant="outline" disabled={!ops.can} onClick={()=>changeMode('edit')}>编辑</Button>}>
    <div ref={body} className="mo-material-content"><ModelLibraryEditor key={`${record?.id || 'new'}:${editing?'edit':record?.updatedAt}`} state={state} record={record} initial={initial} onboardingId={ops.params.get('returnDraft')} ops={ops} readOnly={!editing} scrollable onCancel={record && editing?()=>ops.proceed(()=>changeMode('view')):onClose} onSaved={(next,id)=>{scroll.current=body.current?.querySelector('.mm-form-scroll')?.scrollTop || 0;onSaved(next,id);}}/></div>
  </Modal>;
}
