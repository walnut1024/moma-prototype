import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Empty, Input, Select, Space, Tabs, Tag, TextArea, Tooltip, Typography } from './xa24/HaloUI.jsx';
import { Collapse } from './xa24/HaloUI.jsx';
import { IconCopy, IconGlobe, IconMinus, IconPlus, IconServerStroked, IconUpload } from './xa24/HaloIcons.jsx';
import AdminCollapsePanel from './AdminCollapsePanel';
import AdminDescriptions from './AdminDescriptions';
import { AdminSideSheet } from './AdminOverlay';
import InferenceBackendCommunity from './InferenceBackendCommunity';
import InferenceBackendSource from './InferenceBackendSource';
import InferenceBackendYamlInput from './InferenceBackendYamlInput';
import { Choice, serviceOperationsUi } from './ServiceUI';
import { useChannelText } from './channel-language';
import {
  backendAvailableVersions, backendCommandPresets, backendEditableVersionName, backendFormFrameworks, backendFrameworkIndex,
  backendVersionRuntime, backendVersions, backendYaml, backendYamlEditorDraft, backendYamlFieldHints,
  backendYamlIssueLocation, backendYamlTemplate,
  communityBackendCandidates, enableCommunityBackend, initialBackendDraft, saveInferenceBackend, updateBackendVersionDraft, validateBackendVersionEntries,
} from './inference-backend';
import './inference-backend.css';

const { Text, Paragraph, Title } = Typography;
const defaultCommand = '{{model_path}} --port {{port}} --host {{worker_ip}} --served-model-name {{model_name}}';
const parameterFormats = [{ value: 'space', label: '空格分隔 (--key value)' }, { value: 'equal', label: '等号连接 (--key=value)' }];
const blankVersion = () => ({ version: '', image: '', framework: '', entrypoint: '', command: '', env: [] });
const nameWithoutSuffix = name => name.replace(/-custom$/, '');
const sourceColor = { 内置: 'blue', 社区: 'cyan', 自定义: 'purple' };
const frameworkColor = { CUDA: 'green', ROCm: 'red', CANN: 'orange', DTK: 'pink', MUSA: 'cyan', CoreX: 'purple', MACA: 'blue', Neuware: 'yellow' };

function BackendMarket({ records, commit, busy, writable, empty }) {
  const t = useChannelText();
  const [open, setOpen] = useState(false);
  return <>
    <Button disabled={!writable || busy} onClick={() => setOpen(true)} icon={<IconGlobe aria-hidden="true"/>}>
      {t(empty ? '浏览社区市场' : '社区市场')}
    </Button>
    {open && writable && <InferenceBackendCommunity records={communityBackendCandidates(records['ops-inference-backends'] || [])}
      busy={busy} onClose={() => setOpen(false)} onSetEnabled={row =>
        commit(latest => enableCommunityBackend(latest, row), '社区后端已启用')}/>}
  </>;
}

export function InferenceBackendHeader(props) {
  return <Space wrap><InferenceBackendSource actorRole={props.records.actorRole} onSaved={props.refresh}
    disabled={!props.writable}/><BackendMarket {...props}/></Space>;
}

function BackendEmpty({ hasFilters, ...props }) {
  const t = useChannelText();
  return hasFilters ? <Empty description={t('未找到匹配的推理后端')}/>
    : <Empty title={t('暂无推理后端')} description={<BackendMarket {...props} empty/>}/>;
}

function BackendCard({ row, actions, openDetail }) {
  const t = useChannelText();
  const index = backendFrameworkIndex(row, backendAvailableVersions(row));
  const open = () => openDetail(row, 'versions');
  return <Card className="inference-backend-card" onClick={open} style={{ cursor: 'pointer' }}>
    <div className="inference-backend-card-heading">
      <IconServerStroked aria-hidden="true" className="inference-backend-icon"/>
      <div onClick={event => event.stopPropagation()}>{actions}</div>
    </div>
    <div className="inference-backend-card-name">
      <Button theme="borderless" onClick={event => { event.stopPropagation(); open(); }}>
        {row.source === '自定义' ? nameWithoutSuffix(row.name) : row.name}
      </Button>
      <Tag size="small" color={sourceColor[row.source]}>{t(row.source)}</Tag>
    </div>
    {Object.keys(index).length > 0 && <div className="inference-backend-frameworks">
      <Text size="small" type="tertiary">{t('支持框架')}</Text>
      {Object.entries(index).map(([framework, versions]) => <Tooltip key={framework} content={versions.join('、')}>
        <Tag size="small" color={frameworkColor[framework]}>{framework}</Tag>
      </Tooltip>)}
    </div>}
  </Card>;
}

function BackendVersionDetails({ row, openEditor, close, busy, writable }) {
  const t = useChannelText();
  const [framework, setFramework] = useState('');
  const versions = backendAvailableVersions(row).sort((left, right) => right.version.localeCompare(left.version, 'en', { numeric: true }));
  const filtered = framework ? versions.filter(entry => entry.frameworks.includes(framework)) : versions;
  const edit = () => {
    close();
    openEditor({ row, title: '编辑后端', addVersion: true });
  };
  return <div className="inference-backend-version-list">
    <div className="inference-backend-inline-toolbar">
      <Choice label="按框架过滤" placeholder={t('按框架过滤')} showClear
        value={framework || undefined} onChange={value => setFramework(value || '')}
        options={backendFormFrameworks.map(([value, vendor]) => [value, vendor ? `${value} · ${t(vendor)}` : value])}/>
      <Button icon={<IconPlus aria-hidden="true"/>} theme="borderless" disabled={busy || !writable} onClick={edit}>{t('添加版本')}</Button>
    </div>
    {filtered.map(entry => {
      const runtime = backendVersionRuntime(row, entry);
      const images = (entry.runnerImages || []).filter(image => !framework || image.framework === framework);
      return <Card key={entry.version} title={<Space wrap>
        <Text strong>{entry.version}</Text>
        {entry.sourceManaged && <Tag size="small" color={sourceColor[row.source]}>{t(row.source)}</Tag>}
        {entry.recordOnly && <Tag size="small">{t('已有记录')}</Tag>}
        {(row.source !== '内置' || !entry.sourceManaged) && entry.version === row.version && <Tag size="small" color="blue">{t('默认版本')}</Tag>}
      </Space>}>
        <AdminDescriptions align="left" data={[
          { key: t('镜像名称'), value: entry.image ? <Text copyable className="inference-backend-copy">{entry.image}</Text>
            : images.length ? t('运行时自动选择') : '—' },
          runtime.entrypoint ? { key: t('镜像入口命令'), value: <Space wrap>
            <Text copyable className="inference-backend-copy">{runtime.entrypoint}</Text>
            {runtime.entrypointInherited && <Tag size="small">{t('默认值')}</Tag>}
          </Space> } : null,
          runtime.command ? { key: t('执行命令'), value: <Space wrap>
            <Text copyable className="inference-backend-copy">{runtime.command}</Text>
            {runtime.commandInherited && <Tag size="small">{t('默认值')}</Tag>}
          </Space> } : null,
          { key: t('支持框架'), value: <Space wrap>{entry.frameworks.map(item => <Tag key={item} size="small" color={frameworkColor[item]}>{item}</Tag>)}</Space> },
        ].filter(Boolean)}/>
        {images.length > 0 && <Collapse className="inference-runner-options">
          <AdminCollapsePanel itemKey="images" header={t('查看可匹配镜像')}>
            <div className="inference-runner-image-list">
              {images.map(image => <div key={`${image.framework}:${image.toolkit}:${image.variant || ''}:${image.image}`} className="inference-runner-image">
                <Text size="small" type="secondary">{[image.framework, image.toolkit, image.variant, ...image.platforms].filter(Boolean).join(' · ')}</Text>
                <Text copyable className="inference-backend-copy">{image.image}</Text>
              </div>)}
            </div>
          </AdminCollapsePanel>
        </Collapse>}
      </Card>;
    })}
    {!filtered.length && <Empty description={t('无可用版本')}/>}
  </div>;
}

function BackendField({ label, required, help, error, children }) {
  const id = useId();
  const description = [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="inference-backend-field">
    <label id={`${id}-label`} htmlFor={id}>{label}{required && <span className="inference-backend-required" aria-hidden="true"> *</span>}</label>
    {children({ id, 'aria-labelledby': `${id}-label`, 'aria-required': required, 'aria-describedby': description,
      'aria-invalid': Boolean(error), ...(error ? { validateStatus: 'error' } : {}) })}
    {help && <Text id={`${id}-help`} type="tertiary" size="small">{help}</Text>}
    {error && <Text id={`${id}-error`} type="danger" size="small" role="alert">{error}</Text>}
  </div>;
}

function BackendListEditor({ label, items, setItems, environment = false, help }) {
  const t = useChannelText();
  const makeItem = () => environment ? { key: '', value: '' } : '';
  const changeAt = (index, value) => setItems(items.map((item, position) => position === index ? value : item));
  return <fieldset className="inference-backend-list-editor">
    <legend>{label}</legend>
    {help && <Text type="tertiary" size="small">{help}</Text>}
    {items.map((item, index) => <div key={index} className="inference-backend-list-row">
      {environment ? <>
        <Input aria-label={`${label} ${index + 1} ${t('名称')}`} placeholder={t('变量名')} value={item.key}
          onChange={key => changeAt(index, { ...item, key })}/>
        <Input aria-label={`${label} ${index + 1} ${t('值')}`} placeholder={t('变量值')} value={item.value}
          onChange={value => changeAt(index, { ...item, value })}/>
      </> : <Input aria-label={`${label} ${index + 1}`} value={item} onChange={value => changeAt(index, value)}/>}
      <Button aria-label={`${t('移除')} ${label} ${index + 1}`} htmlType="button" type="tertiary" theme="borderless" icon={<IconMinus aria-hidden="true"/>}
        onClick={() => setItems(items.filter((_, position) => position !== index))}/>
    </div>)}
    <Button icon={<IconPlus aria-hidden="true"/>} htmlType="button" theme="borderless" onClick={() => setItems([...items, makeItem()])}>
      {t(environment ? '添加环境变量' : '添加参数')}
    </Button>
  </fieldset>;
}

function BackendBasicFields({ draft, update, row, issue }) {
  const t = useChannelText();
  const builtIn = row?.source === '内置';
  const preset = row && backendCommandPresets[row.name];
  return <section className="inference-backend-fields">
    <BackendField label={t('名称')} required error={issue?.yamlPath?.[0] === 'backend_name' ? t(issue.message) : undefined}>{props => <Input {...props} disabled={Boolean(row)}
      value={draft.name} addonAfter={!row || row.source === '自定义' && row.name.endsWith('-custom') ? '-custom' : undefined}
      onChange={name => update({ name })}/>}</BackendField>
    {!builtIn && <>
      <BackendField label={t('健康检查路径')} error={issue?.yamlPath?.[0] === 'health_check_path' ? t(issue.message) : undefined}>
        {props => <Input {...props} value={draft.healthPath} placeholder="/v1/models"
        onChange={healthPath => update({ healthPath })}/>}</BackendField>
      <BackendField label={t('默认执行命令')} help={t('部署时替换 {{model_path}}、{{port}}、{{worker_ip}} 和 {{model_name}}。')}>
        {props => <TextArea {...props} value={draft.command} placeholder={defaultCommand} rows={2} onChange={command => update({ command })}/>}
      </BackendField>
    </>}
    {builtIn && preset && <>
      <BackendField label={t('默认镜像入口命令')}>{props => <Input {...props} value={preset.entrypoint} disabled/>}</BackendField>
      <BackendField label={t('默认执行命令')}>{props => <TextArea {...props} value={preset.command} rows={2} disabled/>}</BackendField>
    </>}
    <BackendListEditor label={t('默认后端参数')} items={draft.parameters} setItems={parameters => update({ parameters })}/>
    <BackendField label={t('参数格式')} help={t('留空时使用各参数原有写法。')}>{props => <Select {...props} showClear value={draft.parameterFormat || undefined}
      optionList={parameterFormats.map(option => ({ ...option, label: t(option.label) }))} onChange={parameterFormat => update({ parameterFormat })}/>}</BackendField>
    <BackendListEditor label={t('常用后端参数')} help={t('部署模型时显示为可选的后端参数。')} items={draft.commonParameters}
      setItems={commonParameters => update({ commonParameters })}/>
    <BackendListEditor label={t('默认环境变量')} items={draft.env} setItems={env => update({ env })} environment/>
    <BackendField label={t('描述')}>{props => <TextArea {...props} value={draft.description} rows={3}
      onChange={description => update({ description })}/>}</BackendField>
  </section>;
}

function BackendEditorVersions({ draft, update, row, versionsOpen, setVersionsOpen, onError, issue, busy }) {
  const t = useChannelText();
  const source = row?.source || '自定义';
  const inherited = source !== '自定义';
  const preset = row && backendCommandPresets[row.name];
  const issueAt = (index, field) => issue?.versionIndex === index && issue.versionField === field ? t(issue.message) : undefined;
  const frameworks = backendFormFrameworks.map(([value, vendor]) => ({ value, label: vendor ? `${value} · ${t(vendor)}` : value }));
  const choices = [
    ...backendVersions(row).filter(entry => entry.sourceManaged).map(entry => entry.version),
    ...draft.versionEntries.map(entry => backendEditableVersionName(entry.version, source)).filter(Boolean),
  ];
  const add = () => {
    try {
      validateBackendVersionEntries(draft.versionEntries, source);
      setVersionsOpen(String(draft.versionEntries.length));
      update({ versionEntries: [...draft.versionEntries, blankVersion()] });
    } catch (error) { onError(error); }
  };
  const patch = (index, change) => update(updateBackendVersionDraft(draft, index, change, source));
  const remove = index => {
    const versionEntries = draft.versionEntries.filter((_, position) => position !== index);
    const version = draft.version === backendEditableVersionName(draft.versionEntries[index].version, source) ? '' : draft.version;
    setVersionsOpen(previous => {
      if (previous == null || Number(previous) === index) return null;
      return Number(previous) > index ? String(Number(previous) - 1) : previous;
    });
    update({ versionEntries, version });
  };
  return <section className="inference-backend-editor-versions">
    <div className="inference-backend-inline-toolbar">
      <Space wrap><Title heading={5}>{t('版本配置')}</Title>
        <Button icon={<IconPlus aria-hidden="true"/>} htmlType="button" theme="borderless" disabled={busy} onClick={add}>{t('添加版本')}</Button></Space>
      {source !== '内置' && <Choice label="默认版本" prefix={t('默认版本')} showClear placeholder={t('请选择版本')}
        value={draft.version || undefined} options={[...new Set(choices)].map(value => [value, value])} onChange={value => update({ version: value || '' })}/>}
    </div>
    {draft.versionEntries.map((entry, index) => {
      const key = String(index);
      const savedVersion = backendEditableVersionName(entry.version, source);
      const versionLabel = savedVersion || t('新版本');
      const canRemove = inherited || draft.versionEntries.length > 1;
      return <div key={key} className="inference-backend-edit-version inference-backend-edit-version-removable">
        <Collapse activeKey={versionsOpen === key ? [key] : []} onChange={keys => setVersionsOpen(keys[0] ?? null)}>
          <AdminCollapsePanel itemKey={key} header={<Space wrap>
              <Text strong>{versionLabel}</Text>
              {savedVersion && savedVersion === draft.version && <Tag size="small" color="blue">{t('默认版本')}</Tag>}
            </Space>}>
            <div className="inference-backend-fields">
              <BackendField label={t('版本号')} required error={issueAt(index, 'version')}>{props => <Input {...props} value={entry.version}
                addonAfter={inherited ? '-custom' : undefined} onChange={version => patch(index, { version })}/>}</BackendField>
              <BackendField label={t('镜像名称')} required error={issueAt(index, 'image')}>{props => <Input {...props} value={entry.image}
                placeholder="vllm/vllm-openai:v0.12.0" onChange={image => patch(index, { image })}/>}</BackendField>
              <BackendField label={t('支持框架')} required error={issueAt(index, 'framework')}>{props => <Select {...props} filter value={entry.framework || undefined}
                optionList={entry.framework && !frameworks.some(item => item.value === entry.framework)
                  ? [...frameworks, { value: entry.framework, label: entry.framework }] : frameworks}
                onChange={framework => patch(index, { framework })}/>}</BackendField>
              <BackendField label={t('覆盖镜像入口命令')} help={t('填写后将覆盖容器镜像中的 ENTRYPOINT。')}>
                {props => <TextArea {...props} showClear rows={2} value={entry.entrypoint}
                  placeholder={draft.entrypoint || preset?.entrypoint || 'vllm serve'} onChange={entrypoint => patch(index, { entrypoint })}/>}
              </BackendField>
              <BackendField label={t('执行命令')} help={t('部署时替换 {{model_path}}、{{port}}、{{worker_ip}} 和 {{model_name}}。')}>
                {props => <TextArea {...props} showClear rows={2} value={entry.command}
                  placeholder={draft.command || preset?.command || defaultCommand} onChange={command => patch(index, { command })}/>}
              </BackendField>
              <BackendListEditor label={t('环境变量')} items={entry.env} setItems={env => patch(index, { env })} environment/>
              {issueAt(index, 'env') && <Text type="danger" role="alert">{issueAt(index, 'env')}</Text>}
            </div>
          </AdminCollapsePanel>
        </Collapse>
        <Button aria-label={`${t('移除版本')} ${versionLabel}`} htmlType="button" type="danger" theme="borderless"
          size="small" disabled={busy || !canRemove} onClick={() => remove(index)} icon={<IconMinus aria-hidden="true"/>}/>
      </div>;
    })}
  </section>;
}

function YamlFieldList({ fields }) {
  const t = useChannelText();
  return <dl className="inference-yaml-field-list">
    {fields.map(({ key, type, required }) => <div className="inference-yaml-field" key={key}>
      <dt><Text code>{key}</Text></dt>
      <dd>{t(type)}{required && <Tag size="small">{t('必填')}</Tag>}</dd>
    </div>)}
  </dl>;
}

function YamlFieldReference({ row, hintId }) {
  const t = useChannelText();
  const schema = backendYamlFieldHints(row);
  return <Collapse>
    <AdminCollapsePanel itemKey="yaml-fields" header={t('YAML 字段参考')}>
      <div id={hintId}>
        <YamlFieldList fields={schema.fields}/>
        <Text code>version_configs</Text>
        <YamlFieldList fields={schema.versionFields}/>
        {schema.managedVersionFields.length > 0 && <>
          <Text code>built_in_version_configs</Text>
          <YamlFieldList fields={schema.managedVersionFields}/>
        </>}
      </div>
    </AdminCollapsePanel>
  </Collapse>;
}

const yamlStart = { start: 0, end: 0, line: 1, column: 1 };

function BackendEditor({ editor, commit, onClose, dirtyRef, busy }) {
  const t = useChannelText();
  const formId = useId();
  const upload = useRef(null);
  const message = useRef(null);
  const yamlInput = useRef(null);
  const pending = useRef(false);
  const uploadSequence = useRef(0);
  const yamlErrorId = useId();
  const yamlHintId = useId();
  const row = editor.row;
  const [tab, setTab] = useState('form');
  const [draft, setDraft] = useState(() => {
    const values = initialBackendDraft(row, editor.preset);
    if (!row && !values.versionEntries.length || editor.addVersion) {
      return { ...values, versionEntries: [...values.versionEntries, blankVersion()] };
    }
    return values;
  });
  const [yamlTemplate] = useState(() => row ? backendYaml(row, { forEditor: true }) : backendYamlTemplate);
  const [yaml, setYaml] = useState(yamlTemplate);
  const [error, setError] = useState('');
  const [versionIssue, setVersionIssue] = useState(null);
  const [yamlStatus, setYamlStatus] = useState(null);
  const [yamlFocus, setYamlFocus] = useState(null);
  const [yamlSuggestionsOpen, setYamlSuggestionsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(() => editor.addVersion ? String(draft.versionEntries.length - 1) : row ? null : '0');
  useEffect(() => { if (error) message.current?.focus(); }, [error]);
  useLayoutEffect(() => {
    const input = yamlInput.current;
    if (!input || tab !== 'yaml' || !yamlFocus) return;
    input.focus();
    input.setSelectionRange(yamlFocus.start, yamlFocus.end);
    const metrics = getComputedStyle(input);
    const lineHeight = parseFloat(metrics.lineHeight);
    if (Number.isFinite(lineHeight)) input.scrollTop = Math.max(0, yamlFocus.line - 2) * lineHeight;
    if (yamlFocus.column === 1) input.scrollLeft = 0;
    setYamlFocus(null);
  }, [tab, yamlFocus]);

  const touch = () => { dirtyRef.current = true; setDirty(true); setError(''); setVersionIssue(null); };
  const showIssue = issue => {
    setError(issue.message);
    if (tab === 'form') {
      setVersionIssue(issue);
      if (Number.isInteger(issue.versionIndex)) setVersionsOpen(String(issue.versionIndex));
    }
  };
  const update = patch => { setDraft(previous => ({ ...previous, ...patch })); touch(); };
  const editYaml = content => { setYaml(content); setYamlStatus(null); setYamlFocus(null); touch(); };
  const focusYaml = location => setYamlFocus({ ...(location || yamlStart) });
  const showYamlIssue = (content, issue, locate) => {
    const location = backendYamlIssueLocation(content, issue);
    setYamlStatus({ issue, location });
    if (locate) focusYaml(location);
  };
  const reviewYaml = (content, { locate = false, uploaded = false } = {}) => {
    try {
      const values = backendYamlEditorDraft(content, row);
      setYamlStatus({ valid: true });
      if (uploaded) focusYaml(yamlStart);
      return values;
    } catch (issue) {
      showYamlIssue(content, issue, locate);
      return null;
    }
  };
  const copyTemplate = async () => {
    setCopyStatus('');
    try {
      await navigator.clipboard.writeText(yamlTemplate);
      setCopyStatus('YAML 模板已复制。');
    } catch { setCopyStatus('无法复制 YAML 模板。'); }
  };
  const readFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const request = ++uploadSequence.current;
    if (file.size > 4 * 1024 * 1024) { setError(t('YAML 文件不能超过 4 MiB。')); return; }
    try {
      const content = (await file.text()).replace(/\r\n?/g, '\n');
      if (request !== uploadSequence.current) return;
      editYaml(content);
      reviewYaml(content, { locate: true, uploaded: true });
    }
    catch { if (request === uploadSequence.current) setError(t('无法读取 YAML 文件。')); }
  };
  const close = () => {
    if (pending.current || busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const submit = async event => {
    event.preventDefault();
    if (pending.current || busy) return;
    const values = tab === 'yaml' ? reviewYaml(yaml, { locate: true }) : draft;
    if (!values) return;
    pending.current = true;
    setError('');
    try {
      await commit((latest, records) => saveInferenceBackend(latest, records, values, { current: row, mode: tab }), '已保存');
      onClose();
    } catch (issue) {
      if (tab === 'yaml' && issue.yamlPath?.length) showYamlIssue(yaml, issue, true);
      else showIssue(issue);
    }
    finally { pending.current = false; }
  };
  const yamlIssue = yamlStatus?.issue;
  const yamlLocation = yamlStatus?.location;
  return <>
    <AdminSideSheet className="inference-backend-editor" visible width="min(600px, 100vw)" closeOnEsc={!discard && !busy && !yamlSuggestionsOpen}
      title={t(editor.title || (row ? '编辑后端' : '添加后端'))} onCancel={close}
      footer={<><Button disabled={busy} onClick={close}>{t('取消')}</Button>
        <Button type="primary" theme="solid" htmlType="submit" form={formId} loading={busy}>{t('确定')}</Button></>}>
      <Tabs activeKey={tab} onChange={key => { setTab(key); setError(''); setVersionIssue(null); setYamlSuggestionsOpen(false); }}>
        <Tabs.TabPane itemKey="form" tab={t('表单模式')} disabled={busy}/>
        <Tabs.TabPane itemKey="yaml" tab={t('YAML 模式')} disabled={busy}/>
      </Tabs>
      <form id={formId} onSubmit={submit} className="inference-backend-editor-body">
        {error && <div ref={message} tabIndex={-1}><Banner fullMode={false} type="danger" closeIcon={null} description={t(error)}/></div>}
        {tab === 'form' ? <>
          <BackendBasicFields draft={draft} update={update} row={row} issue={versionIssue}/>
          <BackendEditorVersions row={row} draft={draft} update={update} versionsOpen={versionsOpen}
            setVersionsOpen={setVersionsOpen} onError={showIssue} issue={versionIssue} busy={busy}/>
        </> : <div className="inference-backend-fields">
          <Space wrap>
            <Button htmlType="button" disabled={busy} icon={<IconUpload aria-hidden="true"/>} onClick={() => upload.current.click()}>{t('上传 YAML 文件')}</Button>
            <input hidden ref={upload} type="file" accept=".yaml,.yml,application/yaml,text/yaml" onChange={readFile}/>
            <Button htmlType="button" disabled={busy} icon={<IconCopy aria-hidden="true"/>} onClick={copyTemplate}>{t('复制 YAML 模板')}</Button>
            <Text size="small" role="status" type={copyStatus === '无法复制 YAML 模板。' ? 'danger' : 'tertiary'}>{copyStatus && t(copyStatus)}</Text>
          </Space>
          <YamlFieldReference row={row} hintId={yamlHintId}/>
          <InferenceBackendYamlInput row={row} inputRef={yamlInput} value={yaml} busy={busy}
            hintId={yamlHintId} errorId={yamlErrorId} invalid={Boolean(yamlIssue)} onChange={editYaml}
            onBlur={() => reviewYaml(yaml)} onFormatIssue={issue => showYamlIssue(yaml, issue, true)}
            onSuggestionsChange={setYamlSuggestionsOpen}/>
          <div className="inference-backend-inline-toolbar">
            <div aria-live="polite" id={yamlErrorId}>
              {yamlIssue && <Text type="danger" size="small">
                {yamlLocation && `${t('行')} ${yamlLocation.line} · ${t('列')} ${yamlLocation.column} · `}
                {yamlIssue.yamlPath?.length > 0 && <><Text code>{yamlIssue.yamlPath.join(' › ')}</Text>{' · '}</>}
                {t(yamlIssue.reason || yamlIssue.message)}
              </Text>}
              {yamlStatus?.valid && <Text type="success" size="small">{t('YAML 校验通过。')}</Text>}
            </div>
            {yamlIssue && yamlLocation && <Button htmlType="button" size="small" theme="borderless" onClick={() => focusYaml(yamlLocation)}>{t('定位错误')}</Button>}
          </div>
        </div>}
        {!row && <Paragraph type="secondary" size="small">{t('自定义后端名称以 -custom 结尾。')}</Paragraph>}
      </form>
    </AdminSideSheet>
    {discard && serviceOperationsUi.renderLeaveDialog({ cancel: () => setDiscard(false), discard: onClose })}
  </>;
}

export const INFERENCE_BACKEND_VIEW = {
  Header: InferenceBackendHeader, Empty: BackendEmpty, Card: BackendCard, Detail: BackendVersionDetails, Editor: BackendEditor,
};
