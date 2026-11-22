import {Banner, Typography} from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import MaterialsHeader, {materialOperationsUi} from './MaterialsHeader';
import MaterialCatalogue from './MaterialCatalogue';
import ModelClassificationDictionary from './ModelClassificationDictionary';
import {classificationKind} from './model-classification';
import ModelMaterialDrawer from './ModelMaterialDrawer';
import ModelBatchImport from './ModelBatchImport';
import {useOperations} from './ModelOperationsUI';
import {modelMaterial} from './model-library';
import {operationsReturn} from './model-pricing-workspace';

export default function ModelMaterials(props) {
  const {state}=props,ops=useOperations({...props,...materialOperationsUi},'model-templates'),{params,go}=ops;
  const view=params.get('view') || 'templates',template=modelMaterial(state,params.get('template'));
  const kind=view==='classification' ? classificationKind(params) : null;
  const returnFromLibrary=(saved=false)=>{
    const target=operationsReturn(params.get('returnTo'));
    if(target){ops.proceed(()=>{location.hash=target;});return;}
    go({view:'templates',template:null,materialMode:null,materialTab:null,drawerSide:null},{saved,preserveScroll:true});
  };
  const fromElsewhere=Boolean(operationsReturn(params.get('returnTo')));
  return <div className="semi-materials materials-page">
    {view==='templateImport'?<><Typography.Title heading={4}>批量导入模型资料</Typography.Title><section className="materials-description"><ModelBatchImport kind="model" state={state} ops={ops} transact={props.transact} close={saved=>go({view:'templates'},{saved:saved===true})}/></section></>:<>
      <MaterialsHeader active={kind || 'model-templates'} ops={ops}/>
      {kind ? <ModelClassificationDictionary key={kind} kind={kind} state={state} ops={ops}/> : <>
        <MaterialCatalogue state={state} ops={ops}/>
        {view==='template' && (params.get('template') && !template?<Modal visible className="semi-materials" title="模型资料不存在" footer={null} onCancel={()=>returnFromLibrary()}><Banner type="danger" description="该模型资料可能已移除。"/></Modal>:<ModelMaterialDrawer state={state} record={template} ops={ops} initial={{modelId:params.get('code') || '',name:params.get('code') || ''}} onClose={()=>returnFromLibrary()} onSaved={(_next,id)=>fromElsewhere?returnFromLibrary(true):go({template:id,materialMode:'view'},{saved:true,replace:true,preserveScroll:true})}/>)}
      </>}
    </>}
    {ops.error && view!=='template' && <Banner type="danger" description={ops.error}/>}{ops.leaveDialog}
  </div>;
}
