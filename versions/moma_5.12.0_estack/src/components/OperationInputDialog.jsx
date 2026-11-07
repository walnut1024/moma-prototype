import { useId, useState } from 'react';
import { Banner, Button, Form, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from '../admin-v2/AdminOverlay';

export default function OperationInputDialog({ title, description, label, initialValue = '', numeric = false, onSubmit, onClose }) {
  const formId = useId();
  const [error, setError] = useState('');
  const save = ({ value }) => {
    try {
      const trimmed = value?.trim();
      if (!trimmed) throw new Error(`请填写${label}`);
      if (onSubmit(trimmed)) onClose();
      else setError('保存未完成，请检查操作反馈后重试');
    } catch (cause) {
      setError(cause.message);
    }
  };
  return <Modal visible title={title} width="min(480px, calc(100vw - 32px))" closeOnEsc onCancel={onClose}
    footer={<>
      <Button onClick={onClose}>取消</Button>
      <Button form={formId} htmlType="submit" theme="solid">确认保存</Button>
    </>}>
    <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
    <Form id={formId} initValues={{ value: String(initialValue) }} onSubmit={save} onValueChange={() => setError('')}>
      {numeric ? <Form.Input field="value" label={label} type="number" min={1} step={1} autoFocus/>
        : <Form.TextArea field="value" label={label} autosize={{ minRows: 4, maxRows: 9 }} autoFocus/>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </Form>
  </Modal>;
}
