import { Typography } from '@douyinfe/semi-ui';

export default function AdminPageHeading({ title, description, children }) {
  return (
    <div className="admin-page-heading">
      <div>
        <Typography.Title heading={3} component="h1">{title}</Typography.Title>
        {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      </div>
      {children}
    </div>
  );
}
