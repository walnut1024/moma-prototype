import { useState } from 'react';
import { Banner, Button, Form, Modal, Typography } from '@douyinfe/semi-ui';

export default function OperationInputDialog({ title, description, label, initialValue = '', numeric = false, onSubmit, onClose }) {
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
  return <Modal visible title={title} width="min(480px, calc(100vw - 32px))" closeOnEsc maskClosable={false} footer={null} onCancel={onClose}>
    <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
    <Form initValues={{ value: String(initialValue) }} onSubmit={save} onValueChange={() => setError('')}>
      {numeric ? <Form.Input field="value" label={label} type="number" min={1} step={1} autoFocus/>
        : <Form.TextArea field="value" label={label} autosize={{ minRows: 4, maxRows: 9 }} autoFocus/>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
      <div className="admin-form-actions">
        <Button onClick={onClose}>取消</Button>
        <Button htmlType="submit" theme="solid">确认保存</Button>
      </div>
    </Form>
  </Modal>;
}
