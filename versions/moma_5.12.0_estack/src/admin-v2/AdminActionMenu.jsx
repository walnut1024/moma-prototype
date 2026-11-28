import { useContext, useRef } from 'react';
import { Button, Dropdown } from '@douyinfe/semi-ui';
import { IconMore } from '@douyinfe/semi-icons';
import { Ellipsis } from 'lucide-react';
import { AdminUIContext } from '../components/admin-ui-context';
import { XaButton } from './xa24/HaloComponents.jsx';
import { Dropdown as HaloDropdown } from './xa24/HaloMenus.jsx';

export default function AdminActionMenu({ id, label, items, disabled, children }) {
  const admin = useContext(AdminUIContext);
  const trigger = useRef(null);
  const menu = items.map(item => item.onClick ? {
    ...item,
    onClick: () => item.onClick(trigger.current),
  } : item);
  if (admin) return <HaloDropdown clickToHide position="bottomRight" menu={menu}>
    <XaButton id={id} ref={trigger} size="small" theme="borderless" type="tertiary" disabled={disabled} aria-label={label}
      icon={children ? undefined : <Ellipsis size={16} aria-hidden="true"/>}>{children}</XaButton>
  </HaloDropdown>;
  return <Dropdown clickToHide trigger="click" position="bottomRight" menu={menu}>
    <Button id={id} size="small" theme="borderless" type="tertiary" disabled={disabled} aria-label={label}
      icon={children ? undefined : <IconMore aria-hidden="true"/>}
      onClick={event => { trigger.current = event.currentTarget; }}
      onKeyDown={event => {
        // Dropdown already activates its trigger for these keys.
        if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
      }}>{children}</Button>
  </Dropdown>;
}
