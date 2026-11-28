import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EDatePicker } from '@cmss-bfs/haloe/dist/es/index.js';
import { CalendarDays, X } from 'lucide-react';
import HaloHost from './HaloHost.jsx';
import { XaButton, XaInput, XaModal } from './HaloComponents.jsx';
import { useChannelText } from '../channel-language.js';

const isDate = value => value instanceof Date && Number.isFinite(value.getTime());
const pad = value => String(value).padStart(2, '0');
const nativeDay = date => isDate(date)
  ? [String(date.getFullYear()).padStart(4, '0'), pad(date.getMonth() + 1), pad(date.getDate())].join('-') : '';

function calendarValue(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(day + 'T12:00:00');
  return nativeDay(date) === day ? date : null;
}

function dayValue(value) {
  if (isDate(value)) return nativeDay(value);
  return calendarValue(value) ? value : '';
}

export function clockParts(value, timeZone) {
  if (!isDate(value)) return { day: '', time: '' };
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    calendar: 'gregory', numberingSystem: 'latn', timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(value).map(({ type, value: part }) => [type, part]));
  return { day: [fields.year.padStart(4, '0'), fields.month, fields.day].join('-'),
    time: [fields.hour, fields.minute, fields.second].join(':') };
}

export function dateFromClock(day, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return null;
  const calendarDay = new Date(day + 'T12:00:00Z');
  if (!isDate(calendarDay) || calendarDay.toISOString().slice(0, 10) !== day) return null;
  const hhmmss = time.length === 5 ? time + ':00' : time;
  const wall = day + 'T' + hhmmss;
  if (!timeZone) {
    const local = new Date(wall);
    const parts = clockParts(local);
    return parts.day === day && parts.time === hhmmss ? local : null;
  }
  // Use UTC arithmetic while finding the offset for the selected wall clock.
  const desired = Date.parse(wall + 'Z');
  let epoch = desired;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = clockParts(new Date(epoch), timeZone);
    if (parts.day === day && parts.time === hhmmss) return new Date(epoch);
    epoch += desired - Date.parse(parts.day + 'T' + parts.time + 'Z');
  }
  return null;
}

function deliverChange(onChange, dateFirst, dates, strings) {
  if (dateFirst) onChange?.(dates, strings);
  else onChange?.(strings, dates);
}

function applyFieldAttributes(input, props) {
  if (!input) return;
  for (const [name, value] of Object.entries(props)) {
    if (!name.startsWith('aria-')) continue;
    if (value == null) input.removeAttribute(name);
    else input.setAttribute(name, String(value));
  }
  input.toggleAttribute('required', Boolean(props.required));
}

function CalendarField({
  value, defaultValue, onChange, isRange, id, name, className, style, disabled, disabledDate, inputReadOnly,
  showClear, onClear, separator, placeholder, dropdownClassName, size, needConfirm, format = 'yyyy-MM-dd',
  onChangeWithDateFirst = true, ...props
}) {
  const t = useChannelText();
  const generatedId = useId();
  const host = useRef(null);
  const draft = useRef();
  const [local, setLocal] = useState(defaultValue);
  const [revision, reset] = useState(0);
  const controlled = value !== undefined;
  const current = controlled ? value : local;
  const [start, end] = (Array.isArray(current) ? current : [current]).map(dayValue);
  const calendar = useMemo(() => {
    const result = isRange ? [calendarValue(start), calendarValue(end)] : calendarValue(start);
    // Reapply the accepted value when a confirmation session is canceled.
    return { value: result, revision };
  }, [start, end, isRange, revision]);
  const inputId = id ?? generatedId;
  const last = useRef('');
  const open = useRef(false);
  useLayoutEffect(() => {
    last.current = JSON.stringify(isRange ? start && end ? [start, end] : [] : start || '');
  }, [start, end, isRange]);
  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;
    const decorate = () => applyFieldAttributes(root.querySelector('input'), props);
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
  const commit = next => {
    const strings = isRange ? (Array.isArray(next) ? next : []).map(dayValue).filter(Boolean) : dayValue(next);
    if (isRange && strings.length === 1) return;
    const signature = JSON.stringify(strings);
    if (last.current === signature) return;
    last.current = signature;
    const midnight = day => day ? new Date(day + 'T00:00:00') : undefined;
    const dates = isRange ? strings.map(midnight) : midnight(strings);
    if (!controlled) setLocal(strings);
    deliverChange(onChange, onChangeWithDateFirst, dates, strings || undefined);
  };
  const control = <HaloHost as="span" className={className} style={style} hostRef={host} component={EDatePicker}
    vueProps={{
      name, elementId: inputId, modelValue: calendar.value, type: isRange ? 'daterange' : 'date',
      format, disabled, clearable: false, editable: !inputReadOnly, confirm: needConfirm, transfer: false,
      options: disabledDate && { disabledDate: day => (Array.isArray(day) ? day : [day])
        .some(candidate => isDate(candidate) && disabledDate(candidate)) },
      size: size === 'small' || size === 'large' ? size : 'default', separator,
      placeholder: Array.isArray(placeholder) ? placeholder.filter(Boolean).join(separator ?? ' — ') : placeholder,
      transferClassName: dropdownClassName,
      onOnOpenChange: next => {
        open.current = next;
        if (next) draft.current = calendar.value;
        else if (needConfirm) reset(previous => previous + 1);
      },
      onOnOk: () => { if (needConfirm) commit(draft.current); },
      'onUpdate:modelValue': next => {
        if (needConfirm) { if (open.current) draft.current = next; }
        else commit(next);
      },
    }}/>;
  if (!showClear) return control;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxInlineSize: '100%' }}>
    {control}
    {!disabled && start && (!isRange || end) && <XaButton size="small" theme="borderless" aria-label={t('清除日期')} icon={<X size={16} aria-hidden="true"/>}
      onClick={() => {
        commit(null);
        onClear?.();
        host.current?.querySelector('input')?.focus();
      }}/>}
  </span>;
}

function dateTimeDraft(value, timeZone, seconds) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    const [day, time] = value.split(/[ T]/);
    return { day, time: seconds && time.length === 5 ? time + ':00' : time.slice(0, seconds ? 8 : 5) };
  }
  const parts = clockParts(typeof value === 'string' && value ? new Date(value) : value, timeZone);
  return { day: parts.day, time: parts.time.slice(0, seconds ? 8 : 5) };
}

function DateTimeField({
  value, defaultValue, onChange, onClear, isRange, id, className, style, disabled, disabledDate, showClear,
  format = 'yyyy-MM-dd HH:mm:ss', timePickerOpts, timeZone, size, separator, placeholder, inputReadOnly,
  onChangeWithDateFirst = true, dropdownClassName, ...props
}) {
  const t = useChannelText();
  const generatedId = useId();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(defaultValue);
  const [draft, setDraft] = useState([]);
  const [typed, setTyped] = useState(null);
  const controlled = value !== undefined;
  const current = controlled ? value : local;
  const seconds = (timePickerOpts?.format ?? format).includes('ss');
  const initial = (isRange && Array.isArray(current) ? current : [current]).map(item => dateTimeDraft(item, timeZone, seconds));
  const accepted = initial.filter(part => part.day && part.time).map(part => part.day + ' ' + part.time);
  const editable = !inputReadOnly && !isRange;
  const label = t(isRange ? '选择时间范围' : '选择日期和时间');
  const fallback = Array.isArray(placeholder) ? placeholder.join(separator ?? ' — ') : placeholder;
  const openPicker = () => {
    const count = isRange ? 2 : 1;
    setDraft(Array.from({ length: count }, (_, index) => initial[index] ?? dateTimeDraft(null, timeZone, seconds)));
    setOpen(true);
  };
  const publish = (dates, strings) => {
    if (!controlled) setLocal(dates);
    deliverChange(onChange, onChangeWithDateFirst, dates, strings);
  };
  const changeText = text => {
    if (!text) {
      setTyped(null);
      if (accepted.length) publish(undefined, undefined);
      return;
    }
    const [day, time] = text.split(' ');
    const date = text === day + ' ' + time && time?.length === (seconds ? 8 : 5) && dateFromClock(day, time, timeZone);
    if (!date || disabledDate?.(date)) {
      setTyped(text);
      return;
    }
    setTyped(null);
    if (text !== accepted[0]) publish(date, text);
  };
  const dates = draft.map(({ day, time }) => dateFromClock(day, time, timeZone));
  const outOfOrder = isRange && dates.every(Boolean) && dates.length === 2 && dates[0] > dates[1];
  const valid = dates.length > 0 && !outOfOrder && dates.every(date => date && !disabledDate?.(date));
  const update = (index, patch) => setDraft(rows => rows.map((row, position) => index === position ? { ...row, ...patch } : row));
  const aria = Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('aria-')));
  return <>
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxInlineSize: '100%', ...style }}>
      {editable && <XaInput {...aria} id={id} size={size} disabled={disabled} placeholder={fallback || label}
        value={typed ?? accepted[0] ?? ''} onChange={changeText}/>}
      <XaButton {...(editable ? { 'aria-label': label } : aria)} id={editable ? undefined : id} disabled={disabled} size={size}
        icon={<CalendarDays size={16} aria-hidden="true"/>} aria-haspopup="dialog" aria-expanded={open}
        onClick={openPicker}>{!editable && (accepted.length === (isRange ? 2 : 1) ? accepted.join(separator ?? ' — ') : fallback || label)}</XaButton>
      {showClear && accepted.length > 0 && !disabled && <XaButton size="small" theme="borderless"
        aria-label={t('清除日期')} icon={<X size={16} aria-hidden="true"/>} onClick={() => {
          setTyped(null);
          publish(isRange ? [] : undefined, isRange ? [] : undefined);
          onClear?.();
        }}/>}
    </span>
    {open && <XaModal visible title={label} className={dropdownClassName}
      okButtonProps={{ disabled: !valid }} onCancel={() => setOpen(false)} onOk={() => {
        if (!valid) return;
        const strings = draft.map(part => part.day + ' ' + part.time);
        setTyped(null);
        publish(isRange ? dates : dates[0], isRange ? strings : strings[0]);
        setOpen(false);
      }}>
      <div className="admin-page-stack">
        {draft.map((part, index) => {
          const prefix = (id ?? generatedId) + '-' + index;
          const dateLabel = t(isRange ? index === 0 ? '开始日期' : '结束日期' : '日期');
          const timeLabel = t(isRange ? index === 0 ? '开始时间' : '结束时间' : '时间');
          return <div key={prefix} className="xa24-space" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="xa24-form-field">
              <label htmlFor={prefix + '-day'}>{dateLabel}</label>
              <CalendarField id={prefix + '-day'} placeholder={dateLabel}
                value={part.day} onChangeWithDateFirst={false} onChange={day => update(index, { day: day ?? '' })}
                disabledDate={date => {
                  const instant = dateFromClock(nativeDay(date), '00:00', timeZone);
                  return Boolean(instant && disabledDate?.(instant));
                }}/>
            </div>
            <div className="xa24-form-field">
              <label htmlFor={prefix + '-time'}>{timeLabel}</label>
              <input id={prefix + '-time'} type="time" step={seconds ? 1 : 60} value={part.time}
                className="haloe-input" onChange={event => update(index, { time: event.target.value })}/>
            </div>
          </div>;
        })}
        {timeZone && <span className="xa24-help">{timeZone === 'Asia/Shanghai' ? t('北京时间') : timeZone}</span>}
        {outOfOrder && <span className="xa24-text-danger" role="alert">{t('结束时间不能早于开始时间。')}</span>}
      </div>
    </XaModal>}
  </>;
}

export function XaDatePicker({ type = 'date', rangeSeparatorNode, showClear = true, ...props }) {
  const isRange = type === 'dateRange' || type === 'dateTimeRange';
  const Component = type === 'dateTime' || type === 'dateTimeRange' ? DateTimeField : CalendarField;
  return <Component {...props} isRange={isRange} showClear={showClear}
    separator={typeof rangeSeparatorNode === 'string' ? rangeSeparatorNode : undefined}/>;
}
