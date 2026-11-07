import { Button } from '../components/ui/button';
import { Heading, Notice, GridTable, Row, Cell } from './ModelOperationsUI';
import { guidedOnboarding, pendingGuidedOnboardings } from './guided-onboarding';
import { routingServices } from './service-routing';

export default function ModelOnboarding({ state, ops, home }) {
  const id=ops.params.get('draft'),context=id?guidedOnboarding(state,id):null;
  const go=(base,params)=>ops.go({...params,returnTo:location.hash},{base,reset:true});
  if(id && !context)return <Notice error>接入记录不存在或已放弃。<Button variant="link" onClick={home}>返回模型服务</Button></Notice>;
  if(!context)return <><Heading title="接入记录"><Button variant="outline" onClick={home}>返回模型服务</Button><Button onClick={()=>go('providers',{})}>前往渠道接入</Button></Heading><GridTable headings={['模型','服务商','操作']} empty={!pendingGuidedOnboardings(state).length} emptyMessage="暂无待继续的接入记录。">{pendingGuidedOnboardings(state).map(task=><Row key={task.draft.id}><Cell>{task.master?.name || '待登记资料'}</Cell><Cell>{task.provider?.name || '待配置'}</Cell><Cell><Button variant="link" onClick={()=>ops.go({view:'onboarding',draft:task.draft.id},{reset:true})}>继续配置</Button></Cell></Row>)}</GridTable></>;
  const {model,master,provider,association,endpoint}=context;
  const service=model && routingServices(state).find(row=>row.modelId===model.id && (!row.providerId || row.providerId===provider?.id));
  return <><Heading title={master?.name || '继续配置模型'}><Button variant="outline" onClick={home}>返回模型服务</Button></Heading>
    <Notice>接入记录和历史保留。各项配置从对应模块维护，内部使用可跳过售价与销售。</Notice>
    <GridTable headings={['配置','当前对象','操作']}>
      <Row><Cell>渠道接入</Cell><Cell>{provider?.name || '待配置'} · {endpoint?.name || '待配置渠道'}</Cell><Cell><Button variant="link" onClick={()=>go('providers',{provider:provider?.id,perspective:'suppliers',tab:'catalogue'})}>维护渠道</Button></Cell></Row>
      <Row><Cell>模型资料</Cell><Cell>{master?.name || '待登记'}</Cell><Cell><Button variant="link" onClick={()=>go('model-templates',{view:'template',template:master?.id,materialMode:'edit',returnListing:location.hash})}>维护资料</Button></Cell></Row>
      <Row><Cell>模型服务</Cell><Cell>{model?`${model.callsEnabled?'已启用':'已停用'} · ${model.modelId}`:'待创建'}</Cell><Cell><Button variant="link" disabled={!master} onClick={()=>go('listing',model?{model:model.id,panel:'routing',returnOnboarding:id}:{view:'add',sourceLibrary:master.id,returnOnboarding:id})}>{model?'配置服务与授权':'创建模型服务'}</Button></Cell></Row>
      <Row><Cell>模型成本</Cell><Cell>{association?.pricing?.scenarios?.length?'已有采购配置':'待配置'}</Cell><Cell><Button variant="link" disabled={!association} onClick={()=>go('model-costs',{provider:provider.id,association:association.id})}>维护成本</Button></Cell></Row>
      <Row><Cell>模型售价</Cell><Cell>{model?.listingStatus || '尚未配置服务'}</Cell><Cell><Button variant="link" disabled={!service} onClick={()=>go('model-prices',{service:service.id,tab:'pricing'})}>维护售价与销售</Button></Cell></Row>
    </GridTable>
  </>;
}
