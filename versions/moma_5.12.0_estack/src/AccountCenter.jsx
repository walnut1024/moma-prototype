import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import FrontPageHeader from './components/FrontPageHeader';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Checkbox } from './components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from './components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog';
import { maskMemberPhone } from './organization-data.mjs';
import { realNameErrors } from './auth-state.mjs';

const enterpriseStatus = { '待处理': '审核中', '需补充': '需补充', '已开通': '已认证', '已关闭': '未通过' };

export default function AccountCenter({ auth, title = '账号中心' }) {
  useEffect(() => { const previous = document.title; document.title = `MoMA · ${title}`; return () => { document.title = previous; }; }, [title]);
  const [open, setOpen] = useState(auth.params.get('certification') === 'personal' && !['审核中', '已认证'].includes(auth.user.realNameCertification?.status)), [data, setData] = useState({ name: '', idNumber: '', consent: false }), [errors, setErrors] = useState({});
  const [submitting,setSubmitting]=useState(false);
  const personal = auth.user.realNameCertification;
  const applications = auth.state.applications.filter(item => item.applicantUserId === auth.user.id);
  const latest = applications.at(-1);
  const choosingCertification = auth.params.get('registered') === '1' && !personal && !latest;
  const workbench = title === '账号认证' && !choosingCertification;
  const enterpriseVerified = latest?.status === '已开通';
  const uncertified = !personal && !enterpriseVerified;
  const status = enterpriseVerified ? '已认证' : personal?.status || '未认证';
  const canSubmit = !['审核中', '已认证'].includes(personal?.status);
  const update = (key, value) => { setData(current => ({ ...current, [key]: value })); setErrors({}); };
  const close = () => { setOpen(false); setData({ name: '', idNumber: '', consent: false }); setErrors({}); };
  const submit = async event => {
    event.preventDefault();
    const invalid = realNameErrors(data);
    if (Object.keys(invalid).length) { setErrors(invalid); return; }
    setSubmitting(true);
    try {
      await auth.certify('certifyPersonal',data);
      close(); toast.success('实名认证已提交');
    }
    catch (error) { setErrors({ submit: error.message }); }
    finally { setSubmitting(false); }
  };
  return <div className={cn("auth-account-center", workbench && "auth-account-workbench us-page")}>
    {!choosingCertification && !workbench && <Button variant="ghost" onClick={auth.close}><ArrowLeft data-icon="inline-start" />返回使用空间</Button>}
    {workbench ? <FrontPageHeader title={title} description="管理账号信息，完成个人实名认证或企业认证" icon={ShieldCheck} /> : <div className="auth-account-title"><h1>{choosingCertification ? '注册成功' : title}</h1><p>{choosingCertification ? '账号已创建并自动登录，请选择认证方式。' : '管理账号信息与身份认证'}</p></div>}
    {auth.storageError && <p className="auth-field-error" role="alert">{auth.storageError}</p>}
    {choosingCertification ? <><div className="auth-certification-choices">
      <Card><CardHeader><CardTitle><ShieldCheck aria-hidden="true" />实名认证</CardTitle><CardDescription>核验本人身份信息</CardDescription></CardHeader><CardContent><p>填写真实姓名和居民身份证信息，提交身份核验。</p></CardContent><CardFooter><Button disabled={Boolean(auth.storageError)} onClick={() => setOpen(true)}>开始实名认证</Button></CardFooter></Card>
      <Card><CardHeader><CardTitle><Building2 aria-hidden="true" />企业认证</CardTitle><CardDescription>核验企业主体与授权关系</CardDescription></CardHeader><CardContent><p>填写单位资料，确认有权代表该单位提交认证。</p></CardContent><CardFooter><Button variant="outline" disabled={Boolean(auth.storageError) || !auth.user.phone} onClick={() => auth.navigate('enterprise')}>开始企业认证</Button></CardFooter></Card>
    </div><Button variant="link" onClick={auth.close}>稍后认证，进入使用空间</Button></> : <>
    <Card><CardHeader><CardTitle>基本信息</CardTitle><CardDescription>使用同一个账号访问个人空间及已加入的企业空间</CardDescription></CardHeader><CardContent><dl className="auth-account-details"><div><dt>账号名称</dt><dd>{auth.user.name}</dd></div><div><dt>手机号码</dt><dd>{auth.user.phone ? maskMemberPhone(auth.user.phone) : '未绑定'}</dd></div><div><dt>登录密码</dt><dd>已设置</dd></div></dl></CardContent><CardFooter>{auth.user.passwordManaged && <Button variant="outline" size="sm" onClick={() => auth.navigate('password')}>修改登录密码</Button>}</CardFooter></Card>
    <Card className="auth-certification-summary"><CardHeader><CardTitle><h2>{uncertified ? '未实名认证' : status === '已认证' ? '已完成实名认证' : status === '审核中' ? '实名认证审核中' : '实名认证'}</h2></CardTitle><CardAction><Button variant="link" disabled={Boolean(auth.storageError) || !auth.user.phone} onClick={() => auth.navigate('enterprise', latest ? `?record=${encodeURIComponent(latest.id)}` : '')}>{latest ? '查看企业认证' : uncertified ? '企业认证' : '变更为企业用户'}</Button></CardAction></CardHeader><CardContent>
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
    </CardContent>{!enterpriseVerified && canSubmit && <CardFooter><Button variant="outline" disabled={Boolean(auth.storageError)} onClick={() => setOpen(true)}><ShieldCheck data-icon="inline-start" />{personal ? '重新提交实名认证' : '开始实名认证'}</Button></CardFooter>}</Card>
    </>}
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}><DialogContent className="auth-dialog"><DialogHeader><DialogTitle>实名认证</DialogTitle><DialogDescription>填写本人居民身份证信息，提交后查看核验状态。</DialogDescription></DialogHeader><form id="real-name-form" className="auth-form" noValidate onSubmit={submit}>
      <div className="auth-field" data-invalid={Boolean(errors.name)}><label htmlFor="certification-name">真实姓名</label><Input id="certification-name" value={data.name} maxLength={40} placeholder="请输入真实姓名" onChange={event => update('name', event.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'certification-name-error' : undefined} />{errors.name && <p id="certification-name-error" className="auth-field-error" role="alert">{errors.name}</p>}</div>
      <div className="auth-field" data-invalid={Boolean(errors.idNumber)}><label htmlFor="certification-id">居民身份证号码</label><Input id="certification-id" value={data.idNumber} maxLength={18} autoComplete="off" placeholder="请输入 18 位身份证号码" onChange={event => update('idNumber', event.target.value)} aria-invalid={Boolean(errors.idNumber)} aria-describedby={errors.idNumber ? 'certification-id-error' : undefined} />{errors.idNumber && <p id="certification-id-error" className="auth-field-error" role="alert">{errors.idNumber}</p>}</div>
      <div className="auth-agreement"><div><Checkbox id="certification-consent" checked={data.consent} onCheckedChange={value => update('consent', value === true)} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? 'certification-consent-error' : undefined} /><label htmlFor="certification-consent">本人确认信息真实，并授权用于身份核验</label></div>{errors.consent && <p id="certification-consent-error" className="auth-field-error" role="alert">{errors.consent}</p>}</div>
      {errors.submit && <p className="auth-field-error" role="alert">{errors.submit}</p>}
    </form><DialogFooter><Button variant="outline" onClick={close}>取消</Button><Button type="submit" form="real-name-form" disabled={submitting || Boolean(auth.storageError)}>提交认证</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
