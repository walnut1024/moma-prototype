import { useRef } from 'react';
import { Button, Dropdown } from '@douyinfe/semi-ui';
import { IconMore } from '@douyinfe/semi-icons';

export default function AdminActionMenu({ label, items, disabled, children }) {
  const trigger = useRef(null);
  const menu = items.map(item => item.onClick ? {
    ...item,
    onClick: () => item.onClick(trigger.current),
  } : item);
  return <Dropdown clickToHide trigger="click" position="bottomRight" menu={menu}>
    <Button size="small" theme="borderless" type="tertiary" disabled={disabled} aria-label={label}
      icon={children ? undefined : <IconMore aria-hidden="true"/>}
      onClick={event => { trigger.current = event.currentTarget; }}
      onKeyDown={event => {
        // Dropdown already activates its trigger for these keys.
        if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
      }}>{children}</Button>
  </Dropdown>;
}
