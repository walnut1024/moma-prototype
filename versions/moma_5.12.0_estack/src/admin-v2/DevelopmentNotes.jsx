import { lazy, Suspense, useRef, useState } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { useChannelText } from './channel-language';
import './development-notes.css';

const DevelopmentNotesDialog = lazy(() => import('./DevelopmentNotesDialog'));
const WorkbenchButton = lazy(() => import('./xa24/HaloComponents.jsx').then(module => ({ default: module.XaButton })));

export default function DevelopmentNotes({ admin = false }) {
  const translateLabel = useChannelText();
  const [open, setOpen] = useState(null);
  const trigger = useRef(null);
  const Trigger = admin ? WorkbenchButton : Button;
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  return <>
    <Suspense fallback={null}><Trigger size="small" theme="light" type="tertiary" className={admin ? undefined : 'development-notes-trigger'}
      aria-label="研发人员注意：功能说明（非产品功能）" title="研发说明 · 非产品功能"
      onClick={event => { trigger.current = event.currentTarget; setOpen(true); }}>{translateLabel("研发人员注意")}</Trigger></Suspense>
    {open !== null && <Suspense fallback={<span className="sr-only" role="status">正在加载说明…</span>}>
      <DevelopmentNotesDialog admin={admin} open={open} close={close}/>
    </Suspense>}
  </>;
}
