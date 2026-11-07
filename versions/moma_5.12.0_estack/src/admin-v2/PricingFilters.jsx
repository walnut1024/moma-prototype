import { Button, Input } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { Choice, Field } from './ServiceUI';
import { pricingFilterOptions } from './model-pricing-workspace';

export default function PricingFilters({records,ops,kind}) {
  const {params,go}=ops,options=pricingFilterOptions(records);
  const statuses=kind==='cost'?['已配置','待配置','已失效']:['未上架','在售','灰度在售','已停售','服务不可用','不可销售','不销售'];
  const change=patch=>go({...patch,page:null},{replace:true,preserveScroll:true});
  const placeholder=kind==='cost'?'搜索模型展示名 / 服务商 / 渠道':'搜索模型展示名 / 服务商 / 对外调用标识';
  return <div className="sp-filters">
    <Input prefix={<IconSearch aria-hidden="true"/>} showClear aria-label={placeholder} placeholder={placeholder} value={params.get('q') || ''} onChange={q=>change({q:q || null})}/>
    <Field label="模型展示名"><Choice label="筛选模型展示名" filter value={params.get('filterModel') || 'all'} options={[[ 'all','全部模型' ],...options.models]} onChange={value=>change({filterModel:value==='all'?null:value})}/></Field>
    <Field label="服务商"><Choice label="筛选服务商" filter value={params.get('filterSupplier') || 'all'} options={[[ 'all','全部服务商' ],...options.suppliers]} onChange={value=>change({filterSupplier:value==='all'?null:value})}/></Field>
    <Field label={kind==='cost'?'成本状态':'销售状态'}><Choice label={kind==='cost'?'筛选成本状态':'筛选销售状态'} value={params.get('filterStatus') || 'all'} options={[[ 'all','全部状态' ],...statuses.map(value=>[value,value])]} onChange={value=>change({filterStatus:value==='all'?null:value})}/></Field>
    <Button onClick={()=>change({q:null,filterModel:null,filterSupplier:null,filterStatus:null})}>重置筛选</Button>
  </div>;
}
