import { useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Card, Checkbox, Dropdown, Empty, Input, InputNumber, Select, Space, Switch, Tabs, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconDownload, IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { dump, JSON_SCHEMA, load } from 'js-yaml';
import AdminDescriptions from './AdminDescriptions';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import AdminStatus from './AdminStatus';
import AdminTable from './AdminTable';
import { Choice } from './ServiceUI';
import { INFERENCE_BACKEND_VIEW } from './InferenceBackendViews';
import { benchmarkClone, benchmarkExport, cacheAttachments, cacheInstances, cacheL2Entries, cacheL2Kinds, linkedDeploymentModel, modelOperationDeadline, reconcileModelOperation } from './ops-models';
import { resourceId } from '../resource-id.mjs';
import { TimeSeriesChart } from '../components/AnalyticsCharts';

const { Text, Paragraph, Title } = Typography;
import { readCatalogueRecipe } from './model-catalogue.js';

const cataloguePage = 'ops-model-library';
const benchmarkPage = 'ops-benchmarks';
const backendsPage = 'ops-inference-backends';
const cachePage = 'ops-cache-acceleration';
const filesPage = 'ops-model-files';
const settingsKey = 'moma-5.12.0-estack:infrastructure:model-sources';
const sourceLabels = ['Hugging Face', 'ModelScope', '本地路径'];
const modelCategories = ['语言模型', '多模态理解', '向量模型', '重排序', '图像生成', '语音'];
const optionList = items => items.map(value => ({ value, label: value }));
const hasValue = value => value !== undefined && value !== null && value !== '';
const fmtDate = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
const fmtUnit = (value, unit = '') => value == null ? '—' : `${value}${unit}`;
const messageAt = message => ({ at: new Date().toISOString(), message });

function ModelOperationProgress({ pageId, rows, commit, busy }) {
  const failed = useRef('');
  useEffect(() => {
    if (busy) return undefined;
    const deadlines = rows.map(row => modelOperationDeadline(pageId, row)).filter(Boolean);
    const signature = deadlines.join(',');
    if (!deadlines.length || failed.current === signature) return undefined;
    const timer = setTimeout(() => {
      const now = Date.now();
      void commit((latest, records) => latest.map(row => reconcileModelOperation(pageId, row, records, now))).catch(issue => {
        failed.current = signature;
        Toast.error(issue.message);
      });
    }, Math.max(25, Math.min(...deadlines) - Date.now() + 5));
    return () => clearTimeout(timer);
  }, [pageId, rows, commit, busy]);
  return null;
}

function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readSettings() {
  try { return JSON.parse(localStorage.getItem(settingsKey) || '{}') ?? {}; }
  catch { return {}; }
}

function saveSetting(kind, value) {
  localStorage.setItem(settingsKey, JSON.stringify({ ...readSettings(), [kind]: value }));
}

function decodeYaml(content) {
  if (!content.trim()) throw Error('请输入 YAML 内容。');
  if (new Blob([content]).size > 4 * 1024 * 1024) throw Error('YAML 文件不能超过 4 MiB。');
  const document = load(content, { schema: JSON_SCHEMA });
  if (!document || typeof document !== 'object') throw Error('YAML 缺少有效的配置对象。');
  return document;
}

function RowsEditor({ items, onChange, id, addLabel, blank, render, disabled, limit = 30 }) {
  const update = (index, patch) => onChange(items.map((item, position) => position === index ? { ...item, ...patch } : item));
  const reorder = (index, shift) => {
    const next = [...items];
    [next[index], next[index + shift]] = [next[index + shift], next[index]];
    onChange(next);
  };
  return <Space id={id} vertical align="start" style={{ width: '100%' }}>
    {items.map((item, index) => <Card key={index} bodyStyle={{ padding: 12 }} style={{ width: '100%' }}>
      <Space vertical align="start" style={{ width: '100%' }}>
        {render(item, index, patch => update(index, patch))}
        {!disabled && <Space wrap>
          {items.length > 1 && <><Button size="small" disabled={index === 0} onClick={() => reorder(index, -1)}>上移</Button>
            <Button size="small" disabled={index === items.length - 1} onClick={() => reorder(index, 1)}>下移</Button></>}
          <Button size="small" type="danger" theme="borderless" aria-label={`移除第 ${index + 1} 项`} onClick={() => onChange(items.filter((_, position) => position !== index))}>移除</Button>
        </Space>}
      </Space>
    </Card>)}
    {!disabled && addLabel && <Button size="small" icon={<IconPlus/>} disabled={items.length >= limit} onClick={() => onChange([...items, blank])}>{addLabel}</Button>}
  </Space>;
}

function BenchmarkStagesField({ value, row, onChange, id }) {
  return <RowsEditor id={id} items={Array.isArray(value) ? value : []} onChange={onChange} disabled={Boolean(row)} addLabel="添加阶段"
    blank={{ load: 8, requests: 200, duration: 60 }} render={(item, index, update) => <Space wrap>
      {[[ 'load', '负载', 10000 ], [ 'requests', '请求数', 1000000 ], [ 'duration', '时长（秒）', 86400 ]].map(([key, label, max]) =>
        <Space key={key}><Text>{label}</Text><InputNumber value={item[key]} min={1} max={max} step={1} disabled={Boolean(row)}
          aria-label={`阶段 ${index + 1} ${label}`} onChange={value => update({ [key]: value })}/></Space>)}
    </Space>}/>;
}

function CacheL2Field({ id, value, row, onChange }) {
  return <RowsEditor id={id} items={Array.isArray(value) ? value : cacheL2Entries(row)} onChange={onChange} addLabel="添加 L2 存储"
    blank={{ type: '本地文件系统', location: '' }} render={(item, index, update) => <Space wrap>
      <Select aria-label={`L2 存储 ${index + 1} 类型`} value={item.type} optionList={optionList(cacheL2Kinds)} onChange={type => update({ type, location: '' })}/>
      <Input aria-label={`L2 存储 ${index + 1} 地址`} placeholder="存储地址" value={item.location} onChange={location => update({ location })}/>
    </Space>}/>;
}

const modelScopeRepositories = {
  'catalog-glm52': 'ZhipuAI/GLM-5.2-FP8', 'catalog-bge-m3': 'BAAI/BGE-M3', 'catalog-qwen35-9b': 'Qwen/Qwen3.5-9B',
};
function modelHubCandidates(records, source) {
  return (records[cataloguePage] || []).flatMap(row => {
    const expected = row.specs?.find(spec => spec.source === (source === 'ModelScope' ? 'model_scope' : 'huggingface'))?.repository;
    const repository = expected || (row.source === source ? row.repository : source === 'ModelScope' ? modelScopeRepositories[row.id] : '');
    return repository ? [{ ...row, repository }] : [];
  });
}
function ModelRepositoryField({ id, value, draft, records, onChange }) {
  const candidates = modelHubCandidates(records, draft.source);
  return <Space vertical align="start" id={id} style={{ width: '100%' }}>
    <Input value={value} onChange={onChange} aria-label="模型仓库" placeholder="组织名/模型名"/>
    {candidates.length > 0 && <Select filter value={undefined} aria-label="搜索推荐模型仓库" placeholder="搜索推荐模型仓库"
      optionList={candidates.map(row => ({ value: row.repository, label: row.repository }))} onChange={onChange} style={{ width: '100%' }}/>}
  </Space>;
}

const sourceSlots = {
  [cataloguePage]: [{ key: 'catalog', label: '模型库', file: true }],
  [cachePage]: [{ key: 'cache-provider', label: '缓存提供方', file: true, embedded: true }],
};
const officialSource = kind => `https://ota.gpustack.ai/latest/${kind}.yaml`;
const sourceMode = slot => ({ mode: slot.embedded ? '内置' : '官方', url: '', content: '', checks: '', autoUpdate: true });

function catalogDocument(rows) {
  return { model_sets: rows.map(row => ({ name: row.name, description: row.description || '', categories: [row.category],
    licenses: row.license ? row.license.split('、') : [], maker: row.maker || '', model_code: row.modelCode || '', specs: (row.specs?.length ? row.specs : [{
      mode: row.spec || '', backend: row.backend || '', source: row.source === 'ModelScope' ? 'model_scope' : row.source === '本地路径' ? 'local_path' : 'huggingface', repository: row.repository,
    }]).map(spec => ({ mode: spec.mode, backend: spec.backend, source: spec.source, quantization: spec.quantization,
      backend_version:spec.backendVersion, image_name:spec.imageName, backend_parameters:spec.parameters, env:spec.environment,
      gpu_filters:spec.gpuFilters, speculative_config:spec.speculativeConfig, categories:spec.categories,
      ...(spec.filename && spec.source==='huggingface' ? { huggingface_filename:spec.filename }
        : spec.filename && spec.source==='model_scope' ? { model_scope_file_path:spec.filename } : {}),
      [spec.source === 'model_scope' ? 'model_scope_model_id' : spec.source === 'local_path' ? 'local_path' : 'huggingface_repo_id']: spec.repository,
    })) })), draft_models: [] };
}

function normalizeCatalog(document, previous) {
  if (!Array.isArray(document.model_sets) || !document.model_sets.length || document.model_sets.length > 500) throw Error('model_sets 须包含 1–500 个模型。');
  const categories = { llm: '语言模型', embedding: '向量模型', reranker: '重排序', image: '图像生成', audio: '语音', vision: '多模态理解' };
  const used = new Set();
  return document.model_sets.map(entry => {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    const spec = Array.isArray(entry?.specs) && entry.specs.find(item => item?.source && (item.backend || item.image_name));
    if (!name || used.has(name.toLocaleLowerCase()) || !spec) throw Error('模型名称必须唯一，且至少有一项包含来源与推理后端的规格。');
    used.add(name.toLocaleLowerCase());
    const source = { huggingface: 'Hugging Face', model_scope: 'ModelScope', local_path: '本地路径' }[spec.source];
    const repository = spec.huggingface_repo_id || spec.model_scope_model_id || spec.local_path;
    if (!source || typeof repository !== 'string' || !repository.trim()) throw Error(`请核对 ${name} 的模型来源与仓库路径。`);
    const existing = previous.find(row => row.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const type = entry.categories?.[0];
    const specs = entry.specs.map((value,index)=>readCatalogueRecipe(value, name + ' 的规格 ' + (index + 1)));
    return { ...existing, id: existing?.id || resourceId('catalog'), name, source, repository, description: String(entry.description || ''),
      maker: String(entry.maker || ''), modelCode: String(entry.model_code || existing?.modelCode || ''), category: categories[type] || (modelCategories.includes(type) ? type : '语言模型'),
      license: Array.isArray(entry.licenses) ? entry.licenses.map(String).join('、') : '', backend: String(spec.backend || ''), spec: String(spec.mode || 'standard'), specs };
  });
}

function validateSourceUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !url.hash && !url.search && /\.ya?ml$/i.test(url.pathname);
  } catch { return false; }
}

function YAMLText({ value, onChange, ariaLabel = 'YAML 内容' }) {
  const id = useId();
  const file = useRef(null);
  const [error, setError] = useState('');
  return <Space vertical align="start" style={{ width: '100%' }}>
    <input id={id} ref={file} type="file" hidden accept=".yaml,.yml,application/yaml,text/yaml" onChange={async event => {
      const selected = event.target.files?.[0];
      event.target.value = '';
      if (!selected) return;
      try {
        if (selected.size > 4 * 1024 * 1024) throw Error('YAML 文件不能超过 4 MiB。');
        onChange(await selected.text());
        setError('');
      } catch (issue) { setError(issue.message); }
    }}/>
    <Button htmlType="button" onClick={() => file.current?.click()}>导入 YAML 文件</Button>
    {error && <Banner type="danger" description={error} closeIcon={null}/>}
    <TextArea rows={10} aria-label={ariaLabel} value={value} onChange={onChange} spellCheck={false} style={{ width: '100%' }}/>
  </Space>;
}

function SourceDrawer({ pageId, page, records, commit, busy, onClose }) {
  const slots = sourceSlots[pageId];
  const [active, setActive] = useState(slots[0].key);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(slots.map(slot => [slot.key, { ...sourceMode(slot), ...readSettings()[slot.key] }])));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const slot = slots.find(item => item.key === active);
  const draft = drafts[active];
  const update = patch => setDrafts(current => ({ ...current, [active]: { ...current[active], ...patch } }));
  const choices = [slot.embedded ? '内置' : '官方', 'URL', ...(slot.file ? ['YAML 文件'] : [])];
  const builtInFile = () => {
    const document = pageId === cataloguePage ? catalogDocument(page.seed) : [
      { name: 'LMCache', versions: ['0.4.2', '0.4.1', '自定义'] }, { name: 'Mooncake', versions: ['外部服务'] }, { name: 'XSKY MeshFusion', versions: ['自定义'] },
    ];
    download(`${active}.yaml`, dump(document, { noRefs: true }), 'application/yaml');
  };
  const check = (refresh = false) => {
    setError('');
    if (draft.mode === 'URL' && !validateSourceUrl(draft.url.trim())) { setError('请输入指向 YAML 文件且不含凭证的 HTTP(S) URL。'); return; }
    update({ checks: refresh ? '已完成一次模拟更新，目录内容按已保存的配置保留。' : draft.mode === 'URL' ? '地址格式通过。当前环境使用内置目录验证配置。' : '内置来源可以使用。' });
  };
  const save = async () => {
    if (saving || busy) return;
    setSaving(true);
    setError('');
    try {
      let document;
      if (draft.mode === 'URL' && !validateSourceUrl(draft.url.trim())) throw Error('请输入指向 YAML 文件且不含凭证的 HTTP(S) URL。');
      if (draft.mode === 'YAML 文件') document = decodeYaml(draft.content);
      let definitions;
      if (pageId === cachePage && document) {
        const providers = Array.isArray(document) ? document : document.providers;
        if (!Array.isArray(providers) || !providers.length || providers.some(item => typeof item?.name !== 'string' || !item.name.trim() || item.versions != null && (!Array.isArray(item.versions) || item.versions.some(version => typeof version !== 'string')) || /(?:TOKEN|PASSWORD|SECRET|API_KEY)=/i.test(String(item.detail || ''))) || new Set(providers.map(item => item.name)).size !== providers.length) throw Error('请填写名称唯一的缓存提供方列表和版本。');
        const missing = (records[cachePage] || []).filter(row => !providers.some(item => item.name === row.provider && (!Array.isArray(item.versions) || item.versions.includes(row.version))));
        if (missing.length) throw Error(`配置会移除正在使用的提供方或版本。请先调整 ${missing.map(row => row.name).join('、')}。`);
        definitions = providers.map(item => ({ name: item.name.trim(), detail: String(item.detail || ''), versions: item.versions || ['自定义'] }));
      }
      let storedContent = '';
      if (pageId === cataloguePage && (document || draft.mode === '官方')) {
        await commit(latest => {
          const next = document ? normalizeCatalog(document, latest) : page.seed.map(seed => ({ ...seed, id: latest.find(row => row.name === seed.name)?.id || seed.id }));
          if (document) storedContent = dump(catalogDocument(next), { noRefs: true });
          return next;
        }, '模型库已更新');
      }
      saveSetting(active, { mode: draft.mode, url: draft.mode === 'URL' ? draft.url.trim() : '',
        content: definitions ? dump(definitions, { noRefs: true }) : storedContent, definitions,
        checks: draft.checks, autoUpdate: !slot.embedded && draft.autoUpdate });
      Toast.success('来源设置已保存');
      onClose();
    } catch (issue) { setError(issue.message); }
    finally { setSaving(false); }
  };
  const title = pageId === cachePage ? '管理缓存提供方' : '管理来源';
  return <AdminSideSheet title={title} visible width="min(700px, 100vw)" closeOnEsc={!saving} onCancel={() => !saving && onClose()}
    footer={<><Button disabled={saving} onClick={onClose}>取消</Button><Button theme="solid" loading={saving} onClick={save}>保存</Button></>}>
    <Space vertical align="start" style={{ width: '100%' }}>
      {slots.length > 1 && <Tabs activeKey={active} onChange={key => { setActive(key); setError(''); }}>{slots.map(item => <Tabs.TabPane key={item.key} itemKey={item.key} tab={item.label}/>)}</Tabs>}
      {error && <Banner type="danger" description={error} closeIcon={null}/>}
      <Choice label="来源方式" value={draft.mode} options={choices.map(mode => [mode, mode])}
        onChange={mode => update({ mode, checks: '' })}/>
      {draft.mode === 'URL' && <>
        <Input aria-label="来源 URL" value={draft.url} onChange={url => update({ url, checks: '' })} placeholder={slot.embedded ? 'https://example.com/cache.yaml' : officialSource(active)}/>
        {!slot.embedded && <Checkbox checked={draft.autoUpdate} onChange={event => update({ autoUpdate: event.target.checked })}>自动更新</Checkbox>}
        <Space><Button onClick={() => check()}>测试来源</Button><Button onClick={() => check(true)}>立即更新</Button></Space>
      </>}
      {draft.mode === 'YAML 文件' && <>
        <Button icon={<IconDownload/>} onClick={builtInFile}>{slot.embedded ? '下载内置文件' : '下载官方示例'}</Button>
        <YAMLText value={draft.content} onChange={content => update({ content })}/>
      </>}
      {draft.checks && <Banner type="info" description={draft.checks} closeIcon={null}/>}
      {draft.mode === '官方' && <Paragraph copyable>{officialSource(active)}</Paragraph>}
    </Space>
  </AdminSideSheet>;
}

function SourcesButton(props) {
  const [open, setOpen] = useState(false);
  if (props.records.actorRole !== '平台管理员') return null;
  return <><Button onClick={() => setOpen(true)}>{props.pageId === cachePage ? '管理缓存提供方' : '管理来源'}</Button>
    {open && <SourceDrawer {...props} onClose={() => setOpen(false)}/>}</>;
}

function CatalogueHeader(props) {
  const { records, navigate } = props;
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('Hugging Face');
  const [query, setQuery] = useState('');
  const rows = modelHubCandidates(records, source).filter(row => `${row.name} ${row.repository}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <Space wrap>
    <SourcesButton {...props}/>
    <Button theme="solid" icon={<IconSearch aria-hidden="true"/>} onClick={() => { setQuery(''); setOpen(true); }}>浏览其他仓库</Button>
    {open && <AdminSideSheet title="浏览模型仓库" visible onCancel={() => setOpen(false)} closeOnEsc width="min(730px, 100vw)">
      <Space vertical align="start" style={{ width: '100%' }}>
        <Select aria-label="模型仓库类型" value={source} optionList={optionList(sourceLabels.slice(0, 2))} onChange={setSource}/>
        <Input prefix={<IconSearch/>} aria-label="搜索仓库" placeholder="搜索模型或仓库" value={query} onChange={setQuery} showClear/>
        <AdminTable rowKey="id" columns={[
          { title: '模型', dataIndex: 'name' }, { title: '仓库', dataIndex: 'repository' },
          { title: '操作', render: (_text, row) => <Button size="small" theme="borderless" disabled={!linkedDeploymentModel(row, records.deployableModels || [])} onClick={() => {
            navigate(`deployments?${new URLSearchParams({ view: 'create', catalogModel: row.id, repositorySource: source, repository: row.repository })}`);
          }}>部署</Button> },
        ]} dataSource={rows} pagination={false} empty="没有符合条件的模型仓库"/>
      </Space>
    </AdminSideSheet>}
  </Space>;
}

function CatalogueDetail({ row, records, navigate, page }) {
  const specs = row.specs?.length ? row.specs : [{ mode: row.spec, backend: row.backend, repository: row.repository }];
  const [spec, setSpec] = useState(0);
  const selected = specs[spec];
  return <Space vertical align="start" style={{ width: '100%' }}>
    <AdminDescriptions data={page.detail.filter(item => !['spec', 'backend', 'repository'].includes(item.key)).map(item => ({ key: item.label, value: item.format ? item.format(row[item.key], row, records) : row[item.key] || '—' }))}/>
    <Select value={String(spec)} aria-label="部署规格" optionList={specs.map((item, index) => ({ value: String(index), label: [item.mode, item.quantization, item.backend].filter(Boolean).join(' · ') }))}
      onChange={value => setSpec(Number(value))}/>
    <AdminDescriptions data={[ { key: '推理后端', value: selected.backend }, { key: '模型仓库', value: selected.repository }, { key: '许可证', value: row.license || '—' } ]}/>
    <Button theme="solid" onClick={() => navigate(`deployments?${new URLSearchParams({ view: 'create', catalogModel: row.id })}`)}>部署模型</Button>
  </Space>;
}

function ModelFacts({ row, records, fields }) {
  return <AdminDescriptions data={fields.map(field => {
    const value = field.format ? field.format(row[field.key], row, records) : row[field.key];
    const label = Array.isArray(value) ? value.join('、') : typeof value === 'boolean' ? value ? '是' : '否' : value;
    return { key: field.label, value: field.status ? <AdminStatus value={label}/> : hasValue(label) ? String(label) : '—' };
  })}/>;
}

function LogView({ entries, name, filename = 'logs.txt', defaultTail = 100 }) {
  const [tail, setTail] = useState(String(defaultTail));
  const [query, setQuery] = useState('');
  const [wrap, setWrap] = useState(true);
  const view = entries.filter(entry => entry.message.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(-Number(tail));
  const text = view.map(entry => `[${fmtDate(entry.at)}] ${entry.message}`).join('\n');
  return <Space vertical align="start" style={{ width: '100%' }}>
    <Space wrap>
      <Input value={query} onChange={setQuery} prefix={<IconSearch/>} aria-label="搜索日志" placeholder="搜索日志" showClear/>
      <Select aria-label="日志行数" value={tail} optionList={optionList(['50', '100', '500', '1000'])} onChange={setTail}/>
      <Checkbox checked={wrap} onChange={event => setWrap(event.target.checked)}>自动换行</Checkbox>
      <Button icon={<IconDownload/>} disabled={!text} onClick={() => download(filename, text)}>下载日志</Button>
    </Space>
    {text ? <Paragraph aria-label={name || '日志'} copyable style={{ whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowX: 'auto', maxWidth: '100%' }}>{text}</Paragraph> : <Empty description={query ? '没有匹配日志' : '暂无运行日志'}/>}
  </Space>;
}

function BenchmarkHeader({ records }) {
  const [open, setOpen] = useState(false);
  const [unlimited, setUnlimited] = useState(true);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState('');
  if (records.actorRole !== '平台管理员') return null;
  const reports = (records[benchmarkPage] || []).filter(row => row.status === '已完成');
  const usedMiB = new Blob([JSON.stringify(reports)]).size / 1024 / 1024;
  return <><Button onClick={() => {
    const storage = readSettings().benchmarkArchive;
    setUnlimited(storage?.unlimited ?? true);
    setLimit(storage?.limit ?? 20);
    setError('');
    setOpen(true);
  }}>归档空间</Button>
    {open && <AdminModal title="基准测试归档空间" visible onCancel={() => setOpen(false)} okText="保存" onOk={() => {
      try {
        if (!unlimited && (!Number.isFinite(Number(limit)) || Number(limit) < 1 || limit * 1024 < usedMiB)) throw Error('容量上限不得小于 1 GiB 或已使用容量。');
        saveSetting('benchmarkArchive', { unlimited, limit: unlimited ? null : Number(limit) });
        Toast.success('归档空间设置已保存');
        setOpen(false);
      } catch (issue) { setError(issue.message); }
    }}>
      <Space vertical align="start">
        {error && <Banner type="danger" description={error} closeIcon={null}/>}
        <Text>{`已归档 ${reports.length} 份报告，使用 ${usedMiB.toFixed(3)} MiB`}</Text>
        <Space><Switch aria-label="不限容量" checked={unlimited} onChange={setUnlimited}/><Text>不限容量</Text></Space>
        {!unlimited && <InputNumber value={limit} min={1} max={10240} aria-label="容量上限（GiB）" onChange={setLimit} suffix="GiB"/>}
      </Space>
    </AdminModal>}</>;
}

const benchmarkMetrics = [
  { label: '输出吞吐量', key: 'throughput', unit: ' Token/s' }, { label: 'P95 TTFT', key: 'ttft', unit: ' ms' },
  { label: 'P95 TPOT', key: 'tpot', unit: ' ms' }, { label: 'P95 总时延', key: 'totalLatency', unit: ' ms' },
  { label: '成功率', key: 'resultRate', unit: '%' },
];

function BenchmarkCompare({ selectedRows, ...props }) {
  const [open, setOpen] = useState(false);
  const compared = selectedRows.filter(row => row.status === '已完成').slice(0, 5);
  return <><ModelOperationProgress {...props}/>{compared.length >= 2 && <Button className="infra-batch-actions" onClick={() => setOpen(true)}>比较选中结果</Button>}
    {open && <AdminSideSheet title="比较基准测试" visible closeOnEsc onCancel={() => setOpen(false)} width="min(1050px, 100vw)">
      <AdminTable rowKey="id" dataSource={compared} pagination={false} columns={[
        { title: '测试名称', dataIndex: 'name' }, { title: '测试对象', dataIndex: 'targetName' },
        ...benchmarkMetrics.map(metric => ({ title: metric.label, dataIndex: metric.key, render: value => fmtUnit(value, metric.unit) })),
      ]}/>
    </AdminSideSheet>}
  </>;
}

function BenchmarkStages({ row }) {
  const [stageId,setStageId] = useState(null);
  const [metric,setMetric] = useState('ttft');
  const stages = row.stageResults ?? [];
  if (!stages.length) return null;
  const stage = stages.find(item=>item.id===stageId) || stages.at(-1);
  const measured = benchmarkMetrics.filter(item=>['ttft','tpot','totalLatency','throughput'].includes(item.key));
  const current = measured.find(item=>item.key===metric);
  return <Card title="阶段结果">
    <Space vertical align="start" style={{width:'100%'}}>
      <Space wrap>
        <Select aria-label="选择阶段" value={stage.id} optionList={stages.map(item=>({label:`阶段 ${item.id} · 负载 ${item.load}`,value:item.id}))} onChange={setStageId}/>
        <Select aria-label="阶段指标" value={metric} optionList={measured.map(item=>({label:item.label,value:item.key}))} onChange={setMetric}/>
        <Text type="tertiary">模拟采样</Text>
      </Space>
      <TimeSeriesChart labels={stages.map(item=>`阶段 ${item.id}`)} label={current.label} unit={current.unit.trim()}
        height={210} series={[{label:current.label,values:stages.map(item=>item[metric])}]}/>
      <AdminTable rowKey="key" dataSource={measured.map(item=>({ key:item.key, name:item.label, result:fmtUnit(stage[item.key],item.unit) }))}
        pagination={false} columns={[{title:'指标',dataIndex:'name'},{title:'所选阶段',dataIndex:'result'}]}/>
    </Space>
  </Card>;
}

function BenchmarkDetail({ row, records, page, panel, openDetail, openEditor, navigate, standalone, ...props }) {
  const [tab, setTab] = useState('summary');
  const [logs, setLogs] = useState(false);
  const reports = records[benchmarkPage] || [];
  const events = row.runEvents || [{ at: row.createdAt, message: `模拟测试已登记，状态为${row.status}。` }];
  const select = value => { const selected = reports.find(item => item.id === value); if (selected) openDetail(selected); };
  if (panel === 'logs') return <LogView entries={events} name="基准测试日志" filename={`${row.id}.log`}/>;
  const regularFields = page.detail.filter(field => !['resultRate', 'throughput', 'ttft', 'tpot', 'resultSource', 'completed'].includes(field.key));
  const extraFields = page.fields.filter(field => !regularFields.some(item => item.key === field.key) && field.type !== 'benchmarkStages' && (!field.visible || field.visible(row)));
  return <Space vertical align="start" style={{ width: '100%' }}>
    {standalone && <ModelOperationProgress {...props}/>}
    <Space wrap>
      <Select value={row.id} aria-label="切换基准测试" filter optionList={reports.map(item => ({ label: item.name, value: item.id }))} onChange={select}/>
      <AdminStatus value={row.status}/>
      <Button onClick={() => setLogs(true)}>查看日志</Button>
      <Button onClick={() => openEditor({ row })}>编辑</Button>
      <Button onClick={() => openEditor({ title: '克隆基准测试', preset: benchmarkClone(row, records) })}>克隆</Button>
      {row.status === '已完成' && <Button icon={<IconDownload aria-hidden="true"/>} onClick={() => {
        const file = benchmarkExport([row]);
        download(file.name, file.content, file.type);
      }}>导出结果</Button>}
      <Button theme="borderless" onClick={() => navigate(benchmarkPage)}>全部测试</Button>
    </Space>
    <Tabs activeKey={tab} onChange={setTab} style={{ width: '100%' }}>
      <Tabs.TabPane itemKey="summary" tab="概览">
        {row.status === '已完成' ? <>
          <div className="infra-card-grid">{benchmarkMetrics.map(metric => <Card key={metric.key} title={metric.label}>
            <Title heading={4}>{fmtUnit(row[metric.key], metric.unit)}</Title></Card>)}</div>
          <ModelFacts row={row} records={records} fields={page.detail.filter(item => ['requests', 'completed', 'latencySlo', 'resultSource', 'description'].includes(item.key))}/>
          <BenchmarkStages key={row.id} row={row}/>
        </> : <Empty description={row.status === '运行中' ? '测试正在运行，完成后显示结果。' : '当前测试无结果。'}/>}
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="configuration" tab="配置">
        <ModelFacts row={row} records={records} fields={[...regularFields, ...extraFields]}/>
        {row.stages?.length > 0 && <AdminTable rowKey="index" pagination={false} dataSource={row.stages.map((stage, index) => ({ ...stage, index: index + 1 }))}
          columns={[{ title: '阶段', dataIndex: 'index' }, { title: '负载', dataIndex: 'load' }, { title: '请求数', dataIndex: 'requests' }, { title: '时长（秒）', dataIndex: 'duration' }]}/>}
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="environment" tab="运行环境">
        <AdminDescriptions data={[
          { key: '集群', value: row.environment?.cluster || records.clusters?.find(cluster => cluster.id === row.clusterId)?.name || '—' },
          { key: '节点', value: row.environment?.node || '未采集' }, { key: 'GPU', value: row.environment?.gpu || '未采集' },
          { key: '测量对象', value: row.targetName || '—' },
        ]}/>
      </Tabs.TabPane>
    </Tabs>
    {logs && <AdminSideSheet title="查看基准测试日志" visible width="min(720px, 100vw)" onCancel={() => setLogs(false)} closeOnEsc>
      <LogView entries={events} name="基准测试日志" filename={`${row.id}.log`}/>
    </AdminSideSheet>}
  </Space>;
}

function CacheHeader(props) {
  const { openEditor, records } = props;
  const [pick, setPick] = useState(false);
  const savedDefinitions = readSettings()['cache-provider']?.definitions;
  const available = Array.isArray(savedDefinitions) ? savedDefinitions : [
    { name: 'LMCache', detail: '为同一节点上的推理副本共享缓存，可连接 L2 存储。', versions: ['0.4.2', '0.4.1', '自定义'] },
    { name: 'Mooncake', detail: '连接预先搭建的企业版共享缓存服务。', versions: ['外部服务'] },
    { name: 'XSKY MeshFusion', detail: '使用自定义运行镜像提供共享缓存。', versions: ['自定义'] },
  ];
  return <Space wrap>
    <SourcesButton {...props}/>
    <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} onClick={() => setPick(true)}>添加缓存服务</Button>
    {pick && <AdminSideSheet title="选择缓存提供方" visible closeOnEsc width="min(760px, 100vw)" onCancel={() => setPick(false)}>
      <div className="infra-card-grid">{available.map(provider => <Card key={provider.name} title={provider.name} footer={<Button onClick={() => {
        setPick(false);
        openEditor({ title: `添加 ${provider.name} 缓存服务`, preset: { provider: provider.name, version: provider.versions?.[0] || '自定义' } });
      }}>使用</Button>}>
        <Paragraph>{provider.detail || ''}</Paragraph>
        <Text type="secondary">{(records[cachePage] || []).filter(row => row.provider === provider.name).length} 个服务</Text>
      </Card>)}</div>
    </AdminSideSheet>}
  </Space>;
}

function CacheRows({ row, records, commit, busy }) {
  const [recreate, setRecreate] = useState(null);
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');
  const instances = cacheInstances(row, records);
  const run = async () => {
    try {
      await commit((latest, all) => {
        const current = latest.find(item => item.id === row.id);
        if (!current || current.provider === 'Mooncake' || !cacheInstances(current, all).some(item => item.id === recreate.id)) throw Error('缓存实例已不可用，请返回列表重新选择。');
        const previous = current.instanceStatus || {};
        const event = messageAt(`${recreate.name} 的缓存实例已模拟重建。`);
        const next = { ...current, instanceStatus: { state: { ...previous.state, [recreate.id]: '运行中' }, events: { ...previous.events, [recreate.id]: event } }, cacheEvents: [...(current.cacheEvents || []), event] };
        const confirmed = cacheInstances(next, all).filter(item => item.state === '运行中').length;
        return latest.map(item => item.id === current.id ? { ...next, ready: `${confirmed} / ${instances.length}`, status: confirmed ? '运行中' : '异常' } : item);
      }, '缓存实例已重建');
      setRecreate(null);
    } catch (issue) { setError(issue.message); }
  };
  return <>
    <AdminTable rowKey="id" dataSource={instances} pagination={false} empty="当前配置没有可展示的实例" columns={[
      { title: '实例节点', dataIndex: 'name' }, { title: '地址', dataIndex: 'address' },
      { title: '内存容量', dataIndex: 'memoryGiB', render: value => fmtUnit(value, ' GiB') },
      { title: '状态', dataIndex: 'state', render: value => <AdminStatus value={value}/> },
      { title: '最近检查', dataIndex: 'observedAt', render: fmtDate },
      { title: '操作', render: (_value, item) => <Space wrap>
        <Button theme="borderless" size="small" onClick={() => setLogs(item)}>查看日志</Button>
        {item.id !== 'external' && <Button theme="borderless" size="small" onClick={() => { setError(''); setRecreate(item); }}>重建实例</Button>}
      </Space> },
    ]}/>
    {recreate && <AdminModal title="重建缓存实例" visible onCancel={() => !busy && setRecreate(null)} confirmLoading={busy} onOk={run}>
      <Paragraph>{`重建 ${recreate.name} 的共享缓存实例？`}</Paragraph>
      {error && <Banner type="danger" description={error} closeIcon={null}/>}
    </AdminModal>}
    {logs && <AdminSideSheet title={`实例日志 · ${logs.name}`} visible width="min(720px, 100vw)" onCancel={() => setLogs(null)} closeOnEsc>
      <LogView name="缓存实例日志" entries={(row.cacheEvents || []).filter(event => event.message.includes(logs.name))} filename={`cache-${logs.id}.log`}/>
    </AdminSideSheet>}
  </>;
}

const cacheDemoSamples = {
  'cache-nanjing': [
    { at: '2026-11-26T18:25:00+08:00', worker: 'worker-nj-a-01', hit: 63.1, occupancy: 41, reads: 329.4, writes: 211.5 },
    { at: '2026-11-26T18:30:00+08:00', worker: 'worker-nj-a-01', hit: 66.4, occupancy: 43, reads: 349.2, writes: 202.8 },
    { at: '2026-11-26T18:35:00+08:00', worker: 'worker-nj-a-01', hit: 64.8, occupancy: 44, reads: 381.8, writes: 213 },
    { at: '2026-11-26T18:40:00+08:00', worker: 'worker-nj-a-02', hit: 65.2, occupancy: 37, reads: 317, writes: 205.2 },
  ],
  'cache-suzhou': [{ at: '2026-11-26T18:40:00+08:00', worker: 'external', hit: 69, occupancy: 62, reads: 403, writes: 277 }],
};
const cacheMetrics = [{ label: '缓存命中率', key: 'hit', unit: '%' }, { label: '缓存占用率', key: 'occupancy', unit: '%' }, { label: '读取速率', key: 'reads', unit: ' MiB/s' }, { label: '写入速率', key: 'writes', unit: ' MiB/s' }];

function CacheMonitor({ row, records }) {
  const [node, setNode] = useState('all');
  const [range, setRange] = useState('60');
  const [metric, setMetric] = useState('hit');
  const available = (row.metrics || cacheDemoSamples[row.id] || []).filter(sample => node === 'all' || sample.worker === node);
  const max = Math.max(...available.map(sample => new Date(sample.at).getTime()));
  const samples = available.filter(sample => max - new Date(sample.at).getTime() <= Number(range) * 60000);
  const selected = cacheMetrics.find(item => item.key === metric);
  return <Space vertical align="start" style={{ width: '100%' }}>
    <Space wrap>
      <Select aria-label="监控节点" value={node} optionList={[ { label: '全部节点', value: 'all' }, ...cacheInstances(row, records).map(item => ({ label: item.name, value: item.id })) ]} onChange={setNode}/>
      <Select aria-label="监控时间范围" value={range} optionList={[{ label: '最近 5 分钟', value: '5' }, { label: '最近 15 分钟', value: '15' }, { label: '最近 1 小时', value: '60' }, { label: '最近 24 小时', value: '1440' }]} onChange={setRange}/>
      <Select aria-label="监控指标" value={metric} optionList={cacheMetrics.map(item => ({ label: item.label, value: item.key }))} onChange={setMetric}/>
    </Space>
    {samples.length > 0 ? <Card title={`${selected.label} · 模拟采样`} style={{ width: '100%' }}>
      <TimeSeriesChart label={selected.label} labels={samples.map(sample => fmtDate(sample.at).split(' ').at(-1))}
        series={[{ label: selected.label, values: samples.map(sample => sample[metric]) }]}
        unit={selected.unit} domain={selected.unit === '%' ? [0, 100] : undefined} height={190}/>
      <AdminTable rowKey="at" pagination={false} dataSource={samples} columns={[
        { title: '采样时间', dataIndex: 'at', render: fmtDate }, { title: '节点', dataIndex: 'worker' },
        { title: selected.label, dataIndex: selected.key, render: value => fmtUnit(value, selected.unit) },
      ]}/>
    </Card> : <Empty description="该时间范围内暂无符合条件的缓存监控样本"/>}
  </Space>;
}

function CacheDetail({ row, records, page, panel, openDetail, openEditor, navigate, ...props }) {
  const [tab, setTab] = useState(panel === 'monitor' ? 'monitor' : 'overview');
  const [logs, setLogs] = useState(false);
  const events = row.cacheEvents || (row.checkResult ? [{ at: row.updatedAt || row.createdAt, message: row.checkResult }] : []);
  if (panel === 'logs') return <LogView entries={events} name="缓存服务日志" filename={`cache-${row.id}.log`}/>;
  const linked = cacheAttachments(row, records);
  return <Space vertical align="start" style={{ width: '100%' }}>
    {props.standalone && <ModelOperationProgress {...props}/>}
    <Space wrap>
      <Select value={row.id} aria-label="切换缓存服务" filter optionList={(records[cachePage] || []).map(item => ({ value: item.id, label: item.name }))} onChange={id => {
        const target = records[cachePage].find(item => item.id === id);
        if (target) openDetail(target);
      }}/>
      <AdminStatus value={row.status}/>
      <Button onClick={() => openEditor({ row })}>编辑</Button>
      <Button onClick={() => setLogs(true)}>查看日志</Button>
    </Space>
    <Tabs activeKey={tab} onChange={setTab} style={{ width: '100%' }}>
      <Tabs.TabPane itemKey="overview" tab="服务概览"><ModelFacts row={row} records={records} fields={page.detail}/></Tabs.TabPane>
      <Tabs.TabPane itemKey="monitor" tab="监控"><CacheMonitor row={row} records={records}/></Tabs.TabPane>
      <Tabs.TabPane itemKey="instances" tab="缓存实例"><CacheRows row={row} records={records} {...props}/></Tabs.TabPane>
      <Tabs.TabPane itemKey="deployments" tab="关联部署"><AdminTable rowKey="id" dataSource={linked} pagination={false} empty="暂无关联部署" columns={[
        { title: '部署', dataIndex: 'name', render: (name, deployment) => <Button theme="borderless" onClick={() => navigate(`deployments?deployment=${encodeURIComponent(deployment.id)}`)}>{name}</Button> },
        { title: '服务状态', dataIndex: 'status', render: value => <AdminStatus value={value}/> },
      ]}/></Tabs.TabPane>
    </Tabs>
    {logs && <AdminSideSheet title="查看缓存服务日志" visible width="min(720px, 100vw)" onCancel={() => setLogs(false)} closeOnEsc>
      <LogView entries={events} name="缓存服务日志" filename={`cache-${row.id}.log`}/>
    </AdminSideSheet>}
  </Space>;
}

function FilesHeader({ openEditor }) {
  const menu = sourceLabels.map(source => <Dropdown.Item key={source} onClick={() => openEditor({ title: source === '本地路径' ? '登记本地模型文件' : `从 ${source} 下载模型`, preset: { source } })}>{source}</Dropdown.Item>);
  return <Dropdown trigger="click" render={<Dropdown.Menu>{menu}</Dropdown.Menu>} clickToHide>
    <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} aria-label="添加模型文件">添加模型文件</Button>
  </Dropdown>;
}

function RemoveFiles({ rows, records, page, commit, busy, onClose, embedded }) {
  const [deleteFromDisk, setDeleteFromDisk] = useState(rows.length === 1 && rows[0].source !== '本地路径');
  const [error, setError] = useState('');
  const remove = async () => {
      try {
        const selections = new Map(rows.map(row => [row.id, row]));
        await commit((latest, all) => {
          for (const [id, row] of selections) {
            const current = latest.find(item => item.id === id);
            if (!current || JSON.stringify(current) !== JSON.stringify(row)) throw Error('文件记录已变化，请重新选择。');
            const issue = page.canDelete?.(current, all);
            if (issue) throw Error(`${current.name} · ${issue}`);
          }
          return latest.filter(item => !selections.has(item.id));
        }, deleteFromDisk ? '已删除登记记录并模拟磁盘清理' : '已删除登记记录');
        onClose();
      } catch (issue) { setError(issue.message); }
  };
  const content = <Space vertical align="start">
      <Paragraph>{rows.length === 1 ? rows[0].name : `将删除 ${rows.length} 条模型文件记录。`}</Paragraph>
      <Checkbox checked={deleteFromDisk} onChange={event => setDeleteFromDisk(event.target.checked)}>同时模拟删除磁盘文件</Checkbox>
      {error && <Banner type="danger" description={error} closeIcon={null}/>}
      {!error && rows.length === 1 && page.canDelete?.(rows[0], records) && <Banner type="warning" description={page.canDelete(rows[0], records)} closeIcon={null}/>}
  </Space>;
  if (embedded) return <Space vertical align="start">
    {content}
    <Space><Button disabled={busy} onClick={onClose}>取消</Button><Button type="danger" theme="solid" loading={busy} onClick={remove}>删除</Button></Space>
  </Space>;
  return <AdminModal title="批量删除模型文件" visible onCancel={() => !busy && onClose()} confirmLoading={busy}
    okText="删除" okType="danger" onOk={remove}>{content}</AdminModal>;
}

function FilesExtra({ selectedRows, ...props }) {
  const [show, setShow] = useState(false);
  return <><ModelOperationProgress {...props}/>{selectedRows.length > 0 && <Button className="infra-batch-actions" type="danger" onClick={() => setShow(true)}>批量删除模型文件</Button>}
    {show && <RemoveFiles {...props} rows={selectedRows} onClose={() => setShow(false)}/>}</>;
}

function FilesDetail({ row, panel, page, records, close, ...props }) {
  if (panel === 'delete') return <RemoveFiles {...props} embedded rows={[row]} page={page} records={records} onClose={close}/>;
  return <ModelFacts row={row} records={records} fields={page.detail}/>;
}

export const MODEL_SERVICE_VIEWS = {
  [cataloguePage]: { Header: CatalogueHeader, Detail: CatalogueDetail },
  [benchmarkPage]: { Header: BenchmarkHeader, Detail: BenchmarkDetail, Extra: BenchmarkCompare, Fields: { benchmarkStages: BenchmarkStagesField } },
  [backendsPage]: INFERENCE_BACKEND_VIEW,
  [cachePage]: { Header: CacheHeader, Detail: CacheDetail, ExpandedRow: CacheRows, Extra: ModelOperationProgress, Fields: { cacheL2: CacheL2Field } },
  [filesPage]: { Header: FilesHeader, Detail: FilesDetail, Extra: FilesExtra, Fields: { modelRepository: ModelRepositoryField } },
};
