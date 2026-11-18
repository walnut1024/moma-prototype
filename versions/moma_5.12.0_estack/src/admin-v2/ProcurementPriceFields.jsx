import Table from './AdminTable';
import { Button, Input } from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import { Choice, Notice } from './ServiceUI';
import { CommonTariffBatchButton } from './SupplierPriceFields';
import { tariffOptions, tariffScenarioUnit } from './tariff-dictionary';

export default function ProcurementPriceFields({ state, scenarios, disabled, onChange, ops }) {
  const update = (index, patch) => onChange(scenarios.map((item, i) => i === index ? { ...item, ...patch } : item));
  const options = (kind, value) => [...new Set([...tariffOptions(state, kind), ...(value ? [value] : [])])].map(value => [value, value]);
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
          <Choice label={`渠道第 ${item.index + 1} 条计费项`} filter allowCreate value={item.name || undefined} placeholder="请选择或输入计费项" options={options('scenario', item.name)} disabled={disabled} onChange={name => update(item.index, { name, unit: tariffScenarioUnit(state, name) })}/>
          <Input aria-label={`渠道第 ${item.index + 1} 条适用条件`} maxLength={160} value={item.condition || ''} placeholder="适用条件（选填）" disabled={disabled} onChange={condition => update(item.index, { condition })}/>
        </div> },
        { title: '采购价', width: 260, render: (_, item) => <div className="procurement-cost-price">
          <Choice label={`渠道第 ${item.index + 1} 条货币`} value={item.currency} options={options('currency', item.currency)} disabled={disabled} onChange={currency => update(item.index, { currency })}/>
          <Input aria-label={`渠道第 ${item.index + 1} 条价格`} inputMode="decimal" placeholder="输入单价" value={item.listPrice} disabled={disabled} onChange={listPrice => update(item.index, { listPrice })}/>
        </div> },
        { title: '计费单位', width: 180, render: (_, item) => <Choice label={`渠道第 ${item.index + 1} 条单位`} filter allowCreate value={item.unit || undefined} options={options('unit', item.unit)} disabled={disabled} onChange={unit => update(item.index, { unit })}/> },
        { title: '操作', width: 70, render: (_, item) => <Button size="small" theme="borderless" type="tertiary" icon={<IconDelete aria-hidden="true"/>} aria-label={`删除渠道计费项 ${item.index + 1}`} disabled={disabled} onClick={() => onChange(scenarios.filter((_, i) => i !== item.index))}/> },
      ]}/>{tools}
    </> : <div className="procurement-cost-empty"><strong>该渠道尚未配置计费项</strong>{tools}</div>}
  </>;
}
