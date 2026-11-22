import GuideGlossary from './GuideGlossary';
import { parseOperationsGuide } from './model-operations-guide.mjs';
import fieldsSource from '../../MODEL_OPERATIONS_GUIDE_FIELDS.md?raw';

const [fields] = parseOperationsGuide(fieldsSource);

export function ModelOperationsGuide({ english }) {
  return <GuideGlossary section={fields} english={english}/>;
}
