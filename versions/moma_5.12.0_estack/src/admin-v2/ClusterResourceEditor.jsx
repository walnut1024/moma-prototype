import { useId, useRef, useState } from 'react';
import { ArrayField, Banner, Button, Checkbox, Collapse, Form, Space, Steps, Typography } from '@douyinfe/semi-ui';
import AdminCollapsePanel from './AdminCollapsePanel';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import { CLUSTER_PROVIDERS, isCloudCluster } from './ops-cluster-domain';
import { labelIssue } from './ops-resources';

const { Paragraph, Text } = Typography;
const options = values => values.map(value => ({ value, label: value }));
const namePattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const poolDefaults = { replicas: 1, batchSize: 1, osImage: 'Ubuntu 24.04 LTS', volumes: [] };
const demoMachine = {
  DigitalOcean: ['gpu-h100x1-80gb', 'gpu-h100x8-640gb', 'gpu-l40sx2-96gb'],
  'SHUIHUA FUTURE': ['gpu-h20x1-96gb', 'gpu-h20x8-768gb', 'gpu-a800x8-640gb'],
};

const poolParts = (values, provider) => {
  const name = values.name?.trim(), replicas = Number(values.replicas), batchSize = Number(values.batchSize);
  if (!namePattern.test(name ?? '')) throw Error('节点池名称须使用小写字母、数字或连字符。');
  if (!demoMachine[provider]?.includes(values.instanceType) || !values.osImage) throw Error('请选择节点规格和操作系统镜像。');
  if (!Number.isInteger(replicas) || replicas < 0 || !Number.isInteger(batchSize) || batchSize < 1 || replicas > 0 && batchSize > replicas) {
    throw Error('副本数量须为非负整数，批大小须为正整数且不高于目标副本数。');
  }
  const invalidLabel = labelIssue(values.labels);
  if (invalidLabel) throw Error(invalidLabel);
  const volumes = (values.volumes || []).map(volume => {
    const capacity = Number(volume.capacity);
    if (!namePattern.test(volume.name ?? '') || !Number.isInteger(capacity) || capacity < 1 || !/^\/[\w./-]+$/.test(volume.mountPath || '') || volume.mountPath.split('/').includes('..')) {
      throw Error('存储卷须填写有效名称、正整数容量和绝对挂载路径。');
    }
    return { name: volume.name, mountPath: volume.mountPath, capacity, filesystem: volume.filesystem || 'ext4' };
  });
  if (new Set(volumes.map(volume => volume.name)).size !== volumes.length || new Set(volumes.map(volume => volume.mountPath)).size !== volumes.length) throw Error('存储卷名称及挂载路径不可重复。');
  return { name, replicas, batchSize, instanceType: values.instanceType, osImage: values.osImage,
    labels: values.labels?.trim() || '', volumes: provider === 'DigitalOcean' ? volumes : [] };
};

function PoolFields({ provider }) {
  return <>
    <Form.Input field="name" label="节点池名称"/>
    <Form.Select field="instanceType" label="实例类型" optionList={options(demoMachine[provider] || [])}/>
    <Form.Select field="osImage" label="操作系统镜像" optionList={options(['Ubuntu 24.04 LTS', 'Ubuntu 22.04 LTS'])}/>
    <Form.InputNumber field="replicas" label="副本数" min={0} max={200} precision={0}/>
    <Form.InputNumber field="batchSize" label="批大小" min={1} max={200} precision={0}/>
    <Form.Input field="labels" label="标签" placeholder="例如 pool=inference"/>
    {provider === 'DigitalOcean' && <ArrayField field="volumes">
      {({ arrayFields, addWithInitValue }) => <div className="admin-page-stack">
        <Text strong>存储卷</Text>
        {arrayFields.map(({ key, field, remove }) => <div key={key} className="admin-page-stack" style={{ gap: 4 }}>
          <Form.Input field={`${field}.name`} label="存储卷名称"/>
          <Form.Input field={`${field}.mountPath`} label="挂载路径" placeholder="/var/lib/gpustack"/>
          <Form.InputNumber field={`${field}.capacity`} label="容量 (GiB)" min={1} precision={0}/>
          <Form.Select field={`${field}.filesystem`} label="文件系统" optionList={options(['ext4', 'xfs'])}/>
          <Button theme="borderless" type="danger" onClick={remove}>移除存储卷</Button>
        </div>)}
        <Space><Button onClick={() => addWithInitValue({ capacity: 100, filesystem: 'ext4' })}>添加存储卷</Button></Space>
      </div>}
    </ArrayField>}
  </>;
}

export function NodePoolEditor({ cluster, pool, resize, onSave, onClose, busy }) {
  const formId = useId();
  const [error, setError] = useState('');
  const save = async values => {
    try {
      const next = poolParts(resize ? { ...pool, ...values, batchSize: Math.min(pool.batchSize, values.replicas || pool.batchSize) } : values, cluster.provider);
      if ((cluster.nodePools || []).some(row => row.id !== pool?.id && row.name === next.name)) throw Error('节点池名称已存在。');
      if (!await onSave({ ...next, id: pool?.id || crypto.randomUUID() })) setError('保存未确认，请核对后重试。');
    } catch (issue) { setError(issue.message); }
  };
  return <AdminModal visible title={resize ? '调整节点池副本' : pool ? '编辑节点池' : '添加节点池'}
    width="min(580px, calc(100vw - 32px))" closeOnEsc={!busy} closable={!busy} onCancel={onClose}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button><Button theme="solid" form={formId} htmlType="submit" loading={busy}>保存</Button></Space>}>
    <Form id={formId} initValues={pool || poolDefaults} onSubmit={save} disabled={busy} onValueChange={() => setError('')}>
      {resize ? <Form.InputNumber field="replicas" label="副本数" min={0} max={200} precision={0}/> : <PoolFields provider={cluster.provider}/>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </Form>
  </AdminModal>;
}

const baseDefaults = { zone: '南京', gpuType: 'H20', totalGpu: 0, nodes: 0, namespace: 'gpustack-system', modelProxy: '直连' };
const gpuTypes = options(['H20', 'L40S', 'A800', 'H100', 'A100', 'CPU']);

function ClusterBaseFields({ existing, provider }) {
  const cloud = isCloudCluster(provider);
  return <>
    <Form.Input field="clusterId" label="Cluster ID" disabled={Boolean(existing)} placeholder="例如 inference-nj-b"/>
    <Form.Input field="name" label="集群名称"/>
    <Form.TextArea field="description" label="描述" maxCount={240}/>
    {cloud && <>
      {provider === 'DigitalOcean' && <Form.Select field="region" label="区域" optionList={options(['sfo3', 'nyc3', 'tor1', 'ams3'])}/>}
      <Form.Input field="serverEndpoint" label="GPUStack Server URL" placeholder="https://gpustack.demo.invalid"/>
    </>}
    <Collapse keepDOM>
      <AdminCollapsePanel itemKey="advanced" header="高级配置">
        <Form.Input field="zone" label="可用区"/>
        <Form.Select field="gpuType" label="GPU 型号" optionList={gpuTypes}/>
        <Form.InputNumber field="totalGpu" label="GPU 总量" min={0} precision={0}/>
        <Form.InputNumber field="nodes" label="节点数量" min={0} precision={0}/>
        {provider === 'Kubernetes' && <>
          <Form.Input field="namespace" label="命名空间"/>
          <Form.Input field="nodeSelector" label="节点选择器" placeholder="例如 accelerator=nvidia"/>
        </>}
        <Form.Input field="registry" label="默认容器镜像仓库" placeholder="例如 quay.io"/>
        <Form.Select field="modelProxy" label="代理模式" optionList={options(['直连', '隧道'])}/>
        <Form.Input field="cachePath" label="模型缓存目录" placeholder="例如 /var/lib/gpustack/cache"/>
        <Form.TextArea field="workerConfigYaml" label="节点配置 YAML" placeholder={'log_level: info\nproxy_mode: tunnel'}
          extraText="支持 log_level、proxy_mode、cache_dir、model_dir 和 kv_transfer_ifname。"/>
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
  const [pools, setPools] = useState([]);
  const [localError, setLocalError] = useState('');
  const cloud = isCloudCluster(provider);
  const formSteps = cloud ? ['选择环境', '基本配置', '添加节点池'] : ['选择环境', '基本配置', '完成'];
  const parseBase = values => {
    const name = values.name?.trim(), clusterId = existing?.clusterId || values.clusterId?.trim();
    if (!name || name.length > 80 || !namePattern.test(clusterId ?? '')) throw Error('请填写集群名称以及由小写字母、数字或连字符组成的 Cluster ID。');
    if (clusters.some(row => row.id !== existing?.id && (row.clusterId === clusterId || row.name === name))) throw Error('集群名称或 Cluster ID 已存在。');
    const totalGpu = Number(values.totalGpu), nodes = Number(values.nodes);
    if (!Number.isInteger(totalGpu) || !Number.isInteger(nodes) || totalGpu < (existing?.allocatedGpu ?? 0) || nodes < 0) {
      throw Error('节点数量和 GPU 总量须为非负整数，GPU 总量须覆盖当前已分配数量。');
    }
    if (cloud && values.serverEndpoint) {
      let endpoint;
      try { endpoint = new URL(values.serverEndpoint); } catch { throw Error('请输入有效的 GPUStack Server URL。'); }
      if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('请输入不带凭证或查询参数的 HTTP(S) 地址。');
    }
    if (cloud && !existing && (!values.serverEndpoint || provider === 'DigitalOcean' && !values.region)) throw Error('请填写服务地址及适用的区域。');
    if (provider === 'SHUIHUA FUTURE' && !values.registry?.trim()) throw Error('请为 SHUIHUA FUTURE 填写可访问的镜像仓库。');
    const workerConfigYaml = values.workerConfigYaml?.trim() || '';
    if (workerConfigYaml.split('\n').some(line => line.trim() && !/^\s*(?:log_level|proxy_mode|cache_dir|model_dir|kv_transfer_ifname):\s*[\w./-]+\s*$/.test(line))) {
      throw Error('节点配置 YAML 包含不支持的字段或值。');
    }
    const fields = ['description', 'zone', 'gpuType', 'region', 'serverEndpoint', 'namespace', 'nodeSelector', 'registry', 'modelProxy', 'cachePath'];
    const safeValues = Object.fromEntries(fields.filter(key => values[key] !== undefined).map(key => [key, values[key]]));
    return { ...safeValues, name, clusterId, totalGpu, nodes, workerConfigYaml,
      ...(existing?.provider || !existing ? { provider } : {}) };
  };
  const save = async values => {
    try {
      if (step === 1) {
        const checked = parseBase(values);
        if (existing || !cloud) return await onSave(checked);
        setBase(values);
        setStep(2);
      } else {
        const checked = poolParts(values, provider);
        const allPools = [...pools, { ...checked, id: crypto.randomUUID() }];
        if (allPools.some((row, index) => allPools.findIndex(item => item.name === row.name) !== index)) throw Error('节点池名称已存在。');
        return await onSave({ ...parseBase(base), nodePools: allPools });
      }
    } catch (issue) { setLocalError(issue.message); }
  };
  const [formKey, setFormKey] = useState(0);
  const [addAnother, setAddAnother] = useState(false);
  const handleSubmit = values => {
    if (step !== 2 || !addAnother) return save(values);
    try {
      const checked = poolParts(values, provider);
      if (pools.some(row => row.name === checked.name)) throw Error('节点池名称已存在。');
      setPools(current => [...current, { ...checked, id: crypto.randomUUID() }]);
      setFormKey(value => value + 1);
      setAddAnother(false);
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
            setProvider(item); setPools([]); setLocalError('');
          }}>{item}</Button>)}
        </Space></div>) : <Form key={`${step}-${formKey}`} id={formId} disabled={busy} initValues={step === 1 ? { ...baseDefaults, ...base } : poolDefaults}
        onSubmit={handleSubmit} onValueChange={(values) => { setLocalError(''); onDirty(); if (step === 1) baseDraft.current = values; }}>
        {step === 1 ? <ClusterBaseFields existing={existing} provider={provider}/>
          : <><PoolFields provider={provider}/>{pools.length > 0 && <Paragraph>已加入 {pools.map(pool => pool.name).join('、')}</Paragraph>}
            <Checkbox checked={addAnother} onChange={event => setAddAnother(event.target.checked)}>保存此节点池后继续添加</Checkbox></>}
        {(localError || error) && <Banner type="danger" closeIcon={null} description={<Space wrap>{localError || error}
          {!localError && <Button size="small" theme="borderless" onClick={onRefresh}>刷新工作区</Button>}</Space>}/>}
      </Form>}
    </div>
  </AdminSideSheet>;
}
