import { useChannelText } from './channel-language';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { CHANNEL_LIST_TYPES, channelProtocolPaths, channelProtocolUsesFullAddress } from './channel-connection-directory';
import { workbenchProtocolLabel } from './workbench-protocol';
import { Choice, Field } from './ServiceUI';

const options = CHANNEL_LIST_TYPES.map(({ id, label }) => [id, workbenchProtocolLabel(label)]);

export default function ChannelProtocolFields({
  protocol, baseUrl, allowHttp, disabled, current, root, allowCustom, endpointPath, onProtocolChange, onBaseUrlChange, onEndpointPathChange, showHelp,
}) {
  const t = useChannelText();
  const paths = channelProtocolPaths({ interfaceType: protocol, baseUrl, allowHttp }, current);
  const editable = Boolean(onEndpointPathChange && options.some(([id]) => id === protocol));
  const pathHelp = showHelp ? t('接口端点随接口格式带出。可填写自定义路径，以 / 开头。') : undefined;
  return <>
    <Field label={t('接口格式')} required help={showHelp ? t('选择上游 API 使用的接口格式。') : undefined}><Choice label={t('接口格式')}
      value={protocol && protocol !== 'custom' ? protocol : undefined}
      placeholder={t(protocol === 'custom' ? '自定义 API' : '请选择接口格式')}
      disabled={disabled} options={options} showClear={allowCustom}
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
      ? t('填写完整接口地址') : t('填写服务根地址') : undefined}>
      <Input aria-label={t('服务地址')} value={baseUrl} maxLength={2048} disabled={disabled} onChange={onBaseUrlChange}/>
    </Field>
    {root && <Button theme="borderless" disabled={disabled} onClick={() => onBaseUrlChange(root)}>{t('使用根地址')} {root}</Button>}
  </>;
}
