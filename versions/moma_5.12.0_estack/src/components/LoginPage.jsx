import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input } from '@douyinfe/semi-ui';
import { DEFAULT_LOGIN_IMAGE, DEFAULT_USER_CONSOLE_NAME } from '../site-config.mjs';
import { restoreSiteImage, useSiteConfig } from '../useSiteConfig';
import '../auth.css';

export function AuthBrand({ title, description }) {
  const { loginImage } = useSiteConfig();
  return <section className="auth-enterprise-brand">
    <h1>{title}</h1>{description && <p>{description}</p>}
    <img src={loginImage || DEFAULT_LOGIN_IMAGE} alt="" width="1478" height="1064" decoding="async"
      onError={event => restoreSiteImage(event, DEFAULT_LOGIN_IMAGE)} />
  </section>;
}

export function LoginPage({ title = '登录', description, onBack, children }) {
  const { userConsoleName } = useSiteConfig();
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [title]);
  return <div className="auth-experience auth-application-page auth-identity-page auth-login-page">
    {onBack && <div className="auth-page-top"><Button theme="borderless" type="tertiary" onClick={onBack}>返回</Button></div>}
    <div className="auth-layout">
      <AuthBrand title={userConsoleName || DEFAULT_USER_CONSOLE_NAME} />
      <section className="auth-form-panel" aria-label={title}>
        <div className="auth-panel-heading">
          <h2 ref={heading} tabIndex={-1}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {children}
      </section>
    </div>
  </div>;
}

export function PasswordLoginForm({ label, placeholder, accountId = '', fixedAccount = false, onLogin, onCancel }) {
  const accountField = useId(), passwordField = useId();
  const [account, setAccount] = useState(accountId);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !account.trim() || !password) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await onLogin(account.trim(), password);
      setPassword('');
    } catch (issue) {
      setError(issue.message || '登录失败，请重试。');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <form className="auth-form auth-password-form" onSubmit={submit}>
    <div className="auth-field">
      <label htmlFor={accountField}>{label}</label>
      <Input id={accountField} value={account} onChange={value => { setAccount(value); setError(''); }}
        readOnly={fixedAccount} disabled={pending} autoComplete="username" placeholder={placeholder} required maxLength={254} />
    </div>
    <div className="auth-field">
      <label htmlFor={passwordField}>密码</label>
      <Input id={passwordField} mode="password" value={password} onChange={value => { setPassword(value); setError(''); }}
        autoComplete="current-password" disabled={pending} required maxLength={128} />
    </div>
    {error && <p className="auth-field-error" role="alert">{error}</p>}
    <div className="auth-login-actions">
      {onCancel && <Button disabled={pending} onClick={onCancel}>取消</Button>}
      <Button theme="solid" htmlType="submit" loading={pending} disabled={!account.trim() || !password} block>登录</Button>
    </div>
  </form>;
}
