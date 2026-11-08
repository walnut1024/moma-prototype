import Table from './AdminTable';
import { useRef, useState } from 'react';
import { Banner, Button, Input, Select, Space, Tooltip, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { libraryRemovalIssue, modelCatalogue, modelReleaseOrder, MODEL_CATALOGUE_TYPES } from './model-library';
import { modelCategory } from './model-management';
import { modelProfileDraft } from './model-profile';
import { materialModalitiesLabel } from './material-catalogue';
import { materialDrawerSide } from './model-material-drawer';
import MaterialLogo from './MaterialLogo';

export default function MaterialCatalogue({ state, ops }) {
  const [query, setQuery] = useState(''), [type, setType] = useState('all'), [removing, setRemoving] = useState(null), [busy, setBusy] = useState(false);
  const trigger = useRef(null);
  const [pagination,setPagination]=useState({currentPage:1,pageSize:20});
  const open = (event, record, mode) => { trigger.current = event.currentTarget; ops.go({ view: 'template', template: record.id, materialMode: mode, materialTab: null, drawerSide: materialDrawerSide(event.currentTarget.getBoundingClientRect(), window.innerWidth) }, { preserveScroll: true }); };
  const rows = modelCatalogue(state).filter(row => (!query || [row.name, row.modelId, row.profile?.author, row.maker].join(' ').toLowerCase().includes(query.trim().toLowerCase())) && (type === 'all' || modelCategory(row.type) === type)).sort(modelReleaseOrder);
  const { pageSize } = pagination;
  const currentPage = Math.min(pagination.currentPage, Math.ceil(rows.length / pageSize) || 1);
  const columns = [
    { title: '模型展示名', dataIndex: 'name', width: 230, render: (name, row) => <Button theme="borderless" onClick={event => open(event, row, 'view')}>{name}</Button> },
    { title: '规范模型标识', dataIndex: 'modelId', width: 240, render: value => <Typography.Text className="materials-code" copyable>{value}</Typography.Text> },
    { title: '作者', width: 140, render: (_, row) => modelProfileDraft(row).author || row.maker || '—' },
    { title: '原厂发布日期', width: 130, render: (_, row) => modelProfileDraft(row).releaseDate || '—' },
    { title: '模型类型', width: 100, render: (_, row) => MODEL_CATALOGUE_TYPES[modelCategory(row.type)] },
    { title: '模型展示 Logo', width: 130, render: (_, row) => <MaterialLogo key={modelProfileDraft(row).logo || ''} src={modelProfileDraft(row).logo} alt={row.name+'的模型展示 Logo'}/> },
    { title: '输入 / 输出', width: 200, render: (_, row) => { const profile = modelProfileDraft(row); return materialModalitiesLabel(profile); } },
    { title: '上下文窗口', width: 130, render: (_, row) => row.capabilities.context ? `${row.capabilities.context / 1024}K Token` : '—' },
    { title: '操作', width: 140, fixed: 'right', render: (_, row) => <Space><Button theme="borderless" disabled={!ops.can} onClick={event => open(event, row, 'edit')}>编辑</Button><Tooltip content={libraryRemovalIssue(state, row.id) || '删除未被引用的模型资料'}><span><Button theme="borderless" type="danger" disabled={!ops.can || Boolean(libraryRemovalIssue(state, row.id))} aria-label={'删除模型资料：' + row.name} onClick={event => { trigger.current = event.currentTarget; ops.setError(''); setRemoving(row); }}>删除</Button></span></Tooltip></Space> },
  ];
  const close = () => { setRemoving(null); ops.setError(''); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
  return <>
    <div className="materials-toolbar"><div className="materials-filters"><Input prefix={<IconSearch aria-hidden/>} showClear aria-label="搜索模型展示名 / 作者 / 规范标识" placeholder="搜索模型展示名 / 作者 / 规范标识" value={query} onChange={value=>{setQuery(value);setPagination(current=>({...current,currentPage:1}));}}/><Typography.Text id="material-type-filter" className="sr-only">模型类型</Typography.Text><Select aria-labelledby="material-type-filter" value={type} onChange={value=>{setType(value);setPagination(current=>({...current,currentPage:1}));}} optionList={[[ 'all', '全部类型' ], ...Object.entries(MODEL_CATALOGUE_TYPES)].map(([value, label]) => ({value, label}))}/><Button onClick={() => { setQuery(''); setType('all'); setPagination(current=>({...current,currentPage:1})); }}>重置筛选</Button></div></div>
    <Table rowKey="id" columns={columns} dataSource={rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)} scroll={{ x: 1540 }}
      pagination={{ pageSize, currentPage, total: rows.length, showSizeChanger: true, pageSizeOpts: [20, 50, 100], showTotal: true }}
      onChange={({ pagination }) => setPagination({ currentPage: pagination.currentPage, pageSize: pagination.pageSize })}
      empty="没有符合条件的模型资料"/>
    <Modal visible={Boolean(removing)} className="semi-materials" title="删除模型资料" onCancel={close} okText="确认删除资料" cancelText="取消" okButtonProps={{type:'danger',disabled:!ops.can || Boolean(removing && libraryRemovalIssue(state, removing.id))}} confirmLoading={busy} onOk={async () => { setBusy(true); try { if (await ops.run('templateDelete', { id: removing.id, confirmed: true })) close(); } finally { setBusy(false); } }}>
      <Typography.Paragraph>确认删除“{removing?.name}”？仅可删除未被引用的模型资料，已有供应关系与历史引用不能直接删除。</Typography.Paragraph>{ops.error && <Banner type="danger" description={ops.error}/>}
    </Modal>
  </>;
}

export function NewMaterialButton({ ops }) {
  return <Button theme="solid" icon={<IconPlus aria-hidden/>} disabled={!ops.can} onClick={event => ops.go({view:'template',template:null,materialMode:'edit',drawerSide:materialDrawerSide(event.currentTarget.getBoundingClientRect(),window.innerWidth)},{preserveScroll:true})}>新建资料</Button>;
}
