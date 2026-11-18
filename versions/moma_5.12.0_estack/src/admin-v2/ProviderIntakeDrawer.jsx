import { useEffect, useRef, useState } from 'react';
import { Button, Form, Input, Select, Space, TextArea, Upload } from '@douyinfe/semi-ui';
import { IconPlus, IconDelete, IconUpload } from '@douyinfe/semi-icons';
import { AdminSideSheet } from './AdminOverlay';
import { Field, Notice } from './ServiceUI';
import { PROVIDER_TYPES, PROVIDER_API_KEY_LIMIT, providerApiKeysDraft } from './provider-management';
import MaterialLogo, { readMaterialLogo } from './MaterialLogo';
import { planProviderIntake } from './provider-intake';
import './provider-intake.css';

export default function ProviderIntakeDrawer({ state, ops, close, saved }) {
  const [values, setValues] = useState({ name: '', code: '', source_type: 'thirdParty' });
  const [addresses, setAddresses] = useState([{ id: crypto.randomUUID(), value: '' }]);
  const [keys, setKeys] = useState([{ id: crypto.randomUUID(), value: '' }]);
  const [keyGroup, setKeyGroup] = useState('default'), [keyGroupName, setKeyGroupName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const blocked = !ops.can || busy || uploading || Boolean(ops.conflict);
  const change = (key, value) => { setValues(current => ({ ...current, [key]: value })); ops.dirty(true); setError(''); };
  const cancel = () => { if (!busy) ops.proceed(() => { active.current = false; close(); }); };
  const submit = async () => {
    if (blocked) return;
    setBusy(true); setError(''); ops.setError('');
    try {
      const urls = addresses.map(row => row.value.trim()).filter(Boolean);
      if (new Set(urls.map(url => url.replace(/\/$/, ''))).size !== urls.length) throw Error('Base URL 不能重复');
      const document = { provider: { ...values, models: [], connections: urls.map((base_url, index) => ({ connection_id: 'address-' + (index + 1), base_url, protocol: 'OpenAI', interface_type: 'openai' })) } };
      const plan = planProviderIntake(state, document);
      if (plan.errors.length) throw Error(plan.errors.map(row => row.path.replace(/^provider\.connections\[(\d+)\]$/, (_, index) => `Base URL ${Number(index) + 1}`) + '：' + row.message).join('；'));
      const apiKeys = keys.some(row => row.value.trim()) ? (await providerApiKeysDraft(keys.map(row => row.value))).apiKeys : [];
      const next = await ops.run('providerIntake', { document, apiKeys, ...(keyGroup === 'new' ? { key_group_name: keyGroupName } : {}), confirmed: true });
      if (next) { active.current = false; saved(next.audits[0].objectId); }
    } catch (error) { if (active.current) setError(error.message); }
    finally { if (active.current) setBusy(false); }
  };
  const editRows = (setRows, update) => { setRows(update); ops.dirty(true); setError(''); ops.setError(''); };
  const uploadLogo = async ([file]) => {
    if (!file || blocked) return;
    setUploading(true); setError('');
    try { const logo = await readMaterialLogo(file, 512 * 1024); if (active.current) change('logo', logo); }
    catch (error) { if (active.current) setError(error.message); }
    finally { if (active.current) setUploading(false); }
  };
  return <AdminSideSheet visible title="录入服务商" width="min(1280px, 100vw)" className="semi-services provider-intake-sheet" onCancel={cancel} closeOnEsc
    footer={<><Button disabled={busy} onClick={cancel}>取消</Button><Button theme="solid" loading={busy}
      disabled={blocked} onClick={submit}>确认录入</Button></>}>
    <Form className="provider-intake-form" onSubmit={submit}>
      <div className="provider-intake-fields">
        <Field label="服务商名称" required><Input aria-label="服务商名称" value={values.name} disabled={blocked} maxLength={100} onChange={value => change('name', value)}/></Field>
        <Field label="服务商编码" required hint="创建后不可修改；2–32 位小写字母、数字或连字符，字母开头。"><Input aria-label="服务商编码" value={values.code} disabled={blocked} maxLength={32} onChange={value => change('code', value.toLowerCase())}/></Field>
        <Field label="供给类型" required><Select aria-label="供给类型" value={values.source_type} disabled={blocked}
          optionList={Object.entries(PROVIDER_TYPES).map(([value, label]) => ({ value, label }))} onChange={value => change('source_type', value)}/></Field>
        <Field label="官网"><Input aria-label="官网" value={values.website || ''} disabled={blocked} maxLength={1000} onChange={value => change('website', value)}/></Field>
      </div>
      <Field label="Base URL"><div className="provider-intake-rows">
        {addresses.map((row, index) => <div className="provider-intake-row" key={row.id}>
          <Input aria-label={`Base URL ${index + 1}`} placeholder="https://api.example.com/v1" value={row.value} disabled={blocked} onChange={value => editRows(setAddresses, rows => rows.map(item => item.id === row.id ? { ...item, value } : item))}/>
          <Button htmlType="button" theme="borderless" type="tertiary" aria-label={`移除 Base URL ${index + 1}`} icon={<IconDelete aria-hidden="true"/>} disabled={blocked || addresses.length === 1} onClick={() => editRows(setAddresses, rows => rows.filter(item => item.id !== row.id))}/>
        </div>)}
        <Button htmlType="button" className="provider-intake-add" theme="borderless" icon={<IconPlus aria-hidden="true"/>} disabled={blocked || addresses.length >= 500} onClick={() => editRows(setAddresses, rows => [...rows, { id: crypto.randomUUID(), value: '' }])}>添加地址</Button>
      </div></Field>
      <Field label="API 密钥组"><Select aria-label="API 密钥组" value={keyGroup} disabled={blocked}
        optionList={[{ value: 'default', label: '默认 API 密钥组' }, { value: 'new', label: '新建密钥组' }]}
        onChange={value => { setKeyGroup(value); ops.dirty(true); setError(''); }}/></Field>
      {keyGroup === 'new' && <Field label="密钥组名称" required><Input aria-label="密钥组名称" value={keyGroupName} maxLength={60} disabled={blocked}
        onChange={value => { setKeyGroupName(value); ops.dirty(true); setError(''); }}/></Field>}
      <Field label="API 密钥" hint="本次密钥加入所选组，输入顺序对应组内优先级；录入后可在 API 密钥池继续管理。"><div className="provider-intake-rows">
        {keys.map((row, index) => <div className="provider-intake-row" key={row.id}>
          <Input mode="password" autoComplete="new-password" aria-label={`API 密钥 ${index + 1}`} placeholder="sk-xxx" value={row.value} disabled={blocked} onChange={value => editRows(setKeys, rows => rows.map(item => item.id === row.id ? { ...item, value } : item))}/>
          <Button htmlType="button" theme="borderless" type="tertiary" aria-label={`移除 API 密钥 ${index + 1}`} icon={<IconDelete aria-hidden="true"/>} disabled={blocked || keys.length === 1} onClick={() => editRows(setKeys, rows => rows.filter(item => item.id !== row.id))}/>
        </div>)}
        <Button htmlType="button" className="provider-intake-add" theme="borderless" icon={<IconPlus aria-hidden="true"/>} disabled={blocked || keys.length >= PROVIDER_API_KEY_LIMIT} onClick={() => editRows(setKeys, rows => [...rows, { id: crypto.randomUUID(), value: '' }])}>添加 API 密钥</Button>
      </div></Field>
      <Field label="服务商图标" hint="支持 PNG、JPEG、WebP，大小不超过 512 KB。"><Space vertical align="start" style={{ width: '100%' }}>
        <Space wrap><MaterialLogo key={values.logo} src={values.logo} alt="" preview fallback={null}/>
          <Upload accept="image/png,image/jpeg,image/webp" uploadTrigger="custom" fileList={[]} showUploadList={false} disabled={blocked} onFileChange={uploadLogo}>
            <Button htmlType="button" icon={<IconUpload aria-hidden="true"/>} loading={uploading} disabled={blocked}>上传图标</Button>
          </Upload>
          {values.logo && <Button htmlType="button" theme="borderless" type="danger" disabled={blocked} onClick={() => change('logo', '')}>移除图标</Button>}
        </Space>
        <Input aria-label="服务商图标 URL" placeholder="http:// 或 https:// 图片地址" value={values.logo?.startsWith('data:') ? '' : values.logo || ''} disabled={blocked} onChange={value => change('logo', value)}/>
      </Space></Field>
      <Field label="描述"><TextArea aria-label="描述" value={values.description || ''} disabled={blocked} maxCount={300} getValueLength={value => [...value].length} rows={3} onChange={value => change('description', value)}/></Field>
    </Form>
    {(error || ops.error) && <Notice error>{error || ops.error}</Notice>}
  </AdminSideSheet>;
}
