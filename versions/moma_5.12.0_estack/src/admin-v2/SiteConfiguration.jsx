import { useEffect, useRef, useState } from 'react';
import { IconUpload } from '@douyinfe/semi-icons';
import { Banner, Button, Card, Form, Image, Input, Space, Tabs, Toast } from '@douyinfe/semi-ui';
import SiteAgreementsEditor from './SiteAgreementsEditor';
import AdminPageHeading from './AdminPageHeading';
import { cloudAdminRequest } from './admin-client.mjs';
import { PORTAL_HOME_ENDPOINT, portalHomeUrl } from '../portal-home.mjs';
import {
  DEFAULT_USER_CONSOLE_NAME, DEFAULT_WORKBENCH_NAME, IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_SITE_TEXT, MAX_SITE_URL,
  SITE_CONFIG_EVENT, SITE_IMAGES, readSiteConfig, saveSiteConfig, siteImage,
} from '../site-config.mjs';
import { useSiteConfigSnapshot } from '../useSiteConfig';
import './site-configuration.css';

function readImage(file) {
  const mime = file?.type || (file?.name.toLowerCase().endsWith('.ico') ? 'image/x-icon' : '');
  if (!file || !IMAGE_TYPES.includes(mime) || file.size > MAX_IMAGE_BYTES || !file.size) {
    throw new Error('请选择 512 KB 以内的 PNG、JPEG、WebP、GIF、SVG 或 ICO 图片。');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败，请重新选择。'));
    reader.readAsDataURL(new Blob([file], { type: mime }));
  });
}

async function checkImage(src, label) {
  const image = new window.Image();
  image.src = src;
  let timeout;
  try {
    await Promise.race([image.decode(), new Promise((_, reject) => { timeout = setTimeout(reject, 8000); })]);
  } catch {
    throw new Error(label + '无法加载，请检查图片或链接。');
  } finally {
    clearTimeout(timeout);
  }
}

function SiteImageField({ field, value, disabled, onChange, onUpload }) {
  const [key, label, fallback] = field;
  const id = 'site-image-' + key;
  const fileInput = useRef(null);
  const source = siteImage(value);
  const uploaded = value.startsWith('data:');
  return <Form.Slot label={{ text: label, name: id }}>
    <div className="site-config-image">
      <div className="site-config-thumbnail">
        {(!value || source) && <Image key={source} src={source || fallback} alt={label + '预览'} width={96} height={56}
          preview={false} imgStyle={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
      </div>
      <div className="site-config-image-controls">
        <Input id={id} value={uploaded ? '' : value} aria-label={label + ' URL'} disabled={disabled}
          maxLength={MAX_SITE_URL} placeholder="https://" onChange={onChange} />
        <Space wrap>
          <input ref={fileInput} type="file" hidden accept={IMAGE_TYPES.join(',') + ',.ico,.svg'} disabled={disabled}
            onChange={event => {
              const file = event.currentTarget.files[0];
              event.currentTarget.value = '';
              if (file) onUpload(file);
            }} />
          <Button icon={<IconUpload />} disabled={disabled} aria-label={'上传' + label} onClick={() => fileInput.current.click()}>上传图片</Button>
          <Button disabled={disabled || !value} aria-label={'恢复默认' + label} onClick={() => onChange('')}>恢复默认</Button>
        </Space>
      </div>
    </div>
  </Form.Slot>;
}

export default function SiteConfiguration({ dirtyRef }) {
  const raw = useSiteConfigSnapshot();
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState('basic');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [agreementDirty, setAgreementDirty] = useState(false);
  const [portal, setPortal] = useState(null);
  const [portalDraft, setPortalDraft] = useState(null);
  const [portalError, setPortalError] = useState('');
  const [portalLoad, setPortalLoad] = useState(0);
  const operation = useRef(null);
  const saved = readSiteConfig(raw);
  const config = draft?.config || saved;
  const conflict = Boolean(draft && draft.base !== raw);

  useEffect(() => {
    dirtyRef.current = Boolean(draft || portalDraft !== null || busy || agreementDirty);
    return () => { dirtyRef.current = false; };
  }, [dirtyRef, draft, portalDraft, busy, agreementDirty]);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    cloudAdminRequest(PORTAL_HOME_ENDPOINT, { signal: controller.signal }).then(
      value => { if (!controller.signal.aborted) setPortal(value); },
      () => { if (!controller.signal.aborted) setPortalError('门户首页地址加载失败。'); },
    );
    return () => controller.abort();
  }, [portalLoad]);

  const update = (key, value) => {
    setError('');
    setDraft(current => ({ base: current ? current.base : raw, config: { ...(current?.config || saved), [key]: value } }));
  };

  async function upload(key, file) {
    setBusy('upload');
    setError('');
    try { update(key, await readImage(file)); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(''); }
  }

  async function save() {
    if ((!draft && portalDraft === null) || conflict || operation.current || busy ||
        (portalDraft !== null && (!portal || portalError))) return;
    const nextPortalUrl = portalDraft === null ? '' : portalHomeUrl(portalDraft, location.origin);
    if (portalDraft?.trim() && !nextPortalUrl) {
      setError('请填写有效的 HTTP 或 HTTPS 门户首页地址，或留空。门户地址不能指向 MoMA 首页。');
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setError('');
    setBusy('save');
    let brandSaved = false;
    try {
      if (draft) {
        const next = readSiteConfig(JSON.stringify(config));
        await Promise.all(SITE_IMAGES.map(async ([key, label]) => {
          if (config[key].trim() && !next[key]) throw new Error(label + '须使用有效的 HTTP 或 HTTPS 图片链接。');
          if (next[key] && next[key] !== saved[key]) await checkImage(next[key], label);
        }));
        if (controller.signal.aborted) return;
        if (!saveSiteConfig(localStorage, draft.base, next)) throw new Error('配置已在其他页面更新。');
        brandSaved = true;
        setDraft(null);
        window.dispatchEvent(new Event(SITE_CONFIG_EVENT));
      }
      if (portalDraft !== null) {
        const value = await cloudAdminRequest(PORTAL_HOME_ENDPOINT, {
          method: 'POST', signal: controller.signal, body: { expectedRevision: portal.revision, url: nextPortalUrl },
        });
        if (controller.signal.aborted) return;
        setPortal(value);
        setPortalDraft(null);
      }
      Toast.success('站点配置已保存');
    } catch (issue) {
      if (controller.signal.aborted) return;
      setTab('basic');
      const message = (brandSaved ? '其他基础配置已保存。' : '') + (issue instanceof DOMException
        ? '无法保存到浏览器，请检查存储权限或空间。'
        : issue.message);
      if (issue.status === 409) setPortalError(message);
      else setError(message);
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy('');
    }
  }

  return <section className="admin-page-stack site-config">
    <AdminPageHeading title="站点配置">
      {tab === 'basic' && <Button theme="solid" onClick={save} disabled={(!draft && portalDraft === null) ||
        Boolean(busy) || conflict || (portalDraft !== null && (!portal || Boolean(portalError)))} loading={busy === 'save'}>保存</Button>}
    </AdminPageHeading>
    {conflict && <Banner type="warning" closeIcon={null} description={<>配置已在其他页面更新。 <Button disabled={Boolean(busy)} onClick={() => { setDraft(null); setError(''); }}>载入已保存配置</Button></>} />}
    {error && <Banner type="danger" closeIcon={null} description={<span role="alert">{error}</span>} />}
    <Tabs keepDOM type="line" activeKey={tab} onChange={setTab} aria-label="站点配置">
      <Tabs.TabPane tab="基础配置" itemKey="basic">
        <Card className="site-config-card">
          <Form.Slot label={{ text: '用户控制台展示名称', name: 'site-user-console-name' }}>
            <Input id="site-user-console-name" aria-label="用户控制台展示名称" value={config.userConsoleName} maxLength={MAX_SITE_TEXT}
              placeholder={DEFAULT_USER_CONSOLE_NAME} disabled={Boolean(busy)} onChange={value => update('userConsoleName', value)} />
          </Form.Slot>
          <Form.Slot label={{ text: '管理工作台展示名称', name: 'site-workbench-name' }}>
            <Input id="site-workbench-name" aria-label="管理工作台展示名称" value={config.workbenchName} maxLength={MAX_SITE_TEXT}
              placeholder={DEFAULT_WORKBENCH_NAME} disabled={Boolean(busy)} onChange={value => update('workbenchName', value)} />
          </Form.Slot>
          <Form.Slot label={{ text: '浏览器标题', name: 'site-title' }}>
            <Input id="site-title" aria-label="浏览器标题" value={config.title} maxLength={MAX_SITE_TEXT} placeholder="留空使用默认标题"
              disabled={Boolean(busy)} onChange={value => update('title', value)} />
          </Form.Slot>
          <Form.Slot label={{ text: '门户首页地址', name: 'site-portal-home' }}>
            <Input id="site-portal-home" aria-label="门户首页地址" value={portalDraft ?? portal?.url ?? ''} maxLength={MAX_SITE_URL}
              placeholder="留空使用默认首页" disabled={Boolean(busy) || !portal || Boolean(portalError)}
              onChange={value => { setError(''); setPortalDraft(value === portal.url ? null : value); }} />
            {portalError && <Banner type="warning" closeIcon={null} description={<>
              <span role="alert">{portalError}</span>
              <Button size="small" disabled={Boolean(busy)} onClick={() => {
                setPortal(null);
                setPortalDraft(null);
                setPortalError('');
                setPortalLoad(value => value + 1);
              }}>{portal ? '载入已保存地址' : '重试'}</Button>
            </>} />}
          </Form.Slot>
          {SITE_IMAGES.map(field => <SiteImageField key={field[0]} field={field} value={config[field[0]]} disabled={Boolean(busy)}
            onChange={value => update(field[0], value)} onUpload={file => upload(field[0], file)} />)}
        </Card>
      </Tabs.TabPane>
      <Tabs.TabPane tab="协议管理" itemKey="agreements">
        <SiteAgreementsEditor legacy={saved} onDirtyChange={setAgreementDirty} />
      </Tabs.TabPane>
    </Tabs>
  </section>;
}
