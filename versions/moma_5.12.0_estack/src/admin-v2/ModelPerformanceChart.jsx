import { useMemo, useState } from 'react';
import { IconMaximize } from './xa24/HaloIcons.jsx';
import { Button } from './xa24/HaloUI.jsx';
import { LegendScrollComponent } from 'echarts/components';
import { use } from 'echarts/core';
import { Chart } from '../components/AnalyticsCharts';
import { AdminModal } from './AdminOverlay';
import { formatMetric } from './model-performance-charts';

use(LegendScrollComponent);

const summaryLabels = ['平均', '最高', '最低'];

export default function ModelPerformanceChart({ chart, children }) {
  const [expanded, setExpanded] = useState(false);
  const histogram = chart.key === 'histogram';
  const option = useMemo(() => histogram ? {
    ...chart.options,
    grid: { ...chart.options.grid, top: 26 },
    legend: { ...chart.options.legend, show: false },
  } : chart.options, [chart.options, histogram]);
  const title = `${chart.title}（${chart.unit}）`;
  const close = () => setExpanded(false);

  return <section className={`performance-chart-card${histogram ? ' chart-wide' : ''}`}>
    <div className="performance-chart-heading">
      <h3>{chart.title} <span className="chart-unit">（{chart.unit}）</span></h3>
      <div className="performance-chart-actions">
        {children}
        {chart.hasData && <Button className="performance-expand-button" size="small" theme="borderless" type="tertiary"
          icon={<IconMaximize aria-hidden="true" />} aria-label={`放大${chart.title}`} title="放大图表"
          onClick={() => setExpanded(true)} />}
      </div>
    </div>
    {chart.summary?.length > 0 && <div className="performance-chart-summary">
      {chart.summary.map((value, index) => <span key={summaryLabels[index]}>
        {summaryLabels[index]} <strong>{formatMetric(value, chart.unit)}</strong>
      </span>)}
    </div>}
    {chart.hasData
      ? <Chart option={option} label={title} height={histogram ? 228 : 206} />
      : <div className="performance-chart-empty">暂无图表数据</div>}
    {expanded && chart.hasData && <AdminModal visible centered closeOnEsc className="model-performance-popup"
      title={title} width="min(880px, calc(100vw - 32px))" onCancel={close}
      footer={<Button theme="light" onClick={close}>关闭</Button>}>
      <Chart option={chart.options} label={title} height={380} />
    </AdminModal>}
  </section>;
}
