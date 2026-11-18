import { useEffect, useRef, useState } from 'react';
import { IconUpload } from '@douyinfe/semi-icons';
import { Banner, Button, Card, Form, Image, Input, Space, Tabs, Toast } from '@douyinfe/semi-ui';
import SiteAgreementsEditor from './SiteAgreementsEditor';
import AdminPageHeading from './AdminPageHeading';
import { Choice } from './ServiceUI';
import { notifyLinkedState } from '../service-access.mjs';
import {
  IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_SITE_TEXT, MAX_SITE_URL,
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
  const operation = useRef(null);
  const saved = readSiteConfig(raw);
  const config = draft?.config || saved;
  const conflict = Boolean(draft && draft.base !== raw);

  useEffect(() => {
    dirtyRef.current = Boolean(draft || busy || agreementDirty);
    return () => { dirtyRef.current = false; };
  }, [dirtyRef, draft, busy, agreementDirty]);
  useEffect(() => () => operation.current?.abort(), []);

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
    if (!draft || conflict || operation.current || busy) return;
    const next = readSiteConfig(JSON.stringify(config));
    const controller = new AbortController();
    operation.current = controller;
    setError('');
    setBusy('save');
    try {
      await Promise.all(SITE_IMAGES.map(async ([key, label]) => {
        if (config[key].trim() && !next[key]) throw new Error(label + '须使用有效的 HTTP 或 HTTPS 图片链接。');
        if (next[key] && next[key] !== saved[key]) await checkImage(next[key], label);
      }));
      if (controller.signal.aborted) return;
      if (!saveSiteConfig(localStorage, draft.base, next)) throw new Error('配置已在其他页面更新。');
      setDraft(null);
      window.dispatchEvent(new Event(SITE_CONFIG_EVENT));
      notifyLinkedState();
      Toast.success('站点配置已保存');
    } catch (issue) {
      if (controller.signal.aborted) return;
      if (issue instanceof DOMException) setError('无法保存到浏览器，请检查存储权限或空间。');
      else {
        setTab('basic');
        setError(issue.message);
      }
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy('');
    }
  }

  return <section className="admin-page-stack site-config">
    <AdminPageHeading title="站点配置">
      {tab === 'basic' && <Button theme="solid" onClick={save} disabled={!draft || Boolean(busy) || conflict} loading={busy === 'save'}>保存</Button>}
    </AdminPageHeading>
    {conflict && <Banner type="warning" closeIcon={null} description={<>配置已在其他页面更新。 <Button disabled={Boolean(busy)} onClick={() => { setDraft(null); setError(''); }}>载入已保存配置</Button></>} />}
    {error && <Banner type="danger" closeIcon={null} description={<span role="alert">{error}</span>} />}
    <Tabs keepDOM type="line" activeKey={tab} onChange={setTab} aria-label="站点配置">
      <Tabs.TabPane tab="基础配置" itemKey="basic">
        <Card className="site-config-card">
          <Form.Slot label={{ text: '平台名称', name: 'site-name' }}>
            <Input id="site-name" aria-label="平台名称" value={config.name} maxLength={MAX_SITE_TEXT} placeholder="留空使用默认名称"
              disabled={Boolean(busy)} onChange={value => update('name', value)} />
          </Form.Slot>
          <Form.Slot label={{ text: '浏览器标题', name: 'site-title' }}>
            <Input id="site-title" aria-label="浏览器标题" value={config.title} maxLength={MAX_SITE_TEXT} placeholder="留空使用默认标题"
              disabled={Boolean(busy)} onChange={value => update('title', value)} />
          </Form.Slot>
          <Form.Slot label="运营方式">
            <Choice label="运营方式" value={config.personalEnabled ? 'factory' : 'internal'}
              disabled={Boolean(busy)} onChange={value => update('personalEnabled', value === 'factory')}
              options={[[ 'internal', '企业内用' ], [ 'factory', '工厂外营' ]]}/>
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
