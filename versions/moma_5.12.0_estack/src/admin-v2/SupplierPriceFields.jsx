import { useState } from 'react';
import { Button, Checkbox, Empty, Input, RadioGroup, Select, Space, Typography } from '@douyinfe/semi-ui';
import { IconDelete, IconPlus, IconExternalOpenStroked } from '@douyinfe/semi-icons';
import { Choice } from './ServiceUI';
import { GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { tariffOptions, tariffScenarioUnit, tariffDictionaryEntries, appendCommonTariffScenarios, commonTariffNames } from './tariff-dictionary';

function TariffChoice({ label, kind, value, options, entries = [], disabled, onChange }) {
  const entry = name => entries.find(item => (kind === 'currency' ? item.code : item.name) === name);
  const display = name => kind === 'currency' && entry(name) ? name + ' · ' + entry(name).name : name;
  return <Select className="supplier-tariff-choice" aria-label={label} allowCreate={kind !== 'currency'} placeholder={kind === 'currency' ? '请选择货币' : '请选择或输入'} value={value || undefined} disabled={disabled} optionList={options.map(name => ({ value: name, label: display(name) }))} emptyContent={kind === 'currency' ? '暂无匹配货币，请在“模型资料 → 货币”中维护。' : '暂无常用项，请输入自定义值。'} filter={(input, option) => [option.value, entry(option.value)?.name, entry(option.value)?.englishName].join(' ').toLowerCase().includes(input.trim().toLowerCase())} onChange={name => onChange(name)}/>;
}

export default function ChannelPrices({ state, scenarios, disabled, onChange, ops, priceLabel = '采购价', separateCurrency = false, batchOnly = false, title = '计费项', modelType }) {
  const entries = tariffDictionaryEntries(state), available = tariffOptions(state, 'scenario');
  const row = (index, patch) => onChange(scenarios.map((item, i) => i === index ? { ...item, ...patch } : item));
  const currency = (item, index) => <Choice label={`渠道第 ${index + 1} 条币种`} value={item.currency} options={[...new Set([...tariffOptions(state, 'currency'), item.currency])].map(value => [value, value])} disabled={disabled} onChange={value => row(index, { currency: value })}/>;
  return <section className="supplier-channel-costs supplier-configuration-costs"><Typography.Title heading={5} component="h3">{title}</Typography.Title>{ops?.conflict && <Notice error>其他页面已更新配置，当前输入保留。<Button theme="borderless" type="tertiary" onClick={ops.reload}>载入最新配置</Button></Notice>}<div className="supplier-channel-toolbar"><div className="supplier-price-tools">{!batchOnly && <Button size="small" theme="light" disabled={disabled || scenarios.length >= 100} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={() => onChange([...scenarios, { name: '', listPrice: '', unit: '', currency: 'CNY' }])}>添加计费项</Button>}<CommonTariffBatchButton modelType={modelType} state={state} scenarios={scenarios} disabled={disabled} onChange={onChange} label="批量添加常用计费项"/></div><Typography.Text link={{ href: '#/admin-2/tariff-dictionary?tab=scenario', target: '_blank', rel: 'noopener noreferrer' }}>维护常用计费项<IconExternalOpenStroked aria-hidden="true"/></Typography.Text></div>
    <GridTable className={separateCurrency?'supplier-separated-price-table':''} headings={separateCurrency?['计费项', priceLabel, '货币', '计费单位', '操作']:['计费项', priceLabel, '计价单位', '操作']} empty={!scenarios.length} emptyMessage="请添加计费项。">{scenarios.map((item, index) => <Row key={index}>
      <Cell><TariffChoice label={`渠道第 ${index + 1} 条计费项`} kind="scenario" options={available} entries={entries} value={item.name} disabled={disabled} onChange={name => row(index, { name, unit: tariffScenarioUnit(state, name) })}/><Input aria-label={`渠道第 ${index + 1} 条适用条件`} maxLength={160} value={item.condition || ''} placeholder="适用条件（选填）" disabled={disabled} onChange={value => row(index, { condition: value })}/></Cell>
      <Cell><div className="supplier-price-input"><Input aria-label={`渠道第 ${index + 1} 条价格`} inputMode="decimal" placeholder="待配置" value={item.listPrice} disabled={disabled} onChange={value => row(index, { listPrice: value })}/>{!separateCurrency && currency(item,index)}</div></Cell>
      {separateCurrency && <Cell>{currency(item,index)}</Cell>}
      <Cell><TariffChoice label={`渠道第 ${index + 1} 条单位`} kind="unit" options={tariffOptions(state, 'unit')} value={item.unit} disabled={disabled} onChange={unit => row(index, { unit })}/></Cell><Cell><Button theme="borderless" size={batchOnly ? 'small' : undefined} icon={batchOnly ? undefined : <IconDelete aria-hidden="true"/>} title="删除计费项" aria-label={`删除渠道计费项 ${index + 1}`} disabled={disabled} onClick={() => onChange(scenarios.filter((_, i) => i !== index))}>{batchOnly ? '删除' : null}</Button></Cell>
    </Row>)}</GridTable>

  </section>;
}

export function CommonTariffBatchButton({ state, scenarios, disabled, onChange, label = '批量添加计费项', modelType }) {
  const [batch, setBatch] = useState(false);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  const entries = tariffDictionaryEntries(state);
  const available = tariffOptions(state, 'scenario');
  const text = query.trim().toLowerCase();
  const options = (all || text ? available : commonTariffNames(available, modelType)).filter(name => {
    const entry = entries.find(item => item.kind === 'scenario' && item.name === name);
    return [name, entry?.englishName].join(' ').toLowerCase().includes(text);
  });
  const close = () => setBatch(false);
  const add = () => {
    try {
      onChange(appendCommonTariffScenarios(scenarios, selected, state, 'CNY'));
      close();
    } catch (issue) {
      setError(issue.message);
    }
  };
  return <>
    <Button size="small" theme="light" disabled={disabled || scenarios.length >= 100} onClick={() => {
      setSelected([]); setQuery(''); setError(''); setBatch(true);
    }}>{label}</Button>
    {batch && <Modal title={label} description={null} onClose={close} footer={<>
      <Button theme="light" onClick={close}>取消</Button>
      <Button theme="solid" disabled={disabled || !selected.length} onClick={add}>添加所选项</Button>
    </>}>
      <Input autoFocus aria-label="搜索常用计费项" placeholder="搜索中文 / 英文名称" value={query} onChange={setQuery}/>
      <Space wrap>
        <RadioGroup type="button" aria-label="计费项范围" value={all ? 'all' : 'common'} onChange={event => setAll(event.target.value === 'all')}
          options={[{ label: '常用计费项', value: 'common' }, { label: `全部计费项（${available.length}）`, value: 'all' }]}/>
        <Typography.Text type="secondary" aria-live="polite">已选 {selected.length} 项</Typography.Text>
      </Space>
      {options.length ? <Space className="supplier-common-item-options" vertical align="start">
        {options.map(name => {
          const added = scenarios.some(row => row.name.trim().toLowerCase() === name.toLowerCase());
          return <Checkbox key={name} checked={added || selected.includes(name)} disabled={disabled || added}
            onChange={event => setSelected(event.target.checked ? [...selected, name] : selected.filter(item => item !== name))}>
            {name} · {added ? '已添加' : tariffScenarioUnit(state, name)}
          </Checkbox>;
        })}
      </Space> : <Empty description="没有匹配的计费项"/>}
      {error && <Notice error>{error}</Notice>}
    </Modal>}
  </>;
}
