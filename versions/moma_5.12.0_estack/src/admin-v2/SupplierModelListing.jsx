import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { FilterPagination, FilterReset, normalizePageSize } from '../components/FilterControls';
import { Choice } from './ModelMetadataForm';
import { SearchBox, GridTable, Row, Cell, Status, Price } from './ModelOperationsUI';
import { MODEL_CATEGORIES, modelCategory } from './model-management';
import { supplierDirectory, supplierListingRows, selectedCatalogueIds, rememberCatalogueSelection } from './supplier-listing';

export default function SupplierModelListing({ state, ops, open, batch }) {
  const { params, go } = ops;
  const providers = supplierDirectory(state);
  const provider = providers.find(item => item.id === params.get('supplier')) || providers[0];
  const [selection, setSelection] = useState(() => provider ? selectedCatalogueIds(localStorage, provider) : []);
  const query = params.get('catalogueQ') || '', type = params.get('catalogueType') || 'all', status = params.get('catalogueStatus') || 'all', supplierQ = params.get('supplierQ') || '';
  const allRows = supplierListingRows(state, provider);
  const rows = allRows.filter(row => (!query || [row.catalogueModelId, row.master?.name, row.master?.modelId].join(' ').toLowerCase().includes(query.trim().toLowerCase())) && (type === 'all' || modelCategory(row.type) === type) && (status === 'all' || (status === 'selling' ? row.selling : status === 'ready' ? row.ready : Boolean(row.issue))));
  const size = normalizePageSize(params.get('catalogueSize')), page = Math.max(1, Math.min(Number(params.get('cataloguePage')) || 1, Math.ceil(rows.length / size) || 1));
  const visible = rows.slice((page - 1) * size, page * size), selectable = visible.filter(row => !row.selling).map(row => row.catalogueModelId);
  const selected = selection.filter(id => allRows.some(row => row.catalogueModelId === id && !row.selling));
  const setSelected = ids => { const next = [...new Set(ids)]; if (next.length > 100) { ops.setError('每批最多选择 100 项，请减少选择后继续'); return; } ops.setError(''); setSelection(next); rememberCatalogueSelection(localStorage, provider, next); };
  const change = patch => go({ ...patch, cataloguePage: null }, { replace: true });
  if (!provider) return <section className="mo-surface mo-empty">暂无服务商，请先在服务商页面登记并导入模型目录。</section>;
  return <div className="mo-supplier-listing">
    <aside className="mo-supplier-navigation" aria-label="选择服务商">
      <div className="mo-supplier-nav-heading"><strong>服务商视角</strong><span>{providers.length} 家</span></div>
      <SearchBox value={supplierQ} onChange={supplierQ => change({ supplierQ: supplierQ || null })} placeholder="搜索服务商"/>
      <nav aria-label="服务商列表">{providers.filter(item => [item.name, item.code].join(' ').toLowerCase().includes(supplierQ.trim().toLowerCase())).map(item => <Button variant="ghost" key={item.id} aria-current={item.id === provider.id ? 'true' : undefined} onClick={() => change({ supplier: item.id })}><strong>{item.name}</strong><small>{supplierListingRows(state, item).length} 个目录模型</small></Button>)}</nav>
      {!providers.some(item => [item.name, item.code].join(' ').toLowerCase().includes(supplierQ.trim().toLowerCase())) && <p className="mo-muted">未找到匹配的服务商</p>}
    </aside>
    <section className="mo-surface mo-supplier-catalogue">
      <div className="mo-supplier-catalogue-heading"><div><h2>{provider.name}</h2><span>{allRows.length} 个目录模型 · {allRows.filter(row => row.selling).length} 个已上架</span></div><Button variant="outline" disabled={!ops.can || !selected.length} onClick={() => batch(provider, selected)}>批量配置</Button><Button disabled={!ops.can || !selected.length} onClick={() => batch(provider, selected, true)}>批量上架</Button></div>
      <div className="mo-toolbar" role="group" aria-label="服务商模型筛选"><SearchBox value={query} onChange={catalogueQ => change({ catalogueQ: catalogueQ || null })} placeholder="搜索目录模型 / 平台模型"/><Choice label="目录模型类型" value={type} options={[[ 'all', '全部类型'], ...Object.entries(MODEL_CATEGORIES)]} onChange={catalogueType => change({ catalogueType })}/><Choice label="目录模型状态" value={status} options={[[ 'all', '全部状态'], ['pending', '待处理'], ['ready', '可上架'], ['selling', '已上架']]} onChange={catalogueStatus => change({ catalogueStatus })}/><FilterReset onClick={() => change({ catalogueQ: null, catalogueType: null, catalogueStatus: null })}/></div>
      {selected.length > 0 && <div className="mo-supplier-selection" role="status"><span>已选 {selected.length} 项{selected.some(id => !visible.some(row => row.catalogueModelId === id)) ? '（含其他页或筛选范围）' : ''} · 每批最多 100 项</span><Button variant="link" onClick={() => setSelected([])}>清空选择</Button></div>}
      <GridTable className="mo-supplier-model-table" headings={['选择', '目录模型 / 平台模型', '模型类型', '采购价', '平台售价', '上架检查', '销售状态', '操作']} empty={!rows.length} emptyMessage={allRows.length ? '未找到符合筛选条件的目录模型' : '该服务商暂无目录模型，请先维护服务商模型目录'}>
        {visible.length > 0 && <Row className="mo-supplier-select-all"><Cell><Checkbox aria-label="选择本页待上架模型" disabled={!ops.can || !selectable.length} checked={selectable.length > 0 && selectable.every(id => selected.includes(id)) ? true : selectable.some(id => selected.includes(id)) ? 'indeterminate' : false} onCheckedChange={checked => setSelected(checked === true ? [...selected, ...selectable] : selected.filter(id => !selectable.includes(id)))}/></Cell><Cell colSpan={7}>选择本页待上架模型；已上架项通过详情继续维护</Cell></Row>}
        {visible.map(row => <Row key={row.catalogueModelId}><Cell><Checkbox aria-label={`选择目录模型 ${row.catalogueModelId}`} disabled={!ops.can || row.selling || selected.length >= 100 && !selected.includes(row.catalogueModelId)} checked={selected.includes(row.catalogueModelId)} onCheckedChange={checked => setSelected(checked === true ? [...selected, row.catalogueModelId] : selected.filter(id => id !== row.catalogueModelId))}/></Cell><Cell><code>{row.catalogueModelId}</code>{row.model ? <Button variant="link" onClick={() => open(row.model)}>{row.model.name}</Button> : <small>{row.master?.name || '尚未关联平台模型'}</small>}</Cell><Cell>{MODEL_CATEGORIES[modelCategory(row.type)] || '待登记'}</Cell><Cell><Price model={row.master || { type: 'text' }} price={row.cost}/></Cell><Cell><Price model={row.master || { type: 'text' }} price={row.sale}/></Cell><Cell><span className={row.issue ? 'mo-pending' : ''}>{row.selling ? '—' : row.issue || '配置完整，可上架'}</span></Cell><Cell><Status good={row.selling}>{row.draft && !row.selling ? '配置中' : row.status}</Status></Cell><Cell><div className="mo-row-actions">{row.model && <Button variant="link" onClick={() => open(row.model)}>详情</Button>}<Button variant="link" disabled={!ops.can} onClick={() => row.selling && row.model ? open(row.model, 'price') : batch(provider, [row.catalogueModelId])}>{row.selling ? '修改平台售价' : row.draft ? '继续配置' : '配置'}</Button></div></Cell></Row>)}
      </GridTable>
      <FilterPagination total={rows.length} page={page} size={size} onPageChange={cataloguePage => go({ cataloguePage }, { replace: true })} onSizeChange={catalogueSize => change({ catalogueSize })}/>
    </section>
  </div>;
}
