import { Children, cloneElement, isValidElement, useCallback, useId, useRef, useState } from 'react';
import { h } from 'vue';
import { ECollapse, EPanel } from '@cmss-bfs/haloe/dist/es/index.js';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { XaButton, XaPopover } from './HaloComponents.jsx';
import HaloHost from './HaloHost.jsx';
import '../admin-collapse.css';

function selectedKeys(value, accordion) {
  const keys = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return (accordion ? keys.slice(0, 1) : keys).map(String);
}

export function Collapse({
  children, activeKey, defaultActiveKey, accordion, keepDOM = false, onChange, className, style,
  expandIcon, collapseIcon, expandIconPosition = 'right', ...props
}) {
  const instanceId = useId();
  const [draft, setDraft] = useState(defaultActiveKey);
  const active = selectedKeys(activeKey ?? draft, accordion);
  const panels = Children.toArray(children).filter(isValidElement).map((child, index) => ({
    ...child.props, name: String(child.props.itemKey ?? index),
  }));
  const portals = new Map(panels.flatMap(({ name, header, children: content, disabled }, index) => {
    const opened = active.includes(name);
    const prefix = instanceId + '-' + index;
    const icon = opened
      ? collapseIcon ?? <ChevronDown size={16} aria-hidden="true"/>
      : expandIcon ?? <ChevronRight size={16} aria-hidden="true"/>;
    return [
      ['header-' + name, <div className="xa24-collapse-heading">
        {expandIconPosition === 'left' && icon}
        <div id={prefix + '-label'} className="xa24-collapse-label">{header}</div>
        {expandIconPosition !== 'left' && icon}
        <button type="button" id={prefix + '-button'} className="xa24-collapse-trigger" disabled={disabled}
          aria-labelledby={prefix + '-label'} aria-expanded={opened} aria-controls={prefix + '-content'}/>
      </div>],
      ['content-' + name, content],
    ];
  }));
  return <HaloHost renderVue={target => h(ECollapse, {
    class: className, style, accordion, value: [...active],
    'aria-label': props['aria-label'], 'aria-labelledby': props['aria-labelledby'],
    onOnChange: keys => {
      const next = [...keys];
      setDraft(next);
      onChange?.(next);
    },
  }, () => panels.map(({ name, disabled, className: panelClass }, index) => {
    const opened = active.includes(name);
    const prefix = instanceId + '-' + index;
    return h(EPanel, { key: name, name, disabled, hideArrow: true, class: ['admin-collapse-panel', panelClass] }, {
      default: () => target('header-' + name),
      content: () => h('div', {
        id: prefix + '-content', hidden: !opened, inert: !opened,
      }, keepDOM || opened ? [target('content-' + name, 'div')] : []),
    });
  }))} portals={portals}/>;
}

Collapse.Panel = () => null;

const placements = { bottomLeft: 'bottom-start', bottomRight: 'bottom-end', topLeft: 'top-start', topRight: 'top-end' };
const enabledItems = menu => [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];

export function Dropdown({ children, menu, render, visible, onVisibleChange, position = 'bottomRight', clickToHide = true }) {
  const id = useId();
  const triggerId = children.props.id ?? id + '-trigger';
  const [draft, setDraft] = useState(false);
  const open = visible ?? draft;
  const trigger = useRef(null);
  const pendingFocus = useRef(null);
  const items = menu ?? Children.toArray(render?.props?.children).filter(isValidElement).map(child => ({
    ...child.props, key: child.key, name: child.props.children,
  }));
  const changeOpen = next => {
    if (!next) pendingFocus.current = null;
    if (visible === undefined) setDraft(next);
    if (open !== next) onVisibleChange?.(next);
  };
  const focusMenu = useCallback(list => {
    if (!list || !open) return;
    const focusWhenMounted = () => {
      if (!pendingFocus.current) return;
      const options = enabledItems(list);
      const target = pendingFocus.current === 'last' ? options.at(-1) : options[0];
      if (!target) {
        list.focus({ preventScroll: true });
        return;
      }
      pendingFocus.current = null;
      target.focus();
    };
    const observer = new MutationObserver(focusWhenMounted);
    observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    const frame = requestAnimationFrame(focusWhenMounted);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [open]);
  const close = () => {
    changeOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const dismissOutsideFocus = event => {
    const next = event.relatedTarget;
    if (open && next && next !== trigger.current && !document.getElementById(id)?.contains(next)) changeOpen(false);
  };
  const handleNavigation = event => {
    const list = event.currentTarget;
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
      }
      close();
      return;
    }
    const options = enabledItems(list);
    if (!options.length) return;
    const current = options.indexOf(document.activeElement);
    let next;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = options.length - 1;
    if (event.key === 'ArrowDown') next = (current + 1) % options.length;
    if (event.key === 'ArrowUp') next = current <= 0 ? options.length - 1 : current - 1;
    if (next === undefined) return;
    event.preventDefault();
    options[next]?.focus();
  };
  const content = <ul id={id} role="menu" tabIndex={-1} className="haloe-dropdown-menu xa24-action-menu"
    aria-labelledby={triggerId} ref={focusMenu} onKeyDown={handleNavigation} onBlur={dismissOutsideFocus}>
    {items.map(({ key, name, node, type, disabled, icon, onClick }, index) => {
      if (node === 'divider') return <li key={key ?? index} role="separator"/>;
      if (node === 'title') return <li key={key ?? index} className="xa24-action-menu-title">{name}</li>;
      return <li key={key ?? index} role="presentation"><XaButton block size="small" theme="borderless" type={type}
        className="xa24-menu-item" role="menuitem" tabIndex={-1} disabled={disabled} icon={icon} onClick={event => {
          if (clickToHide) close();
          onClick?.(event);
        }}>{name}</XaButton></li>;
    })}
  </ul>;
  const handleTriggerKey = event => {
    children.props.onKeyDown?.(event);
    if (event.defaultPrevented || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    trigger.current = document.getElementById(triggerId);
    pendingFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
    if (!open) {
      changeOpen(true);
      return;
    }
    const list = document.getElementById(id);
    if (!list) return;
    const options = enabledItems(list);
    const target = pendingFocus.current === 'last' ? options.at(-1) : options[0];
    (target ?? list).focus();
    pendingFocus.current = null;
  };
  return <XaPopover open={open} onChange={changeOpen} placement={placements[position] ?? position} content={content}>
    <span onKeyDown={handleTriggerKey}>
      {cloneElement(children, {
        id: triggerId, 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? id : undefined,
        onClick: event => {
          trigger.current = event.currentTarget;
          if (!open) pendingFocus.current = event.detail === 0 ? 'first' : null;
          children.props.onClick?.(event);
        },
        onBlur: event => {
          children.props.onBlur?.(event);
          dismissOutsideFocus(event);
        },
        onKeyDown: undefined,
      })}
    </span>
  </XaPopover>;
}

Dropdown.Menu = () => null;
Dropdown.Item = () => null;
