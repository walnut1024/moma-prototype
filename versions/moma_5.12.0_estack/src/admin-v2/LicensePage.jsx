import { useChannelText } from './channel-language';
import { useEffect, useState } from 'react';
import { IconShield } from '@douyinfe/semi-icons';
import { Banner, Button, Card, RadioGroup, Space, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { cacheLicense, LICENSE_NAMES } from '../deployment-license.mjs';
import AdminPageHeading from './AdminPageHeading';
import AdminStatus from './AdminStatus';
import { AdminModal } from './AdminOverlay';
import { cloudAdminRequest } from './admin-client.mjs';
import './license-page.css';

const labels = { active:'有效', expired:'已到期', invalid:'配置无效', unavailable:'读取失败' };
const statusColors = { active:'green', expired:'orange', invalid:'red', unavailable:'red' };
const detailPath = '/deployment/license?details=1';
const day = 86400000;
const dateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit',
});
const showTime = value => value ? dateTime.format(new Date(value)) : '—';

export default function LicensePage({ license, menuPreview, onMenuPreviewChange }) {
  const translateLabel = useChannelText();
  const [details, setDetails] = useState(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmReduction, setConfirmReduction] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    cloudAdminRequest(detailPath,{ signal:controller.signal }).then(snapshot => setDetails(current => current ?? snapshot)).catch(() => {});
    return () => controller.abort();
  }, []);

  const unavailable = license.status === 'unavailable';
  const status = license.managed || unavailable ? labels[license.status] : '使用默认配置';
  const action = license.managed ? '替换 License' : '填写 License';
  const remaining = Math.ceil((Date.parse(license.expiresAt) - Date.now()) / day);
  const scope = unavailable ? '—' : license.edition === 'commercial' ? '政企标准版 + 商业化增强' : '政企标准版';
  const fields = [
    ['运营模式', unavailable ? '—' : LICENSE_NAMES[license.edition]],
    ['有效期至', <>{showTime(license.expiresAt)}
      {license.status === 'active' && remaining > 0 && remaining <= 30 &&
        <AdminStatus value={`剩余 ${remaining} 天`} color="orange"/>}</>],
  ];
  if (details?.licenseId) fields.push(
    ['生效时间', showTime(details.startsAt)],
    ['授权对象', details.licensedTo],
    ['授权编号', details.licenseId],
  );

  const close = () => {
    if (saving) return;
    setOpen(false);
    setDraft('');
    setError('');
    setConfirmReduction(false);
  };
  const apply = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const snapshot = details ?? await cloudAdminRequest(detailPath);
      const next = await cloudAdminRequest('/deployment/license', {
        method:'POST', body:{ license:draft.trim(), expectedRevision:snapshot.revision, confirmReduction },
      });
      setDetails(next);
      cacheLicense(next.license);
      setOpen(false);
      setDraft('');
      setConfirmReduction(false);
      Toast.success('License 已启用');
    } catch (failure) {
      if (failure.code === 'LICENSE_SCOPE_REDUCTION') setConfirmReduction(true);
      else {
        setError(failure.code ? failure.message : '无法提交 License，请稍后重试。');
        if (failure.code === 'REVISION_CONFLICT') {
          setDetails(null);
          setConfirmReduction(false);
          cloudAdminRequest(detailPath).then(snapshot => {
            setDetails(snapshot);
            cacheLicense(snapshot.license);
          }).catch(() => {});
        }
      }
    } finally { setSaving(false); }
  };

  return <div className="admin-page-stack license-page">
    <AdminPageHeading title={translateLabel("授权管理")}>
      <Button id="edit-deployment-license" theme="solid" onClick={() => setOpen(true)}>{action}</Button>
    </AdminPageHeading>
    <Card className="license-card" bodyStyle={{ padding:0 }}>
      <div className="license-summary">
        <div className="license-summary-info">
          <span className="license-summary-icon" aria-hidden="true"><IconShield size="large"/></span>
          <div className="license-summary-copy">
            <Typography.Text className="license-fact-label">授权范围</Typography.Text>
            <Typography.Title heading={4} component="h2">{scope}</Typography.Title>
          </div>
        </div>
        <Tag size="large" color={license.managed || unavailable ? statusColors[license.status] : 'grey'}>{status}</Tag>
      </div>
      <dl className="license-facts">
        {fields.map(([name, value]) => <div key={name}>
          <dt className="license-fact-label">{name}</dt>
          <dd>{value}</dd>
        </div>)}
      </dl>
      <Space className="license-menu-preview" spacing={12} wrap>
        <Typography.Text strong>{translateLabel('菜单模拟')}</Typography.Text>
        <RadioGroup type="button" size="small" aria-label={translateLabel('菜单模拟')} value={menuPreview}
          onChange={event => onMenuPreviewChange(event.target.value)}
          options={[
            { value:'current', label:translateLabel('当前菜单') },
            { value:'internal', label:translateLabel(LICENSE_NAMES.internal) },
            { value:'commercial', label:translateLabel(LICENSE_NAMES.commercial) },
          ]}/>
        <Typography.Text type="tertiary" size="small">{translateLabel('离开本页后恢复当前菜单。')}</Typography.Text>
      </Space>
    </Card>
    {license.status === 'expired' && <Banner type="warning" closeIcon={null} title="授权已到期"
      description={license.edition === 'commercial' ? '商业运营历史记录仍可查看，经营配置暂不可变更。' : undefined}/>}
    <AdminModal title={action} visible={open} width="min(536px, calc(100vw - 32px))" className="license-dialog"
      onOk={apply} onCancel={close} confirmLoading={saving} closable={!saving} closeOnEsc={!saving}
      okText={confirmReduction ? '确认替换' : '校验并启用'}
      okButtonProps={{ disabled:!draft.trim() }} cancelButtonProps={{ disabled:saving }}
      afterClose={() => document.getElementById('edit-deployment-license')?.focus()}>
      <div className="license-form">
        <label htmlFor="deployment-license-input">新 License <span aria-hidden="true">*</span></label>
        <TextArea id="deployment-license-input" rows={5} value={draft} maxLength={8192}
          disabled={saving} aria-required="true" aria-invalid={Boolean(error)}
          aria-describedby={error ? 'deployment-license-error' : undefined} validateStatus={error ? 'error' : 'default'}
          placeholder="粘贴完整的 License 内容" onChange={value => {
            setDraft(value);
            setError('');
            setConfirmReduction(false);
          }}/>
        {error && <Typography.Text type="danger" id="deployment-license-error" role="alert">{error}</Typography.Text>}
        {confirmReduction && <Banner type="warning" closeIcon={null}
          description="授权范围将缩小为政企标准版，商业运营入口将关闭。"/>}
      </div>
    </AdminModal>
  </div>;
}
