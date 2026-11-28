import { useId, useRef, useState } from 'react';
import { CircleHelp, Pencil, Plus, Trash2 } from 'lucide-react';
import { resourceId } from '../resource-id.mjs';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import { Button, Input, Select, Switch } from './xa24/HaloUI.jsx';
import GatewayRouteList from './GatewayRouteList.jsx';
import {
  gatewayRouteDraft, gatewayRouteEndpoints, gatewayRouteNameHint, gatewayRouteRecord, gatewayRouteRows,
  routeTarget, validGatewayRouteName,
} from './gateway-route-settings.mjs';
import { canMutate, gatewayRouteRemovalIssue } from './state-transaction.js';
import './gateway-route-editor.css';

const exact = [{ value: 'exact', label: '精确匹配' }];
const prefix = [{ value: 'prefix', label: '前缀匹配' }];
const responseCodes = ['4xx', '5xx'].map(code => ({ value: code, label: code }));
const missing = '该路由已变化，请关闭抽屉后重新打开。';

function RouteMapping({ value, modelOptions, setMapping, close }) {
  const id = useId();
  const [source, setSource] = useState(value.split('=')[0] || '');
  const [target, setTarget] = useState(value.split('=')[1] || '');
  const options = source && !modelOptions.some(option => option.value === source)
    ? [...modelOptions, { value: source, label: source }] : modelOptions;
  const ready = Boolean(source.trim() && target.trim());
  return <AdminModal visible width={560} title="模型 ID 映射规则" className="gateway-route-mapping-modal" onCancel={close}
    footer={<div className="gateway-route-editor-actions">
      <Button size="small" theme="light" onClick={close}>取消</Button>
      <Button size="small" theme="solid" htmlType="submit" form={id} disabled={!ready}>确定</Button>
    </div>}>
    <form id={id} className="gateway-route-mapping-form" onSubmit={event => {
      event.preventDefault();
      if (ready) setMapping(source.trim() + '=' + target.trim());
    }}>
      <label><span id={id + '-source'}>模型 ID 匹配条件</span>
        <Select aria-labelledby={id + '-source'} placeholder="请选择" optionList={options} value={source} filter onChange={setSource}/>
      </label>
      <label><span id={id + '-mode'}>匹配方式</span>
        <Select aria-labelledby={id + '-mode'} optionList={exact} value="exact"/>
      </label>
      <label>映射后的上游模型 ID
        <Input aria-label="映射后的上游模型 ID" value={target} onChange={setTarget}/>
      </label>
    </form>
  </AdminModal>;
}

function Editor({ state, route, dispatch, close }) {
  const initial = useRef(gatewayRouteDraft(state, route));
  const [draft, setDraft] = useState(initial.current);
  const [mapping, setMapping] = useState(null);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const formId = useId();
  const providers = gatewayRouteEndpoints(state);
  const modelOptions = state.models.filter(model => model.modelId).map(model => ({ value: model.modelId, label: model.modelId }));
  const patch = fields => {
    setDraft(current => ({ ...current, ...fields }));
    setError('');
  };
  const updateTarget = (index, fields) => patch({ targets: draft.targets.map((target, i) => i === index ? { ...target, ...fields } : target) });
  const dismiss = () => {
    if (lock.current || mapping !== null || discard) return;
    if (JSON.stringify(draft) !== JSON.stringify(initial.current)) setDiscard(true);
    else close();
  };
  const save = async event => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      if (route && JSON.stringify(state.routes.find(item => item.id === route.id)) !== JSON.stringify(route)) throw Error(missing);
      const record = gatewayRouteRecord(state, draft, route, route?.id ?? resourceId('route'));
      const { id, ...changes } = record;
      const action = route
        ? { type: 'update', collection: 'routes', id, changes }
        : { type: 'add', collection: 'routes', record };
      if (await dispatch(action)) close();
    } catch (issue) {
      setError(issue.message);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const mappingInput = (value, index, label) => <div className="gateway-route-mapping-input">
    <Input aria-label={label} placeholder="请设置模型映射" readonly value={value}/>
    <Button size="small" theme="borderless" type="primary" aria-label={'编辑' + label}
      icon={<Pencil size={13} aria-hidden="true"/>} onClick={() => setMapping(index)}/>
  </div>;
  const appendHeader = () => patch({ headers: [...draft.headers, { formKey: crypto.randomUUID(), name: '', value: '' }] });
  const changeHeader = (index, fields) => patch({ headers: draft.headers.map((row, i) => i === index ? { ...row, ...fields } : row) });
  return <>
    <AdminSideSheet visible width={800} title={route ? '编辑模型路由' : '新建模型路由'}
      className="gateway-route-editor-sheet" closeOnEsc={mapping === null && !discard} onCancel={dismiss}
      footer={<div className="gateway-route-editor-actions">
        <Button theme="light" disabled={saving} onClick={dismiss}>取消</Button>
        <Button theme="solid" htmlType="submit" form={formId} loading={saving}>{route ? '保存' : '创建模型路由'}</Button>
      </div>}>
      <form id={formId} className="gateway-route-editor" onSubmit={save}>
        <div className="gateway-route-field">
          <label htmlFor={formId + '-name'}><span className="gateway-route-required">*</span> 名称</label>
          <div className="gateway-route-name-input">
            <Input id={formId + '-name'} aria-label="名称" value={draft.name} disabled={Boolean(route)}
              aria-invalid={nameError || undefined} aria-describedby={nameError ? formId + '-name-error' : undefined}
              placeholder={gatewayRouteNameHint} maxLength={63}
              onBlur={() => setNameError(Boolean(draft.name) && !validGatewayRouteName(draft.name))}
              onChange={name => { setNameError(false); patch({ name }); }}/>
            <span aria-hidden="true">{draft.name.length}/63</span>
          </div>
          {nameError && <p id={formId + '-name-error'} className="gateway-route-error" role="alert">{gatewayRouteNameHint}</p>}
        </div>
        <div className="gateway-route-field">
          <label htmlFor={formId + '-path'}>路径（Path）</label>
          <div className="gateway-route-path">
            <span className="sr-only" id={formId + '-path-mode'}>路径匹配方式</span>
            <Select aria-labelledby={formId + '-path-mode'} optionList={prefix} value="prefix"/>
            <Input id={formId + '-path'} aria-label="路径（Path）" value={draft.path} onChange={path => patch({ path })}/>
          </div>
        </div>
        <fieldset className="gateway-route-field gateway-route-targets">
          <legend>目标AI服务</legend>
          <div className="gateway-route-target-labels">
            <span><span className="gateway-route-required">*</span> 服务商名称</span>
            <span><span className="gateway-route-required">*</span> 请求比例</span>
            <span><span className="gateway-route-required">*</span> 目标模型</span>
            <span>多模态透传 <span tabIndex={0} title="开启后，命中透传路径前缀的请求将原样转发至该服务，可修改"
              aria-label="开启后，命中透传路径前缀的请求将原样转发至该服务，可修改"><CircleHelp size={12} aria-hidden="true"/></span></span>
          </div>
          {draft.targets.map((target, index) => <div className="gateway-route-target" key={target.formKey}>
            <span className="sr-only" id={formId + '-provider-' + index}>服务商名称 {index + 1}</span>
            <Select placeholder="请选择" filter aria-labelledby={formId + '-provider-' + index} optionList={providers}
              value={target.endpointId} onChange={endpointId => updateTarget(index, { endpointId })}/>
            <Input aria-label={'请求比例 ' + (index + 1)} placeholder="请输入请求比例" suffix={target.weight !== '' ? '%' : undefined}
              inputMode="numeric" value={String(target.weight)} onChange={weight => updateTarget(index, { weight })}/>
            {mappingInput(target.mapping, index, '目标模型 ' + (index + 1))}
            <div className="gateway-route-row-end">
              <Switch aria-label={'多模态透传 ' + (index + 1)} checked={Boolean(target.passMultimodal)}
                onChange={passMultimodal => updateTarget(index, { passMultimodal, passPath: target.passPath || draft.path })}/>
              {draft.targets.length > 1 && <Button theme="borderless" size="small" aria-label={'删除目标AI服务 ' + (index + 1)}
                icon={<Trash2 size={14} aria-hidden="true"/>} onClick={() => patch({ targets: draft.targets.filter((_, i) => i !== index) })}/>}
            </div>
            {target.passMultimodal && <label className="gateway-route-pass-path">透传路径前缀
              <Input aria-label={'透传路径前缀 ' + (index + 1)} placeholder="默认填充路由路径（Path），可修改"
                value={target.passPath} onChange={passPath => updateTarget(index, { passPath })}/>
            </label>}
          </div>)}
          <Button className="gateway-route-add" block theme="outline" icon={<Plus size={14} aria-hidden="true"/>}
            onClick={() => patch({ targets: [...draft.targets, routeTarget(crypto.randomUUID())] })}>添加目标AI服务</Button>
        </fieldset>
        <fieldset className="gateway-route-field gateway-route-extra">
          <legend>请求头控制 <span tabIndex={0} title="开启多模态透传时，以下请求头将作为静态头附加到透传请求。Authorization 与 Content-Type 不允许配置"
            aria-label="开启多模态透传时，以下请求头将作为静态头附加到透传请求，Authorization 与 Content-Type 不允许配置"><CircleHelp size={13} aria-hidden="true"/></span></legend>
          <Switch aria-label="请求头控制" checked={draft.headersEnabled} onChange={headersEnabled => patch({ headersEnabled })}/>
          {draft.headersEnabled && <>
            {draft.headers.map((row, index) => <div className="gateway-route-header-pair" key={row.formKey}>
              <Input placeholder="Key" aria-label={'请求头名称 ' + (index + 1)} value={row.name} onChange={name => changeHeader(index, { name })}/>
              <Input placeholder="值" aria-label={'请求头值 ' + (index + 1)} value={row.value} onChange={value => changeHeader(index, { value })}/>
              <Button theme="borderless" size="small" aria-label={'删除请求头 ' + (index + 1)} icon={<Trash2 size={14} aria-hidden="true"/>}
                onClick={() => patch({ headers: draft.headers.filter((_, i) => i !== index) })}/>
            </div>)}
            <Button className="gateway-route-add" block theme="outline" icon={<Plus size={14} aria-hidden="true"/>} onClick={appendHeader}>添加请求头</Button>
          </>}
        </fieldset>
        <fieldset className="gateway-route-field gateway-route-extra">
          <legend>降级配置</legend>
          <Switch aria-label="降级配置" checked={draft.degradeEnabled} onChange={degradeEnabled => patch({ degradeEnabled })}/>
          <p className="gateway-route-help">启用后，若请求目标服务失败，网关会改为请求降级服务。</p>
          {draft.degradeEnabled && <div className="gateway-route-degrade">
            <label><span id={formId + '-degrade-codes'}>需要降级的响应码</span>
              <Select multiple filter aria-labelledby={formId + '-degrade-codes'} placeholder="请选择" optionList={responseCodes}
                value={draft.degradeCodes} onChange={degradeCodes => patch({ degradeCodes })}/>
            </label>
            <label><span id={formId + '-degrade-provider'}>降级服务商名称</span>
              <Select filter aria-labelledby={formId + '-degrade-provider'} placeholder="请选择" optionList={providers} value={draft.degradeEndpointId}
                onChange={degradeEndpointId => patch({ degradeEndpointId })}/>
            </label>
            <div>目标模型{mappingInput(draft.degradeMapping, 'degrade', '降级目标模型')}</div>
          </div>}
        </fieldset>
        {error && <p className="gateway-route-error" role="alert">{error}</p>}
      </form>
    </AdminSideSheet>
    {mapping !== null && <RouteMapping value={mapping === 'degrade' ? draft.degradeMapping : draft.targets[mapping].mapping}
      modelOptions={modelOptions} close={() => setMapping(null)}
      setMapping={value => {
        if (mapping === 'degrade') patch({ degradeMapping: value });
        else updateTarget(mapping, { mapping: value });
        setMapping(null);
      }}/>}
    {discard && <AdminModal visible title="放弃未保存的更改？" cancelText="继续编辑" okText="放弃更改"
      onCancel={() => setDiscard(false)} onOk={close}/>}
  </>;
}

export default function GatewayRouteSettings({ state, dispatch, refreshRead }) {
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const writable = canMutate(state.currentRole, { type: 'add', collection: 'routes' });
  const rows = gatewayRouteRows(state);
  const removal = removing && state.routes.find(route => route.id === removing.id);
  const issue = removal && gatewayRouteRemovalIssue(state, removal);
  const canDisable = issue?.includes('停用路由');
  const remove = async () => {
    if (pending || !removal || issue) return;
    setPending(true);
    try {
      if (await dispatch({ type: 'batch', label: '删除模型路由', objectId: removal.id,
        changes: [{ type: 'remove', collection: 'routes', id: removal.id }] })) setRemoving(null);
    } finally { setPending(false); }
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await refreshRead(); } finally { setRefreshing(false); }
  };
  return <>
    <GatewayRouteList rows={rows} refreshing={refreshing}
      onRefresh={refreshRead ? refresh : undefined} onCreate={writable ? () => setEditor({}) : undefined}
      onEdit={writable ? ({ id }) => setEditor({ route: state.routes.find(row => row.id === id) }) : undefined}
      onRemove={writable ? setRemoving : undefined}/>
    {editor && <Editor route={editor.route} state={state} dispatch={dispatch} close={() => setEditor(null)}/>}
    {removing && <AdminModal visible title="删除" onCancel={() => !pending && setRemoving(null)} onOk={remove}
      okButtonProps={{ disabled: !removal || Boolean(issue) }} confirmLoading={pending}>
      <p>确定删除 {removing.name} 吗？</p>
      {issue && <p className="gateway-route-error" role="alert">{issue}</p>}
      {canDisable && <Button type="primary" theme="borderless" disabled={pending}
        onClick={() => dispatch({ type: 'update', collection: 'routes', id: removal.id, changes: { status: '已停用' } })}>停用路由</Button>}
    </AdminModal>}
  </>;
}
