import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { MODEL_IMPORT_FIELDS, MODEL_IMPORT_HEADERS, MODEL_IMPORT_LIMIT, downloadModelCsv, modelRowsFromCells, parseModelText, validateModelRows } from './model-import';
import { TASK_OPTIONS, INPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS } from './model-profile';

const cell = (row, label) => row.cells[MODEL_IMPORT_HEADERS.indexOf(label)] || '';
const typeTasks = [['文本', 'text'], ['多模态', 'multimodal'], ['视觉 · 图像', 'image'], ['视觉 · 视频', 'video'], ['语音', 'audio'], ['向量', 'embedding'], ['重排', 'rerank']];
function ImportHelp() {
  return <section className="mm-import-help" aria-labelledby="model-import-help-title">
    <h3 id="model-import-help-title">填写提示</h3>
    <dl className="mm-import-rules">
      <div><dt>必填信息</dt><dd>规范模型标识、模型名称、模型类型。视觉模型还需填写视觉任务类型：图像或视频。其他字段未知时留空，不用填写 0 或“不支持”。</dd></div>
      <div><dt>规范模型标识</dt><dd>以小写字母或数字开头，可使用 . _ : / -，最多 80 字符。已有标识不覆盖，同一批次不能重复。</dd></div>
      <div><dt>模板与字段</dt><dd>XLSX 模板将必填项排在最前：红色表头为必填，橙色表头为视觉模型必填，其余为选填。模板包含全部资料字段及“填写说明”工作表。可删除不需要的可选列或调整列顺序，请保留原表头；模板示例行请替换或删除。</dd></div>
      <div><dt>多选与能力</dt><dd>多项用“、”分隔。输入与输出模态：{INPUT_MODALITY_OPTIONS.join('、')}。结果类型：{RESULT_TYPE_OPTIONS.join('、')}。流式响应、工具调用等能力填写“支持”或“不支持”，留空表示未填写。</dd></div>
      <div><dt>日期与数值</dt><dd>日期用 YYYY-MM-DD；原厂发布日期、知识截止日期也可用 YYYY-MM。上下文窗口和最大输出使用 Token 正整数，参数规模使用 B；其他规格按表头单位填写，只填写适用于当前类型与任务的字段。</dd></div>
      <div><dt>参数与来源</dt><dd>支持参数填写参数名，如 temperature、max_tokens；默认参数为 JSON 对象，例如 {'{"temperature":0.7}'}，其中的参数名须已声明支持。版本状态：稳定版、预览版、已退役；资料状态：待核对、已核对。许可协议与架构使用资料表单中的选项名称或标识。模型 Logo、资料链接填写无凭据的 http / https 地址；批量导入不上传 Logo 图片。</dd></div>
    </dl>
    <div className="mm-import-task-guide"><h4>模型类型与支持任务</h4><dl>{typeTasks.map(([label, type]) => <div key={type}><dt>{label}</dt><dd>{TASK_OPTIONS[type].join('、')}</dd></div>)}</dl></div>
  </section>;
}

export default function ModelBatchImport({ state, can, run, close, dirty, mode = 'model' }) {
  const [step, setStep] = useState('input'), [rows, setRows] = useState([]), [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [skip, setSkip] = useState(false), [onlyProblems, setOnlyProblems] = useState(false);
  const [outcome, setOutcome] = useState(null), [expandedRow, setExpandedRow] = useState(null);
  const download = (name, values) => { try { downloadModelCsv(name, values); toast.success('已开始下载' + name.replace('.csv', '')); } catch { toast.error('下载失败，请重试'); } };
  const fileInput = useRef(null), request = useRef(0), previewTitle = useRef(null);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (step === 'preview') previewTitle.current?.focus(); }, [step]);
  const preview = useMemo(() => validateModelRows(state, rows, { catalogue: mode === 'template' }), [state, rows, mode]);
  const valid = preview.filter(row => row.status === 'ready'), invalid = preview.length - valid.length;
  const selected = preview.find(row => row.rowNumber === expandedRow);
  const readFile = async file => {
    if (!file || busy || !can) return;
    const current = ++request.current; setBusy(true); setError('');
    const progress = toast.loading('正在读取模型文件…');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('文件超过 10 MB，请拆分后导入');
      let parsed;
      if (/\.xlsx$/i.test(file.name)) { const { readSheet } = await import('read-excel-file/browser'); parsed = modelRowsFromCells(await readSheet(file)); }
      else if (/\.csv$/i.test(file.name)) parsed = parseModelText(await file.text());
      else throw new Error('请选择 .xlsx 或 UTF-8 .csv 文件，旧版 .xls 请另存为 .xlsx');
      if (current === request.current) {
        setRows(parsed); setFileName(file.name); setStep('preview'); setError(''); setSkip(false); setOnlyProblems(false); setExpandedRow(null); dirty(true);
        toast.success('文件已读取，请核对校验结果');
      }
    } catch (e) { if (current === request.current) { const message = e.message.includes('请') || e.message.includes('模型') ? e.message : '读取失败，请检查文件是否损坏并使用最新模板'; setError(message); toast.error(message); } }
    finally { toast.dismiss(progress); if (current === request.current) setBusy(false); }
  };
  const submit = async () => {
    if (busy || !can || !valid.length || invalid && !skip) return;
    setBusy(true); setError('');
    try {
      const next = await run('import', { models: valid.map(row => row.data) });
      if (next) { setOutcome({ imported: valid.length, skipped: invalid }); setStep('result'); dirty(false); }
    } catch (e) { setError(e.message); toast.error(e.message); }
    finally { setBusy(false); }
  };
  return <div className="mm-batch-import" aria-busy={busy}>
    <div className="mm-import-steps" aria-label="导入步骤">{[['input', '上传表格'], ['preview', '校验预览'], ['result', '导入结果']].map(([key, label]) => <span key={key} aria-current={step === key ? 'step' : undefined}>{label}</span>)}</div>
    {step === 'input' ? <>
      <div className="mm-import-tools"><p>每批最多 {MODEL_IMPORT_LIMIT} 条，仅新增模型资料；相同规范模型标识不覆盖。</p><Button variant="outline" asChild><a href={`${import.meta.env.BASE_URL}templates/model-material-import.xlsx`} download="模型资料导入模板.xlsx"><Download/>下载模板</a></Button></div>
      <div className="mm-import-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}><Upload aria-hidden="true"/><div><strong>上传模型资料表格</strong><p>选择文件或拖放到这里，读取后进入校验预览</p><p>支持 .xlsx、UTF-8 .csv，单个文件不超过 10 MB</p></div><Button variant="outline" disabled={busy || !can} onClick={() => fileInput.current.click()}>{busy ? '正在读取…' : '选择文件'}</Button><input ref={fileInput} hidden type="file" accept=".xlsx,.csv" aria-label="上传模型资料表格" onChange={event => { readFile(event.target.files[0]); event.target.value = ''; }}/></div>
      <ImportHelp/>
    </> : step === 'preview' ? <>
      <div className="mm-import-file"><FileSpreadsheet aria-hidden="true"/><strong ref={previewTitle} tabIndex={-1}>{fileName}</strong></div>
      <div className="mm-import-summary" role="status"><strong>共 {preview.length} 条</strong><span>可导入 {valid.length} 条</span><span className={invalid ? 'mm-warning-text' : ''}>问题 {invalid} 条</span></div>
      <div className="mm-import-tools"><label className="mm-checkbox-row"><Checkbox checked={onlyProblems} onCheckedChange={value => { setOnlyProblems(Boolean(value)); setExpandedRow(null); }}/>只看问题记录</label><Button variant="outline" onClick={() => download('模型资料导入校验清单.csv', [[...MODEL_IMPORT_HEADERS, '校验结果'], ...preview.map(row => [...row.cells, row.message])])}><Download/>下载校验清单</Button></div>
      <div className="mm-import-scroll" role="region" aria-label="模型资料校验表格" tabIndex={0}><Table className="mm-table mm-import-table"><TableHeader><TableRow>{['文件行', '模型名称 / 规范模型标识', '模型类型 / 任务', '作者 / 原厂发布日期', '输入 → 输出 / 结果', '校验结果'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{preview.filter(row => !onlyProblems || row.status === 'error').map(row => <TableRow key={row.rowNumber}><TableCell>{row.rowNumber}</TableCell><TableCell>{cell(row, '模型名称') || '未填写'}<small><code>{cell(row, '规范模型标识') || '—'}</code></small><Button variant="link" aria-expanded={expandedRow === row.rowNumber} aria-controls="model-import-row-detail" onClick={() => setExpandedRow(expandedRow === row.rowNumber ? null : row.rowNumber)}>查看第 {row.rowNumber} 行资料</Button></TableCell><TableCell>{[cell(row, '模型类型'), cell(row, '视觉任务类型')].filter(Boolean).join(' · ') || '—'}<small>{cell(row, '支持任务') || '—'}</small></TableCell><TableCell>{cell(row, '模型作者') || '—'}<small>{cell(row, '原厂发布日期') || '—'}</small></TableCell><TableCell>{cell(row, '输入模态') || '—'}<small>→ {[cell(row, '输出模态'), cell(row, '结果类型')].filter(Boolean).join('、') || '—'}</small></TableCell><TableCell><span className={row.status === 'error' ? 'mm-warning-text' : 'mm-import-ready'}>{row.message}</span></TableCell></TableRow>)}</TableBody></Table>{onlyProblems && !invalid && <div className="mm-empty">全部记录通过校验</div>}</div>
      {selected && <section id="model-import-row-detail" className="mm-import-detail"><div className="mm-import-tools"><h3>第 {selected.rowNumber} 行 · {cell(selected, '模型名称') || '未填写名称'}</h3><Button variant="outline" onClick={() => setExpandedRow(null)}>收起资料</Button></div><dl>{MODEL_IMPORT_FIELDS.filter(field => cell(selected, field.header)).map(field => <div key={field.header}><dt>{field.header}</dt><dd>{cell(selected, field.header)}</dd></div>)}</dl></section>}
      {invalid > 0 && valid.length > 0 && <label className="mm-checkbox-row"><Checkbox checked={skip} onCheckedChange={value => setSkip(Boolean(value))}/>跳过 {invalid} 条问题记录，仅导入 {valid.length} 条有效记录</label>}
    </> : <div className="mm-import-result" role="status"><CheckCircle2/><h3>导入完成</h3><p>已新增 {outcome.imported} 个模型资料{outcome.skipped ? `，跳过 ${outcome.skipped} 条问题记录` : ''}。</p><p>{mode === 'template' ? '可在模型资料中查看和维护。' : '模型已保存为已下架，可继续接入供应商、设置售价和上架。'}</p></div>}
    {error && <p className="mm-warning-text" role="alert">{error}</p>}
    <footer className="mm-import-footer"><span>{mode === 'template' ? '仅创建模型资料，不添加供应关系或模型服务。' : '导入后为已下架，配置完整后再上架。'}</span><div>{step === 'result' ? <Button className="mm-primary" onClick={() => close(true)}>完成</Button> : <><Button variant="outline" disabled={busy} onClick={() => step === 'preview' ? setStep('input') : close()}>{step === 'preview' ? '重新上传' : '取消'}</Button>{step === 'preview' && <Button className="mm-primary" disabled={busy || !can || !valid.length || invalid > 0 && !skip} onClick={submit}>{busy ? '正在导入…' : `确认导入 ${valid.length} 条`}</Button>}</>}</div></footer>
  </div>;
}
