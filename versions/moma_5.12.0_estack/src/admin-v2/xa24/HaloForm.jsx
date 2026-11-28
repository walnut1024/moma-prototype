import { createContext, useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { XaField, XaInput, XaSelect, XaTextArea } from './HaloComponents.jsx';
import { XaAutoComplete, XaInputNumber, XaSwitch } from './HaloInputs.jsx';

const FormContext = createContext(null);

const pathParts = name => String(name).match(/[^.[\]]+/g) ?? [];
const valueAt = (values, name) => pathParts(name).reduce((node, key) => node?.[key], values);

function withValue(row, path, value) {
  if (!path.length) return value;
  const [key, ...remaining] = path;
  const result = Array.isArray(row) ? [...row] : row != null ? { ...row }
    : /^\d+$/.test(key) ? [] : {};
  result[key] = withValue(row?.[key], remaining, value);
  return result;
}

function looksEmpty(value) {
  return value == null || typeof value === 'string' && !value.trim() || Array.isArray(value) && !value.length;
}

async function errorFor(rules, value) {
  for (const rule of rules) {
    const fallback = rule.message ?? '请核对此字段';
    if (rule.required && looksEmpty(value)) return fallback;
    if (looksEmpty(value)) continue;
    if (rule.pattern && !rule.pattern.test(value)) return fallback;
    if (rule.validator) {
      try {
        const result = await rule.validator(rule, value);
        if (typeof result === 'string') return result;
        if (result === false || result instanceof Error) return result?.message || fallback;
      } catch (error) { return error.message || fallback; }
    }
  }
  return undefined;
}

export function Form({ children, disabled, initValues = {}, onSubmit, onSubmitFail, onValueChange, className, ...props }) {
  const [values, setValues] = useState(initValues);
  const [errors, setErrors] = useState({});
  const source = useRef(values);
  const rules = useRef(new Map());
  const running = useRef(false);
  const setValue = (name, value) => {
    const next = withValue(source.current, pathParts(name), value);
    source.current = next;
    setValues(next);
    setErrors(previous => valueAt(previous, name) ? withValue(previous, pathParts(name), undefined) : previous);
    onValueChange?.(next, { [name]: value });
  };
  const context = {
    values, errors, disabled, rules: rules.current, setValue,
    getValue: name => valueAt(source.current, name),
  };
  return <FormContext.Provider value={context}><form {...props}
    className={['xa24-form', className].filter(Boolean).join(' ')} noValidate onSubmit={async event => {
      event.preventDefault();
      if (disabled || running.current) return;
      running.current = true;
      try {
        const current = source.current;
        const failures = (await Promise.all([...rules.current].map(async ([name, definition]) =>
          [name, await errorFor(definition.current, valueAt(current, name))]))).filter(([, error]) => error);
        const invalid = failures.reduce((result, [name, error]) => withValue(result, pathParts(name), error), {});
        setErrors(invalid);
        if (failures.length) onSubmitFail?.(invalid, current, event);
        else await onSubmit?.(current, event);
      } finally { running.current = false; }
    }}>{children}</form></FormContext.Provider>;
}

export function useFormApi() {
  const { getValue, setValue } = useContext(FormContext);
  return { getValue, setValue };
}
export function useFormState() {
  const { values, errors } = useContext(FormContext);
  return { values, errors };
}
export function useFieldState(name) {
  const { values, errors } = useContext(FormContext);
  return { value: valueAt(values, name), error: valueAt(errors, name) };
}

function fieldFor(Control, checked = false) {
  return function BoundField({ field, label, rules = [], extraText, disabled, onChange, ...props }) {
    const context = useContext(FormContext);
    const definition = useRef(rules);
    definition.current = rules;
    const id = useId();
    useLayoutEffect(() => {
      context.rules.set(field, definition);
      return () => {
        if (context.rules.get(field) === definition) context.rules.delete(field);
      };
    }, [context.rules, field]);
    const value = valueAt(context.values, field);
    const change = (next, ...args) => {
      context.setValue(field, next);
      onChange?.(next, ...args);
    };
    return <XaField label={label} required={rules.some(item => item.required)} hint={extraText} error={valueAt(context.errors, field)}>
      <Control {...props} id={id} aria-label={props['aria-label'] ?? (typeof label === 'string' ? label : undefined)} disabled={context.disabled || disabled}
        {...(checked ? { checked: Boolean(value) } : { value })} onChange={change}/>
    </XaField>;
  };
}

Form.Input = fieldFor(XaInput);
Form.TextArea = fieldFor(XaTextArea);
Form.InputNumber = fieldFor(XaInputNumber);
Form.AutoComplete = fieldFor(XaAutoComplete);
Form.Select = fieldFor(XaSelect);
Form.Switch = fieldFor(XaSwitch, true);
Form.Label = props => <label {...props}/>;
Form.Slot = function Slot({ label, error, className, children }) {
  const { id, name, text, required } = typeof label === 'object' && label !== null ? label : { text: label };
  return <div className={['xa24-form-field', className].filter(Boolean).join(' ')}>
    {text != null && <label id={id} htmlFor={name}>{text}{required && <span aria-hidden="true"> *</span>}</label>}
    {children}
    {error != null && <div className="xa24-text-danger">{error}</div>}
  </div>;
};

export function ArrayField({ field, children }) {
  const { value } = useFieldState(field);
  const { setValue, getValue } = useFormApi();
  const ids = useRef([]);
  const array = value ?? [];
  while (ids.current.length < array.length) ids.current.push(crypto.randomUUID());
  return children({
    arrayFields: array.map((_, index) => ({
      key: ids.current[index], field: field + '[' + index + ']',
      remove: () => {
        ids.current.splice(index, 1);
        setValue(field, (getValue(field) ?? []).filter((__, position) => position !== index));
      },
    })),
    addWithInitValue: initial => setValue(field, [...(getValue(field) ?? []), initial]),
  });
}
