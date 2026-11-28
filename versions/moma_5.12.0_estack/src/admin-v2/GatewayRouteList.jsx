import { useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import AdminTable from './AdminTable';
import { useChannelText } from './channel-language';
import './gateway-route-list.css';

const matchModes = { exact: '精确匹配', prefix: '前缀匹配', regex: '正则匹配' };
const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const art = import.meta.env.BASE_URL + 'assets/xa-model-route-entry.png';
const tableWidth = 'max(100%, 1016px)';

export default function GatewayRouteList({ rows, onCreate, onEdit, onRemove, onRefresh, refreshing, Button, Input }) {
  const t = useChannelText();
  const [query, setQuery] = useState('');
  const keyword = normalize(query);
  const describeMatch = match => {
    const { mode, value } = match ?? {};
    if (!value) return '—';
    if (!mode) return value;
    return t(matchModes[mode] ?? mode) + ' | ' + value;
  };
  const visible = keyword ? rows.filter(row => [
    row.name, row.pathMatch?.mode, row.pathMatch?.value, describeMatch(row.pathMatch),
    row.modelMatch?.mode, row.modelMatch?.value, describeMatch(row.modelMatch),
  ].some(value => normalize(value).includes(keyword))) : rows;
  const columns = [
    { title: '名称', dataIndex: 'name', width: 174, render: name => <span title={name}>{name}</span> },
    { title: '路径匹配规则', dataIndex: 'pathMatch', width: 234, render: describeMatch },
    { title: '模型匹配规则', dataIndex: 'modelMatch', width: 234, render: describeMatch },
    { title: '服务商', dataIndex: 'providerNames', width: 234, render: names => names?.length
      ? <div className="gateway-route-providers">{names.map((name, index) => <div key={index}>{name}</div>)}</div> : '—' },
    { title: '操作', key: 'actions', width: 140, fixed: 'right', render: (_, row) => (
      <div className="gateway-route-actions">
        <button type="button" aria-label={t('编辑') + ' ' + row.name} disabled={!onEdit}
          onClick={() => onEdit(row)}>{t('编辑')}</button>
        <button type="button" aria-label={t('删除') + ' ' + row.name} disabled={!onRemove}
          onClick={() => onRemove(row)}>{t('删除')}</button>
      </div>
    ) },
  ];
  const searchLabel = t('根据路由名称、匹配规则搜索路由');
  return <div className="gateway-route-view">
    <section className="gateway-route-hero" aria-labelledby="gateway-route-title">
      <div>
        <h1 id="gateway-route-title">{t('模型路由管理')}</h1>
        <p>{t('查看模型路由配置和上游分流规则。')}</p>
      </div>
      <img src={art} width="80" height="80" alt=""/>
    </section>
    <section className="gateway-route-panel" aria-label={t('模型路由列表')}>
      <div className="gateway-route-toolbar">
        <div className="gateway-route-search">
          <Input aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={setQuery}
            suffix={query ? undefined : <Search size={14} aria-hidden="true"/>} showClear/>
        </div>
        <div className="gateway-route-toolbar-actions">
          <Button type="primary" theme="solid" className="gateway-route-create" icon={<Plus size={13} aria-hidden="true"/>}
            disabled={!onCreate} onClick={onCreate}>{t('新建模型路由')}</Button>
          <Button type="tertiary" theme="outline" className="gateway-route-refresh"
            aria-label={t('刷新')} title={t('刷新')} icon={<RefreshCw size={14} aria-hidden="true"/>}
            disabled={refreshing || !onRefresh} loading={refreshing} onClick={onRefresh}/>
        </div>
      </div>
      <AdminTable className="gateway-route-table" rowKey="id" columns={columns} dataSource={visible}
        pagination={false} scroll={{ x: tableWidth }}
        empty={<div className="gateway-route-empty" role="status">{t('暂无筛选结果')}</div>}/>
    </section>
  </div>;
}
