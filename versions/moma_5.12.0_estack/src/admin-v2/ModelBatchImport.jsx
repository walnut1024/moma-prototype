import { Banner, Button, Checkbox, Descriptions, Space, Steps, Table, Toast, Typography, Upload } from '@douyinfe/semi-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconDownload, IconUpload } from '@douyinfe/semi-icons';
import { MODEL_IMPORT_FIELDS, MODEL_IMPORT_HEADERS, MODEL_IMPORT_LIMIT, downloadModelCsv, modelRowsFromCells, parseModelText, validateModelRows } from './model-import';
import { TASK_OPTIONS, INPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS } from './model-profile';

const cell = (row, label) => row.cells[MODEL_IMPORT_HEADERS.indexOf(label)] || '';
const typeTasks = [['文本', 'text'], ['多模态', 'multimodal'], ['视觉 · 图像', 'image'], ['视觉 · 视频', 'video'], ['语音', 'audio'], ['向量', 'embedding'], ['重排', 'rerank']];
function ImportHelp() {
  return <section className="materials-import-help" aria-labelledby="model-import-help-title">
    <h3 id="model-import-help-title">填写提示</h3>
    <dl className="materials-import-rules">
      <div><dt>必填信息</dt><dd>规范模型标识、模型展示名、模型类型。视觉模型还需填写视觉任务类型：图像或视频。其他字段未知时留空，不用填写 0 或“不支持”。</dd></div>
      <div><dt>规范模型标识</dt><dd>以小写字母或数字开头，可使用 . _ : / -，最多 80 字符。已有标识不覆盖，同一批次不能重复。</dd></div>
      <div><dt>模板与字段</dt><dd>XLSX 模板将必填项排在最前：红色表头为必填，橙色表头为视觉模型必填，其余为选填。模板包含全部资料字段及“填写说明”工作表。可删除不需要的可选列或调整列顺序，请保留原表头；模板示例行请替换或删除。</dd></div>
      <div><dt>多选与能力</dt><dd>多项用“、”分隔。输入与输出模态：{INPUT_MODALITY_OPTIONS.join('、')}。结果类型：{RESULT_TYPE_OPTIONS.join('、')}。流式响应、工具调用等能力填写“支持”或“不支持”，留空表示未填写。</dd></div>
      <div><dt>日期与数值</dt><dd>日期用 YYYY-MM-DD；原厂发布日期、知识截止日期也可用 YYYY-MM。上下文窗口和最大输出使用 Token 正整数，参数规模使用 B；其他规格按表头单位填写，只填写适用于当前类型与任务的字段。</dd></div>
      <div><dt>参数与来源</dt><dd>支持参数填写参数名，如 temperature、max_tokens；默认参数为 JSON 对象，例如 {'{"temperature":0.7}'}，其中的参数名须已声明支持。版本状态：稳定版、预览版、已退役；资料状态：待核对、已核对。许可协议与架构使用资料表单中的选项名称或标识。模型 Logo、资料链接填写无凭据的 http / https 地址；批量导入不上传 Logo 图片。</dd></div>
    </dl>
    <div className="materials-import-tasks"><h4>模型类型与支持任务</h4><dl>{typeTasks.map(([label, type]) => <div key={type}><dt>{label}</dt><dd>{TASK_OPTIONS[type].join('、')}</dd></div>)}</dl></div>
  </section>;
}

export default function ModelBatchImport({ state, can, run, close, dirty, mode = 'model' }) {
  const [step, setStep] = useState('input'), [rows, setRows] = useState([]), [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [skip, setSkip] = useState(false), [onlyProblems, setOnlyProblems] = useState(false);
  const [outcome, setOutcome] = useState(null), [expandedRow, setExpandedRow] = useState(null);
  const download = (name, values) => { try { downloadModelCsv(name, values); Toast.success('已开始下载' + name.replace('.csv', '')); } catch { Toast.error('下载失败，请重试'); } };
  const request = useRef(0), previewTitle = useRef(null);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (step === 'preview') previewTitle.current?.focus(); }, [step]);
  const preview = useMemo(() => validateModelRows(state, rows, { catalogue: mode === 'template' }), [state, rows, mode]);
  const valid = preview.filter(row => row.status === 'ready'), invalid = preview.length - valid.length;
  const selected = preview.find(row => row.rowNumber === expandedRow);
  const [pagination,setPagination]=useState({currentPage:1,pageSize:20});
  const readFile = async file => {
    if (!file || busy || !can) return;
    const current = ++request.current; setBusy(true); setError('');
    const progress = Toast.info({content:'正在读取模型文件…',duration:0});
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('文件超过 10 MB，请拆分后导入');
      let parsed;
      if (/\.xlsx$/i.test(file.name)) { const { readSheet } = await import('read-excel-file/browser'); parsed = modelRowsFromCells(await readSheet(file)); }
      else if (/\.csv$/i.test(file.name)) parsed = parseModelText(await file.text());
      else throw new Error('请选择 .xlsx 或 UTF-8 .csv 文件，旧版 .xls 请另存为 .xlsx');
      if (current === request.current) {
        setRows(parsed); setFileName(file.name); setStep('preview'); setError(''); setSkip(false); setOnlyProblems(false); setExpandedRow(null); dirty(true);
        Toast.success('文件已读取，请核对校验结果');
      }
    } catch (e) { if (current === request.current) { const message = e.message.includes('请') || e.message.includes('模型') ? e.message : '读取失败，请检查文件是否损坏并使用最新模板'; setError(message); Toast.error(message); } }
    finally { Toast.close(progress); if (current === request.current) setBusy(false); }
  };
  const submit = async () => {
    if (busy || !can || !valid.length || invalid && !skip) return;
    setBusy(true); setError('');
    try {
      const next = await run('import', { models: valid.map(row => row.data) });
      if (next) { setOutcome({ imported: valid.length, skipped: invalid }); setStep('result'); dirty(false); }
    } catch (e) { setError(e.message); Toast.error(e.message); }
    finally { setBusy(false); }
  };
  const visibleRows = onlyProblems ? preview.filter(row => row.status === 'error') : preview;
  const { pageSize } = pagination;
  const currentPage = Math.min(pagination.currentPage, Math.ceil(visibleRows.length / pageSize) || 1);
  const previewColumns = [
    {title:'文件行',dataIndex:'rowNumber',width:85},
    {title:'模型展示名 / 规范模型标识',width:260,render:(_,row)=><Space vertical align="start"><Typography.Text strong>{cell(row,'模型展示名') || '未填写'}</Typography.Text><Typography.Text type="tertiary">{cell(row,'规范模型标识') || '—'}</Typography.Text><Button theme="borderless" onClick={()=>setExpandedRow(expandedRow===row.rowNumber?null:row.rowNumber)}>查看第 {row.rowNumber} 行资料</Button></Space>},
    {title:'模型类型 / 任务',width:180,render:(_,row)=><Space vertical align="start"><Typography.Text>{[cell(row,'模型类型'),cell(row,'视觉任务类型')].filter(Boolean).join(' · ') || '—'}</Typography.Text><Typography.Text type="tertiary">{cell(row,'支持任务') || '—'}</Typography.Text></Space>},
    {title:'作者 / 原厂发布日期',width:160,render:(_,row)=><Space vertical align="start"><Typography.Text>{cell(row,'模型作者') || '—'}</Typography.Text><Typography.Text type="tertiary">{cell(row,'原厂发布日期') || '—'}</Typography.Text></Space>},
    {title:'输入 → 输出 / 结果',width:180,render:(_,row)=>[cell(row,'输入模态') || '—','→',cell(row,'输出模态') || '—',cell(row,'结果类型')].filter(Boolean).join(' ')},
    {title:'校验结果',width:260,render:(_,row)=><Typography.Text type={row.status==='error'?'danger':'success'}>{row.message}</Typography.Text>},
  ];
  return <div className="materials-import" aria-busy={busy}>
    <Steps type="basic" current={['input','preview','result'].indexOf(step)}><Steps.Step title="上传表格"/><Steps.Step title="校验预览"/><Steps.Step title="导入结果"/></Steps>
    {step==='input'?<>
      <div className="materials-actions"><Typography.Text type="secondary">每批最多 {MODEL_IMPORT_LIMIT} 条，仅新增模型资料；相同规范模型标识不覆盖。</Typography.Text><Button tag="a" href={import.meta.env.BASE_URL+'templates/model-material-import.xlsx'} download="模型资料导入模板.xlsx" icon={<IconDownload aria-hidden/>}>下载模板</Button></div>
      <Upload accept=".xlsx,.csv" uploadTrigger="custom" fileList={[]} showUploadList={false} draggable dragIcon={<IconUpload aria-hidden/>} dragMainText="点击上传模型资料表格或拖拽文件到这里" dragSubText="支持 XLSX、UTF-8 CSV，单个文件不超过 10 MB" disabled={busy || !can} onFileChange={files=>readFile(files[0])}/>
      <ImportHelp/>
    </>:step==='preview'?<>
      <Typography.Title heading={6}><span ref={previewTitle} tabIndex={-1}>{fileName}</span></Typography.Title>
      <Banner type={invalid?'warning':'success'} description={'共 '+preview.length+' 条，可导入 '+valid.length+' 条，问题 '+invalid+' 条'}/>
      <div className="materials-actions"><Checkbox checked={onlyProblems} onChange={event=>{setOnlyProblems(event.target.checked);setExpandedRow(null);}}>只看问题记录</Checkbox><Button icon={<IconDownload aria-hidden/>} onClick={()=>download('模型资料导入校验清单.csv',[[...MODEL_IMPORT_HEADERS,'校验结果'],...preview.map(row=>[...row.cells,row.message])])}>下载校验清单</Button></div>
      <Table rowKey="rowNumber" columns={previewColumns} dataSource={visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
        scroll={{ x: 1120 }} pagination={{ pageSize, currentPage, total: visibleRows.length, showSizeChanger: true, pageSizeOpts: [20, 50, 100], showTotal: true }}
        onChange={({ pagination }) => setPagination({ currentPage: pagination.currentPage, pageSize: pagination.pageSize })}/>
      {selected && <><div className="materials-actions"><Typography.Title heading={6}>第 {selected.rowNumber} 行 · {cell(selected,'模型展示名') || '未填写名称'}</Typography.Title><Button onClick={()=>setExpandedRow(null)}>收起资料</Button></div><Descriptions align="left" data={MODEL_IMPORT_FIELDS.filter(field=>cell(selected,field.header)).map(field=>({key:field.header,value:cell(selected,field.header)}))}/></>}
      {invalid>0 && valid.length>0 && <Checkbox checked={skip} onChange={event=>setSkip(event.target.checked)}>跳过 {invalid} 条问题记录，仅导入 {valid.length} 条有效记录</Checkbox>}
    </>:<Banner type="success" title="导入完成" description={'已新增 '+outcome.imported+' 个模型资料'+(outcome.skipped?'，跳过 '+outcome.skipped+' 条问题记录':'')+'。可在模型资料中查看和维护。'}/>}
    {error && <Banner type="danger" description={error}/>}
    <div className="materials-actions"><Typography.Text type="tertiary">{mode==='template'?'仅创建模型资料，不添加供应关系或模型服务。':'导入后为已下架，配置完整后再上架。'}</Typography.Text><Space>{step==='result'?<Button theme="solid" onClick={()=>close(true)}>完成</Button>:<><Button disabled={busy} onClick={()=>step==='preview'?setStep('input'):close()}>{step==='preview'?'重新上传':'取消'}</Button>{step==='preview' && <Button theme="solid" loading={busy} disabled={!can || !valid.length || invalid>0 && !skip} onClick={submit}>确认导入 {valid.length} 条</Button>}</>}</Space></div>
  </div>;
}
