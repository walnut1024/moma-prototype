import { Typography } from '@douyinfe/semi-ui';

export default function AdminPageHeading({ title, description, children, className }) {
  return (
    <div className={className ? `admin-page-heading ${className}` : "admin-page-heading"}>
      <div>
        <Typography.Title heading={3} component="h1">{title}</Typography.Title>
        {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      </div>
      {children}
    </div>
  );
}
