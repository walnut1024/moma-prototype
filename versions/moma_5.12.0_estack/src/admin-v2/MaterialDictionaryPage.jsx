import {Banner,Button as SemiButton} from '@douyinfe/semi-ui';
import {useOperations} from './ModelOperationsUI';
import MaterialsHeader,{materialOperationsUi} from './MaterialsHeader';
import MaterialDictionary from './MaterialDictionary';
import {TARIFF_KINDS} from './tariff-dictionary';
import {operationsReturn} from './model-pricing-workspace';

export default function MaterialDictionaryPage(props) {
  const ops = useOperations({...props,...materialOperationsUi}, 'tariff-dictionary');
  const tab = ops.params.get('tab'), kind = Object.hasOwn(TARIFF_KINDS, tab) ? tab : 'scenario';
  const returnTo = operationsReturn(ops.params.get('returnTo'));
  return <div className="semi-materials materials-page"><MaterialsHeader active={kind} ops={ops}>{returnTo && <SemiButton onClick={()=>ops.proceed(()=>{location.hash=returnTo;})}>返回来源页面</SemiButton>}</MaterialsHeader><MaterialDictionary key={kind} kind={kind} state={props.state} ops={ops}/>{ops.error && <Banner type="danger" description={ops.error}/>}{ops.leaveDialog}</div>;
}
