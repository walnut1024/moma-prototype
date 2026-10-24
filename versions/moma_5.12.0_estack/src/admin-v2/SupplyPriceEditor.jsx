import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, CopyId, Notice } from './ModelOperationsUI';
import { activeSupplyPrice, activeSupplySalePrice, priceItems, procurementVersion, procurementLabel, displayTime, latestSaleRevision, floorDiscountDisplay } from './model-management';
import { billingItemKey, catalogueMoneyDisplay, cataloguePurchasePrice, saleItemsDraft, markedUpItems, saleChange, parseSaleAmount } from './provider-catalogue-pricing';

export const itemMoney = item => item?.amount == null ? '待配置' : `${item.currency || 'CNY'} ${catalogueMoneyDisplay(item.amount)}`;
const draftMoney = item => { try { return itemMoney({ ...item, amount: parseSaleAmount(item?.amount, false) }); } catch { return '格式无效'; } };
function ProcurementSnapshot({ price }) {
  let quote;
  try { quote = JSON.parse(price.sourceVersion); } catch { return null; }
  if (!Array.isArray(quote?.scenarios)) return null;
  return <details><summary>采购报价快照（对应售价 v{price.version}）</summary><small>来源：{price.sourceLabel} · 折扣系数 {quote.discountFactor / 1000000}</small>{quote.scenarios.map(item => <small key={billingItemKey(item)}>{item.name}{item.condition ? `（${item.condition}）` : ''}：{itemMoney({ ...item, amount: cataloguePurchasePrice(item.listPrice, quote.discountFactor, item.purchasePrice) })} / {item.unit}</small>)}</details>;
}
export function CompletePriceTable({ cost, sale, rows, setRows, disabled = false, readOnly = false }) {
  return <GridTable className="mo-billing-table" headings={['计费项 / 适用条件', '计价单位', '供应商价格', '当前平台目录价', ...(rows ? ['新平台目录价', '变化幅度'] : [])]} empty={!cost.length} emptyMessage="采购计费项待配置，请补齐供应商目录报价。">{cost.map((item, index) => {
    const current = sale.find(row => billingItemKey(row) === billingItemKey(item));
    return <Row key={billingItemKey(item)}><Cell><strong>{item.name}</strong>{item.condition && <small>{item.condition}</small>}</Cell><Cell>{item.unit}</Cell><Cell>{itemMoney(item)}</Cell><Cell>{itemMoney(current)}</Cell>{rows && <><Cell>{readOnly ? draftMoney(rows[index]) : <><span className="mo-currency">{item.currency || 'CNY'}</span><Input aria-label={`第 ${index + 1} 项平台目录价`} inputMode="decimal" placeholder="待配置；0 为免费" value={rows[index]?.amount ?? ''} disabled={disabled} onChange={event => setRows(rows.map((row, i) => i === index ? { ...row, amount: event.target.value } : row))}/></>}</Cell><Cell>{saleChange(current?.amount, rows[index]?.amount)}</Cell></>}</Row>;
  })}</GridTable>;
}

export default function SupplyPriceEditor({ state, model, supply, ops, initialItems, initialSource, initialSaleVersion, onDraft, onRepair, onSaved, onCancel }) {
  const cost = activeSupplyPrice(state, supply.id), costItems = priceItems(cost, model), current = activeSupplySalePrice(state, model.id, supply.id), currentItems = priceItems(current, model);
  const [floorDiscount, setFloorDiscount] = useState(current?.floorDiscountBps == null ? '' : String(current.floorDiscountBps / 100));
  const [rows, setRows] = useState(() => initialItems?.length ? initialItems : saleItemsDraft(costItems, currentItems));
  const [source, setSource] = useState(initialSource || procurementVersion(cost)), [markup, setMarkup] = useState('20'), [timing, setTiming] = useState('now'), [effectiveAt, setEffectiveAt] = useState('');
  const changed = source !== procurementVersion(cost);
  const [saleVersion, setSaleVersion] = useState(initialSaleVersion ?? latestSaleRevision(state, supply.id));
  const saleChanged = saleVersion !== latestSaleRevision(state, supply.id);
  const mark = next => { setRows(next); ops.dirty(true); ops.setError(''); };
  const below = rows.some(row => { const reference = costItems.find(item => billingItemKey(item) === billingItemKey(row)); return reference?.amount != null && row.amount !== '' && Number(row.amount) * 1000000 < reference.amount; });
  const save = progress => {
    if (onDraft) { onDraft({ prices: rows, sourceVersion: source, expectedSaleVersion: saleVersion }, progress); return; }
    if (timing === 'later' && !effectiveAt) { ops.setError('请选择生效时间'); return; }
    const next = ops.run('reprice', { supplyId: supply.id, items: rows, floorDiscountPercent: floorDiscount, sourceVersion: source, expectedSaleVersion: saleVersion, ...(timing === 'later' ? { effectiveAt: effectiveAt + '+08:00' } : {}) }, model.id);
    if (next) onSaved(next);
  };
  return <div className="mo-pricing-editor"><h2>{supply.provider?.name} · {model.name}</h2><CopyId value={supply.callId || supply.upstreamModelId}/><p className="mo-muted">供应商价格只读。留空为待配置，0 为免费。每家供给单独定价。</p><p className="mo-muted">采购来源：{procurementLabel(cost)}</p>
    {ops.conflict && <Notice error>其他页面保存了新版本，当前草稿保留。<Button variant="link" onClick={ops.reload}>载入最新数据并保留草稿</Button></Notice>}
    {(!costItems.length || costItems.some(item => item.amount == null)) && <Notice error>采购计费项或采购价缺失，请补齐供应商目录。{onRepair ? <Button variant="link" onClick={() => onRepair({ prices: rows, sourceVersion: source, expectedSaleVersion: saleVersion })}>保存进度并补齐供应商配置</Button> : <Button variant="link" asChild><a href={`#/admin-2/providers?provider=${encodeURIComponent(supply.provider?.id || '')}&tab=catalogue`} target="_blank" rel="noopener noreferrer">维护供应商目录</a></Button>}</Notice>}
    {current?.sourceVersion && current.sourceVersion !== procurementVersion(cost) && <Notice>供应商报价有变化，请核对受影响的售价。已发布售价保持原值。</Notice>}
    {saleChanged && <Notice error>售价已有并发修订，当前草稿保留。请比较表内最新售价后再保存。<Button variant="link" onClick={() => { setSaleVersion(latestSaleRevision(state, supply.id)); ops.dirty(true); }}>已核对最新售价，保留本次草稿</Button></Notice>}
    {changed && <Notice error>本次草稿引用的供应商报价已变化，请核对后继续。<Button variant="link" onClick={() => { const retained = costItems.map(item => rows.find(row => billingItemKey(row) === billingItemKey(item))); mark(saleItemsDraft(costItems).map((row, index) => retained[index] ? { ...row, amount: retained[index].amount } : row)); setSource(procurementVersion(cost)); }}>核对最新采购报价</Button></Notice>}
    <div className="mo-markup"><Field label="供应商价格加价比例（%）"><Input inputMode="decimal" aria-label="加价比例" value={markup} disabled={!ops.can} onChange={event => setMarkup(event.target.value)}/></Field><Button variant="outline" disabled={!ops.can || changed} onClick={() => { try { mark(markedUpItems(costItems, markup)); } catch (error) { ops.setError(error.message); } }}>生成平台目录价草稿</Button><small>生成后可逐项调整，不自动随采购价变化。</small></div>
    <CompletePriceTable cost={costItems} sale={currentItems} rows={rows} setRows={mark} disabled={!ops.can || changed}/>
    {below && <Notice>部分新平台目录价低于供应商价格，请核对后保存。</Notice>}
    {!onDraft && <><Field label="底线折扣（%）" hint="按百分比填写，例如 40%；留空表示未配置。"><Input aria-label="底线折扣（%）" inputMode="decimal" placeholder="例如 40" value={floorDiscount} disabled={!ops.can} onChange={event => { setFloorDiscount(event.target.value); ops.dirty(true); ops.setError(''); }}/></Field><div className="mo-form-grid"><Field label="生效方式"><Choice label="生效方式" value={timing} disabled={!ops.can} options={[[ 'now', '立即生效'], ['later', '定时生效']]} onChange={value => { setTiming(value); ops.dirty(true); }}/></Field>{timing === 'later' && <Field label="生效时间（北京时间）"><Input type="datetime-local" aria-label="生效时间" value={effectiveAt} disabled={!ops.can} onChange={event => { setEffectiveAt(event.target.value); ops.dirty(true); }}/></Field>}</div><p className="mo-muted">价格按版本保存，既有客户计价规则沿用当前规则。</p><details className="mo-price-history"><summary>价格历史与待生效版本</summary><GridTable headings={['版本', '状态 / 生效时间', '底线折扣', '完整计费项']} empty={!state.modelSalePrices.some(price => price.supplyId === supply.id)}>{state.modelSalePrices.filter(price => price.supplyId === supply.id).sort((a, b) => b.version - a.version).map(price => <Row key={price.id}><Cell>v{price.version}</Cell><Cell>{Date.parse(price.effectiveAt) > Date.now() ? '待生效' : price.id === current?.id ? '当前生效' : price.status}<small>{displayTime(price.effectiveAt)}</small></Cell><Cell>{floorDiscountDisplay(price)}</Cell><Cell>{priceItems(price, model).map(item => <small key={billingItemKey(item)}>{item.name}{item.condition ? `（${item.condition}）` : ''}：{itemMoney(item)} / {item.unit}</small>)}<small>采购来源：{price.sourceLabel || '历史版本'}</small><ProcurementSnapshot price={price}/></Cell></Row>)}</GridTable></details></>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button variant="outline" onClick={onCancel}>{onDraft ? '上一步' : '取消'}</Button>{onDraft && <Button variant="outline" disabled={!ops.can} onClick={() => save(true)}>保存进度</Button>}<Button disabled={!ops.can || changed || saleChanged || !costItems.length} onClick={() => save(false)}>{onDraft ? '下一步：检查并上架' : '确认修改平台目录价'}</Button></div>
  </div>;
}
