import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, Space, Table, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ModelOperationsUI';
import { Choice, Field } from './ServiceUI';
import { customTasks } from './channel-custom-adapter';
import { previewChannelModels } from './channel-onboarding';
import { ollamaCurrentRows } from './channel-directory-specialty';

const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未获取';
const kindName = { ollama: 'Ollama', vllm: 'vLLM', sglang: 'SGLang', plugin: '任务插件' };

export default function ChannelDirectorySpecialty({ state, connection, ops, close, append }) {
  const { provider, endpoint, name } = connection;
  const kind = endpoint.networkSettings.runtimeKind, saved = endpoint.directorySpecialties?.[kind];
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(null);
  const [query, setQuery] = useState(''), [model, setModel] = useState(''), [selected, setSelected] = useState([]);
  const [replaceAssociation, setReplaceAssociation] = useState('');
  const [clock, setClock] = useState(Date.now);
  const [tab, setTab] = useState('models');
  const admin = state.currentRole === '平台管理员';
  const rows = kind === 'ollama' ? ollamaCurrentRows(saved, clock) : [];
  const running = rows.some(row => row.status === '正在拉取');
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setClock(Date.now()), 300);
    return () => clearInterval(timer);
  }, [running]);
  const run = async (action, fields) => {
    if (!ops.can || busy) return;
    setBusy(true);
    try {
      const next = await ops.run('channelDirectorySpecialty', { providerId: provider.id, endpointId: endpoint.id, kind, action,
        expectedUpdatedAt: endpoint.updatedAt, ...fields, confirmed: true });
      if (next) { setPending(null); setClock(Date.now()); if (action === 'pull') setModel(''); }
    } finally { setBusy(false); }
  };
  const ready = rows.filter(row => selected.includes(row.id) && row.status === '已安装');
  const appendSelected = event => {
    const preview = previewChannelModels(state, provider.id, ready.map(row => row.id), { endpointId: endpoint.id, source: 'reference', complete: false });
    const additions = preview.rows.filter(row => row.status !== '已存在').map(row => ({ ...row, selected: true, confirmed: false, pasted: true }));
    if (additions.length) append(event, endpoint.id, additions);
    else ops.setError('已选模型均已接入此连接');
  };
  const blocked = !ops.can || busy;
  const authorization = saved?.authorization, quota = saved?.quota;
  const mediaRoutes = endpoint.customAdapter?.routes.filter(row => ['image', 'video', 'audio'].includes(row.task)) || [];
  const pollingLabel = ({ default: '默认间隔', slow: '延长间隔', external: '由外部轮询' })[endpoint.networkSettings.polling || 'default'];
  return <><Modal wide drawer title={kindName[kind] + ' · 专项配置'} description={name} onClose={() => !busy && close()}
    footer={<Space><Button disabled={busy} onClick={close}>关闭</Button>
      <Button theme="solid" disabled={blocked} onClick={() => run('refresh')}>刷新状态</Button></Space>}>
    <Notice>此页使用本地示例，可验证操作流程和回执。上次刷新 {time(saved?.checkedAt)}。</Notice>
    {kind === 'ollama' && <>
      <Field label="查看范围"><Choice label="查看范围" value={tab} onChange={setTab} options={[[ 'models', '上游模型' ], [ 'registered', '已挂载的 MoMA 模型渠道' ]]}/></Field>
      {tab === 'models' ? <>
        <Space wrap><Input aria-label="搜索已安装模型" placeholder="搜索已安装模型" value={query} onChange={setQuery}/>
          <Input aria-label="要拉取的模型标识" placeholder="例如 demo-model:latest" value={model} maxLength={101} disabled={blocked} onChange={setModel}/>
          <Button disabled={blocked || !model.trim()} onClick={() => run('pull', { model: model.trim() })}>模拟拉取模型</Button>
          <Button theme="light" disabled={blocked || !ready.length || Boolean(endpoint.candidateConfiguration)} onClick={appendSelected}>追加所选到连接</Button>
          <Button theme="light" disabled={blocked || ready.length !== 1 || !connection.models.length || Boolean(endpoint.candidateConfiguration)}
            onClick={() => { setReplaceAssociation(''); setPending({ action: 'replaceModel', model: ready[0].id }); }}>替换连接模型</Button>
        </Space>
        <Table size="small" rowKey="id" dataSource={rows.filter(row => row.id.includes(query.trim()))} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
          { title: '选择', render: (_, row) => <Checkbox aria-label={'选择 ' + row.id} checked={selected.includes(row.id)} disabled={blocked || row.status !== '已安装'}
            onChange={event => setSelected(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))}/> },
          { title: '模型标识', dataIndex: 'id' }, { title: '大小', render: (_, row) => row.size || '未报告' },
          { title: '状态', render: (_, row) => row.status === '正在拉取' ? '模拟拉取 · ' + Math.max(0, Math.min(99, Math.floor((clock - Date.parse(row.startedAt)) / 50))) + '%' : row.status },
          { title: '操作', render: (_, row) => row.status === '正在拉取' ? <Button size="small" theme="borderless" disabled={blocked} onClick={() => run('cancel', { model: row.id })}>取消拉取</Button>
            : <Button size="small" theme="borderless" type="danger" disabled={blocked || !admin} onClick={() => setPending({ action: 'remove', model: row.id })}>核对上游删除</Button> },
        ]}/>
      </> : <Table size="small" rowKey="key" dataSource={connection.models} pagination={false} columns={[
        { title: 'MoMA 模型', dataIndex: 'modelName' }, { title: '上游调用标识', render: (_, row) => row.association.upstreamModelId },
      ]}/>}
    </>}
    {['vllm', 'sglang'].includes(kind) && <dl className="channel-operation-facts">
      <div><dt>实例状态</dt><dd>{saved?.status || '未获取'}</dd></div>
      <div><dt>运行中请求</dt><dd>{saved?.activeRequests ?? '未报告'}</dd></div>
      <div><dt>排队请求</dt><dd>{saved?.waitingRequests ?? '未报告'}</dd></div>
    </dl>}
    {kind === 'plugin' && <>
      <Typography.Title heading={5}>媒体任务能力</Typography.Title>
      <Table size="small" rowKey="index" pagination={false} dataSource={mediaRoutes.map((row, index) => ({ ...row, index }))}
        empty="未配置图片、视频或语音任务接口。" columns={[
          { title: '任务', render: (_, row) => customTasks.find(([id]) => id === row.task)?.[1] },
          { title: '模型匹配', render: (_, row) => row.match || '默认' },
          { title: '提交任务', render: (_, row) => row.method + ' ' + new URL(row.path, endpoint.baseUrl).toString() },
          { title: '任务回执', render: (_, row) => row.idPath || '同步返回' },
          { title: '状态查询', render: (_, row) => row.statusPath || '—' },
          { title: '轮询策略', render: (_, row) => row.conversion === 'task' ? pollingLabel : '—' },
        ]}/>
      <Typography.Title heading={5}>授权与额度</Typography.Title>
      <dl className="channel-operation-facts">
        <div><dt>授权状态</dt><dd>{authorization?.status || '待授权'}</dd></div>
        <div><dt>授权账号</dt><dd>{authorization?.account || '未绑定'}</dd></div>
        <div><dt>授权到期</dt><dd>{time(authorization?.expiresAt)}</dd></div>
        <div><dt>账号额度</dt><dd>{quota ? quota.windowHours + ' 小时窗口 · 可用 ' + quota.remaining + quota.unit : '未获取'}</dd></div>
        <div><dt>可用恢复次数</dt><dd>{quota?.recoveryCredits ?? '未获取'}</dd></div>
      </dl>
      <Space wrap>
        <Button disabled={blocked || !admin || authorization?.status === '等待授权'} onClick={() => run('start')}>启动模拟授权</Button>
        {authorization?.status === '等待授权' && <Button theme="light" disabled={blocked || !admin}
          onClick={() => run('complete', { authorizationId: authorization.id })}>继续并完成模拟授权回执</Button>}
        <Button theme="light" disabled={blocked || !admin || authorization?.status !== '模拟已授权' || !quota?.recoveryCredits || quota.remaining >= 100}
          onClick={() => setPending({ action: 'recover' })}>核对额度恢复</Button>
      </Space>
    </>}
    {ops.error && !pending && <Notice error>{ops.error}</Notice>}
  </Modal>
  {pending && <Modal title={pending.action === 'remove' ? '核对模拟上游模型删除' : pending.action === 'replaceModel' ? '核对替换连接模型' : '核对额度恢复'} description={name} onClose={() => !busy && setPending(null)}
    footer={<><Button disabled={busy} onClick={() => setPending(null)}>返回</Button><Button theme="solid" disabled={blocked || pending.action === 'replaceModel' && !replaceAssociation}
      onClick={() => run(pending.action, { model: pending.model, ...(pending.action === 'replaceModel' ? { associationId: replaceAssociation } : {}) })}>确认操作</Button></>}>
    {pending.action === 'replaceModel' && <Field label="当前模型渠道"><Choice label="需要替换的模型渠道" value={replaceAssociation || 'unselected'}
      options={[[ 'unselected', '请选择模型渠道' ], ...connection.models.map(row => [row.association.id, row.modelName + ' · ' + row.association.upstreamModelId])]}
      onChange={value => setReplaceAssociation(value === 'unselected' ? '' : value)} disabled={busy}/></Field>}
    <Typography.Paragraph>{pending.action === 'remove' ? pending.model + ' 将从模拟上游模型列表移除。仍被 MoMA 引用时会拦截。' :
      pending.action === 'replaceModel' ? '上游调用标识将改为 ' + pending.model + '，平台模型身份保留，保存后需要复测。' :
        '本次将扣减 1 次模拟恢复额度，当前窗口可用额度恢复为 100%。'}</Typography.Paragraph>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>}</>;
}
