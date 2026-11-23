import { useChannelText } from './admin-v2/channel-language';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Clock3, LogOut, UserRound } from 'lucide-react';
import { Button, Checkbox, Input, Popover, RadioGroup, Select, Steps, Toast } from '@douyinfe/semi-ui';
import { AuthBrand, LoginPage, PasswordLoginForm } from './components/LoginPage';
import { LOGIN_BASE, loginReturn, loginDestination, openLogin } from './login-navigation.mjs';
import { ADMIN_ROLE_LABELS } from './admin-v2/admin-accounts';
import { cloudAdminRequest } from './admin-v2/admin-client.mjs';
import SiteAgreementLinks from './components/SiteAgreementLinks';
import { PRIVATE_SITE } from './site-config.mjs';
import { chinaRegions, industries } from './admin-v2/enterprise-options';
import { maskMemberPhone } from './member-phone.mjs';
import { authRoute, applicationErrors } from './auth-state.mjs';
import { useTenantData } from './useTenantData';
import { marketRequest } from './CloudMarket';
import './auth.css';

const AccountCenter = lazy(() => import('./AccountCenter'));

const isPublicAuthRoute = route => ['login','password','invite'].includes(route);
export function useAuthNavigation() {
  const [hash,setHash]=useState(()=>location.hash);
  const [adminSession, setAdminSession] = useState(null);
  const adminRoute = hash.startsWith('#/admin');
  const returnTo=useRef(authRoute(location.hash)?'':location.pathname+location.search+location.hash);
  const route=authRoute(hash);
  useEffect(()=>{const sync=()=>setHash(location.hash);addEventListener('hashchange',sync);return()=>removeEventListener('hashchange',sync);},[]);
  useEffect(()=>{
    if (!adminRoute) {
      setAdminSession(null);
      return;
    }
    const controller=new AbortController();
    const refresh=()=>cloudAdminRequest('/auth/me',{signal:controller.signal})
      .then(({account}) => {
        if (!controller.signal.aborted) setAdminSession({ account });
      }, error => {
        if (controller.signal.aborted) return;
        if (error.status === 401 && location.hash.startsWith('#/admin')) openLogin();
        else setAdminSession({ account: null });
      });
    void refresh();
    addEventListener('focus',refresh);
    return()=>{controller.abort();removeEventListener('focus',refresh);};
  },[adminRoute]);
  const requireLogin=useCallback(()=>{if(!isPublicAuthRoute(authRoute(location.hash))&&!location.hash.startsWith('#/admin'))openLogin();},[]);
  const navigate=(target,params='')=>{
    if(!authRoute(location.hash))returnTo.current=location.pathname+location.search+location.hash;
    const query=new URLSearchParams(params.replace(/^\?/,''));
    const source=loginReturn(new URLSearchParams(location.hash.split('?')[1]||'').get('returnTo'))||returnTo.current;
    if(source)query.set('returnTo',source);
    const next='#/auth/'+target+(query.size?'?'+query:'');
    if(location.pathname!==LOGIN_BASE)location.assign(LOGIN_BASE+next);else location.hash=next;
  };
  const close=()=>location.assign(loginReturn(new URLSearchParams(location.hash.split('?')[1]||'').get('returnTo'))||loginReturn(returnTo.current)||LOGIN_BASE);
  return {route,requiresSession:!isPublicAuthRoute(route),params:new URLSearchParams(hash.split('?')[1]||''),navigate,close,requireLogin,adminAccount:adminSession?.account,checkingAdmin:adminRoute && !adminSession};
}

export function CustomerSessionGate({auth,market}) {
  const {loading,error,refresh}=market;
  const {requireLogin}=auth;
  useEffect(()=>{
    if (!loading && !error) requireLogin();
  },[loading,error,requireLogin]);
  return <section className="content" aria-label="登录状态">
    {error ? <><p role="alert">{error}</p><Button onClick={refresh}>重试</Button></>
      : <p role="status">正在检查登录状态…</p>}
  </section>;
}

export function AuthBanner({ auth, market, onSwitchSpace, admin = false }) {
  const [open,setOpen]=useState(false), [switching,setSwitching]=useState(false);
  const translateLabel = useChannelText();
  if(admin)return auth.adminAccount ? <Popover trigger="click" position="bottomRight" showArrow={false}
    content={<div className="auth-account-menu"><div className="auth-menu-profile"><b>{auth.adminAccount.name}</b><span>{translateLabel(ADMIN_ROLE_LABELS[auth.adminAccount.role] || auth.adminAccount.role)}</span></div>
    <Button theme="borderless" icon={<LogOut size={16}/>} onClick={async()=>{
      try {
        await market.logout();
        openLogin(LOGIN_BASE);
      } catch(error) {Toast.error(error.message);}
    }}>{translateLabel('退出登录', 'Sign Out')}</Button></div>}>
    <Button theme="borderless" className="auth-banner-user" aria-label="账号菜单" icon={<UserRound size={16}/>}>{auth.adminAccount.name}<ChevronDown size={14}/></Button>
  </Popover> : null;
  async function switchSpace(id) {
    if (switching || id===market.tenant.id) return;
    setSwitching(true);
    try {
      const {tenant} = await market.switchSpace(id);
      setOpen(false);
      onSwitchSpace?.(tenant);
    }
    catch (error) { Toast.error(error.message); }
    finally { setSwitching(false); }
  }
  const navigate=route=>{setOpen(false);auth.navigate(route);};
  if(market?.tenant)return <div className="auth-banner-actions">
    <Popover trigger="click" position="bottomRight" visible={open} onVisibleChange={setOpen} showArrow={false}
      content={({initialFocusRef})=><div className="auth-account-menu" tabIndex={-1} ref={initialFocusRef}>
      <div className="auth-menu-profile"><b>{market.account?.username}</b><span>{market.tenant.name}</span></div>
      {market.spaces?.length > 1 && <div className="auth-space-menu" role="group" aria-label="切换使用空间">
        <p>切换使用空间</p>
        {market.spaces.map(space=><Button key={space.id} type="tertiary" theme="borderless" aria-current={space.id===market.tenant.id || undefined}
          disabled={switching || space.id===market.tenant.id} onClick={()=>void switchSpace(space.id)}>
          <span>{space.type==='个人' ? '个人空间' : space.name}</span>
          {space.id===market.tenant.id && <Check aria-hidden="true"/>}
        </Button>)}
      </div>}
      <Button type="tertiary" theme="borderless" icon={<UserRound size={16}/>} onClick={()=>navigate('account')}>账号中心</Button>
      <Button type="tertiary" theme="borderless" icon={<LogOut size={16}/>} onClick={async()=>{
        try{await market.logout();setOpen(false);if(auth.route)auth.close();}catch(error){Toast.error(error.message);}
      }}>退出登录</Button>
    </div>}>
      <Button theme="borderless" className="auth-banner-user" aria-label="账号菜单" aria-expanded={open}
        icon={<UserRound size={16}/>}><span>{market.account?.name || market.tenant.name}</span><ChevronDown size={14}/></Button>
    </Popover>
  </div>;
  return <div className="auth-banner-actions">
    <Button theme="borderless" className="auth-banner-login" onClick={()=>navigate('login')}>登录</Button>
  </div>;
}

function FormField({ label, id, error, children, ...props }) {
  return <div className="auth-field" data-invalid={Boolean(error)}><label id={id+'-label'} htmlFor={id}>{label}</label>{children || <Input id={id}
    validateStatus={error ? 'error' : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />}
    {error && <p className="auth-field-error" id={`${id}-error`} role="alert">{error}</p>}</div>;
}
function FormSelect({ id, label, value, options, onChange, disabled, error }) {
  return <FormField id={id} label={label} error={error}><Select id={id} aria-labelledby={id+'-label'} value={value || undefined}
    validateStatus={error ? 'error' : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
    onChange={onChange} disabled={disabled} placeholder="请选择" optionList={options.map(([value,label])=>({value,label}))} /></FormField>;
}

export default function AuthExperience({auth,market,accountTitle='账号中心'}) {
  if(auth.route==='login')return <TenantLogin auth={auth} market={market}/>;
  if(market.loading)return <section className="auth-account-center"><h1>{accountTitle}</h1><p role="status">正在读取账号信息…</p></section>;
  if(auth.route==='password')return <TenantPassword auth={auth} market={market}/>;
  if(auth.route==='invite')return <TenantInvite auth={auth} market={market}/>;
  if(market.tenant)return <Suspense fallback={<p role="status">正在读取账号信息…</p>}><TenantAccount auth={auth} title={accountTitle}/></Suspense>;
  return <section className="auth-account-center"><h1>{accountTitle}</h1>
    {market.error && <p role="alert">{market.error}</p>}
    <Button onClick={()=>auth.navigate('login','?next=account')}>登录</Button>
  </section>;
}

function TenantLogin({auth,market}) {
  const [spaces,setSpaces]=useState([]), [spaceId,setSpaceId]=useState('');
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  const enterpriseLogin = useRef(null);
  const finish = account => {
    if(account) location.assign(loginDestination(auth.params.get('returnTo'),account));
    else if(auth.params.get('next')==='account') auth.navigate('account');
    else if(auth.params.get('next')==='invite') auth.navigate('invite','?'+new URLSearchParams({token:auth.params.get('token') || ''}));
    else location.assign(loginDestination(auth.params.get('returnTo')));
  };
  async function login(identifier, accessCode) {
    const loginHash = location.hash;
    const result = await market.login(identifier,accessCode);
    if (location.hash !== loginHash) return;
    if (result.selectEnterprise) {
      enterpriseLogin.current = {identifier, accessCode};
      setSpaces(result.spaces);
      return;
    }
    if (!result.account && result.spaces.length > 1) {
      setSpaces(result.spaces);
      return;
    }
    finish(result.account);
  }
  async function enterSpace(event) {
    event.preventDefault();
    if (busy || !spaceId) return;
    setBusy(true);setError('');
    try {
      const credentials = enterpriseLogin.current;
      const {account} = credentials
        ? await market.login(credentials.identifier,credentials.accessCode,spaceId)
        : await market.switchSpace(spaceId);
      enterpriseLogin.current = null;
      finish(account);
    }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  const enterprise = Boolean(enterpriseLogin.current);
  const resetEnterpriseLogin = () => {
    enterpriseLogin.current = null;
    setSpaces([]);setSpaceId('');setError('');
  };
  return <LoginPage title={enterprise ? '选择企业空间' : spaces.length ? '选择使用空间' : '登录'}
    onBack={enterprise ? (busy ? undefined : resetEnterpriseLogin) : market.tenant && !spaces.length ? auth.close : undefined}>
    {spaces.length ? <form className="auth-form" onSubmit={enterSpace}>
      <FormSelect id="login-space" label={enterprise ? '企业空间' : '使用空间'} options={spaces.map(space=>[space.id,space.type==='个人'?'个人空间':space.name])}
        value={spaceId} onChange={setSpaceId} disabled={busy}/>
      {error && <p className="auth-field-error" role="alert">{error}</p>}
      <Button theme="solid" htmlType="submit" loading={busy} disabled={!spaceId}>进入空间</Button>
    </form> : <>
      <PasswordLoginForm label="账号" placeholder="用户名、手机号或邮箱" accountId={auth.params.get('username') || ''} onLogin={login}/>
      <Button theme="borderless" className="auth-forgot" onClick={()=>auth.navigate('password','?mode=reset')}>忘记密码？</Button>
    </>}
  </LoginPage>;
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
      Toast.success('密码已更新，请重新登录');
      auth.navigate('login');
    });
  }
  return <LoginPage title={recovery?'找回密码':'修改密码'}>
    <form className="auth-form" onSubmit={submit}>
      {recovery?<><FormField id="password-phone" label="手机号" value={phone} onChange={value=>{setPhone(value);setChallenge(null);}} autoComplete="tel" disabled={busy} required/>
        <FormField id="password-code" label="验证码">
          <div className="auth-code-row">
            <Input id="password-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required/>
            <Button type="tertiary" disabled={busy || !phone}
              onClick={()=>run(async()=>setChallenge(await marketRequest('password-code',{phone})))}>获取验证码</Button>
          </div>
        </FormField>
        {challenge && <p className="auth-form-note" role="status">演示验证码 {challenge.code}，5 分钟内有效。</p>}
      </>:<FormField id="password-current" label="当前密码" name="current" type="password" autoComplete="current-password" required/>}
      <FormField id="password-new" label="新密码" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={64} required/>
      <FormField id="password-confirm" label="确认新密码" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={64} required/>
      {error && <p className="auth-field-error" role="alert">{error}</p>}
      <div className="auth-result-actions"><Button theme="solid" htmlType="submit" loading={busy}>保存密码</Button>
        <Button type="tertiary" onClick={()=>auth.navigate(market.tenant?'account':'login')}>返回</Button></div>
    </form>
  </LoginPage>;
}

function TenantAccount({auth,title}) {
  const tenant=useTenantData();
  if(!tenant.profile)return <section className="auth-account-center"><h1>{title}</h1>
    {tenant.error ? <p role="alert">{tenant.error}</p> : <p role="status">正在读取账号信息…</p>}
    <Button type="tertiary" onClick={auth.close}>返回</Button></section>;
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
      Toast.success('已加入'+invitation.tenant.name);
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
          <div className="auth-agreement"><div>
            <Checkbox checked={consent} onChange={event=>setConsent(event.target.checked)}
              aria-label="同意用户协议和隐私政策">{PRIVATE_SITE ? '同意' : '同意用户协议和隐私政策'}</Checkbox>
            {PRIVATE_SITE && <SiteAgreementLinks />}
          </div></div>
        </>}
        <div className="auth-result-actions"><Button theme="solid" htmlType="submit" loading={busy} disabled={setup && !consent}>确认加入</Button>
          <Button type="tertiary" onClick={auth.close}>暂不加入</Button></div>
      </form>: existing
        ? <Button type="tertiary" onClick={async()=>{try{await market.logout();}catch(issue){setError(issue.message);}}}>退出当前账号</Button>
        : <Button onClick={login}>登录受邀账号</Button>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

const applicationSteps=['单位信息','授权信息','确认提交'];

function EnterpriseApplication({ auth }) {
  const [data,setData]=useState({authorized:false,authorizationRole:'',authorizationNote:'',subjectType:'enterprise',
    companyName:'',taxId:'',province:'',city:'',industry:'',contactName:'',contactType:'phone',contactIdentity:auth.user.phone || ''});
  const [step,setStep]=useState(1),[agreed,setAgreed]=useState(false);
  const [resultId,setResultId]=useState(auth.params.get('record')),[editingId,setEditingId]=useState(null),[submitted,setSubmitted]=useState(false);
  const [errors,setErrors]=useState({}),[busy,setBusy]=useState(false);
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
  const field = (key, label, props = {}) => <FormField id={`application-${key}`} label={label} error={errors[key]} value={data[key]} onChange={value => update(key, value)} {...props} />;
  const select = (key, label, options, disabled = false) => <FormSelect id={`application-${key}`} label={label} value={data[key]} options={options} onChange={value => update(key, value)} error={errors[key]} disabled={disabled} />;
  const agreement = <div className="auth-agreement"><div>
    <Checkbox checked={agreed} onChange={event => { setAgreed(event.target.checked); setErrors({}); }}
      aria-label="已阅读并同意用户协议和隐私政策" aria-invalid={Boolean(errors.agreement)}
      aria-describedby={errors.agreement ? 'application-agreement-error' : undefined}>已阅读并同意</Checkbox>
    <SiteAgreementLinks />
  </div>{errors.agreement && <p className="auth-field-error" id="application-agreement-error" role="alert">{errors.agreement}</p>}</div>;
  const summary = (title, rows, editStep) => <section className="auth-review-section"><div className="auth-review-heading"><h3>{title}</h3>{editStep && <Button theme="borderless" onClick={() => { setStep(editStep); setErrors({}); }}>修改</Button>}</div><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></section>;
  const title=resultId ? submitted?'申请已提交':'申请进度' : editingId?'补充申请资料':'企业认证';
  return <div className="auth-experience auth-application-page"><div className="auth-layout"><AuthBrand title="完成企业认证" description="核验单位主体与申请人的授权关系。"/><section className="auth-form-panel" aria-label={title}>
    <div className="auth-panel-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2></div>
    {!resultId && <>
      <Steps type="basic" className="auth-steps" aria-label="申请步骤" current={step-1} size="small">
        {applicationSteps.map(label => <Steps.Step key={label} title={label} />)}
      </Steps>
      <form className="auth-form" noValidate onSubmit={step === 3 ? submit : nextStep}>
        {step === 1 && <><fieldset className="auth-company-fields"><legend>单位信息</legend><div className="auth-subject-type"><span>单位类型</span><RadioGroup aria-label="单位类型" direction="horizontal" value={data.subjectType} onChange={event => update('subjectType',event.target.value)} options={[{value:'enterprise',label:'企业'},{value:'government',label:'政府机构'}]} /></div>{field('companyName', '单位全称', { maxLength: 120, placeholder: '请输入登记的单位全称' })}{field('taxId', '统一社会信用代码 / 机构标识', { maxLength: 32, placeholder: '请输入主体登记标识' })}<div className="auth-company-grid auth-region-grid">{select('province', '省份', chinaRegions.map(region => [region.name, region.name]))}{select('city', '城市（选填）', (chinaRegions.find(region => region.name === data.province)?.cities || []).map(city => [city, city]), !data.province)}{select('industry', '所属行业', industries)}</div></fieldset>
        </>}
        {step === 2 && <fieldset className="auth-company-fields"><legend>授权信息</legend><p className="auth-section-note">直接使用当前登录账号申请企业认证。</p><FormField id="application-current-account" label="当前登录账号" value={auth.user?.phone ? maskMemberPhone(auth.user.phone) : '—'} readonly />{field('contactName', '申请人姓名', { maxLength: 40, autoComplete: 'name', placeholder: '请输入申请人真实姓名' })}{select('authorizationRole', '申请人身份', [['legal-representative', '法定代表人 / 单位负责人'], ['authorized-agent', '授权经办人']])}{field('authorizationNote', data.authorizationRole === 'authorized-agent' ? '授权说明' : '授权说明（选填）', { maxLength: 300, placeholder: '请说明授权来源、办理事项及授权范围' })}</fieldset>}
        {step === 3 && <>{summary('单位信息', [['主体类型', data.subjectType === 'government' ? '政府机构' : '企业'], ['主体全称', data.companyName], ['主体标识', data.taxId], ['所在地区', `中国 · ${data.province}${data.city ? ` · ${data.city}` : ''}`], ['所属行业', industries.find(([code]) => code === data.industry)?.[1]]], 1)}{summary('授权信息', [['当前登录账号', auth.user?.phone ? maskMemberPhone(auth.user.phone) : '—'], ['申请人姓名', data.contactName], ['申请人身份', data.authorizationRole === 'authorized-agent' ? '授权经办人' : '法定代表人 / 单位负责人'], ['授权说明', data.authorizationNote]], 2)}<p className="auth-section-note">提交后核验单位资料与授权关系；审核期间不会新增企业权限或转移个人资源。</p><div className="auth-agreement"><div><Checkbox checked={data.authorized === true} onChange={event => update('authorized', event.target.checked)}>确认填写信息真实，并有权代表该单位提交企业认证</Checkbox></div></div>{agreement}</>}
        {(auth.storageError || errors.submit) && <p className="auth-field-error" role="alert">{auth.storageError || errors.submit}</p>}
        <div className="auth-company-actions">{step > 1 && <Button type="tertiary" disabled={busy} onClick={() => { setStep(step - 1); setErrors({}); }}>上一步</Button>}<Button theme="solid" htmlType="submit" loading={busy} disabled={Boolean(auth.storageError)}>{busy ? '正在提交…' : step === 1 ? '下一步：授权信息' : step === 2 ? '下一步：确认提交' : '提交认证'}<ArrowRight /></Button></div>
      </form><div className="auth-application-links"><Button theme="borderless" onClick={() => auth.navigate('account')}>返回账号中心</Button></div>
    </>}
    {resultId && !result && <p role="status">{submitted?'正在读取申请…':'当前账号没有该申请记录。'}</p>}
    {result && <div className="auth-application-result">
      <div className="auth-application-status"><Clock3/><strong>{({'待处理':'审核中','已开通':'已认证','已关闭':'未通过'})[result.status] || result.status}</strong></div>
      {summary('申请记录',[['申请编号',result.id],['主体全称',result.companyName],['提交时间',new Date(result.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})]])}
      {result.processingNote && summary('处理意见',[['意见',result.processingNote]])}
      <div className="auth-result-actions"><Button type="tertiary" onClick={()=>auth.navigate('account')}>返回账号中心</Button>
        {result.status==='需补充' && <Button onClick={continueApplication}>补充资料</Button>}
        {result.status==='已关闭' && <Button onClick={()=>{setResultId(null);setSubmitted(false);setEditingId(null);setStep(1);}}>重新申请</Button>}
      </div>
    </div>}
    </section></div>
  </div>;
}
