import { useEffect, useRef } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { DEFAULT_LOGIN_IMAGE, DEFAULT_USER_CONSOLE_NAME } from '../site-config.mjs';
import { restoreSiteImage, useSiteConfig } from '../useSiteConfig';
import '../auth.css';

export function AuthBrand({ title, description }) {
  const { loginImage } = useSiteConfig();
  return <section className="auth-enterprise-brand">
    <h1>{title}</h1>{description && <p>{description}</p>}
    <img src={loginImage || DEFAULT_LOGIN_IMAGE} alt="" width="1478" height="1064"
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

