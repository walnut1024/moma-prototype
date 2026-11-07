import { useId } from 'react';
import { Collapse } from '@douyinfe/semi-ui';
import './admin-collapse.css';

// Semi 2.104 renders the header as a focusable div without keyboard activation.
function activateHeader(event) {
  const { target, currentTarget, key, repeat } = event;
  if (repeat || (key !== 'Enter' && key !== ' ') || target.parentElement !== currentTarget) return;
  if (!target.matches('.semi-collapse-header:not([aria-disabled="true"])')) return;
  event.preventDefault();
  target.click();
}

export default function AdminCollapsePanel({ className = '', header, ...props }) {
  const labelId = useId();
  const label = node => node?.closest('.semi-collapse-header')?.setAttribute('aria-labelledby', labelId);
  return <Collapse.Panel {...props} className={`admin-collapse-panel ${className}`} onKeyDown={activateHeader}
    header={<div id={labelId} ref={label}>{header}</div>}/>;
}
