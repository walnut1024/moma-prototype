import { Children, cloneElement, isValidElement, useId, useRef, useState } from 'react';
import { h } from 'vue';
import { EAvatar, ECheckbox, ECheckboxGroup, EImage, EStep, ESteps, ETimeline, ETimelineItem } from '@cmss-bfs/haloe/dist/es/index.js';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import HaloHost from './HaloHost.jsx';
import { XaButton, XaCheckbox, XaInput, XaPopover, XaTag } from './HaloComponents.jsx';
import { useChannelText } from '../channel-language.js';

export function XaDescriptions({ data = [], children, className, layout, column = 3, row, size, style, align, ...props }) {
  const entries = data.length ? data : Children.toArray(children).filter(isValidElement).map(child => ({
    ...child.props, key: child.props.itemKey, value: child.props.children,
  }));
  const columns = layout === 'horizontal' || row ? Math.max(1, column) : 1;
  return <dl {...props} className={className} style={{
    display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: 12, margin: 0, fontSize: size === 'small' ? 13 : 14, ...style,
  }}>
    {entries.filter(entry => !entry.hidden).map((entry, index) => <div key={index} className={entry.className}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 140px) minmax(0, 1fr)', gap: 8,
        alignItems: 'start', minInlineSize: 0, overflowWrap: 'anywhere', ...entry.style,
      }}>
      <dt style={{ color: 'var(--xa24-muted)', textAlign: align === 'right' ? 'end' : 'start', ...entry.keyStyle }}>{entry.key}</dt>
      <dd style={{ margin: 0 }}>{typeof entry.value === 'function' ? entry.value() : entry.value}</dd>
    </div>)}
  </dl>;
}
XaDescriptions.Item = () => null;

export function XaSteps({ children, current = 0, status, size, direction, className, ...props }) {
  const steps = Children.toArray(children).filter(isValidElement);
  return <HaloHost className={className} renderVue={() => h(ESteps, {
    ...props, role: 'list', current, status, direction, size: size === 'small' ? 'small' : undefined,
  }, {
    default: () => steps.map(({ key, props: item }, index) => h(EStep, {
      key: key ?? index, role: 'listitem', 'aria-current': index === current ? 'step' : undefined,
      title: item.title, content: item.description, status: item.status, icon: item.icon,
    })),
  })}/>;
}
XaSteps.Step = () => null;

const timelineColor = { success: 'green', error: 'red', default: '#6b7280' };
function hideInactiveTimelineControl({ el }) {
  el.querySelector('.haloe-timeline-item-expand-opacity')?.setAttribute('inert', '');
}

export function XaTimeline({ children, className, ...props }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return <HaloHost className={className} renderVue={target => h(ETimeline, props,
    () => rows.map(({ key, props: item }, index) => h(ETimelineItem, {
      key: key ?? index, color: timelineColor[item.type] ?? 'blue', timestamp: item.time,
      onVnodeMounted: hideInactiveTimelineControl,
    }, () => target(key ?? index, 'div'))))}
    portals={new Map(rows.map(({ key, props: item }, index) => [key ?? index, item.children]))}/>;
}
XaTimeline.Item = () => null;

export function XaAvatar({ children, size, className, ...props }) {
  return <HaloHost as="span" className={className} component={EAvatar}
    vueProps={{ ...props, size: size === 'extra-small' ? 24 : size }}>{children}</HaloHost>;
}

export function XaImage({ imgStyle, className, onLoad, onError, ...props }) {
  return <HaloHost as="span" className={className} component={EImage}
    vueProps={{ ...props, fit: imgStyle?.objectFit, transfer: false, onOnLoad: onLoad, onOnError: onError }}/>;
}

export function XaSlider({ value, defaultValue, onChange, onAfterChange, style, ...props }) {
  return <input {...props} type="range" value={value} defaultValue={defaultValue}
    style={{ inlineSize: '100%', accentColor: 'var(--xa24-primary)', ...style }}
    onChange={event => onChange?.(Number(event.currentTarget.value))}
    onPointerUp={onAfterChange && (event => onAfterChange(Number(event.currentTarget.value)))}
    onKeyUp={onAfterChange && (event => onAfterChange(Number(event.currentTarget.value)))}/>;
}

export function XaTagInput({
  value, defaultValue = [], onChange, max = Infinity, maxLength, addOnBlur, disabled, placeholder,
  className, style, ...props
}) {
  const t = useChannelText();
  const [local, setLocal] = useState(defaultValue);
  const [text, setText] = useState('');
  const entries = value ?? local;
  const publish = next => {
    if (value === undefined) setLocal(next);
    onChange?.(next);
  };
  const add = () => {
    if (!text || disabled) return;
    const additions = text.split(',').map(tag => maxLength == null ? tag : tag.slice(0, maxLength))
      .filter(tag => tag.trim()).slice(0, Math.max(0, max - entries.length));
    if (additions.length) publish([...entries, ...additions]);
    setText('');
  };
  return <div className={className} style={{ display: 'grid', gap: 6, minInlineSize: 0, ...style }}>
    {entries.length > 0 && <div className="xa24-space" style={{ gap: 4, flexWrap: 'wrap' }}>
      {entries.map((entry, index) => <span key={index} className="xa24-control">
        <XaTag>{entry}</XaTag>
        {!disabled && <XaButton aria-label={t('移除标签') + ' ' + entry} size="small" theme="borderless"
          icon={<X size={12} aria-hidden="true"/>} onClick={() => publish(entries.filter((_, position) => position !== index))}/>}
      </span>)}
    </div>}
    <XaInput {...props} value={text} disabled={disabled} placeholder={placeholder}
      onChange={setText} onBlur={addOnBlur ? add : undefined} onKeyDown={event => {
        if (event.isComposing) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          add();
        } else if (event.key === 'Backspace' && !text && entries.length) {
          publish(entries.slice(0, -1));
        }
      }}/>
  </div>;
}

export function XaUpload({
  accept, multiple, disabled, children, draggable, dragIcon, dragMainText, dragSubText,
  beforeUpload, onFileChange, className, style,
}) {
  const t = useChannelText();
  const input = useRef(null);
  const acceptFiles = async selection => {
    if (disabled || !selection.length) return;
    const files = Array.from(selection).slice(0, multiple ? undefined : 1);
    const accepted = [];
    for (const file of files) {
      const result = await beforeUpload?.({ file: { name: file.name, size: file.size, type: file.type, fileInstance: file }, fileList: [] });
      if (result !== false && result?.shouldUpload !== false) accepted.push(file);
    }
    if (accepted.length) onFileChange?.(accepted);
  };
  const choose = event => {
    if (!disabled && !event.defaultPrevented) input.current?.click();
  };
  const trigger = isValidElement(children)
    ? cloneElement(children, {
      disabled: disabled || children.props.disabled,
      onClick: event => { children.props.onClick?.(event); choose(event); },
    })
    : <XaButton onClick={choose} icon={dragIcon} disabled={disabled}>
      {children ?? dragMainText ?? t('选择文件')}
    </XaButton>;
  return <div className={className} style={draggable ? {
    padding: 16, display: 'grid', justifyItems: 'center', gap: 8,
    border: '1px dashed var(--xa24-divider)', borderRadius: 'var(--xa24-control-radius)', ...style,
  } : style} onDragOver={draggable ? event => { event.preventDefault(); } : undefined}
    onDrop={draggable ? event => { event.preventDefault(); void acceptFiles(event.dataTransfer.files); } : undefined}>
    <input ref={input} type="file" hidden accept={accept} multiple={multiple} disabled={disabled}
      onChange={event => {
        const files = Array.from(event.currentTarget.files || []);
        event.currentTarget.value = '';
        void acceptFiles(files);
      }}/>
    {trigger}
    {draggable && dragSubText && <p className="xa24-help">{dragSubText}</p>}
  </div>;
}

function TreeBranch({ nodes, expandAll }) {
  return <ul style={{ listStyle: 'none', paddingInlineStart: 16 }}>
    {nodes.map(node => <li key={node.key}>
      {node.children?.length ? <details open={expandAll || node.expand || undefined}>
        <summary>{node.label ?? node.title}</summary>
        <TreeBranch nodes={node.children} expandAll={expandAll}/>
      </details> : <span>{node.label ?? node.title}</span>}
    </li>)}
  </ul>;
}

export function XaTree({ treeData = [], expandAll, className, style, ...props }) {
  return <div {...props} className={className} style={style}>
    <TreeBranch nodes={treeData} expandAll={expandAll}/>
  </div>;
}

export function XaCheckboxGroup({
  children, options, value, defaultValue = [], onChange, disabled, className, style, type, size, direction, ...props
}) {
  const [draft, setDraft] = useState(defaultValue);
  const items = options
    ? options.map(option => typeof option === 'object' ? option : { value: option, label: option })
    : Children.toArray(children).filter(isValidElement).map(child => ({ ...child.props, label: child.props.children }));
  const selection = value ?? draft;
  return <HaloHost className={className} style={style} renderVue={target => h(ECheckboxGroup, {
    ...props, role: 'group', 'aria-disabled': disabled || undefined,
    style: direction === 'vertical' ? { display: 'grid' } : undefined,
    modelValue: selection, type: type === 'button' ? 'button' : undefined, size: size === 'small' ? 'small' : 'base',
    'onUpdate:modelValue': next => {
      const changed = [...next];
      if (value === undefined) setDraft(changed);
      onChange?.(changed);
    },
  }, () => items.map(item => h(ECheckbox, {
    key: item.value, label: item.value, disabled: disabled || item.disabled, class: item.className,
  }, () => typeof item.label === 'string' || typeof item.label === 'number' ? String(item.label) : target(item.value))))}
    portals={new Map(items.map(item => [item.value, item.label]))}/>;
}

function cascaderBranches(nodes, path = [], labels = [], inheritedDisabled = false) {
  return nodes.map(raw => {
    const values = [...path, raw.value];
    const names = [...labels, raw.label ?? raw.value];
    const disabled = inheritedDisabled || raw.disabled;
    return { raw, values, names, disabled, key: JSON.stringify(values),
      children: cascaderBranches(raw.children ?? [], values, names, disabled) };
  });
}

function cascaderEntries(nodes) {
  return nodes.flatMap(node => [node, ...cascaderEntries(node.children)]);
}

export function XaCascader({
  treeData = [], value, defaultValue = [], multiple, changeOnSelect, disabled, showClear, onChange,
  onDropdownVisibleChange, filter, filterTreeNode, filterLeafOnly, placeholder, searchPlaceholder, emptyContent,
  maxTagCount = 1, insetLabel, displayProp, className, dropdownClassName, size, style, id, expandTrigger, ...props
}) {
  const t = useChannelText();
  const listId = useId();
  const button = useRef(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(defaultValue);
  const selection = value ?? draft;
  const paths = multiple ? selection : selection.length ? [selection] : [];
  const keys = paths.map(path => JSON.stringify(path));
  const tree = cascaderBranches(treeData);
  const entries = cascaderEntries(tree);
  const display = keys.map(key => {
    const node = entries.find(item => item.key === key);
    return node?.raw?.[displayProp] ?? node?.names.join(' / ') ?? '';
  }).filter(Boolean);
  const changeVisible = next => {
    if (next === open) return;
    setOpen(next);
    if (!next) setQuery('');
    if (next && !expanded.length && paths.length) setExpanded(paths.flatMap(path =>
      path.slice(0, -1).map((_, index) => JSON.stringify(path.slice(0, index + 1)))));
    onDropdownVisibleChange?.(next);
  };
  const publish = next => {
    if (value === undefined) setDraft(next);
    onChange?.(next);
  };
  const choose = node => {
    if (node.disabled) return;
    if (!multiple) {
      publish(node.values);
      changeVisible(false);
      button.current?.focus();
    } else {
      const index = keys.indexOf(node.key);
      publish(index < 0 ? [...paths, node.values] : paths.filter((_, position) => position !== index));
    }
  };
  const toggle = key => setExpanded(previous => previous.includes(key)
    ? previous.filter(item => item !== key) : [...previous, key]);
  const showSearch = Boolean(filter || filterTreeNode);
  const keyword = query.trim();
  const results = keyword ? entries.filter(node => {
    if (node.children.length && (multiple ? filterLeafOnly !== false : !changeOnSelect)) return false;
    const label = node.names.join(' / ');
    return typeof filterTreeNode === 'function' ? filterTreeNode(keyword, label, node.raw)
      : (label + ' ' + node.raw.value).toLowerCase().includes(keyword.toLowerCase());
  }) : tree;
  const pick = (node, label) => multiple
    ? <XaCheckbox checked={keys.includes(node.key)} disabled={node.disabled} onChange={() => choose(node)}>{label}</XaCheckbox>
    : <XaButton type={keys.includes(node.key) ? 'primary' : 'tertiary'} theme="borderless" disabled={node.disabled}
      aria-pressed={keys.includes(node.key)} onClick={() => choose(node)}>{label}</XaButton>;
  const list = nodes => <ul style={{ listStyle: 'none', paddingInlineStart: 12, margin: 0 }}>
    {nodes.map(node => <li key={node.key}>
      {!keyword && node.children.length ? <>
        <div className="xa24-space">
          <XaButton theme="borderless" size="small"
            aria-expanded={expanded.includes(node.key)}
            aria-label={multiple || changeOnSelect ? node.raw.label ?? String(node.raw.value) : undefined}
            icon={(expanded.includes(node.key) ? <ChevronDown size={14} aria-hidden="true"/> : <ChevronRight size={14} aria-hidden="true"/>)}
            onMouseEnter={expandTrigger === 'hover' && !expanded.includes(node.key) ? () => toggle(node.key) : undefined}
            onClick={event => {
              if (expandTrigger === 'hover' && event.detail > 0 && expanded.includes(node.key)) return;
              toggle(node.key);
            }}>{multiple || changeOnSelect ? null : node.raw.label}</XaButton>
          {(multiple || changeOnSelect) && pick(node, node.raw.label)}
        </div>
        {expanded.includes(node.key) && list(node.children)}
      </> : pick(node, keyword ? node.names.join(' / ') : node.raw.label ?? node.raw.value)}
    </li>)}
  </ul>;
  const panel = open && <div id={listId} className={dropdownClassName} role="group"
    aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']}
    style={{ padding: 12, minInlineSize: 220, maxInlineSize: 'min(420px, calc(100vw - 28px))' }}>
    {showSearch && <XaInput autoFocus value={query} placeholder={searchPlaceholder ?? t('搜索选项')}
      aria-label={searchPlaceholder ?? t('搜索选项')} onChange={setQuery}/>}
    <div style={{ overflow: 'auto', maxBlockSize: 288, marginBlockStart: showSearch ? 8 : undefined }}>
      {results.length ? list(results) : <span className="xa24-help">{emptyContent ?? t('无匹配结果')}</span>}
    </div>
  </div>;
  const label = display.length ? display.slice(0, maxTagCount).join('、') : placeholder;
  const accessible = Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('aria-') || key.startsWith('data-')));
  return <div className={className} style={{ display: 'inline-flex', alignItems: 'center', maxInlineSize: '100%', ...style }}>
    <XaPopover open={open && !disabled} onChange={changeVisible} content={panel} placement="bottom-start">
      <XaButton {...accessible} ref={button} id={id} size={size} disabled={disabled} title={display.join('、') || undefined}
        aria-expanded={open} aria-controls={open ? listId : undefined}
        icon={<ChevronDown size={14} aria-hidden="true"/>} iconPosition="right">
        {insetLabel && <span className="xa24-help">{insetLabel}</span>}
        <span className="xa24-ellipsis">{label}</span>
        {display.length > maxTagCount && <span>+{display.length - maxTagCount}</span>}
      </XaButton>
    </XaPopover>
    {showClear && paths.length > 0 && !disabled && <XaButton theme="borderless" size="small"
      aria-label={t('清除选择')} icon={<X size={14} aria-hidden="true"/>} onClick={() => publish([])}/>}
  </div>;
}
