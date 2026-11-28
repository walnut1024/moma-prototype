import { useChannelText } from './channel-language';
import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banner, Button, DatePicker, Form, Input, InputNumber, Select, Space, TextArea, Typography } from './xa24/HaloUI.jsx';
import { TagInput, Upload } from './xa24/HaloUI.jsx';
import { IconUpload } from './xa24/HaloIcons.jsx';
import { modelMetadataDraft } from './model-metadata-draft';
import { MODEL_TYPE_LABELS, modelCategory } from '../model-types.mjs';
import { INPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS, TASK_OPTIONS } from './model-profile';
import { materialContextLabel, materialContextUnit, materialContextUnits } from './model-material-fields';
import MaterialLogo, { readMaterialLogo } from './MaterialLogo';
import { classificationHref, classificationIndex, classificationKey, modelClassification, modelClassificationFor } from './model-classification';

const choices = values => values.map(value => ({ value, label: value }));
const typeOptions = Object.entries(MODEL_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const visualOptions = [{ value: 'image', label: '图像' }, { value: 'video', label: '视频' }];
const inputOptions = choices(INPUT_MODALITY_OPTIONS);
const outputOptions = choices([...INPUT_MODALITY_OPTIONS, ...RESULT_TYPE_OPTIONS]);
const contextOptions = choices(Object.keys(materialContextUnits));
const display = value => Array.isArray(value) ? value.join('、') || '—' : value || '—';

export default function MaterialMetadataForm({state, conflict, reload, model, initial, readOnly, can, dirty, onCancel, onSubmit, footerTarget}) {
  const translateLabel = useChannelText();
  const [form, setForm] = useState(() => modelMetadataDraft(model || initial));
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unit, setUnit] = useState(() => materialContextUnit(form.capabilities.context));
  const [context, setContext] = useState(() => form.capabilities.context ? String(form.capabilities.context / materialContextUnits[unit]) : '');
  const version = useRef(0);
  const formId = useId();
  useEffect(() => () => { version.current++; }, []);
  const editable = !readOnly && can;
  const { profile } = form;
  const tokens = context.trim() ? Number(context) * materialContextUnits[unit] : null;
  const dictionary = modelClassification(state);
  const index = classificationIndex(dictionary);
  const { author, series, authorName, seriesName } = modelClassificationFor(index, form);
  const type = modelCategory(form.type);
  const visual = visualOptions.find(option => option.value === form.type);
  const classificationOption = option => ({
    value: option.id,
    label: option.name,
    names: [option.name, ...option.aliases, ...(option.formerNames || [])],
  });
  const authorOptions = dictionary.authors.map(classificationOption);
  const seriesOptions = dictionary.series.filter(option => option.authorId === author?.id).map(classificationOption);
  const searchClassification = (query, option) => option.names.some(name => classificationKey(name).includes(classificationKey(query)));
  const outputs = [...new Set([...(profile.outputModalities || []), ...(profile.resultTypes || [])])];

  const markDirty = () => { setError(''); dirty(true); };
  const change = (key, value) => { setForm(current => ({ ...current, [key]: value })); markDirty(); };
  const changeProfile = fields => {
    setForm(current => ({ ...current, profile: { ...current.profile, ...fields } }));
    markDirty();
  };
  const changeAuthor = id => {
    const next = index.authors.get(id);
    if (!next || next.id === author?.id) return;
    setForm(current => ({
      ...current, maker: next.name, profile: { ...current.profile, author: next.name, authorId: next.id, family: '', familyId: '' },
    }));
    markDirty();
  };
  const changeSeries = id => {
    const next = index.series.get(id);
    if (next && next.authorId === author?.id) changeProfile({ family: next.name, familyId: next.id });
  };
  const uploadLogo = async files => {
    if (!files.length) return;
    const request = ++version.current;
    setUploading(true);
    setError('');
    try {
      const logo = await readMaterialLogo(files[0]);
      if (version.current === request) changeProfile({ logo });
    } catch (error) {
      if (version.current === request) setError(error.message);
    } finally {
      if (version.current === request) setUploading(false);
    }
  };
  const slot = (key, label, value, control, { required = true, wide = false } = {}) => {
    const id = formId + '-' + key;
    return <Form.Slot key={key} label={{ id, text: label + (required && !readOnly ? ' *' : '') }} className={wide ? 'materials-wide-field' : undefined}>
      {readOnly ? <Typography.Text>{display(value)}</Typography.Text>
        : cloneElement(control, control.type === Select ? { 'aria-labelledby': id, 'aria-required': required } : {})}
    </Form.Slot>;
  };
  const input = (key, label, value, onChange, extra) => slot(key, label, value,
    <Input aria-label={label} aria-required value={value || ''} disabled={!editable} onChange={onChange} {...extra}/>);
  const textArea = (key, label, value, onChange) => slot(key, label, value,
    <TextArea aria-label={label} aria-required value={value || ''} rows={3} disabled={!editable} onChange={onChange}/>);
  const submit = async () => {
    if (!editable || uploading || saving) return;
    const required = [
      ['模型展示名称', form.name.trim()], ['模型编码', form.modelId.trim()], ['模型图标', profile.logo],
      ['模型中文简介', form.description.trim()], ['模型英文简介', profile.descriptionEn?.trim()],
      ['模型类型', Object.hasOwn(MODEL_TYPE_LABELS, type)], ['上下文长度', tokens !== null],
      ...(type === 'visual' ? [['视觉任务类型', visual]] : []),
      ['模型作者', author], ['模型系列', series], ['输入模态', profile.inputModalities?.length], ['输出模态', outputs.length],
      ['模型精度', profile.precision?.trim()], ['模型标签', profile.tags?.length], ['模型发布日期', profile.releaseDate],
    ];
    const missing = required.filter(([, value]) => !value).map(([label]) => label);
    if (missing.length) { setError('请填写必填项：' + missing.join('、')); return; }
    if (!Number.isSafeInteger(tokens) || tokens < 1) { setError('上下文长度换算后须为正整数 Token'); return; }
    const tasks = profile.tasks?.filter(task => TASK_OPTIONS[form.type]?.includes(task));
    setSaving(true);
    try {
      await onSubmit({ ...form, type: visual?.value || type, maker: author.name, profile: {
        ...profile, tasks, author: author.name, authorId: author.id, family: series.name, familyId: series.id,
      }, capabilities: { ...form.capabilities, context: tokens } });
    } finally { setSaving(false); }
  };

  return <Form id={formId} onSubmit={submit}>
    <div className="materials-field-grid">
      {input('name', '模型展示名称', form.name, value => change('name', value))}
      {input('code', '模型编码', form.modelId, value => change('modelId', value), { readonly: Boolean(model) })}
      <Form.Slot label={{ text: '模型图标' + (readOnly ? '' : ' *') }} className="materials-wide-field">
        <Space align="start">
          <MaterialLogo src={profile.logo} model={form} alt="模型图标" preview/>
          {!readOnly && <Upload accept="image/png,image/jpeg,image/webp" uploadTrigger="custom" fileList={[]} showUploadList={false}
            disabled={!editable || uploading} onFileChange={uploadLogo}>
            <Button icon={<IconUpload aria-hidden/>} loading={uploading} disabled={!editable}>{profile.logo ? '更换图片' : '上传图片'}</Button>
          </Upload>}
        </Space>
      </Form.Slot>
      {textArea('description', '模型中文简介', form.description, value => change('description', value))}
      {textArea('description-en', '模型英文简介', profile.descriptionEn, value => changeProfile({ descriptionEn: value }))}
      {slot('type', '模型类型', MODEL_TYPE_LABELS[type],
        <Select value={type} optionList={typeOptions} disabled={!editable}
          onChange={value => { if (value !== type) change('type', value); }}/>)}
      {type === 'visual' && slot('visual-type', '视觉任务类型', visual?.label,
        <Select value={visual?.value} optionList={visualOptions} disabled={!editable} onChange={value => change('type', value)}/>)}
      {slot('context', '上下文长度', materialContextLabel(tokens),
        <Space className="materials-context-field">
          <Input aria-label={translateLabel("上下文长度")} aria-required inputMode="decimal" value={context} disabled={!editable}
            onChange={value => { setContext(value); markDirty(); }}/>
          <span id={formId + '-context-unit'} className="sr-only">{translateLabel("上下文长度单位")}</span>
          <Select className="materials-context-unit" aria-labelledby={formId + '-context-unit'} value={unit} optionList={contextOptions} disabled={!editable}
            onChange={value => {
              if (tokens !== null && Number.isFinite(tokens)) setContext(String(tokens / materialContextUnits[value]));
              setUnit(value);
            }}/>
        </Space>)}
      {slot('author', '模型作者', author?.name || authorName,
        <Select value={author?.id} optionList={authorOptions} disabled={!editable} placeholder={authorName || '请选择模型作者'}
          filter={searchClassification} onChange={changeAuthor}/>)}
      {slot('series', '模型系列', series?.name || seriesName,
        <Select value={series?.id} optionList={seriesOptions} disabled={!editable || !author} placeholder={seriesName || '请选择模型系列'}
          filter={searchClassification} onChange={changeSeries}/>)}
      {slot('input', '输入模态', profile.inputModalities,
        <Select multiple value={profile.inputModalities || []} optionList={inputOptions} disabled={!editable}
          onChange={value => changeProfile({ inputModalities: value })}/>)}
      {slot('output', '输出模态', outputs,
        <Select multiple value={outputs} optionList={outputOptions} disabled={!editable}
          onChange={value => changeProfile({
            outputModalities: value.filter(item => INPUT_MODALITY_OPTIONS.includes(item)),
            resultTypes: value.filter(item => RESULT_TYPE_OPTIONS.includes(item)),
          })}/>)}
      {input('precision', '模型精度', profile.precision, value => changeProfile({ precision: value }))}
      {slot('tags', '模型标签', profile.tags,
        <TagInput aria-label={translateLabel("模型标签")} value={profile.tags || []} max={20} maxLength={50} addOnBlur disabled={!editable}
          placeholder="输入后按回车" onChange={value => changeProfile({ tags: value })}/>)}
      {slot('release-date', '模型发布日期', profile.releaseDate,
        <DatePicker aria-labelledby={formId + '-release-date'} aria-required type="date" onChangeWithDateFirst={false} format="yyyy-MM-dd" disabled={!editable}
          value={profile.releaseDate?.length === 10 ? profile.releaseDate : undefined} placeholder={profile.releaseDate || '选择日期'}
          onChange={value => changeProfile({ releaseDate: value || '' })}/>)}
      {slot('parameters', '参数量（B）', profile.parameters,
        <InputNumber aria-label={translateLabel("参数量（B）")} value={profile.parameters ?? ''} min={0} step={0.1} suffix="B" disabled={!editable}
          onChange={value => changeProfile({ parameters: value })}/>, { required: false })}
    </div>
    {!readOnly && <Space>
      <a href={classificationHref('authors')} target="_blank" rel="noopener noreferrer">维护模型作者</a>
      <a href={classificationHref('series')} target="_blank" rel="noopener noreferrer">维护模型系列</a>
      {conflict && reload && <Button theme="borderless" onClick={reload}>载入最新数据</Button>}
    </Space>}
    {error && <Banner type="danger" description={error}/>}
    {footerTarget && createPortal(<>
      <Button onClick={onCancel}>{readOnly ? '关闭' : '取消'}</Button>
      {!readOnly && <Button form={formId} htmlType="submit" theme="solid" loading={saving} disabled={!editable || uploading}>{model ? '保存' : '创建模型资料'}</Button>}
    </>, footerTarget)}
  </Form>;
}
