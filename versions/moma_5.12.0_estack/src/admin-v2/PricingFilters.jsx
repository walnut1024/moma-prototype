import { useChannelText } from './channel-language';
import { Button, Input } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { Choice, Field } from './ServiceUI';
import { pricingFilterOptions } from './model-pricing-workspace';

export default function PricingFilters({records,ops,kind}) {
  const translateLabel = useChannelText();
  const {params,go}=ops,options=pricingFilterOptions(records);
  const statuses=kind==='cost'?['已配置','待配置','已失效']:['未开售','在售','灰度在售','已停售'];
  const change=patch=>go({...patch,page:null},{replace:true,preserveScroll:true});
  const placeholder=translateLabel(kind==='cost'?'搜索模型展示名称 / 服务商 / 连接':'搜索模型服务名称 / 模型服务 ID / 模型 ID');
  return <div className="sp-filters admin-list-toolbar">
    <Input prefix={<IconSearch aria-hidden="true"/>} showClear aria-label={placeholder} placeholder={placeholder} value={params.get('q') || ''} onChange={q=>change({q:q || null})}/>
    <Field label={kind === 'cost' ? '模型展示名称' : '模型服务名称'}><Choice label={kind === 'cost' ? '筛选模型展示名称' : '筛选模型服务名称'} filter value={params.get('filterModel') || 'all'} options={[[ 'all',translateLabel('全部模型') ],...options.models]} onChange={value=>change({filterModel:value==='all'?null:value})}/></Field>
    {kind === 'cost' && <Field label="服务商"><Choice label="筛选服务商" filter value={params.get('filterSupplier') || 'all'} options={[[ 'all',translateLabel('全部服务商') ],...options.suppliers]} onChange={value=>change({filterSupplier:value==='all'?null:value})}/></Field>}
    <Field label={kind==='cost'?'成本状态':'售卖状态'}><Choice translateOptions label={kind==='cost'?'筛选成本状态':'筛选售卖状态'} value={params.get('filterStatus') || 'all'} options={[[ 'all','全部状态' ],...statuses.map(value=>[value,value])]} onChange={value=>change({filterStatus:value==='all'?null:value})}/></Field>
    <Button theme="borderless" type="tertiary" onClick={()=>change({q:null,filterModel:null,filterSupplier:null,filterStatus:null})}>{translateLabel("重置筛选")}</Button>
  </div>;
}
