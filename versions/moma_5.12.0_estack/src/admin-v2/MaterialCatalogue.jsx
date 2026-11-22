import Table from './AdminTable';
import { useMemo, useRef, useState } from 'react';
import { Banner, Button, Input, Select, Space, Tooltip, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { libraryRemovalIssue, modelCatalogue, modelReleaseOrder, MODEL_CATALOGUE_TYPES } from './model-library';
import { MODEL_TYPES, modelCategory } from './model-management';
import { materialDrawerSide } from './model-material-drawer';
import { materialContextLabel } from './model-material-fields';
import { modelProfileDraft } from './model-profile';
import { classificationIndex, modelClassification, modelClassificationFor } from './model-classification';
import MaterialLogo from './MaterialLogo';

export default function MaterialCatalogue({ state, ops }) {
  const [query, setQuery] = useState(''), [type, setType] = useState('all'), [removing, setRemoving] = useState(null), [busy, setBusy] = useState(false);
  const [authorId, setAuthorId] = useState(), [seriesId, setSeriesId] = useState();
  const trigger = useRef(null);
  const [pagination,setPagination]=useState({currentPage:1,pageSize:20});
  const open = (event, record, mode) => { trigger.current = event.currentTarget; ops.go({ view: 'template', template: record.id, materialMode: mode, materialTab: null, drawerSide: materialDrawerSide(event.currentTarget.getBoundingClientRect(), window.innerWidth) }, { preserveScroll: true }); };
  const dictionary = useMemo(() => modelClassification(state), [state]);
  const classified = useMemo(() => {
    const index = classificationIndex(dictionary);
    return modelCatalogue(state).sort(modelReleaseOrder).map(row => ({ ...row, classification: modelClassificationFor(index, row) }));
  }, [state, dictionary]);
  const rows = classified.filter(({ name, modelId, type: rowType, classification }) => {
    const { author, series, authorName, seriesName } = classification;
    const text = [name, modelId, authorName, seriesName, author?.name, series?.name, ...(author?.aliases || []), ...(series?.aliases || [])].join(' ').toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (type === 'all' || modelCategory(rowType) === type)
      && (!authorId || (authorId === 'pending' ? Boolean(authorName && !author) : author?.id === authorId))
      && (!seriesId || (seriesId === 'pending' ? Boolean(seriesName && !series) : series?.id === seriesId));
  });
  const firstPage = () => setPagination(current => ({ ...current, currentPage: 1 }));
  const authorNames = new Map(dictionary.authors.map(row => [row.id, row.name]));
  const options = (entries, pending) => [
    ...entries.map(row => ({
      value: row.id,
      label: row.name + (row.authorId && !authorId ? ' · ' + authorNames.get(row.authorId) : '') + (row.active ? '' : '（已停用）'),
    })),
    ...(pending ? [{ value: 'pending', label: '待核对' }] : []),
  ];
  const { pageSize } = pagination;
  const currentPage = Math.min(pagination.currentPage, Math.ceil(rows.length / pageSize) || 1);
  const columns = [
    { title: '模型展示名称', dataIndex: 'name', width: 230, render: (name, row) =>
      <Button className="materials-model-name" theme="borderless" onClick={event => open(event, row, 'view')}>{name}</Button> },
    { title: '模型编码', dataIndex: 'modelId', width: 240, render: value => <Typography.Text className="materials-code" copyable>{value}</Typography.Text> },
    { title: '模型作者', width: 135, render: (_, { classification: { author, authorName } }) => author?.name || (authorName ? authorName + '（待核对）' : '—') },
    { title: '模型系列', width: 130, render: (_, { classification: { series, seriesName } }) => series?.name || (seriesName ? seriesName + '（待核对）' : '—') },
    { title: '模型发布日期', width: 122, render: (_, row) => row.profile?.releaseDate || '—' },
    { title: '模型类型', width: 120, render: (_, row) => MODEL_TYPES[row.type] || '—' },
    { title: '模型图标', width: 94, render: (_, row) =>
      <MaterialLogo key={row.profile?.logo} src={row.profile?.logo} alt={row.name + '的图标'}/> },
    { title: '输入模态/输出模态', width: 180, render: (_, row) => {
      const profile = modelProfileDraft(row);
      const inputs = profile.inputModalities?.join('、') || '—';
      const outputs = [...new Set([...(profile.outputModalities || []), ...(profile.resultTypes || [])])].join('、') || '—';
      return inputs + ' / ' + outputs;
    } },
    { title: '上下文长度', width: 132, render: (_, row) => materialContextLabel(row.capabilities?.context) },
    { title: '操作', width: 140, fixed: 'right', render: (_, row) => <Space><Button theme="borderless" disabled={!ops.can} onClick={event => open(event, row, 'edit')}>编辑</Button><Tooltip content={libraryRemovalIssue(state, row.id) || '删除参考档案'}><span><Button theme="borderless" type="danger" disabled={!ops.can || Boolean(libraryRemovalIssue(state, row.id))} aria-label={'删除模型资料：' + row.name} onClick={event => { trigger.current = event.currentTarget; ops.setError(''); setRemoving(row); }}>删除</Button></span></Tooltip></Space> },
  ];
  const close = () => { setRemoving(null); ops.setError(''); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
  return <>
    <div className="materials-toolbar"><div className="materials-filters">
      <Input prefix={<IconSearch aria-hidden/>} showClear aria-label="搜索模型展示名称、编码、作者或系列" placeholder="搜索模型展示名称 / 编码 / 作者 / 系列" value={query} onChange={value => { setQuery(value); firstPage(); }}/>
      <Typography.Text id="material-type-filter" className="sr-only">模型类型</Typography.Text>
      <Select aria-labelledby="material-type-filter" value={type} onChange={value => { setType(value); firstPage(); }} optionList={[[ 'all', '全部类型' ], ...Object.entries(MODEL_CATALOGUE_TYPES)].map(([value, label]) => ({value, label}))}/>
      <Typography.Text id="material-author-filter" className="sr-only">模型作者</Typography.Text>
      <Select aria-labelledby="material-author-filter" placeholder="全部作者" filter showClear value={authorId}
        optionList={options(dictionary.authors, classified.some(({ classification: item }) => item.authorName && !item.author))}
        onChange={value => { setAuthorId(value); setSeriesId(undefined); firstPage(); }}/>
      <Typography.Text id="material-series-filter" className="sr-only">模型系列</Typography.Text>
      <Select aria-labelledby="material-series-filter" placeholder="全部系列" filter showClear value={seriesId}
        optionList={options(dictionary.series.filter(row => !authorId || row.authorId === authorId),
          classified.some(({ classification: item }) => item.seriesName && !item.series && (!authorId || item.author?.id === authorId || authorId === 'pending' && !item.author)))}
        onChange={value => { setSeriesId(value); firstPage(); }}/>
      <Button onClick={() => { setQuery(''); setType('all'); setAuthorId(undefined); setSeriesId(undefined); firstPage(); }}>重置筛选</Button>
    </div>
      <Button disabled={!ops.can} onClick={() => ops.go({ view: 'templateImport' })} style={{ marginInlineStart: 'auto' }}>批量导入模型资料</Button>
    </div>
    <Table rowKey="id" columns={columns} dataSource={rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)} scroll={{ x: 'max(100%, 1523px)' }}
      pagination={{ pageSize, currentPage, total: rows.length, showSizeChanger: true, pageSizeOpts: [20, 50, 100], showTotal: true }}
      onChange={({ pagination }) => setPagination({ currentPage: pagination.currentPage, pageSize: pagination.pageSize })}
      empty="没有符合条件的模型资料"/>
    <Modal visible={Boolean(removing)} className="semi-materials" title="删除模型资料" onCancel={close} okText="确认删除资料" cancelText="取消" okButtonProps={{type:'danger',disabled:!ops.can || Boolean(removing && libraryRemovalIssue(state, removing.id))}} confirmLoading={busy} onOk={async () => { setBusy(true); try { if (await ops.run('templateDelete', { id: removing.id, confirmed: true })) close(); } finally { setBusy(false); } }}>
      <Typography.Paragraph>确认删除“{removing?.name}”？已保存的模型服务、渠道配置和广场展示将保留。</Typography.Paragraph>{ops.error && <Banner type="danger" description={ops.error}/>}
    </Modal>
  </>;
}

export function NewMaterialButton({ ops }) {
  return <Button theme="solid" icon={<IconPlus aria-hidden/>} disabled={!ops.can} onClick={event => ops.go({view:'template',template:null,materialMode:'edit',drawerSide:materialDrawerSide(event.currentTarget.getBoundingClientRect(),window.innerWidth)},{preserveScroll:true})}>新建资料</Button>;
}
