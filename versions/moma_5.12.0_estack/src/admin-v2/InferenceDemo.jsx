import { Banner, Button, Space, Toast, Typography } from '@douyinfe/semi-ui';
import { Fragment, useRef, useState } from 'react';
import { AdminModal } from './AdminOverlay';
import { useChannelText } from './channel-language';
import { createInferenceDemoState } from './inference-demo-data.js';
import { applyInferencePracticeAction, changeInferencePracticeInfrastructure, createInferencePractice } from './inference-practice.js';

export default function InferenceDemo({ role, interactive = false, children }) {
  const t = useChannelText();
  const makeSnapshot = () => interactive ? createInferencePractice(role) : {
    state: { ...createInferenceDemoState(), currentRole: role, inferenceDemo: true },
  };
  const [snapshot, setSnapshot] = useState(makeSnapshot);
  const current = useRef(snapshot);
  const [showReset, setShowReset] = useState(false);
  const [generation, setGeneration] = useState(0);
  const update = next => {
    current.current = next;
    setSnapshot(next);
    return next;
  };
  const dispatch = async action => {
    const next = update(applyInferencePracticeAction(current.current, action));
    if (action.feedback !== false) Toast.success(t('演示操作已保存'));
    return next.state;
  };
  const changeInfrastructure = async (pageId, change) =>
    update(changeInferencePracticeInfrastructure(current.current, pageId, change)).infrastructure;
  const returnHref = location.pathname + '#/admin-2/deployments';

  return <>
    <Banner type="info" closeIcon={null} title={t(interactive ? '模型推理可操作演示' : '模型推理演示数据')}
      description={<Space wrap>
        {interactive ? <>
          <Typography.Text>{t('操作只修改本次演示数据，刷新页面即可恢复。')}</Typography.Text>
          <Button theme="borderless" size="small" onClick={() => setShowReset(true)}>{t('重置演示数据')}</Button>
        </> : <Typography.Text link={{ href: '?demo=inference-interactive#/admin-2/deployments' }}>
          {t('进入可操作演示')}
        </Typography.Text>}
        <Typography.Text link={{ href: returnHref, className: 'admin-banner-return' }}>{t('返回实际部署')}</Typography.Text>
      </Space>}/>
    <Fragment key={generation}>
      {children(snapshot.state, true, {
        interactive, infrastructure: snapshot.infrastructure,
        dispatch: interactive ? dispatch : undefined,
        changeInfrastructure: interactive ? changeInfrastructure : undefined,
        refresh: async () => current.current.state,
      })}
    </Fragment>
    {showReset && <AdminModal visible title={t('重置演示数据？')} closeOnEsc
      okText={t('重置')} cancelText={t('取消')} cancelButtonProps={{ autoFocus: true }} onCancel={() => setShowReset(false)}
      onOk={() => {
        update(makeSnapshot());
        setGeneration(previous => previous + 1);
        setShowReset(false);
      }}>
      <Typography.Paragraph>{t('本次演示中的改动将被清空。')}</Typography.Paragraph>
    </AdminModal>}
  </>;
}
