import { useId, useMemo, useRef, useState } from 'react';
import { Banner, Button, Input, InputNumber, Select, Switch, Tag, TimePicker, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconClock, IconHelpCircle, IconMinus, IconPlus } from '@douyinfe/semi-icons';
import { AdminModal } from './AdminOverlay';
import { useChannelText } from './channel-language';
import {
  buildScheduleCron, canSaveScheduleCron, DEFAULT_SCHEDULE_RULE, DEPLOYMENT_SCHEDULE_TIMEZONE,
  evaluateDeploymentSchedule, MAX_SCHEDULE_DURATION, overlappingScheduleRules, previewScheduleRule,
  readDeploymentSchedule, SCHEDULE_UNITS, scheduleDurationFromTimes, scheduleRuleFields, scheduleStartConflicts,
  splitScheduleDuration, validateDeploymentSchedule,
} from './deployment-schedule';
import './deployment-scaling-schedule.css';

const { Text } = Typography;
const repeatOptions = { daily: '每天', weekly: '每周', monthly: '每月', cron: 'CRON' };
const unitOptions = { minutes: '分钟', hours: '小时', days: '天' };
const weekdays = [1, 2, 3, 4, 5, 6, 0];
const numeric = value => value === '' || value == null ? null : Number(value);
const visibleOptions = (labels, t) => Object.entries(labels).map(([value, label]) => ({ value, label: t(label) }));

function ScheduleField({ label, error, children }) {
  const id = useId();
  return <div className="deployment-schedule-field">
    <label id={id + '-label'} htmlFor={id}>{label}</label>
    {children({ id, 'aria-labelledby': id + '-label', 'aria-required': true, 'aria-invalid': Boolean(error),
      ...(error ? { 'aria-describedby': id + '-error' } : {}) })}
    {error && <Text id={id + '-error'} type="danger" size="small" role="alert">{error}</Text>}
  </div>;
}

function RuleEditor({ rule, index, onChange, onRemove, disabled, timezone, locale }) {
  const t = useChannelText();
  const [fields, setFields] = useState(() => scheduleRuleFields(rule));
  const [units, setUnits] = useState(() => splitScheduleDuration(rule.duration_seconds).units);
  const [cronBlurred, setCronBlurred] = useState(false);
  const [replicaBlurred, setReplicaBlurred] = useState(false);
  const [durationBlurred, setDurationBlurred] = useState(false);
  const { repeat, days, start, end } = fields;
  const cronMode = repeat === 'cron';
  const { start_cron: cron, duration_seconds: duration, replicas } = rule;
  const windowPreview = useMemo(() => previewScheduleRule({ start_cron: cron, duration_seconds: duration }, { timezone }), [cron, duration, timezone]);
  const formatTime = date => date.toLocaleString(locale, { timeZone: timezone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: date.getUTCSeconds() ? '2-digit' : undefined, hourCycle: 'h23' });
  const formatDay = (day, weekday) => new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day)));
  const availableDays = repeat === 'weekly'
    ? weekdays.map(value => ({ value, label: formatDay(value, 'long') }))
    : Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: String(index + 1) }));
  const crossesDay = start && end && end <= start;
  const ruleDays = repeat === 'daily' ? t('每天') : repeat === 'weekly'
    ? weekdays.filter(day => days.includes(day)).map(day => formatDay(day, 'short')).join(' / ')
    : days.map(day => String(day)).join(' / ') + ' ' + t('日');
  const invalidCron = cronBlurred && !canSaveScheduleCron(cron);
  const invalidReplicas = replicaBlurred && (!Number.isSafeInteger(replicas) || replicas < 0);
  const invalidDuration = durationBlurred && (!Number.isInteger(duration) || duration < 1 || duration > MAX_SCHEDULE_DURATION);

  const structuredChange = patch => {
    const next = { ...fields, ...patch };
    setFields(next);
    onChange({
      start_cron: buildScheduleCron(next.repeat, next.days, next.start),
      duration_seconds: scheduleDurationFromTimes(next.start, next.end),
    });
  };
  const changeRepeat = value => {
    if (value === 'cron') {
      setUnits(splitScheduleDuration(duration).units);
      setFields({ ...fields, repeat: value });
      return;
    }
    const parsed = cronMode ? scheduleRuleFields(rule) : fields;
    const sameCalendar = parsed.repeat === value || (parsed.repeat === 'cron' && fields.days.length);
    structuredChange({
      repeat: value, days: sameCalendar && parsed.days.length ? parsed.days : value === 'daily' ? [] : [1],
      start: parsed.repeat === 'cron' ? start : parsed.start,
      end: parsed.repeat === 'cron' ? end : parsed.end,
    });
  };

  return <fieldset className="deployment-schedule-rule">
    <legend className="deployment-schedule-sr">{t('规则')} {index + 1}</legend>
    <div className="deployment-schedule-fields">
      <ScheduleField label={t('窗口内副本数')} error={invalidReplicas && t('请输入非负整数')}>{props =>
        <InputNumber {...props} min={0} step={1} value={replicas ?? ''} disabled={disabled}
          onChange={value => onChange({ replicas: numeric(value) })} onBlur={() => setReplicaBlurred(true)}/>}
      </ScheduleField>
      <ScheduleField label={t('重复周期')}>{props =>
        <Select {...props} value={repeat} optionList={visibleOptions(repeatOptions, t)} disabled={disabled} onChange={changeRepeat}/>}
      </ScheduleField>
      {['weekly', 'monthly'].includes(repeat) && <ScheduleField label={t(repeat === 'weekly' ? '星期' : '日期')}>{props =>
        <Select {...props} multiple value={days} optionList={availableDays} disabled={disabled} maxTagCount={4}
          onChange={value => structuredChange({ days: value })}/>}
      </ScheduleField>}
      {cronMode ? <>
        <ScheduleField label={t('Cron 表达式')} error={invalidCron && t('无效的 Cron 表达式')}>{props =>
          <Input {...props} value={cron} placeholder="0 9 * * 1-5" disabled={disabled} spellCheck={false}
            onChange={value => { setCronBlurred(false); onChange({ start_cron: value }); }} onBlur={() => setCronBlurred(true)}/>}
        </ScheduleField>
        <div className="deployment-schedule-pair">
          <ScheduleField label={t('时长')} error={invalidDuration && t('时长须大于 0 且不超过 366 天')}>{props =>
            <InputNumber {...props} value={duration == null ? '' : duration / SCHEDULE_UNITS[units]} min={1} step={1}
              disabled={disabled} onBlur={() => setDurationBlurred(true)}
              onChange={value => onChange({ duration_seconds: numeric(value) == null ? null : Number(value) * SCHEDULE_UNITS[units] })}/>}
          </ScheduleField>
          <ScheduleField label={t('时间单位')}>{props =>
            <Select {...props} value={units} optionList={visibleOptions(unitOptions, t)} disabled={disabled} onChange={value => {
              if (duration != null) onChange({ duration_seconds: duration / SCHEDULE_UNITS[units] * SCHEDULE_UNITS[value] });
              setUnits(value);
            }}/>}
          </ScheduleField>
        </div>
      </> : <div className="deployment-schedule-pair">
        <ScheduleField label={t('开始时间')}>{props =>
          <TimePicker {...props} format="HH:mm" value={start || null} showClear={false} inputReadOnly disabled={disabled}
            onChange={value => structuredChange({ start: value || '' })}/>}
        </ScheduleField>
        <ScheduleField label={t('结束时间')}>{props =>
          <TimePicker {...props} format="HH:mm" value={end || null} showClear={false} inputReadOnly disabled={disabled}
            onChange={value => structuredChange({ end: value || '' })}/>}
        </ScheduleField>
      </div>}
      {(windowPreview || (!cronMode && start && end) || (cronMode && cron.trim() && !invalidCron)) &&
        <div className="deployment-schedule-preview">
          {!cronMode && start && end && <Text size="small" type="secondary">
            {ruleDays} · {start} → {end} {crossesDay && <Tag size="small">{t('次日结束')}</Tag>}
          </Text>}
          {windowPreview ? <Text size="small" type="secondary">
            {t(windowPreview.active ? '当前窗口' : '下一个窗口')} · {formatTime(windowPreview.start)} → {formatTime(windowPreview.end)}
          </Text> : cronMode && <Text size="small" type="secondary">{t('暂无窗口预览')}</Text>}
        </div>}
    </div>
    <Button aria-label={`${t('删除规则')} ${index + 1}`} htmlType="button" theme="borderless" type="tertiary"
      icon={<IconMinus aria-hidden="true"/>} disabled={disabled} onClick={onRemove}/>
  </fieldset>;
}

export function DeploymentScalingSchedule({ value, legacyRules, replicas, onChange, disabled, timezone = DEPLOYMENT_SCHEDULE_TIMEZONE }) {
  const t = useChannelText();
  const tz = timezone || DEPLOYMENT_SCHEDULE_TIMEZONE;
  const locale = t('每天') === '每天' ? 'zh-CN' : 'en-US';
  const id = useId();
  const schedule = useMemo(() => readDeploymentSchedule(value, legacyRules), [value, legacyRules]);
  const original = useRef(value ?? null);
  const manualReplicas = useRef(replicas);
  const serial = useRef(schedule.rules.length);
  const [ruleKeys, setRuleKeys] = useState(() => schedule.rules.map((_, index) => index));
  const [discardOpen, setDiscardOpen] = useState(false);
  const overlaps = useMemo(() => schedule.enabled ? overlappingScheduleRules(schedule.rules, { timezone: tz }) : [], [schedule.enabled, schedule.rules, tz]);
  const effective = schedule.enabled ? evaluateDeploymentSchedule(schedule, { timezone: tz }) : null;
  const conflicts = schedule.enabled ? scheduleStartConflicts(schedule.rules) : [];
  const allowDisabled = () => {
    try {
      validateDeploymentSchedule({ ...schedule, enabled: false }, { original: original.current });
      return true;
    } catch {
      return false;
    }
  };

  const changeRule = (index, patch) => onChange({ ...schedule, rules: schedule.rules.map((rule, position) => position === index ? { ...rule, ...patch } : rule) });
  const removeRule = index => {
    setRuleKeys(keys => keys.filter((_, position) => position !== index));
    onChange({ ...schedule, rules: schedule.rules.filter((_, position) => position !== index) });
  };
  const addRule = () => {
    const key = serial.current++;
    setRuleKeys(keys => [...keys, key]);
    onChange({ ...schedule, rules: [...schedule.rules, { ...DEFAULT_SCHEDULE_RULE }] });
  };
  const toggle = enabled => {
    if (enabled) {
      manualReplicas.current = replicas;
      const baseline = schedule.baseline_replicas ?? numeric(replicas) ?? 0;
      let rules = schedule.rules;
      if (!rules.length) {
        rules = [{ ...DEFAULT_SCHEDULE_RULE }];
        const key = serial.current++;
        setRuleKeys([key]);
      }
      onChange({ ...schedule, enabled: true, baseline_replicas: baseline, rules }, baseline);
    } else if (allowDisabled()) {
      onChange({ ...schedule, enabled: false, paused: false }, manualReplicas.current ?? replicas);
    } else {
      setDiscardOpen(true);
    }
  };
  const discard = () => {
    const saved = original.current;
    setRuleKeys((saved?.rules || legacyRules || []).map(() => serial.current++));
    onChange(saved ? { ...saved, enabled: false, paused: false } : null, manualReplicas.current ?? replicas);
    setDiscardOpen(false);
  };

  return <section className="deployment-schedule">
    <div className="deployment-schedule-toggle">
      <Text id={id + '-label'}>{t('启用定时伸缩')}</Text>
      <Switch size="small" aria-labelledby={id + '-label'} checked={schedule.enabled} disabled={disabled}
        aria-controls={id + '-rules'} onChange={toggle}/>
    </div>
    {!schedule.enabled && value && !allowDisabled() && <Banner type="warning" fullMode={false} closeIcon={null}
      title={t('请处理未保存的计划草稿')} description={<div className="deployment-schedule-draft-actions">
        <Button size="small" htmlType="button" disabled={disabled} onClick={() => toggle(true)}>{t('继续编辑')}</Button>
        <Button size="small" htmlType="button" disabled={disabled} onClick={() => setDiscardOpen(true)}>{t('放弃更改')}</Button>
      </div>}/>
    }
    <div id={id + '-rules'} hidden={!schedule.enabled}>
      <Tooltip content={t('当前时间不在任何窗口内时使用的副本数。')}>
        <div className="deployment-schedule-baseline">
          <Text type="secondary">{t('基线副本数')} <strong>{schedule.baseline_replicas ?? '—'}</strong></Text><IconHelpCircle aria-hidden="true"/>
        </div>
      </Tooltip>
      <Text type="secondary">{t('规则')}</Text>
      <div className="deployment-schedule-rules">
        {schedule.rules.map((rule, index) => <RuleEditor key={ruleKeys[index] ?? index} rule={rule} index={index}
          onChange={patch => changeRule(index, patch)} onRemove={() => removeRule(index)} disabled={disabled} locale={locale} timezone={tz}/>)}
      </div>
      <Button className="deployment-schedule-add" htmlType="button" icon={<IconPlus/>} disabled={disabled} onClick={addRule}>{t('添加规则')}</Button>
      {!schedule.rules.length && <Text type="danger" size="small" role="alert">{t('请至少添加一条规则，或关闭定时伸缩')}</Text>}
      {conflicts.length > 0 && <Text type="danger" size="small" role="alert">{t('相同开始时间的规则须使用同一副本数')} · {conflicts.join(' / ')}</Text>}
      {overlaps.length > 0 && <Text type="secondary" size="small">{t('规则窗口重叠时，最近开始的窗口生效。')} {overlaps.join(' / ')}</Text>}
      <div className="deployment-schedule-meta">
        <Text type="tertiary" size="small"><IconClock aria-hidden="true"/> {t('时区')} · {tz}</Text>
        {effective?.replicas != null && <Text type="tertiary" size="small">{t('当前规则预览')} · {effective.replicas} {t('个副本')}</Text>}
      </div>
    </div>
    <AdminModal title={t('请处理未保存的计划草稿')} visible={discardOpen} okText={t('放弃更改')} cancelText={t('继续编辑')}
      onOk={discard} onCancel={() => setDiscardOpen(false)}>
      {t('关闭定时伸缩会丢弃无效的草稿，并恢复上次保存的规则。')}
    </AdminModal>
  </section>;
}
