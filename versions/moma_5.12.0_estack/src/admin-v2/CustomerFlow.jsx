
import { useEffect, useMemo, useRef } from 'react';
import { Button, Progress, Tag, Typography } from './xa24/HaloUI.jsx';
import { flowAmount, flowPercent, ratio } from './customer-flow-demo';

const { Text } = Typography;

// The canvas shares the scrolling coordinate system with the cards.
function FlowLines({ board, edges, running }) {
  const canvas = useRef(null);
  useEffect(() => {
    const root = board.current;
    const layer = canvas.current;
    const context = layer.getContext('2d');
    if (!context) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let paths = [], width = 0, height = 0, frame = 0;

    function draw(time = 0) {
      context.clearRect(0, 0, width, height);
      for (const { edge, x1, y1, x2, y2, bend } of paths) {
        const pointAt = t => {
          const s = 1 - t;
          return [
            s ** 3 * x1 + 3 * s * s * t * (x1 + bend) + 3 * s * t * t * (x2 - bend) + t ** 3 * x2,
            y1 + (y2 - y1) * (3 * s * t * t + t ** 3),
          ];
        };
        context.globalAlpha = edge.active ? 1 : .4;
        context.strokeStyle = edge.active ? '#66a7ff' : '#a7c8f3';
        context.lineWidth = edge.active ? 1.25 + 1.25 * ratio(edge.tpm, edge.total) : 1.3;
        context.beginPath();
        context.moveTo(x1, y1);
        context.bezierCurveTo(x1 + bend, y1, x2 - bend, y2, x2, y2);
        context.stroke();
        const [labelX, labelY] = pointAt(.48);
        context.textAlign = 'center';
        context.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
        context.strokeStyle = '#f4f7fb';
        context.lineJoin = 'round';
        context.lineWidth = 4;
        const label = flowPercent(edge.tpm, edge.total);
        context.strokeText(label, labelX, labelY - 5);
        context.fillStyle = '#176bd5';
        context.fillText(label, labelX, labelY - 5);
        if (running && !motion.matches && edge.active) {
          for (const offset of [0, .5]) {
            const [x, y] = pointAt((time / 1600 + offset) % 1);
            context.beginPath();
            context.arc(x, y, 2.7, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
      context.globalAlpha = 1;
    }

    function measure() {
      const bounds = root.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const scale = Math.min(devicePixelRatio || 1, 2);
      layer.width = Math.ceil(width * scale);
      layer.height = Math.ceil(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const cards = new Map([...root.querySelectorAll('[data-flow-id]')].map(card =>
        [card.dataset.flowId, card.getBoundingClientRect()]));
      paths = edges.flatMap(edge => {
        const source = cards.get(edge.from), target = cards.get(edge.to);
        if (!source?.width || !target?.width) return [];
        const x1 = source.right - bounds.left, x2 = target.left - bounds.left;
        return [{
          edge, x1, x2, y1: source.top + source.height / 2 - bounds.top,
          y2: target.top + target.height / 2 - bounds.top, bend: (x2 - x1) * .37,
        }];
      });
      draw(performance.now());
    }

    function animate(time) {
      draw(time);
      frame = requestAnimationFrame(animate);
    }
    function syncMotion() {
      cancelAnimationFrame(frame);
      if (running && !motion.matches) frame = requestAnimationFrame(animate);
      else draw();
    }

    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll('[data-flow-id]').forEach(card => observer.observe(card));
    measure();
    syncMotion();
    motion.addEventListener('change', syncMotion);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener('change', syncMotion);
    };
  }, [board, edges, running]);

  return <canvas ref={canvas} className="ca-flow-lines" role="img"
    aria-label={edges.map(edge => edge.fromName + ' 到 ' + edge.toName + ' ' + flowPercent(edge.tpm, edge.total)).join('，') || '当前无分流连线'}/>;
}

function ClusterCard({ cluster, selected, dimmed, onSelect, onDetails }) {
  const load = ratio(cluster.tpm, cluster.capacity);
  const tag = cluster.tag || (load >= 1 ? '超载' : '自有算力');
  const color = cluster.tag ? 'blue' : load >= 1 ? 'orange' : 'green';
  return <article className="ca-node" data-flow-id={cluster.id} data-registered={Boolean(cluster.registered)}
    data-selected={selected} data-dimmed={dimmed}>
    <button type="button" className="ca-cluster-focus" aria-pressed={selected} onClick={onSelect}>
      <span className="ca-cluster-name"><i aria-hidden="true"/><strong>{cluster.name}</strong><Tag size="small" color={color}>{tag}</Tag></span>
      <span className="ca-node-data">
        <span>实时 TPM <b>{flowAmount(cluster.tpm)}</b></span>
        <span>产能 TPM <b>{flowAmount(cluster.capacity)}</b></span>
        <span>剩余 <b>{flowAmount(cluster.capacity == null ? null : Math.max(0, cluster.capacity - cluster.tpm))}</b></span>
      </span>
      {cluster.capacity
        ? <Progress percent={Math.min(100, load * 100)} stroke={load >= 1 ? '#ef933b' : '#80b5fc'} aria-label="集群负载"/>
        : <span className="ca-node-track"/>}
      <span className="ca-spread ca-node-footer"><span>负载 {cluster.capacity ? flowPercent(cluster.tpm, cluster.capacity) : '—'}</span><span>{cluster.model || '—'}</span></span>
    </button>
    <Button className="ca-flow-details" theme="borderless" size="small" aria-label={'查看详情 ' + cluster.name + (cluster.model ? ' ' + cluster.model : '')}
      onClick={onDetails}>查看详情</Button>
  </article>;
}

export default function CustomerFlow({ snapshot, focus, onFocus, onDetails, running }) {
  const board = useRef(null);
  const cluster = snapshot.clusters.find(item => item.id === focus.cluster);
  const instances = cluster?.instances ?? [];
  const edges = useMemo(() => snapshot.edges.filter(edge =>
    !snapshot.clusters.some(item => item.id === edge.from) || edge.from === focus.cluster,
  ).map(edge => ({
    ...edge,
    active: (!focus.gateway || edge.from === focus.gateway || edge.from === focus.cluster)
      && (!focus.cluster || edge.from === focus.cluster || edge.to === focus.cluster),
  })), [snapshot, focus]);
  function selectGateway(gateway) {
    if (focus.gateway === gateway) { onFocus({ gateway: '', cluster: '' }); return; }
    const target = snapshot.clusters.find(item => item.gateway === gateway && item.tpm);
    onFocus({ gateway, cluster: target?.id || '' });
  }
  const group = registered => snapshot.clusters.filter(item => Boolean(item.registered) === registered);
  return <div className="ca-flow-scroll" tabIndex={0} role="region" aria-label="网关、集群与实例流量去向">
    <div className="ca-flow-grid" ref={board}>
      <FlowLines board={board} edges={edges} running={running}/>
      <section className="ca-flow-column" aria-label="网关">
        <Text type="secondary" size="small">网关</Text>
        {snapshot.gateways.map(item => <button type="button" key={item.id} data-flow-id={item.id} className="ca-gateway"
          data-dimmed={Boolean(focus.gateway && focus.gateway !== item.id)} aria-pressed={focus.gateway === item.id} onClick={() => selectGateway(item.id)}>
          <span><span className="ca-gateway-name"><i aria-hidden="true"/><strong>{item.id}</strong> <small>{flowAmount(item.requests)} 请求</small></span>
            <span><small>TPM </small><b>{flowAmount(item.tpm)}</b></span></span>
          <strong className="ca-flow-number">{flowPercent(item.tpm, snapshot.tpm)}</strong>
        </button>)}
      </section>
      <div className="ca-flow-column">
        {[true, false].map(registered => {
          const clusters = group(registered);
          const title = registered ? '已注册集群' : '未注册集群';
          return clusters.length > 0 && <section className="ca-flow-clusters" key={title} aria-label={title}>
            <Text type="secondary" size="small">{title}</Text>
            {clusters.map(item => <ClusterCard key={item.id} cluster={item} selected={item.id === focus.cluster}
              dimmed={Boolean(focus.cluster ? item.id !== focus.cluster : focus.gateway && item.gateway !== focus.gateway)}
              onSelect={() => onFocus({ gateway: item.gateway || '', cluster: focus.cluster === item.id ? '' : item.id })}
              onDetails={() => onDetails(item.id)}/>)}
          </section>;
        })}
      </div>
      <section className="ca-flow-column" aria-label="实例">
        <Text type="secondary" size="small">实例</Text>
        {instances.map(item => <article className="ca-flow-instance" data-flow-id={item.id} key={item.id}>
          <div className="ca-spread"><strong>{item.name}</strong><Tag size="small" color="green">可用</Tag></div>
          <div className="ca-instance-tags"><Tag size="small">{item.gpu}</Tag><Tag size="small">{item.cards} 卡</Tag><Tag size="small" color="blue">{item.model}</Tag></div>
          <div className="ca-node-data"><span>实时 TPM <b>{flowAmount(item.tpm)}</b></span><span>产能 TPM <b>{flowAmount(item.capacity)}</b></span></div>
        </article>)}
        {!instances.length && <p className="ca-instance-empty">{cluster ? '该去向暂无实例数据' : '点击集群查看实例'}</p>}
      </section>
    </div>
  </div>;
}

