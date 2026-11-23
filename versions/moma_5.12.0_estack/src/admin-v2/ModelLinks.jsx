import { useId, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { Card, Select, Tag, Typography } from '@douyinfe/semi-ui';
import AdminPageHeading from './AdminPageHeading';
import { protocols, channels, services, examples, branchId, canForward, endpoint, planDemoRequest } from './model-link-demo.mjs';
import './model-links.css';

const columns = ['接口格式', '网关', '模型服务', '路由策略', '接口格式转换', '连接', '上游模型'];
const gateway = 'gateway';
const plans = examples.map(planDemoRequest);
const options = examples.map((example, value) => ({
  value,
  label: [protocols[example.protocol].name, services.find(service => service.id === example.service).name,
    example.hit && '命中 ' + example.hit].filter(Boolean).join(' · '),
}));

const edgeKey = (from, to) => from + '/' + to;
const stepTime = step => step.stage ? 1150 : step.tone === 'request' ? 640 : 390;

function Status({ enabled, service }) {
  return <Tag size="small" color={enabled ? 'green' : 'grey'}>{enabled ? (service ? '服务中' : '已启用') : service ? '已停服' : '已停用'}</Tag>;
}

export default function ModelLinks() {
  const [sample, setSample] = useState(0);
  const [index, setIndex] = useState(0);
  const [paths, setPaths] = useState({});
  const canvas = useRef(null);
  const arrow = useId();
  const example = examples[sample];
  const plan = plans[sample];
  const current = plan.steps[index];
  const playing = index < plan.steps.length - 1;
  const grouped = plan.steps.slice(0, index + 1).some(step => step.stage === 'group');
  const chosen = plan.steps.slice(0, index + 1).some(step => step.stage === 'chosen') ? plan.chosen : '';
  const traversed = new Map(), reached = new Map();
  for (const step of plan.steps.slice(0, index + 1)) {
    if (step.stage) continue;
    traversed.set(edgeKey(step.from, step.to), step.tone);
    reached.set(step.from, step.tone);
    reached.set(step.to, step.tone);
  }
  const edges = Object.keys(protocols).map(from => ({ from, to: gateway }));
  for (const service of services) {
    const input = service.id === example.service ? example.protocol : service.protocols[0];
    const policy = service.id + '-policy';
    edges.push({ from: gateway, to: service.id }, { from: service.id, to: policy, blocked: !service.enabled });
    for (const route of service.routes) {
      const id = branchId(service, route), conversion = id + '-conversion', channel = id + '-channel';
      const connection = channels[route.channel];
      const blocked = !service.enabled || !route.enabled || !connection.enabled || !canForward(input, connection);
      edges.push({ from: policy, to: conversion, blocked, branch: id },
        { from: conversion, to: channel, blocked, branch: id }, { from: channel, to: id, blocked, branch: id });
    }
  }
  const edgeIds = edges.map(({ from, to }) => edgeKey(from, to)).join(' ');
  useLayoutEffect(() => {
    const stage = canvas.current;
    const nodes = new Map([...stage.querySelectorAll('[data-link-node]')].map(node => [node.dataset.linkNode, node]));
    const draw = () => {
      const origin = stage.getBoundingClientRect();
      setPaths(Object.fromEntries(edgeIds.split(' ').map(key => {
        const [from, to] = key.split('/');
        const a = nodes.get(from).getBoundingClientRect(), b = nodes.get(to).getBoundingClientRect();
        const x1 = Math.round(a.right - origin.left + 2), y1 = Math.round(a.top + a.height / 2 - origin.top);
        const x2 = Math.round(b.left - origin.left - 3), y2 = Math.round(b.top + b.height / 2 - origin.top);
        const mid = (x1 + x2) / 2;
        return [key, 'M' + x1 + ' ' + y1 + ' C' + mid + ' ' + y1 + ' ' + mid + ' ' + y2 + ' ' + x2 + ' ' + y2];
      })));
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [edgeIds]);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setIndex(index + 1), stepTime(current));
    return () => clearTimeout(timer);
  }, [current, index, playing]);

  const branchState = id => grouped && (plan.group.includes(id) ? ' candidate' : plan.standby.includes(id) ? ' standby' : '') || '';
  const node = (id, content, extra = '') => <div className={'model-links-node' + extra} data-link-node={id} data-tone={reached.get(id)}>{content}</div>;
  const movingPath = playing && current.from && paths[edgeKey(current.from, current.to)];
  const reverse = current?.tone !== 'request';

  return <div className="admin-page-stack model-links">
    <AdminPageHeading title="模型链路"/>
    <Card className="model-links-card">
      <div className="model-links-toolbar">
        <div><h2>模型服务调用链路</h2><small>模拟配置与请求</small></div>
        <div className="model-links-controls">
          <span>模拟请求</span><Select aria-label="模拟请求" optionList={options} value={sample}
            onChange={value => { setSample(value); setIndex(0); }}/>
        </div>
      </div>
      <div className="model-links-viewport" role="region" aria-label="模型链路画布" tabIndex={0}>
        <div className="model-links-stage" ref={canvas} style={{ '--service-count': services.length }}>
          <svg className="model-links-wires" aria-hidden="true">
            <defs><marker id={arrow} orient="auto-start-reverse" markerWidth="7" markerHeight="8" refX="6" refY="4" markerUnits="userSpaceOnUse">
              <path d="M1 1 L5 4 L1 7" fill="none" stroke="context-stroke" strokeWidth="1.4"/>
            </marker></defs>
            {edges.map(({ from, to, blocked, branch }) => {
              const key = edgeKey(from, to), tone = traversed.get(key);
              const marker = 'url(#' + arrow + ')';
              return <path key={key} d={paths[key]} className={'model-links-wire' + branchState(branch)}
                data-tone={tone} data-blocked={blocked || undefined}
                markerStart={tone && tone !== 'request' ? marker : undefined}
                markerEnd={!tone || tone === 'request' ? marker : undefined}/>;
            })}
            {movingPath && <circle key={sample + '/' + index} r="4.5" className="model-links-packet" data-tone={current.tone}>
              <animateMotion path={movingPath} dur={stepTime(current) + 'ms'}
                keyTimes="0;1" keyPoints={reverse ? '1;0' : '0;1'} calcMode="linear" fill="freeze"/>
            </circle>}
          </svg>
          {columns.map(column => <strong key={column} className="model-links-column">{column}</strong>)}
          <div className="model-links-protocols">{Object.entries(protocols).map(([id, protocol]) =>
            <div key={id}>{node(id, <><strong>{protocol.name}</strong><code>{protocol.path}</code></>)}</div>)}</div>
          {node(gateway, <><strong>平台网关</strong><code>https://xxxxx.com</code></>, ' model-links-gateway')}
          {services.map((service, lane) => {
            const input = service.id === example.service ? example.protocol : service.protocols[0];
            return <div key={service.id} className="model-links-lane" style={{ '--lane': lane + 2 }}>
              {node(service.id, <><div className="model-links-node-heading"><strong>{service.name}</strong><Status enabled={service.enabled} service/></div>
                {service.type && <Typography.Text type="secondary" size="small">{service.type}</Typography.Text>}
                <code>{service.callId}</code><small>{service.protocols.map(id => protocols[id].name).join(' · ')}</small></>, ' model-links-service')}
              {node(service.id + '-policy', <><strong>{service.policy}</strong><small>{service.detail}</small></>, ' model-links-policy')}
              <div className="model-links-branches">{service.routes.map(route => {
                const id = branchId(service, route), channel = channels[route.channel];
                const native = input === channel.format, compatible = canForward(input, channel);
                const captions = branchState(id);
                const format = protocols[channel.format].name;
                return <div className="model-links-branch" key={id}>
                  {node(id + '-conversion', <><strong>{native ? '原生转发' : compatible ? '跨接口格式转换' : '缺少转换配置'}</strong>
                    <small>{protocols[input].name}{!native && ' → ' + format}</small></>, captions + (compatible ? '' : ' model-links-unavailable'))}
                  {node(id + '-channel', <><div className="model-links-node-heading"><strong>连接 {route.channel}</strong><Status enabled={channel.enabled}/></div>
                    <dl className="model-links-channel-fields">
                      <dt>API Format</dt><dd>{format}</dd>
                      <dt>API Endpoint</dt><dd><code>{endpoint(channel)}</code></dd>
                    </dl></>, captions)}
                  {node(id, <><div className="model-links-node-heading"><code>{route.model}</code><Status enabled={route.enabled}/></div>
                    <div className="model-links-weights"><span>优先级 {route.priority}</span>
                      <Typography.Text size="small" type={service.weighted ? 'primary' : 'tertiary'}>
                        权重 {route.weight}{!service.weighted && ' · 不生效'}
                      </Typography.Text>
                    </div>
                    {(chosen === id || captions) && <small className="model-links-decision">
                      {chosen === id ? '本次命中' : captions === ' standby' ? '待命' : '同组候选'}
                    </small>}
                  </>, captions)}
                </div>;
              })}</div>
            </div>;
          })}
        </div>
      </div>
      <footer className="model-links-footer">
      <div className="model-links-result" role="status" aria-live="polite">
        {current.message}
      </div>
        <div className="model-links-legend"><span>请求</span><span>响应</span><span>不可用</span></div>
      </footer>
    </Card>
  </div>;
}
