import { Children, cloneElement, isValidElement, useId } from 'react';
import { Banner, Button, Form, Input, InputNumber, Select, TextArea, Space, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconHelpCircle } from '@douyinfe/semi-icons';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import { modelFieldDescriptions } from './model-field-descriptions';
import './semi-services.css';

export function Notice({ children, error = false }) {
  return <Banner type={error ? 'danger' : 'info'} description={children}/>;
}
const textControls = new Set([Input, InputNumber, TextArea]);
const fieldControls = new Set([...textControls, Select, Choice, MultiChoice]);

export function Field({ label, hint, error, required, children }) {
  const id = useId();
  const labelId = id + '-label';
  const elements = Children.toArray(children);
  const index = elements.findIndex(child => isValidElement(child) && fieldControls.has(child.type));
  const control = elements[index];
  const inputId = textControls.has(control?.type) ? control.props.id || id + '-input' : undefined;
  const markedRequired = typeof label === 'string' && label.endsWith(' *');
  const isRequired = required || markedRequired;
  if (control) {
    const describedBy = [control.props['aria-describedby'], hint && id + '-hint', error && id + '-error'].filter(Boolean).join(' ');
    elements[index] = cloneElement(control, {
      ...(inputId && { id: inputId }),
      ...(control.type === Select && !control.props['aria-labelledby'] && { 'aria-labelledby': labelId }),
      ...(describedBy && { 'aria-describedby': describedBy }),
      ...(isRequired && { 'aria-required': true }),
      ...(error && { 'aria-invalid': true, validateStatus: 'error' }),
    });
  }
  return <Form.Slot className="admin-form-field" label={{ id: labelId, name: inputId, text: markedRequired ? label.slice(0, -2) : label, required: isRequired }}
    error={error ? <span id={id + '-error'} role="alert">{error}</span> : undefined}>
    {elements}
    {hint && <Typography.Paragraph id={id + '-hint'} type="tertiary">{hint}</Typography.Paragraph>}
  </Form.Slot>;
}
export function Choice({ label, options, ...props }) {
  const id = useId();
  return <><span id={id} className="sr-only">{label}</span><Select aria-labelledby={id} optionList={options.map(([value, text]) => ({ value, label: text }))} {...props}/></>;
}
export function MultiChoice({ label, choices, value = [], onChange, disabled, groups = [], ...props }) {
  const id = useId();
  const grouped = groups.filter(([, rows]) => rows.length > 0);
  const extra = [...new Set([...choices, ...value])].filter(option => !grouped.some(([, rows]) => rows.includes(option)));
  return <>
    <span id={id} className="sr-only">{label}</span>
    <Select {...props} aria-labelledby={id} multiple filter maxTagCount={2} showRestTagsPopover disabled={disabled}
      value={value} placeholder={'请选择' + label} onChange={onChange} emptyContent={<span role="status">没有匹配项</span>}>
      {grouped.map(([name, rows]) => <Select.OptGroup key={name} label={name}>
        {rows.map(option => <Select.Option key={option} value={option}>{option}</Select.Option>)}
      </Select.OptGroup>)}
      {extra.map(option => <Select.Option key={option} value={option}>{option}</Select.Option>)}
    </Select>
  </>;
}
export function CopyId({ value, label = '对外调用标识', ellipsis }) {
  return <Typography.Text className="ss-code" ellipsis={ellipsis} copyable={{ content: value, successTip: `${label} 已复制`, onError: () => Toast.error('复制失败，请选择文本复制') }}>{value}</Typography.Text>;
}
export function FieldLabel({ name, description }) {
  const help = description || modelFieldDescriptions[name];
  return <Space spacing={4}>{name}{help && <Tooltip content={help}><Button theme="borderless" type="tertiary" icon={<IconHelpCircle aria-hidden="true"/>} aria-label={`${name}说明`}/></Tooltip>}</Space>;
}
export function Modal({ title, description, children, onClose, wide, centered, drawer = false, drawerSide = 'right', footer, className = '', maskClosable }) {
  const content = <div className="ss-dialog-content">
    {description && <Typography.Paragraph type="tertiary">{description}</Typography.Paragraph>}{children}
  </div>;
  return drawer
    ? <AdminSideSheet visible className={`semi-services ${className}`} title={title} placement={drawerSide}
        width={`min(${wide ? 1000 : 720}px, 100vw)`} onCancel={onClose} closeOnEsc maskClosable={maskClosable} footer={footer}>{content}</AdminSideSheet>
    : <AdminModal visible centered={centered} className={`semi-services ${className}`} title={title}
        width={`min(${wide ? 960 : 448}px, calc(100vw - 32px))`} onCancel={onClose} maskClosable={maskClosable} footer={footer ?? null}>{content}</AdminModal>;
}
export const serviceOperationsUi = {
  notify: message => Toast.success(message),
  renderLeaveDialog: ({ cancel, discard }) => <Modal title="有未保存的配置" onClose={cancel} footer={<><Button onClick={cancel}>继续编辑</Button><Button type="danger" onClick={discard}>放弃本次修改</Button></>}>放弃修改后继续离开，当前生效配置保留。</Modal>,
};
