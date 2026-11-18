import AdminStatus from './AdminStatus';
import { moneyDisplay } from './model-management';

export default function ChannelCostCell({ cost }) {
  return cost?.items.length ? cost.items.map((item, index) => <span className="supplier-cost-line" key={index}>
    <span>{item.name}{item.condition ? '（' + item.condition + '）' : ''}：</span>
    {item.amount != null ? <span className="supplier-cost-amount">{moneyDisplay(item.amount)} {item.currency === 'CNY' ? '元' : item.currency || '—'}/{item.unit || '—'}</span>
      : <AdminStatus value={cost.status}/>}
    {index < cost.items.length - 1 ? '； ' : ''}
  </span>) : <AdminStatus value={cost?.status || '待配置'}/>;
}
