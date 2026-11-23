import { useState } from 'react';
import { Button, Input, Select, TextArea, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { AdminModal as Modal } from './AdminOverlay';
import Table from './AdminTable';
import { modelLibrary } from './model-library';
import { CLASSIFICATION_KINDS, classificationIndex, modelClassification, modelClassificationFor } from './model-classification';

export default function ModelClassificationDictionary({ kind, state, ops }) {
  const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const dictionary = modelClassification(state);
  const index = classificationIndex(dictionary);
  const series = kind === 'series', label = CLASSIFICATION_KINDS[kind];
  const counts = new Map();
  for (const model of modelLibrary(state)) {
    const classified = modelClassificationFor(index, model);
    const id = (series ? classified.series : classified.author)?.id;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const edit = row => {
    ops.setError('');
    setDraft(row ? { ...row, aliases: row.aliases.join('\n') } : { name: '', aliases: '' });
  };
  const change = (key, value) => {
    setDraft(row => ({ ...row, [key]: value }));
    ops.dirty(true);
  };
  const close = () => { setDraft(null); ops.setError(''); ops.dirty(false); };
  const save = async row => {
    setBusy(true);
    try {
      const { id, name, aliases, authorId } = row;
      if (await ops.run('modelClassificationSave', { kind, id, name, aliases, ...(series && { authorId }) })) close();
    } finally {
      setBusy(false);
    }
  };
  const keyword = query.trim().toLowerCase();
  const rows = dictionary[kind].filter(row => [
    row.name, ...row.aliases, ...(row.formerNames || []), series ? index.authors.get(row.authorId)?.name : '',
  ].join(' ').toLowerCase().includes(keyword));
  const pageSize = 20;
  const currentPage = Math.min(page, Math.ceil(rows.length / pageSize) || 1);
  return <>
    <div className="materials-toolbar">
      <div className="materials-filters">
        <Input prefix={<IconSearch aria-hidden/>} showClear aria-label={'搜索' + label}
          placeholder={series ? '搜索系列名称、别名或作者' : '搜索作者名称或别名'} value={query}
          onChange={value => { setQuery(value); setPage(1); }}/>
      </div>
      <Button className="materials-toolbar-actions" theme="solid" icon={<IconPlus aria-hidden/>}
        disabled={!ops.can || busy} onClick={() => edit()}>新建{label}</Button>
    </div>
    <Table rowKey="id" dataSource={rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
      pagination={{ pageSize, currentPage, total: rows.length, onPageChange: setPage }}
      scroll={{ x: series ? 'max(100%, 800px)' : 'max(100%, 640px)' }}
      empty={keyword ? `没有符合条件的${label}` : `暂无${label}`} columns={[
      { title: series ? '系列名称' : '作者名称', dataIndex: 'name', width: 170 },
      ...(series ? [{ title: '所属作者', width: 160, render: (_, row) => index.authors.get(row.authorId)?.name || '—' }] : []),
      { title: '别名', width: 270, render: (_, row) => [...new Set([...row.aliases, ...(row.formerNames || [])])].join('、') || '—' },
      { title: '关联模型数', width: 110, align: 'right', render: (_, row) => counts.get(row.id) || 0 },
      { title: '操作', width: 90, fixed: 'right', render: (_, row) => <Button theme="borderless" disabled={!ops.can || busy} onClick={() => edit(row)}>编辑</Button> },
    ]}/>
    {draft && <Modal visible className="semi-materials" title={(draft.id ? '编辑' : '新建') + label}
      onCancel={() => ops.proceed(close)} onOk={() => save({ ...draft, aliases: draft.aliases.split(/\n/u).map(value => value.trim()).filter(Boolean) })}
      okText={draft.id ? '保存' : '创建' + label} cancelText="取消" confirmLoading={busy}
      okButtonProps={{ disabled: !ops.can || !draft.name.trim() || series && !draft.authorId }}>
      <div className="materials-classification-fields">
        {series && <div><span id="classification-owner-label">所属作者</span>
          <Select aria-labelledby="classification-owner-label" placeholder="请选择作者" filter value={draft.authorId} disabled={Boolean(draft.id)}
            optionList={dictionary.authors.map(row => ({ value: row.id, label: row.name }))} onChange={value => change('authorId', value)}/>
        </div>}
        <label>{series ? '系列名称' : '作者名称'}<Input aria-label={series ? '系列名称' : '作者名称'} value={draft.name} maxLength={100} onChange={value => change('name', value)}/></label>
        <label><span>别名<Typography.Text type="tertiary" size="small">（每行一个）</Typography.Text></span>
          <TextArea aria-label="别名" rows={3} value={draft.aliases} onChange={value => change('aliases', value)}/>
        </label>
        {ops.error && <Typography.Text type="danger" role="alert">{ops.error}</Typography.Text>}
      </div>
    </Modal>}
  </>;
}
