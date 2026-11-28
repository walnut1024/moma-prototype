import { useChannelText } from '../admin-v2/channel-language';
import { useContext } from 'react';
import { Button as SemiButton, Tooltip as SemiTooltip } from '@douyinfe/semi-ui';
import { XaButton } from '../admin-v2/xa24/HaloComponents.jsx';
import { Tooltip as HaloTooltip } from '../admin-v2/xa24/HaloFeedback.jsx';
import { AdminUIContext } from './admin-ui-context';
import './table-field-help.css';

export default function TableFieldHelp({ name, description, sortable = false, sortIcon, onSort }) {
  const t = useChannelText();
  const admin = useContext(AdminUIContext);
  const Button = admin ? XaButton : SemiButton;
  const Tooltip = admin ? HaloTooltip : SemiTooltip;
  name = t(name);
  description = t(description);
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
