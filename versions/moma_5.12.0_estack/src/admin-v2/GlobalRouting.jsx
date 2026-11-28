import { useChannelText } from './channel-language';
import { useEffect, useState } from 'react';
import { Button, Card, Space, Toast, Typography } from './xa24/HaloUI.jsx';
import { Select } from './xa24/HaloUI.jsx';
import AdminPageHeading from './AdminPageHeading';
import FailoverFields from "./FailoverFields";
import { ROUTING_STRATEGIES } from "./service-routing-strategies.mjs";
import { failoverError, globalRoutingStrategies } from './global-routing-parameters.mjs';
import artwork from './xa27-artwork/xaGlobalRoute.png';
import './global-routing.css';

export default function GlobalRouting({ saved, revision, transact, conflict, dirtyRef }) {
  const t = useChannelText();
  const [draft, setDraft] = useState(null);
  const [baseRevision, setBaseRevision] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    dirtyRef.current = dirty;
    return () => { dirtyRef.current = false; };
  }, [dirty, dirtyRef]);

  async function save() {
    const invalid = failoverError(draft);
    if (invalid) {
      Toast.error(t(invalid));
      return;
    }
    setSaving(true);
    try {
      const { strategy: _strategy, ...failover } = draft;
      const values = editing === 'routing' ? draft : failover;
      await transact({ type: 'saveGlobalRoutingParameters', values }, baseRevision);
      closeEditor();
      Toast.success(t('全局配置已保存'));
    } catch (error) {
      Toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  function closeEditor() {
    setDraft(null);
    setEditing(null);
  }
  const actions = section => <Space>
    {editing === section ? <>
      <Button disabled={saving} onClick={closeEditor}>{t('取消')}</Button>
      <Button theme="solid" loading={saving} disabled={!dirty || saving || conflict} onClick={save}>{t('保存')}</Button>
    </> : <Button theme="solid" disabled={saving || conflict} onClick={() => {
      if (dirty && !window.confirm(t('放弃未保存的修改？'))) return;
      setBaseRevision(revision);
      setDraft({ ...saved });
      setEditing(section);
    }}>{t('编辑')}</Button>}
  </Space>;
  const change = patch => setDraft(current => ({ ...current, ...patch }));
  const routing = editing === 'routing' ? draft : saved;
  return <div className="admin-page-stack global-routing">
    <AdminPageHeading title={t('路由设置（全局）')} description={t('配置模型服务共用的路由与故障转移规则。', 'Configure routing and failover rules shared by model services.')} artwork={artwork}/>
    <Card className="xa24-page-card" padding={20}>
      <div className="global-routing-title"><h2>{t('全局故障转移策略')}</h2>{actions('failover')}</div>
      <FailoverFields showRetryInterval values={editing === 'failover' ? draft : saved} change={change} disabled={editing !== 'failover' || saving || conflict}/>
    </Card>
    <Card className="xa24-page-card" padding={20}>
      <div className="global-routing-title"><h2>{t('全局路由策略')}</h2>{actions('routing')}</div>
      <Space vertical align="start"><Select aria-label={t('全局路由策略')} value={routing.strategy} disabled={editing !== 'routing' || saving || conflict}
        optionList={globalRoutingStrategies.map(value => ({ value, label: t(ROUTING_STRATEGIES[value].label) }))}
        onChange={strategy => change({ strategy })}/>
        <Typography.Text type="secondary">{t(ROUTING_STRATEGIES[routing.strategy].description)}</Typography.Text>
      </Space>
    </Card>
  </div>;
}
