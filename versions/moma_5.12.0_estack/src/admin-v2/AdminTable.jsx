import { useChannelText } from './channel-language';
import { XaPagination } from './xa24/HaloComponents.jsx';
import HaloTable from './xa24/HaloTable.jsx';
import './admin-table.css';

export function AdminPagination({ showSizeChanger = false, ...props }) {
  return <XaPagination showSizeChanger={showSizeChanger} {...props}/>;
}

const renderPagination = pagination => <AdminPagination {...pagination}/>;

export default function AdminTable({ empty = '暂无数据', size = 'small', ...props }) {
  const t = useChannelText();
  return <HaloTable pagination {...props} size={size} renderPagination={props.renderPagination ?? renderPagination}
    empty={typeof empty === 'string' && empty.trim() ? <div className="admin-table-empty" role="status">{t(empty)}</div> : empty}/>;
}
