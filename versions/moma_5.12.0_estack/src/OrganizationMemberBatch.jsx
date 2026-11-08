import { useRef, useState } from "react";
import { CheckCircle2, Download, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { departmentPath } from "./organization-data.mjs";
import { MEMBER_IMPORT_HEADERS, MEMBER_IMPORT_LIMIT, memberCsv, memberRowsFromCells, parseMemberText, validateMemberRows } from "./organization-import.mjs";

const blankRow = () => ({ key: crypto.randomUUID(), name: "", phone: "", account: "", department: "" });
function download(name, rows) {
  const url = URL.createObjectURL(new Blob([memberCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function OrganizationMemberBatch({ data, initialDepartment, onClose, onApply }) {
  const platformAccounts=data.platformAccounts || [];
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
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try { const outcome = await onApply(rows, mode, defaultDepartment); setResults(outcome); setStep("result"); setOnlyProblems(false); setError(""); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const selectAccount = (key, account) => {
    const identity = platformAccounts.find(a => a.account === account);
    if(!identity)return;
    setRows(rows.map(r => r.key === key ? { ...r, name: identity.name, account: identity.account, phone: identity.phone || "" } : r));
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="org-dialog org-batch-dialog" onInteractOutside={event => event.preventDefault()}>
    <DialogHeader><DialogTitle>批量添加成员</DialogTitle><DialogDescription>手机号必填。批量加入已有账号或创建新成员邀请，提交前核对成员与部门。</DialogDescription></DialogHeader>
    <ol className="org-batch-steps" aria-label="添加步骤">{[["input", "录入成员"], ["preview", "校验确认"], ["result", "处理结果"]].map(([id, title], i) => <li key={id} aria-current={step === id ? "step" : undefined}><span>{i + 1}</span>{title}</li>)}</ol>
    <div className="org-dialog-body org-batch-body">
      {step !== "result" && <>
        <div className="org-batch-settings"><Tabs value={mode} onValueChange={value => { setMode(value); setSkipProblems(false); setError(""); }}><TabsList><TabsTrigger value="existing">已有平台账号</TabsTrigger><TabsTrigger value="invite">邀请新成员</TabsTrigger></TabsList></Tabs>
          <label className="org-field"><span>默认主部门</span><Select value={defaultDepartment} onValueChange={value => { setDefaultDepartment(value); setSkipProblems(false); }}><SelectTrigger aria-label="默认主部门"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{[{ id: "unassigned", name: "未分配部门" }, ...data.departments].map(d => <SelectItem key={d.id} value={d.id}>{departmentPath(data.departments, d.id)}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
        </div><p className="org-hint">{mode === "existing" ? "匹配已有平台账号，自动带出姓名和登记手机号；缺失号码需补齐。" : "姓名、手机号必填，邮箱选填；未填写邮箱时使用手机号作为账号，创建后为待加入。"} 主部门留空使用默认值，统一添加为普通成员。</p>
      </>}
      {step === "input" ? <>
        <div className="org-batch-entry"><Tabs value={entry} onValueChange={setEntry}><TabsList><TabsTrigger value="manual">直接录入</TabsTrigger><TabsTrigger value="file">表格导入 / 粘贴</TabsTrigger></TabsList></Tabs><Button variant="outline" size="sm" onClick={() => download("批量添加成员模板.csv", [MEMBER_IMPORT_HEADERS])}><Download data-icon="inline-start" />下载模板</Button></div>
        {entry === "manual" ? <>
          <div className="org-batch-scroll"><Table className="org-batch-table"><TableHeader><TableRow><TableHead>姓名{mode === "invite" && " *"}</TableHead><TableHead>手机号 *</TableHead><TableHead>{mode === "existing" ? "平台账号" : "邮箱（选填）"}</TableHead><TableHead>主部门</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.map((r, i) => <TableRow key={r.key}>
            <TableCell><Input aria-label={`第${i + 1}行姓名`} value={r.name} maxLength={30} readOnly={mode === "existing"} onChange={e => update(r.key, "name", e.target.value)} placeholder={mode === "existing" ? "选择账号后带出" : "成员姓名"} /></TableCell>
            <TableCell><Input aria-label={`第${i + 1}行手机号`} type="tel" value={r.phone} onChange={e => update(r.key, "phone", e.target.value)} placeholder="必填" /></TableCell>
            <TableCell>{mode === "existing" ? <Select value={r.account || undefined} onValueChange={account => selectAccount(r.key, account)}><SelectTrigger aria-label={`第${i + 1}行平台账号`}><SelectValue placeholder="选择平台账号" /></SelectTrigger><SelectContent><SelectGroup>{platformAccounts.map(a => <SelectItem key={a.account} value={a.account}>{a.name} · {a.account}</SelectItem>)}</SelectGroup></SelectContent></Select> : <Input aria-label={`第${i + 1}行邮箱`} value={r.account} onChange={e => update(r.key, "account", e.target.value)} placeholder="选填" />}</TableCell>
            <TableCell><Input aria-label={`第${i + 1}行主部门`} value={r.department} onChange={e => update(r.key, "department", e.target.value)} placeholder="使用默认主部门" /></TableCell>
            <TableCell><Button variant="ghost" size="icon-xs" aria-label={`删除第${i + 1}行`} disabled={rows.length === 1} onClick={() => setRows(rows.filter(row => row.key !== r.key))}><Trash2 /></Button></TableCell>
          </TableRow>)}</TableBody></Table></div><Button variant="outline" size="sm" disabled={rows.length >= MEMBER_IMPORT_LIMIT} onClick={() => setRows([...rows, blankRow()])}><Plus data-icon="inline-start" />增加一行</Button>
        </> : <>
          <div className="org-batch-upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) readFile(e.dataTransfer.files[0]); }}><Upload aria-hidden="true" /><strong>上传成员表格，或将文件拖到这里</strong><p>支持 .xlsx、UTF-8 .csv，每批最多 {MEMBER_IMPORT_LIMIT} 条，文件不超过 10 MB</p><Button variant="outline" disabled={busy} onClick={() => fileInput.current.click()}>{busy ? "正在读取文件…" : "选择文件"}</Button><input ref={fileInput} type="file" accept=".xlsx,.csv" aria-label="上传成员文件" hidden onChange={e => { readFile(e.target.files[0]); e.target.value = ""; }} /></div>
          <label className="org-field"><span>或从 Excel 粘贴成员信息</span><Textarea aria-label="粘贴成员信息" value={paste} onChange={e => setPaste(e.target.value)} placeholder={"每行一位成员，列顺序：姓名、手机号、账号/邮箱、主部门\n支持制表符或逗号分隔，可包含模板表头"} /></label>
          <Button variant="ghost" size="sm" onClick={() => setPaste(mode === "existing" ? "姓名\t手机号\t账号/邮箱\t主部门\n林雨\t13800000101\tlinyu@example.com\t研发中心\n周然\t13800000102\tzhouran@example.com\t产品中心\n何川\t\thechuan@example.com\t算法部" : "姓名\t手机号\t账号/邮箱\t主部门\n沈宁\t13700000101\tshenning@example.com\t研发中心\n顾言\t13700000102\t\t产品中心\n林川\t\tlinchuan@example.com\t算法部\n宋悦\t13700000101\tsongyue@example.com\t研发中心\n周航\t13700000105\tzhouhang@example.com\t待建部门")}>填入成员信息</Button>
        </>}
      </> : <>
        <div className="org-batch-summary" role="status">{step === "result" ? <><CheckCircle2 aria-hidden="true" /><strong>处理完成</strong><span>成功 {results.filter(r => r.status === "success").length} 条</span><span>失败 {results.filter(r => r.status === "failed").length} 条</span><span>跳过 {results.filter(r => r.status === "skipped").length} 条</span></> : <><strong>共 {rows.length} 条</strong><span>可添加 {ready} 条</span><span>重复 {duplicate} 条</span><span>错误 {invalid} 条</span></>}</div>
        <div className="org-batch-review-tools"><label className="org-check"><Checkbox checked={onlyProblems} onCheckedChange={value => setOnlyProblems(!!value)} />只看问题记录</label><Button variant="outline" size="sm" onClick={exportResults}><Download data-icon="inline-start" />下载{step === "result" ? "处理结果" : "校验清单"}</Button></div>
        <div className="org-batch-scroll"><Table className="org-batch-table"><TableHeader><TableRow>{["行", "姓名", "手机号 *", "账号 / 邮箱", "主部门", "处理结果", ...(step === "preview" ? [""] : [])].map((label, i) => <TableHead key={i}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{shown.map(r => <TableRow key={r.key}>
          <TableCell>{r.rowNumber}</TableCell><TableCell>{step === "preview" && mode === "invite" ? <Input aria-label={`第${r.rowNumber}行姓名`} value={rows.find(row => row.key === r.key).name} maxLength={30} onChange={e => update(r.key, "name", e.target.value)} placeholder="填写姓名" /> : r.name || "未填写"}</TableCell>
          <TableCell>{step === "preview" ? <Input aria-label={`第${r.rowNumber}行手机号`} type="tel" aria-invalid={r.status === "error" && !r.phone || undefined} value={rows.find(row => row.key === r.key).phone} onChange={e => update(r.key, "phone", e.target.value)} placeholder="填写手机号" /> : r.phone || "未填写"}</TableCell>
          <TableCell>{step === "preview" ? <Input aria-label={`第${r.rowNumber}行账号`} value={rows.find(row => row.key === r.key).account} onChange={e => update(r.key, "account", e.target.value)} placeholder={mode === "existing" ? "平台账号" : "邮箱选填"} /> : r.account}</TableCell>
          <TableCell>{step === "preview" ? <Select value={r.departmentIssue ? "" : r.departmentId} onValueChange={id => update(r.key, "department", departmentPath(data.departments, id))}><SelectTrigger aria-label={`第${r.rowNumber}行部门`}><SelectValue placeholder="选择已有部门" /></SelectTrigger><SelectContent><SelectGroup>{[{ id: "unassigned" }, ...data.departments].map(d => <SelectItem key={d.id} value={d.id}>{departmentPath(data.departments, d.id)}</SelectItem>)}</SelectGroup></SelectContent></Select> : departmentPath(data.departments, r.departmentId)}</TableCell>
          <TableCell><span className={`org-batch-row-status org-batch-${r.status}`}>{r.message}</span>{r.status === "error" && r.department && <small className="org-cell-sub">原部门：{r.department}</small>}</TableCell>
          {step === "preview" && <TableCell><Button variant="ghost" size="icon-xs" aria-label={`移除第${r.rowNumber}行`} onClick={() => { setRows(rows.filter(row => row.key !== r.key)); setSkipProblems(false); }}><Trash2 /></Button></TableCell>}
        </TableRow>)}{!shown.length && <TableRow><TableCell colSpan={7}>没有匹配的记录</TableCell></TableRow>}</TableBody></Table></div>
        {step === "preview" && invalid + duplicate > 0 && <label className="org-check"><Checkbox checked={skipProblems} onCheckedChange={value => setSkipProblems(!!value)} />跳过 {invalid + duplicate} 条问题记录，仅提交 {ready} 条有效记录</label>}
        {step === "result" && results.some(r => r.status === "failed") && <Button variant="outline" onClick={() => { const failed = new Set(results.filter(r => r.status === "failed").map(r => r.key)); useRows(rows.filter(r => failed.has(r.key))); }}>仅重试失败项</Button>}
      </>}
      {error && <p className="org-form-error" role="alert">{error}</p>}
    </div>
    <DialogFooter><span className="org-hint">{step === "result" ? "邀请记录显示待加入，已有账号显示已加入。" : "手机号用于识别成员；重复记录不会覆盖现有资料与角色。"}</span>{step === "result" ? <Button onClick={close}>完成</Button> : <><Button variant="outline" disabled={busy} onClick={() => step === "preview" ? (setStep("input"), setOnlyProblems(false)) : close()}>{step === "preview" ? "返回录入" : "取消"}</Button><Button disabled={busy || step === "preview" && (!ready || invalid + duplicate > 0 && !skipProblems)} onClick={step === "input" ? next : submit}>{step === "input" ? "下一步：校验成员" : mode === "invite" ? `创建 ${ready} 条邀请` : `添加 ${ready} 位成员`}</Button></>}</DialogFooter>
  </DialogContent></Dialog>;
}
