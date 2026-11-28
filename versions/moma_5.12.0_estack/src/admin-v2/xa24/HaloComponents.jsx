import { Children, cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { h, nextTick } from 'vue';
import { EAlert, EButton, ECard, ECheckbox, EDrawer, EDropdown, EInput, EModal, EOption, EOptionGroup, ESelect, ESpin, ETabPane, ETabs, ETag } from '@cmss-bfs/haloe/dist/es/index.js';
import { Check, ChevronLeft, ChevronRight, CircleHelp, Copy, X } from 'lucide-react';
import HaloHost from './HaloHost.jsx';
import { useChannelText } from '../channel-language.js';

const controlSize = size => size === 'small' ? 'small' : 'default';

export function XaButton({
  children, icon, iconPosition, block, type, theme, size, className, ref, href,
  onKeyDown, onKeyUp, onDragStart, onDragEnd, ...props
}) {
  const host = useRef(null);
  useLayoutEffect(() => {
    const target = host.current?.querySelector('button, a');
    if (typeof ref === 'function') {
      const cleanup = ref(target);
      return typeof cleanup === 'function' ? cleanup : () => ref(null);
    }
    if (ref) {
      ref.current = target;
      return () => { ref.current = null; };
    }
  }, [ref]);
  const variant = type === 'danger' ? (theme === 'solid' ? 'error' : 'text')
    : theme === 'borderless' ? 'text' : theme === 'solid' || type === 'primary' && theme !== 'light' ? 'primary' : 'secondary';
  return <HaloHost as="span" hostRef={host} className={block ? 'xa24-control xa24-control-block' : 'xa24-control'} component={EButton}
    vueProps={{ ...props, onKeydown: onKeyDown, onKeyup: onKeyUp, onDragstart: onDragStart, onDragend: onDragEnd,
      to: href, size: controlSize(size), type: variant, long: block,
      class: [className, theme === 'light' && 'xa24-button-selected', type === 'danger' && 'xa24-button-danger'] }}>
    <span className="xa24-button-content">
      {iconPosition !== 'right' && icon}{children}{iconPosition === 'right' && icon}
    </span>
  </HaloHost>;
}

export function XaCard({ children, className, title, headerExtraContent, bodyStyle, padding = 20, ...props }) {
  return <HaloHost className="xa24-card-host" component={ECard}
    vueProps={{ ...props, class: className, shadow: 'never', padding }}
    slots={{ title, extra: headerExtraContent }}>
    {bodyStyle ? <div style={bodyStyle}>{children}</div> : children}
  </HaloHost>;
}

export function XaInput({
  value, defaultValue, onChange, onBlur, onFocus, onKeyDown, onEnterPress, onClear, onClick,
  readOnly, readonly, autoFocus, autoComplete, spellCheck, maxLength, showClear, prefix, suffix, size, id, className, ref, mode,
  maxCount, showCounter, getValueLength, resize, textareaStyle, ...props
}) {
  const host = useRef(null);
  const controlId = useId();
  const [draft, setDraft] = useState(defaultValue ?? '');
  const current = value ?? draft;
  const textarea = (mode ?? props.type) === 'textarea';
  const count = textarea && (showCounter || maxCount) ? (getValueLength?.(current) ?? String(current).length) : null;
  useLayoutEffect(() => {
    const input = host.current?.querySelector('input, textarea');
    if (!input) return;
    for (const [key, attrValue] of Object.entries(props)) {
      if (key.startsWith('aria-') || key === 'required') {
        if (attrValue == null || key === 'required' && !attrValue) input.removeAttribute(key);
        else input.setAttribute(key, key === 'required' ? '' : String(attrValue));
      }
    }
    if (textarea && (resize || textareaStyle)) Object.assign(input.style, textareaStyle, resize && { resize });
    if (typeof ref === 'function') ref(input);
    else if (ref) ref.current = input;
  });
  const safeEnter = handler => handler && (event => {
    if (event.key !== 'Enter' || !event.isComposing && event.keyCode !== 229) handler(event);
  });
  const control = <HaloHost as="span" className={className} hostRef={host} component={EInput} slots={{ prefix, suffix }}
    vueProps={{ ...props, modelValue: current, elementId: id ?? controlId, size: controlSize(size),
      type: mode ?? props.type, readonly: readOnly ?? readonly, autofocus: autoFocus, autocomplete: autoComplete,
      spellcheck: spellCheck, maxlength: maxLength, clearable: showClear,
      onOnBlur: onBlur, onOnFocus: onFocus, onOnKeydown: safeEnter(onKeyDown), onOnEnter: safeEnter(onEnterPress),
      onOnClick: onClick, onOnClear: onClear, 'onUpdate:modelValue': next => {
        if (value == null) setDraft(next);
        onChange?.(next);
      },
    }}/>;
  return count == null ? control : <span className="xa24-counted-input">{control}
    <span className={maxCount && count > maxCount ? 'xa24-text-danger' : undefined}>{count}{maxCount ? `/${maxCount}` : ''}</span>
  </span>;
}
export const XaTextArea = props => <XaInput {...props} type="textarea"/>;

const spaceSizes = { tight: 8, medium: 16, loose: 24 };

export function XaSpace({ children, className, spacing = 'tight', wrap, vertical, align = 'center', style, ...props }) {
  const [column, row] = Array.isArray(spacing) ? spacing : [spacing, spacing];
  return <div {...props} className={['xa24-space', className].filter(Boolean).join(' ')}
    style={{ ...style, columnGap: spaceSizes[column] ?? column, rowGap: spaceSizes[row] ?? row,
      flexDirection: vertical ? 'column' : undefined, flexWrap: wrap && !vertical ? 'wrap' : undefined, alignItems: align }}>
    {children}
  </div>;
}

function XaText({ children, component: Component = 'span', className, type, size, strong, code, ellipsis,
  link, copyable, disabled, ...props }) {
  const Tag = link ? 'a' : code ? 'code' : strong && Component === 'span' ? 'strong' : Component;
  const linkProps = link && typeof link === 'object' ? link : {};
  const content = copyable ? <XaCopyId value={(typeof copyable === 'object' && copyable.content) || String(children ?? '')}
    displayValue={children} ellipsis={Boolean(ellipsis)} onError={typeof copyable === 'object' ? copyable.onError : undefined}/> : children;
  return <Tag {...props} {...linkProps} aria-disabled={disabled || props['aria-disabled']}
    className={[className, type !== undefined && 'xa24-text-' + type,
    size === 'small' && 'xa24-help', ellipsis && 'xa24-ellipsis'].filter(Boolean).join(' ')}
    title={props.title ?? (ellipsis && typeof children === 'string' ? children : undefined)}>{content}</Tag>;
}

function XaTitle({ heading = 3, component = 'h' + heading, ...props }) {
  return <XaText component={component} {...props}/>;
}

export const XaTypography = {
  Text: XaText,
  Paragraph: props => <XaText component="p" {...props}/>,
  Title: XaTitle,
};

export function XaTag({ children, color, size, onClose, onChange, closable, disabled, tagKey, tabIndex, ...props }) {
  const tone = color == null || color === 'grey' ? 'default' : color;
  const close = event => { if (!disabled) onClose?.(children, event, tagKey); };
  return <HaloHost as="span" className="xa24-control" component={ETag}
    vueProps={{ role: closable ? 'button' : undefined, ...props, color: tone, type: 'border', closable, disabled,
      tabindex: tabIndex ?? (closable && !disabled ? 0 : undefined),
      size: size === 'large' ? 'large' : 'default', onOnClose: close, onOnChange: onChange,
      onKeydown: closable ? event => {
        if (!['Backspace', 'Delete', 'Enter', ' '].includes(event.key) || disabled) return;
        event.preventDefault();
        event.stopPropagation();
        close(event);
      } : undefined }}>{children}</HaloHost>;
}

export function XaBanner({ title, description, type, closeIcon, className, onClose, children, ...props }) {
  return <HaloHost component={EAlert} className="xa24-banner-host" vueProps={{
    ...props, class: className, type: type === 'danger' ? 'error' : type,
    role: type === 'danger' || type === 'warning' ? 'alert' : 'status', closable: closeIcon !== null && Boolean(onClose),
    onOnClose: onClose,
  }} slots={{ desc: title ? description : undefined }}>
    {title ?? description ?? children}
  </HaloHost>;
}

export function XaEmpty({ description, children }) {
  return <div className="xa24-empty"><p>{description}</p>{children}</div>;
}

export function XaSpin({ size }) {
  return <HaloHost as="span" component={ESpin} vueProps={{ size, 'aria-hidden': true }}/>;
}

export function XaPopover({ children, content, open, onChange, placement = 'bottom-end' }) {
  return <HaloHost as="span" className="xa24-popover-host" component={EDropdown}
    vueProps={{ trigger: 'click', placement, transfer: false, visible: open, onOnVisibleChange: onChange }}
    slots={{ list: content }} onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return;
      event.stopPropagation();
      onChange(false);
      event.currentTarget.querySelector('button')?.focus();
    }}>{children}</HaloHost>;
}

export function XaCopyId({ label = 'ID', value, copyAtStart, ellipsis, displayValue = value, onError }) {
  const t = useChannelText();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!value) return '—';
  const control = <XaButton size="small" theme="borderless" aria-label={t('复制 {field}').replace('{field}', t(label))}
    icon={copied ? <Check size={14} aria-hidden="true"/> : <Copy size={14} aria-hidden="true"/>} onClick={async () => {
      try {
        await navigator.clipboard.writeText(value);
        setError(false);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      } catch {
        setCopied(false);
        setError(true);
        onError?.();
      }
    }}/>;
  return <span className="xa24-copy">{copyAtStart && control}
    <XaText ellipsis={ellipsis} title={ellipsis ? value : undefined}>{displayValue}</XaText>{!copyAtStart && control}
    <span className="sr-only" role="status">{copied ? t('{field} 已复制').replace('{field}', t(label))
      : error ? t('复制失败，请选择文本复制') : ''}</span>
  </span>;
}

export function XaPagination({ total, currentPage, pageSize, pageSizeOpts, onPageChange, onPageSizeChange }) {
  const t = useChannelText();
  const [draft, setDraft] = useState(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="xa24-pagination" role="group" aria-label={t('分页')}>
    <span>{t('共 {count} 条').replace('{count}', total)}</span>
    <XaSpace wrap>
      <XaButton size="small" theme="borderless" aria-label={t('上一页')} icon={<ChevronLeft size={16} aria-hidden="true"/>}
        disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}/>
      {pages > 1 && <XaInput className="xa24-page-number" size="small" type="number" aria-label={t('跳转页码')}
        value={draft ?? currentPage} onChange={setDraft} onBlur={() => setDraft(null)} onKeyDown={event => {
          if (event.key !== 'Enter') return;
          const page = Number(event.target.value);
          event.preventDefault();
          setDraft(null);
          if (Number.isInteger(page) && page >= 1 && page <= pages) onPageChange(page);
        }}/>}
      <span aria-live="polite">{pages > 1 ? '/ ' + pages : '1 / 1'}</span>
      <XaButton size="small" theme="borderless" aria-label={t('下一页')} icon={<ChevronRight size={16} aria-hidden="true"/>}
        disabled={currentPage === pages} onClick={() => onPageChange(currentPage + 1)}/>
      <XaSelect size="small" aria-label={t('每页条数')} value={pageSize} onChange={onPageSizeChange}
        optionList={pageSizeOpts.map(value => ({ value, label: t('{count} 条 / 页').replace('{count}', value) }))}/>
    </XaSpace>
  </div>;
}

// HaloE uses one limit for the tag display and the number of selectable options.
const WorkbenchOption = {
  ...EOption,
  props: { ...EOption.props, matchesQuery: Function },
  computed: {
    ...EOption.computed,
    isShow() {
      // Some callers supply a predicate over IDs or aliases.
      return this.matchesQuery ? this.matchesQuery(this.SelectInstance.query) : EOption.computed.isShow.call(this);
    },
  },
  methods: {
    ...EOption.methods,
    select() {
      if (this.itemDisabled) return;
      this.SelectInstance.handleOnSelectSelected({ value: this.value, label: this.optionLabel, tag: this.tag });
    },
  },
};

const { SelectHead } = ESelect.components;
const LimitedSelectHead = {
  ...SelectHead,
  mounted() { this.describeOverflow(); },
  updated() { this.describeOverflow(); },
  methods: {
    ...SelectHead.methods,
    describeOverflow() {
      const overflow = this.$el.querySelector('.haloe-select-max-tag');
      if (!overflow) return;
      const labels = this.values.slice(this.limited).map(option => option.tag ?? option.label).join('、');
      overflow.setAttribute('aria-label', labels);
      if (this.SelectInstance.$attrs['data-xa24-overflow-labels']) overflow.title = labels;
    },
    handleInputDelete(event) {
      if (!event.isComposing && !event.target.value && !this.query && this.multiple && this.values.length) {
        this.removeTag(this.values.at(-1));
      }
    },
  },
};
const LimitedSelect = { ...ESelect, components: { ...ESelect.components, SelectHead: LimitedSelectHead } };

export function XaSelect(allProps) {
  const { value, defaultValue, onChange, optionList = [], children, className, size, filter, showClear, onSearch,
    onSelect, onClear, onDropdownVisibleChange, emptyContent, maxTagCount, ref, renderItem,
    innerBottomSlot, outerBottomSlot, prefix, remote, inputProps, showRestTagsPopover, ...props } = allProps;
  const controlled = Object.hasOwn(allProps, 'value');
  const limit = props.multiple && Number.isInteger(maxTagCount) && maxTagCount >= 0 ? maxTagCount : undefined;
  const [draft, setDraft] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const selected = controlled ? value ?? '' : draft;
  const fromChildren = nodes => Children.toArray(nodes).filter(isValidElement).map(child => child.type === XaSelect.OptGroup
    ? { label: child.props.label, children: fromChildren(child.props.children) }
    : { ...child.props, label: child.props.label ?? child.props.children });
  const groups = children ? fromChildren(children) : optionList;
  const options = groups.flatMap(item => Array.isArray(item.children) ? item.children : item);
  const emptyLabel = !props.multiple && selected === '' ? options.find(item => item.value === '')?.label : undefined;
  const placeholder = typeof emptyLabel === 'string' ? emptyLabel : props.placeholder;
  const labels = new Map(options.map(item => [item.value, renderItem?.(item) ?? item.label]));
  const footer = innerBottomSlot || outerBottomSlot ? <>{innerBottomSlot}{outerBottomSlot}</> : null;
  const host = useRef(null);
  const select = useRef(null);
  const listId = useId();
  useLayoutEffect(() => {
    const search = host.current?.querySelector('.haloe-select-selection input[type="text"]');
    if (search && inputProps) for (const [name, label] of Object.entries(inputProps)) {
      if (name.startsWith('aria-') && label != null) search.setAttribute(name, label);
    }
    const list = host.current?.querySelector('.haloe-select-dropdown-list');
    if (!list) return;
    list.id = listId;
    list.setAttribute('role', 'listbox');
    if (props.multiple) list.setAttribute('aria-multiselectable', 'true');
    else list.removeAttribute('aria-multiselectable');
  });
  useLayoutEffect(() => {
    const control = host.current?.querySelector('[tabindex], input');
    if (typeof ref === 'function') {
      const cleanup = ref(control);
      return typeof cleanup === 'function' ? cleanup : () => ref(null);
    }
    if (ref) {
      ref.current = control;
      return () => { ref.current = null; };
    }
  }, [ref]);
  return <HaloHost as="span" className="xa24-select-host" hostRef={host}
    renderVue={target => h(limit === undefined ? ESelect : LimitedSelect, {
      ref: instance => { select.current = instance; },
      ...props, class: [className, limit !== undefined && 'xa24-select-tag-limit'],
      size: controlSize(size), modelValue: selected, placeholder, transfer: false,
      role: 'combobox', 'aria-expanded': open, 'aria-haspopup': 'listbox', 'aria-controls': listId,
      'data-xa24-overflow-labels': showRestTagsPopover || undefined,
      onOnOpenChange: next => {
        setOpen(next);
        onDropdownVisibleChange?.(next);
      },
      filterable: Boolean(filter || onSearch), clearable: showClear,
      limited: limit, maxTagPlaceholder: count => '+' + count,
      onOnQueryChange: onSearch,
      onOnSelect: option => {
        onSelect?.(option.value, option);
        if (remote && value === null) void nextTick(() => select.current?.reset());
      },
      onOnClear: onClear,
      'onUpdate:modelValue': next => {
        if (!controlled) setDraft(next);
        onChange?.(next);
      },
    }, {
      cutomeNoData: emptyContent ? () => target('no-data') : undefined,
      footer: footer ? () => target('footer', 'div') : undefined,
      prefix: prefix ? () => target('prefix') : undefined,
      default: () => {
        const render = item => {
          if (Array.isArray(item.children)) {
            return h(EOptionGroup, { key: item.label, label: item.label }, { default: () => item.children.map(render) });
          }
          const label = labels.get(item.value);
          const text = typeof label === 'string' || typeof label === 'number';
          const matchesQuery = remote ? () => true : typeof filter === 'function' ? query => !query || filter(query, item) : undefined;
          return h(matchesQuery || limit !== undefined ? WorkbenchOption : EOption, {
            key: item.value, value: item.value, disabled: item.disabled, matchesQuery,
            label: typeof item.label === 'string' || typeof item.label === 'number' ? String(item.label) : String(item.value),
            role: 'option', 'aria-selected': Array.isArray(selected) ? selected.includes(item.value) : selected === item.value },
          text ? undefined : { default: () => target(item.value) });
        };
        return groups.map(render);
      },
    })}
    portals={new Map([['no-data', emptyContent], ['footer', footer], ['prefix', prefix], ...labels])}/>;
}
XaSelect.Option = () => null;
XaSelect.OptGroup = () => null;

export function XaChoice({ label, options, translateOptions, ...props }) {
  const t = useChannelText();
  return <XaSelect aria-label={t(label)} optionList={options.map(([value, text]) => ({
    value, label: translateOptions ? t(text) : text,
  }))} {...props}/>;
}

export function XaField({ label, required, hint, error, help, children }) {
  const t = useChannelText();
  const id = useId();
  const labelId = id + '-label';
  const name = typeof label === 'string' ? label.replace(/ \*$/, '') : label;
  const isRequired = required || name !== label;
  const textControl = Children.toArray(children).find(child => isValidElement(child) && [XaInput, XaTextArea].includes(child.type));
  const inputId = textControl?.props.id ?? (textControl ? id : undefined);
  const describedBy = [hint && id + '-hint', error && id + '-error'].filter(Boolean).join(' ') || undefined;
  const contents = Children.map(children, child => {
    if (!isValidElement(child)) return child;
    const input = [XaInput, XaTextArea].includes(child.type);
    if (!input && ![XaChoice, XaSelect].includes(child.type)) return child;
    return cloneElement(child, {
      ...(input && { id: child.props.id ?? inputId }),
      'aria-labelledby': child.props['aria-labelledby'] ?? labelId,
      'aria-describedby': [child.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
      'aria-required': isRequired || undefined,
      'aria-invalid': error ? true : undefined,
    });
  });
  return <div className="xa24-form-field">
    <div className="xa24-field-label"><label id={labelId} htmlFor={inputId}>{t(name)}{isRequired && <span aria-hidden="true"> *</span>}</label>
      {help && <XaHelp label={t('{field}说明').replace('{field}', t(name))}>{help}</XaHelp>}
    </div>
    {contents}
    {hint && <p id={id + '-hint'} className="xa24-help">{t(hint)}</p>}
    {error && <p id={id + '-error'} role="alert" className="xa24-text-danger">{error}</p>}
  </div>;
}

export function XaCheckbox({
  children, checked, defaultChecked, onChange, indeterminate, id,
  'aria-label': label, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, ...props
}) {
  const host = useRef(null);
  const [draft, setDraft] = useState(Boolean(defaultChecked));
  useLayoutEffect(() => {
    const input = host.current?.querySelector('input[type="checkbox"]');
    if (!input) return;
    input.indeterminate = Boolean(indeterminate);
    for (const [name, value] of Object.entries({ id, 'aria-label': label, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy })) {
      if (value == null) input.removeAttribute(name);
      else input.setAttribute(name, value);
    }
  }, [id, label, labelledBy, describedBy, indeterminate, checked, draft]);
  return <HaloHost as="span" hostRef={host} component={ECheckbox} vueProps={{
    ...props, indeterminate, modelValue: checked ?? draft, onOnChange: (value, event) => {
      if (checked == null) setDraft(value);
      onChange?.(event);
    },
  }}>{children}</HaloHost>;
}

export function XaTabs({
  children, tabList, activeKey, defaultActiveKey, onChange, className, size, type, keepDOM, tabBarExtraContent, style, ...props
}) {
  const host = useRef(null);
  const tabs = useRef(null);
  const tabsId = useId();
  const items = tabList ?? Children.toArray(children).filter(isValidElement).map(child => child.props);
  const [draft, setDraft] = useState(defaultActiveKey ?? items[0]?.itemKey);
  const selected = activeKey ?? draft;
  const select = next => {
    if (next === selected) return;
    if (activeKey == null) setDraft(next);
    onChange?.(next);
  };
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const tabList = () => root.querySelector('.haloe-tabs-nav-container');
    const tabButtons = () => [...(tabList()?.querySelectorAll('.haloe-tabs-tab') ?? [])];
    const labelTabs = () => {
      const list = tabList();
      if (!list) return;
      const buttons = tabButtons();
      const focused = buttons.includes(document.activeElement) && document.activeElement;
      list.setAttribute('role', 'tablist');
      list.tabIndex = -1;
      if (props['aria-label']) list.setAttribute('aria-label', props['aria-label']);
      buttons.forEach((element, index) => {
        const item = items[index];
        if (!item) return;
        element.id = tabsId + '-tab-' + index;
        element.setAttribute('role', 'tab');
        element.setAttribute('aria-selected', String(item.itemKey === selected));
        element.setAttribute('aria-disabled', String(Boolean(item.disabled)));
        element.setAttribute('aria-controls', tabsId + '-pane-' + index);
        element.tabIndex = !item.disabled && (focused ? focused === element : item.itemKey === selected) ? 0 : -1;
      });
    };
    labelTabs();
    const observer = new MutationObserver(labelTabs);
    observer.observe(root, { childList: true, subtree: true });
    // HaloE ignores additional clicks for 300ms. Let React accept each deliberate click immediately.
    const targetTab = event => {
      const tab = event.target.closest('.haloe-tabs-tab');
      return tab?.closest('.xa24-tabs') === root ? tab : null;
    };
    const itemFor = tab => items[tabButtons().indexOf(tab)];
    const clickTab = event => {
      const item = itemFor(targetTab(event));
      if (!item) return;
      event.stopPropagation();
      if (!item.disabled) select(item.itemKey);
    };
    const keyTab = event => {
      const tab = targetTab(event);
      if (!tab) return;
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === ' ') {
        const item = itemFor(tab);
        if (item && !item.disabled) select(item.itemKey);
        return;
      }
      const candidates = tabButtons().filter(button => button.getAttribute('aria-disabled') !== 'true');
      const index = candidates.indexOf(tab);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? candidates.length - 1
        : (index + candidates.length + (event.key === 'ArrowRight' ? 1 : -1)) % candidates.length;
      candidates.forEach((button, position) => { button.tabIndex = position === nextIndex ? 0 : -1; });
      candidates[nextIndex]?.focus();
    };
    root.addEventListener('click', clickTab, true);
    root.addEventListener('keydown', keyTab, true);
    return () => {
      observer.disconnect();
      root.removeEventListener('click', clickTab, true);
      root.removeEventListener('keydown', keyTab, true);
    };
  }, [items, props, selected, tabsId]);
  return <HaloHost hostRef={host} style={style} className={['xa24-tabs', className].filter(Boolean).join(' ')}
    renderVue={target => h(ETabs, {
      ref: instance => { tabs.current = instance; },
      type: type === 'button' ? 'card' : 'line', size: controlSize(size), animated: false, modelValue: selected,
      'onUpdate:modelValue': next => {
        // HaloE selects before emitting. Keep the current pane until its React owner accepts the change.
        if (activeKey != null && tabs.current) tabs.current.activeKey = activeKey;
        select(next);
      },
    }, { extra: tabBarExtraContent ? () => target('extra', 'div') : undefined, default: () => items.map((item, index) => {
      const text = typeof item.tab === 'string' || typeof item.tab === 'number';
      return h(ETabPane, { key: item.itemKey, name: item.itemKey, index, disabled: item.disabled,
        label: text ? String(item.tab) : () => target('label-' + item.itemKey),
        role: 'tabpanel', id: tabsId + '-pane-' + index, 'aria-labelledby': tabsId + '-tab-' + index },
      { default: () => (keepDOM || item.itemKey === selected) && item.children ? target(item.itemKey, 'div') : [] });
    }) })}
    portals={new Map([['extra', tabBarExtraContent], ...items.flatMap(item =>
      [[item.itemKey, item.children], ['label-' + item.itemKey, item.tab]])])}/>;
}
XaTabs.TabPane = () => null;

function dialogControls(dialog) {
  return [...dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter(element =>
    element.tabIndex >= 0 && !element.matches(':disabled, [aria-disabled="true"]') && element.getClientRects().length);
}

export function XaModal({
  children, title, visible, footer, width, closable = true, closeOnEsc = true, onCancel, onOk,
  okText = '确定', cancelText = '取消', okButtonProps, cancelButtonProps, confirmLoading, bodyStyle, className,
  drawer = false, placement, size, mask = true, maskClosable = false, label, centered,
}) {
  const titleId = useId();
  const host = useRef(null);
  const options = useRef(null);
  options.current = { closeOnEsc, mask, onCancel };
  const selector = drawer ? '.haloe-drawer' : '.haloe-modal';
  useLayoutEffect(() => {
    if (!visible) return;
    const dialog = host.current?.querySelector(selector);
    if (!dialog) return;
    dialog.setAttribute('role', 'dialog');
    if (mask) dialog.setAttribute('aria-modal', 'true');
    else dialog.removeAttribute('aria-modal');
    if (label) dialog.setAttribute('aria-label', label);
    else dialog.removeAttribute('aria-label');
    if (!label && title != null) dialog.setAttribute('aria-labelledby', titleId);
    else dialog.removeAttribute('aria-labelledby');
    dialog.tabIndex = -1;
  }, [visible, selector, titleId, mask, label, title]);
  useLayoutEffect(() => {
    if (!visible) return;
    const dialog = host.current?.querySelector(selector);
    if (!dialog) return;
    const opener = document.activeElement;
    const frame = requestAnimationFrame(() => {
      if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    });
    const handleKey = event => {
      if (event.defaultPrevented) return;
      const { closeOnEsc, mask, onCancel } = options.current;
      if (event.key === 'Escape' && closeOnEsc) {
        event.preventDefault();
        event.stopPropagation();
        onCancel?.(event);
      }
      if (!mask || event.key !== 'Tab') return;
      const controls = dialogControls(dialog);
      const edge = event.shiftKey ? controls[0] : controls.at(-1);
      if (event.target !== dialog && event.target !== edge && controls.length) return;
      event.preventDefault();
      ((event.shiftKey ? controls.at(-1) : controls[0]) ?? dialog).focus();
    };
    dialog.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener('keydown', handleKey);
      requestAnimationFrame(() => {
        if (opener?.isConnected && (document.activeElement === document.body || dialog.contains(document.activeElement))) {
          opener.focus({ preventScroll: true });
        }
      });
    };
  }, [visible, selector]);
  const actions = footer === undefined ? <>
    <XaButton onClick={onCancel} {...cancelButtonProps}>{cancelText}</XaButton>
    <XaButton theme="solid" loading={confirmLoading} onClick={onOk} {...okButtonProps}>{okText}</XaButton>
  </> : footer;
  const fallback = { small: 400, medium: 540, large: 720, full: 960 }[size] ?? 448;
  const modalWidth = typeof width === 'number' ? width + 'px' : width ?? `min(${fallback}px, calc(100vw - 32px))`;
  const drawerWidth = typeof width === 'number' ? width : Number(width?.match(/^min\((\d+)px/)?.[1]) || width;
  return <HaloHost hostRef={host} component={drawer ? EDrawer : EModal} onClick={event => {
    if (mask && maskClosable && event.target.matches?.('.haloe-modal-mask, .haloe-modal-wrap, .haloe-drawer-mask, .haloe-drawer-wrap')) {
      onCancel?.(event);
    }
  }} vueProps={{
    modelValue: visible, transfer: false, mask, maskClosable: false, closable: false,
    className: [className, centered && 'xa24-modal-centered'].filter(Boolean).join(' '),
    ...(drawer ? { placement, width: drawerWidth } : { footerHide: footer === null, styles: { width: modalWidth } }),
  }} slots={{
    header: <div className="xa24-modal-heading"><h2 id={titleId} className={drawer ? 'haloe-drawer-header-inner' : 'haloe-modal-header-inner'}>{title}</h2>
      {closable && <XaButton theme="borderless" aria-label="关闭弹窗" icon={<X size={16} aria-hidden="true"/>} onClick={onCancel}/>}
    </div>,
    footer: drawer ? undefined : actions,
  }}>
    {bodyStyle ? <div style={bodyStyle}>{children}</div> : children}
    {drawer && actions && <footer className="xa24-drawer-footer">{actions}</footer>}
  </HaloHost>;
}

export function XaOperationDialog({ title, description, children, onClose, wide, drawer, drawerSide, footer, className }) {
  const t = useChannelText();
  return <XaModal visible title={t(title)} drawer={drawer} placement={drawerSide} onCancel={onClose} footer={footer ?? null}
    width={drawer ? `min(${wide ? 1000 : 720}px, 100vw)` : `min(${wide ? 960 : 448}px, calc(100vw - 32px))`} className={className}>
    {description && <p className="xa24-help">{description}</p>}{children}
  </XaModal>;
}

export function XaHelp({ label, children }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <span className="xa24-help-anchor" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}
    onBlur={() => setVisible(false)} onKeyDown={event => {
      if (event.key === 'Escape' && visible) {
        event.stopPropagation();
        setVisible(false);
      }
    }}>
    <XaButton theme="borderless" size="small" aria-label={label} aria-describedby={visible ? id : undefined}
      onFocus={() => setVisible(true)} onClick={() => setVisible(true)} icon={<CircleHelp size={16} aria-hidden="true"/>}/>
    {visible && <span id={id} role="tooltip" className="xa24-help-bubble">{children}</span>}
  </span>;
}
