import {CircleHelp} from 'lucide-react';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from '../components/ui/tooltip';

import {modelFieldDescriptions as explanations} from './model-field-descriptions';

export default function ModelFieldLabel({name,required=false,description=explanations[name],tooltipClassName}) {
  return <span className="mm-field-title">{name}{required?' *':''}{description && <TooltipProvider><Tooltip><TooltipTrigger asChild><button className="mm-field-help" type="button" aria-label={`${name}说明`}><CircleHelp size={13}/></button></TooltipTrigger><TooltipContent className={tooltipClassName}>{description}</TooltipContent></Tooltip></TooltipProvider>}</span>;
}
