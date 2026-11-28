import { useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Card, DatePicker, Form, Input, Select, Space, TextArea, Toast, Typography } from './xa24/HaloUI.jsx';
import { IconPlus, IconSearch } from './xa24/HaloIcons.jsx';
import { DEFAULT_PAGE_SIZE, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import { cloudAdminRequest } from './admin-client.mjs';
import { useChannelText } from './channel-language';
import AdminDescriptions from './AdminDescriptions';
import { AdminModal } from './AdminOverlay';
import AdminPageHeading from './AdminPageHeading';
import AdminPageLoading from './AdminPageLoading';
import AdminStatus from './AdminStatus';
import AdminTable from './AdminTable';
import { Field } from './ServiceUI';
import './announcement-management.css';

const statuses = { draft: '草稿', scheduled: '待生效', active: '生效中', inactive: '已停发', expired: '已到期', withdrawn: '已撤回' };
const scopes = { all: '全部用户', selected: '历史定向' };
const timezone = 'Asia/Shanghai';
const timeFormat = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone });
const formatTime = value => Number.isFinite(Date.parse(value)) ? timeFormat.format(new Date(value)) : '—';
const showWindow = ({ startsAt, endsAt }) => startsAt || endsAt ? formatTime(startsAt) + ' ~ ' + formatTime(endsAt) : '—';
const canWithdraw = record => ['active', 'scheduled'].includes(record?.status);

function makeDraft(record) {
  return {
    id: record?.id,
    revision: record?.revision,
    title: record?.title ?? '',
    body: record?.body ?? '',
    timing: record?.startsAt ? 'scheduled' : 'now',
    startsAt: record?.startsAt ?? null,
    endsAt: record ? record.endsAt : new Date(Math.floor(Date.now() / 60000) * 60000 + 7 * 86400000).toISOString(),
  };
}

function validateDraft(draft, publishing) {
  if (!draft.title.trim()) return ['title', '请填写公告标题。'];
  if (!publishing) return null;
  if (!draft.body.trim()) return ['body', '请填写公告正文。'];
  const now = Date.now();
  const scheduled = draft.timing === 'scheduled';
  const start = scheduled ? Date.parse(draft.startsAt) : now;
  if (scheduled && !(start > now)) return ['startsAt', '生效时间须晚于当前时间。'];
  if (!(Date.parse(draft.endsAt) > start)) return ['endsAt', '到期时间须晚于生效时间。'];
  return null;
}

function requestBody(action, record) {
  const identity = record.id ? { id: record.id, revision: record.revision } : {};
  if (action === 'withdraw') return { action, ...identity };
  return {
    action, ...identity,
    title: record.title.trim(), body: record.body.trim(),
    startsAt: record.timing === 'scheduled' ? record.startsAt : null,
    endsAt: record.endsAt || null,
  };
}

function AnnouncementDateField({ label, value, update, busy, error }) {
  const labelId = useId();
  const t = useChannelText();
  return <Form.Slot className="admin-form-field" label={{ id: labelId, text: t(label), required: true }}
    error={error ? <span id={labelId + '-error'} role="alert">{error}</span> : undefined}>
    <DatePicker aria-labelledby={labelId} aria-required aria-invalid={Boolean(error)}
      aria-describedby={error ? labelId + '-error' : undefined} validateStatus={error ? 'error' : 'default'}
      type="dateTime" format="yyyy-MM-dd HH:mm" timeZone={timezone} timePickerOpts={{ format: 'HH:mm' }}
      value={value ? new Date(value) : null} disabled={busy} style={{ width: '100%' }}
      placeholder={t('请选择日期和时间')} needConfirm onChangeWithDateFirst
      onChange={date => update(date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null)}/>
  </Form.Slot>;
}

function AnnouncementEditor({ formId, onSubmit, draft, update, busy, errorField, errorText }) {
  const t = useChannelText();
  const fieldError = field => field === errorField ? errorText : undefined;
  return <Form id={formId} onSubmit={onSubmit}>
    <Field label="公告标题" required error={fieldError('title')}>
      <Input value={draft.title} disabled={busy} maxLength={64} showClear
        placeholder={t('例如：模型服务维护通知')} onChange={title => update({ title })}/>
    </Field>
    <Field label="公告正文" required error={fieldError('body')}>
      <TextArea className="announcement-body-input" value={draft.body} disabled={busy} maxLength={1200} maxCount={1200} rows={8} resize="vertical"
        placeholder={t('说明发生了什么、影响范围，以及租户需要做什么。')} onChange={body => update({ body })}/>
    </Field>
    <AdminDescriptions className="announcement-audience" data={[{ key: '发布范围', value: t(scopes.all) }]}/>
    <div className="announcement-time">
      <Typography.Text strong>{t('展示时间（北京时间）')}</Typography.Text>
      <div className="announcement-time-fields">
        <Field label="生效方式">
          <Select value={draft.timing} disabled={busy} style={{ width: '100%' }}
            optionList={[{ value: 'now', label: t('立即生效') }, { value: 'scheduled', label: t('指定时间') }]}
            onChange={timing => update({ timing })}/>
        </Field>
        {draft.timing === 'scheduled' && <AnnouncementDateField label="生效时间" value={draft.startsAt}
          error={fieldError('startsAt')} busy={busy} update={startsAt => update({ startsAt })}/>}
        <AnnouncementDateField label="到期时间" value={draft.endsAt}
          error={fieldError('endsAt')} busy={busy} update={endsAt => update({ endsAt })}/>
      </div>
    </div>
  </Form>;
}

export default function AnnouncementManagement({ accountId, dirtyRef }) {
  const t = useChannelText();
  const formId = useId();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [mode, setMode] = useState(null);
  const [focusedRecord, setFocusedRecord] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState(null);
  const [writeError, setWriteError] = useState(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(null);
  const retry = useRef(null);
  const dialogContent = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    cloudAdminRequest('/announcements', { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) {
          if (result.accountId !== accountId) {
            setData(null);
            throw Error('登录账号已切换，请重新打开公告管理。');
          }
          setData(result);
          setLoadError(null);
        }
      })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error); });
    return () => controller.abort();
  }, [accountId, attempt]);

  useEffect(() => {
    dirtyRef.current = dirty || busy;
    return () => { dirtyRef.current = false; };
  }, [dirtyRef, dirty, busy]);

  useEffect(() => () => operation.current?.abort(), []);

  useEffect(() => {
    if (mode === 'editor') {
      dialogContent.current?.querySelector('input')?.focus({ preventScroll: true });
    } else if (mode) {
      dialogContent.current?.focus({ preventScroll: true });
    }
  }, [mode]);

  useEffect(() => {
    if (validation) dialogContent.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [validation]);

  const filtered = (data?.announcements ?? []).filter(row =>
    (status === 'all' || status === row.status) && row.title.toLowerCase().includes(query.trim().toLowerCase()));

  function dismiss() {
    setMode(null);
    setFocusedRecord(null);
    setDraft(null);
    setDirty(false);
    setValidation(null);
    setWriteError(null);
    retry.current = null;
  }

  function open(record, next) {
    setWriteError(null);
    setValidation(null);
    setDirty(false);
    retry.current = null;
    setFocusedRecord(record);
    setDraft(next === 'editor' ? makeDraft(record) : null);
    setMode(next);
  }

  function update(changes) {
    setDraft(current => ({ ...current, ...changes }));
    setDirty(true);
    setValidation(null);
    if (writeError?.status !== 409) setWriteError(null);
  }

  function close() {
    if (busy) return;
    if (mode === 'preview' || mode === 'discard') return setMode('editor');
    if (mode === 'withdraw') return setMode('detail');
    if (mode === 'editor' && dirty) return setMode('discard');
    dismiss();
  }

  function review() {
    if (busy || writeError?.status === 409) return;
    const issue = validateDraft(draft, true);
    setValidation(issue);
    if (!issue) {
      setWriteError(null);
      setMode('preview');
    }
  }

  async function write(action) {
    if (operation.current || writeError?.status === 409) return;
    const record = action === 'withdraw' ? focusedRecord : draft;
    const issue = action === 'withdraw' ? null : validateDraft(record, action === 'publish');
    if (issue) {
      setValidation(issue);
      setMode('editor');
      return;
    }
    const body = { accountId, ...requestBody(action, record) };
    const payload = JSON.stringify(body);
    if (retry.current?.payload !== payload) retry.current = { payload, key: crypto.randomUUID() };
    const controller = new AbortController();
    operation.current = controller;
    setWriteError(null);
    setBusy(true);
    try {
      const result = await cloudAdminRequest('/announcements', {
        method: 'POST', body, operationId: retry.current.key, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.accountId !== accountId) throw Error('登录账号已切换，请重新打开公告管理。');
      const { announcement } = result;
      setData(current => ({ ...current, announcements: [announcement, ...current.announcements.filter(row => row.id !== announcement.id)] }));
      if (action !== 'withdraw') {
        setQuery('');
        setStatus('all');
        setPage(1);
      }
      dismiss();
      const message = {
        draft: '草稿已保存', publish: announcement.status === 'scheduled' ? '公告已发布，将在指定时间生效' : '公告已发布',
        withdraw: '公告已撤回',
      };
      Toast.success(t(message[action]));
    } catch (error) {
      if (!controller.signal.aborted) {
        setWriteError(error);
        if (error.status === 409) setAttempt(current => current + 1);
      }
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const columns = [
    { title: '公告标题', dataIndex: 'title', width: 204, render: value => <Typography.Text strong className="announcement-wrap">{value}</Typography.Text> },
    { title: '发布范围', dataIndex: 'scope', width: 130, render: value => t(scopes[value]) || '—' },
    { title: '状态', dataIndex: 'status', width: 96, render: value => <AdminStatus value={statuses[value]}/> },
    { title: '展示时间（北京时间）', key: 'displayWindow', width: 258, render: (_, row) => showWindow(row) },
    { title: '发布人', dataIndex: 'publisher', width: 110, render: value => value || '—' },
    { title: '操作', key: 'actions', width: 120, render: (_, row) => <Space spacing={4}>
      <Button size="small" theme="borderless" onClick={() => open(row, row.status === 'draft' ? 'editor' : 'detail')}>
        {t(row.status === 'draft' ? '编辑' : '查看')}
      </Button>
      {canWithdraw(row) && <Button size="small" type="danger" theme="borderless" onClick={() => open(row, 'withdraw')}>{t('撤回')}</Button>}
    </Space> },
  ];
  const actionDisabled = busy || writeError?.status === 409;
  const titles = {
    editor: draft?.id ? '编辑公告' : '新建公告',
    preview: '发布预览', detail: '公告详情', withdraw: '撤回公告', discard: '放弃未保存的修改？',
  };
  const actions = {
    editor: <><Button disabled={actionDisabled} loading={busy} onClick={() => write('draft')}>{t('保存草稿')}</Button>
      <Button disabled={busy} onClick={close}>{t('取消')}</Button>
      <Button theme="solid" disabled={actionDisabled} htmlType="submit" form={formId}>{t('预览并发布')}</Button></>,
    preview: <><Button disabled={busy} onClick={close}>{t('返回编辑')}</Button>
      <Button theme="solid" disabled={actionDisabled} loading={busy} onClick={() => write('publish')}>{t('确认发布')}</Button></>,
    detail: <>{canWithdraw(focusedRecord) && <Button type="danger" theme="borderless" onClick={() => setMode('withdraw')}>{t('撤回公告')}</Button>}
      <Button onClick={dismiss}>{t('关闭')}</Button></>,
    withdraw: <><Button disabled={busy} onClick={close}>{t('取消')}</Button>
      <Button theme="solid" type="danger" disabled={actionDisabled} loading={busy} onClick={() => write('withdraw')}>{t('确认撤回')}</Button></>,
    discard: <><Button onClick={close}>{t('继续编辑')}</Button>
      <Button theme="solid" type="danger" onClick={dismiss}>{t('放弃本次修改')}</Button></>,
  };
  const visibleRecord = mode === 'preview' ? { ...draft, title: draft.title.trim(), body: draft.body.trim() } : focusedRecord;
  const confirmation = mode === 'withdraw' ? t('撤回后，租户控制台将停止展示这条公告。') : t('退出后，此次填写的内容将丢失。');
  const audience = visibleRecord
    ? { key: '发布范围', value: t(scopes[mode === 'preview' ? 'all' : visibleRecord.scope]) || '—' } : null;
  const metadata = visibleRecord ? [
    ...(mode !== 'preview' ? [{ key: '状态', value: <AdminStatus value={statuses[visibleRecord.status]}/> }, audience] : []),
    { key: '生效时间', value: mode === 'preview' && draft.timing === 'now' ? t('立即生效') : formatTime(visibleRecord.startsAt) },
    { key: '到期时间', value: formatTime(visibleRecord.endsAt) },
    ...(mode !== 'preview' ? [{ key: '发布人', value: visibleRecord.publisher || '—' }] : []),
  ] : [];

  return <section className="admin-page-stack announcement-management">
    <AdminPageHeading title={t('公告管理')}>
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!data} onClick={() => open(null, 'editor')}>{t('新建公告')}</Button>
    </AdminPageHeading>
    {loadError && <Banner type="danger" closeIcon={null} description={<Space wrap>
      <span role="alert">{t(loadError.message)}</span>
      <Button onClick={() => { setLoadError(null); setAttempt(value => value + 1); }}>{t('重试')}</Button>
    </Space>}/>}
    {data ? <Card>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" type="search" showClear prefix={<IconSearch aria-hidden="true"/>}
          aria-label={t('搜索公告标题')} placeholder={t('搜索公告标题')} value={query} onChange={value => { setQuery(value); setPage(1); }}/>
        <Select aria-label={t('筛选公告状态')} value={status}
          optionList={Object.entries({ all: '全部状态', ...statuses }).map(([value, label]) => ({ value, label: t(label) }))}
          onChange={value => { setStatus(value); setPage(1); }}/>
      </FilterToolbar>
      <AdminTable rowKey="id" dataSource={filtered} columns={columns} scroll={{ x: 'max(100%, 920px)' }}
        empty={query.trim() || status !== 'all' ? '没有符合条件的记录' : '暂无公告'}
        pagination={{ currentPage: page, pageSize, pageSizeOpts: PAGE_SIZES, showSizeChanger: true, showTotal: true,
          onPageChange: setPage, onPageSizeChange: size => { setPageSize(size); setPage(1); } }}/>
    </Card> : !loadError && <AdminPageLoading label="公告"/>}
    {mode && <AdminModal visible title={t(titles[mode])}
      width={['editor', 'preview'].includes(mode) ? 'min(800px, calc(100vw - 32px))' : 'min(632px, calc(100vw - 32px))'} closeOnEsc={!busy}
      closeIcon={busy ? null : undefined} onCancel={close} footer={actions[mode]} className="announcement-management-modal">
      <div ref={dialogContent} tabIndex={-1} className="admin-page-stack">
        {mode === 'editor' && <AnnouncementEditor formId={formId} onSubmit={review} draft={draft} update={update}
          busy={busy} errorField={validation?.[0]} errorText={t(validation?.[1])}/>}
        {['preview', 'detail'].includes(mode) && <>
          {mode === 'preview' && <AdminDescriptions data={[audience]}/>}
          <Card title={<span className="announcement-wrap">{visibleRecord.title}</span>}>
            <Typography.Paragraph className="announcement-wrap announcement-text">{visibleRecord.body || '—'}</Typography.Paragraph>
          </Card>
          <AdminDescriptions data={metadata}/>
          <Typography.Text type="secondary">{t('时间均为北京时间。')}</Typography.Text>
        </>}
        {mode === 'discard' && <Typography.Paragraph>{confirmation}</Typography.Paragraph>}
        {mode === 'withdraw' && <Typography.Paragraph>{t('确定撤回「{title}」？').replace('{title}', focusedRecord.title)}{confirmation}</Typography.Paragraph>}
        {writeError && <Banner type="danger" closeIcon={null} description={<span role="alert">
          {t(writeError.message)}
          {writeError.status === 409 && ' ' + t('请关闭弹窗后查看最新记录。')}
        </span>}/>}
      </div>
    </AdminModal>}
  </section>;
}
