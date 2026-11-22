import { Button, Tooltip } from '@douyinfe/semi-ui';
import './table-field-help.css';

export default function TableFieldHelp({ name, description, sortable = false, sortIcon, onSort }) {
  const accessibleDescription = typeof description === 'string' ? description : undefined;
  const trigger = sortable || onSort
    ? <Button className={description ? 'table-field-sort-trigger' : undefined}
        size="small" theme="borderless" type="tertiary" icon={sortIcon} iconPosition="right"
        aria-description={accessibleDescription} onClick={onSort} onKeyPress={event => event.stopPropagation()}>
        {description ? <span className="table-field-help-label">{name}</span> : name}
      </Button>
    : <span className="table-field-help-label" tabIndex={0} aria-description={accessibleDescription}>{name}</span>;

  if (!description) return onSort ? trigger : name;
  return <Tooltip content={<div className="table-field-help-text">{description}</div>} position="top" closeOnEsc>
    {trigger}
  </Tooltip>;
}
