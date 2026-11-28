import { Typography } from './xa24/HaloUI.jsx';
import './admin-page-heading.css';

export default function AdminPageHeading({ title, description, children, className, artwork }) {
  const heading = <>
    <div>
      <Typography.Title heading={3} component="h1">{title}</Typography.Title>
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
    </div>
    {children}
  </>;
  return (
    <div className={className ? `admin-page-heading ${className}` : "admin-page-heading"}>
      {artwork ? <>
        <div className="xa24-entry-heading-content">{heading}</div>
        <img className="xa24-entry-art" src={artwork} width="80" height="80" alt="" draggable={false}/>
      </> : heading}
    </div>
  );
}
