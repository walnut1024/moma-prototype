import { useEffect, useState } from 'react';
import { Banner, Button, Form, Input, Space, Typography } from '@douyinfe/semi-ui';
import { EnterpriseDialog, EnterpriseFacts } from './EnterpriseUI';
import { validateDemoAdminCode } from './enterprise';

export default function EnterpriseStatusDialog({ state, confirmation, apply, close, complete, canWrite }) {
  const { tenant, member, key } = confirmation;
  const collection = key ? 'apiKeys' : member ? 'memberships' : 'tenants';
  const targetId = (key || member || tenant).id;
  const target = state[collection].find(item => item.id === targetId);
  const disabling = target?.status !== '停用';
  const action = key || member ? disabling ? '停用' : '启用' : disabling ? '冻结' : '解冻';
  const type = key ? 'API 密钥' : member ? '企业管理员' : '企业账号';
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
    event.preventDefault(); if (busy || !canWrite) return; setError('');
    try {
      if (!target) throw new Error('操作对象已不存在，请关闭后刷新列表');
      if (disabling) validateDemoAdminCode(challenge, { code, scope, actor: state.currentRole });
      setBusy(true);
      apply({ type: 'enterprise', operation: key ? 'toggle-key' : member ? 'toggle-admin' : 'toggle-tenant', tenantId: tenant.id, memberId: member?.id, keyId: key?.id });
      setChallenge(null); complete();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const projectCount = state.projects.filter(item => item.tenantId === tenant.id).length;
  const keyCount = state.apiKeys.filter(item => item.tenantId === tenant.id).length;
  const impact = key ? disabling ? '该 API 密钥的后续调用将被拒绝，其他 API 密钥不受影响。'
    : '恢复当前 API 密钥，可在有效授权与额度范围内调用。'
    : member ? disabling ? '该管理员将无法进入或管理当前企业，其他企业成员关系保留。'
      : '恢复该人员在当前企业的管理员权限。'
      : disabling ? '该企业访问和所属 API 密钥调用将被拒绝，历史记录及管理员在其他企业的登录身份和成员关系保留。'
        : '恢复企业访问，已单独停用的管理员、项目和 API 密钥保持原状态。';
  return <EnterpriseDialog title={`${action}${type}`} description="请核对操作对象和影响范围后确认。" close={close}>
    <form onSubmit={submit} className="admin-analytics-fields">
      <EnterpriseFacts rows={[
        ['操作对象', target?.name || (key || member || tenant).name], [key ? 'API 密钥 ID' : '对象 ID', key ? key.keyId : targetId],
        ...((key || member) ? [['所属企业', tenant.name], ['企业 User ID', tenant.id]] : []),
        ['操作角色', state.currentRole],
      ]}/>
      <Banner type={disabling ? 'warning' : 'info'} closeIcon={null} description={!key && !member
        ? `${impact}涉及 ${projectCount} 个项目和 ${keyCount} 个 API 密钥。` : impact}/>
      {disabling && <>
        <Form.Slot label={{ text: '管理员校验码', name: 'ent-verify-code' }}>
          <Space wrap>
            <Input id="ent-verify-code" required aria-invalid={Boolean(error)} autoComplete="off" inputMode="numeric" maxLength={6}
              value={code} placeholder="6 位校验码" onChange={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }}/>
            <Button disabled={Boolean(cooldown) || !canWrite} onClick={getCode}>
              {cooldown ? `${cooldown}s 后重新获取` : challenge ? '重新获取' : '获取校验码'}
            </Button>
          </Space>
        </Form.Slot>
        {challenge && <Typography.Paragraph role="status" type="secondary">
          {expired ? '校验码已过期，请重新获取。' : <>校验码：<Typography.Text strong>{challenge.code}</Typography.Text> · 5 分钟有效，仅用于本次操作</>}
        </Typography.Paragraph>}
      </>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
      <div className="admin-form-actions">
        <Button onClick={close} disabled={busy}>取消</Button>
        <Button htmlType="submit" theme="solid" type={disabling ? 'danger' : 'primary'} loading={busy}
          disabled={!canWrite || !target || (disabling && (!challenge || code.length !== 6 || expired))}>确认{action}</Button>
      </div>
    </form>
  </EnterpriseDialog>;
}
