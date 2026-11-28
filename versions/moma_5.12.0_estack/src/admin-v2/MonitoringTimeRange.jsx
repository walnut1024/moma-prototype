import { useId, useRef, useState } from 'react';
import { Button, DatePicker, Select, Typography } from './xa24/HaloUI.jsx';
import { IconCalendar } from './xa24/HaloIcons.jsx';
import { AdminModal } from './AdminOverlay';
import { RESOURCE_MONITOR_PRESETS, resourceTimeRangeIssue } from './ops-resources';
import './semi-inference.css';

const monitorTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai' });
export const formatMonitoringTime = at => monitorTime.format(at);

export function useMonitoringScope(refresh) {
  const [period, setPeriod] = useState(3600000);
  const [anchor, setAnchor] = useState(Date.now);
  const [range, setRange] = useState(null);
  const [refreshState, setRefreshState] = useState({ loading: false, lastSuccess: null, error: false });
  const inFlight = useRef(false);
  const [start, end] = range ?? [anchor - period, anchor];
  const choosePeriod = value => {
    setRange(null);
    setPeriod(value);
    setAnchor(Date.now());
  };
  const reload = async () => {
    if (!refresh || inFlight.current) return;
    inFlight.current = true;
    setRefreshState(state => ({ ...state, loading: true }));
    try {
      if (!await refresh()) throw Error('刷新失败');
      const now = Date.now();
      setAnchor(now);
      setRefreshState({ loading: false, lastSuccess: now, error: false });
    } catch {
      setRefreshState(state => ({ ...state, loading: false, error: true }));
    } finally {
      inFlight.current = false;
    }
  };
  return { start, end, range, period, setRange, choosePeriod, refreshState, reload };
}

export function MonitoringTimeRange({ scope }) {
  const id = useId();
  const [draft, setDraft] = useState(null);
  const { range, period, setRange, choosePeriod } = scope;
  const draftError = draft ? resourceTimeRangeIssue(...draft) : '';
  const openCustom = () => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    setDraft(range ?? [now - period, now]);
  };
  const apply = () => {
    if (resourceTimeRangeIssue(...draft)) return;
    setRange(draft);
    setDraft(null);
  };
  return <>
    <Select insetLabel="监控时段" insetLabelId={`${id}-period`} aria-labelledby={`${id}-period`} value={range ? 'custom' : period}
      onChange={value => value === 'custom' ? openCustom() : choosePeriod(value)}
      optionList={[...RESOURCE_MONITOR_PRESETS, { value: 'custom', label: '自定义时间范围' }]}/>
    <Button aria-label="自定义监控时间范围" icon={<IconCalendar aria-hidden="true"/>} onClick={openCustom}>自定义</Button>
    {draft && <AdminModal visible title="自定义时间范围" width="min(564px, calc(100vw - 32px))" closeOnEsc okText="应用时间范围"
      onCancel={() => setDraft(null)} okButtonProps={{ disabled: Boolean(draftError) }} onOk={apply}>
      <div className="admin-page-stack">
        <div className="admin-resource-time-fields">
          {['开始时间', '结束时间'].map((label, index) => <div className="admin-page-stack" key={label}>
            <Typography.Text strong id={`${id}-endpoint-${index}`}>{label}</Typography.Text>
            <DatePicker aria-labelledby={`${id}-endpoint-${index}`} aria-invalid={Boolean(draftError)}
              aria-describedby={draftError ? `${id}-range-error` : undefined} type="dateTime"
              validateStatus={draftError ? 'error' : 'default'} timeZone="Asia/Shanghai" format="yyyy-MM-dd HH:mm:ss"
              timePickerOpts={{ format: 'HH:mm:ss' }} value={draft[index] == null ? null : new Date(draft[index])}
              disabledDate={date => date.getTime() > Date.now()} needConfirm inputReadOnly
              onChange={value => setDraft(current => current.map((time, position) => position === index ? value?.getTime() : time))}/>
          </div>)}
        </div>
        <Typography.Text type="secondary">北京时间，支持 5 分钟至 7 天。</Typography.Text>
        {draftError && <Typography.Text type="danger" role="alert" id={`${id}-range-error`}>{draftError}</Typography.Text>}
      </div>
    </AdminModal>}
  </>;
}

export function MonitoringRangeSummary({ range }) {
  return range ? <Typography.Text type="secondary">
    {formatMonitoringTime(range[0])} 至 {formatMonitoringTime(range[1])}（北京时间）
  </Typography.Text> : null;
}
