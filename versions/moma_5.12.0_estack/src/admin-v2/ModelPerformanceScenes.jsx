import { useId, useState } from 'react';
import { Tooltip } from 'radix-ui';
import { performanceSceneAxes } from './model-performance-data.mjs';
import './model-performance-scenes.css';

const { input, output } = performanceSceneAxes;
const countFormat = new Intl.NumberFormat('zh-CN');
const formatTpm = value => value == null ? '—'
  : value >= 10_000 ? (value / 10_000).toFixed(2) + '万' : value.toFixed(2);
const cellDirections = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

function bandLabel(axis, index) {
  const previous = axis[index - 1]?.limit;
  const limit = axis[index].limit;
  if (!Number.isFinite(limit)) return '>' + countFormat.format(previous);
  return previous == null ? '≤' + limit : countFormat.format(previous + 1) + '–' + countFormat.format(limit);
}

export default function ModelPerformanceScenes({ scenes }) {
  const titleId = useId();
  const [current, setCurrent] = useState('0-0');
  const [active, setActive] = useState(null);
  const maxCalls = Math.max(...scenes.cells.flat().map(cell => cell.calls));
  const activeCell = active ? scenes.cells[active[0]][active[1]] : null;

  function moveFocus(event) {
    const direction = cellDirections[event.key];
    const cell = event.target.dataset.sceneCell;
    if (!direction || !cell) return;
    const [row, column] = cell.split('-').map(Number);
    const nextRow = Math.max(0, Math.min(input.length - 1, row + direction[0]));
    const nextColumn = Math.max(0, Math.min(output.length - 1, column + direction[1]));
    event.preventDefault();
    const next = event.currentTarget.querySelector(`[data-scene-cell="${nextRow}-${nextColumn}"]`);
    if (next !== event.target) {
      next?.focus({ preventScroll: true });
      next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  return <section className="performance-chart-card performance-scenes" aria-labelledby={titleId}>
    <div className="performance-chart-heading">
      <h3 id={titleId}>输入 × 输出场景分布</h3>
      {scenes.sampleCount > 0 && <div className="performance-scenes-legend" role="img" aria-label="调用次数，颜色由低到高">
        <span>低</span>
        <span className="performance-scenes-scale">
          {activeCell && <span className="performance-scenes-marker"
            style={{ insetInlineStart: activeCell.calls / maxCalls * 100 + '%' }}>{activeCell.calls}</span>}
        </span>
      </div>}
    </div>
    {scenes.sampleCount > 0 ? <div className="performance-scenes-scroll" tabIndex={0} role="region" aria-labelledby={titleId}>
      <Tooltip.Provider delayDuration={0}>
        <table className="performance-scenes-grid" aria-labelledby={titleId} onKeyDown={moveFocus}>
          <thead><tr>
            <td/>
            {output.map((band, index) => <th key={band.label} scope="col" title={`输出 ${bandLabel(output, index)} Token`}>输出{band.label}</th>)}
          </tr></thead>
          <tbody>{scenes.cells.map((row, rowIndex) => <tr key={input[rowIndex].label}>
            <th scope="row" title={`输入 ${bandLabel(input, rowIndex)} Token`}>输入{input[rowIndex].label}</th>
            {row.map(({ calls, share, tpm }, columnIndex) => {
              const cell = `${rowIndex}-${columnIndex}`;
              const selected = active?.[0] === rowIndex && active[1] === columnIndex;
              const shade = (calls / maxCalls) ** 1.12 * 100;
              const rate = formatTpm(tpm);
              const show = () => setActive([rowIndex, columnIndex]);

              return <td key={output[columnIndex].label}>
                <Tooltip.Root open={selected} onOpenChange={open => {
                  if (open) show();
                  else setActive(previous => previous?.[0] === rowIndex && previous[1] === columnIndex ? null : previous);
                }}>
                  <Tooltip.Trigger type="button" data-scene-cell={cell} tabIndex={current === cell ? 0 : -1}
                    className={`performance-scene-cell${calls === maxCalls ? ' is-dark' : ''}`}
                    style={{ '--scene-shade': shade + '%' }} onFocus={() => setCurrent(cell)} onClick={event => {
                      event.preventDefault();
                      show();
                    }}>
                    <span><span className="performance-scenes-sr">调用次数 </span>{calls}</span>
                    <span className="performance-scene-metrics">
                      <span><span className="performance-scenes-sr">占比 </span>{share.toFixed(1)}%</span>
                      <span><span className="performance-scenes-sr">平均 TPM </span>{rate}</span>
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="performance-scenes-tooltip" side="bottom" align="end" sideOffset={5} collisionPadding={8}>
                      <div>输入{input[rowIndex].label} / 输出{output[columnIndex].label}</div>
                      <div>调用次数: {calls}</div>
                      <div>占比: {share.toFixed(2)}%</div>
                      <div>平均TPM: {rate}</div>
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </Tooltip.Provider>
    </div> : <div className="performance-chart-empty">暂无同时采集输入和输出 Token 的调用</div>}
  </section>;
}
