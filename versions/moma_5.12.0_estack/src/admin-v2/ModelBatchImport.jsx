import Table from './AdminTable';
import { Banner, Button, Checkbox, Descriptions, Space, Steps, Toast, Typography, Upload } from '@douyinfe/semi-ui';
import { useEffect, useRef, useState } from 'react';
import { IconDownload, IconUpload } from '@douyinfe/semi-icons';
import { IMPORT_REPORT_HEADERS, MODEL_IMPORT_LIMIT, downloadModelCsv } from './model-import';
import { parseDelimitedCells } from '../tabular-import.mjs';
import { materialImportHeaders, materialImportRows, previewMaterialRows, submitMaterialRows } from './material-batch-import';
import { TASK_OPTIONS, INPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS } from './model-profile';

const typeTasks = [['文本', 'text'], ['多模态', 'multimodal'], ['视觉 · 图像', 'image'], ['视觉 · 视频', 'video'], ['语音', 'audio'], ['向量', 'embedding'], ['重排', 'rerank']];
function ImportHelp() {
  return <section className="materials-import-help" aria-labelledby="model-import-help-title">
    <Typography.Title heading={5} component="h3" id="model-import-help-title">填写提示</Typography.Title>
    <dl className="materials-import-rules">
      <div><dt>必填信息</dt><dd>规范模型标识、模型展示名、模型类型。视觉模型还需填写视觉任务类型：图像或视频。其他字段未知时留空，不用填写 0 或“不支持”。</dd></div>
      <div><dt>规范模型标识</dt><dd>以小写字母或数字开头，可使用 . _ : / -，最多 80 字符。已有标识不覆盖，同一批次不能重复。</dd></div>
      <div><dt>模板与字段</dt><dd>XLSX 模板将必填项排在最前：红色表头为必填，橙色表头为视觉模型必填，其余为选填。模板包含全部资料字段及“填写说明”工作表。可删除不需要的可选列或调整列顺序，请保留原表头；模板示例行请替换或删除。</dd></div>
      <div><dt>多选与能力</dt><dd>多项用“、”分隔。输入与输出模态：{INPUT_MODALITY_OPTIONS.join('、')}。结果类型：{RESULT_TYPE_OPTIONS.join('、')}。流式响应、工具调用等能力填写“支持”或“不支持”，留空表示未填写。</dd></div>
      <div><dt>日期与数值</dt><dd>日期用 YYYY-MM-DD；原厂发布日期、知识截止日期也可用 YYYY-MM。上下文窗口和最大输出使用 Token 正整数，参数规模使用 B；其他规格按表头单位填写，只填写适用于当前类型与任务的字段。</dd></div>
      <div><dt>参数与来源</dt><dd>支持参数填写参数名，如 temperature、max_tokens；默认参数为 JSON 对象，例如 {'{"temperature":0.7}'}，其中的参数名须已声明支持。版本状态：稳定版、预览版、已退役；资料状态：待核对、已核对。许可协议与架构使用资料表单中的选项名称或标识。模型 Logo、资料链接填写无凭据的 http / https 地址；批量导入不上传 Logo 图片。</dd></div>
    </dl>
    <div className="materials-import-tasks"><Typography.Title heading={6} component="h4">模型类型与支持任务</Typography.Title><dl>{typeTasks.map(([label, type]) => <div key={type}><dt>{label}</dt><dd>{TASK_OPTIONS[type].join('、')}</dd></div>)}</dl></div>
  </section>;
}

const importNames = { model: '模型资料', provider: '服务商资料', relation: '供应关系' };
const summaryHeaders = { model: ['模型名称', '规范模型标识', '模型类型'], provider: ['服务商名称', '服务商编码', '供给类型'], relation: materialImportHeaders.relation };
const ready = row => row.status === 'ready';
const issue = row => row.status === 'error' || row.status === 'failed';
const count = (rows, status) => rows.filter(row => row.status === status).length;

export default function ModelBatchImport({ state, ops, transact, close, kind, providerId }) {
  const [step, setStep] = useState('input'), [preview, setPreview] = useState([]), [fileName, setFileName] = useState('');
  const [results, setResults] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [skip, setSkip] = useState(false), [onlyProblems, setOnlyProblems] = useState(false), [expandedRow, setExpandedRow] = useState(null);
  const [pagination, setPagination] = useState({ currentPage: 1, pageSize: 20 });
  const mounted = useRef(false), previewTitle = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { if (step !== 'input') previewTitle.current?.focus(); }, [step]);

  const label = importNames[kind], headers = materialImportHeaders[kind];
  const provider = providerId && state.providers.find(row => row.id === providerId);
  const display = preview.map(row => {
    const outcome = results[row.rowNumber];
    return outcome ? { ...row, ...outcome } : row;
  });
  const available = display.filter(ready), problems = display.filter(issue), failed = display.filter(row => row.status === 'failed');
  const visible = onlyProblems ? problems : display;
  const selected = display.find(row => row.rowNumber === expandedRow);
  const { pageSize } = pagination;
  const currentPage = Math.min(pagination.currentPage, Math.ceil(visible.length / pageSize) || 1);
  const download = (name, values) => {
    try { downloadModelCsv(name, values); Toast.success('已开始下载' + name.replace('.csv', '')); }
    catch { Toast.error('下载失败，请重试'); }
  };
  const reportRows = rows => [[...headers, ...IMPORT_REPORT_HEADERS], ...rows.map(row => [...row.cells, row.rowNumber, row.message])];
  const readFile = async file => {
    if (!file || busy || !ops.can) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw Error('文件超过 10 MB，请拆分后导入');
      let cells;
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        cells = await readSheet(file);
      } else if (/\.csv$/i.test(file.name)) cells = parseDelimitedCells(await file.text());
      else throw Error('请选择 XLSX 或 UTF-8 CSV 文件');
      const rows = previewMaterialRows(state, kind, materialImportRows(kind, cells), { providerId });
      if (!mounted.current) return;
      setPreview(rows);
      setResults({});
      setFileName(file.name);
      setStep('preview');
      setSkip(false);
      setOnlyProblems(false);
      setExpandedRow(null);
      setPagination(value => ({ ...value, currentPage: 1 }));
      ops.dirty(true);
    } catch (issue) {
      if (mounted.current) setError(issue.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const accept = rows => setResults(previous => {
    const next = { ...previous };
    for (const row of rows) next[row.rowNumber] = { ...row, masterCreated: row.masterCreated || previous[row.rowNumber]?.masterCreated };
    return next;
  });
  const submit = async (selectedRows, retry = false) => {
    if (busy || !ops.can || !selectedRows.length) return;
    setBusy(true);
    setError('');
    try {
      const checked = retry ? previewMaterialRows(state, kind, selectedRows, { providerId, retry: true }) : selectedRows;
      const rows = checked.filter(ready);
      const selectedNumbers = new Set(selectedRows.map(row => row.rowNumber));
      let pending = checked.some(issue) || problems.some(row => !selectedNumbers.has(row.rowNumber));
      accept(checked.filter(row => !ready(row)).map(({ rowNumber, status, message }) => ({ rowNumber, status, message })));
      await submitMaterialRows({ state, kind, providerId, rows, transact, active: () => mounted.current, onResult: outcome => {
        pending ||= outcome.some(issue);
        accept(outcome);
      } });
      if (mounted.current) { setStep('result'); ops.dirty(pending); }
    } catch (issue) {
      if (mounted.current) setError(issue.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const columns = [
    { title: '文件行', dataIndex: 'rowNumber', width: 85 },
    ...summaryHeaders[kind].map(title => ({ title: title === '模型名称' ? '模型展示名' : title, width: 180, render: (_, row) => row.cells[headers.indexOf(title)] || '—' })),
    { title: step === 'result' ? '处理结果' : '校验结果', width: 310, render: (_, row) => <Typography.Text type={issue(row) ? 'danger' : row.status === 'skip' ? 'tertiary' : 'success'}>
      {row.masterCreated && providerId ? '主档已新增 · ' : row.modelId && providerId && row.status === 'done' ? '复用已有模型 · ' : ''}{row.message}
    </Typography.Text> },
    { title: '操作', width: 170, render: (_, row) => <Space>
      <Button theme="borderless" aria-label={'查看第 ' + row.rowNumber + ' 行资料'} onClick={() => setExpandedRow(expandedRow === row.rowNumber ? null : row.rowNumber)}>查看</Button>
      {row.status === 'failed' && <Button theme="borderless" aria-label={'重试第 ' + row.rowNumber + ' 行'} disabled={busy || !ops.can} onClick={() => submit([row], true)}>重试</Button>}
    </Space> },
  ];
  const startOver = () => { setStep('input'); setError(''); setPreview([]); setResults({}); ops.dirty(false); };
  return <div className="materials-import" aria-busy={busy}>
    <Steps type="basic" current={['input', 'preview', 'result'].indexOf(step)}><Steps.Step title="上传表格"/><Steps.Step title="校验预览"/><Steps.Step title="导入结果"/></Steps>
    {provider && <Typography.Text strong>服务商 {provider.name}</Typography.Text>}
    {(ops.conflict || failed.some(row => row.message.includes('提交结果待确认'))) && <Banner type="warning" description={
      <>请核对最新数据后重试。<Button theme="borderless" disabled={busy} onClick={ops.reload}>载入最新数据</Button></>}/>}
    {step === 'input' ? <>
      <div className="materials-actions">
        <Typography.Text type="secondary">每份最多 {MODEL_IMPORT_LIMIT} 条</Typography.Text>
        {kind === 'model'
          ? <Typography.Text link={{ href: import.meta.env.BASE_URL + 'templates/model-material-import.xlsx', download: '模型资料导入模板.xlsx' }}
              icon={<IconDownload aria-hidden="true"/>}>下载模板</Typography.Text>
          : <Button theme="borderless" icon={<IconDownload aria-hidden="true"/>} onClick={() => download(label + '导入模板.csv', [headers])}>下载模板</Button>}
      </div>
      <Upload accept=".xlsx,.csv" uploadTrigger="custom" fileList={[]} showUploadList={false} draggable dragIcon={<IconUpload aria-hidden="true"/>}
        dragMainText={'点击上传' + label + '表格或拖拽文件到这里'} dragSubText="支持 XLSX、UTF-8 CSV，单个文件不超过 10 MB"
        disabled={busy || !ops.can} onFileChange={files => readFile(files[0])}/>
      {kind === 'model' ? <ImportHelp/> : <Typography.Paragraph>{kind === 'provider'
        ? '填写服务商名称、服务商编码和供给类型。供给类型填写「自有推理服务」或「第三方推理服务」。其余字段选填。'
        : '每行填写已有服务商编码和规范模型标识，确认后登记一条供给关系。'}</Typography.Paragraph>}
    </> : <>
      <Typography.Title heading={6}><span ref={previewTitle} tabIndex={-1}>{fileName}</span></Typography.Title>
      <Banner type={problems.length ? 'warning' : 'success'} description={step === 'preview'
        ? `共 ${display.length} 条，可提交 ${available.length} 条，已存在或重复 ${count(display, 'skip')} 条，待修正 ${problems.length} 条`
        : `${providerId || kind === 'relation' ? '新增关联' : '新增资料'} ${count(display, 'done')} 条，已存在或重复 ${count(display, 'skip')} 条，待修正 ${count(display, 'error')} 条，待重试 ${failed.length} 条`}/>
      <div className="materials-actions">
        <Checkbox checked={onlyProblems} onChange={event => {
          setOnlyProblems(event.target.checked); setExpandedRow(null); setPagination(value => ({ ...value, currentPage: 1 }));
        }}>只看问题记录</Checkbox>
        <Space wrap>
          <Button icon={<IconDownload aria-hidden="true"/>} onClick={() => download(label + '导入校验清单.csv', reportRows(display))}>下载校验清单</Button>
          {problems.length > 0 && <Button icon={<IconDownload aria-hidden="true"/>} onClick={() => download(label + '问题行.csv', reportRows(problems))}>下载问题行</Button>}
        </Space>
      </div>
      <Table rowKey="rowNumber" columns={columns} dataSource={visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
        scroll={{ x: kind === 'relation' ? 925 : 1105 }} empty="暂无问题记录"
        pagination={{ pageSize, currentPage, total: visible.length, showSizeChanger: true, pageSizeOpts: [20, 50, 100], showTotal: true }}
        onChange={({ pagination }) => setPagination({ currentPage: pagination.currentPage, pageSize: pagination.pageSize })}/>
      {selected && <>
        <div className="materials-actions"><Typography.Title heading={6}>第 {selected.rowNumber} 行资料</Typography.Title>
          <Button onClick={() => setExpandedRow(null)}>收起资料</Button></div>
        <Descriptions align="left" data={headers.map((key, i) => ({ key, value: selected.cells[i] })).filter(field => field.value)}/>
      </>}
      {step === 'preview' && problems.length > 0 && available.length > 0 && <Checkbox disabled={busy} checked={skip}
        onChange={event => setSkip(event.target.checked)}>跳过 {problems.length} 条问题记录，仅提交 {available.length} 条有效记录</Checkbox>}
    </>}
    {error && <Banner type="danger" description={error}/>}
    <div className="materials-actions"><Space wrap>
      {step === 'input' ? <Button disabled={busy} onClick={() => close(false)}>取消</Button> : <>
        <Button disabled={busy} onClick={startOver}>重新上传</Button>
        {step === 'result'
          ? <><Button disabled={busy} onClick={() => close(true)}>完成</Button>{failed.length > 1 && <Button disabled={busy || !ops.can} onClick={() => submit(failed, true)}>重试失败行</Button>}</>
          : <Button theme="solid" loading={busy} disabled={busy || !ops.can || !available.length || problems.length > 0 && !skip}
              onClick={() => submit(available)}>确认导入 {available.length} 条</Button>}
      </>}
    </Space></div>
  </div>;
}
