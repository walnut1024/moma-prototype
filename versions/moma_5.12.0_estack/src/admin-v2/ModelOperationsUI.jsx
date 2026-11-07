import AdminCollapsePanel from './AdminCollapsePanel';
import { scopeTenants } from './service-commercial';
import { activeAdmin } from '../linked-accounts.mjs';
import { readLinkedState } from '../service-access.mjs';
import { Children, Fragment, isValidElement, useEffect, useRef, useState } from 'react';
import { Button, Collapse, Input, Pagination as SemiPagination, Table, TextArea, Toast } from '@douyinfe/semi-ui';
import { IconDelete, IconPlus, IconSearch } from '@douyinfe/semi-icons';
import AdminPageHeading from './AdminPageHeading';
import { CopyId, Modal as ServiceModal, Notice, Status, serviceOperationsUi } from './ServiceUI';
import { Choice, Field, MultiChoice } from './ModelMetadataForm';
import { priceItems, moneyDisplay } from './model-management';
import { PROVIDER_TYPES, PROTOCOLS } from './provider-management';
import { connectionTestPassed } from './connection-state';
import { canMutate } from './store';
import { modelOperationTarget } from './model-operation-history';
import './model-management.css';
import './model-operations.css';
import './semi-onboarding.css';

export { Notice, Status, CopyId };
export function Heading({ title, description, children }) {
  return <AdminPageHeading title={title} description={description}>
    {children && <div className="mo-actions">{children}</div>}
  </AdminPageHeading>;
}
export function SearchBox({ value, onChange, placeholder = '搜索模型展示名 / 编码 / 作者' }) { return <Input className="mo-search" prefix={<IconSearch aria-hidden="true"/>} aria-label={placeholder} placeholder={placeholder} value={value} onChange={onChange}/>; }
export function GridTable({ headings, children, empty, emptyMessage = '没有符合条件的记录', className = '' }) {
  const rows = Children.toArray(children).filter(child => isValidElement(child) && child.type === Row);
  const cellsOf = row => Children.toArray(row.props.children).flatMap(node => {
    if (!isValidElement(node)) return [];
    if (node.type === Fragment) return cellsOf({ props: { children: node.props.children } });
    return node.type === Cell ? [{ children: node.props.children, colSpan: node.props.colSpan, rowSpan: node.props.rowSpan, className: node.props.className }] : [];
  });
  // HTML 表格列游标算法：单元格顺序填充，rowSpan/colSpan 占位让后续行跳过对应列
  const occupied = [];
  const grid = rows.map(() => ({}));
  rows.forEach((row, r) => {
    occupied[r] = occupied[r] || [];
    let cursor = 0;
    for (const cell of cellsOf(row)) {
      while (occupied[r][cursor]) cursor++;
      const span = cell.colSpan ?? 1, depth = cell.rowSpan ?? 1;
      for (let i = 0; i < depth; i++) for (let j = 0; j < span; j++) { occupied[r + i] = occupied[r + i] || []; occupied[r + i][cursor + j] = true; }
      grid[r][cursor] = cell;
      cursor += span;
    }
  });
  const dataSource = rows.map((row, index) => ({ key: row.key ?? index, grid: grid[index] }));
  const columns = headings.map((title, index) => ({ title, dataIndex: String(index), render: (_, record) => {
    const cell = record.grid?.[index];
    if (!cell) return { children: null, props: { colSpan: 0 } };
    const props = { ...(cell.colSpan != null ? { colSpan: cell.colSpan } : {}), ...(cell.rowSpan != null ? { rowSpan: cell.rowSpan } : {}), ...(cell.className ? { className: cell.className } : {}) };
    return { children: cell.children, props };
  } }));
  return <div className="mo-table-scroll"><Table size="small" className={`mo-table ${className}`} columns={columns} dataSource={dataSource} pagination={false} empty={empty ? emptyMessage : ' '}/></div>;
}
export function Row({ children }) { return <>{children}</>; }
export function Cell({ children }) { return <>{children}</>; }
export function Pagination({ count, page, setPage, size = 10 }) { return <SemiPagination className="mo-pagination" total={count} pageSize={size} currentPage={page} onPageChange={setPage} showTotal size="small"/>; }
export function Disclosure({ title, children, defaultOpen = false, className }) {
  return <Collapse className={className} defaultActiveKey={defaultOpen ? ['content'] : []} keepDOM>
    <AdminCollapsePanel itemKey="content" header={title}>{children}</AdminCollapsePanel>
  </Collapse>;
}
export function Price({ model, price }) {
  const items = priceItems(price, model);
  return items.length ? <Disclosure className="mo-price" title={`${items.length} 个计费项`}>
    {items.map((item, index) => <small key={index}>{item.name}{item.condition ? '（' + item.condition + '）' : ''}：{item.currency || 'CNY'} {moneyDisplay(item.amount)} / {item.unit}</small>)}
  </Disclosure> : <span className="mo-muted">未配置</span>;
}
export function Modal({ title, description, children, onClose, wide, drawer = false, drawerSide = 'right', footer, className = '' }) { return <ServiceModal title={title} description={description ?? '请核对当前配置后继续。'} onClose={onClose} wide={wide} drawer={drawer} drawerSide={drawerSide} footer={footer} className={className}>{children}</ServiceModal>; }
export function useOperations({ state, transact, conflict, reload, notify = message => Toast.success(message), renderLeaveDialog = serviceOperationsUi.renderLeaveDialog }, base) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [dirty, setDirty] = useState(false), [leave, setLeave] = useState(null), [error, setError] = useState('');
  const running = useRef(false);
  const accepted = useRef(location.hash), bypass = useRef(false), dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const proceed = callback => { if (dirtyRef.current) setLeave(() => callback); else callback(); };
  useEffect(() => {
    const sync = () => { const next = location.hash; if (dirtyRef.current && !bypass.current) { history.replaceState(null, '', accepted.current); setLeave(() => () => { accepted.current = next; location.hash = next; setParams(new URLSearchParams(next.split('?')[1] || '')); }); } else { accepted.current = next; setParams(new URLSearchParams(next.split('?')[1] || '')); } };
    const guard = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const click = event => { const target = event.target.closest('.v2-sidebar button, .v2-sidebar [role="tab"], .v2-sidebar a, [data-model-list-breadcrumb], .mm-breadcrumb-link'); if (dirtyRef.current && target && !bypass.current) { event.preventDefault(); event.stopPropagation(); setLeave(() => () => { bypass.current = true; target.click(); bypass.current = false; }); } };
    addEventListener('hashchange', sync); addEventListener('beforeunload', guard); document.addEventListener('click', click, true);
    return () => { removeEventListener('hashchange', sync); removeEventListener('beforeunload', guard); document.removeEventListener('click', click, true); };
  }, []);
  const go = (patch, options = {}) => {
    const navigate = () => { const next = new URLSearchParams(options.reset ? undefined : params); Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value)); const hash = `#/admin-2/${options.base || base}${next.size ? '?' + next : ''}`; accepted.current = hash; setError(''); setDirty(false); dirtyRef.current = false; if (options.replace) history.replaceState(null, '', hash); else { location.hash = hash; if (!options.preserveScroll) window.scrollTo(0, 0); } setParams(next); };
    if (options.saved) navigate(); else proceed(navigate);
  };
  const isCurrent = () => { if(state.cloudOperations)return !conflict && canMutate(state.currentRole,{type:'modelOperations'}); try { const fresh = readLinkedState(); const account = activeAdmin(fresh); return fresh.revision === state.revision && account.id === state.adminSession?.accountId && canMutate(account.role, { type: 'modelOperations' }); } catch { return false; } };
  const can = !conflict && !state.storageError && isCurrent();
  const run = async (operation, data = {}, modelId, legacy = false) => { if(running.current)return null;running.current=true;try { if (!can) throw new Error(conflict ? '请先载入最新数据，再保存配置；当前输入保留' : '当前无法保存，请检查角色权限和数据状态'); const next = await transact({ type: legacy ? 'modelOperation' : 'modelOperations', operation, modelId, data }); setError(''); setDirty(false); dirtyRef.current = false; notify(next.audits[0].action + '成功'); return next; } catch (issue) {
    let message = issue instanceof Error ? issue.message : String(issue);
    const target = modelOperationTarget(state, modelId, data);
    if (can && isCurrent() && target && operation !== 'recordFailedOperation') {
      try { await transact({ type: 'modelOperations', operation: 'recordFailedOperation', modelId: target, data: { operation, reason: message.slice(0, 500) } }); }
      catch { message += '；失败记录未能保存，当前输入保留。'; }
    }
    setError(message); return null;
  } finally { running.current=false; } };
  const cancelLeave = () => setLeave(null);
  const discardLeave = () => { const next = leave; setLeave(null); setDirty(false); dirtyRef.current = false; next(); };
  const leaveDialog = leave && (renderLeaveDialog ? renderLeaveDialog({ cancel: cancelLeave, discard: discardLeave }) : null);

  return { params, go, proceed, dirty: setDirty, hasUnsaved: () => dirtyRef.current, can, isCurrent, run, error, setError, leaveDialog, conflict, reload };
}
export const emptyProvider = () => ({ name: '', code: '', sourceType: 'thirdParty', contact: '', contactInfo: '', description: '' });
export function ProviderFields({ value, onChange, disabled, editing = false, children }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  const descriptionLength = [...value.description.trim()].length;
  return <div className="mo-form-grid supplier-profile-fields">
    <Field label="服务商名称 *"><Input required aria-label="服务商名称" value={value.name} disabled={disabled} onChange={value => set('name', value)}/></Field>
    <Field label="英文编码 *" hint="2–32 位小写字母、数字或连字符，字母开头；创建后固定。"><Input required aria-label="英文编码" placeholder="例如 cmcc" pattern="[a-z][a-z0-9-]{1,31}" autoCapitalize="none" autoComplete="off" spellCheck={false} value={value.code} disabled={disabled} readOnly={editing} onChange={value => set('code', value.toLowerCase())}/></Field>
    <Field label="供给类型 *"><Choice label="供给类型" value={value.sourceType} options={Object.entries(PROVIDER_TYPES)} disabled={disabled || editing} onChange={value => set('sourceType', value)}/></Field><div/>
    {children}
    <Field label="联系人（选填）"><Input aria-label="联系人" value={value.contact} disabled={disabled} onChange={value => set('contact', value)}/></Field>
    <Field label="联系人号码/邮箱（选填）"><Input aria-label="联系人号码/邮箱" value={value.contactInfo || ''} disabled={disabled} onChange={value => set('contactInfo', value)}/></Field>
    <div className="mo-span supplier-description"><Field label="备注（选填）" hint="最多 2000 字。"><TextArea aria-label="备注" aria-describedby="supplier-description-count" aria-invalid={descriptionLength > 2000} maxLength={2000} value={value.description} disabled={disabled} rows={4} onChange={value => set('description', value)}/></Field><small id="supplier-description-count">{descriptionLength} / 2000 字</small></div>
  </div>;
}
export const emptyConnection = () => ({ name: '', protocol: 'OpenAI', baseUrl: '', credentialRef: '', capacity: '', timeoutSeconds: 60, apiKeys: [], keyInputs: [{ id: crypto.randomUUID(), value: '' }] });
export function ConnectionFields({ value, onChange, disabled, optionalKey = false, prefix = '' }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  return <div className="mo-form-grid supplier-connection-fields">
    <Field label="协议 *"><Choice label={prefix + '协议'} value={value.protocol} options={PROTOCOLS.map(value => [value, value])} disabled={disabled} onChange={value => set('protocol', value)}/></Field>
    <Field label="Base URL *"><Input required aria-label={prefix + 'Base URL'} placeholder="https://api.example.com/v1" value={value.baseUrl} disabled={disabled} onChange={value => set('baseUrl', value)}/></Field>
    <ConnectionApiKeys value={value} onChange={onChange} disabled={disabled} optionalKey={optionalKey} prefix={prefix}/>
  </div>;
}
export function ConnectionApiKeys({ value, onChange, disabled, optionalKey = false, prefix = '' }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  const keys = value.apiKeys || [], inputs = value.keyInputs || [];
  return <fieldset className="mo-span supplier-connection-key-group"><legend>API 密钥{optionalKey ? '（选填）' : ' *'}</legend>
      {keys.map((key, index) => <div className="supplier-key-row" key={key.id}><Field label={'已配置 API 密钥 ' + (index + 1)}><Input aria-label={prefix + '已配置 API 密钥 ' + (index + 1)} readOnly value={key.maskedKey}/></Field><Button icon={<IconDelete aria-hidden="true"/>} theme="borderless" size="small" disabled={disabled} aria-label={prefix + '移除已配置 API 密钥 ' + (index + 1)} onClick={() => set('apiKeys', keys.filter(item => item.id !== key.id))}/></div>)}
      {value.credentialRef && <div className="supplier-key-row"><span>已配置凭证引用</span><Button type="tertiary" theme="borderless" disabled={disabled} onClick={() => set('credentialRef', '')}>移除凭证</Button></div>}
      {inputs.map((row, index) => <div className="supplier-key-row" key={row.id}><Field label={'API 密钥 ' + (keys.length + index + 1)}><Input aria-label={prefix + 'API 密钥 ' + (index + 1)} mode="password" autoComplete="new-password" maxLength={512} required={!optionalKey && !keys.length && !value.credentialRef && index === 0} placeholder="请输入 API 密钥" value={row.value} disabled={disabled} onChange={value => set('keyInputs', inputs.map(item => item.id === row.id ? { ...item, value } : item))}/></Field><Button icon={<IconDelete aria-hidden="true"/>} theme="borderless" size="small" disabled={disabled || inputs.length === 1} aria-label={prefix + '移除 API 密钥 ' + (index + 1)} onClick={() => set('keyInputs', inputs.filter(item => item.id !== row.id))}/></div>)}
      <Button type="tertiary" theme="borderless" disabled={disabled || keys.length + inputs.length >= 20} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={() => set('keyInputs', [...inputs, { id: crypto.randomUUID(), value: '' }])}>添加 API 密钥</Button>
      <p className="supplier-key-hint">{optionalKey ? '自有推理服务可不配置 API 密钥。' : '第三方推理服务至少配置一个 API 密钥。'}每个连接最多 20 个，保存后仅展示脱敏值。</p>
    </fieldset>;
}
export function ScopeFields({ state, openScope, tenantIds = [], onChange, disabled }) {
  const tenants=scopeTenants(state), tenantLabel=tenant=>tenant.name+' · '+tenant.id;
  const unavailable=tenantIds.filter(id=>!tenants.some(row=>row.id===id));
  return <div className="mo-form-grid"><Field label="客户开放范围 *"><Choice label="客户范围" value={openScope || 'unselected'} disabled={disabled} options={[[ 'unselected','请选择开放范围'],['all','全部有效客户'],['selected','指定客户']]} onChange={value=>onChange(value,tenantIds)}/></Field>{openScope==='selected' && <Field label="选择客户 *"><MultiChoice label="客户" groups={[[ '政企客户',tenants.filter(row=>row.type!=='个人').map(tenantLabel) ],[ '个人客户',tenants.filter(row=>row.type==='个人').map(tenantLabel) ]]} choices={tenants.map(tenantLabel)} value={tenants.filter(tenant=>tenantIds.includes(tenant.id)).map(tenantLabel)} disabled={disabled} onChange={names=>onChange('selected',tenants.filter(tenant=>names.includes(tenantLabel(tenant))).map(tenant=>tenant.id))}/>{unavailable.length>0 && <Notice error>有 {unavailable.length} 个客户已停用或删除，请重新选择有效客户。<Button type="tertiary" theme="borderless" disabled={disabled} onClick={()=>onChange('selected',tenantIds.filter(id=>!unavailable.includes(id)))}>移除无效客户</Button></Notice>}</Field>}</div>;
}
export function ValidationNote({ endpoint, supply }) { return <div className="mo-stack"><Status good={connectionTestPassed(endpoint) && supply?.validationStatus === '通过'}>{!connectionTestPassed(endpoint) ? '连接待验证' : supply?.validationStatus === '通过' ? '已通过' : supply?.validationStatus || '待验证'}</Status><small>{supply?.verifiedAt ? new Date(supply.verifiedAt).toLocaleString('zh-CN') : '尚无验证记录'}</small></div>; }
