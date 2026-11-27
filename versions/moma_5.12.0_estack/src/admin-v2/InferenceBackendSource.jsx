import { useRef, useState } from 'react';
import { Banner, Button, Collapse, Form, Input, InputNumber, Radio, RadioGroup, Switch, Tabs, Tag, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { AdminSideSheet } from './AdminOverlay';
import { serviceOperationsUi } from './ServiceUI';
import { useChannelText } from './channel-language';
import {
  backendSourceChanged, backendSourceDraft, backendSourceHours, backendSourceSlots, backendSourceSnapshot, backendSourceStorageKey,
  backendSourceUrlError, replayBackendSource, saveBackendSourceConfiguration, usesOfficialBackendSource,
} from './inference-backend';

function readAllSourceSettings() {
  const stored = JSON.parse(localStorage.getItem(backendSourceStorageKey) || '{}');
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw Error('来源设置格式无效。');
  return stored;
}

function readBackendSourceSettings() {
  try { return { settings: readAllSourceSettings(), error: '' }; }
  catch { return { settings: {}, error: '无法读取后端来源设置。' }; }
}

const sourceInputs = ({ url, remoteEnabled, officialHours, customHours }) => ({ url, remoteEnabled, officialHours, customHours });
const formatTime = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

function SourceSnapshot({ slot, status }) {
  const t = useChannelText();
  const snapshot = backendSourceSnapshot(slot);
  return <>
    <div className="inference-runner-image-list">
      <Typography.Text>{t('本地快照')} · {snapshot.release}{snapshot.date && ` · ${snapshot.date}`} · {snapshot.count} {t(slot.key === 'built-in-backend' ? '个后端版本' : '个社区后端')}</Typography.Text>
      {status?.updatedAt && <Typography.Text type="tertiary" size="small">{t('最近载入快照时间')} {formatTime(status.updatedAt)}</Typography.Text>}
      {status?.checkedAt && <Typography.Text type="tertiary" size="small">{t('最近检查时间')} {formatTime(status.checkedAt)}</Typography.Text>}
    </div>
    <Collapse key={slot.key}>
      <Collapse.Panel header={t('查看目录快照')} itemKey={slot.key}>
        {status?.snapshotHash && <Typography.Paragraph>{t('内容指纹')} <Typography.Text code className="inference-backend-copy">{status.snapshotHash}</Typography.Text></Typography.Paragraph>}
        <div className="inference-runner-image-list">
          {snapshot.entries.map(({ name, versions }) => <div className="inference-runner-image" key={name}>
            <Typography.Text strong>{name}</Typography.Text>
            <Typography.Text type="secondary">{versions.join(' · ')}</Typography.Text>
          </div>)}
        </div>
      </Collapse.Panel>
    </Collapse>
  </>;
}

function BackendSourceDrawer({ onClose, onSaved }) {
  const t = useChannelText();
  const [initial] = useState(readBackendSourceSettings);
  const [active, setActive] = useState(backendSourceSlots[0].key);
  const [stored, setStored] = useState(initial.settings);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(backendSourceSlots.map(slot => [slot.key, backendSourceDraft(slot, initial.settings[slot.key])])));
  const [alerts, setAlerts] = useState({});
  const [urlErrors, setUrlErrors] = useState({});
  const [discard, setDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const slot = backendSourceSlots.find(item => item.key === active);
  const draft = drafts[active];
  const official = usesOfficialBackendSource(slot, draft);
  const hoursKey = official ? 'officialHours' : 'customHours';
  const savedDraft = backendSourceDraft(slot, stored[active]);
  const differs = slot => {
    const current = drafts[slot.key];
    const saved = backendSourceDraft(slot, stored[slot.key]);
    return backendSourceChanged(slot, current, saved) || current.officialHours !== saved.officialHours || current.customHours !== saved.customHours;
  };
  const sourceDirty = backendSourceChanged(slot, draft, savedDraft);
  const snapshotStatus = official && draft.remoteEnabled && draft.snapshotUrl === slot.url ? savedDraft : null;
  const syncError = !sourceDirty && draft.remoteEnabled && savedDraft.syncError?.url === savedDraft.url ? savedDraft.syncError : null;
  const alert = alerts[active];
  const urlError = urlErrors[active];

  const setAlert = (type, message) => setAlerts(previous => ({ ...previous, [active]: { type, message } }));
  const showUrlError = message => setUrlErrors(previous => ({ ...previous, [active]: message }));
  const update = patch => {
    setDrafts(previous => ({ ...previous, [active]: { ...previous[active], ...patch } }));
    setAlert(null, '');
    if (patch.url != null || patch.remoteEnabled != null) showUrlError('');
  };
  const close = () => {
    if (submitting.current) return;
    if (backendSourceSlots.some(differs)) setDiscard(true);
    else onClose();
  };
  const apply = async refresh => {
    if (submitting.current || initial.error || (refresh && sourceDirty)) return;
    submitting.current = true;
    setBusy(true);
    setAlert(null, '');
    try {
      const result = refresh ? await replayBackendSource(slot, savedDraft) : { settings: saveBackendSourceConfiguration(slot, draft) };
      const saved = result.settings;
      const latest = readAllSourceSettings();
      if (JSON.stringify(latest[active]) !== JSON.stringify(stored[active])) throw Error('此来源已更新，请重新打开设置。');
      const next = { ...latest, [active]: saved };
      localStorage.setItem(backendSourceStorageKey, JSON.stringify(next));
      setStored(previous => ({ ...previous, [active]: saved }));
      setDrafts(previous => ({ ...previous, [active]: {
        ...backendSourceDraft(slot, saved), ...(refresh && sourceInputs(previous[active])),
      } }));
      if (result.status === 'changed') setAlert('success', '已校验并载入随版本提供的目录快照。');
      if (result.status === 'unchanged') setAlert('info', '目录内容未变化。');
      if (!refresh) {
        showUrlError('');
        Toast.success(t('来源设置已保存'));
      }
      onSaved?.();
    } catch (issue) {
      if (issue.field === 'url') {
        if (!draft.remoteEnabled) update({ remoteEnabled: true });
        showUrlError(issue.message);
      } else setAlert('danger', issue.message || '无法保存来源设置。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return <>
    <AdminSideSheet title={t('后端来源')} visible width="min(680px, 100vw)" closeOnEsc={!discard && !busy} onCancel={close}
      className="inference-backend-editor" footer={<>
        <Button disabled={busy} onClick={close}>{t('取消')}</Button>
        {draft.remoteEnabled && <Tooltip content={sourceDirty ? t('保存来源后可立即同步。') : undefined}>
          <span><Button icon={<IconRefresh aria-hidden="true"/>} loading={busy} disabled={sourceDirty || Boolean(initial.error)}
            onClick={() => apply(true)}>{t('立即同步')}</Button></span>
        </Tooltip>}
        <Button theme="solid" type="primary" disabled={busy || Boolean(initial.error)} onClick={() => apply(false)}>{t('保存')}</Button>
      </>}>
      <Tabs activeKey={active} onChange={setActive}>
        {backendSourceSlots.map(item => <Tabs.TabPane key={item.key} itemKey={item.key} tab={t(item.label)} disabled={busy}/>)}
      </Tabs>
      <div className="inference-backend-editor-body">
        {initial.error && <Banner fullMode={false} type="danger" closeIcon={null} description={t(initial.error)}/>}
        {alert?.message && <Banner fullMode={false} type={alert.type} closeIcon={null} description={t(alert.message)}/>}
        <RadioGroup type="card" value={draft.remoteEnabled ? 'url' : 'embedded'} aria-label={t('来源方式')} disabled={busy}
          onChange={event => update({ remoteEnabled: event.target.value === 'url' })}>
          <Radio value="url">URL</Radio><Radio value="embedded">{t('内置')}</Radio>
        </RadioGroup>
        {draft.remoteEnabled ? <>
          <Form.Label htmlFor={`inference-source-${active}`}>{t('来源 URL')} {official && <Tag size="small">{t('官方')}</Tag>}</Form.Label>
          <Input id={`inference-source-${active}`} value={draft.url} onChange={url => update({ url })} showClear disabled={busy}
            onBlur={() => showUrlError(backendSourceUrlError(slot, draft))} validateStatus={urlError ? 'error' : 'default'}
            aria-invalid={Boolean(urlError)} aria-describedby={urlError ? `inference-source-error-${active}` : undefined}/>
          {urlError && <Typography.Text type="danger" role="alert" id={`inference-source-error-${active}`}>{t(urlError)}</Typography.Text>}
          {!official && <div><Button theme="borderless" disabled={busy} onClick={() => update({ url: slot.url })}>{t('重置为官方来源')}</Button></div>}
          <div className="inference-backend-inline-toolbar">
            <Typography.Text>{t('自动更新')}</Typography.Text>
            <Switch aria-label={t('自动更新')} checked={draft[hoursKey] > 0} disabled={busy} aria-describedby={`inference-source-cadence-${active}`}
              onChange={enabled => update({ [hoursKey]: enabled ? 12 : 0 })}/>
          </div>
          <Typography.Text id={`inference-source-cadence-${active}`} type="tertiary" size="small">{t('更新间隔保存在原型设置中。目录通过手动同步检查。')}</Typography.Text>
          {draft[hoursKey] > 0 && <div className="inference-backend-field">
            <Form.Label htmlFor={`inference-source-hours-${active}`}>{t('更新间隔（小时）')}</Form.Label>
            <InputNumber id={`inference-source-hours-${active}`} value={draft[hoursKey]} min={1} max={168} step={1} precision={0} disabled={busy}
              onChange={next => update({ [hoursKey]: backendSourceHours(next) })}/>
          </div>}
          {syncError && <Banner fullMode={false} type="warning" closeIcon={null} title={t('最近同步失败')}
            description={`${formatTime(syncError.checkedAt)} · ${t(syncError.message)}`}/>}
        </> : <Banner fullMode={false} type="info" closeIcon={null} description={t('使用随版本提供的后端目录。已保存的 URL 可在重新启用时使用。')}/>}
        <SourceSnapshot slot={slot} status={snapshotStatus}/>
      </div>
    </AdminSideSheet>
    {discard && serviceOperationsUi.renderLeaveDialog({ cancel: () => setDiscard(false), discard: onClose })}
  </>;
}

export default function InferenceBackendSource({ actorRole, onSaved }) {
  const t = useChannelText();
  const [open, setOpen] = useState(false);
  if (actorRole !== '平台管理员') return null;
  return <><Button onClick={() => setOpen(true)}>{t('后端来源')}</Button>
    {open && <BackendSourceDrawer onClose={() => setOpen(false)} onSaved={onSaved}/>}
  </>;
}
