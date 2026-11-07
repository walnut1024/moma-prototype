import { PROVIDER_TYPES } from './provider-management';
import { useId, useState } from 'react';
import { Button, Input, TextArea, Typography } from '@douyinfe/semi-ui';
import { Choice, Field, FieldLabel, Modal, Notice } from './ServiceUI';
import { serviceScope, scopeTenants } from './service-commercial';
import { commercialTaskBase, providerServices } from './service-workspace';

export function ServiceScopeEditor({state,model,ops,close}) {
  const [value,setValue] = useState(() => ({openScope:model.openScope,tenantIds:model.tenantIds || []}));
  const [base,setBase] = useState(() => commercialTaskBase(state,model,'scope',''));
  const [preview,setPreview] = useState(false), [publishing,setPublishing] = useState(false);
  const tenants = scopeTenants(state), unavailable = value.tenantIds.filter(id => !tenants.some(row => row.id === id));
  const names = ids => state.tenants.filter(row => ids.includes(row.id)).map(row => row.name).join('、') || '未选择客户';
  const scopeText = row => row.openScope === 'all' ? '全部客户' : names(row.tenantIds || []);
  const selected = row => row.openScope === 'all' ? tenants.map(row => row.id) : row.tenantIds || [];
  const added = selected(value).filter(id => !selected(model).includes(id)), removed = selected(model).filter(id => !selected(value).includes(id));
  const change = patch => {if(publishing)return;setValue(row => ({...row,...patch}));setPreview(false);ops.dirty(true);ops.setError('');};
  const publish = async () => {if(publishing)return;setPublishing(true);try {if(await ops.run('commercialPublish',{kind:'scope',providerId:'',value,expectedBase:base,confirmed:true},model.id)){setPreview(false);ops.dirty(false);close();}}finally{setPublishing(false);}};
  return <div className="ss-model-form">
    {ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。载入后请重新打开配置核对。<Button onClick={ops.reload}>载入最新数据</Button></Notice>}
    {base !== commercialTaskBase(state,model,'scope','') && <Notice error>配置已变化，当前输入保留。<Button theme="borderless" disabled={!ops.can} onClick={() => {setBase(commercialTaskBase(state,model,'scope',''));setPreview(false);ops.dirty(true);}}>按当前配置重新核对</Button></Notice>}
    <Field label="客户开放范围 *"><Choice label="客户范围" value={value.openScope || undefined} options={[[ 'all','全部有效客户' ],['selected','指定客户']]} placeholder="请选择开放范围" disabled={!ops.can || publishing} onChange={openScope => change({openScope})}/></Field>
    {value.openScope === 'selected' && <Field label="选择客户 *"><Choice label="客户" multiple filter value={value.tenantIds} disabled={!ops.can || publishing} options={tenants.map(row => [row.id,(row.type === '个人' ? '个人客户' : '政企客户')+' · '+row.name+' · '+row.id])} onChange={tenantIds => change({tenantIds})}/>{unavailable.length > 0 && <Notice error>有 {unavailable.length} 个客户已停用或删除，请重新选择有效客户。<Button theme="borderless" disabled={!ops.can || publishing} onClick={() => change({tenantIds:value.tenantIds.filter(id => !unavailable.includes(id))})}>移除无效客户</Button></Notice>}</Field>}
    {preview && <Notice><Typography.Title heading={5}>开放范围变更预览</Typography.Title><p>当前：{scopeText(model)}</p><p>发布后：{scopeText(value)}</p><p>新增：{added.length ? names(added) : '无'}；移除：{removed.length ? names(removed) : '无'}</p><p>移出的客户将不能继续发起新调用，已有订购不豁免。</p><p>仅发布本次开放范围，其他配置保持不变。</p><Button disabled={!ops.can || publishing} loading={publishing} onClick={publish}>确认发布开放范围</Button></Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="ss-footer"><Button disabled={publishing} onClick={close}>取消</Button><Button disabled={!ops.can || publishing} onClick={() => {try{serviceScope(state,value);ops.setError('');setPreview(true);}catch(issue){setPreview(false);ops.setError(issue.message);}}}>预览变更</Button></div>
  </div>;
}
export function ServiceIdentityDialog({ model, providerId, ops, close, onSaved = close }) {
  const entry = providerServices(model).find(row => row.providerId === providerId);
  const original = providerId ? entry?.callId || '' : model.modelId;
  const formId = useId();
  const [callId, setCallId] = useState(original), [revision] = useState(model.updatedAt), [confirm, setConfirm] = useState(false);
  const changing = Boolean(original && original !== callId.trim());
  const blocked = Boolean(original) && (model.listingStatus === '已上架' || (providerId ? entry?.callsEnabled !== false : model.callsEnabled === true));
  const submit = async event => {
    event.preventDefault();
    if (changing && !confirm) {
      setConfirm(true);
      return;
    }
    if (await ops.run(providerId ? 'configureServiceIdentity' : 'configureServiceModelIdentity',
      { providerId, callId, expectedUpdatedAt: revision, confirmed: true }, model.id)) onSaved();
  };

  return <Modal title="编辑调用标识" description={model.name} onClose={close} footer={<>
    <Button theme="light" onClick={close}>取消</Button>
    <Button theme="solid" form={formId} htmlType="submit" disabled={!ops.can || !callId.trim() || callId.trim() === original || blocked}>
      {confirm ? '确认修改调用标识' : changing ? '核对变更' : '保存调用标识'}
    </Button>
  </>}>
    <form id={formId} onSubmit={submit}>
      <Field required label={<FieldLabel name="对外调用标识"/>}>
        <Input aria-label="对外调用标识" autoFocus value={callId} required maxLength={200} disabled={!ops.can || blocked}
          onChange={text => { setCallId(text); setConfirm(false); ops.dirty(true); ops.setError(''); }}/>
      </Field>
      {blocked && <Notice>先下架并停用当前服务，再修改对外调用标识。</Notice>}
      {changing && <Notice>原标识：{original}。保存后，客户需将调用参数改为新标识；原标识不再接受新请求。订购、配置和历史记录保留。</Notice>}
      {confirm && <p>请确认客户已完成调用标识迁移，再保存为 <code>{callId}</code>。</p>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </form>
  </Modal>;
}

export function ServiceSupplierDialog({ops,done,cancel}) {
  const [value,setValue]=useState({name:'',code:'',sourceType:'thirdParty',contact:'',contactInfo:'',description:''});
  const set=(key,input)=>{setValue(row=>({...row,[key]:input}));ops.dirty(true);ops.setError('');};
  return <Modal title="添加服务商" description="登记服务商主体资料，渠道接入与密钥在添加后配置。" onClose={cancel}><form onSubmit={async event=>{event.preventDefault();const next=await ops.run('provider',{operation:'create',values:value});if(next)done(next,next.audits[0].objectId);}}>
    <div className="ss-form-grid"><Field label="服务商名称 *"><Input aria-label="服务商名称" required value={value.name} disabled={!ops.can} onChange={text=>set('name',text)}/></Field><Field label="英文编码 *" hint="2–32 位小写字母、数字或连字符，字母开头；创建后固定。"><Input aria-label="英文编码" required pattern="[a-z][a-z0-9-]{1,31}" autoCapitalize="none" autoComplete="off" spellCheck={false} value={value.code} disabled={!ops.can} onChange={text=>set('code',text.toLowerCase())}/></Field><Field label="供给类型 *"><Choice label="供给类型" value={value.sourceType} options={Object.entries(PROVIDER_TYPES)} disabled={!ops.can} onChange={type=>set('sourceType',type)}/></Field><div/><Field label="联系人（选填）"><Input aria-label="联系人" value={value.contact} disabled={!ops.can} onChange={text=>set('contact',text)}/></Field><Field label="联系人号码/邮箱（选填）"><Input aria-label="联系人号码/邮箱" value={value.contactInfo} disabled={!ops.can} onChange={text=>set('contactInfo',text)}/></Field></div>
    <Field label="备注（选填）"><TextArea aria-label="备注" rows={4} maxLength={2000} showClear value={value.description} disabled={!ops.can} onChange={text=>set('description',text)}/><Typography.Text type="tertiary">{[...value.description.trim()].length} / 2000 字</Typography.Text></Field>
    {ops.error && <Notice error>{ops.error}</Notice>}<div className="ss-footer"><Button htmlType="button" onClick={cancel}>取消</Button><Button htmlType="submit" disabled={!ops.can}>保存服务商</Button></div>
  </form></Modal>;
}
