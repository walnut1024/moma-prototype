import { useChannelText } from './channel-language';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import AdminCollapsePanel from './AdminCollapsePanel';
import { useEffect, useId, useRef, useState } from 'react';
import Descriptions from './AdminDescriptions';
import { Banner, Button, Card, Collapse, Dropdown, Form, Input, Space, Switch, Tabs, TextArea, Timeline, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal, AdminSideSheet } from './AdminOverlay';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import AdminActionMenu from './AdminActionMenu';
import { FilterToolbar, FilterReset, PAGE_SIZES, normalizePageSize } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import { Choice, CopyId, serviceOperationsUi } from './ServiceUI';
import { canMutate } from './store';
import { deployableModels, runnableArtifact, deploymentGpu, deploymentConfig, deploymentPreflight,
  deploymentTransaction, validateDeploymentIdentity } from './deployments';
import { serviceCallIdentifiers } from './service-workspace';
import { readInfrastructure } from './infrastructure-state';
import { linkedDeploymentModel, modelFileDeploymentName } from './ops-models';
import { catalogueInitialRecipe, catalogueRecipeMatches, catalogueRecipes } from './model-catalogue';
import { deploymentRuntimeModes, deploymentSources, placementModes } from './deployment-options';
import { DeploymentHistoryPanel, DeploymentImportDialog, DeploymentInstancesTable, DeploymentLogPanel,
  DeploymentMonitorPanel, ScaleScheduleFields, deploymentInstances, exportDeploymentYaml } from './DeploymentOperationsUI';
import DeploymentPlayground from './DeploymentPlayground';
import { deploymentPlaygroundTargets } from './deployment-playground';
import './deployment-management.css';

const { Paragraph, Text, Title } = Typography;
const inProgress = item => ['部署中', '扩缩容中', '更新中'].includes(item.status);
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const blank = {
  name: '', deploymentId: '', modelId: '', runtimeId: '', weightId: '', weightPath: '', clusterId: '',
  namespace: 'inference', replicas: '1', gpuPerReplica: '1', tensorParallel: '1', pipelineParallel: '1',
  maxModelLen: '', gpuMemoryUtilization: '0.9', startupTimeout: '600',
  source: '本地路径', repository: '', filename: '', description: '',
  runtimeMode: deploymentRuntimeModes[0], backend: '', backendVersion: '', containerImage: '',
  placement: placementModes[0], placementTargets: [], scalingRules: [], roles: null,
  cacheAcceleration: null, environment: '', parameters: '', loraAdapters: [], speculative: null,
  offloading:false, distributedInference:false, restartOnError:false, nativeAnthropic:false,
};
const catalogueSourceLabels = { huggingface:'Hugging Face', model_scope:'ModelScope', local_path:'本地路径' };
const catalogueNoGpuMessage = '所选集群中没有兼容该模型的 GPU。';
const emptyCatalogueFields = {
  source:'', repository:'', filename:'', weightId:'', weightPath:'', runtimeId:'',
  runtimeMode:'推理后端版本', backend:'', backendVersion:'', containerImage:'',
  parameters:'', environment:'', speculative:null, cacheAcceleration:null, loraAdapters:[],
};
const confirmTitles = { scale: '扩缩容', stop: '停止部署', start: '启动部署', check: '检查部署', rollback: '回滚配置',
  restart: '重新启动', delete: '删除部署', restartInstance: '删除并重建实例' };
const confirmActions = { scale: '调整', stop: '停止', start: '启动', check: '检查', rollback: '回滚',
  restart:'重新启动', delete:'删除', restartInstance:'重建' };
const confirmDetails = {
  stop: '停止后端点不可用，并释放该部署占用的 GPU。已保存的配置将保留。',
  start: '重新检查配置和可用资源，提交启动任务。原端点待服务就绪后恢复。',
  check: '根据当前集群、制品与配置检查部署任务，并更新就绪状态。失败时释放预留的 GPU。',
  rollback: '恢复上一版配置并重建服务，当前端点会暂时不可用。',
  restart: '重新启动会重建所有实例，部署配置保持不变。',
  delete: '删除后释放部署占用的 GPU，并停用端点。历史操作仍可查阅。',
  restartInstance: '删除当前实例和运行状态，系统按目标副本数重建。',
};
const primaryOperation = item => item.status === '运行中' ? 'scale' : inProgress(item) ? 'check' : 'start';

function Facts({ values }) {
  return <Descriptions align="left" data={values.map(([key, value]) => ({ key, value: value ?? '—' }))}/>;
}

function ErrorNote({ message }) {
  return message && <Banner type="danger" closeIcon={null} description={message}/>;
}

const filePlacementFields = ['source','repository','filename','weightId','weightPath','clusterId','placement','placementTargets'];
const gpuFrameworks = { nvidia:'cuda', amd:'rocm', ascend:'cann', huawei:'cann', hygon:'dcu', cambricon:'neuware',
  iluvatar:'corex', metax:'maca', 'moore threads':'musa', 't-head':'hggc' };

function compatibleFileBackends(records, { clusterId, placement, placementTargets = [] }) {
  const devices = (records['ops-gpus'] || []).filter(device=>device.clusterId===clusterId && device.status==='正常' &&
    (placement === '指定节点' ? placementTargets.includes(device.nodeId) : placement === '指定 GPU' ? placementTargets.includes(device.id) : true));
  const frameworks = devices.map(device=>gpuFrameworks[String(device.vendor || '').toLowerCase()]);
  const matches = supported => {
    const declared = Array.isArray(supported) ? supported : String(supported || '').split(/[\s/,、]+/);
    const names = declared.filter(Boolean).map(value=>String(value).toLowerCase());
    return !names.length || !frameworks.length || frameworks.some(value=>!value || names.includes(value));
  };
  return (records['ops-inference-backends'] || []).filter(item=>item.status!=='已停用').flatMap(item=>{
    const versions = Array.isArray(item.versions) ? item.versions : String(item.versions || item.version || '').split(/[、,，]/);
    const available = versions.flatMap(entry=>{
      const name = (typeof entry==='string' ? entry : entry?.version)?.trim();
      return name && matches(entry?.frameworks ?? entry?.framework ?? item.framework) ? [name] : [];
    });
    return available.length ? [{...item,compatibleVersions:[...new Set(available)]}] : [];
  });
}

function modelFileSelectionIssue(values, records, state) {
  if (!values.sourceFileId) return;
  const file = (records['ops-model-files'] || []).find(item=>item.id===values.sourceFileId);
  const worker = (records['ops-nodes'] || []).find(item=>item.id===file?.workerId && item.status==='就绪');
  if (!file || file.lora || file.status!=='可用' || !worker || worker.clusterId!==values.clusterId ||
      !state.clusters.some(item=>item.id===worker.clusterId && item.status==='运行中') ||
      values.placement!=='指定节点' || values.placementTargets?.length!==1 || values.placementTargets[0]!==worker.id ||
      file.mountPath!==values.weightPath) throw Error('该模型文件或所在节点不可用，请重新选择文件');
  if (values.runtimeMode==='推理后端版本' && !compatibleFileBackends(records,values)
    .some(backend=>backend.name===values.backend && backend.compatibleVersions.includes(values.backendVersion))) {
    throw Error('请选择与目标节点兼容的推理后端和版本');
  }
}

function modelFilePrefill(state, fileId, records) {
  const row = (records['ops-model-files'] || []).find(item=>item.id===fileId);
  const worker = (records['ops-nodes'] || []).find(item=>item.id===row?.workerId && item.status==='就绪');
  if (!row || row.lora || row.status!=='可用' || !worker || !row.mountPath ||
      !state.clusters.some(item=>item.id===worker.clusterId && item.status==='运行中')) {
    return {selectionError:'模型文件或所在节点不可用，请返回模型文件重新选择'};
  }
  const placement = {clusterId:worker.clusterId,placement:'指定节点',placementTargets:[worker.id]};
  const devices = (records['ops-gpus'] || []).filter(item=>item.nodeId===worker.id && item.clusterId===worker.clusterId && item.status==='正常');
  const gguf = /\.gguf$/i.test(row.filename || row.mountPath);
  const backendName = gguf ? 'llama.cpp' : devices.length && devices.every(item=>/ascend|huawei/i.test(item.vendor || '')) ? 'MindIE' : 'vLLM';
  const backend = compatibleFileBackends(records,placement).find(item=>item.name===backendName);
  const version = backend?.compatibleVersions.includes(backend.version) ? backend.version : backend?.compatibleVersions[0];
  return { ...placement, sourceFileId:row.id, name:modelFileDeploymentName(row), weightPath:row.mountPath,
    modelId:linkedDeploymentModel(row,deployableModels(state))?.id || '',source:'本地路径',
    runtimeMode:'推理后端版本',backend:backend?.name || '',backendVersion:version || '' };
}

function deploymentPrefill(state, selection) {
  if (!selection.id) return {};
  try {
    const records = readInfrastructure();
    const row = records[selection.page].find(item => item.id === selection.id);
    if (!row) return {};
    const modelId = linkedDeploymentModel(row, deployableModels(state))?.id;
    const spec = row.specs?.[selection.spec ?? 0];
    const requestedBackend = spec?.backend || row.backend;
    const backend = records['ops-inference-backends'].find(item =>
      item.name === requestedBackend && item.version && item.status !== '已停用');
    const remoteSource = ['Hugging Face','ModelScope'].includes(selection.repositorySource) ? selection.repositorySource : null;
    return {
      ...(modelId ? { modelId } : {}),
      source: remoteSource || '模型库',
      repository: remoteSource ? selection.repository || row.repository : spec?.repository || row.repository,
      ...(backend ? { runtimeMode:'推理后端版本', backend:backend.name, backendVersion:backend.version } : {}),
    };
  } catch {
    return {};
  }
}

function catalogueDevices(records, { clusterId, placement, placementTargets = [] }) {
  const nodes = new Set((records['ops-nodes'] || []).filter(row=>row.clusterId===clusterId && row.status==='就绪').map(row=>row.id));
  return (records['ops-gpus'] || []).filter(device=>device.clusterId===clusterId && nodes.has(device.nodeId) && device.status==='正常' &&
    (placement==='指定节点' ? placementTargets.includes(device.nodeId) : placement==='指定 GPU' ? placementTargets.includes(device.id) : true));
}

function catalogueSpecFields(spec, records) {
  if (!spec) return emptyCatalogueFields;
  const backend = records['ops-inference-backends'].find(item=>item.name===spec.backend && item.status!=='已停用');
  const speculation = spec.speculativeConfig;
  const supportedAlgorithms = { mtp:'MTP', eagle3:'Eagle3', ngram:'N-gram' };
  return {
    ...emptyCatalogueFields,
    source:catalogueSourceLabels[spec.source] || '模型库',
    repository:spec.source==='local_path' ? '' : spec.repository,
    weightPath:spec.source==='local_path' ? spec.repository : '', filename:spec.filename || '',
    runtimeMode:spec.imageName ? '自定义镜像' : '推理后端版本', backend:spec.backend || '',
    backendVersion:spec.imageName ? '' : spec.backendVersion || backend?.version || '', containerImage:spec.imageName || '',
    parameters:(spec.parameters || []).join('\n'),
    environment:Object.entries(spec.environment || {}).map(([key,value])=>`${key}=${value}`).join('\n'),
    speculative:speculation?.enabled && supportedAlgorithms[speculation.algorithm] ? {
      algorithm:supportedAlgorithms[speculation.algorithm], tokens:speculation.num_draft_tokens,
      draftModel:speculation.draft_model, min:speculation.ngram_min_match_length, max:speculation.ngram_max_match_length,
    } : null,
  };
}

function DeploymentEditor({ state, existing, clone, source, can, run, onClose, onSaved, dirty, selection, busy, infrastructure, fileId, confirmingClose }) {
  const formId = useId();
  const original = existing || clone;
  const catalogueModel = !original && !fileId && selection?.id && !selection.repositorySource &&
    (infrastructure['ops-model-library'] || []).find(row=>row.id===selection.id);
  const defaultCluster = state.clusters.find(row=>row.status==='运行中' && row.isDefault) || state.clusters.find(row=>row.status==='运行中');
  const catalogueName = catalogueModel?.name?.toLowerCase().replace(/\s/g,'-');
  const catalogueSpecs = catalogueModel ? catalogueModel.specs ?? [{
    mode:catalogueModel.spec?.startsWith('高吞吐') ? 'throughput' : catalogueModel.spec?.startsWith('低延迟') ? 'latency' : 'standard',
    quantization:catalogueModel.spec?.split(' · ')[1], repository:catalogueModel.repository, backend:catalogueModel.backend,
    source:catalogueModel.source==='ModelScope' ? 'model_scope' : catalogueModel.source==='本地路径' ? 'local_path' : 'huggingface',
  }] : [];
  const [catalogueSpecIndex,setCatalogueSpecIndex] = useState(()=>{
    const modes = catalogueRecipes(catalogueSpecs,catalogueDevices(infrastructure,{clusterId:defaultCluster?.id}));
    const selected = selection?.spec == null ? undefined : modes.find(option=>option.index===Number(selection.spec));
    return (selected ?? modes[0])?.index ?? null;
  });
  const catalogueSpec = catalogueSpecs[catalogueSpecIndex];
  const catalogueWithoutSpec = Boolean(catalogueModel && !catalogueSpec);
  const [values, setValues] = useState(() => original ? {
    ...blank, ...Object.fromEntries(Object.entries(deploymentConfig(original)).filter(([,value])=>value !== undefined)),
    name: clone ? original.name.slice(0, 76) + ' 副本' : original.name,
    deploymentId: clone ? original.deploymentId.slice(0, 57) + '-copy' : original.deploymentId,
    tensorParallel: original.tensorParallel || original.gpuPerReplica,
  } : { ...blank, ...(deploymentSources.includes(source) ? { source } : {}),
    ...(fileId ? modelFilePrefill(state,fileId,infrastructure) : deploymentPrefill(state,selection)),
    ...(catalogueModel ? { ...catalogueSpecFields(catalogueSpec,infrastructure), name:catalogueName, clusterId:defaultCluster?.id || '' } : {}) });
  const [error, setError] = useState('');
  const [evaluated, setEvaluated] = useState(false);
  const [catalogueWarningDismissed,setCatalogueWarningDismissed] = useState(false);
  const [weightMode, setWeightMode] = useState(original?.weightId ? 'artifact' : 'path');
  const change = patch => {
    setValues(previous => {
      const changedFile = previous.sourceFileId && filePlacementFields.some(key=>Object.hasOwn(patch,key) &&
        JSON.stringify(previous[key])!==JSON.stringify(patch[key]));
      return { ...previous,...patch,...(changedFile ? {sourceFileId:''} : {}) };
    });
    setError('');
    setEvaluated(false);
    dirty.current = true;
  };
  const models = deployableModels(state);
  const model = models.find(row=>row.id===values.modelId);
  const cluster = state.clusters.find(row=>row.id===values.clusterId);
  const runtimes = state.artifacts.filter(row=>runnableArtifact(row,'运行时镜像'));
  const weights = state.artifacts.filter(row=>runnableArtifact(row,'模型制品') && (!row.modelId || row.modelId===values.modelId));
  const remote = ['Hugging Face','ModelScope'].includes(values.source);
  const catalogueModes = catalogueModel ? catalogueRecipes(catalogueSpecs,catalogueDevices(infrastructure,{clusterId:values.clusterId})) : [];
  const catalogueSources = Object.entries(catalogueSourceLabels).filter(([source])=>catalogueModes.some(option=>option.spec.source===source));
  const showCatalogueWarning = catalogueWithoutSpec && !catalogueWarningDismissed;
  const catalogueWarningId = formId + '-catalogue-warning';
  const currentValues = { ...values, weightPath:values.weightPath ||
    ((remote || values.source==='模型库') && model && values.repository ? '/models/' + model.modelId : '') };
  const backends = values.sourceFileId ? compatibleFileBackends(infrastructure,values)
    : (infrastructure['ops-inference-backends'] || []).filter(row=>row.status !== '已停用');
  const backend = backends.find(row=>row.name===values.backend);
  const versions = backend?.compatibleVersions ?? (Array.isArray(backend?.versions) ? backend.versions.map(item=>typeof item==='string' ? item : item.version).filter(Boolean)
    : [...new Set([backend?.version,...String(backend?.versions ?? '').split(/[、,，]/)].filter(Boolean))]);
  const cacheServices = (infrastructure['ops-cache-acceleration'] || []).filter(row=>row.clusterId===values.clusterId && row.status==='运行中');
  const placementOptions = values.placement === '指定节点' ? (infrastructure['ops-nodes'] || [])
    .filter(row=>row.clusterId===values.clusterId && row.status==='就绪').map(row => [row.id, row.name])
    : (infrastructure['ops-gpus'] || []).filter(row=>row.clusterId===values.clusterId && row.status==='正常')
      .map(row => [row.id, row.name + ' · ' + row.nodeId + ' / GPU ' + row.index]);
  const available = cluster ? cluster.totalGpu - cluster.allocatedGpu + (existing ? deploymentGpu(existing) : 0) : null;
  const required = Number(values.replicas)*Number(values.gpuPerReplica);
  let preflightError;
  try {
    if (values.selectionError) throw Error(values.selectionError);
    if (catalogueWithoutSpec) throw Error(catalogueNoGpuMessage);
    if (catalogueSpec && !catalogueRecipeMatches(catalogueSpec,catalogueDevices(infrastructure,values))) {
      throw Error('所选部署规格与调度目标的 GPU 不兼容');
    }
    if (!existing) validateDeploymentIdentity(state, currentValues);
    modelFileSelectionIssue(currentValues,infrastructure,state);
    deploymentPreflight(state,currentValues,existing);
  } catch (issue) { preflightError=issue.message; }
  const submit = async event => {
    event.preventDefault();
    if (busy || confirmingClose) return;
    if (catalogueWithoutSpec) {
      setCatalogueWarningDismissed(false);
      Toast.error(catalogueNoGpuMessage);
      return;
    }
    if (preflightError) { setError(preflightError); return; }
    const result = await run(existing?'update':'create',currentValues,existing?.id,false,setError);
    if (!result) return;
    const savedId = existing?.id || result.deployments.find(item=>!item.retiredAt && item.deploymentId===currentValues.deploymentId)?.id;
    if (savedId) onSaved(savedId);
    else setError('部署已提交，请返回列表刷新核对。');
  };
  const input = (key,label,props={}) => <Form.Slot label={label}>
    <Input aria-label={label} value={values[key] ?? ''} onChange={value=>change({[key]:value})} disabled={!can} {...props}/>
  </Form.Slot>;
  const textArea = (key,label,placeholder) => <Form.Slot label={label}>
    <TextArea aria-label={label} rows={3} value={values[key] ?? ''} onChange={value=>change({[key]:value})} placeholder={placeholder} disabled={!can}/>
  </Form.Slot>;
  const choice = (key,label,options,props={}) => <Form.Slot label={label}>
    <Choice label={label} value={values[key] || undefined} disabled={!can} motion={false} options={options}
      onChange={value=>change({[key]:value})} {...props}/>
  </Form.Slot>;
  const sameOptions = options=>options.map(value=>[value,value]);
  const artifactOptions = items=>items.map(item=>[item.id,item.name + ' · ' + item.version]);
  const close = () => { if (!busy && !confirmingClose) onClose(); };
  const chooseCatalogueSpec = (index, placement = {}) => {
    const spec = catalogueSpecs[index];
    setCatalogueSpecIndex(index);
    setCatalogueWarningDismissed(false);
    setWeightMode('path');
    change({ ...catalogueSpecFields(spec,infrastructure), ...(!spec && !values.roles ? { replicas:'1' } : {}),
      ...(placement.clusterId ? { name:catalogueName } : {}), ...placement });
    setEvaluated(Boolean(spec));
  };
  const changeCluster = clusterId => {
    const placement = {clusterId,placementTargets:[],cacheAcceleration:null};
    if (!catalogueModel) { change(placement); return; }
    const next = catalogueInitialRecipe(catalogueSpecs,catalogueDevices(infrastructure,{clusterId}));
    chooseCatalogueSpec(next?.index ?? null,placement);
  };
  return <AdminSideSheet title={existing ? '编辑部署' : clone ? '克隆部署' : '部署模型'} visible
    width="min(1120px, 100vw)" className="admin-deployment-drawer" onCancel={close} closeOnEsc={!busy && !confirmingClose}
    footer={<>
      {showCatalogueWarning && <div id={catalogueWarningId} style={{flexBasis:'100%'}}>
        <Banner type="warning" description={catalogueNoGpuMessage} onClose={()=>setCatalogueWarningDismissed(true)}/>
      </div>}
      <Button disabled={busy} onClick={close}>取消</Button>
      <Button disabled={busy} onClick={()=>{setEvaluated(true);setCatalogueWarningDismissed(false);}}>评估部署</Button>
      <Button form={formId} htmlType="submit" theme="solid" loading={busy} disabled={!can}
        aria-describedby={showCatalogueWarning ? catalogueWarningId : undefined}>{showCatalogueWarning ? '仍然提交' : existing ? '保存' : '部署'}</Button>
    </>}>
    <form id={formId} noValidate onSubmit={submit} className="admin-deployment-editor">
      <Card>
        <div className="admin-analytics-fields">
          <Title heading={5} component="h2">基本信息</Title>
          {catalogueModel && <>
            <Facts values={[[ '模型库',catalogueModel.name ],[ '部署规格',catalogueSpec?.quantization ],[ '模型仓库',catalogueSpec?.repository ]]}/>
            <div className="admin-deployment-fields">
              <Choice label="部署模式" value={catalogueSpec ? catalogueSpec.mode ?? 'standard' : undefined}
                placeholder="目标集群暂无匹配规格" options={catalogueModes.map(({mode,spec})=>
                  [mode,[mode,spec.quantization,spec.backend].filter(Boolean).join(' · ')])}
                onChange={mode=>{const preferred = catalogueModes.find(option=>option.mode===mode);if (preferred) chooseCatalogueSpec(preferred.index);}}
                disabled={!can || busy}/>
              <Choice label="模型文件来源" value={catalogueSpec?.source} options={catalogueSources}
                onChange={source=>{const preferred = catalogueModes.find(option=>option.spec.source===source);if (preferred) chooseCatalogueSpec(preferred.index);}}
                disabled={!can || busy}/>
            </div>
          </>}
          <div className="admin-deployment-fields">
            {input('name','部署名称',{disabled:!can || Boolean(existing),maxLength:80})}
            {input('deploymentId','部署编码',{disabled:!can || Boolean(existing),placeholder:'qwen-service-prod'})}
          </div>
          {textArea('description','描述','')}
          {!catalogueModel && choice('source','模型来源',sameOptions(deploymentSources),{disabled:!can || Boolean(existing),
            onChange:source=>change({source,repository:'',filename:''})})}
          {remote && !catalogueModel && <div className="admin-deployment-fields">
            {input('repository','模型仓库',{placeholder:'组织名/模型名'})}
            {input('filename','指定文件',{placeholder:'可选，如 model.gguf'})}
          </div>}
          {choice('modelId','模型',models.map(row=>[row.id,row.name + ' · ' + row.modelId]),{
            disabled:!can || Boolean(existing), onChange:modelId=>change({modelId,weightId:''}),
          })}
          {!catalogueWithoutSpec && <div className="admin-deployment-fields">
            <Form.Slot label="权重来源"><Choice label="权重来源" value={weightMode} disabled={!can}
              options={[[ 'path','集群内已挂载路径' ],[ 'artifact','已登记模型制品' ]]}
              onChange={mode=>{setWeightMode(mode);change({weightId:'',weightPath:''});}}/></Form.Slot>
            {weightMode==='artifact' ? choice('weightId','模型制品',artifactOptions(weights)) :
              input('weightPath','权重路径',{placeholder:remote?'留空时使用模拟下载目录':'/models/qwen'})}
          </div>}
          <Title heading={5} component="h2">运行环境</Title>
          {choice('runtimeMode','运行方式',sameOptions(deploymentRuntimeModes),{
            onChange:runtimeMode=>change({runtimeMode,backend:'',backendVersion:'',containerImage:'',cacheAcceleration:null}),
          })}
          {values.runtimeMode===deploymentRuntimeModes[0] ? choice('runtimeId','运行时镜像',artifactOptions(runtimes))
            : values.runtimeMode===deploymentRuntimeModes[2] ? input('containerImage','容器镜像地址',{placeholder:'registry.example.com/inference:latest'})
              : <div className="admin-deployment-fields">
                {choice('backend','推理后端',sameOptions(backends.map(row=>row.name)),{onChange:backend=>change({backend,backendVersion:'',cacheAcceleration:null})})}
                {choice('backendVersion','后端版本',sameOptions(versions))}
              </div>}
          <Title heading={5} component="h2">集群与调度</Title>
          <div className="admin-deployment-fields">
            {choice('clusterId','目标集群',state.clusters.filter(row=>row.status==='运行中').map(row=>[row.id,row.name]),
              {disabled:!can || Boolean(existing),onChange:changeCluster})}
            {input('namespace','命名空间')}
            {choice('placement','GPU 调度方式',sameOptions(placementModes),{onChange:placement=>change({placement,placementTargets:[]})})}
            {values.placement!==placementModes[0] && <Choice label="调度目标" multiple filter showClear value={values.placementTargets}
              options={placementOptions} onChange={placementTargets=>change({placementTargets})}/>}
          </div>
          <div className="admin-deployment-fields">
            {input('replicas','副本数',{type:'number',min:1,max:100,disabled:!can || Boolean(values.roles)})}
            {input('gpuPerReplica','每副本 GPU',{type:'number',min:1,max:64,onChange:gpuPerReplica=>change({gpuPerReplica,tensorParallel:gpuPerReplica,pipelineParallel:1})})}
            {input('tensorParallel','张量并行 TP',{type:'number',min:1})}
            {input('pipelineParallel','流水线并行 PP',{type:'number',min:1})}
          </div>
          <Collapse>
            <AdminCollapsePanel itemKey="parameters" header="高级运行参数">
              <div className="admin-deployment-fields">
                {input('maxModelLen','上下文上限（Token）',{type:'number'})}
                {input('gpuMemoryUtilization','显存利用比例',{type:'number',min:.01,max:1,step:.01})}
                {input('startupTimeout','启动超时（秒）',{type:'number',min:1,max:7200})}
              </div>
              {textArea('parameters','推理参数','每行一项启动参数')}
              {textArea('environment','环境变量','每行一项 NAME=VALUE')}
              <Space wrap>
                {Object.entries({offloading:'CPU 卸载',distributedInference:'跨节点推理',restartOnError:'异常后重启',nativeAnthropic:'原生 Anthropic API'})
                  .map(([key,label])=><Space key={key}><span>{label}</span>
                    <Switch aria-label={label} checked={values[key]} onChange={value=>change({[key]:value})}/></Space>)}
              </Space>
            </AdminCollapsePanel>
            <AdminCollapsePanel itemKey="lora" header="LoRA 适配器">
              {(values.loraAdapters ?? []).map((entry,index)=><Space key={index} wrap>
                {Object.entries({name:'名称',path:'权重路径'}).map(([key,label])=><Input key={key} aria-label={`适配器 ${index+1} ${label}`}
                  value={entry[key]} placeholder={label} onChange={value=>change({loraAdapters:values.loraAdapters.map((row,i)=>i===index?{...row,[key]:value}:row)})}/>)}
                <Button type="danger" theme="borderless" onClick={()=>change({loraAdapters:values.loraAdapters.filter((_,i)=>i!==index)})}>移除</Button>
              </Space>)}
              <Button theme="light" disabled={values.loraAdapters?.length>=20}
                onClick={()=>change({loraAdapters:[...(values.loraAdapters ?? []),{name:'',path:''}]})}>添加适配器</Button>
            </AdminCollapsePanel>
            <AdminCollapsePanel itemKey="speculative" header="推测解码">
              <Space><span>启用推测解码</span><Switch aria-label="启用推测解码" checked={Boolean(values.speculative)}
                onChange={enabled=>change({speculative:enabled?{algorithm:'N-gram',tokens:5,min:1,max:3}:null})}/></Space>
              {values.speculative && <div className="admin-deployment-fields">
                <Choice label="推测解码算法" value={values.speculative.algorithm} options={sameOptions(['Eagle3','MTP','N-gram'])}
                  onChange={algorithm=>change({speculative:{algorithm,tokens:values.speculative.tokens,min:1,max:3,draftModel:''}})}/>
                {Object.entries({tokens:'推测 Token 数',...(values.speculative.algorithm==='N-gram'?{min:'最小匹配长度',max:'最大匹配长度'}:
                  values.speculative.algorithm==='Eagle3'?{draftModel:'草稿模型'}:{})}).map(([key,label])=><Form.Slot key={key} label={label}>
                    <Input aria-label={label} type={key==='draftModel'?'text':'number'} value={values.speculative[key]}
                      onChange={value=>change({speculative:{...values.speculative,[key]:value}})}/>
                  </Form.Slot>)}
              </div>}
            </AdminCollapsePanel>
            <AdminCollapsePanel itemKey="scaling" header="定时扩缩容">
              <ScaleScheduleFields rules={values.scalingRules ?? []} change={scalingRules=>change({scalingRules})}/>
            </AdminCollapsePanel>
            <AdminCollapsePanel itemKey="cache" header="缓存加速">
              <Choice label="共享缓存服务" value={values.cacheAcceleration?.name} showClear placeholder="当前集群的缓存服务"
                options={cacheServices.map(row => [row.name, row.name + ' · ' + row.provider])}
                onChange={name=>{ const row=cacheServices.find(service=>service.name===name);
                  change({cacheAcceleration:row?{name:row.name,provider:row.provider,clusterId:row.clusterId}:null}); }}/>
            </AdminCollapsePanel>
            <AdminCollapsePanel itemKey="pd" header="预填充 / 解码分离">
              <Space><span>启用 PD 分离</span><Switch aria-label="启用 PD 分离" checked={Boolean(values.roles)}
                onChange={enabled=>change(enabled?{roles:{prefill:1,decode:1,router:1},replicas:3}:{roles:null})}/></Space>
              {values.roles && <div className="admin-deployment-fields">
                {Object.entries({prefill:'预填充',decode:'解码',router:'路由'}).map(([key,label])=><Form.Slot key={key} label={label}>
                  <Input type="number" min={1} aria-label={label+'副本'} value={values.roles[key]} onChange={value=>{
                    const roles={...values.roles,[key]:value};
                    change({roles,replicas:Object.values(roles).reduce((total,count)=>total+Number(count),0)});
                  }}/>
                </Form.Slot>)}
              </div>}
            </AdminCollapsePanel>
          </Collapse>
          <ErrorNote message={error}/>
        </div>
      </Card>
      <Card title="资源预览">
        <div className="admin-analytics-fields">
          <Facts values={[[ '模型',model?.name ],[ '目标集群',cluster?.name ],[ 'GPU 型号',cluster?.gpuType ],
            [ '当前可用 GPU',available ],[ '本次需求',Number.isFinite(required)?required:null ],[ '预计余量',available==null?null:available-required ]]}/>
          {evaluated && !catalogueWithoutSpec && <Banner type={preflightError?'danger':'success'} closeIcon={null} title="部署评估"
            description={preflightError || '配置和容量检查通过，可提交部署。'}/>}
        </div>
      </Card>
    </form>
  </AdminSideSheet>;
}

const detailTabs = [['overview','概览'],['monitoring','监控'],['instances','实例'],['gpu','GPU 资源'],['config','配置']];

function DeploymentActions({ item, can, go, ask, tools }) {
  const t = useChannelText();
  const menu = [
    tools.canPlayground(item) && { name:t('在 Playground 中打开'), onClick:()=>tools.openPlayground(item) },
    !inProgress(item) && { name:'编辑', disabled:!can, onClick:()=>go({ view:'edit',deployment:item.id }) },
    { name:'监控详情', onClick:()=>go({ deployment:item.id,tab:'monitoring' }) },
    tools.canBenchmark(item) && { name:'基准测试', onClick:()=>tools.onBenchmark(item) },
    { name:confirmTitles[primaryOperation(item)], disabled:!can, onClick:()=>ask(item,primaryOperation(item)) },
    item.status==='运行中' && { name:'重新启动', disabled:!can, onClick:()=>ask(item,'restart') },
    item.status!=='停止' && { name:'停止', disabled:!can, onClick:()=>ask(item,'stop') },
    { name:'配置版本历史', onClick:()=>tools.openHistory(item) },
    { name:'克隆', disabled:!can, onClick:()=>go({ view:'create',clone:item.id, deployment:null,tab:null }) },
    { name:'导出 YAML', onClick:()=>tools.exportRows([item]) },
    { name:'删除', type:'danger', disabled:!can, onClick:()=>ask(item,'delete') },
  ].filter(Boolean).map(entry=>({node:'item',...entry}));
  return <AdminActionMenu label={item.name + ' 操作'} items={menu}/>;
}

function DeploymentDetail({ item, state, can, go, ask, tab, tools, infrastructure }) {
  const t = useChannelText();
  const model = deployableModels(state).find(row=>row.id===item.modelId);
  const cluster = state.clusters.find(row => row.id === item.clusterId);
  const endpoint = state.endpoints.find(row => row.id === item.endpointId);
  const artifactName = id => state.artifacts.find(row => row.id === id)?.name;
  const statusHint = inProgress(item) ? '部署任务正在等待检查。请确认资源、权重和运行环境。'
    : item.status === '失败' ? '请先处理失败原因，再重新启动。'
      : item.status === '停止' ? 'GPU 资源已释放，重新启动时将再次检查可用容量。' : null;
  const steps = [
    ['配置提交', time(item.createdAt), Boolean(item.createdAt)],
    ['资源预留', deploymentGpu(item) ? `${deploymentGpu(item)} 张 GPU` : '未占用', deploymentGpu(item) > 0],
    ['启动与就绪', item.status === '运行中' ? item.readyReplicas === item.replicas ? '就绪检查通过' : '就绪数据未接入'
      : item.failureReason || (item.status === '停止' ? '服务已停止' : '等待检查'), item.status === '运行中' && item.readyReplicas === item.replicas],
    ['服务端点', endpoint?.status === '运行中' ? '已启用' : '未启用', endpoint?.status === '运行中'],
  ];
  return <>
    <AdminPageHeading title={item.name} description={`${item.deploymentId} · ${model?.name || '模型记录缺失'}`}>
      <Space wrap>
        {endpoint?.status==='运行中' && <Button onClick={()=>tools.openAccess(item)}>API 访问信息</Button>}
        {tools.canPlayground(item) && <Button theme="solid" onClick={()=>tools.openPlayground(item)}>{t('在 Playground 中打开')}</Button>}
        <DeploymentActions item={item} can={can} go={go} ask={ask} tools={tools}/>
      </Space>
    </AdminPageHeading>
    <Card>
      <Space wrap>
        <AdminStatus value={item.status}/>
        <Text type="secondary">集群：{cluster?.name || '—'}</Text>
        <Text type="secondary">配置版本：{item.configRevision ? `v${item.configRevision}` : '未登记'}</Text>
        <Text type="secondary">更新：{time(item.updatedAt)}</Text>
      </Space>
      <Tabs className="admin-deployment-detail-tabs" activeKey={tab} onChange={tab => go({ tab })}>
        {detailTabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}/>)}
      </Tabs>
      <div className="admin-analytics-fields">
        {tab === 'config' ? <>
          <Title heading={5} component="h2">模型与运行环境</Title>
          <Facts values={[
            ['模型展示名称', model?.name], ['模型 ID', model ? serviceCallIdentifiers(model).join('、') : '—'], ['模型权重', item.weightId ? artifactName(item.weightId) : item.weightPath],
            ['模型来源',item.source],['模型仓库',item.repository], ['运行时镜像', artifactName(item.runtimeId) || item.containerImage],
            ['推理后端',item.backend && `${item.backend} · ${item.backendVersion}`], ['命名空间', item.namespace],
            ['缓存加速',item.cacheAcceleration?.name],['调度方式',item.placement],
            ['定时规则',item.scalingRules?.length ? item.scalingRules.map(row=>`周 ${row.days.join('/')} ${row.time} → ${row.replicas}`).join('、') : undefined],
            ['集群', cluster?.name], ['GPU 型号', cluster?.gpuType], ['目标副本数', item.replicas], ['每副本 GPU', item.gpuPerReplica],
            ['张量并行 / 流水线并行', item.tensorParallel ? `${item.tensorParallel} / ${item.pipelineParallel}` : '—'],
            ['上下文上限', item.maxModelLen ? `${item.maxModelLen} Token` : item.configRevision ? '沿用模型配置' : '未登记'],
            ['显存利用比例', item.gpuMemoryUtilization], ['启动超时', item.startupTimeout ? `${item.startupTimeout} 秒` : '—'],
          ]}/>
          <Space>
            <Button onClick={()=>tools.openHistory(item)}>配置版本历史</Button>
            <Button onClick={()=>tools.exportRows([item])}>导出 YAML</Button>
          </Space>
        </> : tab === 'monitoring' ? <DeploymentMonitorPanel key={item.id} item={item}/>
        : tab === 'instances' ? <DeploymentInstancesTable rows={deploymentInstances([item])} state={state} can={can}
          onDetail={()=>go({tab:'overview'})} {...tools.instanceProps}/>
        : tab === 'gpu' ? <>
          <Facts values={[[ '集群',cluster?.name ],[ '已分配 GPU',deploymentGpu(item) ],[ '调度模式',item.placement ]]}/>
          <Table rowKey="id" pagination={false} dataSource={(infrastructure['ops-gpus'] || []).filter(row=>
            item.placement==='指定 GPU' && item.placementTargets?.includes(row.id))}
            empty="暂无此部署的 GPU 设备绑定记录" columns={[
              {title:'设备',dataIndex:'name',render:(name,row)=><Button theme="borderless" onClick={()=>tools.onNavigate('ops-gpus?view=detail&record='+encodeURIComponent(row.id))}>{name}</Button>},
              {title:'节点',dataIndex:'nodeId'}, {title:'总显存（GiB）',dataIndex:'vram'}, {title:'状态',dataIndex:'status'},
            ]}/>
        </> : tab === 'events' ? <>
          <Title heading={5} component="h2">部署事件</Title>
          {item.events?.length ? <Timeline>
            {[...item.events].reverse().map((event, index) => <Timeline.Item key={index} type={event.level === '异常' ? 'error' : 'success'} time={time(event.at)}>
              {event.message}
            </Timeline.Item>)}
          </Timeline> : <Paragraph type="secondary">尚无部署过程事件。</Paragraph>}
          <Title heading={5} component="h2">操作记录</Title>
          <Table size="small" rowKey="id" pagination={false} scroll={{ x: 'max(100%, 520px)' }}
            dataSource={state.audits.filter(row => [item.id, item.deploymentId].includes(row.objectId))}
            columns={[
              { title: '时间', dataIndex: 'createdAt', render: time },
              { title: '操作人', dataIndex: 'actor' },
              { title: '操作', dataIndex: 'action' },
              { title: '结果', dataIndex: 'result' },
            ]}/>
          <Title heading={5} component="h2">容器日志</Title>
          <Paragraph type="secondary">尚未接入集群容器日志。</Paragraph>
        </> : <>
          <div className="admin-analysis-plot-grid">
            <section className="admin-analytics-fields">
              <Title heading={5} component="h2">副本与资源</Title>
              <Facts values={[
                ['就绪 / 目标副本', `${item.readyReplicas ?? '—'} / ${item.replicas}`], ['已分配 GPU', `${deploymentGpu(item)} 张`],
                ['每副本 GPU', `${item.gpuPerReplica} 张`], ['集群可用 GPU', cluster ? `${cluster.totalGpu - cluster.allocatedGpu} 张` : '—'],
              ]}/>
              <Paragraph type="secondary">副本节点、GPU 显存、CPU 和内存用量尚未接入。</Paragraph>
            </section>
            <section className="admin-analytics-fields">
              <Title heading={5} component="h2">服务端点</Title>
              <Facts values={[
                ['接口格式', endpoint?.protocol || 'OpenAI'], ['端点状态', endpoint?.status || '尚未生成'],
                ['端点编码', endpoint?.endpointId], ['Model ID', model?.modelId],
              ]}/>
              {endpoint?.baseUrl ? <div className="admin-deployment-endpoint"><CopyId value={endpoint.baseUrl} label="服务地址"/></div>
                : <Paragraph type="secondary">服务就绪后生成内部 OpenAI 兼容地址。</Paragraph>}
              <Paragraph type="secondary">服务就绪后生成端点。对外接入在模型运营中维护，模型刊例价和开售在商业运营 → 模型销售中维护。</Paragraph>
            </section>
          </div>
          <ErrorNote message={item.failureReason}/>
          <Title heading={5} component="h2">部署进度</Title>
          <Timeline>
            {steps.map(([name, value, done]) => <Timeline.Item key={name} type={done ? 'success' : 'default'}>
              <Text strong>{name}</Text>
              <Paragraph type="secondary">{value}</Paragraph>
            </Timeline.Item>)}
          </Timeline>
          {statusHint && <Paragraph type="secondary">{statusHint}</Paragraph>}
        </>}
      </div>
    </Card>
  </>;
}

const listTabs = [['all', '全部部署'], ['运行中', '运行中'], ['progress', '部署进行中'], ['失败', '失败'], ['停止', '已停止']];
const matchesStatus = (item, status) => status === 'all' || (status === 'progress' ? inProgress(item) : item.status === status);

function DeploymentList({ state, params, can, go, ask, tools }) {
  const translateLabel = useChannelText();
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState(() => params.has('expanded') ? [params.get('expanded')] : []);
  const query = params.get('q') || '';
  const filter = params.get('status') || 'all';
  const cluster = params.get('cluster') || 'all';
  const category = params.get('category') || 'all';
  const instanceView = params.get('layout') === 'instances';
  const size = normalizePageSize(params.get('size'));
  const models = deployableModels(state);
  const modelName = id => models.find(row=>row.id===id)?.name;
  const scope = state.deployments.filter(item => !item.retiredAt &&
    `${item.name} ${item.deploymentId} ${modelName(item.modelId) || ''}`.toLowerCase().includes(query.toLowerCase())
    && (cluster === 'all' || item.clusterId === cluster)
    && (category === 'all' || models.find(row=>row.id===item.modelId)?.type===category));
  const rows = scope.filter(item => matchesStatus(item, filter));
  const targetIndex = params.has('expanded') ? rows.findIndex(item=>item.id===params.get('expanded')) : -1;
  const landingPage = targetIndex < 0 ? 1 : Math.floor(targetIndex / size) + 1;
  const page = Math.max(1, Math.min(Math.floor(Number(params.get('page'))) || landingPage, Math.ceil(rows.length / size) || 1));
  const change = patch => go({ ...patch, page:null, expanded:null }, false, true);
  const details = (item, tab = 'overview') => go({ deployment: item.id, tab });
  const selectedRows = rows.filter(row=>selected.includes(row.id));
  const visible = rows.slice((page - 1) * size, page * size);
  const columns = [
    { title: '部署服务', width: 205, dataIndex: 'name', render: (name, item) => <div className="admin-table-record">
      <Button size="small" theme="borderless" onClick={() => details(item)}>{name}</Button>
      <Text code type="secondary">{item.deploymentId}</Text>
    </div> },
    { title: '模型 / 运行环境', width: 190, render: (_, item) => {
      const runtime = state.artifacts.find(row => row.id === item.runtimeId);
      return <div className="admin-table-record">
        <Text>{modelName(item.modelId) || '模型缺失'}</Text>
        <Text type="secondary" size="small">{runtime ? `${runtime.name} · ${runtime.version}` :
          item.backend || item.containerImage || '运行环境未登记'}</Text>
      </div>;
    } },
    { title: '集群', width: 135, render: (_, item) => <div className="admin-table-record">
      <Text>{state.clusters.find(row => row.id === item.clusterId)?.name || '—'}</Text>
      <Text type="secondary" size="small">{item.namespace || '命名空间未登记'}</Text>
    </div> },
    { title: 'GPU / 副本', width: 135, align: 'right', render: (_, item) => <div className="admin-table-record">
      <Text>{deploymentGpu(item)} 张 GPU</Text>
      <Button theme="borderless" size="small" disabled={!can || item.status!=='运行中'} onClick={()=>ask(item,'scale')}>
        {item.replicas} 副本 × {item.gpuPerReplica} 张
      </Button>
    </div> },
    { title: '就绪状态', width: 135, render: (_, item) => <div className="admin-table-record">
      <AdminStatus value={item.status}/>
      <Text type="secondary" size="small">{item.readyReplicas == null ? '就绪副本未接入' : `${item.readyReplicas} / ${item.replicas} 副本就绪`}</Text>
    </div> },
    { title: '服务端点', width: 150, render: (_, item) => {
      const endpoint = state.endpoints.find(row => row.id === item.endpointId);
      return <div className="admin-table-record">
        <Text>{endpoint?.endpointId || '—'}</Text>
        <Text type="secondary" size="small">{endpoint ? `${endpoint.protocol} · ${endpoint.status}` : '就绪后生成'}</Text>
      </div>;
    } },
    { title: '来源', width: 120, render: (_,item)=>item.source || '—' },
    { title: '创建时间', width: 150, dataIndex:'createdAt', render:time,
      sorter:(a,b)=>String(a.createdAt ?? '').localeCompare(b.createdAt ?? '') },
    { title: '操作', width: 90, render: (_, item) => <DeploymentActions item={item} can={can} go={go} ask={ask} tools={tools}/> },
  ];

  return <>
    <AdminPageHeading title={translateLabel("模型部署")} description="部署和管理自有模型推理服务，查看资源、就绪状态与部署事件。">
      <Space wrap>
        <Dropdown trigger="click" render={<Dropdown.Menu>
          {deploymentSources.map(source=><Dropdown.Item key={source} onClick={()=>source==='模型库' ? tools.onNavigate('ops-model-library') : go({view:'create',source})}>{source}</Dropdown.Item>)}
        </Dropdown.Menu>}>
          <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!can}>部署模型</Button>
        </Dropdown>
        <Button disabled={!can} onClick={tools.openImport}>导入 YAML</Button>
      </Space>
    </AdminPageHeading>
    <Card>
      <Tabs activeKey={instanceView?'instances':'models'} onChange={layout=>change({layout:layout==='models'?null:layout})}>
        <Tabs.TabPane itemKey="models" tab="模型视图"/>
        <Tabs.TabPane itemKey="instances" tab="实例视图"/>
      </Tabs>
      <Tabs activeKey={filter} onChange={status => change({ status: status === 'all' ? null : status })}>
        {listTabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id}
          tab={`${label}（${scope.filter(item => matchesStatus(item, id)).length}）`}/>)}
      </Tabs>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索部署"
          placeholder="搜索服务名称、部署编码或模型" value={query} onChange={q => change({ q })}/>
        <Choice label="筛选集群" value={cluster} options={[[ 'all', '全部集群' ], ...state.clusters.map(item => [item.id, item.name])]}
          onChange={cluster => change({ cluster })}/>
        <Choice label="模型类型" value={category} options={[[ 'all','全部模型类型' ],['text','语言模型'],['multimodal','多模态理解'],['embedding','向量模型'],['rerank','重排序']]}
          onChange={category=>change({category})}/>
        <FilterReset onClick={() => change({ q: null, status: null, cluster: null, category:null })}/>
        {!instanceView && <Button theme="borderless" onClick={()=>setExpanded(expanded.length?[]:visible.map(row=>row.id))}>{expanded.length?'全部收起':'全部展开'}</Button>}
      </FilterToolbar>
      {!instanceView && selectedRows.length>0 && <Space wrap className="admin-list-toolbar">
        <Text>已选 {selectedRows.length} 条</Text>
        {['start','stop','delete'].map(operation=><Button key={operation} type={operation==='delete'?'danger':'primary'}
          disabled={!can || selectedRows.some(row=>operation==='start' && !['停止','失败'].includes(row.status) || operation==='stop' && row.status==='停止')}
          onClick={()=>tools.askBatch(selectedRows,operation,()=>setSelected([]))}>{operation==='start'?'批量启动':operation==='stop'?'批量停止':'批量删除'}</Button>)}
        <Button onClick={()=>tools.exportRows(selectedRows)}>批量导出 YAML</Button>
        <Button theme="borderless" onClick={()=>setSelected([])}>清空选择</Button>
      </Space>}
      {instanceView ? <DeploymentInstancesTable rows={deploymentInstances(rows)} state={state} can={can} onDetail={item=>details(item,'instances')}
        {...tools.instanceProps}/> :
      <Table size="small" rowKey="id" columns={columns} dataSource={visible} scroll={{ x: 'max(100%, 1350px)' }}
        rowSelection={{ selectedRowKeys:selected,onChange:setSelected }} expandedRowKeys={expanded}
        onExpandedRowsChange={rows=>setExpanded((rows ?? []).map(row=>row.id))}
        expandedRowRender={item=><DeploymentInstancesTable rows={deploymentInstances([item])} state={state} can={can}
          onDetail={row=>details(row,'instances')} {...tools.instanceProps}/>}
        pagination={{ currentPage: page, pageSize: size, total: rows.length, pageSizeOpts: PAGE_SIZES, showSizeChanger: true, showTotal: true,
          onPageChange: page => go({ page }, false, true), onPageSizeChange: size => change({ size }) }}
        empty={query || filter !== 'all' || cluster !== 'all' ? '没有符合条件的部署，请调整或重置筛选。' : '暂无模型部署。'}/>}
    </Card>
  </>;
}

async function saveDeploymentOperation(state, dispatch, can, operation, data, deploymentId, quiet) {
  if (!can) throw Error('当前角色或数据状态不允许修改部署');
  const { sourceFileId, ...configuration } = data;
  if (operation==='create' && sourceFileId) modelFileSelectionIssue(data,readInfrastructure(),state);
  const action = { type:'deploymentOperation',operation,data:configuration,deploymentId };
  deploymentTransaction(state,action);
  const next = await dispatch({ ...action,feedback:quiet ? false : '部署操作已保存' });
  if (!next) throw Error('操作未保存，请检查数据冲突或存储状态。当前输入已保留。');
  return next;
}

export function ModelFileDeploymentDrawer({ fileId,state,dispatch,can,infrastructure,dirtyRef,onClose,onSaved }) {
  const [busy,setBusy] = useState(false);
  const [leave,setLeave] = useState(false);
  const submitting = useRef(false);
  const close = () => {
    if (submitting.current) return;
    if (dirtyRef.current) setLeave(true);
    else onClose();
  };
  const run = async (operation,data,id,quiet,reportError) => {
    if (submitting.current) return null;
    submitting.current=true;
    setBusy(true);
    try { return await saveDeploymentOperation(state,dispatch,can,operation,data,id,quiet); }
    catch (issue) { reportError(issue.message); return null; }
    finally { submitting.current=false; setBusy(false); }
  };
  return <>
    <DeploymentEditor state={state} infrastructure={infrastructure} fileId={fileId}
      can={can} run={run} busy={busy} dirty={dirtyRef} onClose={close} onSaved={onSaved} confirmingClose={leave}/>
    {leave && serviceOperationsUi.renderLeaveDialog({cancel:()=>setLeave(false),discard:onClose})}
  </>;
}

export default function ModelDeployments({ state, dispatch, conflict, onNavigate, refreshRead }) {
  const translateLabel = useChannelText();
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [replicas, setReplicas] = useState('');
  const [scaleRoles,setScaleRoles] = useState(null);
  const [leave, setLeave] = useState(null);
  const [busy,setBusy] = useState(false);
  const [importOpen,setImportOpen] = useState(false);
  const [historyId,setHistoryId] = useState(null);
  const [instanceLog,setInstanceLog] = useState(null);
  const [access,setAccess] = useState(null);
  const dirty = useRef(false);
  const pending = useRef(false);
  const checked = useRef(new Set());
  const accepted = useRef(location.hash);
  let infrastructure;
  try { infrastructure = readInfrastructure(); }
  catch { infrastructure = {}; }

  useEffect(() => {
    const sync = () => {
      const next = location.hash;
      if (dirty.current && next !== accepted.current) {
        history.replaceState(null, '', accepted.current);
        setLeave(() => () => { location.hash = next; });
        return;
      }
      accepted.current = next;
      setParams(new URLSearchParams(next.split('?')[1] || ''));
      setError('');
    };
    const unload = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    const click = event => {
      const target = event.target.closest('.v2-sidebar button, .v2-sidebar [role="tab"], [data-admin-breadcrumb], .admin-banner-return');
      if (!dirty.current || !target) return;
      event.preventDefault();
      event.stopPropagation();
      setLeave(() => () => target.click());
    };
    addEventListener('hashchange', sync, true);
    addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      removeEventListener('hashchange', sync, true);
      removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, []);

  const go = (patch, saved = false, preserveScroll = false) => {
    const navigate = () => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if (next.get('view') !== 'create') {
        for (const key of ['catalogModel','catalogSpec','repositorySource','repository','source','clone']) next.delete(key);
      }
      if (next.get('view') !== 'playground') next.delete('playgroundRoute');
      dirty.current = false;
      setError('');
      accepted.current = `#/admin-2/deployments${next.size ? '?' + next : ''}`;
      location.hash = accepted.current;
      setParams(next);
      if (!preserveScroll) window.scrollTo(0, 0);
    };
    if (!saved && dirty.current) setLeave(() => navigate);
    else navigate();
  };

  const can = !conflict && !state.storageError && canMutate(state.currentRole, { type: 'deploymentOperation' });
  const run = async (operation, data = {}, deploymentId, quiet = false, reportError) => {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    try {
      const next = await saveDeploymentOperation(state,dispatch,can,operation,data,deploymentId,quiet);
      setError('');
      return next;
    } catch (issue) {
      (reportError || setError)(issue.message);
      return null;
    } finally {
      pending.current=false;
      setBusy(false);
    }
  };
  useEffect(()=>{
    if (!can || busy) return;
    const item = state.deployments.find(row=>!row.retiredAt && row.configRevision &&
      inProgress(row) && !checked.current.has(row.id + ':' + row.updatedAt));
    if (!item) return;
    const timer = setTimeout(()=>{
      checked.current.add(item.id + ':' + item.updatedAt);
      void run('check',{},item.id,true);
    },1400);
    return ()=>clearTimeout(timer);
  },[state.revision,can,busy]);
  const ask = (item, operation, extra = {}) => {
    setConfirm({ id:item.id,operation,...extra });
    setReplicas(String(item.replicas));
    setScaleRoles(item.roles || null);
    setError('');
  };
  const closeConfirm = () => { if (!pending.current) { setConfirm(null); setError(''); } };

  const selected = state.deployments.find(item => item.id === params.get('deployment') && !item.retiredAt);
  const clone = state.deployments.find(item => item.id === params.get('clone') && !item.retiredAt);
  const historyItem = state.deployments.find(item=>item.id===historyId && !item.retiredAt);
  const view = params.get('view');
  const tab = params.get('tab') || 'overview';
  const current = confirm && state.deployments.find(item => item.id === confirm.id);
  const cluster = state.clusters.find(item => item.id === current?.clusterId);
  const onBenchmark = (item, replica = 1) => onNavigate('ops-benchmarks?' + new URLSearchParams({
    view:'create', clusterId:item.clusterId, targetId:item.id, replica:String(replica),
  }));
  const tools = {
    onNavigate, onBenchmark, openAccess:setAccess, exportRows:rows=>exportDeploymentYaml(rows,state),
    canPlayground:item=>deploymentPlaygroundTargets(state,item.id).length>0,
    openPlayground:item=>{
      const [target] = deploymentPlaygroundTargets(state,item.id);
      if (target) go({view:'playground',deployment:item.id,playgroundRoute:target.route.id});
    },
    canBenchmark:item=>item.status==='运行中' && item.readyReplicas>0 && deployableModels(state).some(row=>row.id===item.modelId && row.type==='text'),
    openHistory:item=>setHistoryId(item.id), openImport:()=>{setImportOpen(true);setError('');},
    askBatch:(rows,operation,done)=>{setConfirm({ rows,operation,done });setError('');},
    instanceProps:{ onLogs:setInstanceLog,onRestart:row=>ask(row.deployment,'restartInstance',{instance:row.ordinal}),onBenchmark,
      canBenchmark:item=>deployableModels(state).some(row=>row.id===item.modelId && row.type==='text') },
  };

  let content;
  if (view === 'playground') {
    content = <DeploymentPlayground state={state} deploymentId={params.get('deployment')} routeId={params.get('playgroundRoute')}
      refreshRead={refreshRead} onRoute={value=>go({playgroundRoute:value},false,true)}
      onBack={()=>go({view:null,deployment:selected?.id || null,tab:selected ? params.get('tab') : null})}/>;
  } else if (view === 'create' || (view === 'edit' && selected)) {
    const selection = { page:'ops-model-library', id:params.get('catalogModel'), spec:params.get('catalogSpec'),
      repositorySource:params.get('repositorySource'), repository:params.get('repository') };
    content = <>
      {selected ? <DeploymentDetail item={selected} state={state} can={can} go={go} ask={ask} tab={tab} tools={tools} infrastructure={infrastructure}/>
        : <DeploymentList state={state} params={params} can={can} go={go} ask={ask} tools={tools}/>}
      <DeploymentEditor key={[view,selected?.id,clone?.id,selection.id,selection.spec,selection.repositorySource,params.get('source')].join(':')} state={state}
        existing={view === 'edit' ? selected : null} clone={clone} source={params.get('source')} infrastructure={infrastructure}
        can={can} run={run} dirty={dirty} selection={selection} busy={busy} confirmingClose={Boolean(leave)}
        onClose={()=>go({view:null,deployment:view==='edit' ? selected.id : null})} onSaved={id=>go({view:null,deployment:id,tab:'overview'},true)}/>
    </>;
  } else if (params.has('deployment') && !selected) {
    content = <Banner type="warning" closeIcon={null} title="部署不存在" description={
      <Button theme="borderless" onClick={() => go({ deployment: null, view: null, tab: null })}>返回部署列表</Button>
    }/>;
  } else if (selected) {
    content = <DeploymentDetail item={selected} state={state} can={can} go={go} ask={ask} tab={tab} tools={tools} infrastructure={infrastructure}/>;
  } else {
    content = <DeploymentList state={state} params={params} can={can} go={go} ask={ask} tools={tools}/>;
  }

  const accessEndpoint = access && state.endpoints.find(endpoint=>endpoint.id===access.endpointId);
  const accessModel = access && deployableModels(state).find(model=>model.id===access.modelId);
  const confirmOperation = async () => {
    const operation = confirm.operation;
    const result = confirm.rows ? await run('batch',{operation,ids:confirm.rows.map(row=>row.id)})
      : await run(operation,{replicas,roles:scaleRoles,revision:confirm.revision,instance:confirm.instance},current?.id);
    if (!result) return;
    closeConfirm();
    confirm.done?.();
    if (operation==='delete' && selected?.id===current?.id) go({deployment:null,tab:null,view:null},true);
  };
  return <div className="admin-page-stack admin-deployment-page">
    {content}
    {!confirm && <ErrorNote message={error}/>}
    {importOpen && <DeploymentImportDialog state={state} busy={busy} close={()=>{setImportOpen(false);setError('');}}
      validate={items=>deploymentTransaction(state,{operation:'import',data:{items}})} apply={items=>run('import',{items})} errorMessage={error}/>}
    {historyItem && <DeploymentHistoryPanel key={historyItem.id} item={historyItem} can={can} close={()=>setHistoryId(null)}
      rollback={revision=>{setHistoryId(null);ask(historyItem,'rollback',{revision});}}/>}
    {instanceLog && <DeploymentLogPanel key={instanceLog.id} row={instanceLog} close={()=>setInstanceLog(null)}/>}
    {access && <Modal visible title="API 访问信息" width="min(620px, calc(100vw - 32px))"
      closeOnEsc onCancel={()=>setAccess(null)} footer={<Button onClick={()=>setAccess(null)}>关闭</Button>}>
      <div className="admin-analytics-fields">
        <Facts values={[[ '部署',access.name ],[ '模型调用名',accessModel?.modelId ],
          [ 'Base URL',accessEndpoint?.baseUrl ? <CopyId value={accessEndpoint.baseUrl} label="服务地址"/> : '—' ]]}/>
      </div>
    </Modal>}
    {confirm && <Modal visible title={(confirm.rows?'批量':'') + confirmTitles[confirm.operation]} width="min(520px, calc(100vw - 32px))"
      closeOnEsc={!busy} maskClosable={false} onCancel={closeConfirm} footer={<Space>
        <Button disabled={busy} onClick={closeConfirm}>{translateLabel("取消")}</Button>
        <Button theme="solid" type={['stop','delete','restartInstance'].includes(confirm.operation) ? 'danger' : 'primary'}
          disabled={!can || !current && !confirm.rows} loading={busy} onClick={confirmOperation}>
          确认{confirmActions[confirm.operation]}
        </Button>
      </Space>}>
      <div className="admin-analytics-fields">
        <Text strong>{confirm.rows ? `已选 ${confirm.rows.length} 条部署` : current?.name || '部署状态已变化'}</Text>
        {confirm.operation === 'scale' ? <>
          {scaleRoles ? Object.entries({prefill:'预填充',decode:'解码',router:'路由'}).map(([key,label])=>
            <Form.Slot key={key} label={label + '副本数'}><Input aria-label={label + '副本数'} type="number" min={1} max={100}
              value={scaleRoles[key]} onChange={value=>{const next={...scaleRoles,[key]:value};setScaleRoles(next);
                setReplicas(String(Object.values(next).reduce((sum,count)=>sum+Number(count),0)));setError('');}}/></Form.Slot>)
            : <Form.Slot label="目标副本数">
            <Input aria-label="目标副本数" type="number" min={1} max={100} value={replicas}
              onChange={value => { setReplicas(value); setError(''); }}/>
          </Form.Slot>}
          <Facts values={[
            ['当前目标', current?.replicas], ['目标 GPU', current ? `${Number(replicas) * current.gpuPerReplica} 张` : '—'],
            ['集群剩余 GPU', cluster ? `${cluster.totalGpu - cluster.allocatedGpu} 张` : '—'],
          ]}/>
          <Paragraph type="secondary">每副本 GPU 保持不变，容量不足时无法执行。</Paragraph>
        </> : <Paragraph>{confirmDetails[confirm.operation]}</Paragraph>}
        <ErrorNote message={error}/>
      </div>
    </Modal>}
    {leave && serviceOperationsUi.renderLeaveDialog({
      cancel: () => setLeave(null),
      discard: () => { dirty.current = false; setLeave(null); leave(); },
    })}
  </div>;
}
