const chartColor = {
  primary: '#4787FF',
  lightBlue: '#A3C3FF',
  teal: '#2DD4BF',
  success: '#0BB231',
  fail: '#E63A2E',
  orange: '#FF6B35',
  warning: '#F2A005',
  purple: '#8B5CF6',
  grey: '#9BA8C8',
  muted: '#CDD3E3'
}

const axisText = { color: '#5E5E65', fontSize: 12 }
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 })
const full = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const small = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 2 })
const formatNumber = (value) => (Math.abs(value) < 0.01 ? small : full).format(value)

export const formatMetric = (value, unit = '') => {
  if (!Number.isFinite(value)) return '—'
  const formatted = unit === '%' ? value.toFixed(2) : Math.abs(value) >= 10000 ? compact.format(value) : formatNumber(value)
  return unit === '%' ? formatted + '%' : formatted
}

const withUnit = (value, unit) => {
  if (!Number.isFinite(value)) return '—'
  return formatNumber(value) + (unit === '%' ? '%' : ` ${unit}`)
}

export function weightedMean(points, read, weight) {
  let total = 0
  let totalWeight = 0
  for (const point of points) {
    const value = read(point)
    const count = weight(point)
    if (!Number.isFinite(value) || !Number.isFinite(count) || count <= 0) continue
    total += value * count
    totalWeight += count
  }
  return totalWeight ? total / totalWeight : null
}

const legend = {
  type: 'scroll',
  right: 4,
  top: 0,
  itemWidth: 10,
  itemHeight: 8,
  itemGap: 16,
  icon: 'roundRect',
  textStyle: axisText
}

const grid = {
  top: 40,
  left: 8,
  right: 12,
  bottom: 8,
  outerBoundsMode: 'same',
  outerBoundsContain: 'axisLabel'
}
const valueAxis = (unit, max = unit === '%' ? 100 : undefined) => ({
  type: 'value',
  min: 0,
  max,
  splitNumber: 4,
  axisLabel: {
    ...axisText,
    formatter: (value) => (Math.abs(value) < 0.01 ? small.format(value) : compact.format(value)) + (unit === '%' ? '%' : '')
  },
  splitLine: { lineStyle: { color: '#E1E5EE', type: 'dashed' } }
})
const xyTooltip = (unit) => ({ trigger: 'axis', confine: true, valueFormatter: (value) => withUnit(value, unit) })
const categoryAxis = (data) => ({
  type: 'category',
  data,
  axisLine: { lineStyle: { color: '#CDD3E3' } },
  axisTick: { show: false },
  axisLabel: { ...axisText, hideOverlap: true }
})

export function lineCard({ key, title, unit, points, measures, yAxisMax }) {
  const times = points.map(({ time }) => time)
  const multiDay = times[0]?.slice(0, 10) !== times[times.length - 1]?.slice(0, 10)
  const series = measures.map(({ label, read, color }, index) => ({
    name: label,
    data: points.map(read),
    type: 'line',
    smooth: 0.25,
    symbol: points.filter(point => Number.isFinite(read(point))).length === 1 ? 'circle' : 'none',
    itemStyle: { color },
    lineStyle: { color, width: 2 },
    ...(index === 0 && {
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: color + '29' },
            { offset: 1, color: color + '00' }
          ]
        }
      }
    })
  }))
  const values = series[0].data.filter(Number.isFinite)
  const summary = values.length ? [values.reduce((total, item) => total + item, 0) / values.length, Math.max(...values), Math.min(...values)] : []
  const axis = categoryAxis(times)
  axis.boundaryGap = false
  axis.axisLabel.formatter = (time) => (multiDay || time.length <= 10 ? time.slice(5) : time.slice(11))

  return {
    key,
    title,
    unit,
    summary,
    hasData: series.some(item => item.data.some(Number.isFinite)),
    options: { grid, tooltip: xyTooltip(unit), legend, xAxis: axis, yAxis: valueAxis(unit, yAxisMax), series }
  }
}

export function ringCard({ key, title, unit, values, labels, totalLabel, colors, total }) {
  const firstNonzero = values.findIndex((value) => value > 0)
  const data = values.map((value, index) => ({
    name: labels[index],
    value,
    itemStyle: { color: colors[index] },
    ...(firstNonzero === index && {
      label: {
        show: true,
        position: 'center',
        formatter: `{caption|${totalLabel}}\n{value|${formatMetric(total)}}`,
        rich: {
          caption: { fontSize: 12, lineHeight: 22, color: '#7D7E87' },
          value: { fontSize: 23, lineHeight: 30, fontWeight: 600, color: '#1F1F21' }
        }
      }
    })
  }))

  return {
    key,
    title,
    unit,
    hasData: total > 0,
    options: {
      tooltip: { trigger: 'item', confine: true, valueFormatter: (value) => withUnit(value, unit) },
      legend: {
        ...legend,
        orient: 'vertical',
        itemGap: 9,
        top: 'middle',
        right: 10,
        selectedMode: false,
        formatter: (name) => {
          const item = data.find((entry) => entry.name === name)
          return `${name}   ${formatMetric(item.value)} (${((item.value / total) * 100).toFixed(2)}%)`
        }
      },
      series: [
        {
          type: 'pie',
          radius: ['53%', '73%'],
          center: ['32%', '50%'],
          label: { show: false },
          labelLine: { show: false },
          emphasis: { scale: false, label: { show: false } },
          data
        }
      ]
    }
  }
}

export function histogramCard({ title, unit, categories, series }) {
  return {
    key: 'histogram',
    title,
    unit,
    hasData: series.some(({ data }) => data.some((value) => value > 0)),
    options: {
      grid: { ...grid, top: 42 },
      tooltip: xyTooltip(unit),
      legend: { ...legend, selected: Object.fromEntries(series.map(({ label, visible }) => [label, visible])) },
      xAxis: categoryAxis(categories),
      yAxis: valueAxis(unit),
      series: series.map(({ label, data, color }) => ({
        type: 'bar',
        name: label,
        data,
        barMaxWidth: 22,
        itemStyle: { color, borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: axisText.color, fontSize: 10, formatter: ({ value }) => (value ? formatMetric(value) : '') },
        labelLayout: { hideOverlap: true }
      }))
    }
  }
}

export { chartColor }
