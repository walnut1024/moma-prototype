import { useChannelText } from './channel-language';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { CHANNEL_LIST_TYPES, channelProtocolPaths, channelProtocolUsesFullAddress } from './channel-connection-directory';
import { workbenchProtocolLabel } from './workbench-protocol';
import { Choice, Field } from './ServiceUI';

import { connectionRequestUrl } from './channel-interface';

const options = CHANNEL_LIST_TYPES.map(({ id, label }) => [id, workbenchProtocolLabel(label)]);

export default function ChannelProtocolFields({
  protocol, baseUrl, allowHttp, disabled, current, root, allowCustom, endpointPath, onProtocolChange, onBaseUrlChange, onEndpointPathChange, showHelp, showPaths,
}) {
  const t = useChannelText();
  const paths = channelProtocolPaths({ interfaceType: protocol, baseUrl, allowHttp }, current);
  const editable = Boolean(onEndpointPathChange && options.some(([id]) => id === protocol));
  const displayedPath = endpointPath ?? paths[0];
  const repeated = editable && displayedPath && baseUrl.trim().replace(/\/+$/, '').endsWith(displayedPath);
  const suggestedBase = repeated ? baseUrl.trim().replace(/\/+$/, '').slice(0, -displayedPath.length) : root;
  const pathHelp = showHelp ? t('接口端点随接口格式带出。可填写自定义路径，以 / 开头。') : undefined;
  return <>
    <Field label={t('接口格式')} required help={showHelp ? t('选择上游 API 使用的接口格式。') : undefined}><Choice label={t('接口格式')}
      value={protocol && protocol !== 'custom' ? protocol : undefined}
      placeholder={t(protocol === 'custom' ? '自定义 API' : '请选择接口格式')}
      disabled={disabled} options={showPaths ? options.map(([id, label]) => {
        const path = id === protocol ? endpointPath ?? paths[0] : channelProtocolPaths({ interfaceType: id, baseUrl, allowHttp })[0];
        return [id, path ? label + ' (' + path + ')' : label];
      }) : options} showClear={allowCustom}
      onChange={value => onProtocolChange(value ?? 'custom')}/></Field>
    <Field label={t('接口端点')} required={editable || showHelp} help={pathHelp}>
      {onEndpointPathChange && (editable || !protocol) ?
        <Input aria-label={t('接口端点')} value={endpointPath ?? paths[0] ?? ''} maxLength={2048}
          disabled={disabled || !editable} onChange={onEndpointPathChange}
          placeholder={!editable ? t('请选择接口格式') : undefined}/> :
        <div aria-live="polite" style={{ overflowWrap: 'anywhere' }}>
          {paths.length ? paths.map(path => <div key={path}><Typography.Text code>{path}</Typography.Text></div>) : '—'}
        </div>}
    </Field>
    <Field label={t('服务地址')} required help={showHelp ? t('填写上游服务的基础地址，端点路径单独配置。') : undefined}
      hint={protocol && !editable ? channelProtocolUsesFullAddress(protocol, current)
      ? t('填写完整请求地址') : t('填写服务地址') : undefined}>
      <Input aria-label={t('服务地址')} value={baseUrl} maxLength={2048} disabled={disabled} onChange={onBaseUrlChange}/>
    </Field>
    {repeated && <Typography.Text type="danger" role="alert">{t('服务地址已包含接口端点，请删除服务地址末尾的重复部分')}</Typography.Text>}
    {editable && !repeated && baseUrl.trim() && displayedPath && <Field label={t('完整请求地址')}>
      <Typography.Text code aria-live="polite">{connectionRequestUrl(baseUrl.trim(), displayedPath)}</Typography.Text>
    </Field>}
    {suggestedBase && <Button theme="borderless" disabled={disabled} onClick={() => onBaseUrlChange(suggestedBase)}>{t('使用建议的服务地址')} {suggestedBase}</Button>}
  </>;
}
