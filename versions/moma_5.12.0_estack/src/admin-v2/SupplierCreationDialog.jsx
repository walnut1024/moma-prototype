import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Button } from '../components/ui/button';

export default function SupplierCreationDialog({ title, description, cancel, submit, disabled, children, action, footer, cancelLabel = '取消' }) {
  return <Dialog open onOpenChange={open => { if (!open) cancel(); }}><DialogContent className="mo-dialog supplier-configuration-dialog" showCloseButton={false}>
    <div className="mo-dialog-header"><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">{description}</DialogDescription><Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={cancel}><X/></Button></div>
    <form className="supplier-configuration-form" noValidate onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!disabled) submit(); }}>
      <div className="supplier-configuration-body">{children}</div>
      <footer className="supplier-configuration-footer"><Button type="button" variant="outline" onClick={cancel}>{cancelLabel}</Button>{footer}<Button type="submit" disabled={disabled}>{action}</Button></footer>
    </form>
  </DialogContent></Dialog>;
}
