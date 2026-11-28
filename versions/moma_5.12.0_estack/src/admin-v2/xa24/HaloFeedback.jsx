import { cloneElement, isValidElement, useEffect, useId, useState } from 'react';
import { EProgress, ETooltip } from '@cmss-bfs/haloe/dist/es/index.js';
import HaloHost from './HaloHost.jsx';
import { XaBanner, XaPopover } from './HaloComponents.jsx';

function haloPlacement(position = 'bottom') {
  if (position.endsWith('Left')) return position.slice(0, -4) + '-start';
  if (position.endsWith('Right')) return position.slice(0, -5) + '-end';
  if (position.endsWith('Top')) return position.slice(0, -3) + '-start';
  if (position.endsWith('Bottom')) return position.slice(0, -6) + '-end';
  return position;
}

export function Tooltip({ children, content, position = 'top', closeOnEsc = true, className, disabled }) {
  const id = useId();
  const [opened, setOpened] = useState(false);
  const active = opened && !disabled;
  if (content == null || content === '') return children;
  const trigger = isValidElement(children) ? cloneElement(children, {
    'aria-describedby': active ? [children.props['aria-describedby'], id].filter(Boolean).join(' ') : children.props['aria-describedby'],
  }) : children;
  return <HaloHost as="span" className={['xa24-tooltip-host', className].filter(Boolean).join(' ')}
    onMouseEnter={() => setOpened(true)} onMouseLeave={() => setOpened(false)}
    onFocus={() => setOpened(true)} onBlur={() => setOpened(false)} onKeyDown={event => {
      if (closeOnEsc && event.key === 'Escape' && active) {
        event.stopPropagation();
        setOpened(false);
      }
    }}
    component={ETooltip} vueProps={{ controlled: true, modelValue: active, placement: haloPlacement(position), transfer: false }}
    slots={{ content: <span id={id} role="tooltip">{content}</span> }}>{trigger}</HaloHost>;
}

export function Popover({ children, content, position, visible, onVisibleChange, className }) {
  const [open, setOpen] = useState(false);
  const active = visible ?? open;
  return <span className={className}><XaPopover open={active} placement={haloPlacement(position)}
    onChange={next => {
      if (visible == null) setOpen(next);
      onVisibleChange?.(next);
    }} content={typeof content === 'function' ? content({}) : content}>
    {children}
  </XaPopover></span>;
}

export function Progress({ percent = 0, showInfo = true, stroke, strokeWidth, type, className, size, ...props }) {
  const value = Math.min(100, Math.max(0, Number(percent) || 0));
  return <HaloHost component={EProgress} className={className} role="progressbar" aria-valuenow={value}
    aria-valuemin={0} aria-valuemax={100} aria-label={props['aria-label']}
    vueProps={{ percent: value, hideInfo: !showInfo, strokeColor: stroke, strokeWidth, type: size === 'small' ? 'small' : 'default',
      vertical: type === 'vertical' }}/>;
}

const toastListeners = new Set();
function notify(level, options) {
  const { content, duration = 3.5 } = typeof options === 'object' && !isValidElement(options) && options !== null
    ? options : { content: options };
  if (content == null) return;
  for (const listener of toastListeners) listener({ level, content, duration });
}

export const Toast = {
  error: content => notify('danger', content),
  info: content => notify('info', content),
  success: content => notify('success', content),
  warning: content => notify('warning', content),
};

export function XaToastRegion() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    toastListeners.add(setToast);
    return () => toastListeners.delete(setToast);
  }, []);
  useEffect(() => {
    if (!toast || !toast.duration) return;
    const timer = setTimeout(() => setToast(null), toast.duration * 1000);
    return () => clearTimeout(timer);
  }, [toast]);
  return toast && <div className="xa24-toast"><XaBanner type={toast.level} description={toast.content} onClose={() => setToast(null)}/></div>;
}
