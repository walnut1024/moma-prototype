import {Banner, Button, Typography} from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import MaterialsHeader, {materialOperationsUi} from './MaterialsHeader';
import MaterialCatalogue, {NewMaterialButton} from './MaterialCatalogue';
import ModelMaterialDrawer from './ModelMaterialDrawer';
import ModelBatchImport from './ModelBatchImport';
import {useOperations} from './ModelOperationsUI';
import {libraryRecord,modelLibrary} from './model-operations';
import {operationsReturn} from './model-pricing-workspace';
import {supplierMaterialReturn} from './supplier-model-registration';
import {validListingReturn} from './supplier-listing';

export default function ModelMaterials(props) {
  const {state}=props,ops=useOperations({...props,...materialOperationsUi},'model-templates'),{params,go}=ops;
  const view=params.get('view') || 'templates',template=libraryRecord(state,params.get('template'));
  const returnFromLibrary=(id,saved=false)=>{
    const target=operationsReturn(params.get('returnTo')) || supplierMaterialReturn(params.get('returnProvider'),saved?id:null) || validListingReturn(params.get('returnListing'));
    if(target){ops.proceed(()=>{location.hash=target;});return;}
    if(params.get('returnModel')){go({model:params.get('returnModel')},{base:'listing',reset:true,saved});return;}
    if(params.get('returnDraft')){go({view:'add',draft:params.get('returnDraft'),library:id || params.get('library'),step:'metadata'},{base:'listing',reset:true,saved});return;}
    go({view:'templates',template:null,materialMode:null,drawerSide:null},{saved,preserveScroll:true});
  };
  const fromElsewhere=['returnTo','returnProvider','returnListing','returnModel','returnDraft'].some(key=>params.has(key));
  return <div className="semi-materials materials-page">
    {view==='templateImport'?<><Typography.Title heading={4}>批量导入模型资料</Typography.Title><section className="materials-description"><ModelBatchImport mode="template" state={{...state,models:modelLibrary(state)}} can={ops.can} dirty={ops.dirty} run={async(_operation,data)=>await ops.run('templateImport',data)} close={saved=>go({view:'templates'},{saved:saved===true})}/></section></>:<>
      <MaterialsHeader active="model-templates" ops={ops}>{supplierMaterialReturn(params.get('returnProvider')) && <Button onClick={()=>returnFromLibrary()}>返回服务商接入</Button>}<Button disabled={!ops.can} onClick={()=>go({view:'templateImport'})}>批量导入模型资料</Button><NewMaterialButton ops={ops}/></MaterialsHeader>
      <MaterialCatalogue state={state} ops={ops}/>
      {view==='template' && (params.get('template') && !template?<Modal visible className="semi-materials" title="模型资料不存在" footer={null} onCancel={()=>returnFromLibrary()}><Banner type="danger" description="该模型资料可能已移除。"/></Modal>:<ModelMaterialDrawer state={state} record={template} ops={ops} initial={state.modelOnboardings.find(row=>row.id===params.get('returnDraft'))?.model || {modelId:params.get('code') || '',name:params.get('code') || ''}} onClose={()=>returnFromLibrary(template?.id)} onSaved={(_next,id)=>fromElsewhere?returnFromLibrary(id,true):go({template:id,materialMode:'view'},{saved:true,replace:true,preserveScroll:true})}/>)}
    </>}
    {ops.error && view!=='template' && <Banner type="danger" description={ops.error}/>}{ops.leaveDialog}
  </div>;
}
