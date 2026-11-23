import { lazy, Suspense, useRef, useState } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { useChannelText } from './channel-language';
import './development-notes.css';

const DevelopmentNotesDialog = lazy(() => import('./DevelopmentNotesDialog'));

export default function DevelopmentNotes({ admin = false }) {
  const translateLabel = useChannelText();
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  return <>
    <Button size="small" theme="light" type="tertiary" className={admin ? undefined : 'development-notes-trigger'}
      aria-label="研发人员注意：功能说明（非产品功能）" title="研发说明 · 非产品功能"
      onClick={event => { trigger.current = event.currentTarget; setOpen(true); }}>{translateLabel("研发人员注意")}</Button>
    {open && <Suspense fallback={<span className="sr-only" role="status">正在加载说明…</span>}>
      <DevelopmentNotesDialog admin={admin} close={close}/>
    </Suspense>}
  </>;
}
