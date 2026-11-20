import { Button, Card, Checkbox, Input } from '@douyinfe/semi-ui';
import { AdminModal } from './admin-v2/AdminOverlay';
import { useState } from 'react';
import { usePageTitle } from './useSiteConfig';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import FrontPageHeader from './components/FrontPageHeader';
import { maskMemberPhone } from './organization-data.mjs';
import { realNameErrors, submitRealNameCertification } from './auth-state.mjs';

const enterpriseStatus = { '待处理': '审核中', '需补充': '需补充', '已开通': '已认证', '已关闭': '未通过' };

export default function AccountCenter({ auth, title = '账号中心' }) {
  usePageTitle(`MoMA · ${title}`);
  const [open, setOpen] = useState(auth.params.get('certification') === 'personal' && !['审核中', '已认证'].includes(auth.user.realNameCertification?.status)), [data, setData] = useState({ name: '', idNumber: '', consent: false }), [errors, setErrors] = useState({});
  const personal = auth.user.realNameCertification;
  const applications = auth.state.applications.filter(item => item.applicantUserId === auth.user.id);
  const latest = applications.at(-1);
  const workbench = title === '账号认证';
  const enterpriseVerified = latest?.status === '已开通';
  const uncertified = !personal && !enterpriseVerified;
  const status = enterpriseVerified ? '已认证' : personal?.status || '未认证';
  const canSubmit = !['审核中', '已认证'].includes(personal?.status);
  const update = (key, value) => { setData(current => ({ ...current, [key]: value })); setErrors({}); };
  const close = () => { setOpen(false); setData({ name: '', idNumber: '', consent: false }); setErrors({}); };
  const submit = event => {
    event.preventDefault();
    const invalid = realNameErrors(data);
    if (Object.keys(invalid).length) { setErrors(invalid); return; }
    try { auth.commit(submitRealNameCertification(auth.state, data)); close(); toast.success('实名认证已提交'); }
    catch (error) { setErrors({ submit: error.message }); }
  };
  return <div className={cn("auth-account-center", workbench && "auth-account-workbench us-page")}>
    {!workbench && <Button theme="borderless" type="tertiary" onClick={auth.close}><ArrowLeft data-icon="inline-start" />返回使用空间</Button>}
    {workbench ? <FrontPageHeader title={title} description="管理账号信息，完成个人实名认证或企业认证" icon={ShieldCheck} /> : <div className="auth-account-title"><h1>{title}</h1><p>管理账号信息与身份认证</p></div>}
    {auth.storageError && <p className="auth-field-error" role="alert">{auth.storageError}</p>}
    <Card title="基本信息" headerLine><p className="auth-section-note">使用同一个账号访问个人空间及已加入的企业空间</p><dl className="auth-account-details"><div><dt>账号名称</dt><dd>{auth.user.name}</dd></div><div><dt>手机号码</dt><dd>{auth.user.phone ? maskMemberPhone(auth.user.phone) : '未绑定'}</dd></div><div><dt>登录密码</dt><dd>{auth.user.credential ? '已设置' : '未设置'}</dd></div></dl>{auth.user.phone && <Button theme="outline" size="small" onClick={() => auth.navigate('password')}>{auth.user.credential ? '修改登录密码' : '设置登录密码'}</Button>}</Card>
    <Card className="auth-certification-summary" title={uncertified ? '未实名认证' : status === '已认证' ? '已完成实名认证' : status === '审核中' ? '实名认证审核中' : '实名认证'} headerLine headerExtra={<Button theme="borderless" disabled={Boolean(auth.storageError) || !auth.user.phone} onClick={() => auth.navigate('enterprise', latest ? `?record=${encodeURIComponent(latest.id)}` : '')}>{latest ? '查看企业认证' : uncertified ? '企业认证' : '变更为企业用户'}</Button>}>
      {uncertified ? <div className="auth-certification-empty"><ShieldCheck aria-hidden="true" /><div><p role="status">您尚未完成实名认证</p><p>可填写本人身份信息进行实名认证，或使用当前账号提交企业认证。</p></div></div> : <dl className="auth-certification-grid">
        <div><dt>认证状态</dt><dd className="auth-certification-status" role="status">{status}{status === '已认证' && <CheckCircle2 aria-label="已认证" />}</dd></div>
        <div><dt>认证类型</dt><dd>{enterpriseVerified ? '企业' : '个人'}</dd></div>
        <div><dt>{enterpriseVerified ? '单位全称' : '真实姓名'}</dt><dd>{enterpriseVerified ? latest.companyName : personal?.name || '—'}</dd></div>
        <div><dt>证件类型</dt><dd>{enterpriseVerified ? '单位登记证件' : personal ? '中国大陆居民身份证' : '—'}</dd></div>
        <div><dt>证件号码</dt><dd>{enterpriseVerified ? latest.taxId : personal?.maskedId || '—'}</dd></div>
        <div><dt>认证时间</dt><dd>{(enterpriseVerified ? latest.verifiedAt : personal?.verifiedAt) ? new Date(enterpriseVerified ? latest.verifiedAt : personal.verifiedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'}</dd></div>
      </dl>}
      {personal?.status === '审核中' && !enterpriseVerified && <p className="auth-section-note">实名认证已提交，请等待核验结果。</p>}
      {latest && !enterpriseVerified && <div className="auth-enterprise-progress"><span>企业认证：{enterpriseStatus[latest.status] || latest.status}</span><span>{latest.companyName}</span><span>认证编号：{latest.id}</span></div>}
    {!enterpriseVerified && canSubmit && <Button theme="outline" disabled={Boolean(auth.storageError)} onClick={() => setOpen(true)}><ShieldCheck data-icon="inline-start" />{personal ? '重新提交实名认证' : '开始实名认证'}</Button>}</Card>
    <AdminModal visible={open} title="实名认证" className="auth-dialog" onCancel={close} okText="提交认证"
      okButtonProps={{ form:"real-name-form", htmlType:"submit", disabled:Boolean(auth.storageError) }}>
      <p>填写本人居民身份证信息，提交后查看核验状态。</p>
      <form id="real-name-form" className="auth-form" noValidate onSubmit={submit}>
      <div className="auth-field" data-invalid={Boolean(errors.name)}><label htmlFor="certification-name">真实姓名</label><Input id="certification-name" value={data.name} maxLength={40} placeholder="请输入真实姓名" onChange={value => update('name', value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'certification-name-error' : undefined} />{errors.name && <p id="certification-name-error" className="auth-field-error" role="alert">{errors.name}</p>}</div>
      <div className="auth-field" data-invalid={Boolean(errors.idNumber)}><label htmlFor="certification-id">居民身份证号码</label><Input id="certification-id" value={data.idNumber} maxLength={18} autoComplete="off" placeholder="请输入 18 位身份证号码" onChange={value => update('idNumber', value)} aria-invalid={Boolean(errors.idNumber)} aria-describedby={errors.idNumber ? 'certification-id-error' : undefined} />{errors.idNumber && <p id="certification-id-error" className="auth-field-error" role="alert">{errors.idNumber}</p>}</div>
      <div className="auth-agreement"><div><Checkbox id="certification-consent" checked={data.consent} onChange={event => update('consent', event.target.checked)} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? 'certification-consent-error' : undefined} /><label htmlFor="certification-consent">本人确认信息真实，并授权用于身份核验</label></div>{errors.consent && <p id="certification-consent-error" className="auth-field-error" role="alert">{errors.consent}</p>}</div>
      {errors.submit && <p className="auth-field-error" role="alert">{errors.submit}</p>}
    </form></AdminModal>
  </div>;
}
