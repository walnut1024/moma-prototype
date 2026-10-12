import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';
import { Download, Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { MODEL_IMPORT_HEADERS, MODEL_IMPORT_LIMIT, MODEL_IMPORT_TEMPLATE, downloadModelCsv, modelCsv, modelRowsFromCells, parseModelText, validateModelRows } from './model-import';

export default function ModelBatchImport({ state, can, run, close, dirty, mode = "model" }) {
  const [step, setStep] = useState('input'), [text, setText] = useState(''), [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [skip, setSkip] = useState(false), [onlyProblems, setOnlyProblems] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const download = (name, rows) => { try { downloadModelCsv(name, rows); toast.success('已开始下载' + name.replace('.csv', '')); } catch { toast.error('下载失败，请重试'); } };
  const fileInput = useRef(null), request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const preview = validateModelRows(state, rows), valid = preview.filter(row => row.status === 'ready'), invalid = preview.length - valid.length;
  const useRows = values => { setRows(values); setText(modelCsv([MODEL_IMPORT_HEADERS, ...values.map(row => row.cells)])); setStep('preview'); setError(''); setSkip(false); setOnlyProblems(false); dirty(true); };
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
      if (current === request.current) { useRows(parsed); toast.success('文件已读取，请核对校验结果'); }
    } catch (e) { if (current === request.current) { const message = e.message.includes('请') || e.message.includes('模型') ? e.message : '读取失败，请检查文件是否损坏并使用最新模板'; setError(message); toast.error(message); } }
    finally { toast.dismiss(progress); if (current === request.current) setBusy(false); }
  };
  const submit = () => {
    if (busy || !can || !valid.length || invalid && !skip) return;
    setBusy(true);
    const next = run('import', { models: valid.map(row => row.data) });
    if (next) { setOutcome({ imported: valid.length, skipped: invalid }); setStep('result'); dirty(false); }
    setBusy(false);
  };
  return <div className="mm-batch-import">
    <div className="mm-import-steps" aria-label="导入步骤">{[['input', '上传或粘贴'], ['preview', '校验预览'], ['result', '导入结果']].map(([key, label]) => <span key={key} aria-current={step === key ? 'step' : undefined}>{label}</span>)}</div>
    {step === 'input' ? <>
      <div className="mm-import-tools"><p>每批最多 {MODEL_IMPORT_LIMIT} 条，仅新增模型；相同 Model ID 不覆盖。</p><Button variant="outline" onClick={() => download('模型导入模板.csv', MODEL_IMPORT_TEMPLATE)}><Download/>下载模板</Button></div>
      <div className="mm-import-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}><Upload aria-hidden="true"/><div><strong>上传模型表格，或拖放文件到这里</strong><p>支持 .xlsx、UTF-8 .csv，文件不超过 10 MB</p></div><Button variant="outline" disabled={busy || !can} onClick={() => fileInput.current.click()}>{busy ? '正在读取…' : '选择文件'}</Button><input ref={fileInput} hidden type="file" accept=".xlsx,.csv" aria-label="上传模型文件" onChange={event => { readFile(event.target.files[0]); event.target.value = ''; }}/></div>
      <label className="mm-field"><span>或从 Excel 粘贴（包含模板表头）</span><Textarea aria-label="粘贴模型信息" rows={7} disabled={busy || !can} value={text} placeholder={MODEL_IMPORT_HEADERS.join('\t')} onChange={event => { setText(event.target.value); setError(''); dirty(Boolean(event.target.value)); }}/></label>
      <details className="mm-import-help"><summary>填写规则与可选值</summary><p>必填：模型ID、模型展示名称、模型类型、支持任务、输入模态、简短介绍；输出模态和结果类型至少填写一项。模型ID使用小写字母、数字或 . _ : / -，最多80字符。</p><p>类型：语言模型、视觉模型、语音模型、向量模型、重排模型。视觉任务使用文生图、图像编辑、文生视频、图生视频、图像理解或视频理解等标准名称。语音任务使用语音合成、语音识别、语音翻译或实时语音对话。</p><p>输入和输出模态：文本、图片、音频、视频。结果类型：生成文本、结构化数据、向量、相关性分数、排序结果。任务与模态多项用“、”分隔。未知规格留空，填写的上下文与最大输出使用 Token 单位。</p><p>导入基础信息后，可在模型详情补充任务规格、版本和资料记录。</p></details>
    </> : step === 'preview' ? <>
      <div className="mm-import-summary" role="status"><strong>共 {preview.length} 条</strong><span>可导入 {valid.length} 条</span><span className={invalid ? 'mm-warning-text' : ''}>问题 {invalid} 条</span></div>
      <div className="mm-import-tools"><label className="mm-checkbox-row"><Checkbox checked={onlyProblems} onCheckedChange={value => setOnlyProblems(Boolean(value))}/>只看问题记录</label><Button variant="outline" onClick={() => download('模型导入校验清单.csv', [[...MODEL_IMPORT_HEADERS, '校验结果'], ...preview.map(row => [...Array.from({ length: MODEL_IMPORT_HEADERS.length }, (_, index) => row.cells[index] || ''), row.message])])}><Download/>下载校验清单</Button></div>
      <div className="mm-import-scroll"><Table className="mm-table mm-import-table"><TableHeader><TableRow>{['文件行', '模型ID / 展示名称', '模型类型 / 任务', '输入 → 输出', '上下文 / 最大输出', '校验结果'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{preview.filter(row => !onlyProblems || row.status === 'error').map(row => <TableRow key={row.rowNumber}><TableCell>{row.rowNumber}</TableCell><TableCell><code>{row.cells[0] || '—'}</code><small>{row.cells[1] || '未填写'}</small></TableCell><TableCell>{row.cells[2] || '—'}<small>{row.cells[3] || '—'}</small></TableCell><TableCell>{row.cells[4] || '—'}<small>→ {[row.cells[5], row.cells[6]].filter(Boolean).join('、') || '—'}</small></TableCell><TableCell>{row.cells[7] ? row.cells[7] + ' Token' : '—'}<small>{row.cells[8] ? row.cells[8] + ' Token' : '—'}</small></TableCell><TableCell><span className={row.status === 'error' ? 'mm-warning-text' : 'mm-import-ready'}>{row.message}</span></TableCell></TableRow>)}</TableBody></Table>{onlyProblems && !invalid && <div className="mm-empty">全部记录通过校验</div>}</div>
      {invalid > 0 && <label className="mm-checkbox-row"><Checkbox checked={skip} onCheckedChange={value => setSkip(Boolean(value))}/>跳过 {invalid} 条问题记录，仅导入 {valid.length} 条有效记录</label>}
    </> : <div className="mm-import-result" role="status"><CheckCircle2/><h3>导入完成</h3><p>已新增 {outcome.imported} 个模型{outcome.skipped ? `，跳过 ${outcome.skipped} 条问题记录` : ''}。</p><p>{mode === "template" ? "模板已保存，可在添加模型时选择。" : "模型已保存为已下架，可继续接入供应商、设置售价和上架。"}</p></div>}
    {error && <p className="mm-warning-text" role="alert">{error}</p>}
    <footer className="mm-import-footer"><span>{mode === "template" ? "仅创建模型资料，不添加经营模型。" : "导入后为已下架，配置完整后再上架。"}</span><div>{step === 'result' ? <Button className="mm-primary" onClick={() => close(true)}>完成</Button> : <><Button variant="outline" disabled={busy} onClick={() => step === 'preview' ? setStep('input') : close()}>{step === 'preview' ? '返回修改' : '取消'}</Button><Button className="mm-primary" disabled={busy || !can || (step === 'input' ? !text.trim() : !valid.length || invalid > 0 && !skip)} onClick={step === 'input' ? () => { try { useRows(parseModelText(text)); } catch (e) { setError(e.message); toast.error(e.message); } } : submit}>{step === 'input' ? '校验预览' : `确认导入 ${valid.length} 条`}</Button></>}</div></footer>
  </div>;
}
