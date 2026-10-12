import { X } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

export default function OperationInputDialog({ title, description, label, initialValue = '', numeric = false, onSubmit, onClose }) {
  const [value, setValue] = useState(String(initialValue)), [error, setError] = useState('');
  const [trigger] = useState(() => document.activeElement);
  const submit = event => {
    event.preventDefault();
    try {
      if (!value.trim()) throw new Error(`请填写${label}`);
      if (onSubmit(value.trim())) onClose();
      else setError('保存未完成，请检查操作反馈后重试');
    } catch (cause) { setError(cause.message); }
  };
  const Field = numeric ? Input : Textarea;
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="operation-input-dialog" showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); trigger?.focus(); }}><DialogHeader><DialogTitle>{title}</DialogTitle><Button className="operation-dialog-close" type="button" variant="ghost" size="icon" aria-label="关闭" onClick={onClose}><X/></Button><DialogDescription>{description}</DialogDescription></DialogHeader><form onSubmit={submit} noValidate><label htmlFor="operation-value">{label}</label><Field id="operation-value" type={numeric ? 'number' : undefined} min={numeric ? 1 : undefined} step={numeric ? 1 : undefined} value={value} onChange={event => { setValue(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'operation-error' : undefined}/>{error && <p id="operation-error" role="alert" className="form-error">{error}</p>}<footer><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit">确认保存</Button></footer></form></DialogContent></Dialog>;
}
