import { useEffect, useRef, useState } from 'react';
import { Button, Form, Input, Space, TextArea, Typography, Upload } from '@douyinfe/semi-ui';
import { IconUpload } from '@douyinfe/semi-icons';
import { Choice, Field, Notice } from './ServiceUI';
import { providerCode, PROVIDER_TYPES } from './provider-management';
import MaterialLogo, { readMaterialLogo } from './MaterialLogo';

export default function ProviderMaterialProfile({ provider, editing, ops, edit, cancel, saved }) {
  const [values, setValues] = useState(() => ({
    name: provider?.name || '', code: provider ? providerCode(provider) : '', sourceType: provider?.sourceType || (provider ? '' : 'thirdParty'),
    logo: provider?.logo || '', introduction: provider?.introduction || '', website: provider?.website || '', documentation: provider?.documentation || '',
    contact: provider?.contact || '', contactInfo: provider?.contactInfo || '', description: provider?.description || '',
  }));
  const [revision] = useState(provider?.updatedAt ?? null);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false);
  const upload = useRef(0);
  useEffect(() => () => { upload.current++; }, []);
  const stale = provider && (provider.updatedAt ?? null) !== revision;
  const disabled = !ops.can || busy || stale;
  const set = (key, value) => {
    setValues(current => ({ ...current, [key]: value }));
    ops.setError('');
    ops.dirty(true);
  };
  const submit = async () => {
    if (disabled || uploading) return;
    setBusy(true);
    try {
      const next = await ops.run('provider', {
        operation: provider ? 'profile' : 'create', objectId: provider?.id,
        values: { ...values, ...(provider ? { expectedUpdatedAt: revision } : {}) },
      });
      if (next) saved(provider?.id || next.audits[0].objectId);
    } finally { setBusy(false); }
  };
  const uploadLogo = async files => {
    if (!files[0] || disabled || uploading) return;
    const sequence = ++upload.current;
    setUploading(true);
    ops.setError('');
    try {
      const logo = await readMaterialLogo(files[0], 512 * 1024);
      if (sequence === upload.current) set('logo', logo);
    } catch (error) {
      if (sequence === upload.current) ops.setError(error.message);
    } finally {
      if (sequence === upload.current) setUploading(false);
    }
  };
  const text = (key, label, options = {}) => {
    const value = values[key];
    const readLink = options.link && /^https?:\/\//i.test(value);
    const InputComponent = options.multiline ? TextArea : Input;
    return <Field label={label} required={editing && options.required} hint={editing ? options.hint : undefined}>
      {editing
        ? <InputComponent aria-label={label} disabled={disabled} readonly={options.readOnly} required={options.required}
            maxLength={options.maxLength} value={value} onChange={value => set(key, key === 'code' ? value.toLowerCase() : value)}/>
        : <Typography.Text className="materials-code" link={readLink ? { href: value, target: '_blank', rel: 'noopener noreferrer' } : undefined}>{value || '—'}</Typography.Text>}
    </Field>;
  };
  return <Form className="provider-material-profile" onSubmit={submit}>
    <div className="materials-actions"><Typography.Title heading={5} component="h3">主体信息</Typography.Title>
      {!editing && <Button disabled={!ops.can} onClick={edit}>编辑</Button>}
    </div>
    <div className="materials-field-grid">
      {text('name', '服务商名称', { required: true })}
      {text('code', '服务商编码', { required: true, readOnly: Boolean(provider), maxLength: 32, hint: '2–32 位小写字母、数字或连字符，字母开头。' })}
      <Field label="供给类型" required={editing}>{editing
        ? <Choice label="供给类型" disabled={disabled || Boolean(provider)} value={values.sourceType} options={Object.entries(PROVIDER_TYPES)} onChange={value => set('sourceType', value)}/>
        : <Typography.Text>{PROVIDER_TYPES[values.sourceType] || '—'}</Typography.Text>}
      </Field>
    </div>
    <Typography.Title heading={5} component="h3">展示信息</Typography.Title>
    <div className="materials-field-grid">
      <Field label="服务商 Logo" hint={editing ? 'PNG、JPEG、WebP，最大 512 KB' : undefined}>
        <Space wrap>
          <MaterialLogo key={values.logo} src={values.logo} alt={values.name + '的服务商 Logo'} preview/>
          {editing && <>
            <Upload accept="image/png,image/jpeg,image/webp" uploadTrigger="custom" fileList={[]} showUploadList={false}
              disabled={disabled || uploading} onFileChange={uploadLogo}>
              <Button icon={<IconUpload aria-hidden="true"/>} loading={uploading} disabled={disabled}>{values.logo ? '更换图片' : '上传图片'}</Button>
            </Upload>
            {values.logo && <Button theme="borderless" type="danger" disabled={disabled || uploading} onClick={() => set('logo', '')}>移除图片</Button>}
          </>}
        </Space>
      </Field>
      {text('introduction', '简介', { multiline: true, maxLength: 1000 })}
      {text('website', '官网', { link: true, maxLength: 1000 })}
      {text('documentation', '官方文档链接', { link: true, maxLength: 1000 })}
    </div>
    <Typography.Title heading={5} component="h3">运营信息</Typography.Title>
    <div className="materials-field-grid">
      {text('contact', '联系人')}
      {text('contactInfo', '联系人号码或邮箱')}
      {text('description', '备注', { multiline: true, maxLength: 2000 })}
    </div>
    {ops.error && <Notice error>{ops.error}</Notice>}
    {stale && <Notice error>服务商资料已有修订，请重新打开核对。</Notice>}
    {editing && <div className="materials-actions"><Space>
      <Button disabled={busy} onClick={cancel}>取消</Button>
      <Button htmlType="submit" theme="solid" loading={busy} disabled={disabled || uploading || !values.name.trim() || !values.code.trim() || !values.sourceType}>保存</Button>
    </Space></div>}
  </Form>;
}
