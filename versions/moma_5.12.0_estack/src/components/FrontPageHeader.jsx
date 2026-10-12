export default function FrontPageHeader({ title, description, icon: Icon, actions, className = '' }) {
  return <section className={`front-page-header ${className}`.trim()} aria-label={`${title}页面标题`}>
    <div className="front-page-header-copy"><h1>{Icon && <Icon className="front-page-header-icon" aria-hidden="true" />}{title}</h1><p>{description}</p></div>
    {actions && <div className="front-page-header-actions">{actions}</div>}
  </section>;
}
