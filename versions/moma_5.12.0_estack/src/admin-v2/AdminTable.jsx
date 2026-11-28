import { useChannelText } from './channel-language';
import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { XaButton as Button, XaInput as Input, XaSelect as Select, XaSpace as Space, XaTypography as Typography } from './xa24/HaloComponents.jsx';
import HaloTable from './xa24/HaloTable.jsx';
import './admin-table.css';

export function AdminPagination({
  total = 0, currentPage = 1, pageSize = 10, pageSizeOpts = [10, 20, 40, 100],
  showSizeChanger = false, hideOnSinglePage = false, disabled, className = '',
  showTotal = true, style, onPageChange, onPageSizeChange, onChange,
}) {
  const t = useChannelText();
  const sizeLabel = useId();
  const [draftPage, setDraftPage] = useState(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, currentPage), pages);
  const showControls = showSizeChanger || !hideOnSinglePage || pages > 1;
  const changePage = page => {
    setDraftPage(null);
    if (!Number.isInteger(page) || page < 1 || page > pages || page === current) return;
    onPageChange?.(page);
    onChange?.(page, pageSize);
  };
  const changeSize = size => {
    if (size === pageSize) return;
    setDraftPage(null);
    onPageSizeChange?.(size);
    onChange?.(1, size);
  };

  return <div className={`admin-pagination ${className}`} style={style} role="group" aria-label={t("分页")}>
    {showTotal && <Typography.Text type="tertiary">{t('共 {count} 条').replace('{count}', total)}</Typography.Text>}
    {showControls && <Space wrap>
      <Button theme="borderless" type="tertiary" size="small" aria-label={t("上一页")}
        icon={<ChevronLeft size={16} aria-hidden="true"/>} disabled={disabled || current === 1} onClick={() => changePage(current - 1)}/>
      {pages > 1 && <Input className="admin-page-number" size="small" type="number" min={1} max={pages}
        aria-label={t("跳转页码")} value={draftPage ?? current} disabled={disabled}
        onChange={setDraftPage} onBlur={() => setDraftPage(null)} onKeyDown={event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          changePage(Number(event.target.value));
        }}/>}
      <Typography.Text aria-live="polite" className={pages > 1 ? 'sr-only' : undefined}>{current} / {pages}</Typography.Text>
      {pages > 1 && <Typography.Text aria-hidden="true">/ {pages}</Typography.Text>}
      <Button theme="borderless" type="tertiary" size="small" aria-label={t("下一页")}
        icon={<ChevronRight size={16} aria-hidden="true"/>} disabled={disabled || current === pages} onClick={() => changePage(current + 1)}/>
      {showSizeChanger && <>
        <span id={sizeLabel} className="sr-only">{t("每页条数")}</span>
        <Select aria-labelledby={sizeLabel} size="small" value={pageSize} disabled={disabled} onChange={changeSize}
          optionList={[...new Set([...pageSizeOpts, pageSize])].map(value => ({ value, label: t('{count} 条 / 页').replace('{count}', value) }))}/>
      </>}
    </Space>}
  </div>;
}

const renderPagination = pagination => <AdminPagination {...pagination}/>;

export default function AdminTable({ empty = '暂无数据', size = 'small', ...props }) {
  const t = useChannelText();
  return <HaloTable pagination {...props} size={size} renderPagination={props.renderPagination ?? renderPagination}
    empty={typeof empty === 'string' && empty.trim() ? <div className="admin-table-empty" role="status">{t(empty)}</div> : empty}/>;
}
