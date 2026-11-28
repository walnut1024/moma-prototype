import { Children, isValidElement, useId, useLayoutEffect, useRef, useState } from 'react';
import { h } from 'vue';
import { EAutoComplete, EInputNumber, ERadio, ERadioGroup, ESwitch, ETimePicker } from '@cmss-bfs/haloe/dist/es/index.js';
import HaloHost from './HaloHost.jsx';

const controlSize = size => size === 'small' || size === 'large' ? size : 'default';

function setInputAttribute(input, name, value) {
  if (value == null) input.removeAttribute(name);
  else input.setAttribute(name, String(value));
}

function useInnerInput(host, forwardedRef, props, { onKeyDown, onEnterPress, configure } = {}) {
  useLayoutEffect(() => {
    const input = host.current?.querySelector('input');
    if (!input) return;
    for (const [name, value] of Object.entries(props)) {
      if (name.startsWith('aria-') || name === 'role') setInputAttribute(input, name, value);
    }
    input.toggleAttribute('required', Boolean(props.required));
    configure?.(input);
    const handleKeyDown = event => {
      onKeyDown?.(event);
      if (!event.isComposing && event.key === 'Enter') onEnterPress?.(event);
    };
    input.addEventListener('keydown', handleKeyDown);
    return () => input.removeEventListener('keydown', handleKeyDown);
  });
  useLayoutEffect(() => {
    const input = host.current?.querySelector('input');
    if (typeof forwardedRef === 'function') {
      const cleanup = forwardedRef(input);
      return typeof cleanup === 'function' ? cleanup : () => forwardedRef(null);
    }
    if (forwardedRef) {
      forwardedRef.current = input;
      return () => { forwardedRef.current = null; };
    }
  }, [host, forwardedRef]);
}

const numericValue = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export function XaInputNumber({
  value, defaultValue, onChange, onFocus, onBlur, onKeyDown, onEnterPress, id, name, ref,
  min, max, step, precision, formatter, parser, size, hideButtons, autoFocus, readOnly, disabled,
  placeholder, prefix, suffix, className, style, ...props
}) {
  const host = useRef(null);
  const generatedId = useId();
  const mounted = useRef(false);
  const [draft, setDraft] = useState(() => numericValue(defaultValue));
  const current = value === undefined ? draft : numericValue(value);
  useInnerInput(host, ref, props, {
    onKeyDown,
    onEnterPress,
    configure(input) {
      input.setAttribute('role', 'spinbutton');
      input.setAttribute('inputmode', step >= 1 && precision === 0 ? 'numeric' : 'decimal');
      setInputAttribute(input, 'aria-valuemin', min);
      setInputAttribute(input, 'aria-valuemax', max);
      setInputAttribute(input, 'aria-valuenow', current);
      const buttons = host.current.querySelector('.haloe-input-number-handler-wrap');
      if (buttons) buttons.style.display = hideButtons ? 'none' : '';
    },
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const change = next => {
    if (!mounted.current) return;
    if (value === undefined) setDraft(next);
    onChange?.(next ?? '');
  };
  const control = <HaloHost as="span" hostRef={host} className={prefix || suffix ? undefined : className}
    style={prefix || suffix ? undefined : style} component={EInputNumber} vueProps={{
      name, min, max, step, precision, formatter, parser, placeholder, disabled, autofocus: autoFocus,
      readonly: readOnly, elementId: id ?? generatedId, size: controlSize(size), modelValue: current,
      onOnFocus: onFocus, onOnBlur: onBlur, 'onUpdate:modelValue': change,
    }}/>;
  return prefix || suffix
    ? <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>{prefix}{control}{suffix}</span>
    : control;
}

export function XaSwitch({
  checked, defaultChecked = false, disabled, loading, size, onChange, checkedText, uncheckedText, className, ...props
}) {
  const control = useRef(null);
  const [draft, setDraft] = useState(defaultChecked);
  const current = Boolean(checked ?? draft);
  const change = next => {
    if (checked === undefined) setDraft(next);
    // HaloE changes its internal value before emitting. A controlled owner may ask for confirmation.
    else if (control.current) control.current.currentValue = current;
    onChange?.(next);
  };
  return <HaloHost as="span" component={ESwitch} slots={{ open: checkedText, close: uncheckedText }} vueProps={{
    ...props, ref: instance => { control.current = instance; }, class: className, disabled, loading,
    modelValue: current, size: size === 'small' ? 'small' : 'large',
    role: 'switch', tabindex: disabled || loading ? -1 : 0, 'aria-checked': current,
    'aria-disabled': disabled || loading || undefined, 'onUpdate:modelValue': change,
  }}/>;
}

const radioChange = value => ({ target: { value, checked: true } });

export function XaRadioGroup({
  children, options, value, defaultValue, onChange, disabled, type, direction, size, name, className, ...props
}) {
  const generatedName = useId();
  const [draft, setDraft] = useState(defaultValue);
  const items = options
    ? options.map(option => typeof option === 'object' ? option : { value: option, label: option })
    : Children.toArray(children).filter(isValidElement).map(child => ({ ...child.props, label: child.props.children }));
  const portals = new Map(items.map(item => [item.value, item.label]));
  return <HaloHost style={{ minInlineSize: 0 }} renderVue={target => h(ERadioGroup, {
    ...props, role: 'radiogroup', 'aria-disabled': disabled || undefined, name: name ?? generatedName, class: className,
    type: type === 'button' ? 'button' : undefined, vertical: direction === 'vertical', size: controlSize(size),
    modelValue: value ?? draft,
    'onUpdate:modelValue': next => {
      if (value === undefined) setDraft(next);
      onChange?.(radioChange(next));
    },
  }, () => items.map(item => h(ERadio, {
    key: item.value, label: item.value, disabled: disabled || item.disabled, border: type === 'card',
    size: controlSize(size),
    class: [item.className, item.addonClassName],
  }, () => typeof item.label === 'string' || typeof item.label === 'number'
    ? String(item.label) : target(item.value))))} portals={portals}/>;
}

export function XaRadio({
  children, checked, defaultChecked = false, value, onChange, size, className, ...props
}) {
  const [draft, setDraft] = useState(defaultChecked);
  return <HaloHost as="span" component={ERadio} vueProps={{
    ...props, class: className, size: controlSize(size), modelValue: checked ?? draft,
    'onUpdate:modelValue': next => {
      if (checked === undefined) setDraft(next);
      onChange?.({ target: { value, checked: next } });
    },
  }}>{children}</HaloHost>;
}

export function XaAutoComplete({
  data, value, defaultValue = '', onChange, onSelect, onFocus, onBlur, onSearch, onClear, onKeyDown,
  id, name, ref, size, disabled, placeholder, showClear, className, style, ...props
}) {
  const host = useRef(null);
  const generatedId = useId();
  const [draft, setDraft] = useState(defaultValue);
  useInnerInput(host, ref, props, { onKeyDown });
  useLayoutEffect(() => {
    const root = host.current;
    const input = root?.querySelector('input');
    if (!input) return;
    const listId = (id ?? generatedId) + '-suggestions';
    const sync = () => {
      const drop = root.querySelector('.haloe-select-dropdown');
      const list = drop?.querySelector('.haloe-select-dropdown-list');
      const open = Boolean(list && drop.style.display !== 'none');
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', String(open));
      setInputAttribute(input, 'aria-controls', list ? listId : null);
      list?.setAttribute('role', 'listbox');
      if (list) list.id = listId;
      let active;
      list?.querySelectorAll('.haloe-select-item').forEach((option, index) => {
        option.id = listId + '-' + index;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(option.classList.contains('haloe-select-item-selected')));
        if (open && option.classList.contains('haloe-select-item-focus')) active = option.id;
      });
      setInputAttribute(input, 'aria-activedescendant', active);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, [generatedId, id]);
  return <HaloHost className={className} style={style} hostRef={host} component={EAutoComplete} vueProps={{
    data, name, disabled, placeholder, clearable: showClear, transfer: false, elementId: id ?? generatedId,
    modelValue: value ?? draft, size: controlSize(size),
    onOnSelect: onSelect, onOnFocus: onFocus, onOnBlur: onBlur, onOnSearch: onSearch, onOnClear: onClear,
    onOnChange: next => {
      if (value === undefined) setDraft(next);
      onChange?.(next);
    },
  }}/>;
}

export function XaTimePicker({
  value, defaultValue, format, onChange, inputReadOnly, showClear, disabled, size, placeholder,
  className, style, id, name, ref, ...props
}) {
  const host = useRef(null);
  const generatedId = useId();
  const [draft, setDraft] = useState(defaultValue ?? '');
  const current = value === undefined ? draft : value ?? '';
  useInnerInput(host, ref, props);
  return <HaloHost className={className} style={style} hostRef={host} component={ETimePicker} vueProps={{
    name, format, disabled, placeholder, size: controlSize(size), editable: !inputReadOnly,
    clearable: showClear, transfer: false, elementId: id ?? generatedId, modelValue: current,
    'onUpdate:modelValue': next => {
      const time = next ?? '';
      if (time === current) return;
      if (value === undefined) setDraft(time);
      onChange?.(time);
    },
  }}/>;
}
