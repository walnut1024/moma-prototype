import { useState } from 'react';
import { Button, Input, Select, Space, Typography } from '@douyinfe/semi-ui';
import { AdminModal } from './AdminOverlay';
import { Field, Notice } from './ServiceUI';
import { excelOffers, protocolLabels, validateOffer } from './supplier-offer-fields';
import { modelTypeLabel } from '../model-types.mjs';
import { PROTOCOL_ENDPOINT_LABEL, protocolAndEndpoint, workbenchProtocolLabel } from './workbench-protocol';
const blank = () => ({ upstream:'', protocol:protocolLabels[0], url:'' });

export function SupplierOfferEditor({ offer, provider, ops, close }) {
  const [draft, setDraft] = useState(() => ({ ...offer, bindings:offer.bindings.length ? offer.bindings : [blank()] }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bindings = value => setDraft({ ...draft, bindings:value });
  const change = (index, patch) => bindings(draft.bindings.map((row,i) => i === index ? { ...row,...patch } : row));
  async function save() {
    setBusy(true);
    try {
      validateOffer(draft, provider);
      if (await ops.run('supplierOffersSave', { providerId:provider.id, offers:[draft] })) close();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <AdminModal visible title="编辑供应模型" width={800} onCancel={() => !busy && close()} onOk={save} okText="保存" confirmLoading={busy}>
    <Field label="模型展示名称"><Input value={draft.name} onChange={name => setDraft({ ...draft,name })}/></Field>
    <Field label="模型编码">{draft.code}</Field><Field label="模型类型">{modelTypeLabel(draft.type)}</Field>
    {draft.bindings.map((row,i) => <div key={i}>
      <Field label="上游模型 ID"><Input value={row.upstream} onChange={upstream => change(i,{ upstream })}/></Field>
      <Field label="模型接口格式"><Select value={row.protocol} optionList={protocolLabels.map(value => ({ value,label:workbenchProtocolLabel(value) }))} onChange={protocol => change(i,{ protocol })}/></Field>
      <Field label="完整请求地址"><Input value={row.url} onChange={url => change(i,{ url })}/></Field>
      <Field label={PROTOCOL_ENDPOINT_LABEL}>{protocolAndEndpoint(row.protocol,row.url)}</Field>
      <Button disabled={draft.bindings.length === 1} onClick={() => bindings(draft.bindings.filter((_,j) => j !== i))}>移除此地址</Button>
    </div>)}
    <Button onClick={() => bindings([...draft.bindings,blank()])}>添加接口格式地址</Button>
    {(error || ops.error) && <Notice error>{error || ops.error}</Notice>}
  </AdminModal>;
}

export function SupplierOfferImport({ provider, ops, done }) {
  const [offers,setOffers] = useState([]), [busy,setBusy] = useState(false), [error,setError] = useState('');
  async function read(file) {
    setOffers([]); setError('');
    if (!file) return;
    setBusy(true);
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 10*1024*1024) throw Error('请选择 10 MB 以内的 .xlsx 文件');
      const { readSheet } = await import('read-excel-file/browser');
      setOffers(excelOffers(await readSheet(file),provider));
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true);
    try {
      for (let i=0;i<offers.length;i+=5) {
        if (!await ops.run('supplierOffersSave',{ providerId:provider.id,offers:offers.slice(i,i+5) })) return;
        setOffers(offers.slice(i+5));
      }
      done();
    } finally { setBusy(false); }
  }
  return <Space vertical align="start">
    <Typography.Text link={{ href:import.meta.env.BASE_URL+'templates/supplier-offers.xlsx',download:'供应模型.xlsx' }}>下载 Excel 模板</Typography.Text>
    <input type="file" aria-label="上传供应模型 Excel 表格" accept=".xlsx" disabled={busy} onChange={e => read(e.target.files[0])}/>
    {offers.map(o => <div key={o.code}>{o.name} · {o.code} · {modelTypeLabel(o.type)}{o.bindings.map(b => <div key={JSON.stringify(b)}>{b.upstream} · {protocolAndEndpoint(b.protocol,b.url)}</div>)}</div>)}
    {(error || ops.error) && <Notice error>{error || ops.error}</Notice>}
    <Button theme="solid" disabled={!ops.can || busy || !offers.length} onClick={submit}>确认导入{offers.length ? ' '+offers.length+' 个模型' : ''}</Button>
  </Space>;
}
