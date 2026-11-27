import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Checkbox, Modal } from '@douyinfe/semi-ui';
import { Megaphone } from 'lucide-react';
import { MARKET_EVENT, marketRequest } from '../CloudMarket';
import { workspaceStoragePrefix } from '../workspace-storage.mjs';

const sessionKey = workspaceStoragePrefix + 'announcement-dismissals';

function readSessionDismissals() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey));
    if (typeof saved?.accountId === 'string' && Array.isArray(saved.ids)) return saved;
  } catch { /* Dismissals still work for the current page when storage is unavailable. */ }
  return null;
}

function AnnouncementSession({ accountId, dismissedIds, onDismiss, getPopupContainer }) {
  const [announcements, setAnnouncements] = useState([]);
  const [hideNextTime, setHideNextTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);

  useEffect(() => {
    const request = new AbortController();
    const load = () => marketRequest('announcements', null, request.signal);
    load().catch(issue => {
      if (!request.signal.aborted && issue.code === 'REVISION_CONFLICT') return load();
      throw issue;
    }).then(result => {
      if (!request.signal.aborted && result.accountId === accountId) {
        setAnnouncements(result.announcements);
      }
    }).catch(() => { /* Announcement availability does not affect access to the console. */ });
    return () => {
      request.abort();
      pending.current?.abort();
    };
  }, [accountId]);

  const visible = announcements.filter(announcement => !dismissedIds.includes(announcement.id));
  if (!visible.length) return null;

  async function close() {
    if (pending.current) return;
    const ids = visible.map(announcement => announcement.id);
    if (!hideNextTime) {
      onDismiss(ids);
      return;
    }

    const request = new AbortController();
    pending.current = request;
    setSaving(true);
    setError('');
    try {
      await marketRequest('announcements', { accountId, ids }, request.signal);
      if (!request.signal.aborted) onDismiss(ids);
    } catch {
      if (!request.signal.aborted) setError('保存「不再展示」失败。请重试，或取消勾选后关闭。');
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setSaving(false);
    }
  }

  return <Modal visible centered maskFixed getPopupContainer={getPopupContainer}
    className="tenant-announcement-modal" width="min(540px, calc(100vw - 24px))"
    title={<span className="tenant-announcement-title"><Megaphone size={18} aria-hidden="true"/>平台公告</span>}
    maskClosable={false} closeOnEsc={!saving} closable={!saving} onCancel={close}
    footer={<div className="tenant-announcement-actions">
      <Checkbox checked={hideNextTime} disabled={saving} onChange={event => {
        setHideNextTime(event.target.checked);
        setError('');
      }}>不再展示</Checkbox>
      <Button type="primary" theme="solid" loading={saving} onClick={close}>关闭</Button>
    </div>}>
    {visible.map(({ id, title, body }) => <article className="tenant-announcement" key={id}>
      <h2>{title}</h2>
      <p>{body}</p>
    </article>)}
    {error && <Banner type="danger" closeIcon={null} description={<span role="alert">{error}</span>}/>}
  </Modal>;
}

export default function TenantAnnouncementDialog({ accountId, getPopupContainer }) {
  const [dismissals, setDismissals] = useState(readSessionDismissals);

  useEffect(() => {
    const resetOnAuthChange = event => {
      if (event.detail !== 'login' && event.detail !== 'logout') return;
      setDismissals(null);
      try { sessionStorage.removeItem(sessionKey); } catch { /* The in-memory session is cleared. */ }
    };
    window.addEventListener(MARKET_EVENT, resetOnAuthChange);
    return () => window.removeEventListener(MARKET_EVENT, resetOnAuthChange);
  }, []);

  if (!accountId) return null;
  const dismissedIds = dismissals?.accountId === accountId ? dismissals.ids : [];

  function dismiss(ids) {
    const next = { accountId, ids: [...new Set([...dismissedIds, ...ids])] };
    setDismissals(next);
    try { sessionStorage.setItem(sessionKey, JSON.stringify(next)); } catch { /* The in-memory state still applies. */ }
  }

  return <AnnouncementSession key={accountId} accountId={accountId}
    dismissedIds={dismissedIds} onDismiss={dismiss} getPopupContainer={getPopupContainer}/>;
}
