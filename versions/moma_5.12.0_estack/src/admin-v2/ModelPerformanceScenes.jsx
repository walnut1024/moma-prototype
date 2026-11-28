import { useId } from 'react';
import { performanceSceneAxes } from './model-performance-data.mjs';
import './model-performance-scenes.css';

const { input, output } = performanceSceneAxes;
const countFormat = new Intl.NumberFormat('zh-CN');
const tpmFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatTpm = value => value == null ? '—'
  : value >= 10_000 ? tpmFormat.format(value / 10_000) + '万' : tpmFormat.format(value);

function bandLabel(axis, index) {
  const previous = axis[index - 1]?.limit;
  const limit = axis[index].limit;
  if (!Number.isFinite(limit)) return '>' + countFormat.format(previous);
  return previous == null ? '≤' + limit : countFormat.format(previous + 1) + '–' + countFormat.format(limit);
}

export default function ModelPerformanceScenes({ scenes }) {
  const titleId = useId();
  const maxCalls = Math.max(...scenes.cells.flat().map(cell => cell.calls));

  return <section className="performance-chart-card performance-scenes" aria-labelledby={titleId}>
    <div className="performance-chart-heading">
      <h3 id={titleId}>输入 × 输出场景分布</h3>
      {scenes.sampleCount > 0 && <div className="performance-scenes-legend">
        <span>调用次数</span><span>低</span><span className="performance-scenes-scale" aria-hidden="true"/><span>高</span>
      </div>}
    </div>
    {scenes.sampleCount > 0 ? <div className="performance-scenes-scroll" tabIndex={0} role="region" aria-labelledby={titleId}>
      <table className="performance-scenes-grid" aria-labelledby={titleId}>
        <thead><tr>
          <td/>
          {output.map((band, index) => <th key={band.label} scope="col" title={`输出 ${bandLabel(output, index)} Token`}>输出{band.label}</th>)}
        </tr></thead>
        <tbody>{scenes.cells.map((row, rowIndex) => <tr key={input[rowIndex].label}>
          <th scope="row" title={`输入 ${bandLabel(input, rowIndex)} Token`}>输入{input[rowIndex].label}</th>
          {row.map(({ calls, share, tpm }, columnIndex) => {
            const shade = calls ? 9 + 91 * calls / maxCalls : 4;
            const count = countFormat.format(calls);
            const percent = share.toFixed(2) + '%';
            const rate = formatTpm(tpm);
            const detail = [
              `输入 ${bandLabel(input, rowIndex)} / 输出 ${bandLabel(output, columnIndex)} Token`,
              `调用次数 ${count}`,
              `占比 ${percent}（输入与输出均已采集的调用）`,
              `平均 TPM ${rate}`,
            ].join('\n');

            return <td key={output[columnIndex].label} title={detail}>
              <div className={`performance-scene-cell${shade >= 86 ? ' is-dark' : ''}`} style={{ '--scene-shade': shade + '%' }}>
                <span><span className="performance-scenes-sr">调用次数 </span>{count}</span>
                <span className="performance-scene-metrics">
                  <span><span className="performance-scenes-sr">占比 </span>{percent}</span>
                  <span><span className="performance-scenes-sr">平均 TPM </span>{rate}</span>
                </span>
              </div>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div> : <div className="performance-chart-empty">暂无同时采集输入和输出 Token 的调用</div>}
  </section>;
}
