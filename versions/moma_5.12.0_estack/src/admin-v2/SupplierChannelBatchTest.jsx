import AdminStatus from './AdminStatus';
import ChannelTestProgress from './ChannelTestProgress';
import { resolveChannelAssociationModel } from './channel-association-model';
import { channelEnableConfirmationIssue, channelDirectEnableIssue, prepareChannelEnableConfirmation, prepareChannelDirectEnableConfirmation } from './channel-enable-confirmation';
import { basicChannelUsageButton, channelTestUsageAuthorized } from './channel-test-authorization';
import { cloneElement, useEffect, useRef, useState } from 'react';
import { Banner, Button, Checkbox, Space, Table, Typography } from '@douyinfe/semi-ui';
import SupplierCreationDialog from './SupplierCreationDialog';
import { Choice, Field } from './ServiceUI';
import { CopyId, Disclosure, GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { supplierChannelAssociations } from './supplier-resources';
import { channelCheckCurrent, channelInterfaceIssue } from './provider-channels';
import { modelTaskUrl } from './channel-interface';
import { redactDiagnostic } from './channel-selection';
import { moneyDisplay } from './model-management';
import { connectionCredentialsReady, connectionFingerprint, connectionTestKey, connectionTestPassed } from './connection-state';
import { prepareServerChannel, onboardingApi } from './onboarding-client';
import OnboardingScenarioControl from './OnboardingScenarioControl';
import { CHANNEL_TEST_STATUS, channelBatchRunning, channelBatchTerminal, channelTestItem, channelTestModels, channelTestRequest, recentChannelTestJob } from './channel-test-jobs';

const endpointForModel = (endpoint, row, audioProbes) => {
  try { return modelTaskUrl(endpoint, row.type, { upstreamModelId: row.upstreamModelId, probe: audioProbes[row.associationId] }); }
  catch { return ''; }
};
const showUsage = value => value === null || value === undefined ? '未知' : JSON.stringify(value);
const isMediaTest = row => ['image', 'audio', 'video'].includes(row.type);
const checkOptions = [['basic', '基础调用'], ['streaming', '流式响应'], ['tools', '工具调用'], ['structured', '结构化输出']];
const audioOptions = [['speech', '语音合成'], ['transcription', '语音识别']];

function ModelCallTest({ state, provider, endpointId, associationIds, ops, close, navigation, embedded = false, fromService = false, onContinue, continueDisabled = false, continueLabel = '下一步：配置销售', testOnly = false, startToken, onComplete, onProgress, directory = false, onRemove, reference = false, title = '测试连接', modeSelector, httpProbe }) {
  const endpoint = state.endpoints.find(row => row.id === endpointId);
  const viewingConnection = testOnly && !embedded;
  const directoryTest = directory && viewingConnection && !reference;
  const testWriteOptions = { silent: directory && testOnly && !reference };
  const rows = supplierChannelAssociations(state, provider, endpointId).filter(row => associationIds.includes(row.id));
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const records = rows.map(row => { let master; try { master = resolveChannelAssociationModel(state, provider, row); } catch { /* The plan reports the missing identity without guessing a match. */ } return { associationId: row.id, modelId: master?.id, modelName: master?.name, upstreamModelId: row.upstreamModelId, type: master?.type }; });
  const restored = recentChannelTestJob(endpoint?.serverTestJobs, associationIds);
  const [job, setJob] = useState(restored), [batch, setBatch] = useState(null);
  const [selected, setSelected] = useState([]), [confirmation, setConfirmation] = useState(null);
  const [check, setCheck] = useState(directoryTest || reference ? '' : restored?.check || '');
  const [expensiveIds, setExpensiveIds] = useState([]), [audioProbes, setAudioProbes] = useState({}),
    [plannedIds, setPlannedIds] = useState(() => directory && !reference && associationIds.includes(endpoint?.directoryDefaultTestAssociationId) ? [endpoint.directoryDefaultTestAssociationId] : null),
    [consent, setConsent] = useState(false);
  const [endpointFilter, setEndpointFilter] = useState(''), [failureOnly, setFailureOnly] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pollRevision, setPollRevision] = useState(0), [details, setDetails] = useState(null), [notSubmitted, setNotSubmitted] = useState(false), [receiptFailed, setReceiptFailed] = useState(false);
  const mounted = useRef(true), pending = useRef(false), receiptAttempts = useRef(new Set()), opsRef = useRef(ops); opsRef.current = ops;
  const callbacks = useRef(null), startedTokens = useRef(new Set()); callbacks.current = { onComplete, onProgress };
  const activeJob = job || restored;
  const signature = connectionFingerprint(endpoint), ready = connectionCredentialsReady(endpoint, provider);
  const passed = row => connectionTestPassed(endpoint) && channelCheckCurrent(row) && row.health?.result === '通过' && !channelInterfaceIssue(provider, row);
  const running = channelBatchRunning(batch), unresolved = Boolean(activeJob && !activeJob.batchId), stale = activeJob && (activeJob.signature !== signature || activeJob.request?.models.some(model => !records.some(row => row.associationId === model.associationId && row.upstreamModelId === model.upstreamModelId && row.modelId === model.id)));
  const confirming = Boolean(confirmation), confirmationIssue = confirming ? channelEnableConfirmationIssue(state, confirmation) : '';
  const selectedReady = selected.length > 0 && selected.every(id => rows.some(row => row.id === id && passed(row)));
  const recordEndpoints = directory ? new Map(records.map(row => [row.associationId, endpointForModel(endpoint, row, audioProbes)])) : null;
  const availableEndpoints = [...new Set(recordEndpoints?.values() || [])].filter(Boolean);
  const scopedRecords = directory && endpointFilter ? records.filter(row => recordEndpoints.get(row.associationId) === endpointFilter) : records;
  const testableRecords = directoryTest ? scopedRecords.filter(row => row.modelId && row.upstreamModelId && row.type &&
    !channelInterfaceIssue(provider, rowsById.get(row.associationId))) : [];
  const selectedForTest = testableRecords.filter(row => plannedIds
    ? plannedIds.includes(row.associationId) : associationIds.length === 1 || !isMediaTest(row));
  const selectedTestIds = selectedForTest.map(row => row.associationId);
  const allBasic = channelTestModels(testableRecords.filter(row => !isMediaTest(row)));
  let plannedModels = [], planError = '';
  try {
    if (!directoryTest) plannedModels = channelTestModels(scopedRecords, { check, expensiveIds, audioProbes, plannedIds });
    else if (associationIds.length > 1 || !selectedForTest.some(row => row.type === 'audio' && !audioProbes[row.associationId])) {
      plannedModels = channelTestModels(selectedForTest, { expensiveIds: selectedTestIds, audioProbes });
    }
  } catch (issue) { planError = issue.message; }
  const basicUsageButton=basicChannelUsageButton(plannedModels,check),mediaRecords=records.filter(isMediaTest);
  const firstEnable=!channelDirectEnableIssue(state,provider.id,endpointId,associationIds),singleEnabled=rows.length===1 && rows[0].enabled && ['运行中','需关注'].includes(endpoint?.status),showSelection=!testOnly && !firstEnable && !singleEnabled;
  const current=useRef(null);current.current={state,provider,endpoint,signature,plan:JSON.stringify([check,plannedModels]),can:ops.can};
  const recordJob = async record => await opsRef.current.run('channelTestEvidenceJob', { providerId: provider.id, endpointId, ...record },
    undefined, false, testWriteOptions);
  const receive = async (result, trackedJob) => {
    if (!channelBatchTerminal(result) || trackedJob.receivedAt || receiptAttempts.current.has(result.id)) return;
    const saved = await opsRef.current.run('channelTestEvidenceReceipt', { providerId: provider.id, endpointId, batch: result },
      undefined, false, testWriteOptions);
    if (!saved) setReceiptFailed(true); else { receiptAttempts.current.add(result.id); setReceiptFailed(false); callbacks.current.onComplete?.({ state: saved, batch: result }); }
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (httpProbe || !activeJob?.batchId) return;
    let stopped = false, timer; const controller = new AbortController();
    const poll = async () => {
      try {
        const result = await onboardingApi(`/tests/${encodeURIComponent(activeJob.batchId)}`, { signal: controller.signal });
        if (stopped) return;
        setBatch(result); setError(''); await receive(result, activeJob);
        if (channelBatchRunning(result)) timer = setTimeout(poll, 800);
      } catch (issue) { if (!stopped && issue.name !== 'AbortError') setError(`读取任务失败：${issue.message}。可刷新进度，关闭不会取消后台任务。`); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [activeJob?.batchId, pollRevision, Boolean(httpProbe)]);

  const submitRequest = async tracked => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await onboardingApi('/tests', { method: 'POST', body: tracked.request, signal: controller.signal });
      if (!mounted.current) return;
      const completed = { ...tracked, batchId: result.id };
      setJob(completed); setBatch(result); setNotSubmitted(false); setConsent(false);
      if (!await recordJob(completed)) setError('后台任务已提交，本地记录未保存；请保持当前页面并载入最新数据后恢复。');
    } catch (issue) { if (mounted.current) setError(issue.name === 'AbortError' ? '提交结果待确认，请查询原提交；不会重新创建任务。' : `${issue.message}。请查询原提交确认结果。`); }
    finally { clearTimeout(timeout); }
  };
  const start = async ({explicitBasicClick=false, basicModels}={}) => {
    const models = basicModels || plannedModels;
    if (pending.current || busy || running || unresolved || confirming || !ops.can || !ready ||
        (!basicModels && planError) || !channelTestUsageAuthorized(models, { check, consent: !basicModels && consent, explicitBasicClick })) return;
    const captured={signature,plan:JSON.stringify([check,plannedModels]),models:structuredClone(models)};
    pending.current = true; setBusy(true); setError(''); setSelected([]); setConfirmation(null); setNotSubmitted(false); setFailureOnly(false);
    try {
      const serverChannel = await prepareServerChannel(provider, endpoint, directory ? connectionTestKey(endpoint, provider) : undefined);
      if(!mounted.current || !current.current.can || current.current.signature!==captured.signature || current.current.plan!==captured.plan || !connectionCredentialsReady(current.current.endpoint,current.current.provider))throw new Error('配置或权限已变化，请核对后重新测试。');
      const request = channelTestRequest(serverChannel.id, captured.models, { check });
      const tracked = { operationId: request.operationId, batchId: '', signature, serverChannelId: serverChannel.id, associationIds: captured.models.map(row => row.associationId), request, check, createdAt: new Date().toISOString() };
      if (!await recordJob(tracked)) throw new Error('任务提交信息未保存，请处理本地保存问题后继续');
      setJob(tracked); setBatch(null); await submitRequest(tracked);
    } catch (issue) { if (mounted.current) setError(issue.message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    if (startToken && !startedTokens.current.has(startToken)) {
      startedTokens.current.add(startToken);
      if (basicUsageButton && (!activeJob || activeJob.receivedAt)) void start({ explicitBasicClick: true });
    }
  }, [startToken]);
  useEffect(() => { callbacks.current.onProgress?.({ batch, error, running: busy || running, unresolved }); }, [batch, error, busy, running, unresolved]);
  const querySubmission = async () => {
    if (!activeJob?.operationId || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await onboardingApi(`/tests?operationId=${encodeURIComponent(activeJob.operationId)}`);
      if (!mounted.current) return;
      const completed = { ...activeJob, batchId: result.id }; setJob(completed); setBatch(result); setNotSubmitted(false);
      if (!await recordJob(completed)) setError('已找到后台任务，本地记录未保存，请处理保存冲突后重试。');
    } catch (issue) { if (mounted.current) { setNotSubmitted(issue.code === 'submission_not_found'); setError(issue.code === 'submission_not_found' ? '服务端确认未找到此提交。可明确继续原提交，操作 ID 保持不变。' : issue.message); } }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const resumeOriginal = async () => {
    if (pending.current || !ops.can || !ready || stale || !activeJob?.request || !notSubmitted) return;
    pending.current = true; setBusy(true); setError('');
    try { await submitRequest(activeJob); } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const cancelTask = async () => {
    if (!ops.can || !activeJob?.batchId || busy) return;
    setBusy(true); setError('');
    try { await onboardingApi(`/tests/${encodeURIComponent(activeJob.batchId)}/cancel`, { method: 'POST', body: { operationId: crypto.randomUUID() } }); setPollRevision(value => value + 1); }
    catch (issue) { setError(issue.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const planRetry = ids => { if (directory && ids?.some(id => endpointFilter && recordEndpoints.get(id) !== endpointFilter)) setEndpointFilter(''); setPlannedIds(ids); setConsent(false); setConfirmation(null); setError(''); };
  const failedIds = rows.filter(row => { const item = channelTestItem(batch, row.id); return item ? ['failed', 'unknown', 'cancelled'].includes(item.status) : !passed(row); }).map(row => row.id);
  const displayedRows = rows.filter(row => (!directory || !endpointFilter || recordEndpoints.get(row.id) === endpointFilter) &&
    (!directory || !failureOnly || failedIds.includes(row.id) && channelTestItem(batch, row.id)));
  const canPlan = !busy && !running && !unresolved && !confirming;
  const enable = async () => {
    setError('');
    if(!ops.can || busy || running || unresolved || singleEnabled)return;
    if(firstEnable){
      try{const snapshot=prepareChannelDirectEnableConfirmation(current.current.state,provider.id,endpointId,associationIds),issue=channelEnableConfirmationIssue(current.current.state,snapshot);if(issue)throw new Error(issue);await opsRef.current.run('supplierSelection',{action:'enable',selections:snapshot.selections,confirmed:true});}
      catch(issue){setError(issue.message);}return;
    }
    if (!confirmation) {
      try { setConfirmation(prepareChannelEnableConfirmation(state, provider.id, endpointId, selected)); }
      catch (issue) { setError(issue.message); }
      return;
    }
    const issue = channelEnableConfirmationIssue(state, confirmation);
    if (issue) { setError(issue); return; }
    if (await opsRef.current.run('supplierSelection', { action: 'enable', selections: confirmation.selections, confirmed: true })) { setSelected([]); setConfirmation(null); }
  };
  if (directoryTest) {
    const canChange = canPlan && ops.can;
    const canTest = canChange && ready && provider.status === '已启用';
    const results = !stale ? batch?.items || [] : [];
    const resultsById = new Map(results.map(item => [item.model.associationId, item]));
    const retryFailures = new Set(results.filter(item => item.status === 'failed' || item.status === 'unknown')
      .map(item => item.model.associationId));
    const failedBasicModels = allBasic.filter(row => retryFailures.has(row.associationId));
    const testRows = scopedRecords.filter(row => !failureOnly || retryFailures.has(row.associationId));
    const canTestDifferentScope = allBasic.length > 1 && allBasic.length <= 50 && allBasic.some(row => !selectedTestIds.includes(row.associationId));
    const usage = details?.usage;
    const usageText = [
      usage?.input_tokens == null ? null : `输入 ${usage.input_tokens} Token`,
      usage?.output_tokens == null ? null : `输出 ${usage.output_tokens} Token`,
      usage?.seconds == null ? null : `${usage.seconds} 秒`,
      usage?.characters == null ? null : `${usage.characters} 字符`,
    ].filter(Boolean).join(' · ');
    const cost = details?.cost?.unit === 'micro' ? details.cost : null;
    const copy = async text => {
      try { await navigator.clipboard.writeText(text); }
      catch { setError('复制失败，请重试。'); }
    };
    return <SupplierCreationDialog wide title={title} description="" cancel={close} cancelLabel="关闭"
      className="channel-test-dialog" footer={httpProbe ? httpProbe.action : <>
        {running && <Button disabled={busy || !ops.can} onClick={cancelTask}>停止后续测试</Button>}
        {canPlan && canTestDifferentScope && <Button disabled={!canTest}
          onClick={() => start({ basicModels: allBasic, explicitBasicClick: true })}>
          {scopedRecords.some(isMediaTest) ? '测试全部基础模型' : '测试全部模型'}
        </Button>}
        {canPlan && <Button theme="solid" disabled={!canTest || !plannedModels.length || plannedModels.length > 50 || !basicUsageButton && !consent}
          onClick={() => start({ explicitBasicClick: basicUsageButton })}>
          {associationIds.length === 1 ? '开始测试' : '测试所选'}{associationIds.length > 1 && '（' + selectedTestIds.length + '）'}
        </Button>}
      </>}>
      {modeSelector(httpProbe ? httpProbe.running : !canPlan)}
      {httpProbe ? httpProbe.content : <>
      {availableEndpoints.length > 1 && <div className="channel-test-fields">
        <Field label="测试接口"><Choice label="测试接口" value={endpointFilter || 'auto'}
          options={[[ 'auto', '自动选择' ], ...availableEndpoints.map(url => [url, new URL(url).pathname + new URL(url).search])]}
          disabled={!canChange} onChange={value => {
            setEndpointFilter(value === 'auto' ? '' : value);
            setFailureOnly(false);
            setConsent(false);
          }}/></Field>
      </div>}
      <OnboardingScenarioControl disabled={!canChange}/>
      {!ready && <Notice error>渠道缺少可用 API 密钥。请在密钥管理中配置后再测试。</Notice>}
      {provider.status !== '已启用' && <Notice error>请先启用服务商。</Notice>}
      {planError && <Notice error>{planError}。</Notice>}
      {plannedModels.length > 50 && <Notice error>每次最多测试 50 个模型，请减少选择。</Notice>}
      {unresolved && <Space wrap>
        <Button disabled={busy} onClick={querySubmission}>查询原提交</Button>
        {notSubmitted && <Button theme="solid" disabled={busy || !ops.can || !ready || stale} onClick={resumeOriginal}>继续原提交</Button>}
      </Space>}
      {(busy || running || error && activeJob?.batchId) && <Space wrap>
        <ChannelTestProgress batch={busy ? null : batch} running={busy || running}/>
        {running && <Typography.Text type="secondary">关闭后可重新打开查看进度</Typography.Text>}
        {error && activeJob?.batchId && <Button theme="borderless" onClick={() => setPollRevision(value => value + 1)}>刷新进度</Button>}
      </Space>}
      {stale && <Notice>连接配置已变化，请重新测试。</Notice>}
      {receiptFailed && <Notice error>测试结果未保存。<Button theme="borderless" onClick={async () => {
        receiptAttempts.current.delete(batch.id);
        await receive(batch, activeJob);
      }}>重新保存</Button></Notice>}
      <Table size="small" aria-label="模型测试结果" rowKey="associationId" pagination={false}
        className="channel-test-table" scroll={{ x: 'max(100%, 776px)' }} dataSource={testRows}
        empty={failureOnly ? '没有未通过的模型' : '暂无可测试模型'}
        rowSelection={associationIds.length > 1 ? {
          width: 44, selectedRowKeys: selectedTestIds,
          disabled: !canChange || !testableRecords.length,
          getCheckboxProps: row => ({ disabled: !canChange || !testableRecords.includes(row), 'aria-label': '选择 ' + (row.modelName || row.upstreamModelId) }),
          renderCell: ({ inHeader, selected, originNode }) => inHeader
            ? cloneElement(originNode, { 'aria-label': selected ? '取消全选模型' : '选择全部模型' }) : originNode,
          onChange: keys => { setPlannedIds(keys); setConsent(false); },
        } : undefined}
        columns={[
          { title: '模型', width: 206, render: (_, row) => <div className="channel-identity">
            <Typography.Text ellipsis={{ showTooltip: true }}>{row.modelName || row.upstreamModelId}</Typography.Text>
            <CopyId copyAtStart ellipsis value={row.upstreamModelId} label="上游模型调用标识"/>
          </div> },
          { title: '测试接口', width: 162, render: (_, row) => {
            const url = recordEndpoints.get(row.associationId);
            return row.type === 'audio' && (associationIds.length === 1 || selectedTestIds.includes(row.associationId))
              ? <Choice label={row.modelName + '的语音任务'} placeholder="选择语音任务" value={audioProbes[row.associationId]}
                options={audioOptions} disabled={!canChange} onChange={probe => {
                  setAudioProbes(current => ({ ...current, [row.associationId]: probe }));
                  if (endpointFilter) setEndpointFilter('');
                  setConsent(false);
                }}/>
              : url ? <Typography.Text ellipsis={{ showTooltip: true }}>{new URL(url).pathname}</Typography.Text> : '—';
          } },
          { title: '测试结果', width: 106, render: (_, record) => {
            const row = rowsById.get(record.associationId);
            const item = resultsById.get(row.id);
            const issue = channelInterfaceIssue(provider, row);
            const previousPass = passed(row);
            const result = issue ? '接口不匹配' : item ? CHANNEL_TEST_STATUS[item.status] : previousPass ? '通过' : '待测试';
            return <div className="channel-test-result">
              <AdminStatus value={result || '结果未知'}/>
              {issue && <Typography.Text size="small" type="secondary">{issue}</Typography.Text>}
              {(item ? (item.evidenceSource || batch.source) === 'mock' : previousPass && (row.health?.source === 'mock' || row.health?.simulated)) &&
                <Typography.Text size="small" type="secondary">模拟</Typography.Text>}
            </div>;
          } },
          { title: '耗时 / HTTP 状态', width: 128, render: (_, row) => {
            const item = resultsById.get(row.associationId);
            return [item?.durationMs == null ? null : item.durationMs + ' ms', item?.upstreamStatus]
              .filter(value => value != null).join(' · ') || '—';
          } },
          { title: '操作', width: 126, render: (_, row) => {
            const item = resultsById.get(row.associationId);
            const basic = allBasic.find(model => model.associationId === row.associationId);
            const label = item || passed(rowsById.get(row.associationId)) ? '重测' : '测试';
            return <Space wrap spacing={4}>
              {item && <Button size="small" theme="borderless" aria-label={'测试详情 ' + row.modelName} onClick={() => setDetails(item)}>详情</Button>}
              {associationIds.length > 1 && basic && <Button size="small" theme="borderless" disabled={!canTest}
                aria-label={label + ' ' + (row.modelName || row.upstreamModelId)}
                onClick={() => start({ basicModels: [basic], explicitBasicClick: true })}>{label}</Button>}
              {!item && (associationIds.length === 1 || !basic) && '—'}
            </Space>;
          } },
        ]}/>
      {(retryFailures.size > 0 || selectedForTest.length > 1) && <Space wrap className="channel-test-tools">
        {retryFailures.size > 0 && <Checkbox checked={failureOnly} onChange={event => {
          setFailureOnly(event.target.checked);
          if (event.target.checked) setPlannedIds(selectedTestIds.filter(id => retryFailures.has(id)));
          setConsent(false);
        }}>仅显示未通过项</Checkbox>}
        {failedBasicModels.length > 0 && <Button size="small" theme="borderless" disabled={!canTest}
          onClick={() => start({ basicModels: failedBasicModels, explicitBasicClick: true })}>重试未通过项</Button>}
        {selectedForTest.length > 1 && <Button size="small" theme="borderless"
          onClick={() => copy(selectedForTest.map(row => row.upstreamModelId).join('\n'))}>复制所选模型</Button>}

      </Space>}
      {canPlan && plannedModels.length > 0 && !basicUsageButton && <Checkbox checked={consent}
        disabled={!canTest} onChange={event => setConsent(event.target.checked)}>确认执行所选模拟测试</Checkbox>}
      {error && <Notice error>{error}</Notice>}
      {ops.error && ops.error !== error && <Notice error>{ops.error}</Notice>}
      <Banner type="warning" closeIcon={null} description="模型调用测试会消耗 Token，并可能产生费用。 实际费用按上游服务商计费规则计算。"/>
      {details && <Modal title="测试详情" description={details.model.upstreamModelId} onClose={() => setDetails(null)}
        footer={<><Button onClick={() => setDetails(null)}>关闭</Button>{onRemove && details.status === 'failed' &&
          <Button theme="borderless" type="danger" disabled={!canChange} onClick={() => onRemove(details.model.associationId)}>删除模型渠道</Button>}</>}>
        <dl className="supplier-test-details">
          <dt>测试结果</dt><dd><AdminStatus value={CHANNEL_TEST_STATUS[details.status] || '结果未知'}/></dd>
          {(details.evidenceSource || batch?.source) === 'mock' && <><dt>结果来源</dt><dd>模拟测试</dd></>}
          {details.upstreamStatus != null && <><dt>HTTP 状态</dt><dd>{details.upstreamStatus}</dd></>}
          {details.durationMs != null && <><dt>耗时</dt><dd>{details.durationMs} ms</dd></>}
          {details.stage && details.status !== 'passed' && <><dt>失败阶段</dt><dd>{({ queued: '排队', request: '请求上游', parse: '解析响应',
            poll: '等待任务完成', artifact: '检查结果文件' })[details.stage] || '未记录'}</dd></>}
          {details.message && <><dt>回执</dt><dd>{redactDiagnostic(details.message)}</dd></>}
          {details.suggestion && details.suggestion !== details.message && <><dt>处理建议</dt><dd>{redactDiagnostic(details.suggestion)}</dd></>}
          {details.retryAfter != null && <><dt>建议等待</dt><dd>{details.retryAfter} 秒</dd></>}
          {details.mappedStatus != null && <><dt>转换后状态码</dt><dd>{details.mappedStatus}</dd></>}
          {usageText && <><dt>用量</dt><dd>{usageText}</dd></>}
          {cost?.amount != null && <><dt>费用</dt><dd>{moneyDisplay(cost.amount)} {cost.currency}</dd></>}
          {activeJob?.batchId && <><dt>测试任务 ID</dt><dd><CopyId copyAtStart value={activeJob.batchId} label="测试任务 ID"/></dd></>}
          {details.upstreamRequestId && <><dt>上游请求 ID</dt><dd><CopyId copyAtStart value={details.upstreamRequestId} label="上游请求 ID"/></dd></>}
          {details.traceId && <><dt>追踪 ID</dt><dd><CopyId copyAtStart value={details.traceId} label="追踪 ID"/></dd></>}
          {details.taskId && <><dt>上游任务 ID</dt><dd><CopyId copyAtStart value={details.taskId} label="上游任务 ID"/></dd></>}
        </dl>
      </Modal>}
      </>}
    </SupplierCreationDialog>;
  }
  return <SupplierCreationDialog wide embedded={embedded} title={title} description={testOnly ? "测试当前已保存配置，不自动启用供给。" : "检测通过后，单独启用模型供给。"} cancel={close} cancelLabel={embedded ? '退出检测' : '关闭'} disabled={!ops.can || busy || running || unresolved || embedded && singleEnabled && (!rows.every(passed) || continueDisabled) || (!singleEnabled && ((firstEnable ? !rows.every(passed) : confirming ? Boolean(confirmationIssue) : !selectedReady) || provider.status !== '已启用'))} action={testOnly ? null : singleEnabled ? embedded ? continueLabel : null : firstEnable?'启用供给':confirming ? confirmation.restoring ? '确认启用渠道及所选' : '确认启用所选' : ['停用', '已停用'].includes(endpoint?.status) ? '启用渠道并启用所选' : '启用所选'} submit={singleEnabled && embedded ? onContinue : enable} footer={<>{confirming && <Button theme="light" onClick={() => { setConfirmation(null); setSelected([]); setError(''); }}>重新选择</Button>}{!embedded && <Button theme="light" disabled={!ops.can || busy || running || unresolved || confirming || !failedIds.length} onClick={() => planRetry(failedIds)}>重试未通过项</Button>}</>}>
    {navigation}
    <div className="supplier-onboarding-context"><strong>{provider.name}</strong><span>{endpoint?.name}</span><ChannelTestProgress batch={batch} running={busy || running}>通过 {rows.filter(passed).length} / {rows.length}</ChannelTestProgress>{!reference && <OnboardingScenarioControl disabled={busy || running || confirming}/>}</div>
    {viewingConnection && !reference && <Field label="当前生效地址"><CopyId copyAtStart value={endpoint?.baseUrl} label="上游 API 地址"/></Field>}
    {!ready && <Notice error>渠道缺少可用 API 密钥，请添加密钥后重新测试。</Notice>}
    <>
      {!reference && <div className="supplier-channel-fields"><Field label="验证内容"><Choice label="验证内容" value={check || 'basic'} options={checkOptions} disabled={!canPlan || !ops.can} onChange={value => { setCheck(value === 'basic' ? '' : value); setPlannedIds(null); setConsent(false); }}/></Field><div className="supplier-row-actions"><span>本次 {plannedModels.length} 个模型，预估费用未知</span>{plannedIds && !embedded && <Button theme="borderless" type="tertiary" disabled={!canPlan} onClick={() => planRetry(null)}>选择全部可测试模型</Button>}</div></div>}
      {mediaRecords.length>0 && <Disclosure title="高成本任务" defaultOpen={embedded}><div className="supplier-reference-options">{mediaRecords.map(row => <div key={row.associationId}><Checkbox aria-label={`测试高成本任务 ${row.upstreamModelId}`} checked={expensiveIds.includes(row.associationId)} disabled={!canPlan || !ops.can} onChange={event => { setExpensiveIds(current => event.target.checked ? [...current, row.associationId] : current.filter(id => id !== row.associationId)); setConsent(false); }}>{row.upstreamModelId}</Checkbox>{row.type === 'audio' && <Choice label={`${row.upstreamModelId} 语音测试任务`} value={audioProbes[row.associationId] || 'unselected'} options={[[ 'unselected', '选择语音任务' ], ['speech', '语音合成'], ['transcription', '语音识别']]} disabled={!canPlan || !expensiveIds.includes(row.associationId)} onChange={value => { setAudioProbes(current => ({ ...current, [row.associationId]: value })); setConsent(false); }}/>}</div>)}</div><p className="supplier-price-hint">图片、语音和视频须单独勾选；测试可能产生上游费用。</p></Disclosure>}
      {planError && <Notice error>{planError}</Notice>}
      {canPlan && <div className="supplier-row-actions">{!basicUsageButton && <Checkbox aria-label="确认执行模拟检测" checked={consent} disabled={!ops.can || !ready || !plannedModels.length} onChange={event => setConsent(event.target.checked)}>确认执行模拟检测</Checkbox>}<Button disabled={!ops.can || !ready || (!basicUsageButton && !consent) || !plannedModels.length || Boolean(planError)} onClick={async ()=>await start({explicitBasicClick:basicUsageButton})}>{basicUsageButton ? embedded && batch ? '重新模拟检测连接' : '模拟检测连接' : check ? '开始专项测试' : '开始任务测试'}</Button>{basicUsageButton && <span>用量和费用为模拟结果</span>}</div>}
      {unresolved && <div className="supplier-row-actions"><span>原提交结果待确认，尚未重新派发。</span><Button theme="light" disabled={busy} onClick={querySubmission}>查询原提交</Button>{notSubmitted && <Button theme="light" disabled={busy || !ops.can || !ready || stale} onClick={resumeOriginal}>继续原提交</Button>}</div>}
      {activeJob?.batchId && <div className="supplier-row-actions">{!embedded && <span>任务 <CopyId copyAtStart value={activeJob.batchId} label="检测任务 ID"/></span>}<Button theme="borderless" type="tertiary" disabled={busy} onClick={() => setPollRevision(value => value + 1)}>刷新进度</Button>{running && <Button theme="light" disabled={busy || !ops.can} onClick={cancelTask}>取消待执行测试</Button>}</div>}
      {stale && <Notice>此任务针对旧配置，结果仅保留在检查记录中。当前配置需要重新测试。</Notice>}
      {receiptFailed && <Notice error>后台结果已取得，本地检查记录未保存。<Button theme="borderless" type="tertiary" onClick={async () => { receiptAttempts.current.delete(batch.id); await receive(batch, activeJob); }}>重新保存检查记录</Button></Notice>}
    </>
    {directory && !embedded && batch?.items?.some(item => ['failed', 'unknown', 'cancelled'].includes(item.status)) &&
      <Checkbox checked={failureOnly} onChange={event => setFailureOnly(event.target.checked)}>仅显示未通过项</Checkbox>}
    <GridTable headings={[...(showSelection?['选择启用']:[]), ...(viewingConnection ? ['模型'] : []), '上游模型调用标识', ...(directory && !embedded && !reference ? ['测试端点'] : []), '验证结果', ...(directory && !embedded && !reference ? ['耗时 / 上游状态'] : []), ...(!reference ? ['启用状态'] : []), ...(!embedded && !reference ? ['采购价'] : []), '操作']}>
      {displayedRows.map(row => { const item = channelTestItem(batch, row.id);
        const interfaceIssue = channelInterfaceIssue(provider, row);
        const result = interfaceIssue ? '接口不匹配' : stale ? '配置已变化，待重测' : item ? CHANNEL_TEST_STATUS[item.status] || '结果未知' : passed(row) ? '通过' : '待测试';
        const explanation = interfaceIssue || (!stale && !item && !passed(row) ? row.health?.message : '');
        return <Row key={row.id}>{showSelection && <Cell><Checkbox aria-label={`选择启用 ${row.upstreamModelId}`} checked={selected.includes(row.id)} disabled={!ops.can || busy || running || unresolved || confirming || !passed(row) && !selected.includes(row.id)} onChange={event => { setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id)); setConfirmation(null); }}/></Cell>}{viewingConnection && <Cell>{records.find(record => record.associationId === row.id)?.modelName || row.modelId}</Cell>}<Cell><CopyId copyAtStart value={row.upstreamModelId} label="上游模型调用标识"/></Cell>{directory && !embedded && !reference && <Cell>{recordEndpoints.get(row.id) ? new URL(recordEndpoints.get(row.id)).pathname : '—'}</Cell>}<Cell><AdminStatus value={result}/>{explanation && <small>{explanation}</small>}{(item?.evidenceSource === 'mock' || item && batch?.source === 'mock' || !item && (row.health?.source === 'mock' || row.health?.simulated)) && <small>模拟检测</small>}{embedded && item && item.status !== 'passed' && <small className="onboarding-test-repair">{item.suggestion || item.message}</small>}</Cell>{directory && !embedded && !reference && <Cell>{item ? [item.durationMs == null ? null : item.durationMs + ' ms', item.upstreamStatus].filter(value => value != null).join(' · ') || '—' : '—'}</Cell>}{!reference && <Cell><AdminStatus value={row.enabled && ['运行中','需关注'].includes(endpoint.status) ? '已启用' : '未启用'}/></Cell>}{!embedded && !reference && <Cell><AdminStatus value={row.pricing?.scenarios?.length ? '已配置' : '待配置'}/></Cell>}<Cell><div className="supplier-row-actions">{!embedded && <Button theme="borderless" type="tertiary" disabled={!ops.can || !ready || busy || running || unresolved || confirming} onClick={() => planRetry([row.id])}>选择重测</Button>}{item && <Button theme="borderless" type="tertiary" onClick={() => setDetails(item)}>检查详情</Button>}</div></Cell></Row>; })}
    </GridTable>
    {confirming && <Notice>将启用渠道及所选 {confirmation.selections.length} 个模型。{confirmation.restoring && '未选模型保持停用。'}采购价待配置的模型暂不能用于正式服务。</Notice>}
    {confirming && confirmation.restoring && confirmation.serviceImpact.length > 0 && <div className="supplier-batch-confirmation"><p>可能恢复 {confirmation.serviceImpact.length} 项已发布服务：</p><ul>{confirmation.serviceImpact.map(service => <li key={service.id}><strong>{service.name}</strong> · <CopyId copyAtStart value={service.callId} label="模型调用标识"/> · 路由 v{service.routeVersion}</li>)}</ul></div>}
    {confirmationIssue && <Notice error>{confirmationIssue}</Notice>}
    {provider.status !== '已启用' && <Notice error>服务商已停用，请先启用服务商。</Notice>}
    {error && <Notice error>{error}</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
    {!embedded && !fromService && !viewingConnection && <Button theme="borderless" type="tertiary" onClick={() => { close(); ops.go({}, { base: 'listing-new', reset: true }); }}>前往模型服务</Button>}
    {details && <Modal title="检查详情" description={details.model.upstreamModelId} onClose={() => setDetails(null)} footer={<>{directory && !reference && onRemove && details && details.status === 'failed' && <Button theme="borderless" type="danger"
      disabled={!ops.can || !canPlan} onClick={() => onRemove(details.model.associationId)}>核对移除此模型渠道的影响</Button>}</>}><dl className="supplier-test-details"><dt>状态</dt><dd><AdminStatus value={CHANNEL_TEST_STATUS[details.status] || '结果未知'}/></dd><dt>请求阶段</dt><dd>{({ queued: '等待执行', request: '请求上游', parse: '响应解析', poll: '等待异步任务', artifact: '结果文件检查' })[details.stage] || '未记录'}</dd><dt>建议</dt><dd>{details.suggestion || (details.status === 'passed' ? '无需处理' : details.message || '请核对配置后重试')}</dd>{details.retryAfter != null && <><dt>建议等待</dt><dd>{details.retryAfter} 秒</dd></>}<dt>验证内容</dt><dd>{({ streaming: '流式响应', tools: '工具调用', structured: '结构化输出', text: '文本生成', multimodal: '图像理解', embedding: '向量', rerank: '重排', image: '图片生成', video: '视频生成', speech: '语音合成', transcription: '语音识别' })[details.model.check || details.model.probe || details.model.type] || '任务检查'}</dd><dt>上游状态</dt><dd>{details.upstreamStatus ?? '—'}</dd>{details.mappedStatus != null && <><dt>规则输出状态码</dt><dd>{details.mappedStatus}</dd></>}<dt>耗时</dt><dd>{details.durationMs == null ? '—' : `${details.durationMs} ms`}</dd><dt>用量</dt><dd>{showUsage(details.usage)}</dd><dt>费用</dt><dd>{showUsage(details.cost)}</dd>{details.upstreamRequestId && <><dt>上游请求 ID</dt><dd><CopyId copyAtStart value={details.upstreamRequestId} label="上游请求 ID"/></dd></>}<dt>追踪 ID</dt><dd><CopyId copyAtStart value={details.traceId} label="追踪 ID"/></dd>{details.taskId && <><dt>上游任务 ID</dt><dd><CopyId copyAtStart value={details.taskId} label="上游任务 ID"/></dd></>}{details.message && <><dt>检查结果</dt><dd>{details.message}</dd></>}</dl></Modal>}
  </SupplierCreationDialog>;
}

const directoryModes = [['http', 'HTTP 连通性探测'], ['model', '模型调用测试']];

function DirectoryTest({ title, ...props }) {
  const { state, endpointId, provider, ops } = props;
  const endpoint = state.endpoints.find(row => row.id === endpointId);
  const [mode, setMode] = useState('http');
  const [probe, setProbe] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const modeSelector = disabled => <>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <Typography.Text type="secondary">{provider.name} / {endpoint?.name}</Typography.Text>
      <Typography.Text type="secondary">模拟数据</Typography.Text>
    </div>
    <Field label="测试方式"><Choice label="测试方式" options={directoryModes} value={mode}
      disabled={disabled} onChange={setMode}/></Field>
  </>;
  const probing = probe === '正在探测…';
  const start = () => {
    if (timer.current || !ops.can) return;
    setProbe('正在探测…');
    timer.current = setTimeout(() => {
      const scenario = state.cloudMockState?.scenario;
      setProbe(scenario === 'timeout' ? '探测超时' : '已收到 HTTP 响应');
      timer.current = null;
    }, 350);
  };
  const httpProbe = mode === 'http' ? {
    running: probing,
    action: <Button theme="solid" disabled={!ops.can || !endpoint?.baseUrl || probing} onClick={start}>开始探测</Button>,
    content: <>
      <Field label="服务地址"><Typography.Text>{endpoint?.baseUrl || '—'}</Typography.Text></Field>
      {probe && <Typography.Text role="status">{probe}</Typography.Text>}
    </>,
  } : null;
  return <ModelCallTest {...props} title={title} reference={false} modeSelector={modeSelector} httpProbe={httpProbe}/>;
}

export default function SupplierChannelBatchTest(props) {
  if (props.directory && props.testOnly && !props.embedded) {
    return <DirectoryTest key={props.endpointId} {...props}/>;
  }
  return <ModelCallTest {...props}/>;
}
