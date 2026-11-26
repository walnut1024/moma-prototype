import { useChannelText } from './channel-language';
import React, { useEffect, useState } from 'react';
import { Button, Card, Select, Space, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import FailoverFields from "./FailoverFields";
import { ROUTING_STRATEGIES } from "./service-routing-strategies.mjs";
import { failoverError, globalRoutingStrategies } from './global-routing-parameters.mjs';

export default function GlobalRouting({ saved, revision, transact, conflict, dirtyRef }) {
  const t = useChannelText();
  const [draft, setDraft] = useState(null);
  const [baseRevision, setBaseRevision] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('failover');
  const values = draft ?? saved;
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
      const values = tab === 'routing' ? draft : failover;
      await transact({ type: 'saveGlobalRoutingParameters', values }, baseRevision);
      setDraft(null);
      Toast.success(t('全局配置已保存'));
    } catch (error) {
      Toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const actions = <Space style={{ justifyContent: 'flex-end' }}>
          {draft ? <>
            <Button disabled={saving} onClick={() => setDraft(null)}>{t('取消')}</Button>
            <Button theme="solid" loading={saving} disabled={!dirty || saving || conflict} onClick={save}>{t('保存')}</Button>
          </> : <Button theme="solid" disabled={conflict} onClick={() => {
            setBaseRevision(revision);
            setDraft({ ...saved });
          }}>{t('编辑')}</Button>}
        </Space>;
  const change = patch => setDraft(current => ({ ...current, ...patch }));
  return <Tabs activeKey={tab} onChange={next => { if (!saving && (!dirty || window.confirm(t('放弃未保存的修改？')))) { setDraft(null); setTab(next); } }}>
    <Tabs.TabPane itemKey="failover" tab={t('全局故障转移策略')}><Card title={t('故障转移配置')} headerExtraContent={actions}>
      <FailoverFields showRetryInterval values={values} change={change} disabled={!draft || saving || conflict}/>
    </Card></Tabs.TabPane>
    <Tabs.TabPane itemKey="routing" tab={t('全局路由策略')}><Card title={t('上游模型选择')} headerExtraContent={actions}>
      <Space vertical align="start"><Select aria-label={t('全局路由策略')} value={values.strategy} disabled={!draft || saving || conflict}
        optionList={globalRoutingStrategies.map(value => ({ value, label: t(ROUTING_STRATEGIES[value].label) }))}
        renderSelectedItem={({ value }) => t(ROUTING_STRATEGIES[value].label)}
        onChange={strategy => change({ strategy })}/>
        <Typography.Text type="secondary">{t(ROUTING_STRATEGIES[values.strategy].description)}</Typography.Text>
      </Space>
    </Card></Tabs.TabPane>
  </Tabs>;
}
