import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { customerModelDetails, filterAnalytics } from './analytics';
import { formatUsageNumber, usageMeter, usagePreset, usageValue, usageWindow } from './usage-analysis';
import './usage-analysis.css';
import './user-analysis.css';

const amount = value => value == null ? '—' : formatUsageNumber(value);

export default function CustomerUsageDetail({ state }) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const tenant = state.tenants.find(item => item.id === params.get('customer'));
  const today = usagePreset('today');
  const requested = { start: params.get('start'), end: params.get('end') };
  const { start, end } = usageWindow(requested) ? requested : today;
  const rows = tenant ? filterAnalytics(state, { start, end, tenant: [tenant.id] }) : [];
  const models = customerModelDetails(state, rows, start, end);
  const tokenModels = models.filter(model => model.unit === 'Token' && model.total != null);
  const tokenTotal = tokenModels.length ? tokenModels.reduce((sum, model) => sum + model.total, 0) : null;
  const requestUsage = row => {
    const meter = usageMeter(state.models.find(model => model.id === row.modelId), row);
    const value = usageValue(row, meter.fields);
    return value.complete ? `${amount(value.total)} ${meter.unit}` : '待确认';
  };
  const recent = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 10);
  return <div className="ua-page us-detail-page">
    {tenant && <>
      <Card className="ua-kpis"><CardContent><div className="ua-kpi-grid us-detail-kpis">
        <div className="ua-kpi"><div className="ua-kpi-label">Token 调用量</div><strong>{amount(tokenTotal)}</strong></div>
        <div className="ua-kpi"><div className="ua-kpi-label">模型调用次数</div><strong>{amount(rows.length)}</strong></div>
        <div className="ua-kpi"><div className="ua-kpi-label">调用模型数</div><strong>{new Set(rows.map(row => row.modelId)).size}</strong></div>
        <div className="ua-kpi"><div className="ua-kpi-label">调用 API Key 数</div><strong>{new Set(rows.map(row => row.keyId).filter(Boolean)).size}</strong></div>
      </div></CardContent></Card>
      <Card className="ua-panel"><CardHeader><CardTitle>模型用量明细</CardTitle><span className="us-detail-period">{start} — {end} · 共 {rows.length} 次调用</span></CardHeader><CardContent><div className="ua-table-scroll"><Table><TableHeader><TableRow>{['模型', '调用次数', '计量用量', 'HTTP 请求成功率', '区间峰值 TPM', '区间平均 TPM'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{models.map(model => <TableRow key={model.id}><TableCell>{model.model}</TableCell><TableCell>{amount(model.calls)}</TableCell><TableCell>{model.total == null ? '待确认' : `${amount(model.total)} ${model.unit}`}{model.pending > 0 && model.total != null ? ` · ${model.pending} 条待确认` : ''}</TableCell><TableCell>{model.success == null ? '—' : `${model.success.toFixed(2)}%`}</TableCell><TableCell>{amount(model.peakTpm)}</TableCell><TableCell>{amount(model.avgTpm)}</TableCell></TableRow>)}{!models.length && <TableRow><TableCell colSpan={6}>所选时间范围暂无调用记录</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
      <Card className="ua-panel"><CardHeader><CardTitle>最近调用</CardTitle></CardHeader><CardContent><div className="ua-table-scroll"><Table><TableHeader><TableRow>{['Request ID', '调用时间（北京时间）', '模型', 'API Key', '计量用量', '状态码'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{recent.map(row => <TableRow key={row.id}><TableCell>{row.requestId}</TableCell><TableCell>{new Date(row.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</TableCell><TableCell>{state.models.find(model => model.id === row.modelId)?.name || row.modelId}</TableCell><TableCell>{state.apiKeys.find(key => key.id === row.keyId)?.keyId || '—'}</TableCell><TableCell>{requestUsage(row)}</TableCell><TableCell>{row.httpStatus ?? '—'}</TableCell></TableRow>)}{!recent.length && <TableRow><TableCell colSpan={6}>所选时间范围暂无调用记录</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
    </>}
  </div>;
}
