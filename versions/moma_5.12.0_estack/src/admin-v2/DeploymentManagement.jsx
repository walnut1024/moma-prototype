import { useChannelText } from './channel-language';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import AdminCollapsePanel from './AdminCollapsePanel';
import { useEffect, useId, useRef, useState } from 'react';
import Descriptions from './AdminDescriptions';
import { Banner, Button, Card, Collapse, Dropdown, Form, Input, InputNumber, Space, Switch, Tabs, Tag, TextArea, Timeline, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal, AdminSideSheet } from './AdminOverlay';
import { IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import AdminActionMenu from './AdminActionMenu';
import { FilterToolbar, FilterReset } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import { Choice, CopyId, serviceOperationsUi } from './ServiceUI';
import { canMutate } from './store';
import { canRecreateInstance, deployableModels, runnableArtifact, deploymentCanServe, deploymentGpu, deploymentConfig, deploymentHistory, deploymentInstances,
  deploymentPreflight, deploymentRequiresRecreation, deploymentTablePage, deploymentTransaction, instanceFilterStates, requestedDeploymentGpu, validateDeploymentIdentity } from './deployments';
import { serviceCallIdentifiers } from './service-workspace';
import { readInfrastructure } from './infrastructure-state';
import { readInferenceDemoInfrastructure } from './inference-demo-infrastructure.js';
import { linkedDeploymentModel, modelFileDeploymentName } from './ops-models';
import { modelHubCandidates } from './model-hub-candidates';
import { catalogueInitialRecipe, catalogueRecipeMatches, catalogueRecipes } from './model-catalogue';
import { backendAvailableVersions } from './inference-backend';
import { benchmarkDeploymentPreset } from './benchmark-alignment';
import { compatibleDeploymentVersions, deploymentCacheIssue, deploymentCompatibilityWarnings, deploymentParameterSuggestions, deploymentRuntimeModes, deploymentSources,
  deploymentSubmissionIssue, mergeDeploymentBackendDefaults,
  pdGib, pdModeDetails, pdModeIssue, pdModes, pdSupportsSource,pdVendor,
  PD_NODE_LAYER, placementModes, placementStrategies } from './deployment-options';
import { defaultTopologyLayers, topologyLocation } from './ops-resources';
import { evaluateDeploymentSchedule, summarizeDeploymentSchedule } from './deployment-schedule';
import { DeploymentScalingSchedule } from './DeploymentScalingSchedule';
import DeploymentPlayground from './DeploymentPlayground';
import { deploymentPlaygroundTargets } from './deployment-playground';
import { pdEffectiveEnvironment, pdNamedParameter, pdRoleRecipe, pdRouterCommand, pdRouterExample, roleEnvironmentEntries } from './deployment-pd-recipes';
import { DeploymentHistoryPanel, DeploymentImportDialog, DeploymentInstancesTable, DeploymentLogPanel,
  DeploymentMonitorPanel, DeploymentYamlDialog, exportDeploymentYaml } from './DeploymentOperationsUI';
import './deployment-management.css';

const { Paragraph, Text, Title } = Typography;
const inProgress = item => ['部署中', '扩缩容中', '更新中'].includes(item.status);
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const catalogueSourceLabels = { huggingface:'Hugging Face', model_scope:'ModelScope', local_path:'本地路径' };
const resolvedModelFile = file => file?.resolvedPaths?.[0] || file?.mountPath;
const blank = {
  name: '', deploymentId: '', modelId: '', modelFileId:'', runtimeId: '', weightId: '', weightPath: '', clusterId: '',
  namespace: 'inference', replicas: '1', gpuPerReplica: '1', tensorParallel: '1', pipelineParallel: '1',
  maxModelLen: '2048', gpuMemoryUtilization: '0.9', startupTimeout: '600',
  source: '本地路径', repository: '', filename: '', description: '',
  runtimeMode: deploymentRuntimeModes[0], backend: '', backendVersion: '', containerImage: '', containerCommand:'',
  placement: placementModes[0], placementTargets: [], placementStrategy:'spread', scalingRules: [], scalingSchedule:null, roles: null,
  cacheAcceleration: null, environment: '', parameters: '', loraAdapters: [], speculative: null,
  offloading:false, distributedInference:true, restartOnError:true, nativeAnthropic:false, enableInternalRoute:true, genericProxy:false,
};
const emptyCatalogueFields = {
  source:'', repository:'', filename:'', weightId:'', weightPath:'', runtimeId:'',
  runtimeMode:'推理后端版本', backend:'', backendVersion:'', containerImage:'', containerCommand:'',
  parameters:'', environment:'', speculative:null, cacheAcceleration:null, loraAdapters:[], placementStrategy:'spread',
};
const catalogueNoGpuMessage = '所选集群中没有兼容该模型的 GPU。';
const confirmTitles = { stop: '停止部署', start: '启动部署', check: '检查部署', rollback: '回滚配置',
  restart: '重新启动', delete: '删除部署', restartInstance: '删除并重建实例' };
const confirmActions = { stop: '停止', start: '启动', check: '检查', rollback: '回滚',
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

function Facts({ values }) {
  return <Descriptions align="left" data={values.map(([key, value]) => ({ key, value: value ?? '—' }))}/>;
}

function ErrorNote({ message }) {
  return message && <Banner type="danger" closeIcon={null} description={message}/>;
}

function deploymentPrefill(state, selection, records) {
  if (!selection.id) return {};
  try {
    const row = (records[selection.page] || []).find(item => item.id === selection.id);
    const file = selection.page === 'ops-model-files';
    if (!row || file && (row.status !== '可用' || row.lora)) return { selectionError:file ? '所选模型文件不可用于部署' : '所选模型库条目不存在' };
    const modelId = linkedDeploymentModel(row, deployableModels(state))?.id;
    const name = file ? modelFileDeploymentName(row) : row.name.toLowerCase().replace(/\s/g,'-');
    if (!file && selection.spec === null) return { ...emptyCatalogueFields, modelId:modelId ?? '', name };
    const spec = !file && row.specs?.[selection.spec];
    const worker = file && (records['ops-nodes'] || []).find(item=>item.id===row.workerId && item.status==='就绪');
    if (file && (!worker || !state.clusters.some(cluster=>cluster.id===worker.clusterId && cluster.status==='运行中'))) {
      return { selectionError:'模型文件所在节点或集群未就绪，请返回模型文件重新选择' };
    }
    const placement = file ? {clusterId:worker.clusterId,placement:'指定节点',placementTargets:[worker.id]} : {};
    const availableBackends = file ? compatibleBackends(records,placement)
      : (records['ops-inference-backends'] || []).filter(item=>item.version && item.status!=='已停用');
    const isGguf = file && /\.gguf$/i.test(row.filename || resolvedModelFile(row) || '');
    const targets = file ? compatibleDevices(records,placement) : [];
    const onlyAscend = targets.length > 0 && targets.every(item=>/huawei|ascend/i.test(item.vendor || ''));
    const requestedBackend = file ? onlyAscend ? 'MindIE' : isGguf ? 'llama.cpp' : 'vLLM'
      : spec ? spec.backend || (spec.imageName ? 'Custom' : undefined) : row.backend;
    const backend = availableBackends.find(item => item.name === requestedBackend);
    const preferredVersion = file ? backend?.compatibleVersions.find(item=>item.version===backend.version)?.version || backend?.compatibleVersions[0]?.version : backend?.version;
    const runtime = requestedBackend ? {
      runtimeMode: spec?.imageName ? '自定义镜像' : '推理后端版本',
      backend: spec?.backend || backend?.name || '',
      backendVersion: spec?.imageName ? '' : spec?.backendVersion || preferredVersion || '',
      containerImage: spec?.imageName || '',
    } : {};
    const speculation = spec?.speculativeConfig;
    const supportedAlgorithms = { mtp: 'MTP', eagle3: 'Eagle3', ngram: 'N-gram' };
    const remoteSource = ['Hugging Face','ModelScope'].includes(selection.repositorySource) ? selection.repositorySource : null;
    return {
      ...(modelId ? { modelId } : {}),
      name,
      source: file ? ['Hugging Face','ModelScope'].includes(row.source) && row.repository ? row.source : '本地路径'
        : remoteSource || catalogueSourceLabels[spec?.source] || (deploymentSources.includes(row.source) ? row.source : '模型库'),
      ...(!file ? { repository: remoteSource ? selection.repository || spec?.repository || row.repository : spec?.repository || row.repository,
        filename:spec?.filename || '', ...(spec?.source==='local_path' ? { weightPath:spec.repository } : {}) } : {}),
      ...runtime,
      ...(spec ? {
        parameters: (spec.parameters || []).join('\n'),
        environment: Object.entries(spec.environment || {}).map(([key, value]) => `${key}=${value}`).join('\n'),
        speculative: speculation?.enabled && supportedAlgorithms[speculation.algorithm] ? {
          algorithm: supportedAlgorithms[speculation.algorithm], tokens: speculation.num_draft_tokens,
          draftModel: speculation.draft_model, min: speculation.ngram_min_match_length, max: speculation.ngram_max_match_length,
        } : null,
      } : {}),
      ...(file ? { weightPath:resolvedModelFile(row) || '', repository:row.repository || '', filename:row.filename || '' } : {}),
      ...(file ? {modelFileId:row.id,...placement} : {}),
    };
  } catch {
    return { selectionError:'无法读取部署来源，请重新打开部署配置' };
  }
}

function placementChoices(infrastructure, { clusterId, placement }) {
  const nodes = (infrastructure['ops-nodes'] || []).filter(row=>row.clusterId===clusterId && row.status==='就绪');
  if (placement === '指定节点') return nodes.map(row=>[row.id,row.name]);
  return (infrastructure['ops-gpus'] || []).filter(row=>row.clusterId===clusterId && row.status==='正常' && nodes.some(node=>node.id===row.nodeId))
    .map(row=>[row.id,`${row.name} · ${row.nodeId} / GPU ${row.index}`]);
}

function compatibleDevices(infrastructure, values) {
  const ready = new Set((infrastructure['ops-nodes'] || []).filter(node=>node.status==='就绪' && node.clusterId===values.clusterId).map(node=>node.id));
  const targets = values.placementTargets || [];
  return (infrastructure['ops-gpus'] || []).filter(device=>device.clusterId===values.clusterId && ready.has(device.nodeId) &&
    device.status==='正常' && (values.placement==='指定节点' ? targets.includes(device.nodeId)
      : values.placement==='指定 GPU' ? targets.includes(device.id) : true));
}

function compatibleBackends(infrastructure, values) {
  const devices = compatibleDevices(infrastructure,values);
  return (infrastructure['ops-inference-backends'] || []).filter(row=>row.status!=='已停用').flatMap(row=>{
    const versions = compatibleDeploymentVersions(backendAvailableVersions(row),devices);
    return versions.length ? [{...row,compatibleVersions:versions}] : [];
  });
}

function validateRuntime(values, infrastructure) {
  if (values.runtimeMode!=='推理后端版本' && !(values.runtimeMode==='自定义镜像' && values.backend && values.backend!=='Custom')) return;
  const backend = compatibleBackends(infrastructure,values).find(row=>row.name===values.backend);
  if (!backend || values.runtimeMode==='推理后端版本' && !backend.compatibleVersions.some(version=>version.version===values.backendVersion)) {
    throw Error('请选择与目标集群及调度目标兼容的推理后端和版本');
  }
}

function validatePlacement(values, infrastructure) {
  if (values.modelFileId) {
    const file = (infrastructure['ops-model-files'] || []).find(row=>row.id===values.modelFileId);
    if (!file || file.status!=='可用' || file.lora || ![resolvedModelFile(file),file.mountPath].includes(values.weightPath) ||
      values.placement!=='指定节点' || values.placementTargets?.length!==1 || file.workerId!==values.placementTargets[0]) {
      throw Error('该模型文件或所在节点不可用，请重新选择文件');
    }
  }
  if (values.placement === placementModes[0] || !values.placement) return;
  const choices = placementChoices(infrastructure,values);
  if (!Array.isArray(values.placementTargets) || !values.placementTargets.length ||
    values.placementTargets.some(id=>!choices.some(([option])=>id===option))) {
    throw Error('调度目标不在所选集群内或当前不可用，请重新选择');
  }
}

const pdOff = { roles:null,pdMode:'',roleConfigs:undefined,pdSettings:undefined,replicas:1 };
const pdRoles = [['prefill','Prefill'],['decode','Decode'],['router','Router']];

function pdAvailableVendors(infrastructure, values) {
  return [...new Set(compatibleDevices(infrastructure,{...values,placement:'自动调度'}).map(device=>pdVendor(device.vendor)).filter(Boolean))];
}

function validatePdPlacement(values, infrastructure, cluster) {
  const declarations = values.roles ? ['prefill','decode'].map(role=>values.roleConfigs?.[role]?.kvCache ?? values.kvCache) : [values.kvCache];
  for (const cache of declarations) {
    if (!cache?.enabled || cache.mode!=='shared') continue;
    const service = (infrastructure['ops-cache-acceleration'] || []).find(row=>row.id===cache.service?.id &&
      row.clusterId===values.clusterId && row.status==='运行中' && row.provider===cache.service.provider);
    if (!service) throw Error('共享 KV 缓存服务不在所选集群或当前不可用');
    if (cache.service.gpustackId!=null && service.gpustackId!==cache.service.gpustackId) throw Error('共享 KV 缓存服务的 GPUStack ID 已变化');
  }
  if (!values.roles || !values.roleConfigs) return;
  const vendors = pdAvailableVendors(infrastructure,values);
  const vendor = values.pdSettings?.vendor || (vendors.length===1 ? vendors[0] : undefined);
  if (vendors.length>1 && !vendor) throw Error('包含多个加速卡厂商的集群须选择一个厂商');
  if (vendor && vendors.length && !vendors.includes(vendor)) throw Error('所选厂商在目标集群中无可用设备');
  const issue = pdModeIssue(values.pdMode,{vendor,version:values.backendVersion});
  if (issue) throw Error(issue);
  const selectedNodes = [];
  for (const [role,label] of pdRoles) {
    const config = values.roleConfigs[role] || {};
    const target = {clusterId:values.clusterId,placement:config.placement ?? (role==='router' ? '自动调度' : values.placement),
      placementTargets:config.placement ? config.placementTargets : values.placementTargets};
    validatePlacement(target,infrastructure);
    const devices = compatibleDevices(infrastructure,target);
    if (role!=='router' && vendor && target.placement!=='自动调度' && devices.length &&
      (target.placement==='指定 GPU' ? devices.some(device=>pdVendor(device.vendor)!==vendor) : devices.every(device=>pdVendor(device.vendor)!==vendor))) {
      throw Error(label + ' 调度目标与所选加速卡厂商不兼容');
    }
    if (config.backendVersion && !compatibleBackends(infrastructure,target).some(item=>item.name===(config.backend || values.backend) &&
      item.compatibleVersions.some(version=>version.version===config.backendVersion))) throw Error(label + ' 的后端版本与调度目标不兼容');
    if (role==='router' && values.pdMode==='custom') {
      const backend = compatibleBackends(infrastructure,target).find(item=>item.name===config.backend);
      if (pdRouterCommand(config,backend,values.pdMode).source==='missing') throw Error('请为自定义传输方案填写 Router 启动命令');
    }
    const ready=(infrastructure['ops-nodes'] || []).filter(node=>node.clusterId===values.clusterId && node.status==='就绪');
    const allowed = target.placement==='指定节点' ? ready.filter(node=>target.placementTargets.includes(node.id))
      : target.placement==='指定 GPU' || role!=='router' && vendor ? ready.filter(node=>devices.some(device=>device.nodeId===node.id && (!vendor || pdVendor(device.vendor)===vendor))) : ready;
    selectedNodes.push(allowed);
  }
  const gather = values.pdSettings?.gather;
  if (!gather?.layer) return;
  const layer = (cluster?.topologyLayers || defaultTopologyLayers).find(item=>item.id===gather.layer && !item.disabled);
  if (!layer && gather.layer!==PD_NODE_LAYER) throw Error('所选聚集层级在目标集群中不可用');
  if (gather.strategy!=='MustGather' || !selectedNodes.every(nodes=>nodes.length)) return;
  const grouping = node=>layer ? topologyLocation(node,layer).value : node.id;
  const common = selectedNodes[0].some(node=>{
    const id = grouping(node);
    return id && selectedNodes.slice(1).every(nodes=>nodes.some(item=>grouping(item)===id));
  });
  if (!common) throw Error('各角色的调度目标无法满足所选聚集要求');
}

function assessDeploymentDraft(state, values, existing, infrastructure, catalogueModel, catalogueSpec) {
  try {
    if (values.selectionError) throw Error(values.selectionError);
    if (catalogueModel && !catalogueSpec) throw Error(catalogueNoGpuMessage);
    const devices = compatibleDevices(infrastructure,values);
    if (catalogueSpec && !catalogueRecipeMatches(catalogueSpec,devices)) throw Error('所选部署规格与目标集群的 GPU 不兼容');
    if (!existing) validateDeploymentIdentity(state,values);
    const checked = deploymentPreflight(state,values,existing,{evaluatedAt:new Date(),enforceUniqueScheduleStarts:true});
    const recreation = existing && deploymentRequiresRecreation(existing,checked);
    if (!existing || recreation) {
      validatePlacement(values,infrastructure);
      validateRuntime(values,infrastructure);
      validatePdPlacement(values,infrastructure,state.clusters.find(row=>row.id===values.clusterId));
    }
    if (catalogueSpec?.minVram && devices.length &&
      devices.every(device=>Number.isFinite(device.vram) && device.vram<catalogueSpec.minVram)) {
      throw Error(`所选部署规格要求单张 GPU 至少 ${catalogueSpec.minVram} GiB 显存`);
    }
    if (values.roles && !values.pdMode) throw Error('请选择 PD 分离模式');
    return {recreation,warnings:!existing || recreation ? deploymentCompatibilityWarnings(values,devices) : []};
  } catch (issue) {
    return {hardError:issue.message,warnings:[]};
  }
}

function DeploymentCacheFields({ value, onChange, rows, disabled, label='扩展 KV 缓存', rules }) {
  const enabled = value?.enabled;
  const issue = deploymentCacheIssue('local',rules);
  const local = value?.mode!=='shared';
  const serviceOptions = rows.filter(row=>!deploymentCacheIssue('shared',{...rules,provider:row.provider}));
  const selectedService = value?.service;
  const choices = [[ 'local','本地' ],...serviceOptions.map(row=>[row.id,row.name+' · '+row.provider])];
  if (selectedService && !choices.some(([id])=>selectedService.id===id)) choices.push([selectedService.id,selectedService.name]);
  return <div className="deployment-pd-role">
    <Space><Text>{label}</Text><Switch aria-label={'启用'+label} checked={Boolean(enabled)} disabled={disabled || Boolean(issue && !enabled)}
      onChange={active=>onChange(active ? {enabled:true,mode:'local',ram_ratio:1.2} : {enabled:false})}/></Space>
    {enabled && <>
      {issue && <Text type="danger">{issue}</Text>}
      <Form.Slot label="缓存后端"><Choice label={label+'后端'} value={local ? 'local' : selectedService?.id} options={choices}
        disabled={disabled} onChange={id=>{
          const service = serviceOptions.find(row=>row.id===id);
          onChange(service ? {enabled:true,mode:'shared',service:{id:service.id,name:service.name,provider:service.provider,
            clusterId:service.clusterId,gpustackId:service.gpustackId}} : {enabled:true,mode:'local',ram_ratio:1.2});
        }}/></Form.Slot>
      {local && <div className="admin-deployment-fields">
        {[[ 'ram_ratio','内存显存比例',0,0.1 ],[ 'ram_size','缓存内存（GiB）',0,1 ],[ 'chunk_size','缓存块大小（Token）',1,1 ]]
          .map(([key,text,min,step])=><Form.Slot key={key} label={text}>
            <InputNumber aria-label={label+' '+text} value={value[key]} min={min} step={step} disabled={disabled || key==='ram_ratio' && value.ram_size!=null && value.ram_size!==''}
              placeholder={key==='ram_ratio' ? '1.2' : undefined}
              onChange={number=>onChange({...value,[key]:number==='' ? undefined : number})}/>
          </Form.Slot>)}
      </div>}
    </>}
  </div>;
}

const routerCommandSources = { role:'角色启动命令',version:'后端版本默认命令',backend:'后端默认命令',recipe:'传输方案默认命令' };
const routerTemplateVariables = [
  ['{{worker_ip}}','Router 所在节点地址'],['{{port}}','Router 服务端口'],['{{ports.prometheus}}','指标采集端口'],
  ['prefill / decode','预填充和解码成员列表，可在模板中循环'],['{{p.url}} / {{p.ip}} / {{p.port}}','成员服务地址'],
  ['{{p.ports.bootstrap}}','支持该传输方案的预填充引导端口'],['prefill_urls / decode_urls','成员 URL 列表'],['{{model_name}}','模型名称'],
];

function RouterCommandHelp({ mode }) {
  const [open,setOpen] = useState(false);
  const examples = [['当前传输方案',pdRouterExample(mode)],['URL 列表',[
    'your-router','--listen {{worker_ip}}','--listen-port {{port}}',
    `--prefill-endpoints "{{prefill_urls | join(',')}}"`,`--decode-endpoints "{{decode_urls | join(',')}}"`,
  ].join('\n')]];
  return <>
    <Button size="small" theme="borderless" onClick={()=>setOpen(true)}>模板说明与示例</Button>
    {open && <Modal visible title="Router 命令模板" onCancel={()=>setOpen(false)} footer={<Button onClick={()=>setOpen(false)}>关闭</Button>}>
      <Tabs type="line">
        <Tabs.TabPane itemKey="examples" tab="命令示例">
          {examples.map(([label,value])=><div key={label} className="deployment-pd-role">
            <Space><Text strong>{label}</Text><Button size="small" onClick={async()=>{
              try { await navigator.clipboard.writeText(value); Toast.success('已复制命令'); }
              catch { Toast.error('复制失败，请选择文本复制'); }
            }}>复制示例</Button></Space>
            <pre className="deployment-pd-template">{value}</pre>
          </div>)}
        </Tabs.TabPane>
        <Tabs.TabPane itemKey="variables" tab="变量参考"><Facts values={routerTemplateVariables}/></Tabs.TabPane>
      </Tabs>
    </Modal>}
  </>;
}

function PdRoleParameters({ config, values, recipe, label, router, commonParameters, disabled, onChange }) {
  const title = router ? '路由参数' : '后端参数';
  const inherited = config.parameters==null;
  const lines = (config.parameters ?? '').split(/\r?\n/);
  if (lines.length===1 && lines[0]==='') lines.pop();
  const managed = new Map(recipe.parameters.map(([name,value])=>[name,value]));
  const inheritedLines = String(values.parameters || '').split(/\r?\n/).filter(Boolean);
  const inheritedParts = inheritedLines.map(pdNamedParameter);
  const suggestions = deploymentParameterSuggestions(commonParameters,[
    ...(inherited ? inheritedLines : lines),...managed.keys(),...recipe.owned,
  ]);
  const parts = lines.map((line,index)=>({line,index,parameter:pdNamedParameter(line)}));
  const added = parts.filter(({parameter:[name]})=>!managed.has(name));
  const write = rows=>onChange({parameters:rows.join('\n')});
  const patchManaged = (name,value,base)=>{
    const retained = inherited ? inheritedLines.filter(line=>pdNamedParameter(line)[0]!==name)
      : parts.filter(({parameter:[flag]})=>flag!==name).map(row=>row.line);
    if (value!==base) retained.push(name+(value ? ' '+value : ''));
    const unchanged = retained.length===inheritedLines.length && retained.every((line,index)=>line===inheritedLines[index]);
    onChange({parameters:unchanged ? undefined : retained.join('\n')});
  };
  return <div className="deployment-pd-role">
    <Space wrap><Text strong>{title}</Text>
      <Button size="small" disabled={disabled} onClick={()=>write([...(inherited ? inheritedLines : lines),' '])}>添加参数</Button>
      {suggestions.length>0 && <Choice label={label+' 添加常用参数'} placeholder="添加常用参数" value=""
        options={suggestions.map(value=>[value,value])} disabled={disabled}
        onChange={value=>value && write([...(inherited ? inheritedLines : lines),value])}/>}
      {!inherited && <Button size="small" theme="borderless" disabled={disabled} onClick={()=>onChange({parameters:undefined})}>继承部署参数</Button>}
    </Space>
    {recipe.parameters.map(([name,base,rule])=>{
      const current = parts.findLast(({parameter:[flag]})=>flag===name)?.parameter[1] ??
        (inherited ? inheritedParts.findLast(([flag])=>flag===name)?.[1] : undefined);
      const value = current ?? base;
      const ariaLabel=label+' '+name;
      return <div key={name} className="deployment-pd-pair">
        <code>{name}</code>
        {rule?.options?.length ? <Choice label={ariaLabel} value={value} options={[...new Set([...rule.options,value])].map(item=>[item,item])}
          disabled={disabled} onChange={next=>patchManaged(name,next,base)}/>
          : <Input aria-label={ariaLabel} value={value} disabled={disabled || base==='' && current==null}
            onChange={next=>patchManaged(name,next,base)}/>}
        {current!=null && <Button size="small" theme="borderless" aria-label={ariaLabel+' 恢复默认'} disabled={disabled}
          onClick={()=>patchManaged(name,base,base)}>恢复默认</Button>}
      </div>;
    })}
    {recipe.owned.map(flag=><div key={flag} className="deployment-pd-pair"><code>{flag}</code><Text type="secondary">平台根据成员分配</Text></div>)}
    {inherited ? inheritedLines.filter(line=>!managed.has(pdNamedParameter(line)[0])).map((line,index)=><code key={index}>{line}</code>)
      : added.map(({line,index})=><div key={index} className="deployment-pd-input-action">
        <Input aria-label={label+' '+title+' '+(index+1)} value={line===' ' ? '' : line} disabled={disabled}
          placeholder="--flag value" onChange={next=>write(lines.map((value,position)=>position===index ? next || ' ' : value))}/>
        <Button size="small" theme="borderless" aria-label={label+' 删除参数 '+(index+1)} disabled={disabled}
          onClick={()=>write(lines.filter((_,position)=>position!==index))}>删除</Button>
      </div>)}
  </div>;
}

function PdRoleEnvironment({ config, values, recipe, label, disabled, onChange }) {
  const root = roleEnvironmentEntries(values.environment);
  const mode = config.environmentMode || (config.environment==null ? 'merge' : 'replace');
  const rows = roleEnvironmentEntries(config.environment);
  const edited = new Set(rows.map(([key])=>key));
  const inherited = config.environment==null || mode==='merge';
  const effective = pdEffectiveEnvironment(values.environment,config);
  const write = next=>onChange({environmentMode:mode,environment:next.map(([key,value])=>key+'='+value).join('\n')});
  return <div className="deployment-pd-role">
    <Space wrap><Text strong>环境变量</Text>
      {root.length>0 && <Choice label={label+' 环境变量方式'} value={mode} options={[[ 'merge','合并' ],[ 'replace','替换' ]]}
        disabled={disabled} onChange={environmentMode=>onChange({environmentMode,environment:config.environment ?? ''})}/>}
      <Button size="small" disabled={disabled} onClick={()=>write([...rows,['','']])}>添加变量</Button>
      {config.environment!=null && <Button size="small" theme="borderless" disabled={disabled}
        onClick={()=>onChange({environment:undefined,environmentMode:undefined})}>继承部署环境</Button>}
    </Space>
    {Object.entries(recipe.environment).map(([name,value])=><div key={name} className="deployment-pd-pair">
      <code>{name}</code><code>{value}</code>
      {Object.hasOwn(effective,name) && effective[name]!==value ? <Text type="warning">已覆盖平台值</Text>
        : <Button size="small" theme="borderless" aria-label={label+' 覆盖 '+name} disabled={disabled || edited.has(name)}
          onClick={()=>write([...rows,[name,value]])}>覆盖</Button>}
    </div>)}
    {inherited && root.filter(([name])=>!edited.has(name)).map(([name,value])=><div key={name} className="deployment-pd-pair">
      <code>{name}</code><code>{value}</code><Text type="secondary">继承</Text>
    </div>)}
    {rows.map(([name,value],index)=><div key={index} className="deployment-pd-pair">
      <Input aria-label={label+' 变量名 '+(index+1)} value={name} disabled={disabled} placeholder="名称"
        onChange={next=>write(rows.map((row,position)=>position===index ? [next,value] : row))}/>
      <Input aria-label={label+' 变量值 '+(index+1)} value={value} disabled={disabled} placeholder="值"
        onChange={next=>write(rows.map((row,position)=>position===index ? [name,next] : row))}/>
      <Button size="small" theme="borderless" aria-label={label+' 删除变量 '+(index+1)} disabled={disabled}
        onClick={()=>write(rows.filter((_,position)=>position!==index))}>删除</Button>
    </div>)}
  </div>;
}

function PdRoleEditor({ role,label,count,config,values,infrastructure,disabled,onCount,onChange }) {
  const router = role==='router';
  const target = { clusterId:values.clusterId,placement:config.placement || (router ? '自动调度' : values.placement),
    placementTargets:config.placement ? config.placementTargets : values.placementTargets };
  const backends = compatibleBackends(infrastructure,target);
  const definition = backends.find(row=>row.name===(config.backend || values.backend));
  const versions = definition?.compatibleVersions || [];
  const versionOptions = [{value:'',label:'自动'},...versions.map(row=>({value:row.version,label:row.version}))];
  if (config.backendVersion && !versions.some(row=>row.version===config.backendVersion)) {
    versionOptions.push({value:config.backendVersion,label:config.backendVersion+' · 当前配置',disabled:true});
  }
  const launch = router ? pdRouterCommand(config,definition,values.pdMode) : null;
  const recipe = pdRoleRecipe(values.pdMode,role,router && ['role','version','backend'].includes(launch.source));
  const runtime = config.containerImage!==undefined ? 'image' : config.backend || config.backendVersion ? 'backend' : 'inherit';
  const speculative = config.speculative;
  const showSpeculative = !router && ['vLLM','SGLang'].includes(config.backend || values.backend) && runtime!=='image';
  const cacheServices = (infrastructure['ops-cache-acceleration'] || []).filter(row=>row.clusterId===values.clusterId && row.status==='运行中');
  const input = (key,text,props={})=><Form.Slot label={text}><Input aria-label={label+' '+text} value={config[key] ?? ''}
    disabled={disabled} onChange={value=>onChange({[key]:value})} {...props}/></Form.Slot>;
  const options = rows=>rows.map(row=>[row,row]);
  return <div className="deployment-pd-role">
    <div className="admin-deployment-fields">
      {!router && <Form.Slot label="副本数"><InputNumber aria-label={label+' 副本数'} value={count} min={1} max={98}
        disabled={disabled} onChange={onCount}/></Form.Slot>}
      <Form.Slot label="运行方式"><Choice label={label+' 运行方式'} value={runtime} disabled={disabled}
        options={[[ 'inherit','继承' ],[ 'backend','推理后端版本' ],[ 'image','自定义镜像' ]]}
        onChange={mode=>onChange({backend:mode==='backend' ? values.backend || 'Custom' : undefined,backendVersion:undefined,
          containerImage:mode==='image' ? '' : undefined})}/></Form.Slot>
      {runtime==='backend' && <>
        <Form.Slot label="推理后端"><Choice label={label+' 推理后端'} value={config.backend} disabled={disabled}
          options={options([...new Set([...(router || values.pdMode==='custom' ? backends.filter(row=>Object.hasOwn(pdModes,row.name)).map(row=>row.name)
            : [values.backend]),config.backend].filter(Boolean))])}
          onChange={backend=>onChange({backend,backendVersion:undefined})}/></Form.Slot>
        <Form.Slot label="后端版本"><Choice label={label+' 后端版本'} value={config.backendVersion ?? ''} disabled={disabled}
          options={[]} optionList={versionOptions} onChange={backendVersion=>onChange({backendVersion})}/></Form.Slot>
      </>}
      {runtime==='image' && input('containerImage','容器镜像地址')}
    </div>
    <Form.Slot label="启动命令"><TextArea aria-label={label+' 启动命令'} value={config.containerCommand ?? ''} rows={2}
      placeholder={launch?.command || '继承'} disabled={disabled} onChange={containerCommand=>onChange({containerCommand})}/>
      {router && <Space wrap>
        {launch.source!=='missing' && <Text type="secondary">{routerCommandSources[launch.source]}</Text>}
        <RouterCommandHelp mode={values.pdMode}/>
      </Space>}
    </Form.Slot>
    <PdRoleParameters commonParameters={router ? undefined : definition?.commonParameters} {...{config,values,recipe,label,router,disabled,onChange}}/>
    <PdRoleEnvironment {...{config,values,recipe,label,disabled,onChange}}/>
    <div className="admin-deployment-fields">
      {router && <>
        <Form.Slot label="CPU（核）"><InputNumber aria-label="Router CPU（核）" min={0.1} step={1} value={config.resources?.cpu}
          placeholder="2" disabled={disabled} onChange={cpu=>onChange({resources:{...config.resources,cpu:cpu==='' ? undefined : Number(cpu)}})}/></Form.Slot>
        <Form.Slot label="内存（GiB）"><InputNumber aria-label="Router 内存（GiB）" min={0.5} step={1}
          value={config.resources?.memory==null ? undefined : config.resources.memory/pdGib} placeholder="2" disabled={disabled}
          onChange={memory=>onChange({resources:{...config.resources,memory:memory==='' ? undefined : Math.round(Number(memory)*pdGib)}})}/></Form.Slot>
      </>}
      {!router && input('gpuPerReplica','每副本 GPU',{type:'number',min:1,max:64,placeholder:String(values.gpuPerReplica)})}
      <Form.Slot label="调度方式"><Choice label={label+' 调度方式'} value={config.placement || (router?'自动调度':'inherit')} disabled={disabled}
        options={[...(router ? [] : [[ 'inherit','继承' ]]),...options(router ? placementModes.slice(0,2) : placementModes)]}
        onChange={placement=>onChange({placement:placement==='inherit' ? undefined : placement,placementTargets:[]})}/></Form.Slot>
      {config.placement && config.placement!=='自动调度' && <Form.Slot label="调度目标">
        <Choice label={label+' 调度目标'} options={placementChoices(infrastructure,target)} multiple filter showClear value={config.placementTargets || []}
          disabled={disabled} onChange={placementTargets=>onChange({placementTargets})}/></Form.Slot>}
    </div>
    {role==='prefill' && <DeploymentCacheFields value={config.kvCache} onChange={kvCache=>onChange({kvCache})}
      label="Prefill 扩展 KV 缓存" rows={cacheServices} disabled={disabled} rules={{backend:config.backend || values.backend,
        backendVersion:config.backendVersion || values.backendVersion,pdMode:values.pdMode,role}}/>}
    {showSpeculative && <>
      <Space><Text>推测解码</Text><Switch aria-label={label+' 启用推测解码'} disabled={disabled}
        checked={Boolean(speculative && speculative.enabled!==false)}
        onChange={enabled=>onChange({speculative:enabled ? {algorithm:'MTP',tokens:1} : undefined})}/></Space>
      {speculative && speculative.enabled!==false && <div className="admin-deployment-fields">
        <Form.Slot label="算法"><Choice label={label+' 推测解码算法'} value={speculative.algorithm} disabled={disabled}
          options={options(['Eagle3','MTP','N-gram'])} onChange={algorithm=>onChange({speculative:{algorithm,tokens:speculative.tokens,
            ...(algorithm==='N-gram' ? {min:1,max:3} : {})}})}/></Form.Slot>
        <Form.Slot label="推测 Token 数"><InputNumber aria-label={label+' 推测 Token 数'} min={1} max={128} value={speculative.tokens} disabled={disabled}
          onChange={tokens=>onChange({speculative:{...speculative,tokens}})}/></Form.Slot>
        {speculative.algorithm==='Eagle3' && <Form.Slot label="草稿模型"><Input aria-label={label+' 草稿模型'} value={speculative.draftModel || ''}
          disabled={disabled} onChange={draftModel=>onChange({speculative:{...speculative,draftModel}})}/></Form.Slot>}
        {speculative.algorithm==='N-gram' && [[ 'min','最小匹配长度' ],[ 'max','最大匹配长度' ]].map(([key,title])=><Form.Slot key={key} label={title}>
          <InputNumber aria-label={label+' '+title} min={1} max={128} value={speculative[key]} disabled={disabled}
            onChange={value=>onChange({speculative:{...speculative,[key]:value}})}/></Form.Slot>)}
      </div>}
    </>}
  </div>;
}

const fileDefinitionFields = ['source','repository','filename','weightId','weightPath','clusterId','placement','placementTargets'];

function RemoteRepositoryPicker({ rows, value, filename, select, selectFile, disabled }) {
  const [query,setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const results = rows.filter(row=>`${row.name} ${row.repository}`.toLocaleLowerCase().includes(normalized));
  const selected = rows.find(row=>row.repository===value);
  const fileOptions = (selected?.files || []).map(file=>typeof file==='string' ? file : file.name).filter(Boolean);
  return <Card title="查找模型">
    <div className="deployment-repository-panel">
      <Input aria-label="搜索模型仓库" prefix={<IconSearch aria-hidden="true"/>} placeholder="搜索模型名称或仓库" value={query} showClear onChange={setQuery}/>
      <div className="deployment-repository-results" role="region" aria-label="搜索结果">
        {results.length ? results.map(row=><Button key={row.repository} disabled={disabled} block theme={row.repository===value ? 'light' : 'borderless'}
          aria-pressed={row.repository===value} onClick={()=>select(row)}>{row.repository}</Button>) : <Text type="secondary">未找到模型仓库</Text>}
      </div>
      {selected && <>
        <Text strong>{selected.name}</Text>
        {selected.description && <Paragraph type="secondary">{selected.description}</Paragraph>}
        {fileOptions.length > 0 && <Choice label="选择 GGUF 文件" placeholder="选择 GGUF 文件" value={filename || undefined}
          options={fileOptions.map(file=>[file,file])} onChange={selectFile} disabled={disabled}/>}
      </>}
    </div>
  </Card>;
}

function DeploymentEditor({ state, existing, clone, source, can, run, onClose, onSaved, dirty, selection, busy, infrastructure, confirmingClose }) {
  const formId = useId();
  const original = existing || clone;
  const defaultClusterId = state.clusters.find(row=>row.status==='运行中' && row.isDefault)?.id ||
    state.clusters.find(row=>row.status==='运行中')?.id || '';
  const catalogueModel = !original && selection.page==='ops-model-library' &&
    (infrastructure['ops-model-library'] || []).find(row=>row.id===selection.id);
  const catalogueSpecs = catalogueModel ? catalogueModel.specs ?? [{
    mode:catalogueModel.spec, backend:catalogueModel.backend, repository:catalogueModel.repository,
    source:catalogueModel.source==='ModelScope' ? 'model_scope' : catalogueModel.source==='本地路径' ? 'local_path' : 'huggingface',
  }] : [];
  const [catalogueSpecIndex,setCatalogueSpecIndex] = useState(() => {
    const devices = compatibleDevices(infrastructure,{ clusterId:defaultClusterId });
    const modes = catalogueRecipes(catalogueSpecs,devices);
    const selected = selection.spec == null ? undefined : modes.find(option=>option.index===Number(selection.spec));
    return (selected ?? modes[0])?.index ?? null;
  });
  const catalogueSpec = catalogueSpecs[catalogueSpecIndex];
  const catalogueWithoutSpec = Boolean(catalogueModel && !catalogueSpec);
  const [values, setValues] = useState(() => original ? {
    ...blank, ...Object.fromEntries(Object.entries(deploymentConfig(original)).filter(([,value])=>value !== undefined)),
    name: clone ? original.name.slice(0, 76) + ' 副本' : original.name,
    deploymentId: clone ? original.deploymentId.slice(0, 57) + '-copy' : original.deploymentId,
    tensorParallel: original.tensorParallel || original.gpuPerReplica,
    replicas:original.scalingSchedule?.enabled ? original.scalingSchedule.baseline_replicas ?? original.replicas : original.replicas,
  } : { ...blank, clusterId:defaultClusterId, ...(deploymentSources.includes(source) ? { source } : {}),
    ...deploymentPrefill(state,{ ...selection,spec:catalogueSpecIndex },infrastructure) });
  const [error, setError] = useState('');
  const [evaluated, setEvaluated] = useState(false);
  const [lastEvaluation, setLastEvaluation] = useState(null);
  const [catalogueWarningDismissed, setCatalogueWarningDismissed] = useState(false);
  const [weightMode, setWeightMode] = useState(original?.weightId ? 'artifact' : 'path');
  const seedParameters = useRef([]);
  const evaluationPanel = useRef(null);
  useEffect(()=>{
    if (lastEvaluation?.result.hardError) evaluationPanel.current?.focus();
  },[lastEvaluation]);
  const change = patch => {
    setValues(previous => {
      const changedFile = previous.modelFileId && fileDefinitionFields.some(key=>Object.hasOwn(patch,key) && JSON.stringify(patch[key])!==JSON.stringify(previous[key]));
      return { ...previous, ...patch, ...(changedFile ? { modelFileId:'' } : {}) };
    });
    setError('');
    setEvaluated(false);
    setLastEvaluation(null);
    dirty.current = true;
  };
  const models = deployableModels(state);
  const model = models.find(row=>row.id===values.modelId);
  const cluster = state.clusters.find(row=>row.id===values.clusterId);
  const runtimes = state.artifacts.filter(row=>runnableArtifact(row,'运行时镜像'));
  const weights = state.artifacts.filter(row=>runnableArtifact(row,'模型制品') && (!row.modelId || row.modelId===values.modelId));
  const remote = ['Hugging Face','ModelScope'].includes(values.source);
  const showRepositoryPicker = remote && !existing && !catalogueModel && selection.page!=='ops-model-files';
  const remoteCandidates = remote ? modelHubCandidates(infrastructure,values.source) : [];
  const currentValues = { ...values, weightPath:values.weightPath ||
    ((remote || values.source==='模型库') && model && values.repository ? '/models/' + model.modelId : '') };
  const catalogueDevices = catalogueModel ? compatibleDevices(infrastructure,{ clusterId:values.clusterId }) : [];
  const catalogueModes = catalogueRecipes(catalogueSpecs,catalogueDevices);
  const backends = compatibleBackends(infrastructure,values);
  const backend = backends.find(row=>row.name===values.backend);
  const versions = backend?.compatibleVersions || [];
  const storedBackend = existing?.backend && existing.backend===values.backend ? existing.backend : undefined;
  const storedVersion = storedBackend && existing.backendVersion===values.backendVersion ? existing.backendVersion : undefined;
  const versionOptions = versions.map(entry=>({value:entry.version,label:entry.version}));
  if (storedVersion && !versions.some(entry=>entry.version===storedVersion)) {
    versionOptions.unshift({value:storedVersion,label:storedVersion+' · 当前配置',disabled:true});
  }
  const suggestions = deploymentParameterSuggestions(backend?.commonParameters,values.parameters);
  const supportedPdModes = pdModes[values.runtimeMode==='自定义镜像' ? values.backend || 'Custom' : values.backend] || [];
  const pdVendors = pdAvailableVendors(infrastructure,values);
  const selectedPdVendor = values.pdSettings?.vendor || (pdVendors.length===1 ? pdVendors[0] : undefined);
  const pdModeOptions = supportedPdModes.map(value=>{
    const error = pdModeIssue(value,{vendor:selectedPdVendor,version:values.backendVersion});
    return {value,label:pdModeDetails[value][0]+(error ? ' · '+error : ''),disabled:Boolean(error)};
  });
  const preferredPdMode = pdModeOptions.find(option=>!option.disabled)?.value || '';
  const cacheServices = (infrastructure['ops-cache-acceleration'] || []).filter(row=>row.clusterId===values.clusterId && row.status==='运行中');
  const placementOptions = placementChoices(infrastructure,values);
  const available = cluster ? cluster.totalGpu - cluster.allocatedGpu + (existing ? deploymentGpu(existing) : 0) : null;
  const scheduleTarget = evaluateDeploymentSchedule(values.scalingSchedule)?.replicas;
  const required = requestedDeploymentGpu({...values,replicas:Number(scheduleTarget ?? values.replicas)});
  const assessment = lastEvaluation?.values===values && lastEvaluation.revision===state.revision ? lastEvaluation.result
    : assessDeploymentDraft(state,currentValues,existing,infrastructure,catalogueModel,catalogueSpec);
  const warningCodes = assessment.warnings.map(item=>item.code);
  const compatibilityId = formId+'-compatibility';
  const showCatalogueWarning = catalogueWithoutSpec && !catalogueWarningDismissed;
  const evaluate = () => {
    let result;
    try { result = assessDeploymentDraft(state,currentValues,existing,readInfrastructure(),catalogueModel,catalogueSpec); }
    catch (issue) { result = {hardError:issue.message,warnings:[]}; }
    setLastEvaluation({revision:state.revision,values,result});
    setEvaluated(true);
    setCatalogueWarningDismissed(false);
    return result;
  };
  const submit = async (acknowledged = []) => {
    if (!can || busy) return;
    if (catalogueWithoutSpec) {
      setCatalogueWarningDismissed(false);
      Toast.error(catalogueNoGpuMessage);
      return;
    }
    try {
      const current = evaluate();
      const issue = deploymentSubmissionIssue(current,acknowledged);
      if (issue) {
        setError(current.hardError ? '' : issue);
        return;
      }
      const result = await run(existing?'update':'create',currentValues,existing?.id,false,setError);
      if (!result) return;
      const savedId = existing?.id || result.deployments.find(item=>!item.retiredAt && item.deploymentId===currentValues.deploymentId)?.id;
      if (savedId) onSaved(savedId);
      else setError('部署已提交，请返回列表刷新核对。');
    } catch (issue) { setError(issue.message); }
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
  const selectBackendParameters = selected => {
    const {parameters,inserted} = mergeDeploymentBackendDefaults(selected?.parameters,values.parameters,seedParameters.current);
    seedParameters.current=inserted;
    return parameters;
  };
  const changeBackend = (name, customImage = false) => {
    const row = backends.find(item=>item.name===name);
    change({ backend:name==='Custom' ? '' : name,backendVersion:'', parameters:selectBackendParameters(row),cacheAcceleration:null,
      ...(customImage ? {containerImage:'',containerCommand:''} : {}),
      ...(values.roles ? pdModes[name] ? {pdMode:'',pdSettings:undefined} : pdOff : {}) });
  };
  const chooseRepository = row => {
    const linked = linkedDeploymentModel(row,models);
    const recommended = backends.find(backend=>backend.name===(row.backend || 'vLLM'));
    const version = recommended?.compatibleVersions.find(entry=>entry.version===recommended.version) || recommended?.compatibleVersions[0];
    change({ repository:row.repository, filename:'', modelId:linked?.id || '', weightId:'', weightPath:'',
      runtimeMode:'推理后端版本', backend:recommended?.name || '', backendVersion:version?.version || '',
      parameters:selectBackendParameters(recommended) });
    setEvaluated(true);
  };
  const chooseCatalogueSpec = (index, placement = {}) => {
    const spec = catalogueSpecs[index];
    setCatalogueSpecIndex(index);
    setCatalogueWarningDismissed(false);
    const { name, ...preset } = deploymentPrefill(state,{ ...selection,spec:index,repositorySource:null,repository:null },infrastructure);
    seedParameters.current=[];
    setWeightMode('path');
    change({ repository:'', filename:'', weightId:'', weightPath:'', backend:'', backendVersion:'', containerImage:'',
      ...(spec ? preset : emptyCatalogueFields),
      ...(spec?.source==='local_path' ? { repository:'' } : {}), cacheAcceleration:null,
      ...(!spec && !values.roles ? { replicas:'1' } : {}), ...(placement.clusterId ? { name } : {}), ...placement });
    setEvaluated(Boolean(spec));
  };
  const catalogueSources = Object.entries(catalogueSourceLabels)
    .filter(([source])=>catalogueModes.some(option=>option.spec.source===source));
  const updateCataloguePlacement = placement => {
    if (!catalogueModel || !placement.clusterId) { change(placement); return; }
    const devices = compatibleDevices(infrastructure,{ clusterId:placement.clusterId });
    const next = catalogueInitialRecipe(catalogueSpecs,devices);
    chooseCatalogueSpec(next?.index ?? null,placement);
  };
  return <AdminSideSheet title={existing ? '编辑部署' : clone ? '克隆部署' : '部署模型'} visible
    width="min(1120px, 100vw)" className="admin-deployment-drawer" onCancel={close} closeOnEsc={!busy && !confirmingClose}
    footer={<>
      {showCatalogueWarning && <div id={compatibilityId} style={{flexBasis:'100%'}}>
        <Banner type="warning" description={catalogueNoGpuMessage} onClose={()=>setCatalogueWarningDismissed(true)}/>
      </div>}
      <Button disabled={busy} onClick={close}>取消</Button>
      <Button disabled={busy} onClick={()=>{setError('');evaluate();}}>评估部署</Button>
      {showCatalogueWarning || warningCodes.length>0 ? <Button htmlType="button" theme="solid" loading={busy} disabled={!can}
        aria-describedby={compatibilityId} onClick={()=>submit(warningCodes)}>仍然提交</Button>
        : <Button form={formId} htmlType="submit" theme="solid" loading={busy}
          disabled={!can || Boolean(values.selectionError)}>{existing?'保存':'部署'}</Button>}
    </>}>
    <form id={formId} noValidate onSubmit={event=>{event.preventDefault();submit();}}
      className={`admin-deployment-editor${showRepositoryPicker ? ' admin-deployment-editor-remote' : ''}`}>
      {showRepositoryPicker && <RemoteRepositoryPicker key={values.source} rows={remoteCandidates} value={values.repository} filename={values.filename}
        select={chooseRepository} selectFile={filename=>{
          const gguf = /\.gguf$/i.test(filename) && backends.find(row=>row.name==='llama.cpp');
          const version = gguf && (gguf.compatibleVersions.find(entry=>entry.version===gguf.version) || gguf.compatibleVersions[0]);
          change({filename,...(gguf ? {runtimeMode:'推理后端版本',backend:gguf.name,backendVersion:version.version,parameters:selectBackendParameters(gguf)} : {})});
          setEvaluated(true);
        }} disabled={!can || busy}/>}
      <Card>
        <div className="admin-analytics-fields">
          <Title heading={5} component="h2">基本信息</Title>
          {catalogueModel && <>
            <Facts values={[[ '模型库',catalogueModel.name ],[ '部署规格',catalogueSpec?.quantization ],[ '模型仓库',catalogueSpec?.repository ]]}/>
            <div className="admin-deployment-fields">
              <Choice label="部署模式" value={catalogueSpec ? catalogueSpec.mode ?? 'standard' : undefined}
                placeholder="目标集群暂无匹配规格" options={catalogueModes.map(({mode,spec})=>
                  [mode,[mode,spec.quantization,spec.backend].filter(Boolean).join(' · ')])}
                onChange={mode=>{ const preferred = catalogueModes.find(option=>option.mode===mode); if (preferred) chooseCatalogueSpec(preferred.index); }}
                disabled={!can || busy}/>
              <Choice label="模型文件来源" value={catalogueSpec?.source}
                options={catalogueSources}
                onChange={source=>{
                  const preferred = catalogueModes.find(option=>option.spec.source===source);
                  if (preferred) chooseCatalogueSpec(preferred.index);
                }} disabled={!can || busy}/>
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
          {!catalogueWithoutSpec && (!remote || existing && (values.weightPath || values.weightId) || values.modelFileId) && <div className="admin-deployment-fields">
            <Form.Slot label="权重来源"><Choice label="权重来源" value={weightMode} disabled={!can}
              options={[[ 'path','集群内已挂载路径' ],[ 'artifact','已登记模型制品' ]]}
              onChange={mode=>{setWeightMode(mode);change({weightId:'',weightPath:''});}}/></Form.Slot>
            {weightMode==='artifact' ? choice('weightId','模型制品',artifactOptions(weights)) :
              input('weightPath','权重路径',{placeholder:remote?'留空时使用模拟下载目录':'/models/qwen'})}
          </div>}
          <Title heading={5} component="h2">运行环境</Title>
          {choice('runtimeMode','运行方式',sameOptions(deploymentRuntimeModes),{
            onChange:runtimeMode=>change({runtimeMode,backend:'',backendVersion:'',containerImage:'',containerCommand:'',cacheAcceleration:null,parameters:selectBackendParameters(),
              ...(values.roles ? pdOff : {}) }),
          })}
          {values.runtimeMode===deploymentRuntimeModes[0] ? choice('runtimeId','运行时镜像',artifactOptions(runtimes))
            : values.runtimeMode===deploymentRuntimeModes[2] ? <div className="admin-deployment-fields">
              <Choice label="推理后端" value={values.backend || 'Custom'} disabled={!can} options={[[ 'Custom','自定义' ],...sameOptions(backends.map(row=>row.name))]}
                onChange={backend=>changeBackend(backend,true)}/>
              {input('containerImage','容器镜像地址',{placeholder:'registry.example.com/inference:latest'})}
              {textArea('containerCommand','执行命令','如 serve {{model_path}} --port {{port}}')}
            </div>
              : <div className="admin-deployment-fields">
                {choice('backend','推理后端',sameOptions([...new Set([...backends.map(row=>row.name),storedBackend].filter(Boolean))]),
                  {onChange:name=>changeBackend(name)})}
                {choice('backendVersion','后端版本',[],{optionList:versionOptions,disabled:!can || !backend})}
              </div>}
          <Title heading={5} component="h2">集群与调度</Title>
          <div className="admin-deployment-fields">
            {choice('clusterId','目标集群',state.clusters.filter(row=>row.status==='运行中').map(row=>[row.id,row.name]),
              {disabled:!can || Boolean(existing),onChange:clusterId=>updateCataloguePlacement({clusterId,placementTargets:[],cacheAcceleration:null,
                ...(values.roles ? {pdSettings:undefined,roleConfigs:Object.fromEntries(Object.entries(values.roleConfigs || {}).map(([role,config])=>
                  [role,{...config,placementTargets:[]}]))} : {})})})}
            {input('namespace','命名空间')}
            {choice('placement','GPU 调度方式',sameOptions(placementModes),{onChange:placement=>updateCataloguePlacement({placement,placementTargets:[]})})}
            {values.placement===placementModes[0] && !values.roles && choice('placementStrategy','放置策略',placementStrategies)}
            {values.placement!==placementModes[0] && <Choice label="调度目标" multiple filter showClear value={values.placementTargets}
              options={placementOptions} onChange={placementTargets=>updateCataloguePlacement({placementTargets})}/>}
          </div>
          <div className="admin-deployment-fields">
            {input('replicas','副本数',{type:'number',min:values.scalingSchedule?.enabled ? 0 : 1,max:100,disabled:!can || Boolean(values.roles),
              onChange:replicas=>change({replicas,...(values.scalingSchedule?.enabled ? {scalingSchedule:{...values.scalingSchedule,
                baseline_replicas:replicas==='' ? null : Number(replicas)}} : {})})})}
            {input('gpuPerReplica','每副本 GPU',{type:'number',min:1,max:64,onChange:gpuPerReplica=>change({gpuPerReplica,tensorParallel:gpuPerReplica,pipelineParallel:1})})}
            {input('tensorParallel','张量并行 TP',{type:'number',min:1})}
            {input('pipelineParallel','流水线并行 PP',{type:'number',min:1})}
          </div>
          <Collapse>
            <AdminCollapsePanel itemKey="routing" header="模型访问">
              <Space wrap>
                <Space><span>启用模型路由</span><Switch aria-label="启用模型路由" checked={values.enableInternalRoute!==false}
                  disabled={!can || busy} onChange={enableInternalRoute=>change({enableInternalRoute,...(!enableInternalRoute ? {genericProxy:false} : {})})}/></Space>
                <Space><span>通用代理</span><Switch aria-label="通用代理" checked={Boolean(values.genericProxy)}
                  disabled={!can || busy || values.enableInternalRoute===false} onChange={genericProxy=>change({genericProxy})}/></Space>
              </Space>
            </AdminCollapsePanel>
            <AdminCollapsePanel itemKey="parameters" header="高级运行参数">
              <div className="admin-deployment-fields">
                {input('maxModelLen','上下文上限（Token）',{type:'number'})}
                {input('gpuMemoryUtilization','显存利用比例',{type:'number',min:.01,max:1,step:.01})}
                {input('startupTimeout','启动超时（秒）',{type:'number',min:1,max:7200})}
              </div>
              {textArea('parameters','推理参数','每行一项启动参数')}
              {suggestions.length>0 && <Choice label="添加常用参数" placeholder="添加常用参数" value="" options={sameOptions(suggestions)}
                disabled={!can || busy} onChange={line=>line && change({parameters:[values.parameters,line].filter(Boolean).join('\n')})}/>}
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
            <AdminCollapsePanel itemKey="scaling" header="定时伸缩">
              {values.roles ? <Text type="secondary">启用 PD 分离时不可启用定时伸缩</Text> :
                <DeploymentScalingSchedule value={values.scalingSchedule} legacyRules={values.scalingRules} replicas={values.replicas} disabled={!can || busy}
                  onChange={(scalingSchedule,replicas)=>change({scalingSchedule,...(replicas!=null ? {replicas:!scalingSchedule?.enabled && Number(replicas)===0 ? 1 : replicas} : {})})}/>}
            </AdminCollapsePanel>
            <AdminCollapsePanel itemKey="cache" header="缓存加速">
              {values.cacheAcceleration && <Space>
                <Text>{values.cacheAcceleration.name}</Text><Button size="small" disabled={!can || busy}
                  onClick={()=>change({cacheAcceleration:null})}>解除引用</Button>
              </Space>}
              {(!values.roles || values.kvCache?.enabled) && <DeploymentCacheFields value={values.kvCache} rows={cacheServices}
                rules={{backend:values.backend,backendVersion:values.backendVersion}} disabled={!can || busy}
                onChange={kvCache=>change({kvCache,cacheAcceleration:null})}/>}
              {values.roles && !values.kvCache?.enabled && <Text type="secondary">在 Prefill 角色中配置扩展 KV 缓存。</Text>}
            </AdminCollapsePanel>
            {(supportedPdModes.length>0 && pdSupportsSource(values) || values.roles) && <AdminCollapsePanel itemKey="pd" header="预填充 / 解码分离">
              <div className="deployment-pd-role">
                <Space><span>启用 PD 分离</span><Switch aria-label="启用 PD 分离" checked={Boolean(values.roles)} disabled={!can || busy || Boolean(values.scalingSchedule?.enabled)}
                  onChange={enabled=>change(enabled?{roles:{prefill:1,decode:1,router:1},roleConfigs:{},replicas:3,pdMode:preferredPdMode}:pdOff)}/></Space>
                {values.roles && <>
                  <div className="admin-deployment-fields">
                    {(pdVendors.length>1 || values.pdSettings?.vendor) && <Form.Slot label="加速卡厂商">
                      <Choice label="加速卡厂商" options={sameOptions([...new Set([...pdVendors,values.pdSettings?.vendor].filter(Boolean))])}
                        value={values.pdSettings?.vendor} disabled={!can || busy}
                        onChange={vendor=>change({pdSettings:{...values.pdSettings,vendor},roleConfigs:values.roleConfigs || {}})}/>
                    </Form.Slot>}
                    {choice('pdMode','传输方案',[],{optionList:pdModeOptions,disabled:!can || busy,onChange:pdMode=>change({pdMode,
                      pdSettings:{...values.pdSettings,kvLoadFailure:pdMode==='vllm-nixl' ? values.pdSettings?.kvLoadFailure : undefined},
                      roleConfigs:values.roleConfigs || {}})})}
                    <Form.Slot label="成员聚集">
                      <Choice label="成员聚集" value={values.pdSettings?.gather?.layer || ''} disabled={!can || busy}
                        options={[[ '','尽量靠近' ],[PD_NODE_LAYER,'同机'],...(cluster?.topologyLayers || defaultTopologyLayers)
                          .filter(layer=>!layer.disabled).map(layer=>[layer.id,layer.name])]}
                        onChange={layer=>change({pdSettings:{...values.pdSettings,gather:layer ? {layer,strategy:values.pdSettings?.gather?.strategy || 'PreferGather'} : undefined},
                          roleConfigs:values.roleConfigs || {}})}/>
                    </Form.Slot>
                    {values.pdSettings?.gather?.layer && <Form.Slot label="无法满足时">
                      <Choice label="无法满足聚集时" value={values.pdSettings.gather.strategy} disabled={!can || busy}
                        options={[[ 'PreferGather','仍然部署' ],[ 'MustGather','拒绝部署' ]]}
                        onChange={strategy=>change({pdSettings:{...values.pdSettings,gather:{...values.pdSettings.gather,strategy}}})}/>
                    </Form.Slot>}
                  </div>
                  <Tabs type="line">
                    {pdRoles.map(([role,label])=><Tabs.TabPane key={role} itemKey={role} tab={label}>
                      <PdRoleEditor role={role} label={label} count={values.roles[role]} config={values.roleConfigs?.[role] || {}} values={values}
                        infrastructure={infrastructure} disabled={!can || busy}
                        onCount={count=>{
                          const roles={...values.roles,[role]:count};
                          change({roles,replicas:Object.values(roles).reduce((total,next)=>total+Number(next),0)});
                        }}
                        onChange={patch=>change({roleConfigs:{...values.roleConfigs,[role]:{...values.roleConfigs?.[role],...patch}}})}/>
                    </Tabs.TabPane>)}
                  </Tabs>
                </>}
              </div>
            </AdminCollapsePanel>}
          </Collapse>
          <ErrorNote message={error}/>
        </div>
      </Card>
      <Card title="资源预览">
        <div className="admin-analytics-fields">
          <Facts values={[[ '模型',model?.name ],[ '目标集群',cluster?.name ],[ 'GPU 型号',cluster?.gpuType ],
            [ '当前可用 GPU',available ],[ '本次需求',Number.isFinite(required)?required:null ],[ '预计余量',available==null?null:available-required ]]}/>
          {!catalogueWithoutSpec && (evaluated || warningCodes.length>0) && <div id={compatibilityId} ref={evaluationPanel} tabIndex={-1}>
            {assessment.hardError ? <Banner type="danger" closeIcon={null} title="部署评估" description={assessment.hardError}/>
              : warningCodes.length>0 ? <Banner type="warning" closeIcon={null} title="兼容性告警"
                description={assessment.warnings.map(warning=><div key={warning.code}>{warning.message}</div>)}/>
                : <Banner type="success" closeIcon={null} title="兼容性检查通过" description="配置和容量检查通过，可提交部署。"/>}
          </div>}
          {assessment.recreation && dirty.current && <Banner type="warning" closeIcon={null} description="保存后会重新创建运行实例，部署端点可能暂时不可用。"/>}
        </div>
      </Card>
    </form>
  </AdminSideSheet>;
}

const detailTabs = [['overview','概览'],['monitoring','监控'],['instances','实例'],['gpu','GPU 资源'],['config','配置']];

function DeploymentActions({ item, can, go, ask, tools }) {
  const t = useChannelText();
  const menu = [
    !inProgress(item) && { name:'编辑', disabled:!can, onClick:()=>go({ view:'edit',deployment:item.id }) },
    tools.canPlayground(item) && { name:t('在 Playground 中打开'), onClick:()=>tools.openPlayground(item) },
    { name:'监控详情', onClick:()=>go({ deployment:item.id,tab:'monitoring' }) },
    tools.canBenchmark(item) && { name:'基准测试', onClick:()=>tools.onBenchmark(item) },
    ['失败','停止'].includes(item.status) && { name:item.scalingSchedule?.paused ? '恢复定时伸缩' : confirmTitles.start, disabled:!can, onClick:()=>ask(item,'start') },
    inProgress(item) && !item.configRevision && { name:confirmTitles.check, disabled:!can, onClick:()=>ask(item,'check') },
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
  const [detailRole,setDetailRole] = useState(undefined);
  const [detailInstance,setDetailInstance] = useState(undefined);
  const model = deployableModels(state).find(row=>row.id===item.modelId);
  const cluster = state.clusters.find(row => row.id === item.clusterId);
  const endpoint = state.endpoints.find(row => row.id === item.endpointId);
  const instances = deploymentInstances([item],infrastructure);
  const scopedInstances = instances.filter(row=>(!detailRole || row.role===detailRole) && (!detailInstance || row.id===detailInstance));
  const boundDevices = (infrastructure['ops-gpus'] || []).filter(row=>row.clusterId===item.clusterId &&
    item.placement==='指定 GPU' && item.placementTargets?.includes(row.id));
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
        <Button onClick={()=>tools.openYaml(item)}>查看部署 YAML</Button>
        {tools.canBenchmark(item) && <Button onClick={()=>tools.onBenchmark(item)}>基准测试</Button>}
        {endpoint?.status==='运行中' && item.status==='运行中' && <Button onClick={()=>tools.openAccess(item)}>API 访问信息</Button>}
        {tools.canPlayground(item) && <Button theme="solid" onClick={()=>tools.openPlayground(item)}>{t('在 Playground 中打开')}</Button>}
        <DeploymentActions item={item} can={can} go={go} ask={ask} tools={tools}/>
      </Space>
    </AdminPageHeading>
    <Card>
      <Space wrap>
        <AdminStatus value={item.status}/>
        <Text type="secondary">集群：{cluster?.name || '—'}</Text>
        {item.backend && <Text type="secondary">{item.backend}{item.backendVersion && ` · ${item.backendVersion}`}</Text>}
        <Button theme="borderless" size="small" onClick={()=>go({tab:'gpu'})}>{deploymentGpu(item)} GPU · {new Set(instances.map(row=>row.workerId).filter(Boolean)).size || '—'} 节点</Button>
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
            ['缓存加速',item.kvCache?.enabled ? item.kvCache.service?.name || '本地' : item.cacheAcceleration?.name],['调度方式',item.placement],
            ['放置策略',item.placement===placementModes[0] && !item.roles ? placementStrategies.find(([value])=>value===(item.placementStrategy || 'spread'))?.[1] : undefined],
            ['定时伸缩',summarizeDeploymentSchedule(item.scalingSchedule,item.scalingRules)],
            ['集群', cluster?.name], ['GPU 型号', cluster?.gpuType], ['目标副本数', item.replicas], ['每副本 GPU', item.gpuPerReplica],
            ['张量并行 / 流水线并行', item.tensorParallel ? `${item.tensorParallel} / ${item.pipelineParallel}` : '—'],
            ['上下文上限', item.maxModelLen ? `${item.maxModelLen} Token` : item.configRevision ? '沿用模型配置' : '未登记'],
            ['显存利用比例', item.gpuMemoryUtilization], ['启动超时', item.startupTimeout ? `${item.startupTimeout} 秒` : '—'],
            ['模型路由', item.enableInternalRoute===false ? '停用' : '启用'], ['通用代理', item.genericProxy ? '启用' : '停用'],
          ]}/>
          {item.roles && <>
            <Title heading={5} component="h2">预填充 / 解码分离</Title>
            <Facts values={[['传输方案',pdModeDetails[item.pdMode]?.[0]],['加速卡厂商',item.pdSettings?.vendor],
              ['成员聚集',item.pdSettings?.gather?.layer===PD_NODE_LAYER ? '同机' :
                (cluster?.topologyLayers || defaultTopologyLayers).find(layer=>layer.id===item.pdSettings?.gather?.layer)?.name],
              ['无法满足时',item.pdSettings?.gather ? item.pdSettings.gather.strategy==='MustGather' ? '拒绝部署' : '仍然部署' : undefined]]}/>
            <Tabs type="line">
              {pdRoles.map(([role,label])=>{
                const config = item.roleConfigs?.[role];
                return <Tabs.TabPane key={role} itemKey={role} tab={label}>
                  <Facts values={[[ '副本数',item.roles[role] ],[ '推理后端',config?.backend || '继承' ],
                    [ '后端版本',config?.backendVersion ],[ '容器镜像',config?.containerImage ],[ '启动命令',config?.containerCommand ],
                    [ '调度方式',config?.placement || (role==='router' ? '自动调度' : '继承') ],
                    [ '调度目标',config?.placementTargets?.flatMap(id=>placementChoices(infrastructure,{clusterId:item.clusterId,placement:config.placement})
                      .filter(([target])=>id===target).map(([,title])=>title)).join('、') ],
                    [ '每副本 GPU',role==='router' ? undefined : config?.gpuPerReplica ?? item.gpuPerReplica ],
                    [ '扩展 KV 缓存',config?.kvCache?.enabled ? config.kvCache.service?.name || '本地' : undefined ],
                    [ 'CPU（核）',role==='router' ? config?.resources?.cpu ?? 2 : undefined ],
                    [ '内存（GiB）',role==='router' ? (config?.resources?.memory ?? 2*pdGib)/pdGib : undefined ]]}/>
                </Tabs.TabPane>;
              })}
            </Tabs>
          </>}
          <Space>
            <Button onClick={()=>tools.openHistory(item)}>配置版本历史</Button>
            <Button onClick={()=>tools.exportRows([item])}>导出 YAML</Button>
          </Space>
        </> : tab === 'monitoring' ? <DeploymentMonitorPanel key={item.id} item={item} infrastructure={infrastructure}
          requestState={state} refresh={tools.refreshMonitoring}/>
        : tab === 'instances' ? <>
          <Space wrap>
            {item.roles && <Choice label="实例角色" placeholder="全部角色" value={detailRole} showClear options={Object.entries(roleNames)}
              onChange={value=>{setDetailRole(value);setDetailInstance(undefined);}}/>}
            <Choice label="选择实例" placeholder="全部实例" value={detailInstance} showClear onChange={setDetailInstance}
              options={instances.filter(row=>!detailRole || row.role===detailRole).map(row=>[row.id,row.name])}/>
          </Space>
          <DeploymentInstancesTable rows={scopedInstances} state={state} can={can}
            detail onDevice={id=>tools.onNavigate('ops-gpus?view=detail&record='+encodeURIComponent(id))} {...tools.instanceProps}/>
        </>
        : tab === 'gpu' ? <>
          <Facts values={[[ '集群',cluster?.name ],[ '已分配 GPU',deploymentGpu(item) ],[ '调度模式',item.placement ]]}/>
          <Table rowKey="id" pagination={false} dataSource={boundDevices}
            empty="暂无此部署的 GPU 设备绑定记录" columns={[
              {title:'设备',dataIndex:'name',render:(name,row)=><Button theme="borderless" onClick={()=>tools.onNavigate('ops-gpus?view=detail&record='+encodeURIComponent(row.id))}>{name}</Button>},
              {title:'节点',dataIndex:'nodeId',render:id=>(infrastructure['ops-nodes'] || []).find(row=>row.id===id)?.name || '—'},
              {title:'GPU 利用率',render:(_,row)=>row.utilization == null ? '—' : `${row.utilization}%`},
              {title:'显存使用量',render:(_,row)=>row.vramUsed == null || row.vram == null ? '—' : `${row.vramUsed} / ${row.vram} GiB`},
              {title:'状态',dataIndex:'status',render:value=><AdminStatus value={value}/>},
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

const listTabs = [['all', '全部状态'], ['运行中', '运行中'], ['progress', '部署进行中'], ['等待定时计划','等待定时计划'], ['失败', '失败'], ['停止', '已停止']];
const matchesStatus = (item, status) => status === 'all' || (status === 'progress' ? inProgress(item) : item.status === status);
const modelTypeOptions = [['text','语言模型'],['multimodal','多模态理解'],['embedding','向量模型'],['rerank','重排序']];
const roleNames = { prefill:'预填充',decode:'解码',router:'路由' };

function DeploymentReplicasCell({ item, can, save }) {
  const [draft,setDraft] = useState(null);
  const [saving,setSaving] = useState(false);
  const [issue,setIssue] = useState('');
  const roles = item.roles ? Object.entries(item.roles) : [];
  const instances = roles.length ? deploymentInstances([item]) : [];
  if (!draft) return <div className="admin-table-record">
    <AdminStatus value={item.status}/>
    {roles.length ? roles.map(([role,count])=><Text key={role} size="small">{roleNames[role]} {item.readyReplicas == null ? '—' : instances.filter(row=>row.role===role && row.state==='running').length} / {count}</Text>)
      : <Text size="small">{item.readyReplicas ?? '—'} / {item.replicas}</Text>}
    <Button theme="borderless" size="small" disabled={!can || item.status!=='运行中' || Boolean(item.scalingSchedule?.enabled)}
      onClick={()=>{setIssue('');setDraft(item.roles || { replicas:item.replicas });}}>编辑副本数</Button>
  </div>;
  const numbers = Object.values(draft).map(Number);
  const count = numbers.reduce((sum,value)=>sum+value,0);
  const valid = numbers.every(value=>Number.isInteger(value) && value>=1) && count<=100;
  return <Space vertical align="start" spacing={4}>
    {Object.entries(draft).filter(([role])=>role!=='router').map(([role,value])=><InputNumber key={role} aria-label={roleNames[role] ? `${roleNames[role]}副本数` : '副本数'}
      size="small" value={value} min={1} max={100} disabled={saving}
      onChange={next=>{setIssue('');setDraft({...draft,[role]:next});}}/>)}
    {issue && <Text type="danger" size="small" role="alert">{issue}</Text>}
    <Space>
      <Button size="small" disabled={saving} onClick={()=>setDraft(null)}>取消</Button>
      <Button size="small" theme="solid" disabled={!can || !valid || JSON.stringify(draft)===JSON.stringify(item.roles || { replicas:item.replicas })}
        loading={saving} onClick={async()=>{ setSaving(true); if (await save(item,count,roles.length ? draft : null,setIssue)) setDraft(null); setSaving(false); }}>保存</Button>
    </Space>
  </Space>;
}

const deploymentPageSizes = [10, 20, 50, 100];
const deploymentPageSize = value => deploymentPageSizes.includes(Number(value)) ? Number(value) : 10;

function DeploymentInstanceList({ state, params, can, go, tools, infrastructure }) {
  const [selectedKeys, setSelectedKeys] = useState([]);
  const query = params.get('instanceQ') || '';
  const clusterId = params.get('instanceCluster') || undefined;
  const workerId = params.get('instanceNode') || undefined;
  const status = params.get('instanceState') || undefined;
  const pageSize = deploymentPageSize(params.get('instanceSize'));
  const rows = deploymentInstances(state.deployments, infrastructure).filter(row =>
    row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (!clusterId || row.deployment.clusterId === clusterId) &&
    (!workerId || row.workerId === workerId) && (!status || row.state === status));
  const nodes = (infrastructure['ops-nodes'] || []).filter(row => !clusterId || row.clusterId === clusterId);
  const selected = rows.filter(row=>selectedKeys.includes(row.id) && canRecreateInstance(row));
  const change = patch => {
    setSelectedKeys([]);
    go({ instancePage:null, ...patch },false,true);
  };
  const page = Math.max(1, Math.min(Number(params.get('instancePage')) || 1, Math.ceil(rows.length / pageSize)));
  return <>
    <FilterToolbar className="admin-list-toolbar">
      <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="按实例名称搜索"
        placeholder="按名称搜索" value={query} onChange={instanceQ=>change({ instanceQ })}/>
      <Choice label="按集群筛选" showClear placeholder="按集群筛选" value={clusterId}
        options={state.clusters.map(row=>[row.id,row.name])} onChange={instanceCluster=>change({ instanceCluster, instanceNode:null })}/>
      <Choice label="按节点筛选" showClear placeholder="按节点筛选" value={workerId}
        options={nodes.map(row=>[row.id,row.name])} onChange={instanceNode=>change({ instanceNode })}/>
      <Choice label="按状态筛选" showClear placeholder="按状态筛选" value={status}
        options={instanceFilterStates} onChange={instanceState=>change({ instanceState })}/>
      <Button theme="borderless" icon={<IconRefresh aria-hidden="true"/>} aria-label="刷新" loading={tools.refreshing} onClick={tools.refresh}/>
      <Button type="danger" disabled={!can || !selected.length || selected.length > 100}
        onClick={()=>tools.askBatch(selected,'restartInstance',()=>setSelectedKeys([]))}>
        {selected.length ? `删除（${selected.length}）` : '删除'}
      </Button>
    </FilterToolbar>
    <DeploymentInstancesTable rows={rows} state={state} can={can} onDetail={item=>go({ deployment:item.id,tab:'instances' })}
      empty={query || clusterId || workerId || status ? '未找到匹配的实例' : '暂无模型实例'}
      rowSelection={{ selectedRowKeys:selected.map(row=>row.id), onChange:setSelectedKeys,
        getCheckboxProps:row=>({ disabled:!can || !canRecreateInstance(row) }) }}
      pagination={{ currentPage:page,pageSize,total:rows.length,pageSizeOpts:deploymentPageSizes,showSizeChanger:true,
        onPageChange:instancePage=>go({ instancePage },false,true),onPageSizeChange:instanceSize=>change({ instanceSize }) }}
      {...tools.instanceProps}/>
  </>;
}

function DeploymentList({ state, params, can, go, ask, tools, infrastructure }) {
  const translateLabel = useChannelText();
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState(() => params.has('expanded') ? [params.get('expanded')] : []);
  const [sort,setSort] = useState(null);
  const query = params.get('q') || '';
  const filter = params.get('status') || 'all';
  const cluster = params.get('cluster') || 'all';
  const category = params.get('category') || 'all';
  const instanceView = params.get('layout') === 'instances';
  const size = deploymentPageSize(params.get('size'));
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
  const change = patch => go({ ...patch, page: null, expanded:null }, false, true);
  const details = (item, tab = 'overview') => go({ deployment: item.id, tab });
  const selectedRows = rows.filter(row=>selected.includes(row.id));
  const columns = [
    { title: '名称', width: 235, dataIndex: 'name', sorter:(a,b)=>a.name.localeCompare(b.name), render: (name, item) => {
      const categoryLabel = modelTypeOptions.find(([value])=>value===models.find(row=>row.id===item.modelId)?.type)?.[1];
      return <Space wrap><Button size="small" theme="borderless" onClick={() => details(item)}>{name}</Button>
        {categoryLabel && <Tag size="small">{categoryLabel}</Tag>}</Space>;
    } },
    { title: '集群', dataIndex:'clusterId', width: 142, sorter:(a,b)=>String(a.clusterId || '').localeCompare(String(b.clusterId || '')),
      render: (_, item) => state.clusters.find(row=>row.id===item.clusterId)?.name || '—' },
    { title: '来源', dataIndex:'source', width: 215, sorter:(a,b)=>String(a.repository || a.weightPath || '').localeCompare(String(b.repository || b.weightPath || '')),
      render: (_,item)=>item.repository ? `${item.source || ''} / ${item.repository}` : item.weightPath || item.source || '—' },
    { title: '副本数', dataIndex:'replicas', width: 166, sorter:(a,b)=>a.replicas-b.replicas,
      render: (_,item)=><DeploymentReplicasCell key={item.id} item={item} can={can} save={tools.scaleDirect}/> },
    { title: '创建时间', width: 150, dataIndex:'createdAt', render:time,
      sorter:(a,b)=>String(a.createdAt ?? '').localeCompare(b.createdAt ?? '') },
    { title: '操作', width: 90, render: (_, item) => <DeploymentActions item={item} can={can} go={go} ask={ask} tools={tools}/> },
  ];
  const visible = deploymentTablePage(rows,columns,sort,{currentPage:page,pageSize:size});

  return <>
    <AdminPageHeading title={translateLabel("模型部署")} description="部署和管理自有模型推理服务，查看资源、就绪状态与部署事件。">
      <Space wrap>
        {!tools.inferenceDemo && <Text link={{ href: '?demo=inference#/admin-2/deployments' }}>
          {translateLabel('查看演示数据')}
        </Text>}
        {!instanceView && !tools.inferenceDemo && <>
          <Dropdown trigger="click" render={<Dropdown.Menu>
            {deploymentSources.map(source=><Dropdown.Item key={source} onClick={()=>source==='模型库' ? tools.onNavigate('ops-model-library') : go({view:'create',source})}>{source}</Dropdown.Item>)}
            <Dropdown.Item onClick={tools.openImport}>YAML 文件</Dropdown.Item>
          </Dropdown.Menu>}>
            <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!can}>部署模型</Button>
          </Dropdown>
        </>}
      </Space>
    </AdminPageHeading>
    <Card>
      <Tabs activeKey={instanceView?'instances':'models'} onChange={layout=>change({layout:layout==='models'?null:layout})}>
        <Tabs.TabPane itemKey="models" tab="模型列表"/>
        <Tabs.TabPane itemKey="instances" tab="实例列表"/>
      </Tabs>
      {instanceView ? <DeploymentInstanceList state={state} params={params} can={can} go={go} tools={tools} infrastructure={infrastructure}/> : <>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索部署"
          placeholder="搜索服务名称、部署编码或模型" value={query} onChange={q => change({ q })}/>
        <Choice label="筛选集群" value={cluster} options={[[ 'all', '全部集群' ], ...state.clusters.map(item => [item.id, item.name])]}
          onChange={cluster => change({ cluster })}/>
        <Choice label="模型类型" value={category} options={[[ 'all','全部模型类型' ], ...modelTypeOptions]}
          onChange={category=>change({category})}/>
        <Choice label="按状态筛选" options={listTabs} value={filter} onChange={status=>change({status:status==='all' ? null : status})}/>
        <FilterReset onClick={() => change({ q: null, status: null, cluster: null, category:null })}/>
        <Button theme="borderless" icon={<IconRefresh aria-hidden="true"/>} aria-label="刷新" loading={tools.refreshing} onClick={tools.refresh}/>
        <Button theme="borderless" onClick={()=>setExpanded(expanded.length?[]:visible.map(row=>row.id))}>{expanded.length?'全部收起':'全部展开'}</Button>
      </FilterToolbar>
      {selectedRows.length>0 && <Space wrap className="admin-list-toolbar">
        <Text>已选 {selectedRows.length} 条</Text>
        {['start','stop','delete'].map(operation=><Button key={operation} type={operation==='delete'?'danger':'primary'}
          disabled={!can || selectedRows.some(row=>operation==='start' && !['停止','失败'].includes(row.status) || operation==='stop' && row.status==='停止')}
          onClick={()=>tools.askBatch(selectedRows,operation,()=>setSelected([]))}>{operation==='start'?'批量启动':operation==='stop'?'批量停止':'批量删除'}</Button>)}
        <Button onClick={()=>tools.exportRows(selectedRows)}>批量导出 YAML</Button>
        <Button theme="borderless" onClick={()=>setSelected([])}>清空选择</Button>
      </Space>}
      <Table size="small" rowKey="id" dataSource={visible} scroll={{ x: 'max(100%, 1000px)' }} onChange={({ sorter })=>setSort(sorter)}
        columns={columns.map(column=>column.sorter ? { ...column,sorter:true,sortOrder:sort?.dataIndex===column.dataIndex ? sort.sortOrder : false } : column)}
        rowSelection={{ selectedRowKeys:selected,onChange:setSelected }} expandedRowKeys={expanded}
        onExpandedRowsChange={rows=>setExpanded((rows ?? []).map(row=>row.id))}
        expandedRowRender={item=><DeploymentInstancesTable rows={deploymentInstances([item],infrastructure)} state={state} can={can}
          onDetail={row=>details(row,'instances')} {...tools.instanceProps}/>}
        pagination={{ currentPage: page, pageSize: size, total: rows.length, pageSizeOpts: deploymentPageSizes, showSizeChanger: true, showTotal: true,
          onPageChange: page => go({ page }, false, true), onPageSizeChange: size => change({ size }) }}
        empty={query || filter !== 'all' || cluster !== 'all' ? '没有符合条件的部署，请调整或重置筛选。' : '暂无模型部署。'}/>
      </>}
    </Card>
  </>;
}

async function saveDeploymentOperation(state, dispatch, can, operation, data, deploymentId, quiet) {
  if (!can) throw Error('当前角色或数据状态不允许修改部署');
  const deployment = state.deployments.find(item=>item.id===deploymentId);
  const validate = (configuration, records) => {
    validatePlacement(configuration,records);
    validateRuntime(configuration,records);
    validatePdPlacement(configuration,records,state.clusters.find(row=>row.id===configuration.clusterId));
  };
  if (['create','update','start','restart','rollback'].includes(operation)) {
    const configuration = operation==='rollback' && deployment ? deploymentHistory(deployment).find(row=>row.revision===Number(data.revision))?.config
      : { ...deployment,...data };
    if (configuration && (operation!=='update' || deploymentRequiresRecreation(deployment,configuration))) validate(configuration,readInfrastructure());
  } else if (operation==='import') {
    const records=readInfrastructure();
    data.items.forEach(item=>validate(item,records));
  }
  const action = { type:'deploymentOperation', operation, data, deploymentId };
  deploymentTransaction(state,action);
  const next = await dispatch({ ...action, feedback:quiet ? false : '部署操作已保存' });
  if (!next) throw Error('操作未保存，请检查数据冲突或存储状态。当前输入已保留。');
  return next;
}

export function ModelFileDeploymentDrawer({ fileId, state, dispatch, can, infrastructure, dirtyRef, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [leave, setLeave] = useState(false);
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
    <DeploymentEditor state={state} infrastructure={infrastructure} selection={{ page:'ops-model-files',id:fileId }}
      can={can} run={run} busy={busy} dirty={dirtyRef} onClose={close} onSaved={onSaved} confirmingClose={leave}/>
    {leave && serviceOperationsUi.renderLeaveDialog({ cancel:()=>setLeave(false), discard:onClose })}
  </>;
}

export default function ModelDeployments({ state, dispatch, conflict, onNavigate, refreshRead, inferenceDemo = false }) {
  const translateLabel = useChannelText();
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [leave, setLeave] = useState(null);
  const [busy,setBusy] = useState(false);
  const [refreshing,setRefreshing] = useState(false);
  const [importOpen,setImportOpen] = useState(false);
  const [historyId,setHistoryId] = useState(null);
  const [instanceLog,setInstanceLog] = useState(null);
  const [access,setAccess] = useState(null);
  const [yamlId,setYamlId] = useState(null);
  const dirty = useRef(false);
  const pending = useRef(false);
  const checked = useRef(new Set());
  const scheduleAttempts = useRef(new Map());
  const accepted = useRef(location.hash);
  let infrastructure;
  try { infrastructure = inferenceDemo ? readInferenceDemoInfrastructure() : readInfrastructure(); }
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
        for (const key of ['catalogModel','catalogSpec','repositorySource','repository','from','catalogQuery','source','clone']) next.delete(key);
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

  const can = !inferenceDemo && !conflict && !state.storageError && canMutate(state.currentRole, { type: 'deploymentOperation' });
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
  useEffect(()=>{
    if (!can || busy || !state.deployments.some(row=>!row.retiredAt && row.scalingSchedule?.enabled && !row.scalingSchedule.paused)) return;
    const checkSchedule = () => {
      const now = new Date();
      for (const row of state.deployments) {
        if (row.retiredAt || !['运行中','等待定时计划'].includes(row.status)) continue;
        const target = evaluateDeploymentSchedule(row.scalingSchedule,{now});
        if (!target || target.replicas===row.replicas) continue;
        const previous = scheduleAttempts.current.get(row.id);
        if (previous?.target===target.replicas && now-previous.at<30000) continue;
        scheduleAttempts.current.set(row.id,{target:target.replicas,at:now});
        void run('reconcileSchedule',{},row.id,true);
        break;
      }
    };
    const initial = setTimeout(checkSchedule,1500);
    const periodic = setInterval(checkSchedule,30000);
    return ()=>{clearTimeout(initial);clearInterval(periodic);};
  },[state.revision,can,busy]);
  const ask = (item, operation, extra = {}) => {
    setConfirm({ id:item.id,operation,...extra });
    setError('');
  };
  const closeConfirm = () => { if (!pending.current) { setConfirm(null); setError(''); } };

  const selected = state.deployments.find(item => item.id === params.get('deployment') && !item.retiredAt);
  const clone = state.deployments.find(item => item.id === params.get('clone') && !item.retiredAt);
  const historyItem = state.deployments.find(item=>item.id===historyId && !item.retiredAt);
  const yamlItem = state.deployments.find(item=>item.id===yamlId && !item.retiredAt);
  const view = params.get('view');
  const tab = params.get('tab') || 'overview';
  const current = confirm && state.deployments.find(item => item.id === confirm.id);
  const canBenchmark = item=>!inferenceDemo && deploymentCanServe(item) && deployableModels(state).some(row=>row.id===item.modelId && row.type==='text');
  const onBenchmark = (item,instance) => onNavigate('ops-benchmarks?' + benchmarkDeploymentPreset(item, instance));
  const tools = {
    inferenceDemo,
    onNavigate, onBenchmark, openAccess:setAccess, openYaml:item=>setYamlId(item.id), exportRows:rows=>{
      try { exportDeploymentYaml(rows,state,infrastructure); }
      catch (issue) { Toast.error(issue.message); }
    },
    canPlayground:item=>deploymentPlaygroundTargets(state,item.id).length>0,
    openPlayground:item=>{
      const [target] = deploymentPlaygroundTargets(state,item.id);
      if (target) go({view:'playground',deployment:item.id,playgroundRoute:target.route.id});
    },
    refreshMonitoring:async()=>{
      if (!refreshRead) return false;
      await refreshRead();
      return true;
    },
    scaleDirect:(item,replicas,roles,reportError)=>run('scale',{replicas,roles},item.id,false,reportError),
    refreshing, refresh:async()=>{
      setRefreshing(true);
      try { await refreshRead?.(); setError(''); }
      catch (issue) { setError(issue.message || '部署列表刷新失败'); }
      finally { setRefreshing(false); }
    },
    canBenchmark,
    openHistory:item=>setHistoryId(item.id), openImport:()=>{setImportOpen(true);setError('');},
    askBatch:(rows,operation,done)=>{setConfirm({ rows,operation,done });setError('');},
    instanceProps:{ onLogs:setInstanceLog,onRestart:row=>ask(row.deployment,'restartInstance',{instance:row.ordinal,instanceId:row.id,instanceName:row.name}),
      onBenchmark,canBenchmark },
  };

  let content;
  if (view === 'playground') {
    content = <DeploymentPlayground state={state} deploymentId={params.get('deployment')} routeId={params.get('playgroundRoute')}
      refreshRead={refreshRead} onRoute={value=>go({playgroundRoute:value},false,true)}
      onBack={()=>go({view:null,deployment:selected?.id || null,tab:selected ? params.get('tab') : null})}/>;
  } else if (!inferenceDemo && (view === 'create' || (view === 'edit' && selected))) {
    const selection = { page:'ops-model-library', id:params.get('catalogModel'), spec:params.get('catalogSpec'),
      repositorySource:params.get('repositorySource'), repository:params.get('repository') };
    const returnCatalogue = view==='create' && params.has('catalogModel') && params.get('from')==='catalog' ? () => {
      const query = new URLSearchParams(params.get('catalogQuery') || '');
      const navigate = () => {
        dirty.current=false;
        onNavigate('ops-model-library' + (query.size ? '?' + query : ''));
      };
      if (dirty.current) setLeave(() => navigate);
      else navigate();
    } : undefined;
    content = <>
      {selected ? <DeploymentDetail key={selected.id} item={selected} state={state} can={can} go={go} ask={ask} tab={tab} tools={tools} infrastructure={infrastructure}/>
        : <DeploymentList state={state} params={params} can={can} go={go} ask={ask} tools={tools} infrastructure={infrastructure}/>}
      <DeploymentEditor key={[view,selected?.id,clone?.id,selection.id,selection.spec,selection.repositorySource,params.get('source')].join(':')} state={state}
        existing={view === 'edit' ? selected : null} clone={clone} source={params.get('source')} infrastructure={infrastructure}
        can={can} run={run} dirty={dirty} selection={selection} busy={busy} confirmingClose={Boolean(leave)}
        onClose={returnCatalogue || (()=>go({view:null,deployment:view==='edit' ? selected.id : null}))}
        onSaved={id=>go({view:null,deployment:id,tab:'overview'},true)}/>
    </>;
  } else if (params.has('deployment') && !selected) {
    content = <Banner type="warning" closeIcon={null} title="部署不存在" description={
      <Button theme="borderless" onClick={() => go({ deployment: null, view: null, tab: null })}>返回部署列表</Button>
    }/>;
  } else if (selected) {
    content = <DeploymentDetail key={selected.id} item={selected} state={state} can={can} go={go} ask={ask} tab={tab} tools={tools} infrastructure={infrastructure}/>;
  } else {
    content = <DeploymentList state={state} params={params} can={can} go={go} ask={ask} tools={tools} infrastructure={infrastructure}/>;
  }

  const accessEndpoint = access && state.endpoints.find(endpoint=>endpoint.id===access.endpointId);
  const accessModel = access && deployableModels(state).find(model=>model.id===access.modelId);
  const confirmOperation = async () => {
    const operation = confirm.operation;
    const result = confirm.rows && operation === 'restartInstance' ? await run('batchRestartInstances',{
      instances:confirm.rows.map(row=>({ id:row.id,ordinal:row.ordinal,deploymentId:row.deployment.id })),
    }) : confirm.rows ? await run('batch',{operation,ids:confirm.rows.map(row=>row.id)})
      : await run(operation,{revision:confirm.revision,instance:confirm.instance,instanceId:confirm.instanceId},current?.id);
    if (!result) return;
    closeConfirm();
    confirm.done?.();
    if (operation==='delete' && selected?.id===current?.id) go({deployment:null,tab:null,view:null},true);
  };
  return <div className="admin-page-stack admin-deployment-page">
    {content}
    {!confirm && <ErrorNote message={error}/>}
    {importOpen && <DeploymentImportDialog state={state} infrastructure={infrastructure} busy={busy} close={()=>{setImportOpen(false);setError('');}}
      validate={(items,overwrite)=>{
        const placements = readInfrastructure();
        items.forEach(item=>{
          validatePlacement(item,placements);
          validateRuntime(item,placements);
          validatePdPlacement(item,placements,state.clusters.find(row=>row.id===item.clusterId));
        });
        deploymentTransaction(state,{operation:'import',data:{items,overwrite}});
      }} apply={(items,overwrite)=>run('import',{items,overwrite})} errorMessage={error}/>}
    {historyItem && <DeploymentHistoryPanel key={historyItem.id} item={historyItem} can={can} close={()=>setHistoryId(null)}
      rollback={revision=>{setHistoryId(null);ask(historyItem,'rollback',{revision});}}/>}
    {yamlItem && <DeploymentYamlDialog key={yamlItem.id} item={yamlItem} state={state} infrastructure={infrastructure} close={()=>setYamlId(null)}/>}
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
        <Text strong>{confirm.rows ? `已选 ${confirm.rows.length} ${confirm.operation === 'restartInstance' ? '个实例' : '条部署'}` : confirm.instanceName || current?.name || '部署状态已变化'}</Text>
        <Paragraph>{confirmDetails[confirm.operation]}</Paragraph>
        {confirm.operation==='stop' && (current?.scalingSchedule?.enabled || confirm.rows?.some(row=>row.scalingSchedule?.enabled)) &&
          <Paragraph type="secondary">停止部署时会暂停已启用的定时伸缩。再次启动后按当前计划恢复。</Paragraph>}
        {confirm.operation==='start' && (current?.scalingSchedule?.paused || confirm.rows?.some(row=>row.scalingSchedule?.paused)) &&
          <Paragraph type="secondary">已暂停的定时伸缩会随启动恢复，并按当前时段设置副本数。</Paragraph>}
        {confirm.operation === 'restartInstance' && (current?.roles || confirm.rows?.some(row=>row.deployment.roles)) &&
          <Banner type="warning" closeIcon={null} description="预填充、解码和路由实例共同提供服务，重建这组实例期间，受影响的请求可能中断。"/>}
        <ErrorNote message={error}/>
      </div>
    </Modal>}
    {leave && serviceOperationsUi.renderLeaveDialog({
      cancel: () => setLeave(null),
      discard: () => { dirty.current = false; setLeave(null); leave(); },
    })}
  </div>;
}
