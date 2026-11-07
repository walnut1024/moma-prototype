import {modelProfileDraft} from './model-profile.js';
import {displayBusinessCopy} from '../display-copy.mjs';

export const modelMetadataDraft = model => ({modelId:model?.modelId || '',name:model?.name || '',maker:model?.maker?.replace(/[（(]示意[）)]/g,'').trim() || '',description:displayBusinessCopy(model?.description) || '',type:model?.type || 'text',usageUnit:model?.usageUnit || '',profile:modelProfileDraft(model),capabilities:{streaming:null,tools:null,context:null,output:null,...model?.capabilities}});
