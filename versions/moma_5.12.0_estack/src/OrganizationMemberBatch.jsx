import { useId, useRef, useState } from "react";
import { CheckCircle2, Download, Plus, Trash2, Upload } from "lucide-react";
import { Button, Checkbox, Input, Select, Steps, Table, Tabs, TextArea } from '@douyinfe/semi-ui';
import { AdminModal } from './admin-v2/AdminOverlay';
import { departmentPath, platformAccounts } from "./organization-data.mjs";
import { MEMBER_IMPORT_HEADERS, MEMBER_IMPORT_LIMIT, memberCsv, memberRowsFromCells, parseMemberText, validateMemberRows } from "./organization-import.mjs";

const blankRow = () => ({ key: crypto.randomUUID(), name: "", phone: "", account: "", department: "" });
function download(name, rows) {
  const url = URL.createObjectURL(new Blob([memberCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function OrganizationMemberBatch({ data, initialDepartment, onClose, onApply }) {
  const departmentLabelId = useId();
  const departmentOptions = [{ id: 'unassigned' }, ...data.departments]
    .map(({id}) => ({ value: id, label: departmentPath(data.departments, id) }));
  const [mode, setMode] = useState("existing"), [entry, setEntry] = useState("manual"), [step, setStep] = useState("input");
  const [rows, setRows] = useState([blankRow()]), [paste, setPaste] = useState("");
  const [defaultDepartment, setDefaultDepartment] = useState(initialDepartment);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [onlyProblems, setOnlyProblems] = useState(false), [skipProblems, setSkipProblems] = useState(false);
  const [results, setResults] = useState([]);
  const fileInput = useRef(null), fileRequest = useRef(0);
  const preview = validateMemberRows(data, rows, mode, defaultDepartment);
  const ready = preview.filter(r => r.status === "ready").length, duplicate = preview.filter(r => r.status === "duplicate").length, invalid = preview.filter(r => r.status === "error").length;
  const displayRows = step === "result" ? results : preview;
  const shown = onlyProblems ? displayRows.filter(r => !["ready", "success"].includes(r.status)) : displayRows;
  const close = () => { if (step !== "result" && (paste || rows.some(r => r.name || r.phone || r.account)) && !window.confirm("关闭后将丢弃本次未提交的成员信息，确认关闭？")) return; fileRequest.current++; onClose(); };
  const update = (key, field, value) => { setRows(rows.map(r => r.key === key ? { ...r, [field]: value } : r)); setSkipProblems(false); };
  const exportResults = () => download("成员处理结果.csv", [[...MEMBER_IMPORT_HEADERS, "处理结果"], ...displayRows.map(r => [r.name, r.phone, r.account, departmentPath(data.departments, r.departmentId), r.message])]);
  const useRows = next => { setRows(next); setPaste(""); setStep("preview"); setError(""); setOnlyProblems(false); setSkipProblems(false); };
  const readFile = async file => {
    if (!file) return;
    const request = ++fileRequest.current;
    setBusy(true); setError("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10 MB，请拆分后导入");
      let parsed;
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        parsed = memberRowsFromCells(await readSheet(file));
      } else if (/\.csv$/i.test(file.name)) parsed = parseMemberText(await file.text());
      else throw new Error("请选择 .xlsx 或 UTF-8 编码的 .csv 文件；旧版 .xls 请另存为 .xlsx");
      if (request === fileRequest.current) useRows(parsed);
    } catch (e) { if (request === fileRequest.current) setError(e.message.startsWith("每批") || e.message.includes("请") || e.message.includes("表头") ? e.message : "文件读取失败，请检查文件是否损坏并使用最新模板"); }
    finally { if (request === fileRequest.current) setBusy(false); }
  };
  const next = () => {
    try {
      if (paste.trim()) useRows(parseMemberText(paste));
      else {
        const filled = rows.filter(r => r.name || r.phone || r.account || r.department);
        if (!filled.length) throw new Error("请填写成员，或上传成员文件");
        useRows(filled);
      }
    } catch (e) { setError(e.message); }
  };
  const submit = () => {
    if (busy) return;
    setBusy(true);
    try { const outcome = onApply(rows, mode, defaultDepartment); setResults(outcome); setStep("result"); setOnlyProblems(false); setError(""); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const selectAccount = (key, account) => {
    const identity = platformAccounts.find(a => a.account === account);
    setRows(rows.map(r => r.key === key ? { ...r, name: identity.name, account: identity.account, phone: identity.phone || "" } : r));
  };
  const footer = <div className="org-batch-footer"><span className="org-hint">{step === "result" ? "邀请记录显示待加入，已有账号显示已加入。" : "手机号用于识别成员；重复记录不会覆盖现有资料与角色。"}</span>{step === "result" ? <Button theme="solid" onClick={close}>完成</Button> : <><Button theme="outline" onClick={() => step === "preview" ? (setStep("input"), setOnlyProblems(false)) : close()}>{step === "preview" ? "返回录入" : "取消"}</Button><Button theme="solid" loading={busy} disabled={busy || step === "preview" && (!ready || invalid + duplicate > 0 && !skipProblems)} onClick={step === "input" ? next : submit}>{step === "input" ? "下一步：校验成员" : mode === "invite" ? `创建 ${ready} 条邀请` : `添加 ${ready} 位成员`}</Button></>}</div>;
  return <AdminModal visible title="批量添加成员" className="org-dialog org-batch-dialog"
    width="min(1080px, calc(100vw - 24px))" onCancel={close} footer={footer}>
    <p className="org-hint">手机号必填。批量加入已有账号或创建新成员邀请，提交前核对成员与部门。</p>
    <Steps type="basic" size="small" className="org-batch-steps" aria-label="添加步骤"
      current={['input', 'preview', 'result'].indexOf(step)}>
      {['录入成员', '校验确认', '处理结果'].map(title => <Steps.Step key={title} title={title}/>)}
    </Steps>
    <div className="org-dialog-body org-batch-body">
      {step !== "result" && <>
        <div className="org-batch-settings"><Tabs activeKey={mode} onChange={value => { setMode(value); setSkipProblems(false); setError(""); }} tabList={[{ itemKey: 'existing', tab: '已有平台账号' }, { itemKey: 'invite', tab: '邀请新成员' }]}/>
          <div className="org-field"><span id={departmentLabelId}>默认主部门</span>
          <Select aria-labelledby={departmentLabelId} value={defaultDepartment} optionList={departmentOptions}
            onChange={value => { setDefaultDepartment(value); setSkipProblems(false); }}/></div>
        </div><p className="org-hint">{mode === "existing" ? "匹配已有平台账号，自动带出姓名和登记手机号；缺失号码需补齐。" : "姓名、手机号必填，邮箱选填；未填写邮箱时使用手机号作为账号，创建后为待加入。"} 主部门留空使用默认值，统一添加为普通成员。</p>
      </>}
      {step === "input" ? <>
        <div className="org-batch-entry"><Tabs activeKey={entry} onChange={setEntry} tabList={[{ itemKey: 'manual', tab: '直接录入' }, { itemKey: 'file', tab: '表格导入 / 粘贴' }]}/><Button theme="outline" size="small" onClick={() => download("批量添加成员模板.csv", [MEMBER_IMPORT_HEADERS])}><Download data-icon="inline-start" />下载模板</Button></div>
        {entry === "manual" ? <>
          <div className="org-batch-scroll">
            <Table className="org-batch-table" size="small" pagination={false} rowKey="key" dataSource={rows}
              columns={[
                { title: mode === 'invite' ? '姓名 *' : '姓名', dataIndex: 'name', render: (name, row, i) => <Input
                  aria-label={'第' + (i + 1) + '行姓名'} value={name} maxLength={30} readonly={mode === 'existing'}
                  onChange={value => update(row.key, 'name', value)} placeholder={mode === 'existing' ? '选择账号后带出' : '成员姓名'}/> },
                { title: '手机号 *', dataIndex: 'phone', render: (phone, row, i) => <Input
                  aria-label={'第' + (i + 1) + '行手机号'} type="tel" value={phone} onChange={value => update(row.key, 'phone', value)} placeholder="必填"/> },
                { title: mode === 'existing' ? '平台账号' : '邮箱（选填）', dataIndex: 'account', render: (account, row, i) => mode === 'existing'
                  ? <><span id={departmentLabelId + '-account-' + i} className="sr-only">{'第' + (i + 1) + '行平台账号'}</span>
                    <Select value={account || undefined} aria-labelledby={departmentLabelId + '-account-' + i} placeholder="选择平台账号"
                      optionList={platformAccounts.map(a => ({ value: a.account, label: a.name + ' · ' + a.account }))}
                      onChange={value => selectAccount(row.key, value)}/></>
                  : <Input aria-label={'第' + (i + 1) + '行邮箱'} value={account} onChange={value => update(row.key, 'account', value)} placeholder="选填"/> },
                { title: '主部门', dataIndex: 'department', render: (department, row, i) => <Input
                  aria-label={'第' + (i + 1) + '行主部门'} value={department}
                  onChange={value => update(row.key, 'department', value)} placeholder="使用默认主部门"/> },
                { key: 'remove', render: (_, row, i) => <Button theme="borderless" type="tertiary" size="small" disabled={rows.length === 1}
                  aria-label={'删除第' + (i + 1) + '行'} icon={<Trash2 size={14}/>} onClick={() => setRows(rows.filter(item => item.key !== row.key))}/> },
              ]}/>
          </div><Button theme="outline" size="small" disabled={rows.length >= MEMBER_IMPORT_LIMIT} onClick={() => setRows([...rows, blankRow()])}><Plus data-icon="inline-start" />增加一行</Button>
        </> : <>
          <div className="org-batch-upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) readFile(e.dataTransfer.files[0]); }}><Upload aria-hidden="true" /><strong>上传成员表格，或将文件拖到这里</strong><p>支持 .xlsx、UTF-8 .csv，每批最多 {MEMBER_IMPORT_LIMIT} 条，文件不超过 10 MB</p><Button theme="outline" disabled={busy} onClick={() => fileInput.current.click()}>{busy ? "正在读取文件…" : "选择文件"}</Button><input ref={fileInput} type="file" accept=".xlsx,.csv" aria-label="上传成员文件" hidden onChange={e => { readFile(e.target.files[0]); e.target.value = ""; }} /></div>
          <label className="org-field"><span>或从 Excel 粘贴成员信息</span><TextArea aria-label="粘贴成员信息" value={paste} onChange={setPaste} placeholder={"每行一位成员，列顺序：姓名、手机号、账号/邮箱、主部门\n支持制表符或逗号分隔，可包含模板表头"} /></label>
          <Button theme="borderless" size="small" onClick={() => setPaste(mode === "existing" ? "姓名\t手机号\t账号/邮箱\t主部门\n林雨\t13800000101\tlinyu@example.com\t研发中心\n周然\t13800000102\tzhouran@example.com\t产品中心\n何川\t\thechuan@example.com\t算法部" : "姓名\t手机号\t账号/邮箱\t主部门\n沈宁\t13700000101\tshenning@example.com\t研发中心\n顾言\t13700000102\t\t产品中心\n林川\t\tlinchuan@example.com\t算法部\n宋悦\t13700000101\tsongyue@example.com\t研发中心\n周航\t13700000105\tzhouhang@example.com\t待建部门")}>填入成员信息</Button>
        </>}
      </> : <>
        <div className="org-batch-summary" role="status">{step === "result" ? <><CheckCircle2 aria-hidden="true" /><strong>处理完成</strong><span>成功 {results.filter(r => r.status === "success").length} 条</span><span>失败 {results.filter(r => r.status === "failed").length} 条</span><span>跳过 {results.filter(r => r.status === "skipped").length} 条</span></> : <><strong>共 {rows.length} 条</strong><span>可添加 {ready} 条</span><span>重复 {duplicate} 条</span><span>错误 {invalid} 条</span></>}</div>
        <div className="org-batch-review-tools"><Checkbox className="org-check" checked={onlyProblems} onChange={({target}) => setOnlyProblems(target.checked)}>只看问题记录</Checkbox><Button theme="outline" size="small" onClick={exportResults}><Download data-icon="inline-start" />下载{step === "result" ? "处理结果" : "校验清单"}</Button></div>
        <div className="org-batch-scroll">
          <Table className="org-batch-table" size="small" pagination={false} rowKey="key" dataSource={shown} empty="没有匹配的记录"
            columns={[
              { title: '行', dataIndex: 'rowNumber' },
              { title: '姓名', dataIndex: 'name', render: (name, row) => step === 'preview' && mode === 'invite'
                ? <Input aria-label={'第' + row.rowNumber + '行姓名'} value={rows.find(item => item.key === row.key).name}
                  maxLength={30} placeholder="填写姓名" onChange={value => update(row.key, 'name', value)}/>
                : name || '未填写' },
              { title: '手机号 *', dataIndex: 'phone', render: (phone, row) => step === 'preview'
                ? <Input aria-label={'第' + row.rowNumber + '行手机号'} type="tel" value={rows.find(item => item.key === row.key).phone}
                  validateStatus={row.status === 'error' && !phone ? 'error' : undefined} placeholder="填写手机号"
                  onChange={value => update(row.key, 'phone', value)}/>
                : phone || '未填写' },
              { title: '账号 / 邮箱', dataIndex: 'account', render: (account, row) => step === 'preview'
                ? <Input aria-label={'第' + row.rowNumber + '行账号'} value={rows.find(item => item.key === row.key).account}
                  placeholder={mode === 'existing' ? '平台账号' : '邮箱选填'} onChange={value => update(row.key, 'account', value)}/>
                : account },
              { title: '主部门', dataIndex: 'departmentId', render: (id, row) => step === 'preview'
                ? <><span id={departmentLabelId + '-' + row.rowNumber} className="sr-only">{'第' + row.rowNumber + '行部门'}</span>
                  <Select aria-labelledby={departmentLabelId + '-' + row.rowNumber} value={row.departmentIssue ? undefined : id}
                    placeholder="选择已有部门" optionList={departmentOptions}
                    onChange={value => update(row.key, 'department', departmentPath(data.departments, value))}/></>
                : departmentPath(data.departments, id) },
              { title: '处理结果', dataIndex: 'message', render: (message, row) => <>
                <span className={'org-batch-row-status org-batch-' + row.status}>{message}</span>
                {row.status === 'error' && row.department && <small className="org-cell-sub">原部门：{row.department}</small>}
              </> },
              ...(step === 'preview' ? [{ key: 'remove', render: (_, row) => <Button theme="borderless" type="tertiary" size="small"
                aria-label={'移除第' + row.rowNumber + '行'} icon={<Trash2 size={14}/>}
                onClick={() => { setRows(rows.filter(item => item.key !== row.key)); setSkipProblems(false); }}/> }] : []),
            ]}/>
        </div>
        {step === "preview" && invalid + duplicate > 0 && <Checkbox className="org-check" checked={skipProblems} onChange={({target}) => setSkipProblems(target.checked)}>跳过 {invalid + duplicate} 条问题记录，仅提交 {ready} 条有效记录</Checkbox>}
        {step === "result" && results.some(r => r.status === "failed") && <Button theme="outline" onClick={() => { const failed = new Set(results.filter(r => r.status === "failed").map(r => r.key)); useRows(rows.filter(r => failed.has(r.key))); }}>仅重试失败项</Button>}
      </>}
      {error && <p className="org-form-error" role="alert">{error}</p>}
    </div>
  </AdminModal>;
}
