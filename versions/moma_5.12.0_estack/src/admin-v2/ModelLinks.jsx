import { useId, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { Button, Card, Select, Tag, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown, IconChevronRight, IconPlay } from '@douyinfe/semi-icons';
import AdminPageHeading from './AdminPageHeading';
import { protocols, channels, services, examples, branchId, canForward, endpoint, planDemoRequest } from './model-link-demo.mjs';
import './model-links.css';

const columns = ['协议', '网关', '模型服务', '路由策略', '协议转换', '渠道', '渠道模型'];
const gateway = 'gateway';
const plans = examples.map(planDemoRequest);
const serviceOptions = services.map(service => ({ label: service.name, value: service.id }));
const options = examples.map((example, value) => ({
  value,
  label: [protocols[example.protocol].name, services.find(service => service.id === example.service).name,
    example.hit && '命中 ' + example.hit].filter(Boolean).join(' · '),
}));

const edgeKey = (from, to) => from + '/' + to;
const stepTime = step => step.stage ? 1150 : step.tone === 'request' ? 640 : 390;

function Status({ enabled, service }) {
  return <Tag size="small" color={enabled ? 'green' : 'grey'}>{enabled ? '已启用' : service ? '已停止' : '已停用'}</Tag>;
}

export default function ModelLinks() {
  const [sample, setSample] = useState(0);
  const [index, setIndex] = useState(-1);
  const [expanded, setExpanded] = useState(() => new Set());
  const [focusedService, setFocusedService] = useState(examples[0].service);
  const [paths, setPaths] = useState({});
  const canvas = useRef(null);
  const arrow = useId();
  const example = examples[sample];
  const focusedInput = focusedService === example.service ? example.protocol :
    services.find(service => service.id === focusedService).protocols[0];
  const plan = plans[sample];
  const current = plan.steps[index];
  const playing = index >= 0 && index < plan.steps.length - 1;
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
    if (!expanded.has(service.id)) {
      edges.push({ from: policy, to: service.id + '-channels', blocked: !service.enabled });
      continue;
    }
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
    const links = edgeIds.split(' ').map(key => [key, ...key.split('/')]);
    const draw = () => {
      const origin = stage.getBoundingClientRect();
      const layout = getComputedStyle(stage).getPropertyValue('--link-layout').trim();
      const bounds = new Map([...nodes].map(([id, element]) => [id, element.getBoundingClientRect()]));
      const next = {};
      for (const [key, from, to] of links) {
        const a = bounds.get(from), b = bounds.get(to);
        if (!a?.width || !b?.width) continue;
        const branch = nodes.get(to).closest('.model-links-branch');
        const withinBranch = branch?.contains(nodes.get(from));
        if (layout === 'narrow' && branch && !withinBranch) {
          const x = a.left - origin.left + 8, y = b.top + b.height / 2 - origin.top;
          next[key] = `M${x} ${a.bottom - origin.top + 2} V${y} H${b.left - origin.left - 3}`;
        } else if (layout === 'narrow' || (layout === 'medium' && withinBranch)) {
          const x1 = a.left + a.width / 2 - origin.left, x2 = b.left + b.width / 2 - origin.left;
          const y1 = a.bottom - origin.top + 2, y2 = b.top - origin.top - 3;
          const mid = (y1 + y2) / 2;
          next[key] = `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
        } else {
          const x1 = a.right - origin.left + 2, x2 = b.left - origin.left - 3;
          const y1 = a.top + a.height / 2 - origin.top, y2 = b.top + b.height / 2 - origin.top;
          const mid = (x1 + x2) / 2;
          next[key] = `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
        }
      }
      setPaths(next);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    observer.observe(stage.querySelector('.model-links-ingress'));
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [edgeIds, focusedService, focusedInput]);

  useLayoutEffect(() => {
    if (index === 0) canvas.current.querySelector(`[data-link-node="${example.service}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index, example.service]);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setIndex(index + 1), stepTime(current));
    return () => clearTimeout(timer);
  }, [current, index, playing]);

  const branchState = id => grouped && (plan.group.includes(id) ? ' candidate' : plan.standby.includes(id) ? ' standby' : '') || '';
  const node = (id, content, extra = '') => <div className={'model-links-node' + extra} data-link-node={id} data-tone={reached.get(id)}>{content}</div>;
  const movingPath = playing && current.from && paths[edgeKey(current.from, current.to)];
  const reverse = current?.tone !== 'request';
  const play = () => {
    setFocusedService(example.service);
    setExpanded(previous => new Set([...previous, example.service]));
    setIndex(0);
  };
  const toggleService = id => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return <div className="admin-page-stack model-links">
    <AdminPageHeading title="模型链路"/>
    <Card className="model-links-card">
      <div className="model-links-toolbar">
        <Tag>模拟配置与请求</Tag>
        <div className="model-links-controls">
          <Select aria-label="模拟请求" optionList={options} value={sample} disabled={playing}
            onChange={value => { setSample(value); setFocusedService(examples[value].service); setIndex(-1); }}/>
          <Button icon={<IconPlay/>} theme="solid" disabled={playing} onClick={play}>
            {index < 0 ? '播放请求' : playing ? '播放中' : '重播请求'}
          </Button>
        </div>
      </div>
      <div className="model-links-result" role="status" aria-live="polite">
        {current ? current.message : 'POST ' + protocols[example.protocol].path + ' · 等待播放'}
      </div>
      <div className="model-links-viewport" role="region" aria-label="模型链路画布" tabIndex={0}>
        <div className="model-links-service-picker">
          <Select aria-label="查看模型服务" optionList={serviceOptions} value={focusedService} disabled={playing}
            onChange={setFocusedService}/>
        </div>
        <div className="model-links-stage" ref={canvas} style={{ '--service-count': services.length }}>
          <svg className="model-links-wires" aria-hidden="true">
            <defs><marker id={arrow} orient="auto-start-reverse" markerWidth="7" markerHeight="8" refX="6" refY="4" markerUnits="userSpaceOnUse">
              <path d="M1 1 L5 4 L1 7" fill="none" stroke="context-stroke" strokeWidth="1.4"/>
            </marker></defs>
            {edges.map(({ from, to, blocked, branch }) => {
              const key = edgeKey(from, to), tone = traversed.get(key);
              if (!paths[key]) return null;
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
          {columns.map((column, position) => <strong key={column} className="model-links-column" data-column={position}>{column}</strong>)}
          <strong className="model-links-branch-heading">渠道分支</strong>
          <div className="model-links-ingress">
            <div className="model-links-protocols">{Object.entries(protocols).map(([id, protocol]) =>
              <div key={id} data-focused={id === focusedInput}>{node(id, <><strong>{protocol.name}</strong><code>{protocol.path}</code></>)}</div>)}</div>
            {node(gateway, <><strong>平台网关</strong><code>https://xxxxx.com</code></>, ' model-links-gateway')}
          </div>
          {services.map((service, lane) => {
            const input = service.id === example.service ? example.protocol : service.protocols[0];
            const isExpanded = expanded.has(service.id);
            const panelId = arrow + '-' + service.id;
            return <div key={service.id} className="model-links-lane" data-focused={service.id === focusedService} style={{ '--lane': lane + 2 }}>
              {node(service.id, <><strong>{service.name}</strong>
                {isExpanded && <>
                  {service.type && <Typography.Text type="secondary" size="small">{service.type}</Typography.Text>}
                  <code>{service.callId}</code><small>{service.protocols.map(id => protocols[id].name).join(' · ')}</small>
                </>}
                <div className="model-links-service-actions">
                  <Status enabled={service.enabled} service/>
                  <Button theme="borderless" size="small" icon={isExpanded ? <IconChevronDown/> : <IconChevronRight/>}
                    aria-label={`${isExpanded ? '收起' : '展开'} ${service.name} 的渠道`}
                    aria-expanded={isExpanded} aria-controls={panelId}
                    disabled={playing && service.id === example.service} onClick={() => toggleService(service.id)}>
                    {isExpanded ? '收起' : '展开'}
                  </Button>
                </div></>, ' model-links-service')}
              {node(service.id + '-policy', <><strong>{service.policy}</strong>{isExpanded && <small>{service.detail}</small>}</>, ' model-links-policy')}
              <div className="model-links-branches" id={panelId}>{isExpanded ? service.routes.map(route => {
                const id = branchId(service, route), channel = channels[route.channel];
                const native = input === channel.format, compatible = canForward(input, channel);
                const captions = branchState(id);
                const format = protocols[channel.format].name;
                return <div className="model-links-branch" key={id}>
                  {node(id + '-conversion', <><strong>{native ? '原生转发' : compatible ? '跨协议转换' : '缺少转换配置'}</strong>
                    <small>{protocols[input].name}{!native && ' → ' + format}</small></>, captions + (compatible ? '' : ' model-links-unavailable'))}
                  {node(id + '-channel', <><strong>渠道 {route.channel}</strong><Status enabled={channel.enabled}/>
                    <small>API Format</small>{format}<small>API Endpoint</small><code>{endpoint(channel)}</code></>, captions)}
                  {node(id, <><code>{route.model}</code><Status enabled={route.enabled}/>
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
              }) : node(service.id + '-channels', <><strong>{service.routes.length} 条渠道</strong>
                <small>{service.routes.map(route => route.channel).join('、')}</small></>, ' model-links-summary')}</div>
            </div>;
          })}
        </div>
      </div>
    </Card>
  </div>;
}
