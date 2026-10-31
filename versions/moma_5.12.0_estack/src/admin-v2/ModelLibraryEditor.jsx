import { useState } from 'react';
import { Button } from '../components/ui/button';
import ModelMetadataForm from './ModelMetadataForm';
import { Modal, Notice } from './ModelOperationsUI';
import { operationsTransaction } from './model-operations';

export default function ModelLibraryEditor({ state, record, initial, onboardingId, ops, onSaved, onCancel }) {
  const [pending, setPending] = useState(null);
  const submit = (data, confirmed = false) => {
    const values = { ...data, id: record?.id, onboardingId, confirmCapabilities: confirmed };
    try { operationsTransaction(state, { operation: 'templateSave', data: values }); }
    catch (error) {
      if (error.message.startsWith('请确认能力变更：')) setPending({ data, message: error.message });
      else ops.setError(error.message);
      return null;
    }
    const next = ops.run('templateSave', values);
    if (next) { setPending(null); onSaved(next, next.audits[0].objectId); }
    return next;
  };
  return <><div className="mo-library-identity"><div><span>资料 ID</span>{record ? <code>{record.id}</code> : <span>保存后自动生成</span>}</div><p>系统关联标识，只读且唯一。修改模型名称不会改变资料 ID，也不会改变已有供应商、价格和上架配置的关联。</p></div>
    <ModelMetadataForm key={record?.id || 'new'} model={record} initial={initial} startEditing can={ops.can} dirty={ops.dirty} title="模型主档" submitLabel="保存模型资料" onCancel={onCancel} onSubmit={submit}/>
    {ops.error && <Notice error>{ops.error}</Notice>}
    {pending && <Modal title="确认模型能力变更" description={pending.message} onClose={() => setPending(null)}><p>所有引用该模型的页面将展示更新后的资料。请核对各供应商实际支持能力，再重新验证供给。</p><div className="mo-footer"><Button variant="outline" onClick={() => setPending(null)}>返回核对</Button><Button disabled={!ops.can} onClick={() => submit(pending.data, true)}>确认变更并保存</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
  </>;
}
