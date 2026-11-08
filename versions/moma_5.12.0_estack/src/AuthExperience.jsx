import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, Check, ChevronDown, Clock3, LogOut, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from './components/ui/input-group';
import { Checkbox } from './components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from './components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from './components/ui/select';
import { Toaster } from './components/ui/sonner';
import { chinaRegions, industries } from './admin-v2/enterprise-options';
import { maskMemberPhone } from './organization-data.mjs';
import { authRoute, applicationErrors } from './auth-state.mjs';
import AccountCenter from './AccountCenter';
import { useTenantData } from './useTenantData';
import { marketRequest } from './CloudMarket';
import './auth.css';

export function useAuthNavigation() {
  const [hash,setHash]=useState(()=>location.hash);
  const returnTo=useRef(authRoute(location.hash)?'':location.hash);
  useEffect(()=>{
    const sync=()=>setHash(location.hash);
    addEventListener('hashchange',sync);
    return ()=>removeEventListener('hashchange',sync);
  },[]);
  const navigate=(target,params='')=>{
    if(!authRoute(location.hash))returnTo.current=location.hash;
    location.hash='/auth/'+target+params;
  };
  return {route:authRoute(hash),params:new URLSearchParams(hash.split('?')[1] || ''),navigate,close:()=>{location.hash=returnTo.current;}};
}

export function AuthBanner({ auth, market, showToast }) {
  const [open,setOpen]=useState(false);
  const navigate=route=>{setOpen(false);auth.navigate(route);};
  if(market?.tenant)return <div className="auth-banner-actions">
    {showToast && <Toaster position="top-right" offset={64} mobileOffset={64}/>}
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
      <Button variant="ghost" className="auth-banner-user" aria-label="账号菜单"><UserRound data-icon="inline-start"/>{market.account?.name || market.tenant.name}<ChevronDown data-icon="inline-end"/></Button>
    </PopoverTrigger><PopoverContent className="auth-account-menu" align="end">
      <div className="auth-menu-profile"><b>{market.account?.username}</b><span>{market.tenant.name}</span></div>
      <Button variant="ghost" onClick={()=>navigate('account')}><UserRound data-icon="inline-start"/>账号中心</Button>
      {market.spaces?.filter(space=>space.id!==market.tenant.id).map(space=><Button variant="ghost" key={space.id} onClick={async()=>{
        try{await market.switchSpace(space.id);setOpen(false);}catch(error){toast.error(error.message);}
      }}><Building2 data-icon="inline-start"/>{space.name}</Button>)}
      <Button variant="ghost" onClick={async()=>{try{await market.logout();setOpen(false);if(auth.route)auth.close();}catch(error){toast.error(error.message);}}}><LogOut data-icon="inline-start"/>退出登录</Button>
    </PopoverContent></Popover>
  </div>;
  return <div className="auth-banner-actions">
    {showToast && <Toaster position="top-right" offset={64} mobileOffset={64}/>}
    <Button variant="ghost" className="auth-banner-login" onClick={()=>navigate('login')}>登录</Button>
    <Button variant="outline" className="auth-banner-register" onClick={()=>navigate('register')}>注册</Button>
  </div>;
}

function FormField({ label, id, error, children, ...props }) {
  return <div className="auth-field" data-invalid={Boolean(error)}><label htmlFor={id}>{label}</label>{children || <Input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />}{error && <p className="auth-field-error" id={`${id}-error`} role="alert">{error}</p>}</div>;
}
function FormSelect({ id, label, value, options, onChange, disabled, error }) {
  return <FormField id={id} label={label} error={error}><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent><SelectGroup>{options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></FormField>;
}

export default function AuthExperience({auth,market,accountTitle='账号中心'}) {
  if(auth.route==='login')return <TenantLogin auth={auth} market={market}/>;
  if(auth.route==='register')return <TenantRegister auth={auth} market={market}/>;
  if(market.loading)return <section className="auth-account-center"><h1>{accountTitle}</h1><p role="status">正在读取账号信息…</p></section>;
  if(auth.route==='password')return <TenantPassword auth={auth} market={market}/>;
  if(auth.route==='invite')return <TenantInvite auth={auth} market={market}/>;
  if(market.tenant)return <TenantAccount auth={auth} title={accountTitle}/>;
  return <section className="auth-account-center"><h1>{accountTitle}</h1>
    {market.error && <p role="alert">{market.error}</p>}
    <Button onClick={()=>auth.navigate('login','?next=account')}>登录</Button>
  </section>;
}

function TenantLogin({auth,market}) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [accountType,setAccountType]=useState(auth.params.get('type')==='personal'?'personal':'enterprise');
  async function login(event) {
    event.preventDefault();
    const values=new FormData(event.currentTarget);
    setError('');setBusy(true);
    try {
      await market.login(values.get('account').trim(),values.get('password'),accountType);
      if(auth.params.get('next')==='account')auth.navigate('account');
      else if(auth.params.get('next')==='invite')auth.navigate('invite','?'+new URLSearchParams({token:auth.params.get('token') || ''}));
      else auth.close();
    } catch(issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  return <section className="auth-account-center">
    <h1>登录</h1>
    <form className="auth-form" onSubmit={login}>
      <FormSelect id="customer-account-type" label="账号类型" value={accountType} onChange={setAccountType} options={[[ 'enterprise','政企账号' ],[ 'personal','个人账号' ]]}/>
      <FormField id="demo-account-id" label="用户名" name="account" defaultValue={auth.params.get('username') || ''} placeholder={accountType==='enterprise'?'zqzh':'grzh'} autoComplete="username" required maxLength={254}/>
      <FormField id="demo-account-password" label="密码" name="password" type="password" autoComplete="current-password" required maxLength={128}/>
      {error && <p role="alert">{error}</p>}
      <div className="auth-result-actions"><Button disabled={busy}>{busy?'登录中…':'登录'}</Button><Button type="button" variant="outline" onClick={auth.close}>返回</Button></div>
    </form>
    <div className="auth-result-actions">
      <Button variant="link" onClick={()=>auth.navigate('register')}>注册个人账号</Button>
      <Button variant="link" onClick={()=>auth.navigate('password','?mode=reset')}>找回密码</Button>
    </div>
  </section>;
}

function TenantPassword({auth,market}) {
  const recovery=!market.tenant || auth.params.get('mode')==='reset';
  const [phone,setPhone]=useState(''),[challenge,setChallenge]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function run(operation){
    setBusy(true);setError('');
    try {await operation();}catch(issue){setError(issue.message);}
    finally {setBusy(false);}
  }
  function submit(event){
    event.preventDefault();
    const fields=new FormData(event.currentTarget), password=fields.get('password');
    if(password!==fields.get('confirm')){setError('两次输入的密码不一致');return;}
    if(recovery && !challenge){setError('请先获取验证码');return;}
    const proof=recovery?{phone,challengeId:challenge.id,code:fields.get('code')}:{currentPassword:fields.get('current')};
    void run(async()=>{
      await market.updatePassword({...proof,password},recovery);
      toast.success('密码已更新，请重新登录');
      auth.navigate('login');
    });
  }
  return <section className="auth-account-center">
    <h1>{recovery?'找回密码':'修改密码'}</h1>
    <form className="auth-form" onSubmit={submit}>
      {recovery?<><FormField id="password-phone" label="手机号" value={phone} onChange={event=>{setPhone(event.target.value);setChallenge(null);}} autoComplete="tel" disabled={busy} required/>
        <FormField id="password-code" label="验证码"><InputGroup>
          <InputGroupInput id="password-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required/>
          <InputGroupAddon align="inline-end"><InputGroupButton type="button" disabled={busy || !phone}
            onClick={()=>run(async()=>setChallenge(await marketRequest('password-code',{phone})))}>获取验证码</InputGroupButton></InputGroupAddon>
        </InputGroup></FormField>
        {challenge && <p className="auth-form-note" role="status">演示验证码 {challenge.code}，5 分钟内有效。</p>}
      </>:<FormField id="password-current" label="当前密码" name="current" type="password" autoComplete="current-password" required/>}
      <FormField id="password-new" label="新密码" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={64} required/>
      <FormField id="password-confirm" label="确认新密码" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={64} required/>
      {error && <p className="auth-field-error" role="alert">{error}</p>}
      <div className="auth-result-actions"><Button disabled={busy}>保存密码</Button>
        <Button variant="outline" type="button" onClick={()=>auth.navigate(market.tenant?'account':'login')}>返回</Button></div>
    </form>
  </section>;
}

function TenantRegister({auth,market}) {
  const [phone,setPhone]=useState(''),[challenge,setChallenge]=useState(null),[agreed,setAgreed]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function run(operation){
    setBusy(true);setError('');
    try {await operation();}catch(issue){setError(issue.message);}
    finally {setBusy(false);}
  }
  function submit(event){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    if(!challenge || !agreed){setError('请填写验证码并确认协议');return;}
    void run(async()=>{
      await market.signup({phone,challengeId:challenge.id,code:fields.get('code'),password:fields.get('password'),consent:agreed});
      auth.navigate('account','?registered=1');
    });
  }
  return <div className="auth-experience auth-identity-page auth-enterprise-shell"><div className="auth-layout">
    <AuthBrand title="模型服务平台" description="注册后进入个人空间，可在账号中心发起企业认证。"/>
    <section className="auth-form-panel" aria-label="注册个人账号">
      <h1>注册个人账号</h1>
      <form id="auth-identity-panel" data-registration="true" className="auth-form" onSubmit={submit}>
        <FormField id="signup-phone" label="手机号" value={phone} onChange={event=>{setPhone(event.target.value);setChallenge(null);}} autoComplete="tel" maxLength={18} required/>
        <FormField id="signup-code" label="验证码">
          <InputGroup><InputGroupInput id="signup-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required/>
            <InputGroupAddon align="inline-end"><InputGroupButton type="button" disabled={busy || !phone} onClick={()=>run(async()=>setChallenge(await marketRequest('signup-code',{phone})))}>获取验证码</InputGroupButton></InputGroupAddon>
          </InputGroup>
        </FormField>
        {challenge && <p className="auth-form-note" role="status">演示验证码 {challenge.code}，5 分钟内有效。</p>}
        <FormField id="signup-password" label="设置密码" type="password" name="password" autoComplete="new-password" minLength={8} maxLength={64} required/>
        <div className="auth-agreement"><Checkbox id="signup-agreement" checked={agreed} onCheckedChange={value=>setAgreed(value===true)}/><label htmlFor="signup-agreement">同意用户协议和隐私政策</label></div>
        {error && <p className="auth-field-error" role="alert">{error}</p>}
        <Button disabled={busy}>{busy?'提交中…':'注册'}</Button>
        <Button variant="link" type="button" onClick={()=>auth.navigate('login','?type=personal')}>返回登录</Button>
      </form>
    </section>
  </div></div>;
}

function TenantAccount({auth,title}) {
  const tenant=useTenantData();
  if(!tenant.profile)return <section className="auth-account-center"><h1>{title}</h1>
    {tenant.error ? <p role="alert">{tenant.error}</p> : <p role="status">正在读取账号信息…</p>}
    <Button variant="outline" onClick={auth.close}>返回</Button></section>;
  const customerAuth={...auth,user:tenant.profile,state:{applications:tenant.applications},
    storageError:tenant.error,certify:tenant.command};
  return auth.route==='enterprise' ? <EnterpriseApplication key={auth.params.toString()} auth={customerAuth}/>
    : <AccountCenter auth={customerAuth} title={title}/>;
}

function TenantInvite({auth,market}) {
  const token=auth.params.get('token'),[invitation,setInvitation]=useState(null),[loadError,setLoadError]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    setInvitation(null);setLoadError('');
    marketRequest('invitations/inspect',{token},controller.signal).then(setInvitation).catch(issue=>{
      if(!controller.signal.aborted)setLoadError(issue.message);
    });
    return ()=>controller.abort();
  },[token]);
  const existing=Boolean(market.account);
  const recipient=existing && market.account.username===invitation?.username;
  const setup=Boolean(invitation?.needsPassword && !existing);
  const login=()=>auth.navigate('login','?'+new URLSearchParams({next:'invite',token,username:invitation.username,type:'personal'}));
  async function submit(event){
    event.preventDefault();
    const fields=new FormData(event.currentTarget),password=fields.get('password');
    if(setup && password!==fields.get('confirm')){setError('两次输入的密码不一致');return;}
    setBusy(true);setError('');
    try{
      await market.acceptInvitation({token,...(setup?{password,consent}:{})});
      toast.success('已加入'+invitation.tenant.name);
      auth.close();
    }catch(issue){setError(issue.message);}
    finally{setBusy(false);}
  }
  return <section className="auth-account-center">
    <h1>政企空间邀请</h1>
    {!invitation && <p role={loadError?'alert':'status'}>{loadError || '正在读取邀请…'}</p>}
    {invitation && <>
      <dl className="auth-account-details">
        <div><dt>政企空间</dt><dd>{invitation.tenant.name}</dd></div>
        <div><dt>受邀账号</dt><dd>{invitation.username}</dd></div>
        <div><dt>加入后的角色</dt><dd>{invitation.role}</dd></div>
      </dl>
      {recipient || setup ? <form className="auth-form" onSubmit={submit}>
        {setup && <>
          <FormField id="invite-password" name="password" label="设置登录密码" type="password" autoComplete="new-password" minLength={8} maxLength={64} required/>
          <FormField id="invite-confirm" name="confirm" label="确认密码" type="password" autoComplete="new-password" minLength={8} maxLength={64} required/>
          <div className="auth-agreement"><Checkbox id="invite-consent" checked={consent} onCheckedChange={value=>setConsent(value===true)}/><label htmlFor="invite-consent">同意用户协议和隐私政策</label></div>
        </>}
        <div className="auth-result-actions"><Button disabled={busy || setup && !consent}>确认加入</Button>
          <Button variant="outline" type="button" onClick={auth.close}>暂不加入</Button></div>
      </form>: existing
        ? <Button variant="outline" onClick={async()=>{try{await market.logout();}catch(issue){setError(issue.message);}}}>退出当前账号</Button>
        : <Button onClick={login}>登录受邀账号</Button>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

function AuthBrand({ title, description }) {
  return <section className="auth-enterprise-brand"><h1>{title}</h1><p>{description}</p><img src="/moma_5.12.0_estack/assets/auth/ai-scenarios-light.png" alt="" width="1478" height="1064" /></section>;
}

const applicationSteps=['单位信息','授权信息','确认提交'];

function EnterpriseApplication({ auth }) {
  const [data,setData]=useState({authorized:false,authorizationRole:'',authorizationNote:'',subjectType:'enterprise',
    companyName:'',taxId:'',province:'',city:'',industry:'',contactName:'',contactType:'phone',contactIdentity:auth.user.phone || ''});
  const [step,setStep]=useState(1),[agreed,setAgreed]=useState(false);
  const [resultId,setResultId]=useState(auth.params.get('record')),[editingId,setEditingId]=useState(null),[submitted,setSubmitted]=useState(false);
  const [document,setDocument]=useState(null),[errors,setErrors]=useState({}),[busy,setBusy]=useState(false);
  const heading=useRef(null);
  const result=auth.state.applications.find(item=>item.id===resultId);
  useEffect(()=>{heading.current?.focus({preventScroll:true});window.scrollTo(0,0);},[step,resultId]);
  const update=(key,value)=>{
    setData(current=>({...current,[key]:value,...(key==='province'?{city:''}:{})}));
    setErrors({});
  };
  const nextStep = event => {
    event.preventDefault();
    const invalid = applicationErrors(data, step);
    if (Object.keys(invalid).length) { setErrors(invalid); return; }
    if (step === 2 && !data.authorizationRole) { setErrors({ authorizationRole: '请选择申请人身份' }); return; }
    if (step === 2 && data.authorizationRole === 'authorized-agent' && !data.authorizationNote.trim()) { setErrors({ authorizationNote: '请填写授权说明' }); return; }
    setErrors({}); setStep(step + 1);
  };
  const submit=async event=>{
    event.preventDefault();
    if(busy)return;
    if(!agreed){setErrors({agreement:'请阅读并同意用户协议和隐私政策'});return;}
    setBusy(true);setErrors({});
    try{
      const saved=await auth.certify('certifyEnterprise',{...data,applicationId:editingId});
      setResultId(editingId || saved.operationId);setSubmitted(true);
    }catch(error){setErrors({submit:error.message});}
    finally{setBusy(false);}
  };
  const continueApplication=()=>{
    setData({...Object.fromEntries(Object.keys(data).map(key=>[key,result[key] || ''])),authorized:false,
      contactType:'phone',contactIdentity:auth.user.phone || ''});
    setEditingId(result.id);setResultId(null);setSubmitted(false);setStep(1);setAgreed(false);
  };
  const field = (key, label, props = {}) => <FormField id={`application-${key}`} label={label} error={errors[key]} value={data[key]} onChange={event => update(key, event.target.value)} {...props} />;
  const select = (key, label, options, disabled = false) => <FormSelect id={`application-${key}`} label={label} value={data[key]} options={options} onChange={value => update(key, value)} error={errors[key]} disabled={disabled} />;
  const agreement = <div className="auth-agreement"><div><Checkbox id="application-agreement" checked={agreed} onCheckedChange={value => { setAgreed(value === true); setErrors({}); }} aria-invalid={Boolean(errors.agreement)} aria-describedby={errors.agreement ? 'application-agreement-error' : undefined} /><label htmlFor="application-agreement">已阅读并同意</label><Button variant="link" type="button" onClick={() => setDocument('用户协议')}>用户协议</Button><span>和</span><Button variant="link" type="button" onClick={() => setDocument('隐私政策')}>隐私政策</Button></div>{errors.agreement && <p className="auth-field-error" id="application-agreement-error" role="alert">{errors.agreement}</p>}</div>;
  const summary = (title, rows, editStep) => <section className="auth-review-section"><div className="auth-review-heading"><h3>{title}</h3>{editStep && <Button type="button" variant="link" onClick={() => { setStep(editStep); setErrors({}); }}>修改</Button>}</div><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></section>;
  const title=resultId ? submitted?'申请已提交':'申请进度' : editingId?'补充申请资料':'企业认证';
  return <div className="auth-experience auth-application-page"><div className="auth-layout"><AuthBrand title="完成企业认证" description="核验单位主体与申请人的授权关系。"/><section className="auth-form-panel" aria-label={title}>
    <div className="auth-panel-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2></div>
    {!resultId && <>
      <ol className="auth-steps" aria-label="申请步骤">{applicationSteps.map((label, index) => <li key={label} className={step === index + 1 ? 'current' : step > index + 1 ? 'complete' : ''} aria-current={step === index + 1 ? 'step' : undefined}><span>{step > index + 1 ? <Check /> : index + 1}</span>{label}</li>)}</ol>
      <form className="auth-form" noValidate onSubmit={step === 3 ? submit : nextStep}>
        {step === 1 && <><fieldset className="auth-company-fields"><legend>单位信息</legend><div className="auth-subject-type"><span>单位类型</span>{[['enterprise', '企业'], ['government', '政府机构']].map(([value, label]) => <label key={value}><input type="radio" name="subjectType" value={value} checked={data.subjectType === value} onChange={() => update('subjectType', value)} />{label}</label>)}</div>{field('companyName', '单位全称', { maxLength: 120, placeholder: '请输入登记的单位全称' })}{field('taxId', '统一社会信用代码 / 机构标识', { maxLength: 32, placeholder: '请输入主体登记标识' })}<div className="auth-company-grid auth-region-grid">{select('province', '省份', chinaRegions.map(region => [region.name, region.name]))}{select('city', '城市（选填）', (chinaRegions.find(region => region.name === data.province)?.cities || []).map(city => [city, city]), !data.province)}{select('industry', '所属行业', industries)}</div></fieldset>
        </>}
        {step === 2 && <fieldset className="auth-company-fields"><legend>授权信息</legend><p className="auth-section-note">直接使用当前登录账号申请企业认证。</p><FormField id="application-current-account" label="当前登录账号" value={auth.user?.phone ? maskMemberPhone(auth.user.phone) : '—'} readOnly />{field('contactName', '申请人姓名', { maxLength: 40, autoComplete: 'name', placeholder: '请输入申请人真实姓名' })}{select('authorizationRole', '申请人身份', [['legal-representative', '法定代表人 / 单位负责人'], ['authorized-agent', '授权经办人']])}{field('authorizationNote', data.authorizationRole === 'authorized-agent' ? '授权说明' : '授权说明（选填）', { maxLength: 300, placeholder: '请说明授权来源、办理事项及授权范围' })}</fieldset>}
        {step === 3 && <>{summary('单位信息', [['主体类型', data.subjectType === 'government' ? '政府机构' : '企业'], ['主体全称', data.companyName], ['主体标识', data.taxId], ['所在地区', `中国 · ${data.province}${data.city ? ` · ${data.city}` : ''}`], ['所属行业', industries.find(([code]) => code === data.industry)?.[1]]], 1)}{summary('授权信息', [['当前登录账号', auth.user?.phone ? maskMemberPhone(auth.user.phone) : '—'], ['申请人姓名', data.contactName], ['申请人身份', data.authorizationRole === 'authorized-agent' ? '授权经办人' : '法定代表人 / 单位负责人'], ['授权说明', data.authorizationNote]], 2)}<p className="auth-section-note">提交后核验单位资料与授权关系；审核期间不会新增企业权限或转移个人资源。</p><div className="auth-agreement"><div><Checkbox id="enterprise-authorized" checked={data.authorized === true} onCheckedChange={value => update('authorized', value === true)} /><label htmlFor="enterprise-authorized">确认填写信息真实，并有权代表该单位提交企业认证</label></div></div>{agreement}</>}
        {(auth.storageError || errors.submit) && <p className="auth-field-error" role="alert">{auth.storageError || errors.submit}</p>}
        <div className="auth-company-actions">{step > 1 && <Button variant="outline" type="button" disabled={busy} onClick={() => { setStep(step - 1); setErrors({}); }}>上一步</Button>}<Button type="submit" disabled={busy || Boolean(auth.storageError)}>{busy ? '正在提交…' : step === 1 ? '下一步：授权信息' : step === 2 ? '下一步：确认提交' : '提交认证'}<ArrowRight /></Button></div>
      </form><div className="auth-application-links"><Button variant="link" onClick={() => auth.navigate('account')}>返回账号中心</Button></div>
    </>}
    {resultId && !result && <p role="status">{submitted?'正在读取申请…':'当前账号没有该申请记录。'}</p>}
    {result && <div className="auth-application-result">
      <div className="auth-application-status"><Clock3/><strong>{({'待处理':'审核中','已开通':'已认证','已关闭':'未通过'})[result.status] || result.status}</strong></div>
      {summary('申请记录',[['申请编号',result.id],['主体全称',result.companyName],['提交时间',new Date(result.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})]])}
      {result.processingNote && summary('处理意见',[['意见',result.processingNote]])}
      <div className="auth-result-actions"><Button variant="outline" onClick={()=>auth.navigate('account')}>返回账号中心</Button>
        {result.status==='需补充' && <Button onClick={continueApplication}>补充资料</Button>}
        {result.status==='已关闭' && <Button onClick={()=>{setResultId(null);setSubmitted(false);setEditingId(null);setStep(1);}}>重新申请</Button>}
      </div>
    </div>}
    </section></div>
    <Dialog open={Boolean(document)} onOpenChange={open => { if (!open) setDocument(null); }}><DialogContent className="auth-dialog"><DialogHeader><DialogTitle>{document}</DialogTitle><DialogDescription>协议内容尚未接入，请以正式发布的协议为准。</DialogDescription></DialogHeader><p>当前未加载正式条款。</p><DialogFooter><Button onClick={() => setDocument(null)}>关闭</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
