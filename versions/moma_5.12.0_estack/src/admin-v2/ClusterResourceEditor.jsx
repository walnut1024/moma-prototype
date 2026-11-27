import { useId, useRef, useState } from 'react';
import { ArrayField, Banner, Button, Collapse, Form, Space, Steps, Toast, Typography, Upload, useFieldState, useFormApi, useFormState } from '@douyinfe/semi-ui';
import AdminCollapsePanel from './AdminCollapsePanel';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import { CLUSTER_PROVIDERS, clusterLabels, isCloudCluster, nodeSelectorIssues, validateClusterYaml } from './ops-cluster-domain';
import { LabelPairsEditor } from './ResourceViews';

const { Text } = Typography;
const options = values => values.map(value => ({ value, label: value }));
const namePattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const poolDefaults = { replicas: 1, batchSize: 1, volumes: [] };
const createPoolDraft = number => ({ ...poolDefaults, id: crypto.randomUUID(), name: `Pool-${number}` });
const demoMachine = {
  DigitalOcean: {
    'gpu-h100x1-80gb': ['gpu-h100x1-base'], 'gpu-h100x8-640gb': ['gpu-h100x8-base'], 'gpu-l40sx2-96gb': ['Ubuntu 24.04 LTS'],
  },
  'SHUIHUA FUTURE': Object.fromEntries(['gpu-h20x1-96gb', 'gpu-h20x8-768gb', 'gpu-a800x8-640gb']
    .map(type => [type, ['Ubuntu 24.04 LTS', 'Ubuntu 22.04 LTS']])),
};
const cloudRegions = ['sfo3', 'nyc3', 'tor1', 'ams3'];
const hostPathTypes = ['Directory', 'DirectoryOrCreate', 'File', 'FileOrCreate', 'Socket', 'CharDevice', 'BlockDevice'];
const dockerHubHosts = ['docker.io', 'index.docker.io', 'registry-1.docker.io', 'registry.hub.docker.com'];
const dataDirMountPath = '/var/lib/gpustack';
const dataDirMountName = 'gpustack-data-dir';
const taggedImage = /^[\w][\w.-]*(?::\d{1,5})?(?:\/[\w][\w.-]*)*:[\w][\w.-]{0,127}$/i;
const absoluteMount = path => /^\/(?:[\w.-]+\/)*[\w.-]+\/?$/.test(path ?? '') && !path.split('/').includes('..');
const fieldNumber = value => value == null || value === '' ? NaN : Number(value);

function validateKubernetesVolumes(volumes) {
  const seenNames = new Set(), seenTargets = new Set();
  return volumes.map(volume => {
    const { name, mountPath, sourceType, readOnly } = volume;
    if (!namePattern.test(name ?? '') || !absoluteMount(mountPath)) throw Error('Kubernetes 卷须填写 DNS 标签名称和有效的绝对挂载路径。');
    const target = mountPath.replace(/\/$/, '');
    if (name === dataDirMountName || target === dataDirMountPath) throw Error('请在专用数据目录字段中配置 GPUStack 数据卷。');
    if (seenNames.has(name) || seenTargets.has(target)) throw Error('Kubernetes 卷名称及挂载路径不可重复。');
    seenNames.add(name);
    seenTargets.add(target);
    if (sourceType === 'hostPath' && absoluteMount(volume.hostPath) && hostPathTypes.includes(volume.hostType)) {
      return { name, mountPath, sourceType, readOnly: Boolean(readOnly), hostPath: volume.hostPath, hostType: volume.hostType };
    }
    if (sourceType === 'persistentVolumeClaim' && /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(volume.claimName ?? '')) {
      return { name, mountPath, sourceType, readOnly: Boolean(readOnly), claimName: volume.claimName };
    }
    throw Error('请选择正确的卷来源，并填写宿主机路径和类型或 PVC 名称。');
  });
}

const poolParts = (values, provider, savedPool) => {
  const name = values.name?.trim(), replicas = fieldNumber(values.replicas), batchSize = fieldNumber(values.batchSize);
  if (!name) throw Error('请填写节点池名称。');
  if (!values.instanceType || (!Object.hasOwn(demoMachine[provider] || {}, values.instanceType) && values.instanceType !== savedPool?.instanceType)) {
    throw Error('请选择实例类型。');
  }
  const osImage = values.osImage?.trim();
  if (!osImage) throw Error('请填写操作系统镜像。');
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > 200 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 200) {
    throw Error('副本数量须为 0–200 的整数，批大小须为 1–200 的整数。');
  }
  const labels = clusterLabels(values.labels);
  const volumes = (values.volumes || []).map(volume => {
    const capacity = Number(volume.capacity);
    if (!/^[A-Za-z0-9.-]{1,60}$/.test(volume.name ?? '') || !Number.isInteger(capacity) || capacity < 1 || !/^\/[\w./-]+$/.test(volume.mountPath || '') || volume.mountPath.split('/').includes('..')) {
      throw Error('存储卷须填写有效名称、正整数容量和绝对挂载路径。');
    }
    return { name: volume.name, mountPath: volume.mountPath, capacity, filesystem: volume.filesystem || 'ext4' };
  });
  if (new Set(volumes.map(volume => volume.name)).size !== volumes.length || new Set(volumes.map(volume => volume.mountPath)).size !== volumes.length) throw Error('存储卷名称及挂载路径不可重复。');
  return { name, replicas, batchSize, instanceType: values.instanceType, osImage,
    labels: labels ?? {}, volumes: provider === 'DigitalOcean' ? volumes : [] };
};

function ClusterLabelField({ field, label, disabled, submitted, validatePairs }) {
  const id = useId();
  const formApi = useFormApi();
  const { value } = useFieldState(field);
  return <Form.Slot label={{ id, text: label }}>
    <LabelPairsEditor aria-labelledby={id} value={value} disabled={disabled} submitted={submitted}
      validatePairs={validatePairs} onChange={next => formApi.setValue(field, next)}/>
  </Form.Slot>;
}

function CloudPoolDrafts({ provider, active, setActive, nextNumber, busy, submitted }) {
  const { value: drafts } = useFieldState('nodePools');
  const onAdd = add => {
    const pool = createPoolDraft(nextNumber.current++);
    add(pool);
    setActive(pool.id);
  };
  return <ArrayField field="nodePools">{({ arrayFields, addWithInitValue }) => <div className="admin-page-stack">
    <Space><Button type="primary" theme="borderless" onClick={() => onAdd(addWithInitValue)} disabled={busy}>添加节点池</Button></Space>
    <Collapse accordion keepDOM activeKey={active ? [active] : []} onChange={keys => setActive(keys[0] || '')}>
      {arrayFields.map(({ field, key, remove }, index) => {
        const pool = drafts?.[index];
        if (!pool) return null;
        const title = pool.name || `节点池 ${index + 1}`;
        return <AdminCollapsePanel key={pool.id || key} itemKey={pool.id} header={title}>
          <PoolFields provider={provider} path={field} busy={busy} submitted={submitted}/>
          {arrayFields.length > 1 && <Space><Button size="small" type="danger" theme="borderless" disabled={busy}
            aria-label={`移除节点池 ${title}`} onClick={() => {
              remove();
              if (active === pool.id) setActive((drafts[index + 1] || drafts[index - 1])?.id || '');
            }}>移除节点池</Button></Space>}
        </AdminCollapsePanel>;
      })}
    </Collapse>
  </div>}</ArrayField>;
}

function PoolFields({ provider, savedPool, busy, submitted, path }) {
  const { values } = useFormState();
  const formApi = useFormApi();
  const machine = demoMachine[provider] ?? {};
  const field = key => path ? `${path}.${key}` : key;
  const pool = path ? formApi.getValue(path) ?? {} : values;
  const images = machine[pool.instanceType] ?? [];
  return <>
    <Form.Input field={field('name')} label="节点池名称" rules={[{ required: true, message: '请填写节点池名称。' }]}/>
    <Form.Select field={field('instanceType')} label="实例类型" filter
      optionList={options([...new Set([...Object.keys(machine), ...(savedPool?.instanceType ? [savedPool.instanceType] : [])])])} disabled={Boolean(savedPool)}
      rules={[{ required: true, message: '请选择实例类型。' }]} onChange={value => {
        if (value !== pool.instanceType) formApi.setValue(field('osImage'), machine[value]?.[0] ?? '');
      }}/>
    <Form.InputNumber field={field('replicas')} label="副本数" min={0} max={200} precision={0} rules={[{ required: true, message: '请填写副本数。' }]}/>
    <Form.InputNumber field={field('batchSize')} label="批大小" min={1} max={200} precision={0} rules={[{ required: true, message: '请填写批大小。' }]}/>
    <Form.AutoComplete field={field('osImage')} label="操作系统镜像" data={images} showClear disabled={Boolean(savedPool)}
      rules={[{ required: true, message: '请填写操作系统镜像。' }]}/>
    <ClusterLabelField field={field('labels')} label="标签" disabled={busy} submitted={submitted}/>
    {provider === 'DigitalOcean' && <ArrayField field={field('volumes')}>
      {({ arrayFields, addWithInitValue }) => <div className="admin-page-stack">
        <Text strong>存储卷</Text>
        {arrayFields.map(({ key, field, remove }) => <div key={key} className="admin-page-stack" style={{ gap: 4 }}>
          <Form.Input field={`${field}.name`} label="存储卷名称" disabled={Boolean(savedPool)}/>
          <Form.Input field={`${field}.mountPath`} label="挂载路径" placeholder="/var/lib/gpustack" disabled={Boolean(savedPool)}/>
          <Form.InputNumber field={`${field}.capacity`} label="容量 (GiB)" min={1} precision={0} disabled={Boolean(savedPool)}/>
          <Form.Select field={`${field}.filesystem`} label="文件系统" optionList={options(['ext4', 'xfs'])} disabled={Boolean(savedPool)}/>
          {!savedPool && <Button theme="borderless" type="danger" onClick={remove}>移除存储卷</Button>}
        </div>)}
        {!savedPool && <Space><Button onClick={() => addWithInitValue({ capacity: 100, filesystem: 'ext4' })}>添加存储卷</Button></Space>}
      </div>}
    </ArrayField>}
  </>;
}

export function NodePoolEditor({ cluster, pool, resize, onSave, onClose, busy }) {
  const formId = useId();
  const [error, setError] = useState('');
  const save = async values => {
    try {
      const fixedFields = pool ? { instanceType: pool.instanceType, osImage: pool.osImage, volumes: pool.volumes } : {};
      const next = poolParts({ ...pool, ...values, ...fixedFields }, cluster.provider, pool);
      if ((cluster.nodePools || []).some(row => row.id !== pool?.id && row.name === next.name)) throw Error('节点池名称已存在。');
      const record = pool ? { ...pool, ...next } : { ...next, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      if (!await onSave(record)) setError('保存未确认，请核对后重试。');
    } catch (issue) { setError(issue.message); }
  };
  return <AdminModal visible title={resize ? '调整节点池副本' : pool ? '编辑节点池' : '添加节点池'}
    width="min(580px, calc(100vw - 32px))" closeOnEsc={!busy} closable={!busy} onCancel={onClose}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button><Button theme="solid" form={formId} htmlType="submit" loading={busy}>保存</Button></Space>}>
    <Form id={formId} initValues={pool || poolDefaults} onSubmit={save} disabled={busy} onValueChange={() => setError('')}>
      {resize ? <Form.InputNumber field="replicas" label="副本数" min={0} max={200} precision={0}/>
        : <PoolFields provider={cluster.provider} savedPool={pool} busy={busy} submitted={Boolean(error)}/>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </Form>
  </AdminModal>;
}

const baseDefaults = { zone: '南京', gpuType: 'H20', totalGpu: 0, nodes: 0, namespace: 'gpustack-system', modelProxy: '直连' };
const gpuTypes = options(['H20', 'L40S', 'A800', 'H100', 'A100', 'CPU']);

function ClusterYamlField({ field, label, placeholder, provider, kind, busy }) {
  const formApi = useFormApi();
  return <div className="admin-page-stack" style={{ gap: 6 }}>
    <Form.TextArea field={field} label={label} placeholder={placeholder}/>
    <Upload action="" disabled={busy} accept=".yaml,.yml" showUploadList={false} fileList={[]} beforeUpload={async ({ file }) => {
      try {
        if (!file.fileInstance || file.fileInstance.size > 65536) throw Error('请选择不超过 64 KiB 的 YAML 文件。');
        const content = await file.fileInstance.text();
        validateClusterYaml(content, provider, kind);
        formApi.setValue(field, content);
      } catch (issue) { Toast.error(issue.message || '未能读取 YAML 文件。'); }
      return { shouldUpload: false };
    }}>
      <Button size="small" disabled={busy}>上传{label}</Button>
    </Upload>
  </div>;
}

function KubernetesVolumes() {
  const { values } = useFormState();
  return <ArrayField field="volumeMounts">{({ arrayFields, addWithInitValue }) => <div className="admin-page-stack" style={{ gap: 8 }}>
    <Text strong>Kubernetes 卷挂载</Text>
    {arrayFields.map(({ key, field, remove }, index) => <div className="admin-page-stack" key={key}>
      <Form.Input field={`${field}.name`} label="卷名称"/>
      <Form.Input field={`${field}.mountPath`} label="挂载路径" placeholder="/models"/>
      <Form.Switch field={`${field}.readOnly`} label="只读挂载"/>
      <Form.Select field={`${field}.sourceType`} label="卷来源" optionList={[
        { value: 'hostPath', label: '宿主机路径' }, { value: 'persistentVolumeClaim', label: '持久卷声明（PVC）' },
      ]}/>
      {values.volumeMounts?.[index]?.sourceType === 'persistentVolumeClaim'
        ? <Form.Input field={`${field}.claimName`} label="PVC 名称"/>
        : <><Form.Input field={`${field}.hostPath`} label="宿主机路径" placeholder="/data"/>
          <Form.Select field={`${field}.hostType`} label="宿主机路径类型" optionList={options(hostPathTypes)}/></>}
      <Space><Button size="small" type="danger" theme="borderless" onClick={remove}>移除挂载</Button></Space>
    </div>)}
    <Space><Button size="small" onClick={() => addWithInitValue({ name: `volume-${arrayFields.length + 1}`, sourceType: 'hostPath', hostType: 'DirectoryOrCreate', readOnly: false })}>添加卷挂载</Button></Space>
  </div>}</ArrayField>;
}

function ClusterBaseFields({ existing, provider, busy, submitted }) {
  const cloud = isCloudCluster(provider);
  return <>
    <Form.Input field="clusterId" label="Cluster ID" disabled={Boolean(existing)} placeholder="例如 inference-nj-b"
      rules={[{ required: true, message: '请填写 Cluster ID。' }]}/>
    <Form.Input field="name" label="集群名称" rules={[{ required: true, message: '请填写集群名称。' }]}/>
    <Form.TextArea field="description" label="描述" maxCount={240}/>
    {cloud && <>
      {provider === 'DigitalOcean' && <Form.Select field="region" label="区域"
        optionList={options([...new Set([...cloudRegions, ...(existing?.region ? [existing.region] : [])])])} disabled={Boolean(existing?.region)}
        rules={[{ required: true, message: '请选择区域。' }]}/>}
      <Form.Input field="serverEndpoint" label="GPUStack Server URL" placeholder="https://gpustack.demo.invalid"
        rules={[{ required: true, message: '请填写 GPUStack Server URL。' }]}/>
    </>}
    {provider === 'SHUIHUA FUTURE' && <Form.Input field="registry" label="默认容器镜像仓库" placeholder="例如 quay.io"
      rules={[{ required: true, message: '请填写可访问的镜像仓库。' }]}/>}
    <Collapse keepDOM>
      <AdminCollapsePanel itemKey="advanced" header="高级配置">
        {!cloud && <Form.Input field="serverEndpoint" label="GPUStack Server URL" placeholder="https://gpustack.demo.invalid"/>}
        <Form.Input field="zone" label="可用区"/>
        <Form.Select field="gpuType" label="GPU 型号" optionList={gpuTypes}/>
        <Form.InputNumber field="totalGpu" label="GPU 总量" min={0} precision={0}/>
        <Form.InputNumber field="nodes" label="节点数量" min={0} precision={0}/>
        {provider === 'Kubernetes' && <>
          <Form.Input field="namespace" label="命名空间"/>
          <ClusterLabelField field="nodeSelector" label="节点选择器" disabled={busy} submitted={submitted} validatePairs={nodeSelectorIssues}/>
          <Form.Input field="operatorImage" label="Operator 镜像" placeholder="例如 registry.example/gpustack-operator:v2.3.1"/>
          <Form.Input field="dataDirHostPath" label="GPUStack 数据目录的宿主机路径" placeholder={dataDirMountPath}
            extraText={`容器内固定以读写方式挂载到 ${dataDirMountPath}。`}/>
          <KubernetesVolumes/>
        </>}
        {provider !== 'SHUIHUA FUTURE' && <Form.Input field="registry" label="默认容器镜像仓库" placeholder="例如 quay.io"/>}
        <Form.Select field="modelProxy" label="代理模式" optionList={options(['直连', '隧道'])}/>
        <Form.Input field="cachePath" label="模型缓存目录" placeholder="例如 /var/lib/gpustack/cache"/>
        <ClusterYamlField field="workerConfigYaml" label="节点配置 YAML" provider={provider} busy={busy}
          placeholder={'debug: false\nproxy_mode: worker\nworker_port: 10150'}/>
        {provider === 'Kubernetes' && <ClusterYamlField field="chartValuesYaml" label="Chart Values YAML" kind="chart" provider={provider} busy={busy}
          placeholder={'debug: false\nclusterDomain: cluster.local'}/>}
      </AdminCollapsePanel>
    </Collapse>
  </>;
}

export function ClusterResourceEditor({ existing, clusters, busy, error, onRefresh, onSave, onClose, onDirty }) {
  const formId = useId();
  const [provider, setProvider] = useState(existing?.provider || 'Docker');
  const [step, setStep] = useState(existing ? 1 : 0);
  const [base, setBase] = useState(existing || baseDefaults);
  const baseDraft = useRef(base);
  const poolDraft = useRef(null);
  const nextPoolNumber = useRef(1);
  const [activePool, setActivePool] = useState('');
  const [localError, setLocalError] = useState('');
  const cloud = isCloudCluster(provider);
  const formSteps = cloud ? ['选择环境', '基本配置', '添加节点池'] : ['选择环境', '基本配置', '完成'];
  const parseBase = values => {
    const name = values.name?.trim(), clusterId = existing?.clusterId || values.clusterId?.trim();
    if (!name || name.length > 80 || !namePattern.test(clusterId ?? '')) throw Error('请填写集群名称以及由小写字母、数字或连字符组成的 Cluster ID。');
    if (clusters.some(row => row.id !== existing?.id && (row.clusterId === clusterId || row.name === name))) throw Error('集群名称或 Cluster ID 已存在。');
    const totalGpu = fieldNumber(values.totalGpu), nodes = fieldNumber(values.nodes);
    if (!Number.isInteger(totalGpu) || !Number.isInteger(nodes) || totalGpu < (existing?.allocatedGpu ?? 0) || nodes < 0) {
      throw Error('节点数量和 GPU 总量须为非负整数，GPU 总量须覆盖当前已分配数量。');
    }
    const serverEndpoint = values.serverEndpoint?.trim() || '';
    if (serverEndpoint) {
      let endpoint;
      try { endpoint = new URL(serverEndpoint); } catch { throw Error('请输入有效的 GPUStack Server URL。'); }
      if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('请输入不带凭证或查询参数的 HTTP(S) 地址。');
    }
    const region = existing?.region || values.region;
    if (cloud && (!serverEndpoint || provider === 'DigitalOcean' && !existing?.region && !cloudRegions.includes(region))) throw Error('请填写服务地址及适用的区域。');
    const registry = values.registry?.trim() || '';
    if (registry && /[@?#\s]/.test(registry)) throw Error('请输入不带凭证、查询参数或空格的仓库地址。');
    const registryHost = registry.replace(/^[a-z][a-z\d+.-]*:\/\//i, '').split(/[/:]/)[0].toLowerCase();
    if (provider === 'SHUIHUA FUTURE' && (!registryHost || dockerHubHosts.includes(registryHost))) {
      throw Error('SHUIHUA FUTURE 无法访问 Docker Hub，请填写其他镜像仓库。');
    }
    if (provider === 'Kubernetes' && values.namespace && !namePattern.test(values.namespace)) throw Error('命名空间须使用小写字母、数字或连字符。');
    const operatorImage = values.operatorImage?.trim() || '';
    const dataDirHostPath = values.dataDirHostPath?.trim() || dataDirMountPath;
    const nodeSelector = provider === 'Kubernetes' ? clusterLabels(values.nodeSelector, nodeSelectorIssues) : undefined;
    if (provider === 'Kubernetes') {
      if (operatorImage && !taggedImage.test(operatorImage)) throw Error('Operator 镜像须包含有效的仓库路径和标签。');
      if (!absoluteMount(dataDirHostPath)) throw Error('GPUStack 数据目录须填写有效的绝对宿主机路径。');
    }
    const workerConfigYaml = values.workerConfigYaml?.trim() || '';
    if (workerConfigYaml !== existing?.workerConfigYaml) validateClusterYaml(workerConfigYaml, provider);
    const chartValuesYaml = values.chartValuesYaml?.trim() || '';
    if (provider === 'Kubernetes' && chartValuesYaml !== existing?.chartValuesYaml) validateClusterYaml(chartValuesYaml, provider, 'chart');
    const fields = ['description', 'zone', 'gpuType', 'modelProxy', 'cachePath',
      ...(provider === 'Kubernetes' ? ['namespace'] : [])];
    const safeValues = Object.fromEntries(fields.filter(key => values[key] !== undefined).map(key => [key, values[key]]));
    return { ...safeValues, name, clusterId, totalGpu, nodes, workerConfigYaml, serverEndpoint: serverEndpoint.replace(/\/$/, ''), registry,
      ...(provider === 'DigitalOcean' && { region }),
      ...(provider === 'Kubernetes' && { chartValuesYaml, operatorImage, dataDirHostPath, ...(nodeSelector !== undefined && { nodeSelector }),
        volumeMounts: validateKubernetesVolumes(values.volumeMounts ?? []) }),
      ...(existing?.provider || !existing ? { provider } : {}) };
  };
  const save = async values => {
    try {
      if (step === 1) {
        const checked = parseBase(values);
        if (existing || !cloud) return await onSave(checked);
        if (!poolDraft.current) {
          const firstPool = createPoolDraft(nextPoolNumber.current++);
          poolDraft.current = { nodePools: [firstPool] };
          setActivePool(firstPool.id);
        }
        setBase(structuredClone(values));
        setStep(2);
      } else {
        const names = new Set();
        const createdAt = new Date().toISOString();
        const allPools = (values.nodePools ?? []).map(pool => {
          try {
            const checked = poolParts(pool, provider);
            if (names.has(checked.name)) throw Error('节点池名称已存在。');
            names.add(checked.name);
            return { ...checked, id: pool.id, createdAt };
          } catch (issue) {
            setActivePool(pool.id);
            throw issue;
          }
        });
        if (!allPools.length) throw Error('请至少添加一个节点池。');
        return await onSave({ ...parseBase(base), nodePools: allPools });
      }
    } catch (issue) { setLocalError(issue.message); }
  };
  return <AdminSideSheet visible closeOnEsc={!busy} closable={!busy} title={existing ? `编辑 ${existing.name}` : '添加集群'} width="min(700px, calc(100vw - 24px))" onCancel={onClose}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button>
      {!existing && step > 0 && <Button disabled={busy} onClick={() => { if (step === 1) setBase(baseDraft.current); setStep(value => value - 1); setLocalError(''); }}>上一步</Button>}
      {step === 0 ? <Button theme="solid" onClick={() => setStep(1)}>下一步</Button>
        : <Button theme="solid" form={formId} htmlType="submit" loading={busy} disabled={busy}>{!existing && cloud && step === 1 ? '下一步' : '保存'}</Button>}
    </Space>}>
    <div className="admin-page-stack">
      {!existing && <Steps current={step} type="basic" size="small">{formSteps.map(title => <Steps.Step key={title} title={title}/>)}</Steps>}
      {step === 0 ? [['自建环境', CLUSTER_PROVIDERS.slice(0, 2)], ['云环境', CLUSTER_PROVIDERS.slice(2)]].map(([label, group]) =>
        <div key={label} className="admin-page-stack" style={{ gap: 8 }}><Text strong>{label}</Text><Space wrap>
          {group.map(item => <Button key={item} theme={provider === item ? 'solid' : 'light'} onClick={() => {
            if (item !== provider) {
              setProvider(item);
              poolDraft.current = null;
              nextPoolNumber.current = 1;
              setActivePool('');
            }
            setLocalError('');
          }}>{item}</Button>)}
        </Space></div>) : <Form key={step} id={formId} disabled={busy} initValues={step === 1 ? { ...baseDefaults, ...base } : poolDraft.current}
        onSubmit={save} onSubmitFail={(errors, values) => {
          const index = errors.nodePools?.findIndex?.(Boolean) ?? -1;
          if (index >= 0 && values.nodePools?.[index]?.id) setActivePool(values.nodePools[index].id);
        }} onValueChange={values => {
          setLocalError(''); onDirty();
          const snapshot = structuredClone(values);
          if (step === 1) baseDraft.current = snapshot;
          else poolDraft.current = snapshot;
        }}>
        {step === 1 ? <ClusterBaseFields existing={existing} provider={provider} busy={busy} submitted={Boolean(localError)}/>
          : <CloudPoolDrafts provider={provider} active={activePool} setActive={setActivePool} nextNumber={nextPoolNumber} busy={busy} submitted={Boolean(localError)}/>}
        {(localError || error) && <Banner type="danger" closeIcon={null} description={<Space wrap>{localError || error}
          {!localError && <Button size="small" theme="borderless" onClick={onRefresh}>刷新工作区</Button>}</Space>}/>}
      </Form>}
    </div>
  </AdminSideSheet>;
}
