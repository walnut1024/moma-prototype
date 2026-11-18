import { Fragment, useState } from 'react';
import { Button, Modal, Typography } from '@douyinfe/semi-ui';
import { AGREEMENTS, PRIVATE_SITE } from '../site-config.mjs';
import { agreementHref } from '../agreement-route.mjs';
import { useSiteConfig } from '../useSiteConfig';

export function AgreementContent({ agreement }) {
  if (agreement.url) return <a href={agreement.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{agreement.url}</a>;
  return <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.7 }}>{agreement.text || '当前未加载正式条款。'}</p>;
}

export default function SiteAgreementLinks() {
  const config = useSiteConfig();
  const [active, setActive] = useState(null);
  const [key, label] = active || [];
  const agreement = config[key] || {};
  return <>
    {AGREEMENTS.map(([id, name], index) => <Fragment key={id}>
      {index > 0 && <span>和</span>}
      {PRIVATE_SITE
        ? <Typography.Text link={{href:agreementHref(id),target:'_blank',rel:'noreferrer'}}>{name}</Typography.Text>
        : config[id].url
        ? <Typography.Text link={{href:config[id].url,target:'_blank',rel:'noreferrer'}}>{name}</Typography.Text>
        : <Button theme="borderless" size="small" onClick={() => setActive([id, name])}>{name}</Button>}
    </Fragment>)}
    <Modal visible={Boolean(active)} title={label} onCancel={() => setActive(null)}
      width="min(640px, calc(100vw - 24px))" footer={<Button onClick={() => setActive(null)}>关闭</Button>}>
        <div tabIndex={0} style={{ maxHeight: '60dvh', overflow: 'auto' }}><AgreementContent agreement={agreement} /></div>
    </Modal>
  </>;
}
