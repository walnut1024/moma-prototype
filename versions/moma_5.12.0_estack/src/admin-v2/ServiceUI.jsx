import { useCallback, useId } from 'react';
import { Banner, Button, Form, Modal as SemiModal, Select, SideSheet, Space, Tag, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconHelpCircle } from '@douyinfe/semi-icons';
import { modelFieldDescriptions } from './model-field-descriptions';
import './semi-services.css';

export function Notice({ children, error = false }) {
  return <Banner type={error ? 'danger' : 'info'} description={children}/>;
}
export function Status({ children, good = false }) {
  return <Tag color={good ? 'green' : 'grey'}>{children}</Tag>;
}
export function Field({ label, hint, children }) {
  return <Form.Slot label={label}>{children}{hint && <Typography.Paragraph type="tertiary">{hint}</Typography.Paragraph>}</Form.Slot>;
}
export function Choice({ label, options, ...props }) {
  const id = useId();
  return <><span id={id} className="sr-only">{label}</span><Select aria-labelledby={id} optionList={options.map(([value, text]) => ({ value, label: text }))} {...props}/></>;
}
export function CopyId({ value, label = '对外调用标识' }) {
  return <Typography.Text className="ss-code" copyable={{ content: value, successTip: `${label} 已复制`, onError: () => Toast.error('复制失败，请选择文本复制') }}>{value}</Typography.Text>;
}
export function FieldLabel({ name, description, required }) {
  const help = description || modelFieldDescriptions[name];
  return <Space spacing={4}>{name}{required && ' *'}{help && <Tooltip content={help}><Button theme="borderless" type="tertiary" icon={<IconHelpCircle aria-hidden="true"/>} aria-label={`${name}说明`}/></Tooltip>}</Space>;
}
export function Modal({ title, description, children, onClose, wide, drawer = false, drawerSide = 'right', footer, className = '' }) {
  const focusSheet = useCallback(node => {
    const dialog = node?.closest('[role="dialog"]');
    if (!dialog) return;
    // The installed Semi SideSheet does not forward aria-label to its dialog.
    if (typeof title === 'string') dialog.setAttribute('aria-label', title);
    if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
  }, [title]);
  const content = <div className="ss-dialog-content" ref={drawer ? focusSheet : undefined}>
    {description && <Typography.Paragraph type="tertiary">{description}</Typography.Paragraph>}{children}
  </div>;
  const actions = footer ? <div className="ss-footer">{footer}</div> : null;
  return drawer
    ? <SideSheet visible className={`semi-services ${className}`} title={title} placement={drawerSide}
        width={`min(${wide ? 1000 : 720}px, 100vw)`} onCancel={onClose} closeOnEsc footer={actions}>{content}</SideSheet>
    : <SemiModal visible className={`semi-services ${className}`} title={title}
        width={`min(${wide ? 960 : 448}px, calc(100vw - 32px))`} onCancel={onClose} footer={actions}>{content}</SemiModal>;
}
export const serviceOperationsUi = {
  notify: message => Toast.success(message),
  renderLeaveDialog: ({ cancel, discard }) => <Modal title="有未保存的配置" onClose={cancel} footer={<><Button onClick={cancel}>继续编辑</Button><Button type="danger" onClick={discard}>放弃本次修改</Button></>}>放弃修改后继续离开，当前生效配置保留。</Modal>,
};
