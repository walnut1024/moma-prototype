import { useState } from 'react';
import { Button, Input, Select, Space, Tabs, Tag, TextArea, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import Table from './AdminTable';
import { modelLibrary } from './model-library';
import { classificationIndex, modelClassification, modelClassificationFor } from './model-classification';

export default function ModelClassificationDictionary({ state, ops }) {
  const [kind, setKind] = useState('authors'), [draft, setDraft] = useState(null), [busy, setBusy] = useState(false);
  const dictionary = modelClassification(state);
  const index = classificationIndex(dictionary);
  const series = kind === 'series', label = series ? '模型系列' : '模型作者';
  const counts = new Map();
  for (const model of modelLibrary(state)) {
    const classified = modelClassificationFor(index, model);
    const id = (series ? classified.series : classified.author)?.id;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const edit = row => {
    ops.setError('');
    setDraft(row ? { ...row, aliases: row.aliases.join('\n') } : { name: '', aliases: '', active: true });
  };
  const change = (key, value) => {
    setDraft(row => ({ ...row, [key]: value }));
    ops.dirty(true);
  };
  const close = () => { setDraft(null); ops.setError(''); ops.dirty(false); };
  const save = async row => {
    setBusy(true);
    try {
      const { id, name, aliases, active, authorId } = row;
      if (await ops.run('modelClassificationSave', { kind, id, name, aliases, active, authorId })) close();
    } finally {
      setBusy(false);
    }
  };
  const authors = dictionary.authors.filter(row => row.active || row.id === draft?.authorId);
  return <>
    <div className="materials-toolbar">
      <Tabs type="button" activeKey={kind} onChange={setKind} aria-label="字典类别">
        <Tabs.TabPane itemKey="authors" tab="模型作者"/>
        <Tabs.TabPane itemKey="series" tab="模型系列"/>
      </Tabs>
      <Button theme="solid" disabled={!ops.can || busy} onClick={() => edit()}>新增{label}</Button>
    </div>
    <Table rowKey="id" dataSource={dictionary[kind]} pagination={{ pageSize: 20, showTotal: true }} scroll={{ x: 850 }} empty={`暂无${label}`} columns={[
      ...(series ? [{ title: '所属作者', width: 160, render: (_, row) => index.authors.get(row.authorId)?.name || '—' }] : []),
      { title: '标准名称', dataIndex: 'name', width: 170 },
      { title: '别名', width: 270, render: (_, row) => [...new Set([...row.aliases, ...(row.formerNames || [])])].join('、') || '—' },
      { title: '关联模型数', width: 110, align: 'right', render: (_, row) => counts.get(row.id) || 0 },
      { title: '状态', width: 90, render: (_, row) => <Tag color={row.active ? 'green' : 'grey'}>{row.active ? '已启用' : '已停用'}</Tag> },
      { title: '操作', width: 150, render: (_, row) => <Space>
        <Button theme="borderless" disabled={!ops.can || busy} onClick={() => edit(row)}>编辑</Button>
        <Button theme="borderless" disabled={!ops.can || busy || series && !row.active && !index.authors.get(row.authorId)?.active}
          onClick={() => save({ ...row, active: !row.active })}>{row.active ? '停用' : '启用'}</Button>
      </Space> },
    ]}/>
    {draft && <Modal visible className="semi-materials" title={(draft.id ? '编辑' : '新增') + label}
      onCancel={() => ops.proceed(close)} onOk={() => save({ ...draft, aliases: draft.aliases.split(/\n/u).map(value => value.trim()).filter(Boolean) })}
      okText="保存" cancelText="取消" confirmLoading={busy}
      okButtonProps={{ disabled: !ops.can || !draft.name.trim() || series && !draft.authorId }}>
      <div className="materials-classification-fields">
        {series && <div><span id="classification-owner-label">所属作者</span>
          <Select aria-labelledby="classification-owner-label" placeholder="请选择作者" filter value={draft.authorId} disabled={Boolean(draft.id)}
            optionList={authors.map(row => ({ value: row.id, label: row.name }))} onChange={value => change('authorId', value)}/>
        </div>}
        <label>标准名称<Input aria-label="标准名称" value={draft.name} maxLength={100} onChange={value => change('name', value)}/></label>
        <label><span>别名<Typography.Text type="tertiary" size="small">（每行一个）</Typography.Text></span>
          <TextArea aria-label="别名" rows={3} value={draft.aliases} onChange={value => change('aliases', value)}/>
        </label>
        {ops.error && <Typography.Text type="danger" role="alert">{ops.error}</Typography.Text>}
      </div>
    </Modal>}
  </>;
}
