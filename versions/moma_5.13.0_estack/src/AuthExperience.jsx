import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, Check, ChevronDown, Clock3, Eye, EyeOff, KeyRound, LogOut, ShieldCheck, UserRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from './components/ui/input-group';
import { Checkbox } from './components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { Popover, PopoverTrigger, PopoverContent } from './components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from './components/ui/select';
import { Toaster } from './components/ui/sonner';
import { chinaRegions, industries } from './admin-v2/enterprise-options';
import { maskMemberPhone } from './organization-data.mjs';
import { AUTH_STORAGE_KEY, AUTH_INVITE, AUTH_ENTERPRISE_LOGIN, normalizeAuthLogin, emptyAuthState, authRoute, authPhone, currentAuthUser, availableAuthSpaces, registerAuthAccount, loginAuthAccount, verifyAuthCode, submitEnterpriseCertification, applicationErrors, queryAuthApplication, activationAccount, activateAuthAccount, acceptAuthInvite, encodeAuthPassword, matchesAuthPassword } from './auth-state.mjs';
import AccountCenter from './AccountCenter';
import './auth.css';

export function usePrototypeAuth() {
  const [loaded] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return { state: emptyAuthState(), error: '' };
      const state = JSON.parse(raw);
      if (!['accounts', 'memberships', 'applications'].every(key => Array.isArray(state[key]) && state[key].every(item => item && typeof item === 'object'))) throw new Error();
      return { state, error: '' };
    } catch { return { state: emptyAuthState(), error: '账号资料读取失败，请检查浏览器存储后重试。' }; }
  });
  const [state, setState] = useState(loaded.state), [hash, setHash] = useState(() => location.hash), [draftPhone, setDraftPhone] = useState('');
  const route = authRoute(hash);
  const returnTo = useRef(authRoute(location.hash) ? '' : location.hash);
  useEffect(() => {
    const sync = () => setHash(location.hash);
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);
  const navigate = (target, params = '', confirmed = false) => {
    if (!confirmed) { const proceed = () => navigate(target, params, true); if (window.dispatchEvent(new CustomEvent('moma-project-navigation', { cancelable: true, detail: proceed }))) proceed(); return; }
    if (!authRoute(location.hash)) returnTo.current = location.hash;
    location.hash = `/auth/${target}${params}`;
  };
  const close = () => { location.hash = returnTo.current; };
  const commit = next => {
    if (loaded.error) throw new Error(loaded.error);
    try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error('账号资料未能保存，请检查浏览器存储并重试'); }
    setState(next);
    return next;
  };
  return { state, route, params: new URLSearchParams(hash.split('?')[1] || ''), draftPhone, setDraftPhone, navigate, close, commit, storageError: loaded.error, user: currentAuthUser(state), spaces: availableAuthSpaces(state) };
}

export function AuthBanner({ auth, showToast }) {
  const [open, setOpen] = useState(false), [spacesOpen, setSpacesOpen] = useState(false);
  const currentSpace = auth.spaces.find(space => space.id === auth.state.activeSpace);
  const navigate = route => { setOpen(false); auth.navigate(route); };
  const switchSpace = (space, confirmed = false) => {
    if (!confirmed) { const proceed = () => switchSpace(space, true); if (window.dispatchEvent(new CustomEvent('moma-project-navigation', { cancelable: true, detail: proceed }))) proceed(); return; }
    try { auth.commit({ ...auth.state, activeSpace: space.id }); setSpacesOpen(false); toast.success(`已切换至${space.name}`); }
    catch (error) { toast.error(error.message); }
  };
  return <div className="auth-banner-actions">
    {showToast && <Toaster position="top-right" offset={64} mobileOffset={64} />}
    {auth.user && <Popover open={spacesOpen} onOpenChange={setSpacesOpen}><PopoverTrigger asChild><Button variant="ghost" className="auth-banner-space" aria-label="切换使用空间">{currentSpace?.name || '选择使用空间'}<ChevronDown data-icon="inline-end" /></Button></PopoverTrigger><PopoverContent className="auth-space-menu" align="end"><p>切换使用空间</p>{auth.spaces.map(space => <Button variant="ghost" key={space.id} onClick={() => switchSpace(space)}><span>{space.id === 'personal' ? <UserRound /> : <Building2 />}<span>{space.name}<small>{space.role}</small></span></span>{space.id === auth.state.activeSpace && <Check data-icon="inline-end" />}</Button>)}{!auth.spaces.length && <p>暂无可访问的空间，请联系管理员。</p>}<Button variant="ghost" onClick={() => { setSpacesOpen(false); auth.navigate('account'); }}><ShieldCheck data-icon="inline-start" />身份认证</Button></PopoverContent></Popover>}
    {!auth.user && <><Button variant="ghost" className="auth-banner-login" onClick={() => auth.navigate('login')}>登录</Button><Button variant="outline" className="auth-banner-register" onClick={() => auth.navigate('register')}>注册</Button></>}
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" className="auth-banner-user" aria-label={auth.user ? '账号菜单' : '账号服务'}>{auth.user ? <><UserRound data-icon="inline-start" />{auth.user.name}</> : '账号服务'}<ChevronDown data-icon="inline-end" /></Button></PopoverTrigger><PopoverContent className="auth-account-menu" align="end">
      {auth.user && <div className="auth-menu-profile"><b>{auth.user.name}</b><span>{auth.user.phone ? maskMemberPhone(auth.user.phone) : auth.user.email}</span></div>}
      <Button variant="ghost" onClick={() => navigate('account')}><UserRound data-icon="inline-start" />账号中心</Button>
      <Button variant="ghost" onClick={() => { setOpen(false); auth.navigate('invite', `?token=${AUTH_INVITE.id}`); }}><Users data-icon="inline-start" />加入企业</Button>
      {auth.user && <>{auth.user.phone ? <Button variant="ghost" onClick={() => navigate('password')}><KeyRound data-icon="inline-start" />设置登录密码</Button> : <p className="auth-form-note">密码重置请联系企业管理员</p>}<Button variant="ghost" onClick={() => { const proceed=()=>{try { auth.commit({ ...auth.state,currentUserId:null });setOpen(false);auth.navigate('login', '', true);toast.success('已退出登录'); }catch(error){toast.error(error.message);}}; if(window.dispatchEvent(new CustomEvent('moma-project-navigation',{cancelable:true,detail:proceed})))proceed(); }}><LogOut data-icon="inline-start" />退出登录</Button></>}
    </PopoverContent></Popover>
  </div>;
}

function FormField({ label, id, error, children, ...props }) {
  return <div className="auth-field" data-invalid={Boolean(error)}><label htmlFor={id}>{label}</label>{children || <Input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />}{error && <p className="auth-field-error" id={`${id}-error`} role="alert">{error}</p>}</div>;
}
function PasswordInput({ id, value, onChange, autoComplete = 'current-password', error }) {
  const [visible, setVisible] = useState(false);
  return <InputGroup><InputGroupInput id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} maxLength={64} placeholder="请输入密码" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /><InputGroupAddon align="inline-end"><InputGroupButton aria-label={visible ? '隐藏密码' : '显示密码'} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup>;
}
function FormSelect({ id, label, value, options, onChange, disabled, error }) {
  return <FormField id={id} label={label} error={error}><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent><SelectGroup>{options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></FormField>;
}

export default function AuthExperience({ auth, accountTitle = '账号中心' }) {
  if (['account', 'enterprise'].includes(auth.route) && !auth.user) return <div className="auth-account-center"><h1>{accountTitle}</h1><p>请先注册或登录，再进行身份认证。</p><div className="auth-result-actions"><Button onClick={() => auth.navigate('login', '?next=account')}>登录</Button><Button variant="outline" onClick={() => auth.navigate('register', '?next=account')}>注册账号</Button></div></div>;
  if (auth.route === 'account') return <AccountCenter auth={auth} title={accountTitle} />;
  return ['enterprise', 'application', 'activate'].includes(auth.route) ? <EnterpriseApplication key={auth.params.toString()} auth={auth} /> : <IdentityExperience key={auth.params.toString()} auth={auth} />;
}

function AuthBrand({ title, description }) {
  return <section className="auth-enterprise-brand"><h1>{title}</h1><p>{description}</p><img src="/moma_5.13.0_estack/assets/auth/ai-scenarios-light.png" alt="" width="1478" height="1064" /></section>;
}

function IdentityExperience({ auth }) {
  const route = auth.route;
  const [phone, setPhone] = useState(auth.draftPhone || (route === 'password' ? auth.user?.phone || '' : ''));
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState('');
  const [loginMode, setLoginMode] = useState(auth.params.get('type') === 'enterprise' && AUTH_ENTERPRISE_LOGIN.includes('email') ? 'password' : 'code'), [agreed, setAgreed] = useState(false), [errors, setErrors] = useState({}), [busy, setBusy] = useState(false);
  const [userType, setUserType] = useState(auth.params.get('type') === 'enterprise' ? 'enterprise' : 'personal');
  const [completed, setCompleted] = useState('');
  const [choosingEnterprise, setChoosingEnterprise] = useState(false), [enterpriseId, setEnterpriseId] = useState('');
  const [challenge, setChallenge] = useState(null), [codeOpen, setCodeOpen] = useState(false), [now, setNow] = useState(Date.now()), [document, setDocument] = useState(null);
  const [inviteVerified, setInviteVerified] = useState(Boolean(auth.user));
  const enterpriseLogin = route === 'login' && userType === 'enterprise';
  const allowPhoneCode = !enterpriseLogin || AUTH_ENTERPRISE_LOGIN.includes('phone');
  const emailLogin = enterpriseLogin && loginMode === 'password' && AUTH_ENTERPRISE_LOGIN.includes('email');
  const emailOnly = emailLogin && !AUTH_ENTERPRISE_LOGIN.includes('phone');
  const busyRef = useRef(false), heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [completed, choosingEnterprise]);
  useEffect(() => {
    const previous = window.document.title;
    window.document.title = 'MoMA · 账号与政企服务';
    return () => { window.document.title = previous; };
  }, []);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const resend = challenge ? Math.max(0, Math.ceil((challenge.issuedAt + 60000 - now) / 1000)) : 0;
  const token = auth.params.get('token');
  const inviteError = token !== AUTH_INVITE.id ? '邀请不存在或已撤销，请联系邀请人。' : now >= Date.parse(AUTH_INVITE.expiresAt) ? '邀请已过期，请联系邀请人重新邀请。' : '';
  const navigate = target => { auth.setDraftPhone(phone.includes('@') ? '' : phone); auth.navigate(target, auth.params.get('next') === 'account' ? '?next=account' : target === 'login' && userType === 'enterprise' ? '?type=enterprise' : ''); };
  const changeUserType = value => {
    setUserType(value); setErrors({}); setCode(''); setChallenge(null); auth.navigate('login', value === 'enterprise' ? '?type=enterprise' : '');
  };
  const changePhone = value => { setPhone(value); setCode(''); setChallenge(null); setPassword(''); setErrors({}); };
  const run = async operation => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setErrors({});
    try { await operation(); }
    catch (error) { setErrors({ submit: error.message }); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const getCode = () => {
    try {
      const normalized = authPhone(phone);
      if (resend) return;
      const issuedAt = Date.now();
      setChallenge({ identity: normalized, type: 'phone', purpose: route, code: String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0'), issuedAt, attempts: 0 });
      setCode(''); setNow(issuedAt); setCodeOpen(true); setErrors({});
    } catch (error) { setErrors({ phone: error.message }); }
  };
  const verify = () => {
    try { verifyAuthCode(challenge, { identity: phone, code, purpose: route }); }
    catch (error) { if (challenge) setChallenge({ ...challenge, attempts: challenge.attempts + 1 }); setErrors({ code: error.message }); return false; }
    return true;
  };
  const requireAgreement = () => { if (agreed) return true; setErrors({ agreement: auth.preview ? '请核对填写信息' : '请阅读并同意用户协议和隐私政策' }); return false; };
  const submitIdentity = event => {
    event.preventDefault();
    run(async () => {
      let normalized;
      try { normalized = route === 'login' && loginMode === 'password' ? normalizeAuthLogin(phone, userType) : authPhone(phone); } catch (error) { setErrors({ phone: error.message }); return; }
      if (route !== 'password' && !requireAgreement()) return;
      if (route === 'invite' && normalized !== AUTH_INVITE.phone) { setErrors({ phone: '该手机号与受邀手机号不一致，请核对邀请信息' }); return; }
      if (route === 'login' && loginMode === 'password') {
        let existing;
        try { existing = currentAuthUser(loginAuthAccount(auth.state, normalized, userType)); } catch (error) { setErrors({ phone: error.message }); return; }
        if (!existing.credential) { setErrors({ password: normalized.includes('@') ? '该邮箱尚未设置登录密码，请联系企业管理员' : '尚未设置密码，请使用验证码登录或找回密码' }); return; }
        if (!await matchesAuthPassword(password, existing.credential)) { setErrors({ password: '密码错误，请重试' }); return; }
      } else if (!verify()) return;
      if (route === 'password') {
        const existing = auth.state.accounts.find(item => item.phone === normalized);
        if (!existing || existing.status !== '正常' || existing.activation) throw new Error('请核对手机号及账号状态');
        if (password !== confirmPassword) { setErrors({ confirmPassword: '两次输入的密码不一致' }); return; }
        let credential;
        try { credential = await encodeAuthPassword(password); } catch (error) { setErrors({ password: error.message }); return; }
        auth.commit({ ...auth.state, accounts: auth.state.accounts.map(item => item.id === existing.id ? { ...item, credential } : item) });
        setChallenge(null); setPassword(''); setConfirmPassword(''); setCompleted('password');
        return;
      }
      const next = route === 'register' ? registerAuthAccount(auth.state, { phone: normalized }) : loginAuthAccount(auth.state, normalized, route === 'login' ? userType : 'personal');
      auth.commit(next); setChallenge(null); auth.setDraftPhone(normalized.includes('@') ? '' : normalized);
      if (route === 'invite') setInviteVerified(true);
      else if (route === 'login' && next.activeSpace === null) setChoosingEnterprise(true);
      else if (route === 'register') { toast.success('注册成功，已登录'); auth.navigate('account', '?registered=1'); }
      else { toast.success('登录成功'); if (auth.params.get('next') === 'account') auth.navigate('account'); else auth.close(); }
    });
  };
  const acceptInvite = () => run(() => { auth.commit(acceptAuthInvite(auth.state, token)); setCompleted('invite'); });
  const invitePage = route === 'invite';
  const titles = { login: choosingEnterprise ? '选择企业' : '登录', register: '注册', invite: completed ? '已加入企业' : '邀请你加入企业', password: completed ? '密码已设置' : auth.user ? '设置登录密码' : '找回密码' };
  const descriptions = { login: choosingEnterprise ? '请选择本次要进入的企业空间' : userType === 'enterprise' ? '使用企业管理员或成员账号，进入已加入的企业' : '使用个人手机号，进入个人空间', register: '使用手机号创建账号', invite: '核对邀请信息，加入企业协作', password: completed ? '密码已更新。请妥善保管登录信息。' : '验证手机号后，设置新的登录密码' };
  const identityForm = !completed && !choosingEnterprise && !(invitePage && (inviteError || inviteVerified));
  const errorMessage = auth.storageError || errors.submit;
  const agreement = <div className="auth-agreement"><div><Checkbox id="auth-agreement" checked={agreed} onCheckedChange={value => { setAgreed(value === true); setErrors({}); }} aria-invalid={Boolean(errors.agreement)} aria-describedby={errors.agreement ? 'auth-agreement-error' : undefined} /><label htmlFor="auth-agreement">{auth.preview ? '已核对填写信息' : '已阅读并同意'}</label><Button variant="link" type="button" onClick={() => setDocument('用户协议')}>用户协议</Button><span>和</span><Button variant="link" type="button" onClick={() => setDocument('隐私政策')}>隐私政策</Button></div>{errors.agreement && <p id="auth-agreement-error" className="auth-field-error" role="alert">{errors.agreement}</p>}</div>;
  const phoneField = route === 'register' ? <FormField id="auth-phone" label="手机号码" error={errors.phone}><InputGroup><InputGroupAddon>+86</InputGroupAddon><InputGroupInput id="auth-phone" type="tel" autoComplete="tel-national" inputMode="tel" maxLength={24} placeholder="请输入手机号" value={phone} onChange={event => changePhone(event.target.value)} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'auth-phone-error' : undefined} /></InputGroup></FormField> : <FormField id="auth-phone" label={emailLogin ? emailOnly ? '企业邮箱' : '手机号或企业邮箱' : '手机号码'} error={errors.phone} type={emailLogin ? emailOnly ? 'email' : 'text' : 'tel'} autoComplete={emailLogin ? 'username' : 'tel'} inputMode={emailLogin ? emailOnly ? 'email' : 'text' : 'tel'} maxLength={emailLogin ? 254 : 24} placeholder={emailLogin ? emailOnly ? '请输入企业邮箱' : '请输入手机号或企业邮箱' : '11 位大陆手机号或 +国家区号号码'} value={phone} onChange={event => changePhone(event.target.value)} />;
  const codeField = <FormField id="auth-code" label="短信验证码" error={errors.code}><div className="auth-code-input"><Input id="auth-code" inputMode="numeric" autoComplete="one-time-code" placeholder="请输入 6 位验证码" maxLength={6} value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, '')); setErrors({}); }} aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? 'auth-code-error' : undefined} /><Button type="button" variant="outline" onClick={getCode} disabled={Boolean(resend) || busy}>{resend ? `${resend}s 后重发` : '获取验证码'}</Button></div>{challenge && <Button type="button" variant="link" className="auth-code-review" onClick={() => setCodeOpen(true)}>查看验证信息</Button>}</FormField>;
  return <div className="auth-experience auth-application-page auth-identity-page">
    {auth.user && <div className="auth-page-top"><span>当前账号 {auth.user.phone ? maskMemberPhone(auth.user.phone) : auth.user.email}</span></div>}
    <div className="auth-layout">
      <AuthBrand title={route === 'register' ? '创建账号，开始接入' : route === 'invite' ? '加入团队，协作创新' : route === 'password' ? '管理账号，安全接入' : '连接模型能力'} description={route === 'register' ? '使用手机号注册账号。' : route === 'invite' ? '确认邀请，进入政企空间。' : route === 'password' ? '验证账号，设置登录密码。' : '个人探索与政企协作，从这里开始。'} />
      <section className="auth-form-panel" aria-label={titles[route]}>
        <div className="auth-panel-heading"><div className="auth-heading-row"><h2 tabIndex={-1} ref={heading}>{titles[route]}</h2></div><p>{descriptions[route]}</p></div>
        {route === 'login' && !choosingEnterprise && !completed && <div className="auth-user-type" role="group" aria-label="用户类型"><Button variant="ghost" aria-pressed={userType !== 'enterprise'} onClick={() => changeUserType('personal')}><UserRound />个人用户</Button><Button variant="ghost" aria-pressed={userType === 'enterprise'} onClick={() => changeUserType('enterprise')}><Building2 />政企用户</Button></div>}
        {route === 'login' && !choosingEnterprise && !completed && allowPhoneCode && <Tabs value={loginMode} onValueChange={value => { setLoginMode(value); setChallenge(null); setCode(''); setPassword(''); if (value === 'code' && phone.includes('@')) setPhone(''); setErrors({}); }}><TabsList variant="line" className="auth-tabs"><TabsTrigger value="code" id="auth-tab-code" aria-controls="auth-identity-panel">验证码登录</TabsTrigger><TabsTrigger value="password" id="auth-tab-password" aria-controls="auth-identity-panel">密码登录</TabsTrigger></TabsList></Tabs>}
        {invitePage && !completed && <div className="auth-invitation"><Building2 /><h3>{AUTH_INVITE.enterprise}</h3><dl><div><dt>邀请人</dt><dd>{AUTH_INVITE.inviter}</dd></div><div><dt>所属部门</dt><dd>{AUTH_INVITE.department}</dd></div><div><dt>成员角色</dt><dd>{AUTH_INVITE.role}</dd></div><div><dt>受邀手机号</dt><dd>{maskMemberPhone(AUTH_INVITE.phone)}</dd></div></dl></div>}
        {invitePage && inviteError && <div className="auth-empty"><ShieldCheck /><p role="alert">{inviteError}</p><Button variant="outline" onClick={() => navigate('login')}>返回登录</Button></div>}
        {invitePage && !completed && !inviteError && inviteVerified && <div className="auth-invite-confirm"><p>当前账号：{auth.user?.name} · {maskMemberPhone(auth.user?.phone)}</p>{auth.user?.phone !== AUTH_INVITE.phone ? <><p className="auth-field-error" role="alert">当前账号与受邀手机号不一致，请切换账号。</p><Button variant="outline" onClick={() => { changePhone(''); setInviteVerified(false); }}>切换账号</Button></> : <><p>确认后，你将以普通成员身份进入企业空间。</p><Button className="auth-submit" disabled={busy || Boolean(auth.storageError)} onClick={acceptInvite}>{auth.state.memberships.some(member => member.userId === auth.user.id && member.enterpriseId === AUTH_INVITE.enterpriseId) ? '进入企业' : '确认加入'}</Button><Button variant="ghost" onClick={auth.close}>暂不加入</Button></>}</div>}
        {invitePage && !identityForm && errorMessage && <p className="auth-field-error" role="alert">{errorMessage}</p>}
        {choosingEnterprise && <form className="auth-form" onSubmit={event => { event.preventDefault(); run(() => { if (!auth.spaces.some(space => space.id !== 'personal' && space.id === enterpriseId)) throw new Error('请选择可进入的企业'); auth.commit({ ...auth.state, activeSpace: enterpriseId }); toast.success('登录成功，已进入企业空间'); auth.close(); }); }}><FormSelect id="auth-enterprise-space" label="企业空间" value={enterpriseId} options={auth.spaces.filter(space => space.id !== 'personal').map(space => [space.id, space.name])} onChange={value => { setEnterpriseId(value); setErrors({}); }} />{errorMessage && <p className="auth-field-error" role="alert">{errorMessage}</p>}<Button type="submit" className="auth-submit" disabled={!enterpriseId || busy || Boolean(auth.storageError)}>进入企业空间<ArrowRight /></Button></form>}
        {completed && <div className="auth-complete" role="status"><ShieldCheck /><p>{completed === 'invite' ? `已加入${AUTH_INVITE.enterprise}，角色为普通成员。` : '你可以使用手机号和新密码登录。'}</p><Button className="auth-submit" onClick={() => completed === 'password' && !auth.user ? navigate('login') : auth.close()}>{completed === 'invite' ? '进入政企空间' : auth.user ? '返回使用空间' : '返回登录'}<ArrowRight /></Button>{completed === 'password' && auth.user && <Button variant="link" onClick={() => navigate('account')}>返回账号中心</Button>}</div>}
        {identityForm && <form id="auth-identity-panel" data-registration={route === 'register'} role={route === 'login' && allowPhoneCode ? 'tabpanel' : undefined} aria-labelledby={route === 'login' && allowPhoneCode ? `auth-tab-${loginMode}` : undefined} onSubmit={submitIdentity} noValidate className="auth-form">
          {phoneField}
          {route === 'login' && loginMode === 'password' ? <><FormField id="auth-password" label="密码" error={errors.password}><PasswordInput id="auth-password" value={password} onChange={event => { setPassword(event.target.value); setErrors({}); }} error={errors.password} /></FormField>{emailLogin && (emailOnly || phone.includes('@')) ? <p className="auth-form-note">忘记密码？请联系企业管理员重置。</p> : <Button variant="link" type="button" className="auth-forgot" onClick={() => navigate('password')}>忘记密码？</Button>}</> : codeField}
          {route === 'password' && <><FormField id="auth-password" label="新密码" error={errors.password}><PasswordInput id="auth-password" value={password} onChange={event => { setPassword(event.target.value); setErrors({}); }} autoComplete="new-password" error={errors.password} /></FormField><p className="auth-form-note">8–64 位，包含字母和数字</p><FormField id="auth-confirm-password" label="确认新密码" error={errors.confirmPassword}><PasswordInput id="auth-confirm-password" value={confirmPassword} onChange={event => { setConfirmPassword(event.target.value); setErrors({}); }} autoComplete="new-password" error={errors.confirmPassword} /></FormField></>}
          {invitePage && <p className="auth-form-note">请使用已注册的受邀手机号登录，再确认加入企业。</p>}
          {route !== 'password' && agreement}
          {errorMessage && <p className="auth-field-error" role="alert">{errorMessage}</p>}
          <Button className="auth-submit" type="submit" disabled={busy || Boolean(auth.storageError)}>{busy ? '正在处理…' : route === 'login' ? userType === 'enterprise' ? '登录政企空间' : '登录个人空间' : route === 'register' ? '立即注册' : route === 'password' ? '确认设置密码' : '登录并继续'}{!busy && <ArrowRight data-icon="inline-end" />}</Button>
          <div className="auth-form-footer">{route === 'password' ? <Button variant="link" type="button" onClick={() => auth.user ? auth.close() : navigate('login')}>{auth.user ? '暂不设置，返回空间' : '返回登录'}</Button> : route === 'login' ? <span>{userType === 'enterprise' ? <>需要企业认证？<Button variant="link" type="button" onClick={() => navigate('account')}>前往账号中心</Button></> : <>没有账号？<Button variant="link" type="button" onClick={() => navigate('register')}>立即注册</Button></>}</span> : <span>已有账号？<Button variant="link" type="button" onClick={() => navigate('login')}>立即登录</Button></span>}</div>
          {enterpriseLogin && <p className="auth-form-note">{emailLogin ? '邮箱账号由企业管理员登记，使用密码登录；' : '请使用已加入企业的手机号；'}尚未加入请联系企业管理员。</p>}
        </form>}
      </section>
    </div>
    <p className="auth-page-footnote">模型服务平台 MoMA · 个人探索与企业协作</p>
    <Dialog open={codeOpen} onOpenChange={setCodeOpen}><DialogContent className="auth-dialog"><DialogHeader><DialogTitle>本次验证信息</DialogTitle><DialogDescription>验证手机号 {maskMemberPhone(challenge?.identity)}，验证码 5 分钟内有效。</DialogDescription></DialogHeader><div className="auth-verification-code">{challenge?.code}</div><DialogFooter><Button onClick={() => setCodeOpen(false)}>继续验证</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(document)} onOpenChange={open => { if (!open) setDocument(null); }}><DialogContent className="auth-dialog"><DialogHeader><DialogTitle>{document}</DialogTitle><DialogDescription>协议内容尚未接入，请以正式发布的协议为准。</DialogDescription></DialogHeader><p>登录与注册页面预留协议展示位置，当前未加载正式条款。</p><DialogFooter><Button onClick={() => setDocument(null)}>关闭</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

const contactOptions = [['phone', '手机号码'], ['email', '邮箱']];
const applicationSteps = ['企业资料', '授权信息', '确认提交'];
const statusCopy = {
  待处理: '平台工作人员将核对申请资料。处理结果将发送至申请联系地址。',
  需补充: '请按处理意见补充资料，再提交申请。',
  已开通: '政企空间已开通。管理员完成账号激活后，可以登录。',
  已关闭: '申请已关闭。如需开通服务，请重新提交申请。',
};

function EnterpriseApplication({ auth }) {
  const route = auth.route, params = auth.params;
  const token = params.get('token');
  let activating = null, activationError = '';
  if (route === 'activate') {
    try { activating = activationAccount(auth.state, token); } catch (error) { activationError = error.message; }
  }
  const [data, setData] = useState({ authorized: false, authorizationRole: '', authorizationNote: '', subjectType: 'enterprise', companyName: '', taxId: '', province: '', city: '', industry: '', contactName: '', contactType: 'phone', contactIdentity: auth.user?.phone || '' });
  const [step, setStep] = useState(1), [agreed, setAgreed] = useState(false);
  const [queryId, setQueryId] = useState(params.get('id') || ''), [queryType, setQueryType] = useState(params.get('contactType') || 'phone'), [queryIdentity, setQueryIdentity] = useState(params.get('contact') || '');
  const [resultId, setResultId] = useState(auth.state.applications.find(item => item.id === params.get('record') && item.applicantUserId === auth.user?.id)?.id || null), [editingId, setEditingId] = useState(null), [submitted, setSubmitted] = useState(false), [activated, setActivated] = useState(false);
  const [challenge, setChallenge] = useState(null), [code, setCode] = useState(''), [codeOpen, setCodeOpen] = useState(false), [now, setNow] = useState(Date.now());
  const [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState(''), [document, setDocument] = useState(null);
  const [errors, setErrors] = useState({}), [busy, setBusy] = useState(false);
  const heading = useRef(null), busyRef = useRef(false);
  useEffect(() => {
    const previous = window.document.title;
    window.document.title = 'MoMA · 政企服务';
    return () => { window.document.title = previous; };
  }, []);
  const result = auth.state.applications.find(item => item.id === resultId);
  const purpose = editingId ? 'enterprise' : route;
  const type = route === 'application' && !editingId ? queryType : route === 'activate' ? activating?.activation.type : data.contactType;
  const identity = route === 'application' && !editingId ? queryIdentity : route === 'activate' ? activating?.[type] : data.contactIdentity;
  const resend = challenge ? Math.max(0, Math.ceil((challenge.issuedAt + 60000 - now) / 1000)) : 0;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [step, resultId, activated]);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const clearVerification = () => { setChallenge(null); setCode(''); };
  const update = (key, value) => {
    setData(current => ({ ...current, [key]: value, ...(key === 'province' ? { city: '' } : {}) }));
    if (['contactType', 'contactIdentity'].includes(key)) clearVerification();
    setErrors({});
  };
  const getCode = () => {
    if (resend) return;
    try {
      const normalized = normalizeAuthLogin(identity, 'enterprise', [type]), issuedAt = Date.now();
      setChallenge({ identity: normalized, type, purpose, code: String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0'), issuedAt, attempts: 0 });
      setNow(issuedAt); setCode(''); setCodeOpen(true); setErrors({});
    } catch (error) { setErrors({ contactIdentity: error.message }); }
  };
  const proof = () => ({ challenge, identity, type, code });
  const verify = () => {
    try { verifyAuthCode(challenge, { ...proof(), purpose }); return true; }
    catch (error) { if (challenge) setChallenge({ ...challenge, attempts: challenge.attempts + 1 }); setErrors({ code: error.message }); return false; }
  };
  const run = async operation => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setErrors({});
    try { await operation(); } catch (error) { setErrors({ submit: error.message }); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const nextStep = event => {
    event.preventDefault();
    const invalid = applicationErrors(data, step);
    if (Object.keys(invalid).length) { setErrors(invalid); return; }
    if (step === 2 && !data.authorizationRole) { setErrors({ authorizationRole: '请选择申请人身份' }); return; }
    if (step === 2 && data.authorizationRole === 'authorized-agent' && !data.authorizationNote.trim()) { setErrors({ authorizationNote: '请填写授权说明' }); return; }
    setErrors({}); setStep(step + 1);
  };
  const submit = event => {
    event.preventDefault();
    run(() => {
      if (!agreed) { setErrors({ agreement: auth.preview ? '请核对填写信息' : '请阅读并同意用户协议和隐私政策' }); return; }
      const next = submitEnterpriseCertification(auth.state, data, editingId);
      auth.commit(next);
      const saved = editingId ? next.applications.find(item => item.id === editingId) : next.applications.at(-1);
      setResultId(saved.id); setSubmitted(true); clearVerification();
    });
  };
  const query = event => {
    event.preventDefault();
    run(() => { if (!verify()) return; const saved = queryAuthApplication(auth.state, queryId, proof()); setResultId(saved.id); clearVerification(); });
  };
  const activate = event => {
    event.preventDefault();
    run(async () => {
      if (!verify()) return;
      if (password !== confirmPassword) { setErrors({ confirmPassword: '两次输入的密码不一致' }); return; }
      let next;
      try { next = await activateAuthAccount(auth.state, token, proof(), password); } catch (error) { if (error.message.startsWith('密码需')) { setErrors({ password: error.message }); return; } throw error; }
      auth.commit(next);
      setActivated(true); clearVerification(); setPassword(''); setConfirmPassword('');
    });
  };
  const continueApplication = () => {
    if (result.purpose === 'enterprise-certification' && route !== 'enterprise') { auth.navigate('enterprise', `?record=${encodeURIComponent(result.id)}`); return; }
    setData({ ...Object.fromEntries(Object.keys(data).map(key => [key, result[key] || ''])), authorized: false, contactType: 'phone', contactIdentity: auth.user?.phone || '' });
    setEditingId(result.id); setResultId(null); setSubmitted(false); setStep(1); setAgreed(false); clearVerification();
  };
  const field = (key, label, props = {}) => <FormField id={`application-${key}`} label={label} error={errors[key]} value={data[key]} onChange={event => update(key, event.target.value)} {...props} />;
  const select = (key, label, options, disabled = false) => <FormSelect id={`application-${key}`} label={label} value={data[key]} options={options} onChange={value => update(key, value)} error={errors[key]} disabled={disabled} />;
  const codeField = <FormField id="application-code" label={type === 'email' ? '邮箱验证码' : '短信验证码'} error={errors.code}><div className="auth-code-input"><Input id="application-code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} placeholder="请输入 6 位验证码" onChange={event => { setCode(event.target.value.replace(/\D/g, '')); setErrors({}); }} aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? 'application-code-error' : undefined} /><Button type="button" variant="outline" onClick={getCode} disabled={Boolean(resend) || busy}>{resend ? `${resend}s 后重发` : '获取验证码'}</Button></div>{challenge && <Button type="button" variant="link" className="auth-code-review" onClick={() => setCodeOpen(true)}>查看验证信息</Button>}</FormField>;
  const agreement = <div className="auth-agreement"><div><Checkbox id="application-agreement" checked={agreed} onCheckedChange={value => { setAgreed(value === true); setErrors({}); }} aria-invalid={Boolean(errors.agreement)} aria-describedby={errors.agreement ? 'application-agreement-error' : undefined} /><label htmlFor="application-agreement">{auth.preview ? '已核对填写信息' : '已阅读并同意'}</label><Button variant="link" type="button" onClick={() => setDocument('用户协议')}>用户协议</Button><span>和</span><Button variant="link" type="button" onClick={() => setDocument('隐私政策')}>隐私政策</Button></div>{errors.agreement && <p className="auth-field-error" id="application-agreement-error" role="alert">{errors.agreement}</p>}</div>;
  const summary = (title, rows, editStep) => <section className="auth-review-section"><div className="auth-review-heading"><h3>{title}</h3>{editStep && <Button type="button" variant="link" onClick={() => { setStep(editStep); setErrors({}); }}>修改</Button>}</div><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></section>;
  const title = activated ? '账号已激活' : result ? submitted ? '申请已提交' : '申请进度' : route === 'activate' ? '激活管理员账号' : editingId ? '补充申请资料' : route === 'application' ? '查询申请进度' : '企业认证';
  return <div className="auth-experience auth-application-page"><div className="auth-layout"><AuthBrand title="完成企业认证" description="核验单位主体与申请人的授权关系。" /><section className="auth-form-panel" aria-label={title}>
    <div className="auth-panel-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2><p>{result ? result.purpose === 'enterprise-certification' ? '可在账号中心查看认证状态与处理意见。' : '请保存申请编号。后续查询需要验证申请联系地址。' : activated ? '请使用管理员账号登录政企空间。' : route === 'activate' ? '验证管理员联系地址，再设置登录密码。' : editingId ? '按处理意见补充资料，核对后重新提交。' : route === 'application' ? '填写申请编号，并验证提交申请时的联系地址。' : '填写单位资料，提交企业认证'}</p></div>
    {!result && !activated && (route === 'enterprise' || editingId) && <>
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
    {route === 'application' && !result && !editingId && <form className="auth-form auth-query-form" noValidate onSubmit={query}><FormField id="application-number" label="申请编号" maxLength={40} placeholder="请输入 APP- 开头的申请编号" value={queryId} onChange={event => { setQueryId(event.target.value); setErrors({}); }} /><FormSelect id="query-type" label="申请联系地址类型" options={contactOptions} value={queryType} onChange={value => { setQueryType(value); setQueryIdentity(''); clearVerification(); setErrors({}); }} /><FormField id="query-identity" label={queryType === 'email' ? '申请联系邮箱' : '申请联系手机号'} error={errors.contactIdentity} type={queryType === 'email' ? 'email' : 'tel'} maxLength={254} value={queryIdentity} onChange={event => { setQueryIdentity(event.target.value); clearVerification(); setErrors({}); }} placeholder="请输入提交申请时的联系地址" />{codeField}{(errors.submit || auth.storageError) && <p className="auth-field-error" role="alert">{auth.storageError || errors.submit}</p>}<Button type="submit" className="auth-submit" disabled={busy || Boolean(auth.storageError)}>验证并查询<ArrowRight /></Button><Button variant="link" type="button" onClick={() => auth.navigate('account')}>前往账号中心</Button></form>}
    {result && <div className="auth-application-result"><div className="auth-application-status"><Clock3 /><strong>{result.purpose === 'enterprise-certification' ? ({ '待处理': '审核中', '已开通': '已认证', '已关闭': '未通过' }[result.status] || result.status) : result.status}</strong></div><p className="auth-section-note">{result.purpose === 'enterprise-certification' ? ({ '待处理': '认证资料已提交，请等待审核。', '需补充': '请按处理意见补充企业资料或授权信息。', '已开通': '企业认证已完成，继续使用当前登录账号。', '已关闭': '认证申请未通过，可查看处理意见后重新提交。' }[result.status] || '请查看认证处理结果。') : statusCopy[result.status] || '请联系平台工作人员核对申请状态。'}</p>{summary('申请记录', [['申请编号', result.id], ['主体全称', result.companyName], ['提交时间', new Date(result.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })]])}{result.processingNote && summary(result.status === '待处理' ? '上次处理意见' : '处理意见', [['意见', result.processingNote]])}{result.purpose !== 'enterprise-certification' && result.status === '已开通' && summary('管理员账号', [['姓名', result.adminName], ['登录账号', result.adminIdentity], ['账号状态', auth.state.accounts.find(item => item.id === result.adminUserId)?.credential ? '已激活' : '待激活']])}<div className="auth-result-actions">{result.applicantUserId && <Button variant="outline" onClick={() => auth.navigate('account')}>返回账号中心</Button>}{submitted && !result.applicantUserId && <Button onClick={() => { setResultId(null); setSubmitted(false); setEditingId(null); setQueryId(result.id); setQueryType(result.contactType); setQueryIdentity(result.contactIdentity); clearVerification(); auth.navigate('application', `?id=${encodeURIComponent(result.id)}&contactType=${result.contactType}&contact=${encodeURIComponent(result.contactIdentity)}`); }}>查看申请进度</Button>}{!submitted && result.status === '需补充' && <Button onClick={continueApplication}>补充资料</Button>}{!submitted && result.purpose !== 'enterprise-certification' && result.status === '已开通' && auth.preview && auth.state.accounts.find(item => item.id === result.adminUserId)?.activation && <Button onClick={() => auth.navigate('activate', `?token=${encodeURIComponent(auth.state.accounts.find(item => item.id === result.adminUserId).activation.token)}`)}>激活管理员账号</Button>}{!submitted && result.purpose !== 'enterprise-certification' && result.status === '已开通' && <Button onClick={() => auth.navigate('login', '?type=enterprise')}>政企用户登录</Button>}{!submitted && result.status === '已关闭' && <Button onClick={() => auth.navigate('enterprise')}>重新申请</Button>}{!submitted && !result.applicantUserId && <Button variant="outline" onClick={() => { setResultId(null); clearVerification(); setErrors({}); }}>查询其他申请</Button>}</div>{result.purpose !== 'enterprise-certification' && result.status === '已开通' && <p className="auth-section-note">新账号请使用发给管理员的激活链接。链接无效或已过期时，请联系平台工作人员。</p>}</div>}
    {route === 'activate' && (activated ? <div className="auth-empty"><ShieldCheck /><p>密码已设置。登录后进入已开通的政企空间。</p><Button onClick={() => auth.navigate('login', '?type=enterprise')}>前往政企登录</Button></div> : activationError ? <div className="auth-empty"><ShieldCheck /><p role="alert">{activationError}</p><Button variant="outline" onClick={() => auth.navigate('login', '?type=enterprise')}>前往政企登录</Button></div> : <form className="auth-form auth-query-form" noValidate onSubmit={activate}><FormField id="activation-identity" label="管理员登录账号" value={identity || ''} readOnly />{codeField}<FormField id="activation-password" label="设置登录密码" error={errors.password}><PasswordInput id="activation-password" autoComplete="new-password" value={password} onChange={event => { setPassword(event.target.value); setErrors({}); }} error={errors.password} /></FormField><p className="auth-form-note">8–64 位，包含字母和数字</p><FormField id="activation-confirm" label="确认登录密码" error={errors.confirmPassword}><PasswordInput id="activation-confirm" autoComplete="new-password" value={confirmPassword} onChange={event => { setConfirmPassword(event.target.value); setErrors({}); }} error={errors.confirmPassword} /></FormField>{(errors.submit || auth.storageError) && <p className="auth-field-error" role="alert">{auth.storageError || errors.submit}</p>}<Button className="auth-submit" type="submit" disabled={busy || Boolean(auth.storageError)}>{busy ? '正在激活…' : '激活账号'}</Button></form>)}
  </section></div><p className="auth-page-footnote">模型服务平台 MoMA · 个人探索与政企协作</p>
    <Dialog open={codeOpen} onOpenChange={setCodeOpen}><DialogContent className="auth-dialog"><DialogHeader><DialogTitle>本次验证信息</DialogTitle><DialogDescription>验证联系地址 {challenge?.identity}，验证码 5 分钟内有效。</DialogDescription></DialogHeader><div className="auth-verification-code">{challenge?.code}</div><DialogFooter><Button onClick={() => setCodeOpen(false)}>继续验证</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(document)} onOpenChange={open => { if (!open) setDocument(null); }}><DialogContent className="auth-dialog"><DialogHeader><DialogTitle>{document}</DialogTitle><DialogDescription>协议内容尚未接入，请以正式发布的协议为准。</DialogDescription></DialogHeader><p>当前未加载正式条款。</p><DialogFooter><Button onClick={() => setDocument(null)}>关闭</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
