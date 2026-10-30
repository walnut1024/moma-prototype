import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Copy, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Choice, Field, MultiChoice } from './ModelMetadataForm';
import { priceItems, moneyDisplay } from './model-management';
import { PROVIDER_TYPES, PROTOCOLS } from './provider-management';
import { connectionTestPassed } from './connection-state';
import { canMutate } from './store';
import './model-management.css';
import './model-operations.css';

export function Heading({ title, description, children }) { return <div className="mo-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="mo-actions">{children}</div></div>; }
export function Status({ children, good = false }) { return <span className={`mo-status ${good ? 'good' : ''}`}>{children}</span>; }
export function Notice({ children, error = false }) { return <div className={`mo-notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error ? <AlertCircle/> : <CheckCircle2/>}<div>{children}</div></div>; }
export function SearchBox({ value, onChange, placeholder = '搜索模型名称 / 编码 / 作者' }) { return <div className="mo-search"><Search/><Input aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)}/></div>; }
export function GridTable({ headings, children, empty, emptyMessage = '没有符合条件的记录', className = '' }) { return <div className="mo-table-scroll"><Table className={`mo-table ${className}`}><TableHeader><TableRow>{headings.map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{children}</TableBody></Table>{empty && <div className="mo-empty" role="status">{emptyMessage}</div>}</div>; }
export { TableRow as Row, TableCell as Cell };
export function Pagination({ count, page, setPage, size = 10 }) { const pages = Math.max(1, Math.ceil(count / size)); return <div className="mo-pagination"><span>共 {count} 条</span><span>{size} 条/页</span><Button size="icon" variant="outline" aria-label="上一页" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft/></Button><span>{page} / {pages}</span><Button size="icon" variant="outline" aria-label="下一页" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight/></Button></div>; }
export function CopyId({ value, label = '调用 Model ID' }) { return <div className="mo-copy"><code>{value}</code><Button type="button" size="icon" variant="ghost" aria-label={`复制 ${value}`} onClick={async () => { try { await navigator.clipboard.writeText(value); toast.success(`${label} 已复制`); } catch { toast.error('复制失败，请选择文本复制'); } }}><Copy/></Button></div>; }
export function Price({ model, price }) { const items = priceItems(price, model); return items.length ? <details className="mo-price"><summary>{items.length} 个计费项</summary>{items.map((item, index) => <small key={index}>{item.name}{item.condition ? '（' + item.condition + '）' : ''}：{item.currency || 'CNY'} {moneyDisplay(item.amount)} / {item.unit}</small>)}</details> : <span className="mo-muted">未配置</span>; }
export function Modal({ title, description, children, onClose, wide, drawer = false }) { return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className={`mo-dialog ${wide ? 'wide' : ''} ${drawer ? 'mo-drawer' : ''}`} showCloseButton={false}><div className="mo-dialog-header"><div><DialogTitle>{title}</DialogTitle><DialogDescription>{description || '请核对当前配置后继续。'}</DialogDescription></div><Button variant="ghost" size="icon" aria-label="关闭" onClick={onClose}><X/></Button></div><div className="mo-dialog-body">{children}</div></DialogContent></Dialog>; }
export function useOperations({ state, transact, conflict, reload }, base) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [dirty, setDirty] = useState(false), [leave, setLeave] = useState(null), [error, setError] = useState('');
  const accepted = useRef(location.hash), bypass = useRef(false), dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const proceed = callback => { if (dirtyRef.current) setLeave(() => callback); else callback(); };
  useEffect(() => {
    const sync = () => { const next = location.hash; if (dirtyRef.current && !bypass.current) { history.replaceState(null, '', accepted.current); setLeave(() => () => { accepted.current = next; location.hash = next; setParams(new URLSearchParams(next.split('?')[1] || '')); }); } else { accepted.current = next; setParams(new URLSearchParams(next.split('?')[1] || '')); } };
    const guard = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const click = event => { const target = event.target.closest('.v2-sidebar button, .v2-sidebar a, [data-model-list-breadcrumb], .mm-breadcrumb-link'); if (dirtyRef.current && target && !bypass.current) { event.preventDefault(); event.stopPropagation(); setLeave(() => () => { bypass.current = true; target.click(); bypass.current = false; }); } };
    addEventListener('hashchange', sync); addEventListener('beforeunload', guard); document.addEventListener('click', click, true);
    return () => { removeEventListener('hashchange', sync); removeEventListener('beforeunload', guard); document.removeEventListener('click', click, true); };
  }, []);
  const go = (patch, options = {}) => {
    const navigate = () => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value)); const hash = `#/admin-2/${options.base || base}${next.size ? '?' + next : ''}`; accepted.current = hash; setError(''); setDirty(false); dirtyRef.current = false; if (options.replace) history.replaceState(null, '', hash); else { location.hash = hash; if (!options.preserveScroll) window.scrollTo(0, 0); } setParams(next); };
    if (options.saved) navigate(); else proceed(navigate);
  };
  const can = !conflict && !state.storageError && canMutate(state.currentRole, { type: 'modelOperations' });
  const run = (operation, data = {}, modelId, legacy = false) => { try { if (!can) throw new Error(conflict ? '请先载入最新数据，再保存配置；当前输入保留' : '当前无法保存，请检查角色权限和数据状态'); const next = transact({ type: legacy ? 'modelOperation' : 'modelOperations', operation, modelId, data }); setError(''); setDirty(false); dirtyRef.current = false; toast.success(next.audits[0].action + '成功'); return next; } catch (issue) { setError(issue.message); return null; } };
  const leaveDialog = leave && <Modal title="有未保存的配置" description="放弃修改后继续离开，已保存的数据保留。" onClose={() => setLeave(null)}><div className="mo-footer"><Button variant="outline" onClick={() => setLeave(null)}>继续编辑</Button><Button onClick={() => { const next = leave; setLeave(null); setDirty(false); dirtyRef.current = false; next(); }}>放弃修改</Button></div></Modal>;
  return { params, go, proceed, dirty: setDirty, hasUnsaved: () => dirtyRef.current, can, run, error, setError, leaveDialog, conflict, reload };
}
export const emptyProvider = () => ({ name: '', code: '', sourceType: 'thirdParty', contact: '', contactInfo: '', description: '' });
export function ProviderFields({ value, onChange, disabled, editing = false, children }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  const descriptionLength = [...value.description.trim()].length;
  return <div className="mo-form-grid supplier-profile-fields">
    <Field label="供应商名称 *"><Input required aria-label="供应商名称" value={value.name} disabled={disabled} onChange={e => set('name', e.target.value)}/></Field>
    <Field label="英文编码 *" hint="2–32 位小写字母、数字或连字符，字母开头；创建后固定。"><Input required aria-label="英文编码" placeholder="例如 cmcc" pattern="[a-z][a-z0-9-]{1,31}" autoCapitalize="none" autoComplete="off" spellCheck={false} value={value.code} disabled={disabled} readOnly={editing} onChange={e => set('code', e.target.value.toLowerCase())}/></Field>
    <Field label="供给类型 *"><Choice label="供给类型" value={value.sourceType} options={Object.entries(PROVIDER_TYPES)} disabled={disabled || editing} onChange={value => set('sourceType', value)}/></Field><div/>
    {children}
    <Field label="联系人（选填）"><Input aria-label="联系人" value={value.contact} disabled={disabled} onChange={e => set('contact', e.target.value)}/></Field>
    <Field label="联系人号码/邮箱（选填）"><Input aria-label="联系人号码/邮箱" value={value.contactInfo || ''} disabled={disabled} onChange={e => set('contactInfo', e.target.value)}/></Field>
    <div className="mo-span supplier-description"><Field label="备注（选填）" hint="最多 2000 字。"><Textarea aria-label="备注" aria-describedby="supplier-description-count" aria-invalid={descriptionLength > 2000} maxLength={2000} value={value.description} disabled={disabled} rows={4} onChange={e => set('description', e.target.value)}/></Field><small id="supplier-description-count">{descriptionLength} / 2000 字</small></div>
  </div>;
}
export const emptyConnection = () => ({ name: '', protocol: 'OpenAI', baseUrl: '', credentialRef: '', capacity: '', timeoutSeconds: 60, apiKeys: [], keyInputs: [{ id: crypto.randomUUID(), value: '' }] });
export function ConnectionFields({ value, onChange, disabled, optionalKey = false, prefix = '' }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  return <div className="mo-form-grid supplier-connection-fields">
    <Field label="协议 *"><Choice label={prefix + '协议'} value={value.protocol} options={PROTOCOLS.map(value => [value, value])} disabled={disabled} onChange={value => set('protocol', value)}/></Field>
    <Field label="Base URL *"><Input required aria-label={prefix + 'Base URL'} placeholder="https://api.example.com/v1" value={value.baseUrl} disabled={disabled} onChange={e => set('baseUrl', e.target.value)}/></Field>
    <ConnectionApiKeys value={value} onChange={onChange} disabled={disabled} optionalKey={optionalKey} prefix={prefix}/>
  </div>;
}
export function ConnectionApiKeys({ value, onChange, disabled, optionalKey = false, prefix = '' }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  const keys = value.apiKeys || [], inputs = value.keyInputs || [];
  return <fieldset className="mo-span supplier-connection-key-group"><legend>API 密钥{optionalKey ? '（选填）' : ' *'}</legend>
      {keys.map((key, index) => <div className="supplier-key-row" key={key.id}><Field label={'已配置 API 密钥 ' + (index + 1)}><Input aria-label={prefix + '已配置 API 密钥 ' + (index + 1)} readOnly value={key.maskedKey}/></Field><Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={prefix + '移除已配置 API 密钥 ' + (index + 1)} onClick={() => set('apiKeys', keys.filter(item => item.id !== key.id))}><Trash2/></Button></div>)}
      {value.credentialRef && <div className="supplier-key-row"><span>已配置凭证引用</span><Button type="button" variant="link" disabled={disabled} onClick={() => set('credentialRef', '')}>移除凭证</Button></div>}
      {inputs.map((row, index) => <div className="supplier-key-row" key={row.id}><Field label={'API 密钥 ' + (keys.length + index + 1)}><Input aria-label={prefix + 'API 密钥 ' + (index + 1)} type="password" autoComplete="new-password" maxLength={512} required={!optionalKey && !keys.length && !value.credentialRef && index === 0} placeholder="请输入 API 密钥" value={row.value} disabled={disabled} onChange={e => set('keyInputs', inputs.map(item => item.id === row.id ? { ...item, value: e.target.value } : item))}/></Field><Button type="button" variant="ghost" size="icon" disabled={disabled || inputs.length === 1} aria-label={prefix + '移除 API 密钥 ' + (index + 1)} onClick={() => set('keyInputs', inputs.filter(item => item.id !== row.id))}><Trash2/></Button></div>)}
      <Button type="button" variant="link" disabled={disabled || keys.length + inputs.length >= 20} onClick={() => set('keyInputs', [...inputs, { id: crypto.randomUUID(), value: '' }])}><Plus data-icon="inline-start"/>添加 API 密钥</Button>
      <p className="supplier-key-hint">{optionalKey ? '自有推理服务可不配置 API 密钥。' : '第三方推理服务至少配置一个 API 密钥。'}每个连接最多 20 个，保存后仅展示脱敏值。</p>
    </fieldset>;
}
export function ScopeFields({ state, openScope, tenantIds, onChange, disabled }) { return <div className="mo-form-grid"><Field label="允许订购的租户"><Choice label="订购范围" value={openScope} disabled={disabled} options={[[ 'all', '全部租户'], ['selected', '指定租户']]} onChange={value => onChange(value, tenantIds)}/></Field>{openScope === 'selected' && <Field label="选择租户"><MultiChoice label="选择租户" choices={state.tenants.map(tenant => tenant.name)} value={state.tenants.filter(tenant => tenantIds.includes(tenant.id)).map(tenant => tenant.name)} disabled={disabled} onChange={names => onChange('selected', state.tenants.filter(tenant => names.includes(tenant.name)).map(tenant => tenant.id))}/></Field>}</div>; }
export function ValidationNote({ endpoint, supply }) { return <div className="mo-stack"><Status good={connectionTestPassed(endpoint) && supply?.validationStatus === '通过'}>{!connectionTestPassed(endpoint) ? '连接待验证' : supply?.validationStatus === '通过' ? '已通过' : supply?.validationStatus || '待验证'}</Status><small>{supply?.verifiedAt ? new Date(supply.verifiedAt).toLocaleString('zh-CN') : '尚无验证记录'}</small></div>; }
