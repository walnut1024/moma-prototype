import { useChannelText } from './channel-language';
import React, { useEffect, useState } from 'react';
import { Button, Card, Select, Space, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import FailoverFields from "./FailoverFields";
import { ROUTING_STRATEGIES } from "./service-routing-strategies.mjs";
import { failoverError, parameterError, routingParameters } from './global-routing-parameters.mjs';

const routingOptions = Object.entries(ROUTING_STRATEGIES).filter(([value]) => value !== 'cost-based-routing');

export default function GlobalRouting({ saved, revision, transact, conflict, dirtyRef }) {
  const t = useChannelText();
  const [draft, setDraft] = useState(null);
  const [baseRevision, setBaseRevision] = useState(null);
  const [saving, setSaving] = useState(false);
  const values = draft ?? saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const invalid = failoverError(values) || routingParameters.some(field => parameterError(field, values[field.key]));
  useEffect(() => {
    dirtyRef.current = dirty;
    return () => { dirtyRef.current = false; };
  }, [dirty, dirtyRef]);

  async function save() {
    setSaving(true);
    try {
      await transact({ type: 'saveGlobalRoutingParameters', values: draft }, baseRevision);
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
            <Button theme="solid" loading={saving} disabled={!dirty || invalid || saving || conflict} onClick={save}>{t('保存')}</Button>
          </> : <Button theme="solid" disabled={conflict} onClick={() => {
            setBaseRevision(revision);
            setDraft({ ...saved });
          }}>{t('编辑')}</Button>}
        </Space>;
  const change = patch => setDraft(current => ({ ...current, ...patch }));
  const [tab, setTab] = useState("failover");
  return <Tabs activeKey={tab} onChange={next => { if (!saving && (!dirty || window.confirm(t('放弃未保存的修改？')))) { setDraft(null); setTab(next); } }}>
    <Tabs.TabPane itemKey="failover" tab={t('全局故障转移策略')}><Card title={t('故障转移配置')} headerExtraContent={actions}>
      <FailoverFields showRetryInterval values={values} change={change} disabled={!draft || saving || conflict}/>
    </Card></Tabs.TabPane>
    <Tabs.TabPane itemKey="routing" tab={t('全局路由策略')}><Card title={t('上游模型选择')} headerExtraContent={actions}>
      <Space vertical align="start"><Select aria-label={t('全局路由策略')} value={values.strategy} disabled={!draft || saving || conflict}
        optionList={routingOptions.map(([value, item]) => ({ value, label: t(item.label) }))}
        renderSelectedItem={({ value }) => t(ROUTING_STRATEGIES[value].label)}
        onChange={strategy => change({ strategy })}/>
        <Typography.Text type="secondary">{t(ROUTING_STRATEGIES[values.strategy].description)}</Typography.Text>
      </Space>
    </Card></Tabs.TabPane>
  </Tabs>;
}
