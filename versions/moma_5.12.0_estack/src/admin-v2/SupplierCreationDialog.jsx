import { useId } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Modal } from './ModelOperationsUI';

export default function SupplierCreationDialog({ title, description, cancel, submit, disabled, children, action, footer, cancelLabel = '取消', embedded = false, wide = false, drawer = false, drawerSide = 'right', className = '' }) {
  const formId = useId();
  const actions = <>
    <Button type="tertiary" onClick={cancel}>{cancelLabel}</Button>
    {footer}
    {action && <Button form={formId} htmlType="submit" theme="solid" disabled={disabled}>{action}</Button>}
  </>;
  const form = <form id={formId} className="supplier-configuration-form" noValidate onSubmit={event => {
    event.preventDefault();
    event.stopPropagation();
    if (action && !disabled) submit();
  }}>
    <div className="supplier-configuration-body">{children}</div>
    {embedded && <footer className="admin-form-actions">{actions}</footer>}
  </form>;
  if (embedded) return <section className="onboarding-embedded" aria-label={title}>{form}</section>;
  return <Modal title={title} description={description} onClose={cancel} wide={wide} drawer={drawer} drawerSide={drawerSide}
    className={`supplier-configuration-dialog ${className}`} footer={actions}>{form}</Modal>;
}
