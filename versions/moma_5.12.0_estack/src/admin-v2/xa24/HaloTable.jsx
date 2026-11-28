import { useCallback, useId, useRef, useState } from 'react';
import { h } from 'vue';
import { EButton, ETable } from '@cmss-bfs/haloe/dist/es/index.js';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from 'lucide-react';
import HaloHost from './HaloHost.jsx';
import { XaButton, XaCheckbox } from './HaloComponents.jsx';
import { useChannelText } from '../channel-language.js';

const nativeKey = '_xa24RowKey';
const cellKey = (rowKey, columnIndex) => JSON.stringify([rowKey, columnIndex]);
const columnKey = index => 'column-' + index;
const headerKey = index => 'header-' + index;
const expandedKey = rowKey => JSON.stringify(['expanded', rowKey]);
const visibleCell = element => !element.closest('.haloe-table-hidden, .haloe-table-expanded-hidden');
const sortState = { ascend: 'ascending', descend: 'descending' };
const sortIcons = { ascend: ArrowUp, descend: ArrowDown };
const emptyRows = [];
const sortColumnKey = (column, index) => {
  const key = column.key ?? column.dataIndex ?? index;
  return Array.isArray(key) ? JSON.stringify(key) : key;
};

function valueAt(row, path) {
  if (Array.isArray(path)) return path.reduce((value, key) => value?.[key], row);
  return path == null ? undefined : row?.[path];
}

function ColumnFilter({ title, options, values, multiple, onChange }) {
  const t = useChannelText();
  const id = useId();
  const label = t('筛选', 'Filter') + ' ' + title;
  const anchored = globalThis.CSS?.supports('position-area: block-end span-inline-start');
  return <>
    <XaButton theme={values.length ? 'light' : 'borderless'} size="small" popovertarget={id} aria-label={label}
      icon={<Filter size={13} aria-hidden="true"/>}/>
    <span id={id} popover="auto" role="group" aria-label={label} style={{
      ...(anchored && { inset: 'auto', margin: 0, positionArea: 'block-end span-inline-start',
        positionTryFallbacks: 'flip-block, flip-inline, flip-block flip-inline' }),
      minInlineSize: 140, maxInlineSize: 'calc(100vw - 16px)', maxBlockSize: 'calc(100dvh - 16px)',
      overflow: 'auto', padding: 8, border: '1px solid var(--xa24-divider)', borderRadius: 'var(--xa24-control-radius)',
      backgroundColor: 'var(--xa24-surface)', color: 'var(--xa24-text)', boxShadow: '0 4px 16px rgb(155 168 200 / 50%)',
    }}>
      <span style={{ display: 'grid', gap: 6 }}>
        {options.map(({ value, text, disabled }) => <XaCheckbox key={value} disabled={disabled} checked={values.includes(value)}
          onChange={() => onChange(values.includes(value) ? values.filter(item => item !== value) : multiple ? [...values, value] : [value])}>
          {text}
        </XaCheckbox>)}
      </span>
    </span>
  </>;
}

export default function HaloTable({
  columns = [], dataSource = emptyRows, rowKey = 'id', empty = '暂无数据', rowSelection, scroll, loading, className,
  size = 'small', rowClassName, onRow, bordered, onChange, showHeader = true, 'aria-label': label,
  'aria-labelledby': labelledBy,
  pagination = false, renderPagination, expandedRowRender, rowExpandable, expandedRowKeys, defaultExpandedRowKeys,
  onExpand, onExpandedRowsChange, hideExpandedColumn, expandIcon,
}) {
  const t = useChannelText();
  const columnCache = useRef(null);
  const rowAttrs = useRef([]);
  const checkboxLabels = useRef([]);
  const selectAllLabel = useRef(null);
  const scrollViewport = useRef(null);
  const [localSort, setLocalSort] = useState(null);
  const [localFilters, setLocalFilters] = useState({});
  const [localExpanded, setLocalExpanded] = useState(defaultExpandedRowKeys ?? []);
  const [localSelection, setLocalSelection] = useState([]);
  const pager = typeof pagination === 'object' && pagination ? pagination : {};
  const [localPage, setLocalPage] = useState(() => ({ dataSource, page: pager.defaultCurrentPage ?? 1 }));
  if (pagination && pager.currentPage == null && localPage.dataSource !== dataSource) setLocalPage({ dataSource, page: 1 });
  const [localPageSize, setLocalPageSize] = useState(null);
  const filters = columns.flatMap((column, index) => column.filters?.length ? [{
    key: sortColumnKey(column, index), dataIndex: column.dataIndex, onFilter: column.onFilter,
    filteredValue: column.filteredValue ?? localFilters[sortColumnKey(column, index)] ?? [],
  }] : []);
  const localRowFilters = filters.filter(filter => filter.onFilter && filter.filteredValue.length);
  const filteredRows = localRowFilters.length
    ? dataSource.filter(row => localRowFilters.every(filter => filter.filteredValue.some(value => filter.onFilter(value, row))))
    : dataSource;
  const controlled = columns.some(column => Object.hasOwn(column, 'sortOrder'));
  const activeIndex = columns.findIndex((column, index) => controlled
    ? sortState[column.sortOrder] : sortColumnKey(column, index) === localSort?.key);
  const activeColumn = columns[activeIndex];
  const activeOrder = controlled ? activeColumn?.sortOrder : localSort?.order;
  const orderedRows = typeof activeColumn?.sorter === 'function' && activeOrder
    ? filteredRows.toSorted((left, right) => activeColumn.sorter(left, right) * (activeOrder === 'ascend' ? 1 : -1))
    : filteredRows;
  const pageSize = pager.onPageSizeChange ? (pager.pageSize ?? localPageSize ?? 10) : (localPageSize ?? pager.pageSize ?? 10);
  const total = pager.total ?? orderedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = pager.currentPage == null ? (localPage.page <= pageCount ? localPage.page : 1)
    : Math.min(Math.max(1, pager.currentPage), pageCount);
  const rows = pagination && pager.currentPage == null
    ? orderedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : orderedRows;
  const activeSorter = activeColumn && { dataIndex: activeColumn.dataIndex, key: sortColumnKey(activeColumn, activeIndex), sortOrder: activeOrder };
  const notifyChange = (changeType, { page = currentPage, size = pageSize, sorter = activeSorter, nextFilters = filters } = {}) => {
    if (scroll?.scrollToFirstRowOnChange && scrollViewport.current) scrollViewport.current.scrollTop = 0;
    onChange?.({ sorter, filters: nextFilters.map(({ key, dataIndex, filteredValue }) => ({ key, dataIndex, filteredValue })),
      pagination: pagination ? { ...pager, currentPage: page, pageSize: size, total } : {}, extra: { changeType } });
  };
  const changePage = next => {
    if (pager.currentPage == null) setLocalPage({ dataSource, page: next });
    pager.onPageChange?.(next);
    pager.onChange?.(next, pageSize);
    notifyChange('pagination', { page: next });
  };
  const changePageSize = next => {
    setLocalPageSize(next);
    if (pager.currentPage == null) setLocalPage({ dataSource, page: 1 });
    pager.onPageSizeChange?.(next);
    pager.onChange?.(1, next);
    notifyChange('pagination', { page: 1, size: next });
  };
  const expanded = new Set(expandedRowKeys ?? localExpanded);
  const expandable = Boolean(expandedRowRender);
  const showExpansion = expandable && !hideExpandedColumn && expandIcon !== false;
  const targets = new Map();
  const columnSpecs = columns.map(({ title, width, align, fixed, render, className, ellipsis }) => ({
    title: typeof title === 'string' || typeof title === 'number' ? t(String(title)) : null,
    width: typeof width === 'string' && width.endsWith('%') ? NaN : Number.parseFloat(width),
    align, fixed: fixed === true ? 'left' : fixed, className, custom: Boolean(render || ellipsis),
  }));
  const selectionWidth = rowSelection?.width ?? 42;
  const requestedWidth = typeof scroll?.x === 'number' ? scroll.x : Number.parseFloat(scroll?.x?.match?.(/\d+(?:\.\d+)?px/)?.[0]);
  const baseWidth = columnSpecs.reduce((sum, column) => sum + (column.width || 0),
    (rowSelection ? selectionWidth : 0) + (showExpansion ? 42 : 0));
  const flexibleCount = columnSpecs.filter(column => !column.fixed).length;
  const extraWidth = Math.max(0, requestedWidth - baseWidth) / flexibleCount;
  if (Number.isFinite(extraWidth) && extraWidth > 0) {
    columnSpecs.forEach(column => { if (!column.fixed) column.width = (column.width || 0) + extraWidth; });
  }
  const selectedKeys = new Set(rowSelection?.selectedRowKeys ?? localSelection);
  const selectionOptions = rowSelection ? rows.map(row => rowSelection.getCheckboxProps?.(row) ?? {}) : [];
  checkboxLabels.current = selectionOptions.map(({ 'aria-label': name }) => name);
  const keyFor = (row, index) => (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]) ?? index;
  rowAttrs.current = rows.map((row, index) => onRow?.(row, index) ?? {});
  const data = rows.map((row, rowIndex) => {
    const key = keyFor(row, (currentPage - 1) * pageSize + rowIndex);
    const native = { [nativeKey]: key };
    if (rowSelection) {
      native._checked = selectedKeys.has(key);
      native._disabled = Boolean(rowSelection.disabled || selectionOptions[rowIndex].disabled);
    }
    if (expandable) {
      native._disableExpand = rowExpandable?.(row) === false;
      native._expanded = expanded.has(key) && !native._disableExpand;
      if (native._expanded) targets.set(expandedKey(key), expandedRowRender(row, rowIndex));
    }
    columns.forEach((column, index) => {
      const value = valueAt(row, column.dataIndex);
      const field = columnKey(index);
      if (!columnSpecs[index].custom) {
        native[field] = value;
        return;
      }
      const rendered = column.render ? column.render(value, row, rowIndex) : value;
      if (rendered && typeof rendered === 'object' && Object.hasOwn(rendered, 'children') && Object.hasOwn(rendered, 'props')) {
        const { rowSpan, colSpan, className: cellClass } = rendered.props ?? {};
        if (rowSpan != null || colSpan != null) {
          (native._xa24CellSpans ??= {})[field] = [rowSpan ?? 1, colSpan ?? 1];
        }
        if (cellClass) (native.cellClassName ??= {})[field] = cellClass;
        targets.set(cellKey(key, index), rendered.children);
      } else if (column.ellipsis) {
        const title = column.ellipsis.showTitle && (typeof rendered === 'string' || typeof rendered === 'number') ? String(rendered) : undefined;
        targets.set(cellKey(key, index), <span className="xa24-ellipsis" title={title}>{rendered}</span>);
      } else {
        targets.set(cellKey(key, index), rendered);
      }
    });
    return native;
  });
  const enabledRows = data.filter(row => !row._disabled);
  const allSelected = enabledRows.length > 0 && enabledRows.every(row => row._checked);
  const headerCheckbox = rowSelection?.renderCell?.({ inHeader: true, selected: allSelected, originNode: <input type="checkbox"/> });
  selectAllLabel.current = headerCheckbox?.props?.['aria-label'];
  columnSpecs.forEach(({ title }, index) => {
    const column = columns[index];
    const key = sortColumnKey(column, index);
    const filter = column.filters?.length ? filters.find(item => item.key === key) : undefined;
    const order = activeIndex === index ? activeOrder : undefined;
    const headerAttrs = column.onHeaderCell?.({ ...column, sortOrder: order });
    if (!column.sorter && !headerAttrs && !filter && title !== null) return;
    const Arrow = sortIcons[order] ?? ArrowUpDown;
    const content = title ?? column.title;
    const action = column.sorter && <HaloHost as="span" component={EButton}
      vueProps={{ type: 'text', size: 'small', 'aria-label': title ? t('排序') + ' ' + title : t('排序'),
        onClick: () => {
          const directions = column.sortDirections ?? ['ascend', 'descend'];
          const next = directions[directions.indexOf(order) + 1];
          if (!controlled) setLocalSort(next ? { key, order: next } : null);
          notifyChange('sorter', { sorter: { dataIndex: column.dataIndex, key, sortOrder: next } });
        },
      }}>
      {title !== null && title}<Arrow size={13} aria-hidden="true"/>
    </HaloHost>;
    targets.set(headerKey(index), <span data-xa24-sort={headerAttrs?.['aria-sort'] ?? (column.sorter ? sortState[order] ?? 'none' : undefined)}
      data-xa24-scope={headerAttrs?.scope ?? 'col'}>{column.sorter && title !== null ? action : <>{content}{action}</>}
      {filter && <ColumnFilter title={title ?? column.dataIndex} options={column.filters} values={filter.filteredValue} multiple={column.filterMultiple !== false}
        onChange={filteredValue => {
          if (column.filteredValue == null) setLocalFilters(previous => ({ ...previous, [key]: filteredValue }));
          notifyChange('filter', { nextFilters: filters.map(item => item === filter ? { ...item, filteredValue } : item) });
        }}/>}
    </span>);
    columnSpecs[index].title = null;
  });
  const activeSignature = JSON.stringify([rowSelection && [selectionWidth, rowSelection.hideSelectAll], showExpansion, columnSpecs]);
  targets.set('empty', typeof empty === 'string' ? t(empty) : empty);
  const viewportHeight = typeof scroll?.y === 'number' ? scroll.y : Number(scroll?.y?.match?.(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/)?.[1]);
  const relativeHeight = typeof scroll?.y === 'string' && !Number.isFinite(viewportHeight) ? scroll.y : null;

  const markScrollViewport = useCallback(host => {
    if (!host) return;
    let frame;
    const viewport = () => host.querySelector(':scope > .haloe-table-wrapper > .haloe-table > .haloe-table-body');
    const markRows = body => {
      body.querySelectorAll(':scope > table > tbody > .haloe-table-row').forEach((row, index) => {
        row.dataset.xa24ListRow = String(index);
        Object.entries(rowAttrs.current[index] ?? {}).forEach(([attribute, value]) => {
          if (/^(data-|aria-)/.test(attribute) && value != null) row.setAttribute(attribute, String(value));
        });
      });
    };
    const sync = () => {
      frame = undefined;
      const body = viewport();
      if (!body) return;
      const overflow = body.scrollWidth > body.clientWidth || body.scrollHeight > body.clientHeight;
      if (overflow) {
        body.tabIndex = 0;
        body.setAttribute('role', 'region');
        if (labelledBy) body.setAttribute('aria-labelledby', labelledBy);
        else body.setAttribute('aria-label', label || t('表格'));
      } else {
        body.removeAttribute('tabindex');
        body.removeAttribute('role');
        body.removeAttribute('aria-label');
        body.removeAttribute('aria-labelledby');
      }
      const sections = [...body.parentElement.querySelectorAll(
        ':scope > :is(.haloe-table-fixed, .haloe-table-fixed-right) > .haloe-table-fixed-body',
      )];
      body.querySelectorAll(':scope > table > tbody > .haloe-table-row').forEach(row => {
        const toggle = row.querySelector(':scope > td .haloe-table-cell-expand');
        if (toggle) {
          const open = toggle.classList.contains('haloe-table-cell-expand-expanded');
          toggle.tabIndex = 0;
          toggle.setAttribute('role', 'button');
          toggle.setAttribute('aria-expanded', String(open));
          toggle.setAttribute('aria-label', t(open ? '收起详情' : '展开详情'));
        }
      });
      body.querySelectorAll(':scope > table > tbody > .haloe-table-row .haloe-table-cell-with-selection input[type="checkbox"]')
        .forEach((input, index) => {
          input.setAttribute('aria-label', checkboxLabels.current[index] || t('选择') + ' ' + (index + 1));
      });
      body.parentElement.querySelector(':scope > .haloe-table-header input[type="checkbox"]')
        ?.setAttribute('aria-label', selectAllLabel.current || t('全选'));
      body.parentElement.querySelectorAll('[data-xa24-sort], [data-xa24-scope]').forEach(marker => {
        const cell = marker.closest('th');
        if (!cell) return;
        if (marker.dataset.xa24Sort && marker.dataset.xa24Sort !== 'none') cell.setAttribute('aria-sort', marker.dataset.xa24Sort);
        else cell.removeAttribute('aria-sort');
        if (marker.dataset.xa24Scope) cell.setAttribute('scope', marker.dataset.xa24Scope);
      });
      if (!sections.length) return;
      // HaloE uses separate tables for fixed columns. Match each clone to its row after React fills the cells.
      const rowSets = [body, ...sections].map(section => [...section.querySelectorAll(':scope > table > tbody > tr')]);
      const rows = rowSets.flat();
      rows.forEach(row => { row.style.height = ''; });
      const heights = rowSets[0].map((_, index) => Math.max(...rowSets.map(set => set[index]?.getBoundingClientRect().height ?? 0)));
      rowSets.forEach(set => set.forEach((row, index) => {
        if (heights[index]) row.style.height = heights[index] + 'px';
      }));
    };
    const schedule = () => {
      const body = viewport();
      if (body) {
        scrollViewport.current = body;
        body.classList.add('xa24-table-scroll');
        if (onRow) markRows(body);
      }
      frame ??= requestAnimationFrame(sync);
    };
    const changes = new MutationObserver(schedule);
    changes.observe(host, { childList: true, characterData: true, attributes: true,
      attributeFilter: ['data-xa24-sort', 'data-xa24-scope'], subtree: true });
    const layout = new ResizeObserver(schedule);
    layout.observe(host);
    schedule();
    return () => {
      changes.disconnect();
      layout.disconnect();
      scrollViewport.current = null;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [label, labelledBy, onRow, t]);

  const rowEvent = name => event => {
    const row = event.target.closest('tr[data-xa24-list-row]');
    if (row?.closest('.xa24-table-host') === event.currentTarget) rowAttrs.current[row.dataset.xa24ListRow]?.[name]?.(event);
  };
  return <><HaloHost hostRef={markScrollViewport} className={['xa24-table-host', className].filter(Boolean).join(' ')}
    role={label || labelledBy ? 'group' : undefined} aria-label={label} aria-labelledby={labelledBy}
    data-xa24-table-height={relativeHeight ? '' : undefined}
    style={relativeHeight ? { '--xa24-table-max-height': relativeHeight } : undefined}
    onDragOver={onRow && rowEvent('onDragOver')} onDrop={onRow && rowEvent('onDrop')}
    onKeyDown={showExpansion ? event => {
      if (!event.target.matches('.haloe-table-cell-expand') || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.target.click();
    } : undefined}
    renderVue={target => {
      if (columnCache.current?.signature !== activeSignature || columnCache.current.target !== target) {
        // HaloE rebuilds its cell DOM when columns change. Keep column identity stable on selection and row updates.
        const nativeColumns = columnSpecs.map(({ title, width, align, fixed, className, custom }, index) => ({
          key: columnKey(index), title: title ?? '', align, fixed, className,
          ...(Number.isFinite(width) && { minWidth: width, ...(fixed && { width }) }),
          ...(custom && { render: (_, { row }) => target(cellKey(row[nativeKey], index), 'span', visibleCell) }),
          ...(title === null && { renderHeader: () => target(headerKey(index), 'span', visibleCell) }),
        }));
        if (showExpansion) nativeColumns.unshift({ type: 'expand', width: 42, align: 'center' });
        if (rowSelection) nativeColumns.unshift({ type: 'selection', width: selectionWidth, align: 'center', hideSelectAll: rowSelection.hideSelectAll });
        columnCache.current = { signature: activeSignature, target, columns: nativeColumns };
      }
      return h(ETable, {
        columns: columnCache.current.columns, data, rowKey: nativeKey, loading, showHeader, border: bordered,
        size: size === 'small' ? 'small' : 'default', maxHeight: Number.isFinite(viewportHeight) ? viewportHeight : undefined,
        spanMethod: data.some(row => row._xa24CellSpans) ? ({ row, column }) => row._xa24CellSpans?.[column.key] ?? [1, 1] : undefined,
        rowClassName: (rowClassName || onRow) && ((_, index) =>
          [rowClassName?.(rows[index], index), rowAttrs.current[index]?.className].filter(Boolean).join(' ')),
        onOnExpand: showExpansion && ((row, open) => {
          const key = row[nativeKey];
          const keys = open ? [...new Set([...expanded, key])] : [...expanded].filter(id => id !== key);
          if (expandedRowKeys == null) setLocalExpanded(keys);
          const index = data.findIndex(item => item[nativeKey] === key);
          onExpand?.(open, rows[index]);
          onExpandedRowsChange?.(orderedRows.filter((item, itemIndex) => keys.includes(
            keyFor(item, pager.currentPage == null ? itemIndex : (currentPage - 1) * pageSize + itemIndex),
          )));
        }),
        onOnSelectionChange: rowSelection && (selection => {
          const visibleKeys = new Set(data.map(row => row[nativeKey]));
          const keys = [...[...selectedKeys].filter(key => !visibleKeys.has(key)), ...selection.map(row => row[nativeKey])];
          if (rowSelection.selectedRowKeys === undefined) setLocalSelection(keys);
          rowSelection.onChange?.(keys, rows.filter((_, index) => keys.includes(data[index][nativeKey])));
        }),
      }, { empty: () => target('empty'),
        ...(expandable && { expandSlot: ({ row }) => target(expandedKey(row[nativeKey]), 'div', visibleCell) }),
      });
    }}
    portals={targets}/>
    {pagination && renderPagination?.({ ...pager, currentPage, pageSize, total, onChange: undefined,
      onPageChange: changePage, onPageSizeChange: changePageSize })}
  </>;
}
