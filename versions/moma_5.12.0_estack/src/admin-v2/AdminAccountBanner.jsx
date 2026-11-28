import { useState } from 'react';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { LOGIN_BASE, openLogin } from '../login-navigation.mjs';
import { ADMIN_ROLE_LABELS } from './admin-accounts.js';
import { useChannelText } from './channel-language.js';
import { XaButton, XaPopover } from './xa24/HaloComponents.jsx';

export default function AdminAccountBanner({ account, logout }) {
  const t = useChannelText();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  return <XaPopover open={open} onChange={setOpen} content={<div className="auth-account-menu">
    <div className="auth-menu-profile"><b>{account.name}</b><span>{t(ADMIN_ROLE_LABELS[account.role] || account.role)}</span></div>
    <XaButton theme="borderless" icon={<LogOut size={16} aria-hidden="true"/>} onClick={async () => {
      try {
        await logout();
        openLogin(LOGIN_BASE);
      } catch (issue) { setError(issue.message); }
    }}>{t('退出登录', 'Sign Out')}</XaButton>
    {error && <span className="xa24-text-danger" role="alert">{error}</span>}
  </div>}>
    <XaButton theme="borderless" className="auth-banner-user" aria-label="账号菜单" aria-expanded={open}
      icon={<UserRound size={16} aria-hidden="true"/>}>{account.name}<ChevronDown size={14} aria-hidden="true"/></XaButton>
  </XaPopover>;
}
