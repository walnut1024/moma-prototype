import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { validateDemoAdminCode } from './enterprise';

export default function EnterpriseStatusDialog({ state, confirmation, apply, close, complete, Modal }) {
  const { tenant, member, key } = confirmation;
  const collection = key ? 'apiKeys' : member ? 'memberships' : 'tenants';
  const targetId = (key || member || tenant).id;
  const target = state[collection].find(item => item.id === targetId);
  const disabling = target?.status !== '停用';
  const action = key || member ? disabling ? '停用' : '启用' : disabling ? '冻结' : '解冻';
  const type = key ? 'API Key' : member ? '企业管理员' : '企业账号';
  const scope = `${collection}:${targetId}:${action}`;
  const [challenge, setChallenge] = useState(null), [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const cooldown = challenge ? Math.max(0, Math.ceil((challenge.issuedAt + 60000 - now) / 1000)) : 0;
  const expired = challenge && now >= challenge.issuedAt + 300000;
  const getCode = () => {
    if (cooldown) return;
    const issuedAt = Date.now(), random = crypto.getRandomValues(new Uint32Array(1))[0];
    setChallenge({ code: String(random % 1000000).padStart(6, '0'), issuedAt, scope, actor: state.currentRole });
    setNow(issuedAt); setCode(''); setError('');
  };
  const submit = event => {
    event.preventDefault(); if (busy) return; setError('');
    try {
      if (!target) throw new Error('操作对象已不存在，请关闭后刷新列表');
      if (disabling) validateDemoAdminCode(challenge, { code, scope, actor: state.currentRole });
      setBusy(true);
      apply({ type: 'enterprise', operation: key ? 'toggle-key' : member ? 'toggle-admin' : 'toggle-tenant', tenantId: tenant.id, memberId: member?.id, keyId: key?.id });
      setChallenge(null); complete();
    } catch (err) { toast.error(err.message); setError(err.message); setBusy(false); }
  };
  const projectCount = state.projects.filter(item => item.tenantId === tenant.id).length;
  const keyCount = state.apiKeys.filter(item => item.tenantId === tenant.id).length;
  return <Modal className="ent-status-dialog" icon={disabling ? <AlertTriangle/> : <ShieldCheck/>} title={`${action}${type}`} description="请核对操作对象和影响范围后确认。" close={close}>
    <form onSubmit={submit} className="ent-status-form">
      <div className="ent-status-body">
        <dl className="ent-status-object"><dt>操作对象</dt><dd><strong>{target?.name || (key || member || tenant).name}</strong><small>{!key && !member ? 'user_id：' : ''}{key ? key.keyId : targetId}</small></dd>{(key || member) && <><dt>所属企业</dt><dd>{tenant.name}<small>user_id：{tenant.id}</small></dd></>}<dt>操作角色</dt><dd>{state.currentRole}</dd></dl>
        <div className={`ent-status-impact ${disabling ? 'is-warning' : ''}`}><strong>{disabling ? `${action}影响` : '恢复范围'}</strong><p>{key ? disabling ? '该 Key 的后续调用将被拒绝；其他 Key 不受影响。' : '恢复当前 Key，可在有效授权与额度范围内调用。' : member ? disabling ? '该管理员不能再进入或管理当前企业；其他企业成员关系保留。' : '恢复该人员在当前企业的管理员权限。' : disabling ? '冻结后，该企业访问和所属 Key 调用将被拒绝；历史记录保留。管理员在其他企业的登录身份及成员关系不受影响。' : '解冻后恢复企业访问；已单独停用的管理员、项目和 Key 保持原状态。'}</p>{!key && !member && <span>{projectCount} 个项目 · {keyCount} 个 API Key</span>}</div>
        {disabling && <section className="ent-verification"><div className="ent-verification-title"><ShieldCheck size={16}/><h3>管理员校验</h3></div><label className="ent-field"><span>管理员校验码 <span aria-hidden="true">*</span></span><div className="ent-code-controls"><Input autoFocus aria-label="管理员校验码" aria-invalid={Boolean(error)} autoComplete="off" inputMode="numeric" maxLength={6} value={code} placeholder="请输入 6 位校验码" onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}/><Button type="button" variant="outline" disabled={Boolean(cooldown)} onClick={getCode}>{cooldown ? `${cooldown}s 后重新获取` : challenge ? '重新获取' : '获取校验码'}</Button></div></label>{challenge && <div className={`ent-demo-code ${expired ? 'is-expired' : ''}`} role="status">{expired ? '校验码已过期，请重新获取。' : <>校验码：<b>{challenge.code}</b><span>5 分钟有效，仅用于本次操作</span></>}</div>}</section>}
        {error && <p className="ent-error" role="alert">{error}</p>}

      </div>
      <div className="ent-modal-footer"><Button type="button" variant="outline" onClick={close} disabled={busy}>取消</Button><Button type="submit" variant={disabling ? 'destructive' : 'default'} disabled={busy || (disabling && (!challenge || code.length !== 6 || expired))}>{busy ? '正在提交…' : `确认${action}`}</Button></div>
    </form>
  </Modal>;
}
