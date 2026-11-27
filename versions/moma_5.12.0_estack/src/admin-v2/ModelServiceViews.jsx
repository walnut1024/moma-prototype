import { useEffect, useId, useRef, useState } from 'react';
import { AutoComplete, Banner, Button, Card, Cascader, Checkbox, Dropdown, Empty, Input, InputNumber, RadioGroup, Select, Space, Switch, Tabs, Tag, TextArea, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconArrowDown, IconArrowUp, IconDelete, IconDownload, IconLayers, IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { DEFAULT_SCHEMA, dump, JSON_SCHEMA, load } from 'js-yaml';
import AdminDescriptions from './AdminDescriptions';
import AdminActionMenu from './AdminActionMenu';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import AdminStatus from './AdminStatus';
import AdminTable, { AdminPagination } from './AdminTable';
import { Choice, serviceOperationsUi } from './ServiceUI';
import { benchmarkLog, cacheAttachedInstances, cacheConfigurationChanged, cacheCreateDefaults, cacheInstances, cacheL2Entries, cacheLogAvailable, cacheParameterGroups, cachePlacement, cachePlacementChanged, cacheServiceLogAvailable, catalogueCategories, modelFileCreation, modelFileNodeIssue, modelFileOnNode, modelOperationDeadline, reconcileModelOperation, singleCacheFramework } from './ops-models';
import { activeCacheProvider, cacheCatalogueChangeIssue, cacheFieldState, cacheL2Default, cacheL2Values, cacheProviderCatalogue, cacheProviderSourceDocument, configuredCacheProviders, normalizeCacheProviderDocument } from './cache-provider-fields';
import { labelIssue, labelPairs } from './ops-resources';
import { resourceId } from '../resource-id.mjs';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import TableFieldHelp from '../components/TableFieldHelp';
import { INFERENCE_BACKEND_VIEW } from './InferenceBackendViews';
import { modelHubCandidates, searchModelHubCandidates } from './model-hub-candidates';
import { catalogueCategoryLabels, catalogueDocument, catalogueIconSource, readCatalogueDocument } from './model-catalogue';
import { MODEL_SOURCE_SLOTS, readModelSourceSetting } from './infrastructure-source-settings';
import { BENCHMARK_ALIGNMENT_VIEW, BenchmarkAdvancedFacts } from './BenchmarkAlignment';
import { BenchmarkExecutionEnvironment, BenchmarkStageInspector } from './BenchmarkResults';

const { Text, Paragraph, Title } = Typography;
const cataloguePage = 'ops-model-library';
const benchmarkPage = 'ops-benchmarks';
const backendsPage = 'ops-inference-backends';
const cachePage = 'ops-cache-acceleration';
const filesPage = 'ops-model-files';
const sourceLabels = ['Hugging Face', 'ModelScope', '本地路径'];
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

function decodeYaml(content, schema = JSON_SCHEMA) {
  if (!content.trim()) throw Error('请输入 YAML 内容。');
  if (new Blob([content]).size > 4 * 1024 * 1024) throw Error('YAML 文件不能超过 4 MiB。');
  const document = load(content, { schema });
  if (!document || typeof document !== 'object') throw Error('YAML 缺少有效的配置对象。');
  return document;
}

function CacheL2Field({ id, value, row, draft, onChange }) {
  const provider = activeCacheProvider(draft.provider);
  const options = provider?.l2 || {};
  const entries = Array.isArray(value) ? value : cacheL2Entries(row);
  const remaining = Object.keys(options).filter(type => !entries.some(item => item.type === type));
  const change = (index, entry) => onChange(entries.map((item, position) => index === position ? entry : item));
  const move = (index, target) => {
    const next = [...entries];
    [next[index],next[target]] = [next[target],next[index]];
    onChange(next);
  };
  return <div className="infra-cache-l2" id={id}>
    {entries.map((raw, index) => {
      const item = cacheL2Values(raw);
      const adapter = provider?.l2Adapters?.[item.type];
      const enabled = !adapter || (item.adapterEnabled ?? adapter.defaultEnabled);
      return <Card key={item.type} bodyStyle={{ padding: 12 }}>
        <div className="infra-fields">
          <div className="infra-field">
            <label id={`${id}-type-${index}`}>类型 *</label>
            <Select aria-labelledby={`${id}-type-${index}`} value={item.type} optionList={optionList([item.type, ...remaining])}
              onChange={type => change(index, cacheL2Default(draft.provider, type))}/>
          </div>
          {adapter && <div className="infra-field">
            <label id={`${id}-adapter-${index}`}>{adapter.label}</label>
            <Switch aria-labelledby={`${id}-adapter-${index}`} checked={enabled}
              onChange={adapterEnabled=>change(index,{ ...item,adapterEnabled })}/>
            {adapter.detail && <Text type="secondary" size="small">{adapter.detail}</Text>}
          </div>}
          {enabled && (options[item.type] || []).map(field => {
            const controlId = `${id}-${index}-${field.key}`;
            const update = next => change(index, { ...item, [field.key]: next });
            return <div className="infra-field" key={field.key}>
              <label id={controlId + '-label'} htmlFor={controlId}>{field.label}{field.required ? ' *' : ''}</label>
              {field.type === 'switch' ? <Switch id={controlId} aria-labelledby={controlId + '-label'} checked={item[field.key] ?? field.defaultValue} onChange={update}/> :
                field.type === 'select' ? <Select id={controlId} aria-labelledby={controlId + '-label'} aria-required={field.required}
                  optionList={field.choices ?? optionList(field.options)} value={item[field.key]} onChange={update}/> :
                field.type === 'number' ? <InputNumber id={controlId} aria-required={Boolean(field.required)} min={field.min} max={field.max}
                  step={field.step} value={item[field.key] ?? ''} onChange={update}/> :
                  <Input id={controlId} aria-required={Boolean(field.required)} disabled={field.credential}
                    value={field.credential ? '' : item[field.key] || ''} onChange={update}
                    {...(field.credential && { placeholder: '通过凭证配置提供' })}/>}
            </div>;
          })}
          <Space>
            {entries.length > 1 && <>
              <Button icon={<IconArrowUp/>} aria-label={`上移 ${item.type}`} disabled={index===0} onClick={()=>move(index,index-1)}/>
              <Button icon={<IconArrowDown/>} aria-label={`下移 ${item.type}`} disabled={index===entries.length-1} onClick={()=>move(index,index+1)}/>
            </>}
            <Button theme="borderless" type="danger" onClick={() => onChange(entries.filter((_, position) => position !== index))}>移除后端</Button>
          </Space>
        </div>
      </Card>;
    })}
    <Button icon={<IconPlus/>} disabled={!remaining.length} onClick={() => onChange([...entries, cacheL2Default(draft.provider, remaining[0])])}>添加后端</Button>
  </div>;
}

function CacheDeclaredField({ id, value, draft, onChange, records, row }) {
  const values = value || {};
  const framework = singleCacheFramework(records,draft.clusterId);
  const fields = cacheFieldState(activeCacheProvider(draft.provider),values,framework,row);
  return <div className="infra-fields" id={id}>{fields.filter(field=>field.visible).map(({field,value:current})=>{
    const controlId = `${id}-${field.key}`;
    const update = next => onChange({ ...values, [field.key]: next });
    return <div className="infra-field" key={field.key}>
      <label id={controlId + '-label'} htmlFor={controlId}>{field.label}{field.required ? ' *' : ''}</label>
      {field.type === 'switch' ? <Switch id={controlId} aria-labelledby={controlId + '-label'} checked={Boolean(current)} onChange={update}/> :
        field.type === 'select' ? <Select id={controlId} aria-labelledby={controlId + '-label'} aria-required={field.required}
          optionList={field.choices ?? optionList(field.options)} value={current} onChange={update}/> :
          field.type === 'number' ? <InputNumber id={controlId} aria-required={field.required}
            min={field.min} max={field.max} step={field.step} value={current ?? ''} onChange={update}/> :
            <Input id={controlId} aria-required={field.required} disabled={field.credential} placeholder={field.placeholder}
              value={field.credential ? '' : current ?? ''} onChange={update} {...(field.credential && { placeholder: '通过凭证配置提供' })}/>}
      {field.description && <Text type="secondary" size="small">{field.description}</Text>}
    </div>;
  })}</div>;
}

function CachePairFields({ id, field, value, onChange, draft, records }) {
  const labels = field.key === 'selector';
  const [entries, setEntries] = useState(() => labels ? labelPairs(value) : String(value || '').split('\n').filter(Boolean)
    .map(entry => {
      const divider = entry.indexOf('=');
      return divider < 0 ? [entry.trim(), ''] : [entry.slice(0, divider).trim(), entry.slice(divider + 1)];
    }));
  const change = next => {
    setEntries(next);
    onChange(labels ? next : next.map(([key, text]) => `${key.trim()}=${text}`).join('\n'));
  };
  const suggestions = new Map();
  if (labels) for (const worker of records['ops-nodes'] || []) {
    if (worker.clusterId !== draft.clusterId) continue;
    for (const [key, text] of labelPairs(worker.labels)) {
      if (!key || !text) continue;
      if (!suggestions.has(key)) suggestions.set(key, new Set());
      suggestions.get(key).add(text);
    }
  }
  const matching = (values, query) => [...values].filter(item=>item.toLowerCase().includes(query.toLowerCase())).sort();
  return <div className="infra-cache-input-list" id={id}>
    {entries.map(([key, text], index) => {
      const edit = (nextKey, nextText) => change(entries.map((pair, position) => position === index ? [nextKey, nextText] : pair));
      return <div className="infra-cache-pair" key={index}>
        {labels ? <>
          <AutoComplete aria-label={`标签键 ${index + 1}`} placeholder="标签键" value={key} data={matching(suggestions.keys(),key)}
            onChange={next=>edit(next,text)}/>
          <AutoComplete aria-label={`标签值 ${index + 1}`} placeholder="标签值" value={text} data={matching(suggestions.get(key.trim()) || [],text)}
            onChange={next=>edit(key,next)}/>
        </> : <>
          <Input aria-label={`变量名 ${index + 1}`} placeholder="变量名" value={key} onChange={next=>edit(next,text)}/>
          <Input aria-label={`变量值 ${index + 1}`} placeholder="变量值" value={text} onChange={next=>edit(key,next)}/>
        </>}
        <Button htmlType="button" icon={<IconDelete/>} theme="borderless" aria-label={`删除第 ${index + 1} 项`}
          onClick={() => change(entries.filter((_, position) => position !== index))}/>
      </div>;
    })}
    <Button theme="light" icon={<IconPlus/>} onClick={() => change([...entries, ['', '']])}>
      {labels ? '添加标签' : '添加环境变量'}
    </Button>
  </div>;
}

function CacheParametersField({ id, value, draft, onChange, records }) {
  const components = cacheParameterGroups(draft,singleCacheFramework(records,draft.clusterId));
  const args = typeof value === 'string' ? { [components.at(-1)?.key ?? 'main']: value.split('\n').filter(Boolean) } : value || {};
  return <div className="infra-cache-input-list" id={id}>
    {components.map(component => {
      const entries = args[component.key] || [];
      const change = next => onChange({ ...args, [component.key]: next });
      return <div className="infra-cache-input-list" key={component.key}>
        {components.length > 1 && <Text strong>{component.label}</Text>}
        {component.hints?.length > 0 && <Tooltip content={<span>{component.hints.slice(0,12).join(' · ')}</span>}>
          <Text size="small" type="secondary" tabIndex={0}>常用启动参数</Text>
        </Tooltip>}
        {entries.map((parameter, index) => <div className="infra-cache-parameter" key={index}>
          <Input aria-label={`${component.label} ${index + 1}`} placeholder="--max-workers=8" value={parameter}
            onChange={next => change(entries.map((entry, position) => position === index ? next : entry))}/>
          <Button icon={<IconDelete/>} theme="borderless" aria-label={`删除 ${component.label} 第 ${index + 1} 项`}
            onClick={() => change(entries.filter((_, position) => position !== index))}/>
        </div>)}
        <Button theme="light" icon={<IconPlus/>} onClick={() => change([...entries, ''])}>添加参数</Button>
      </div>;
    })}
  </div>;
}

const officialCatalogueUrl = 'https://ota.gpustack.ai/latest/model-catalog.yaml';
const noSnapshot = '此 URL 没有可用的本地快照。';
const sourceModes = { catalog: ['URL', 'YAML 文件', '内嵌'], 'cache-provider': ['YAML 文件', 'URL', '内嵌'] };

function sourceDraft(pageId, saved) {
  const official = pageId === cataloguePage;
  const initial = { mode: official ? 'URL' : 'YAML 文件', url: official ? officialCatalogueUrl : '', content: '', officialHours: official ? 12 : 0, customHours: 0 };
  if (!saved) return initial;
  const legacyOfficial = saved.mode === '官方';
  const customUrl = saved.mode === 'URL' && saved.url && saved.url.trim() !== officialCatalogueUrl;
  return { ...initial, ...saved,
    mode: saved.mode === '内置' ? '内嵌' : legacyOfficial ? 'URL' : saved.mode,
    url: legacyOfficial ? officialCatalogueUrl : saved.url || initial.url,
    officialHours: saved.officialHours ?? (!customUrl ? saved.autoUpdateHours : undefined) ?? initial.officialHours,
    customHours: saved.customHours ?? (customUrl ? saved.autoUpdateHours : undefined) ?? 0,
  };
}

function restorePackagedCatalogue(seed, latest) {
  const ids = new Map(latest.map(row => [row.name.toLowerCase(), row.id]));
  return seed.map(row => ids.has(row.name.toLowerCase()) ? { ...row, id: ids.get(row.name.toLowerCase()) } : row);
}

function validateSourceUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

function YAMLText({ value, onChange, disabled, t }) {
  const id = useId();
  const file = useRef(null);
  const [error, setError] = useState('');
  return <Space vertical align="start" style={{ width: '100%' }}>
    <input id={id} ref={file} type="file" hidden disabled={disabled} accept=".yaml,.yml,application/yaml,text/yaml" onChange={async event => {
      const selected = event.target.files?.[0];
      event.target.value = '';
      if (!selected) return;
      try {
        if (selected.size > 4 * 1024 * 1024) throw Error('YAML 文件不能超过 4 MiB。');
        onChange(await selected.text());
        setError('');
      } catch (issue) { setError(issue.message); }
    }}/>
    <Button htmlType="button" disabled={disabled} onClick={() => file.current?.click()}>{t('导入 YAML 文件')}</Button>
    {error && <Banner type="danger" description={t(error)} closeIcon={null}/>}
    <TextArea rows={10} aria-label={t('YAML 内容')} value={value} disabled={disabled} onChange={onChange} spellCheck={false} style={{ width: '100%' }}/>
  </Space>;
}

function SourceDrawer({ pageId, page, commit, busy, onClose, t }) {
  const slot = MODEL_SOURCE_SLOTS[pageId];
  const official = pageId === cataloguePage;
  const [persisted, setPersisted] = useState(() => readModelSourceSetting(slot));
  const [draft, setDraft] = useState(() => sourceDraft(pageId, persisted));
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [operation, setOperation] = useState('');
  const pending = Boolean(operation || busy);
  const stored = sourceDraft(pageId, persisted);
  const url = draft.url.trim();
  const customUrl = Boolean(url) && (!official || url !== officialCatalogueUrl);
  const intervalKey = customUrl ? 'customHours' : 'officialHours';
  const hours = draft[intervalKey];
  const hasYaml = /(^|\n)[^\S\n]*[^\s#]/.test(draft.content);
  const activeUrl = draft.mode === 'URL' && (url || (official ? officialCatalogueUrl : ''));
  const sameUrl = stored.mode === 'URL' && activeUrl && stored.url.trim() === activeUrl;
  const showRefresh = stored.mode === 'URL' && Boolean(stored.url) || official && stored.mode === '内嵌' && !stored.content;
  const update = patch => {
    setError('');
    setFeedback('');
    setDraft(current => ({ ...current, ...patch }));
  };
  const assertCurrent = latest => {
    if (JSON.stringify(latest ?? null) !== JSON.stringify(persisted ?? null)) throw Error('此来源已更新，请重新打开设置。');
  };

  const check = async () => {
    if (pending || !sameUrl) return;
    setOperation('refresh');
    setError('');
    setFeedback('');
    try {
      if (!validateSourceUrl(stored.url)) throw Error('请输入不含凭证的 HTTP(S) URL。');
      let nextSetting;
      let changed = false;
      await commit((latest, _records, source) => {
        assertCurrent(source);
        const rows = customUrl ? latest : restorePackagedCatalogue(page.seed, latest);
        changed = JSON.stringify(rows) !== JSON.stringify(latest);
        nextSetting = { ...stored, ...(customUrl ? { lastError: noSnapshot } : {
          lastError: '', lastUpdated: changed || !stored.lastUpdated ? new Date().toISOString() : stored.lastUpdated,
        }) };
        return { rows, modelSource: nextSetting };
      });
      setPersisted(nextSetting);
      if (!customUrl) setFeedback(changed ? '目录已更新。' : '目录内容未变化。');
    } catch (issue) { setError(issue.message); }
    finally { setOperation(''); }
  };

  const save = async () => {
    if (pending) return;
    setOperation('save');
    setError('');
    try {
      const embedded = draft.mode === '内嵌';
      if (draft.mode === 'URL' && url && !validateSourceUrl(url)) throw Error('请输入不含凭证的 HTTP(S) URL。');
      if (draft.mode === 'URL' && customUrl) throw Error(noSnapshot);
      if (official && draft.mode === 'URL' && (!Number.isInteger(hours) || hours < 0 || hours > 168)) {
        throw Error('自动更新间隔须为 0–168 小时的整数。');
      }
      const inline = draft.mode === 'YAML 文件' && hasYaml;
      const document = inline ? decodeYaml(draft.content, official ? DEFAULT_SCHEMA : JSON_SCHEMA) : null;
      const mode = embedded ? '内嵌' : inline || !official ? 'YAML 文件' : 'URL';
      await commit((latest, _records, source) => {
        assertCurrent(source);
        let rows = latest;
        let content = embedded ? stored.content : '';
        let definitions = embedded ? stored.definitions : undefined;
        if (official) {
          if (document) {
            const parsed = readCatalogueDocument(document, latest);
            rows = parsed.rows;
            content = dump(catalogueDocument(parsed.rows, parsed.draftRecipes), { noRefs: true, skipInvalid: true });
          } else rows = restorePackagedCatalogue(page.seed, latest);
        } else if (document) {
          definitions = normalizeCacheProviderDocument(document, latest);
          content = dump(cacheProviderSourceDocument(definitions), { noRefs: true });
        } else {
          const issue = cacheCatalogueChangeIssue(cacheProviderCatalogue, latest);
          if (issue) throw Error(issue);
        }
        return { rows, modelSource: { mode, content, definitions,
          url: embedded ? stored.url : official ? officialCatalogueUrl : '',
          officialHours: draft.officialHours, customHours: draft.customHours,
          lastUpdated: mode === 'URL' ? (stored.mode === 'URL' && stored.url === officialCatalogueUrl && stored.lastUpdated || new Date().toISOString()) : undefined,
        } };
      });
      Toast.success(t('来源设置已保存'));
      onClose();
    } catch (issue) { setError(issue.message); }
    finally { setOperation(''); }
  };

  const title = official ? '模型库来源' : '管理缓存提供方';
  const packagedFile = official ? 'model-catalog.yaml' : 'cache-providers.yaml';
  return <AdminSideSheet title={t(title)} visible width="min(700px, 100vw)" closeOnEsc={!pending} onCancel={() => !pending && onClose()}
    footer={<><Button disabled={pending} onClick={onClose}>{t('取消')}</Button><Button theme="solid" disabled={busy || operation === 'refresh'} loading={operation === 'save'} onClick={save}>{t('保存')}</Button></>}>
    <Space vertical align="start" style={{ width: '100%' }}>
      {error && <Banner type="danger" description={t(error)} closeIcon={null}/>}
      <RadioGroup type="card" aria-label={t('来源方式')} name={slot} value={draft.mode} disabled={pending}
        options={sourceModes[slot].map(value => ({ value, label: t(value) }))} onChange={event => update({ mode: event.target.value })}/>
      {draft.mode === '内嵌' && <Banner type="info" description={t('仅使用当前版本自带内容。')} closeIcon={null}/>}
      {draft.mode === 'URL' && <>
        <Input aria-label={t('来源 URL')} value={draft.url} disabled={pending} onChange={url => update({ url })}
          placeholder={official ? officialCatalogueUrl : 'https://example.com/cache-providers.yaml'}/>
        <Space>{official && <Tag color={customUrl ? 'orange' : 'blue'}>{t(customUrl ? '自定义' : '官方')}</Tag>}
          {showRefresh && <Button disabled={!sameUrl || pending} loading={operation === 'refresh'} onClick={check}>{t('立即更新')}</Button>}
          {official && customUrl && <Button disabled={pending} onClick={() => update({ url: officialCatalogueUrl, content: '' })}>{t('重置为官方来源')}</Button>}</Space>
        {official && <Space wrap>
          <Tooltip content={t('更新间隔保存在原型设置中。目录通过手动同步检查。')}>
            <Checkbox disabled={pending} checked={hours > 0} onChange={event => update({ [intervalKey]: event.target.checked ? 12 : 0 })}>{t('自动更新')}</Checkbox>
          </Tooltip>
          {hours !== 0 && <InputNumber aria-label={t('更新间隔（小时）')} disabled={pending} min={1} max={168} step={1} suffix={t('小时')} value={hours}
            onBlur={() => { if (hours == null) update({ [intervalKey]: 1 }); }}
            onChange={value => update({ [intervalKey]: typeof value === 'number' ? value : undefined })}/>}
        </Space>}
        {sameUrl && stored.lastUpdated && <Text type="tertiary" size="small">{t('上次更新')} {fmtDate(stored.lastUpdated)}</Text>}
        {sameUrl && stored.lastError && <Banner type="warning" description={t(stored.lastError)} closeIcon={null}/>}
      </>}
      {draft.mode === 'YAML 文件' && <>
        <Text link={{ href: import.meta.env.BASE_URL + 'assets/' + packagedFile, download: packagedFile }}>
          {t(official ? '官方文件' : '内置文件')}
        </Text>
        <YAMLText value={draft.content} disabled={pending} onChange={content => update({ content })} t={t}/>
        {official && hasYaml && <Button disabled={pending} onClick={() => update({ content: '', url: officialCatalogueUrl })}>{t('重置为官方来源')}</Button>}
      </>}
      {feedback && <Banner type="info" description={t(feedback)} closeIcon={null}/>}
    </Space>
  </AdminSideSheet>;
}


function SourcesButton(props) {
  const [open, setOpen] = useState(false);
  if (props.records.actorRole !== '平台管理员') return null;
  return <><Button disabled={!props.writable || props.busy}
    onClick={() => setOpen(true)}>{props.pageId === cachePage ? '管理缓存提供方' : '管理来源'}</Button>
    {open && props.writable && <SourceDrawer {...props} onClose={() => setOpen(false)}/>}</>;
}

function CatalogueHeader(props) {
  return <Space wrap>
    <SourcesButton {...props}/>
    <Button id="model-catalogue-browse" theme="solid" icon={<IconSearch aria-hidden="true"/>}
      disabled={!props.writable || props.busy}
      onClick={() => {
        const source = props.rows[0]?.source;
        const catalogQuery = props.listQuery();
        catalogQuery.set('catalogFocus', 'model-catalogue-browse');
        props.navigate(`deployments?${new URLSearchParams({ view: 'create', source: sourceLabels.includes(source) ? source : 'Hugging Face', from: 'catalog', catalogQuery:catalogQuery.toString() })}`);
      }}>浏览更多模型</Button>
  </Space>;
}

function CatalogueCard({ row, navigate, t, listQuery, writable, busy }) {
  const categories = row.categories?.map(key => catalogueCategoryLabels[key] || catalogueCategories[key] || key) || [row.category].filter(Boolean);
  const icon = catalogueIconSource(row.icon,import.meta.env.BASE_URL);
  const [failedIcon,setFailedIcon] = useState(null);
  const licences = row.license?.split('、') || [];
  const size = row.size > 0 ? `${row.size}${row.sizeUnit || 'B'}${row.activatedSize > 0 ? `-A${row.activatedSize}B` : ''}` : '';
  const actionId = `model-catalogue-${row.id}`;
  const deploy = () => {
    const catalogQuery = listQuery();
    catalogQuery.set('catalogFocus', actionId);
    navigate(`deployments?${new URLSearchParams({ view: 'create', catalogModel: row.id, from: 'catalog', catalogQuery:catalogQuery.toString() })}`);
  };
  return <Card className="infra-catalogue-card">
    <div className="infra-catalogue-heading">
      <Space wrap>
        <span className="infra-catalogue-icon" aria-hidden="true">
          {icon && failedIcon!==icon ? <img src={icon} alt="" width="24" height="24" loading="lazy" onError={()=>setFailedIcon(icon)}/> : <IconLayers/>}
        </span>
        <Text strong>{row.name}</Text>{row.experimental && <Tag color="blue">{t('实验性')}</Tag>}
      </Space>
      <AdminActionMenu id={actionId} label={`${row.name} ${t('操作')}`} items={[
        { node:'item', key:'deploy', name:t('部署模型'), disabled:!writable || busy, onClick:deploy },
      ]}>{t('操作')}</AdminActionMenu>
    </div>
    {(row.releaseDate || licences.length > 0) && <Space wrap spacing={8}>
      {row.releaseDate && <Text type="secondary" title={t('发布日期')}>{row.releaseDate}</Text>}
      {licences.map(license => <Text key={license} type="secondary">{license}</Text>)}
    </Space>}
    <Space wrap spacing={6}>
      {categories.map(category => <Tag key={category} color="blue">{t(category)}</Tag>)}
      {row.capabilities?.map(key => <Tag key={key} color="purple">{key.split('/').reverse().join(' ').replaceAll('_', ' ')}</Tag>)}
      {size && <Text type="secondary">{size}</Text>}
    </Space>
  </Card>;
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

const benchmarkMetrics = [
  { label: '输出吞吐量', key: 'throughput', unit: ' Token/s' }, { label: 'P95 TTFT', key: 'ttft', unit: ' ms' },
  { label: 'P95 TPOT', key: 'tpot', unit: ' ms' }, { label: 'P95 总时延', key: 'totalLatency', unit: ' ms' },
  { label: '成功率', key: 'resultRate', unit: '%' },
];

function BenchmarkCompare({ selectedRows, ...props }) {
  const [open, setOpen] = useState(false);
  const compared = selectedRows.filter(row => row.status === '已完成').slice(0, 5);
  return <><ModelOperationProgress {...props}/><Button className="infra-batch-actions"
    disabled={compared.length < 2} onClick={() => setOpen(true)}>比较选中结果</Button>
    {open && <AdminSideSheet title="比较基准测试" visible closeOnEsc onCancel={() => setOpen(false)} width="min(1050px, 100vw)">
      <AdminTable rowKey="id" dataSource={compared} pagination={false} columns={[
        { title: '测试名称', dataIndex: 'name' }, { title: '测试对象', dataIndex: 'targetName' },
        ...benchmarkMetrics.map(metric => ({ title: metric.label, dataIndex: metric.key, render: value => fmtUnit(value, metric.unit) })),
      ]}/>
    </AdminSideSheet>}
  </>;
}

function BenchmarkDetail({ row, records, page, panel, openDetail, renderActions, navigate, standalone, ...props }) {
  const [tab, setTab] = useState('summary');
  const [logs, setLogs] = useState(false);
  const reports = records[benchmarkPage] || [];
  const logView = <LogView entries={benchmarkLog(row)} name="基准测试日志" filename={`${row.id}.log`}/>;
  const select = value => { const selected = reports.find(item => item.id === value); if (selected) openDetail(selected); };
  if (panel === 'logs') return logView;
  const regularFields = page.detail.filter(field => !['resultRate', 'throughput', 'ttft', 'tpot', 'resultSource', 'completed'].includes(field.key));
  const extraFields = page.fields.filter(field => !regularFields.some(item => item.key === field.key) && field.type !== 'benchmarkStages' && (!field.visible || field.visible(row)));
  return <Space vertical align="start" style={{ width: '100%' }}>
    {standalone && <ModelOperationProgress {...props}/>}
    <Space wrap>
      <Select value={row.id} aria-label="切换基准测试" filter optionList={reports.map(item => ({ label: item.name, value: item.id }))} onChange={select}/>
      <AdminStatus value={row.status}/>
      {renderActions(row, { panelActions: { logs: () => setLogs(true) } })}
      <Button theme="borderless" onClick={() => navigate(benchmarkPage)}>全部测试</Button>
    </Space>
    <Tabs activeKey={tab} onChange={setTab} style={{ width: '100%' }}>
      <Tabs.TabPane itemKey="summary" tab="概览">
        {row.status === '已完成' ? <>
          <div className="infra-card-grid">{benchmarkMetrics.map(metric => <Card key={metric.key} title={metric.label}>
            <Title heading={4}>{fmtUnit(row[metric.key], metric.unit)}</Title></Card>)}</div>
          <ModelFacts row={row} records={records} fields={page.detail.filter(item => ['requests', 'completed', 'latencySlo', 'resultSource', 'description'].includes(item.key))}/>
          <BenchmarkStageInspector key={row.id} row={row}/>
        </> : <Empty description={row.status === '运行中' ? '测试正在运行，完成后显示结果。' : '当前测试无结果。'}/>}
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="configuration" tab="配置">
        <ModelFacts row={row} records={records} fields={[...regularFields, ...extraFields]}/>
        <BenchmarkAdvancedFacts row={row}/>
        {row.stages?.length > 0 && <AdminTable rowKey="index" pagination={false} dataSource={row.stages.map((stage, index) => ({ ...stage, index: index + 1 }))}
          columns={[{ title: '阶段', dataIndex: 'index' }, { title: '负载', dataIndex: 'load' }, { title: '请求数', dataIndex: 'requests' }, { title: '时长（秒）', dataIndex: 'duration' }]}/>}
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="environment" tab="运行环境">
        <BenchmarkExecutionEnvironment key={row.id} row={row} records={records}/>
      </Tabs.TabPane>
    </Tabs>
    {logs && <AdminSideSheet title="查看基准测试日志" visible width="min(720px, 100vw)" onCancel={() => setLogs(false)} closeOnEsc>{logView}</AdminSideSheet>}
  </Space>;
}

function CacheHeader(props) {
  const { openEditor, closeEditor, records, busy, writable } = props;
  const [pick, setPick] = useState(false);
  const [saved, setSaved] = useState(null);
  const savedDefinitions = configuredCacheProviders();
  const available = Array.isArray(savedDefinitions) ? savedDefinitions.map(provider => activeCacheProvider(provider.name)) : cacheProviderCatalogue;
  const selectProvider = provider => {
    const keep = saved?.draft.provider === provider.name;
    const types=Object.keys(provider.l2 || {});
    setPick(false);
    openEditor({ title: '添加缓存服务', preset: keep ? saved.draft : { ...cacheCreateDefaults(provider.name,records),
      l2Entries:types.length===1 ? [cacheL2Default(provider.name,types[0])] : [] },
      changed: keep && saved.changed, previous: (draft, changed) => {
        setSaved({ draft, changed });
        closeEditor();
        setPick(true);
      } });
  };
  return <Space wrap>
    <SourcesButton {...props}/>
    <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!writable || busy}
      onClick={() => { setSaved(null); setPick(true); }}>添加缓存服务</Button>
    {pick && <AdminSideSheet title="选择缓存提供方" visible closeOnEsc width="min(760px, 100vw)" onCancel={() => { setSaved(null); setPick(false); }}>
      <div className="infra-card-grid">{available.map(provider => {
        const icon = catalogueIconSource(provider.icon,import.meta.env.BASE_URL);
        const source = { built_in:'内置',partner:'合作伙伴',community:'社区' }[provider.source];
        const reason = provider.unavailableReason || (provider.unavailable ? '此提供方暂不可用' : '');
        return <Card key={provider.name} title={<Space wrap>
          {icon && <img src={icon} alt="" width="24" height="24" loading="lazy"/>}
          <Text strong>{provider.displayName || provider.name}</Text>{source && <Tag>{source}</Tag>}
        </Space>} footer={<Space wrap>
          {reason ? <Tooltip content={reason}><span tabIndex={0}><Button disabled>使用</Button></span></Tooltip> :
            <Button aria-label={`使用 ${provider.displayName || provider.name}`} onClick={()=>selectProvider(provider)}>使用</Button>}
          {provider.links?.map(link=><Text key={link.url} link={{ href:link.url,target:'_blank',rel:'noopener noreferrer' }}>{link.text}</Text>)}
        </Space>}>
          <Space vertical align="start">
            <Paragraph ellipsis={{ rows:2,showTooltip:true }}>{provider.detail || ''}</Paragraph>
            {provider.frameworks?.length > 0 && <Space wrap>{provider.frameworks.map(name=><Tag color="blue" key={name}>{name}</Tag>)}</Space>}
          </Space>
        </Card>;
      })}</div>
    </AdminSideSheet>}
  </Space>;
}

function CacheFormNotice({ draft, records, row }) {
  const { warning, blocking, success } = draft.clusterId && !labelIssue(draft.selector) && (!row || cachePlacementChanged(row,draft,records))
    ? cachePlacement(draft, records) : {};
  const update = draft.clusterId && cacheConfigurationChanged(row,draft) ? '已运行的实例会继续使用原配置，重建实例后生效。' : '';
  const message = blocking || warning || update || success;
  const type = blocking && !row ? 'danger' : blocking || warning || update ? 'warning' : 'success';
  return <div role="status">{message && <Banner type={type} closeIcon={null} description={message}/>}</div>;
}

function CacheNameCell({ row, openDetail }) {
  const validManagement = row.managementUrl && validateSourceUrl(row.managementUrl);
  return <Space wrap spacing={4}>
    <Button theme="borderless" size="small" onClick={() => openDetail(row)}>{row.name}</Button>
    {validManagement && <Tooltip content="管理界面"><Typography.Text link={{ href: row.managementUrl,
      target: '_blank', rel: 'noopener noreferrer', 'aria-label': `打开 ${row.name} 的管理界面` }}>管理界面</Typography.Text></Tooltip>}
  </Space>;
}

function CacheStatusCell({ row }) {
  const status = <span tabIndex={row.checkResult ? 0 : undefined}><AdminStatus value={row.status}/></span>;
  return row.checkResult ? <Tooltip content={row.checkResult}>{status}</Tooltip> : status;
}

function CacheProviderCell({ row }) {
  const provider = activeCacheProvider(row.provider);
  const icon = catalogueIconSource(provider?.icon, import.meta.env.BASE_URL);
  return <Space spacing={8}>{icon && <img src={icon} alt="" width={16} height={16}/>}{provider?.displayName || row.provider}</Space>;
}

function CacheRows({ row, records, commit, busy, writable }) {
  const [recreate, setRecreate] = useState(null);
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');
  const instances = cacheInstances(row, records);
  const run = async () => {
    try {
      await commit((latest, all) => {
        const current = latest.find(item => item.id === row.id);
        if (!current || current.provider === 'Mooncake' || JSON.stringify(current) !== JSON.stringify(row) ||
            !cacheInstances(current, all).some(item => item.id === recreate.id)) throw Error('缓存服务或实例已更新，请返回列表重新选择。');
        const placement = cachePlacement(current, all, recreate.id);
        if (placement.blocking || placement.warning) throw Error(placement.blocking || placement.warning);
        const previous = current.instanceStatus || {};
        const event = messageAt(`${recreate.name} 的缓存实例已重建。`);
        const revisions = { ...previous.revisions, [recreate.id]: current.configRevision };
        const allRebuilt = cacheInstances(current, all).every(item => revisions[item.id] === current.configRevision);
        const next = { ...current, runningConfiguration: allRebuilt ? undefined : current.runningConfiguration,
          instanceStatus: { ...previous, revisions, state: { ...previous.state, [recreate.id]: '运行中' }, events: { ...previous.events, [recreate.id]: event } },
          cacheEvents: [...(current.cacheEvents || []), event] };
        const nextInstances = cacheInstances(next, all);
        const confirmed = nextInstances.filter(item => item.state === '运行中').length;
        return latest.map(item => item.id === current.id ? { ...next, ready: `${confirmed} / ${nextInstances.length}`, status: confirmed ? '运行中' : '异常' } : item);
      }, '缓存实例已重建');
      setRecreate(null);
    } catch (issue) { setError(issue.message); }
  };
  return <>
    <AdminTable rowKey="id" dataSource={instances} pagination={false} scroll={{ x: 680 }}
      empty="当前配置没有可展示的实例" columns={[
      { title: '实例节点', dataIndex: 'name' }, { title: '地址', dataIndex: 'address' },
      { title: '内存容量', dataIndex: 'memoryGiB', render: value => fmtUnit(value, ' GiB') },
      { title: '状态', dataIndex: 'state', render: (value, item) => <Space><AdminStatus value={value}/>{item.configPending && <Tag color="amber">配置待生效</Tag>}</Space> },
      { title: '最近检查', dataIndex: 'observedAt', render: fmtDate },
      { title: '操作', key: 'actions', width: 76, fixed: 'right', render: (_value, item) =>
        <AdminActionMenu label={`${item.name} 操作`} items={[
          { node:'item', key:'logs', name:'查看日志', disabled:item.id === 'external' || !cacheLogAvailable(item.state), onClick:() => setLogs(item) },
          { node:'item', key:'recreate', name:'删除并重建', type:'danger', disabled:item.id === 'external' || !writable || busy,
            onClick:() => { setError(''); setRecreate(item); } },
        ]}>操作</AdminActionMenu> },
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
const cacheMetrics = [
  { label: '命中率', key: 'hit', unit: '%', summary: '命中率' },
  { label: '查询流量', key: 'lookups', unit: ' tokens/s', total: true },
  { label: 'L1 使用率', key: 'occupancy', unit: '%', summary: 'L1 使用率 (RAM)' },
  { label: 'L1 缓存用量', key: 'l1Usage', unit: ' GiB', total: true, summary: 'L1 缓存用量 (RAM)' },
  { label: 'L2 缓存用量', key: 'l2Usage', unit: ' GiB', total: true, summary: 'L2 缓存用量' },
];
const cacheWindows = [['30', '30m'], ['60', '1h'], ['360', '6h'], ['1440', '24h']];

function CacheMonitor({ row, records, anchor }) {
  const [nodes, setNodes] = useState([]);
  const [range, setRange] = useState('60');
  const [display, setDisplay] = useState('aggregate');
  const instances = cacheInstances(row, records);
  const workerNames = new Map(instances.map(item => [item.id, item.name]));
  const observations = (row.metrics || cacheDemoSamples[row.id] || []).filter(sample => Number.isFinite(Date.parse(sample.at)));
  const available = observations.filter(sample => !nodes.length || nodes.includes(sample.worker));
  const max = Math.max(...observations.map(sample => Date.parse(sample.at)));
  const samples = available.filter(sample => Number.isFinite(Date.parse(sample.at)) && max - Date.parse(sample.at) <= Number(range) * 60000);
  const times = [...new Set(samples.map(sample => Date.parse(sample.at)))].sort((left, right) => left - right);
  const workers = [...new Set(samples.map(sample => sample.worker))];
  const seriesFor = (metric, perInstance) => (perInstance ? workers : [null]).map(worker => ({
    label: worker ? `${workerNames.get(worker) || worker}${metric.series ? ` · ${metric.series}` : ''}` : metric.series || metric.label,
    values: times.map(at => {
      const entries = samples.filter(sample => Date.parse(sample.at) === at && (!worker || worker === sample.worker))
        .filter(sample => Number.isFinite(sample[metric.key]));
      const values = entries.map(sample => sample[metric.key] * (metric.factor || 1));
      if (!values.length) return null;
      const sum = values.reduce((total, value) => total + value, 0);
      if (metric.key === 'hit' && !worker && entries.every(item => Number.isFinite(item.lookups))) {
        const lookups = entries.reduce((total, item) => total + item.lookups, 0);
        return lookups ? entries.reduce((total, item) => total + item.hit * item.lookups, 0) / lookups : 0;
      }
      return metric.total ? sum : sum / values.length;
    }),
  })).filter(series => series.values.some(Number.isFinite));
  const perInstance = display === 'instances' && instances.length > 1;
  const throughput = [{ key: 'reads', series: '读取' }, { key: 'writes', series: '写入' }].flatMap(metric =>
    seriesFor({ ...metric, total: true, factor: 1024 ** 2 / 10 ** 9 }, perInstance));
  const observedMetrics = cacheMetrics.filter(metric => observations.some(sample => Number.isFinite(sample[metric.key])));
  const summaries = observedMetrics.filter(metric => metric.summary).map(metric => ({ ...metric,
    value: seriesFor(metric, false)[0]?.values.filter(Number.isFinite).at(-1),
  }));
  const charts = observedMetrics.map(metric => ({ ...metric, series: seriesFor(metric, perInstance) }));
  if (observations.some(sample => Number.isFinite(sample.reads) || Number.isFinite(sample.writes))) {
    charts.push({ label: '吞吐', key: 'throughput', unit: ' GB/s', series: throughput });
  }
  return <section ref={anchor} className="infra-cache-detail-section" aria-label="监控">
    <div className="infra-cache-section-header">
      <Title heading={5} component="h2">监控</Title>
      {observations.length > 0 && <Space wrap>
        {instances.length > 1 && <Select aria-label="监控节点" value={nodes} placeholder="节点" multiple filter showClear optionList={instances.map(item => ({ label: item.name, value: item.id }))} onChange={value => setNodes(value || [])}/>}
        {instances.length > 1 && <Select aria-label="查看方式" value={display} optionList={[{ value: 'aggregate', label: '汇总' }, { value: 'instances', label: '按实例' }]} onChange={setDisplay}/>}
        <Choice label="监控时间范围" value={range} options={cacheWindows} onChange={setRange}/>
      </Space>}
    </div>
    {observations.length ? <>
      <div className="infra-cache-stats">{summaries.map(({ key, summary, value, unit }) => <Card key={key} title={summary}>
        <Title heading={5}>{fmtUnit(value === undefined ? undefined : Number(value.toFixed(1)), unit)}</Title>
      </Card>)}</div>
      <div className="infra-cache-charts">{charts.map(metric => <Card key={metric.key} title={`${metric.label} (${metric.unit.trim()})`}>
        {metric.series.length ? <TimeSeriesChart label={metric.label} labels={times.map(at => fmtDate(at).split(' ').at(-1))}
          series={metric.series} unit={metric.unit} domain={metric.unit === '%' ? [0, 100] : undefined} height={190}/> :
          <Empty description="所选时段暂无监控数据"/>}
      </Card>)}</div>
    </> : <Empty description="暂无监控数据"/>}
  </section>;
}

const compactTokens = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const formatCacheTokens = value => Number.isFinite(value) ? <span title={value.toLocaleString()}>{compactTokens.format(value)}</span> : '—';

function CacheAttachedModels({ row, records }) {
  const [nodes, setNodes] = useState([]);
  const [range, setRange] = useState('60');
  const linked = cacheAttachedInstances(row, records);
  const workerNames = new Map(linked.filter(item => item.workerId).map(item => [item.workerId, item.workerName]));
  const data = linked.filter(item => !nodes.length || nodes.includes(item.workerId)).map(item => ({
    ...item, ...row.attachedMetrics?.[range]?.[item.id],
  }));
  return <section className="infra-cache-detail-section" aria-label="关联模型实例">
    <div className="infra-cache-section-header">
      <Title heading={5} component="h2">关联模型实例</Title>
      <Space wrap>
        {(workerNames.size > 1 || nodes.length > 0) && <Select aria-label="关联实例节点" value={nodes} placeholder="节点" multiple filter showClear
          optionList={[...workerNames].map(([value, label]) => ({ value, label }))} onChange={value => setNodes(value || [])}/>}
        <Choice label="关联实例时间范围" value={range} options={cacheWindows} onChange={setRange}/>
      </Space>
    </div>
    <AdminTable rowKey="id" dataSource={data} pagination={false} empty="暂无关联模型实例" columns={[
      { title: '名称', dataIndex: 'name' }, { title: '节点', dataIndex: 'workerName', render: value => value || '—' },
      { title: '推理后端', dataIndex: 'backend', render: value => value || '—' },
      { title: <TableFieldHelp name="命中 Token" description="模型实例从外部缓存实际命中的 Prompt Token 数。"/>, dataIndex: 'hitTokens', render: formatCacheTokens },
      { title: <TableFieldHelp name="查询 Token" description="模型实例向外部缓存查询的 Prompt Token 数。"/>, dataIndex: 'queriedTokens', render: formatCacheTokens },
      { title: <TableFieldHelp name="外部缓存命中率" description="模型实例的外部缓存命中 Token 占查询 Token 的比例。"/>, dataIndex: 'hitRate',
        render: (value, item) => Number.isFinite(value) ? `${Number((100 * value).toFixed(1))}%` : Number.isFinite(item.queriedTokens) ? '0%' : '—' },
    ]}/>
  </section>;
}

function CacheDetail({ row, records, panel, openDetail, ...props }) {
  const [logs, setLogs] = useState(false);
  const monitorRef = useRef(null);
  useEffect(() => {
    if (panel === 'monitor') monitorRef.current?.scrollIntoView({ block: 'start' });
  }, [panel, row.id]);
  const events = row.cacheEvents || (row.checkResult ? [{ at: row.updatedAt || row.createdAt, message: row.checkResult }] : []);
  if (panel === 'logs') return <LogView entries={events} name="缓存服务日志" filename={`cache-${row.id}.log`}/>;
  const provider = activeCacheProvider(row.provider);
  const cluster = records.clusters.find(item => item.id === row.clusterId);
  const node = records['ops-nodes']?.find(item => item.id === row.workerId);
  const selector = labelPairs(row.selector).map(([key, value]) => `${key}=${value}`).join(', ');
  const facts = [
    { key: 'provider', label: '提供方', value: [provider?.displayName || row.provider, row.version === '自定义' ? row.image : row.version].filter(Boolean).join(' ') },
    { key: 'cluster', label: '集群', value: cluster?.name || '—' },
    ...(node ? [{ key: 'worker', label: '节点', value: node.name }] : []),
    ...(selector ? [{ key: 'labels', label: '节点标签选择器', value: selector }] : []),
    ...(row.memoryGiB ? [{ key: 'capacity', label: '容量', value: `${row.memoryGiB} GiB${provider?.topology === 'per_node' ? '（每节点）' : ''}` }] : []),
    { key: 'created', label: '创建时间', value: fmtDate(row.createdAt) },
  ];
  return <div className="infra-cache-detail">
    {props.standalone && <ModelOperationProgress {...props}/>}
    <section aria-label="概览" className="infra-cache-detail-section">
      <div className="infra-cache-section-header"><Title heading={5} component="h2">概览</Title>
      <Select value={row.id} aria-label="切换缓存服务" filter optionList={(records[cachePage] || []).map(item => ({ value: item.id, label: item.name }))} onChange={id => {
        const target = records[cachePage].find(item => item.id === id);
        if (target) openDetail(target);
      }}/>
      </div>
      <Card title={<Space wrap>{row.name}<CacheStatusCell row={row}/>
        {validateSourceUrl(row.managementUrl) && <Typography.Text link={{ href: row.managementUrl, target: '_blank', rel: 'noopener noreferrer' }}>管理界面</Typography.Text>}
      </Space>} headerExtraContent={<Button disabled={!cacheServiceLogAvailable(row)} onClick={() => setLogs(true)}>查看日志</Button>}>
        <AdminDescriptions data={facts.map(({ label, value }) => ({ key: label, value }))}/>
      </Card>
    </section>
    <CacheMonitor key={`${row.id}-monitor`} row={row} records={records} anchor={monitorRef}/>
    <CacheAttachedModels key={`${row.id}-instances`} row={row} records={records}/>
    {logs && <AdminSideSheet title="查看缓存服务日志" visible width="min(720px, 100vw)" onCancel={() => setLogs(false)} closeOnEsc>
      <LogView entries={events} name="缓存服务日志" filename={`cache-${row.id}.log`}/>
    </AdminSideSheet>}
  </div>;
}

function FilesHeader({ openEditor, selectedRows, clearSelection, ...props }) {
  const [batch, setBatch] = useState(null);
  const menu = sourceLabels.map(source => <Dropdown.Item key={source} onClick={() => openEditor({ preset: { source } })}>{source}</Dropdown.Item>);
  return <Space wrap>
    <Dropdown trigger="click" render={<Dropdown.Menu>{menu}</Dropdown.Menu>} clickToHide>
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!props.writable || props.busy}
        aria-label="添加模型文件">添加模型文件</Button>
    </Dropdown>
    <Button type="danger" disabled={!props.writable || !selectedRows.length || props.busy}
      onClick={() => setBatch(selectedRows)}>删除{selectedRows.length > 0 && `（${selectedRows.length}）`}</Button>
    {batch && <RemoveFiles {...props} rows={batch} onClose={() => setBatch(null)} onRemoved={clearSelection}/>}
  </Space>;
}

function orderedGgufFiles(repository, sort) {
  const files = (repository?.fileOptions || []).filter(file => /\.gguf$/i.test(file.value));
  return sort === 'name' ? files.sort((left, right) => left.label.localeCompare(right.label)) : files;
}

const repositorySortOptions = [
  {value:'trendingScore',label:'趋势'}, {value:'likes',label:'点赞量'},
  {value:'downloads',label:'下载量'}, {value:'lastModified',label:'更新时间'},
];
const repositoriesPerPage = 10;

function ModelFileEditor({ editor, records, commit, onClose, dirtyRef, busy }) {
  const formId = useId();
  const errorSummary = useRef(null);
  const source = editor.preset?.source || 'Hugging Face';
  const local = source === '本地路径';
  const candidates = local ? [] : modelHubCandidates(records, source);
  const nodeGroups = records.clusters.filter(cluster => cluster.status === '运行中').flatMap(cluster => {
    const children = (records['ops-nodes'] || []).filter(node => node.clusterId === cluster.id && node.status === '就绪')
      .map(node => ({ value: node.id, label: node.name }));
    return children.length ? [{ value: cluster.id, label: cluster.name, children, provider: cluster.provider }] : [];
  });
  const [target, setTarget] = useState(() => {
    const preferred = nodeGroups.find(group => group.provider === 'Docker') || nodeGroups[0];
    return preferred ? [preferred.value, preferred.children[0].value] : [];
  });
  const [query, setQuery] = useState('');
  const [quantization, setQuantization] = useState();
  const [repositorySort, setRepositorySort] = useState('trendingScore');
  const [repositoryPage, setRepositoryPage] = useState(1);
  const [repo, setRepo] = useState(null);
  const [fileSort, setFileSort] = useState('size');
  const [filename, setFilename] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error]);
  const results = searchModelHubCandidates(candidates, { query,quantization,sort:repositorySort });
  const resultPage = Math.min(repositoryPage, Math.max(1, Math.ceil(results.length / repositoriesPerPage)));
  const visibleRepositories = results.slice((resultPage - 1) * repositoriesPerPage, resultPage * repositoriesPerPage);
  const files = orderedGgufFiles(repo, fileSort);
  const selectedFile = files.find(file => file.value === filename);
  const draft = { source, repository:repo?.repository, filename, lora:repo?.lora,
    downloadParts:selectedFile?.parts.map(part=>part.path), sizeBytes:selectedFile?.sizeBytes,
    ...(local ? { mountPath:path } : { localDir:path }) };
  const issueFor = workerId => modelFileNodeIssue({ ...draft,workerId },records);
  const nodeChoices = nodeGroups.map(group=>({ ...group,children:group.children.map(node=>({
    ...node, label: modelFileOnNode({ ...draft,workerId:node.value },records) ? `${node.label} [${local ? '已添加' : '已下载'}]` : node.label,
  })) }));
  const pathIssue = target.length ? issueFor(target.at(-1)) : undefined;
  const sizeLabel = bytes => Number.isFinite(bytes) ? `${(bytes / (1024 ** 3)).toFixed(2)} GiB` : '';
  const change = action => {
    action();
    setError('');
    setDirty(true);
    dirtyRef.current = true;
  };
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      await commit((latest, all) => {
        return [{ ...modelFileCreation({ ...draft,workerId:target.at(-1) }, all), id: resourceId(filesPage), createdAt: new Date().toISOString() }, ...latest];
      }, local ? '模型文件已添加' : '已提交下载');
      onClose();
    } catch (issue) { setError(issue.message); }
  };
  return <>
    <AdminSideSheet title={editor.title || '添加模型文件'} visible className="infra-sheet"
      width={local ? 'min(560px, 100vw)' : 'min(1120px, 100vw)'} onCancel={close} closeOnEsc={!busy && !discard}
      footer={<><Button onClick={close} disabled={busy}>取消</Button><Button htmlType="submit" form={formId} theme="solid" loading={busy}>确定</Button></>}>
      {error && <div ref={errorSummary} tabIndex={-1}><Banner type="danger" description={error} closeIcon={null}/></div>}
      <form id={formId} className={local ? 'infra-form' : 'infra-file-editor'} onSubmit={submit}>
        {!local && <>
          <section aria-label="搜索模型" className="infra-file-editor-column">
            <Input prefix={<IconSearch/>} aria-label="搜索模型" placeholder="搜索模型" showClear value={query}
              onChange={value => { setQuery(value); setRepositoryPage(1); }}/>
            <Space wrap>
              <span className="sr-only" id={`${formId}-hub-sort`}>仓库排序</span>
              <Select aria-labelledby={`${formId}-hub-sort`} value={repositorySort} optionList={repositorySortOptions}
                onChange={value => { setRepositorySort(value); setRepositoryPage(1); }}/>
              <span className="sr-only" id={`${formId}-hub-quantization`}>量化</span>
              <Select aria-labelledby={`${formId}-hub-quantization`} placeholder="量化" value={quantization} optionList={optionList(['FP8', 'AWQ', 'GPTQ'])}
                showClear onChange={value => { setQuantization(value); setRepositoryPage(1); }}/>
            </Space>
            {visibleRepositories.length ? visibleRepositories.map(row => <Button key={row.repository} className="infra-file-repository"
              aria-pressed={repo?.repository === row.repository} theme={repo?.repository === row.repository ? 'light' : 'borderless'}
              onClick={() => change(() => { setRepo(row); setFilename(orderedGgufFiles(row, fileSort)[0]?.value || ''); })}>
              <Space vertical align="start" spacing={2}>
                {row.repository}
                {row.likes != null && row.downloads != null && <Text type="secondary" size="small">
                  点赞 {row.likes.toLocaleString()} · 下载 {row.downloads.toLocaleString()}
                </Text>}
              </Space>
            </Button>) : <Empty description="未找到模型"/>}
            {results.length > repositoriesPerPage && <AdminPagination total={results.length} currentPage={resultPage}
              pageSize={repositoriesPerPage} onPageChange={setRepositoryPage}/>}
          </section>
          <section aria-label="模型与文件" className="infra-file-editor-column">
            {repo ? <><Text strong>{repo.name}</Text>
              {repo.repositoryUrl ? <Typography.Text link={{ href: repo.repositoryUrl, target: '_blank', rel: 'noopener noreferrer' }}>{repo.repository}</Typography.Text> :
                <Text type="secondary">{repo.repository}</Text>}
              {repo.format === 'GGUF' && <Tag color="blue">GGUF</Tag>}
              {repo.description && <Paragraph>{repo.description}</Paragraph>}
              {repo.format === 'GGUF' && <>
                <span className="sr-only" id={`${formId}-sort`}>文件排序</span>
                <Select aria-labelledby={`${formId}-sort`} value={fileSort} optionList={[{ value: 'size', label: '大小' }, { value: 'name', label: '名称' }]} onChange={setFileSort}/>
                {files.length > 0 ? <>
                  <span className="sr-only" id={`${formId}-file`}>选择模型文件</span>
                  <Select aria-labelledby={`${formId}-file`} value={filename || undefined} placeholder="选择模型文件"
                    optionList={files.map(file => ({ value: file.value, label: [file.label, sizeLabel(file.sizeBytes)].filter(Boolean).join(' · ') }))}
                    filter onChange={value => change(() => setFilename(value ?? ''))}/>
                </> : <Empty description="未找到 GGUF 文件"/>}
              </>}
              {selectedFile?.parts.length > 1 && <Space vertical align="start" spacing={4}>
                <Text strong>{selectedFile.parts.length} 个分片</Text>
                {selectedFile.parts.map(part => <Text size="small" breakWord key={part.path}>{part.path}</Text>)}
              </Space>}
            </> : <Empty description="请选择模型"/>}
          </section>
        </>}
        <section aria-label="选择目标位置" className="infra-file-editor-column">
          {!local && <Title heading={5} component="h3">选择目标位置</Title>}
          <div className="infra-field"><label id={`${formId}-source`}>来源 *</label>
            <Select aria-labelledby={`${formId}-source`} value={source} optionList={optionList(sourceLabels)} disabled/></div>
          {local && <div className="infra-field"><label htmlFor={`${formId}-path`}>模型路径 *</label>
            <Input id={`${formId}-path`} aria-required="true" value={path} placeholder="/mnt/models/qwen" onChange={value => change(() => setPath(value))}
              onBlur={() => setPath(value => value.replace(/[\\/]+$/, ''))}/></div>}
          <div className="infra-field"><label id={`${formId}-target`}>节点 *</label>
            <Cascader aria-labelledby={`${formId}-target`} aria-required="true" treeData={nodeChoices} filter showClear value={target}
              aria-describedby={pathIssue ? `${formId}-path-issue` : undefined}
              placeholder="请选择集群和节点" emptyContent="没有就绪节点" onChange={value => change(() => setTarget(value || []))}/>
            {pathIssue && <Text type="warning" id={`${formId}-path-issue`}>{pathIssue}</Text>}
          </div>
          {!local && <div className="infra-field"><label htmlFor={`${formId}-path`}>本地目录</label>
            <Input id={`${formId}-path`} value={path} placeholder="留空使用默认目录" aria-describedby={`${formId}-path-hint`}
              onChange={value => change(() => setPath(value))}/>
            <Text id={`${formId}-path-hint`} type="tertiary" size="small">默认使用节点缓存目录 /var/lib/gpustack/cache。节点可通过 --cache-dir 或 --data-dir 指定其他目录。</Text></div>}
        </section>
      </form>
    </AdminSideSheet>
    {discard && serviceOperationsUi.renderLeaveDialog({ cancel: () => setDiscard(false), discard: onClose })}
  </>;
}

function RemoveFiles({ rows, records, page, commit, busy, onClose, onRemoved, embedded }) {
  const [deleteFromDisk, setDeleteFromDisk] = useState(Boolean(embedded && rows[0].source !== '本地路径'));
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
        onRemoved?.();
        onClose();
      } catch (issue) { setError(issue.message); }
  };
  const content = <Space vertical align="start">
      <Paragraph>{embedded ? rows[0].mountPath || rows[0].name : `确认删除 ${rows.length} 条模型文件记录？`}</Paragraph>
      <Checkbox checked={deleteFromDisk} disabled={busy} onChange={event => setDeleteFromDisk(event.target.checked)}>同时从磁盘删除文件</Checkbox>
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

function FileSourceCell({ row }) {
  const source = row.source === '本地路径' ? `${row.source}${row.mountPath ? ` ${row.mountPath}` : ''}` :
    [row.source, row.repository].filter(Boolean).join('/');
  return <Text ellipsis={{ showTooltip: true }}>{source}</Text>;
}

function FilePathCell({ row }) {
  const resolved = row.resolvedPaths?.[0] || (row.status === '可用' || row.source === '本地路径' ? row.mountPath : '');
  if (!resolved) return row.status === '下载中' ? <Text type="tertiary">等待下载完成…</Text> : '—';
  return <Space wrap spacing={6}>
    <Text title={resolved} copyable={{ content: resolved }}>{resolved.replaceAll('\\', '/').split('/').at(-1)}</Text>
    {row.lora && <Tag color="purple">LoRA</Tag>}
    {row.resolvedPaths?.length > 1 && <Tooltip
      content={<ul className="infra-file-parts">{row.resolvedPaths.map(part => <li key={part}>{part.replaceAll('\\', '/').split('/').at(-1)}</li>)}</ul>}>
      <span tabIndex={0}><Tag color="purple">{row.resolvedPaths.length} 个文件</Tag></span>
    </Tooltip>}
  </Space>;
}

function FileStatusCell({ row }) {
  const status = <span tabIndex={row.message ? 0 : undefined}><AdminStatus value={row.status}/>
    {row.status === '下载中' && Number.isFinite(row.progress) && <Text type="secondary"> {row.progress}%</Text>}</span>;
  return row.message ? <Tooltip content={row.message}>{status}</Tooltip> : status;
}

const FilesDetail = ({ row, close, ...props }) => <RemoveFiles {...props} embedded rows={[row]} onClose={close}/>;

export const MODEL_SERVICE_VIEWS = {
  [cataloguePage]: { Header: CatalogueHeader, Card: CatalogueCard },
  [benchmarkPage]: { ...BENCHMARK_ALIGNMENT_VIEW, Detail: BenchmarkDetail, Extra: BenchmarkCompare },
  [backendsPage]: INFERENCE_BACKEND_VIEW,
  [cachePage]: { Header: CacheHeader, Detail: CacheDetail, ExpandedRow: CacheRows, Extra: ModelOperationProgress,
    FormNotice: CacheFormNotice, Fields: { cacheL2: CacheL2Field, cacheDeclared: CacheDeclaredField, cachePairs: CachePairFields,
      cacheParameters: CacheParametersField },
    Cells: { name: CacheNameCell, provider: CacheProviderCell, status: CacheStatusCell } },
  [filesPage]: { Header: FilesHeader, Detail: FilesDetail, Extra: ModelOperationProgress, Editor: ModelFileEditor,
    Cells: { source: FileSourceCell, mountPath: FilePathCell, status: FileStatusCell } },
};
