import { useChannelText } from './channel-language';
import { Banner, Button } from './xa24/HaloUI.jsx';
import {useOperations} from './ModelOperationsUI';
import MaterialsHeader,{materialOperationsUi} from './MaterialsHeader';
import MaterialDictionary from './MaterialDictionary';
import {TARIFF_KINDS} from './tariff-dictionary';
import {operationsReturn} from './model-pricing-workspace';

export default function MaterialDictionaryPage(props) {
  const translateLabel = useChannelText();
  const ops = useOperations({...props,...materialOperationsUi}, 'tariff-dictionary');
  const tab = ops.params.get('tab'), kind = Object.hasOwn(TARIFF_KINDS, tab) ? tab : 'scenario';
  const returnTo = operationsReturn(ops.params.get('returnTo'));
  const actions = returnTo && <Button onClick={() => ops.proceed(() => { location.hash = returnTo; })}>{translateLabel("返回来源页面")}</Button>;
  return <div className="semi-materials admin-page-stack">
    <MaterialsHeader active={kind} ops={ops} actions={actions}>
      <MaterialDictionary key={kind} kind={kind} state={props.state}/>
      {ops.error && <Banner type="danger" description={ops.error}/>}
    </MaterialsHeader>
    {ops.leaveDialog}
  </div>;
}
