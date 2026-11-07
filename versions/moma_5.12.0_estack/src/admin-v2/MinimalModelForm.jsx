import { useState } from 'react';
import { Input } from '@douyinfe/semi-ui';
import { Choice, Field, MultiChoice } from './ServiceUI';
import { MODEL_TYPES } from './model-management';
import { TASK_OPTIONS, INPUT_MODALITY_OPTIONS, OUTPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS } from './model-profile';
import { Notice } from './ModelOperationsUI';

export default function MinimalModelForm({ ops, onSaved, formId }) {
  const [value, setValue] = useState({ name: '', modelId: '', type: '', profile: { tasks: [], inputModalities: [], outputModalities: [], resultTypes: [] } });
  const set = patch => { setValue(current => ({ ...current, ...patch })); ops.dirty(true); ops.setError(''); };
  const profile = (key, input) => set({ profile: { ...value.profile, [key]: input } });
  return <form id={formId} className="supplier-resource-form" onSubmit={async event => { event.preventDefault(); event.stopPropagation(); const next = await ops.run('channelMetadataCreate', value); if (next) onSaved(next, next.audits[0].objectId); }}>
    <div className="supplier-channel-fields"><Field label="模型展示名 *"><Input aria-label="模型展示名" value={value.name} disabled={!ops.can} onChange={value => set({ name: value })}/></Field><Field label="规范模型标识 *"><Input aria-label="规范模型标识" value={value.modelId} maxLength={80} disabled={!ops.can} onChange={value => set({ modelId: value })}/></Field></div>
    <Field label="模型类型 *"><Choice label="模型类型" value={value.type || 'unselected'} options={[[ 'unselected', '请选择模型类型' ], ...Object.entries(MODEL_TYPES)]} disabled={!ops.can} onChange={type => set({ type, profile: { tasks: [], inputModalities: [], outputModalities: [], resultTypes: [] } })}/></Field>
    {value.type && <><Field label="支持任务 *"><MultiChoice label="支持任务" choices={TASK_OPTIONS[value.type] || []} value={value.profile.tasks} disabled={!ops.can} onChange={input => profile('tasks', input)}/></Field><Field label="输入类型 *"><MultiChoice label="输入类型" choices={INPUT_MODALITY_OPTIONS} value={value.profile.inputModalities} disabled={!ops.can} onChange={input => profile('inputModalities', input)}/></Field><div className="supplier-channel-fields"><Field label="输出类型"><MultiChoice label="输出类型" choices={OUTPUT_MODALITY_OPTIONS} value={value.profile.outputModalities} disabled={!ops.can} onChange={input => profile('outputModalities', input)}/></Field><Field label="结果类型"><MultiChoice label="结果类型" choices={RESULT_TYPE_OPTIONS} value={value.profile.resultTypes} disabled={!ops.can} onChange={input => profile('resultTypes', input)}/></Field></div></>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </form>;
}
