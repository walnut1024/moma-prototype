import { Children, cloneElement, isValidElement, useCallback, useId, useLayoutEffect, useRef } from 'react';
import { Modal, SideSheet } from '@douyinfe/semi-ui';

export function AdminModal({
  title, width, size, maskClosable = false,
  okText = '确定', cancelText = '取消', okButtonProps, cancelButtonProps, ...props
}) {
  const titleId = useId();
  const bodyId = titleId + '-body';
  const labelModal = modal => {
    // Semi uses the same title and body IDs for each portal.
    const [header, body, footer] = modal.props.children;
    const labelHeaderChild = child => {
      if (!isValidElement(child)) return child;
      if (child.props.id === modal.props['aria-labelledby']) return cloneElement(child, { id: titleId });
      if (child.props['aria-label'] === 'close') return cloneElement(child, { 'aria-label': '关闭' });
      return child;
    };
    const labeledHeader = isValidElement(header)
      ? cloneElement(header, {}, Children.map(header.props.children, labelHeaderChild))
      : header;
    const describedBody = body?.props.id ? cloneElement(body, { id: bodyId }) : body;
    return cloneElement(modal, {
      'aria-labelledby': title != null ? titleId : undefined,
      'aria-describedby': body?.props.id ? bodyId : undefined,
    }, labeledHeader, describedBody, footer);
  };

  return <Modal {...props} title={title} size={size} width={width ?? (size ? undefined : 'min(448px, calc(100vw - 32px))')}
    maskClosable={maskClosable} modalRender={labelModal}
    okText={okText} okButtonProps={{ 'aria-label': typeof okText === 'string' ? okText : undefined, ...okButtonProps }}
    cancelText={cancelText} cancelButtonProps={{ 'aria-label': typeof cancelText === 'string' ? cancelText : undefined, ...cancelButtonProps }}/>;
}

export function AdminSideSheet({ title, label, maskClosable = false, ...props }) {
  const titleId = useId();
  const opener = useRef(null);
  const labelSheet = useCallback(node => {
    const dialog = node?.closest('[role="dialog"]');
    if (!dialog) return;
    if (label) dialog.setAttribute('aria-label', label);
    else dialog.setAttribute('aria-labelledby', titleId);
    dialog.querySelector('.semi-sidesheet-close')?.setAttribute('aria-label', '关闭');
    if (!dialog.contains(document.activeElement)) {
      opener.current ??= document.activeElement;
      dialog.focus({ preventScroll: true });
    }
  }, [label, titleId]);

  useLayoutEffect(() => () => {
    const target = opener.current;
    requestAnimationFrame(() => {
      if (document.activeElement === document.body && target?.isConnected) target.focus({ preventScroll: true });
    });
  }, []);

  return <SideSheet {...props} maskClosable={maskClosable}
    title={title == null ? title : <div id={titleId} ref={labelSheet}>{title}</div>}/>;
}
