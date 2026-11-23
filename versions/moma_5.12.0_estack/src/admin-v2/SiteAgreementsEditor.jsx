import { useChannelText } from './channel-language';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Form, Input, Radio, RadioGroup, Space, Tabs, TextArea, Toast } from '@douyinfe/semi-ui';
import { AdminModal } from './AdminOverlay';
import { openLogin } from '../login-navigation.mjs';
import { cloudAdminRequest } from './admin-client.mjs';
import { AgreementContent } from '../components/SiteAgreementLinks';
import { agreementHref } from '../agreement-route.mjs';
import { agreementWithDefault, defaultAgreement } from '../default-site-terms.mjs';
import { AGREEMENTS, MAX_AGREEMENT_TEXT, MAX_SITE_URL, siteUrl } from '../site-config.mjs';

function agreementMode(agreement) {
  return agreement.mode || (agreement.url ? 'url' : 'text');
}

function activeAgreement(agreement) {
  return agreementMode(agreement) === 'url' ? { text: '', url: agreement.url } : { text: agreement.text, url: '' };
}

export default function SiteAgreementsEditor({ legacy, onDirtyChange }) {
  const translateLabel = useChannelText();
  const [selected, setSelected] = useState('terms');
  const [published, setPublished] = useState(null);
  const [draft, setDraft] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const operation = useRef(null);
  const legacyPending = published?.revision === 0 && AGREEMENTS.some(([key]) => legacy[key].text || legacy[key].url);
  const source = legacyPending ? legacy : published?.agreements;
  const agreements = draft || Object.fromEntries(AGREEMENTS.map(([key]) => [key, agreementWithDefault(key, source?.[key])]));
  const label = AGREEMENTS.find(([key]) => key === selected)[1];
  const agreement = agreements[selected];
  const href = agreementHref(selected);
  const url = new URL(href, location.origin).href;

  useEffect(() => {
    const controller = new AbortController();
    cloudAdminRequest('/site-agreements', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setPublished(data); })
      .catch(issue => { if (!controller.signal.aborted) setError(issue); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    onDirtyChange(Boolean(draft || busy));
    return () => onDirtyChange(false);
  }, [draft, busy, onDirtyChange]);
  useEffect(() => () => operation.current?.abort(), []);

  function reload() {
    setDraft(null);
    setPublished(null);
    setError(null);
    setAttempt(value => value + 1);
  }

  function update(value) {
    if (error?.status !== 409 && error?.status !== 401) setError(null);
    setDraft({ ...agreements, [selected]: value });
  }

  async function save() {
    if (!published || operation.current || error?.status === 409 || error?.status === 401) return;
    const changes = {};
    for (const [key, name] of AGREEMENTS) {
      const value = activeAgreement(agreements[key]);
      const nextUrl = siteUrl(value.url);
      if (value.url.trim() && !nextUrl) {
        setSelected(key);
        setError(new Error(name + '链接须为有效的 HTTP 或 HTTPS 地址。'));
        return;
      }
      changes[key] = { url: nextUrl, text: value.text.trim() === defaultAgreement(key).text ? '' : value.text.trim() };
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(null);
    try {
      const saved = await cloudAdminRequest('/site-agreements', {
        method: 'POST', signal: controller.signal, body: { expectedRevision: published.revision, agreements: changes },
      });
      if (controller.signal.aborted) return;
      setPublished(saved);
      setDraft(null);
      Toast.success('协议已保存');
    } catch (issue) {
      if (!controller.signal.aborted) setError(issue);
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <div className="site-agreements-editor">
    {error && <Banner type="warning" closeIcon={null} description={<>
      <span role="alert">{error.message}</span>
      {error.status === 401 && <Button onClick={() => openLogin()}>重新登录</Button>}
      {(error.status === 409 || !published) && <Button onClick={reload}>{published ? '载入已保存协议' : '重试'}</Button>}
    </>} />}
    {legacyPending && <Banner type="info" closeIcon={null} description="已带入此浏览器保存的协议，点击保存后对外生效。" />}
    <div className="site-agreements-toolbar">
      <Tabs type="button" activeKey={selected} onChange={setSelected} aria-label="选择协议">
        {AGREEMENTS.map(([key, name]) => <Tabs.TabPane key={key} itemKey={key} tab={name} />)}
      </Tabs>
      <Button theme="solid" loading={busy} disabled={!published || !(draft || legacyPending) || busy || [401, 409].includes(error?.status)}
        onClick={save}>保存协议</Button>
    </div>
    {published ? <Card className="site-agreement-document" title={label}>
      <div className="site-agreement-url">
        <span>公开地址</span>
        <a href={href} target="_blank" rel="noreferrer">{url}</a>
        <Button size="small" onClick={async () => {
          try { await navigator.clipboard.writeText(url); Toast.success('公开地址已复制'); }
          catch { Toast.error('复制失败，请选择地址复制'); }
        }}>复制地址</Button>
      </div>
      <div className="site-agreement-controls">
        <RadioGroup type="button" name="site-agreement-mode" aria-label={label + '配置方式'} value={agreementMode(agreement)}
          disabled={busy} onChange={event => update({ ...agreement, mode: event.target.value })}>
          <Radio value="text">协议内容</Radio>
          <Radio value="url">外部链接</Radio>
        </RadioGroup>
        <Space wrap>
          <Button aria-label={'预览' + label} onClick={() => {
            const value = activeAgreement(agreement);
            const nextUrl = siteUrl(value.url);
            if (value.url.trim() && !nextUrl) {
              setError(new Error(label + '链接须为有效的 HTTP 或 HTTPS 地址。'));
              return;
            }
            setPreview(agreementWithDefault(selected, { ...value, url: nextUrl }));
          }}>预览</Button>
          <Button aria-label={'恢复默认' + label} disabled={busy || (agreementMode(agreement) === 'text' && !agreement.url && agreement.text === defaultAgreement(selected).text)}
            onClick={() => update(defaultAgreement(selected))}>{translateLabel("恢复默认")}</Button>
        </Space>
      </div>
      {agreementMode(agreement) === 'url'
        ? <Form.Slot label={{ text: '协议链接', name: 'site-' + selected }}>
          <Input id={'site-' + selected} aria-label={label + '链接'} value={agreement.url} maxLength={MAX_SITE_URL}
            placeholder="https://" disabled={busy} onChange={url => update({ ...agreement, url })} />
        </Form.Slot>
        : <Form.Slot label={{ text: '协议正文', name: 'site-' + selected }}>
          <TextArea key={selected} className="site-agreement-text" id={'site-' + selected} aria-label={label + '正文'}
            value={agreement.text} maxCount={MAX_AGREEMENT_TEXT} rows={24} disabled={busy}
            onChange={text => update({ ...agreement, text })} />
        </Form.Slot>}
    </Card> : !error && <p role="status">正在加载协议…</p>}
    {preview && <AdminModal visible title={label} width="min(1040px, calc(100vw - 32px))" closeOnEsc
      footer={<Button onClick={() => setPreview(null)}>{translateLabel("关闭")}</Button>} onCancel={() => setPreview(null)}>
      <div className="site-config-preview" tabIndex={0}><AgreementContent agreement={preview} /></div>
    </AdminModal>}
  </div>;
}
