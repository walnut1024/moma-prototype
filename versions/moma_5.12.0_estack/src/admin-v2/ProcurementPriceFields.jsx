import Table from './AdminTable';
import { Button, Input } from './xa24/HaloUI.jsx';
import { IconPlus, IconDelete } from './xa24/HaloIcons.jsx';
import { Choice, Notice } from './ServiceUI';
import { CommonTariffBatchButton } from './SupplierPriceFields';
import { tariffOptions, tariffScenarioUnit, tariffScenarioUnits } from './tariff-dictionary';

export default function ProcurementPriceFields({ state, scenarios, disabled, onChange, ops }) {
  const update = (index, patch) => onChange(scenarios.map((item, i) => i === index ? { ...item, ...patch } : item));
  const options = (available, value) => available.map(name => [name, name]).concat(value && !available.includes(value) ? [[value, `${value}（已保存）`]] : []);
  const items = tariffOptions(state, 'scenario');
  const currencies = tariffOptions(state, 'currency');
  const add = () => onChange([...scenarios, { name: '', listPrice: '', unit: '', currency: 'CNY' }]);
  const tools = <div className="sp-actions procurement-cost-tools">
    <Button size="small" icon={<IconPlus aria-hidden="true"/>} disabled={disabled || scenarios.length >= 100} onClick={add}>添加计费项</Button>
    <CommonTariffBatchButton state={state} scenarios={scenarios} disabled={disabled} onChange={onChange} label="批量添加常用计费项"/>
  </div>;
  return <>
    {ops.conflict && <Notice error>其他页面已更新配置，当前输入保留。<Button onClick={ops.reload}>载入最新配置</Button></Notice>}
    {scenarios.length ? <>
      <Table className="procurement-cost-fields" size="small" rowKey="index" pagination={false} scroll={{ x: 820 }} dataSource={scenarios.map((item, index) => ({ ...item, index }))} columns={[
        { title: '计费项', width: 300, render: (_, item) => <div className="ss-field-stack">
          <Choice label={`连接第 ${item.index + 1} 条计费项`} filter value={item.name || undefined} placeholder="请选择计费项" options={options(items, item.name)} disabled={disabled} onChange={name => update(item.index, { name, unit: tariffScenarioUnit(state, name) })}/>
          <Input aria-label={`连接第 ${item.index + 1} 条适用条件`} maxLength={160} value={item.condition || ''} placeholder="适用条件（选填）" disabled={disabled} onChange={condition => update(item.index, { condition })}/>
        </div> },
        { title: '服务商成本价', width: 260, render: (_, item) => <div className="procurement-cost-price">
          <Choice label={`连接第 ${item.index + 1} 条货币`} value={item.currency} options={options(currencies, item.currency)} disabled={disabled} onChange={currency => update(item.index, { currency })}/>
          <Input aria-label={`连接第 ${item.index + 1} 条价格`} inputMode="decimal" placeholder="输入单价" value={item.listPrice} disabled={disabled} onChange={listPrice => update(item.index, { listPrice })}/>
        </div> },
        { title: '计费单位', width: 180, render: (_, item) => <Choice label={`连接第 ${item.index + 1} 条单位`} filter value={item.unit || undefined} options={options(tariffScenarioUnits(state, item.name), item.unit)} disabled={disabled || !item.name} onChange={unit => update(item.index, { unit })}/> },
        { title: '操作', width: 70, render: (_, item) => <Button size="small" theme="borderless" type="tertiary" icon={<IconDelete aria-hidden="true"/>} aria-label={`移除计费项 ${item.index + 1}`} disabled={disabled} onClick={() => onChange(scenarios.filter((_, i) => i !== item.index))}/> },
      ]}/>{tools}
    </> : <div className="procurement-cost-empty"><strong>该连接尚未配置计费项</strong>{tools}</div>}
  </>;
}
