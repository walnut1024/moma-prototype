import { Button } from '@douyinfe/semi-ui';
import { Modal } from './ModelOperationsUI';

export default function SupplierCreationDialog({ title, description, cancel, submit, disabled, children, action, footer, cancelLabel = '取消', embedded = false, drawer = false, drawerSide = 'right', className = '' }) {
  const form = <form className="supplier-configuration-form" noValidate onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (action && !disabled) submit(); }}>
    <div className="supplier-configuration-body">{children}</div>
    <footer className="supplier-configuration-footer"><Button theme="light" onClick={cancel}>{cancelLabel}</Button>{footer}{action && <Button htmlType="submit" disabled={disabled}>{action}</Button>}</footer>
  </form>;
  if (embedded) return <section className="onboarding-embedded" aria-label={title}>{form}</section>;
  return <Modal title={title} description={description} onClose={cancel} drawer={drawer} drawerSide={drawerSide} className={`mo-dialog supplier-configuration-dialog ${className}`}>{form}</Modal>;
}
