import { Typography } from '@douyinfe/semi-ui';

export default function FrontPageHeader({ title, description, icon: Icon, actions, className = '' }) {
  return <section className={`front-page-header ${className}`.trim()} aria-label={`${title}页面标题`}>
    <div className="front-page-header-copy"><Typography.Title component="h1" heading={3}>
      {Icon && <Icon className="front-page-header-icon" aria-hidden="true" />}{title}
    </Typography.Title>{description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}</div>
    {actions && <div className="front-page-header-actions">{actions}</div>}
  </section>;
}
