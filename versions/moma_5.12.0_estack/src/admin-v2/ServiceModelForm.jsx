import { useId, useState } from 'react';
import { Button, Form, RadioGroup, Select } from '@douyinfe/semi-ui';
import { Field, FieldLabel, Modal, Notice } from './ServiceUI';
import { SERVICE_MODES } from './model-operations';
import { serviceModelSources } from './supply-models';
import { serviceSourceIds, serviceNameInUse, SERVICE_CREATION_LIMIT } from './service-workspace';

const modeOptions = Object.entries(SERVICE_MODES).map(([value, { label, description }]) => ({ value, label: <FieldLabel name={label} description={description}/> }));

export default function ServiceModelForm({sourceState,ops,close,saved}) {
  const libraryId = ops.params.get('sourceLibrary');
  const [saving,setSaving] = useState(false);
  const [libraryIds,setLibraryIds] = useState(libraryId ? [libraryId] : []), [serviceMode,setServiceMode] = useState('');
  const formId = useId(), modeLabelId = useId();
  const existing = serviceSourceIds(sourceState);
  const options = serviceModelSources(sourceState).map(model => {
    const reason = existing.has(model.id) ? '已创建服务' : serviceNameInUse(sourceState, model.name, model.id) ? '服务名称已存在' : '';
    return { value: model.id, label: `${model.name}（${model.modelId}）${reason ? ` · ${reason}` : ''}`, disabled: Boolean(reason) };
  });
  const sourceIssue = libraryIds.some(id => !options.some(option => option.value === id && !option.disabled)) ? '所选模型已创建服务或供应登记已变化，请重新选择。' : '';
  const ready = libraryIds.length > 0 && libraryIds.length <= SERVICE_CREATION_LIMIT && !sourceIssue && Object.hasOwn(SERVICE_MODES, serviceMode);
  const cancel = () => { if (!saving) ops.proceed(close); };
  const edited = () => { ops.dirty(true); ops.setError(''); };
  return <Modal centered title="批量新增模型服务" onClose={cancel} footer={<>
    <Button theme="light" disabled={saving} onClick={cancel}>取消</Button>
    <Button form={formId} htmlType="submit" theme="solid" loading={saving} disabled={!ops.can || !ready || saving}>创建服务{libraryIds.length > 0 ? `（${libraryIds.length}）` : ''}</Button>
  </>}>
    <Form id={formId} onSubmit={async () => {
      if (!ready || !ops.can || saving) return;
      setSaving(true);
      try {
        const next = await ops.run('createServiceModels', { libraryIds, serviceMode });
        if (next) saved(libraryIds.map(id => next.models.find(model => model.templateId === id).id));
      } finally { setSaving(false); }
    }}>
      <Field label="模型" required error={sourceIssue}>
        <Select multiple filter showClear max={SERVICE_CREATION_LIMIT} maxTagCount={1} ellipsisTrigger showRestTagsPopover
          restTagsPopoverProps={{ style: { maxWidth: 480, maxHeight: 320, overflowY: 'auto' } }}
          dropdownClassName="service-model-select-dropdown" dropdownStyle={{ maxWidth: 'calc(100vw - 64px)' }}
          aria-label="选择模型" style={{ width: '100%' }} optionList={options}
          placeholder={`请选择模型，每批最多 ${SERVICE_CREATION_LIMIT} 个`} value={libraryIds} disabled={!ops.can || saving}
          emptyContent={options.length ? '没有匹配的模型' : '暂无可选模型，请先在渠道管理登记模型'}
          onChange={value => { setLibraryIds(value); edited(); }}/>
        {libraryIds.length > 0 && <span role="status">已选 {libraryIds.length} 个模型，每批最多 {SERVICE_CREATION_LIMIT} 个</span>}
      </Field>
      <Form.Slot label={{ id: modeLabelId, text: '服务模式', required: true }}>
        <div role="radiogroup" aria-labelledby={modeLabelId} aria-required="true">
          <RadioGroup name={modeLabelId} options={modeOptions} value={serviceMode} disabled={!ops.can || saving}
            onChange={event => { setServiceMode(event.target.value); edited(); }}/>
        </div>
      </Form.Slot>
      {ops.error && <Notice error>{ops.error}</Notice>}
      {ops.conflict && <Notice error>模型资料或服务已有修订。<Button htmlType="button" theme="borderless" onClick={ops.reload}>载入最新数据</Button></Notice>}
    </Form>
  </Modal>;
}
