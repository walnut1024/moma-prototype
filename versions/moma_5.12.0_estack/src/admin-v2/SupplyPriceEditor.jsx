import { Input } from '@douyinfe/semi-ui';
import { GridTable, Row, Cell } from './ModelOperationsUI';
import { billingItemKey, catalogueMoneyDisplay, saleChange } from './provider-catalogue-pricing';

export const itemMoney = item => item?.amount == null ? '待配置' : `${item.currency || 'CNY'} ${catalogueMoneyDisplay(item.amount)}`;
export function CompletePriceTable({ cost, sale, rows, setRows, disabled = false }) {
  return <GridTable className="mo-billing-table" headings={['计费项 / 适用条件', '计价单位', '采购价', '当前平台售价', ...(rows ? ['新平台售价', '变化幅度'] : [])]} empty={!cost.length} emptyMessage="采购计费项待配置，请补齐服务商目录报价。">{cost.map((item, index) => {
    const current = sale.find(row => billingItemKey(row) === billingItemKey(item));
    return <Row key={billingItemKey(item)}><Cell><strong>{item.name}</strong>{item.condition && <small>{item.condition}</small>}</Cell><Cell>{item.unit}</Cell><Cell>{itemMoney(item)}</Cell><Cell>{itemMoney(current)}</Cell>{rows && <><Cell>{<><span className="mo-currency">{item.currency || 'CNY'}</span><Input aria-label={`第 ${index + 1} 项平台售价`} inputMode="decimal" placeholder="待配置；0 为免费" value={rows[index]?.amount ?? ''} disabled={disabled} onChange={value => setRows(rows.map((row, i) => i === index ? { ...row, amount: value } : row))}/></>}</Cell><Cell>{saleChange(current?.amount, rows[index]?.amount)}</Cell></>}</Row>;
  })}</GridTable>;
}
