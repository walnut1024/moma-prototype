import { Fragment, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
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
  const trigger = useRef(null);
  const [key, label] = active || [];
  const agreement = config[key] || {};
  return <>
    {AGREEMENTS.map(([id, name], index) => <Fragment key={id}>
      {index > 0 && <span>和</span>}
      {PRIVATE_SITE
        ? <Button variant="link" asChild><a href={agreementHref(id)} target="_blank" rel="noreferrer">{name}</a></Button>
        : config[id].url
        ? <Button variant="link" asChild><a href={config[id].url} target="_blank" rel="noreferrer">{name}</a></Button>
        : <Button variant="link" type="button" onClick={event => { trigger.current = event.currentTarget; setActive([id, name]); }}>{name}</Button>}
    </Fragment>)}
    <Dialog open={Boolean(active)} onOpenChange={open => { if (!open) setActive(null); }}>
      <DialogContent className="auth-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
        <DialogHeader><DialogTitle>{label}</DialogTitle>
          <DialogDescription className="sr-only">{label}正文</DialogDescription>
        </DialogHeader>
        <div tabIndex={0} style={{ maxHeight: '60dvh', overflow: 'auto' }}><AgreementContent agreement={agreement} /></div>
        <DialogFooter><Button type="button" onClick={() => setActive(null)}>关闭</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
