// Domain records retain stable relation IDs; persisted model documents use catalogue field names.
export const MODEL_FIELDS = [
  ['id','record_id'], ['modelId','canonical_slug'],
  ['profile.inputModalities','architecture.input_modalities'], ['profile.outputModalities','architecture.output_modalities'],
  ['profile.tokenizer','architecture.tokenizer'], ['profile.instructType','architecture.instruct_type'],
  ['capabilities.context','context_length'], ['capabilities.output','max_completion_tokens'],
  ['profile.supportedParameters','supported_parameters'], ['profile.defaultParameters','default_parameters'],
  ['profile.voices','supported_voices'], ['profile.knowledgeCutoff','knowledge_cutoff'],
  ['profile.huggingFaceId','hugging_face_id'], ['profile.releaseDate','release_date'],
  ['profile.retirementDate','expiration_date'], ['profile.inputFormats','profile.input_formats'],
  ['profile.inputMethods','profile.input_methods'], ['profile.resultTypes','profile.result_types'],
  ['profile.detailDescription','profile.detail_description'], ['profile.parameterRules','profile.parameter_rules'],
  ['profile.sourceUpdated','profile.source_updated'], ['profile.sourceStatus','profile.source_status'],
];
const fields = service => MODEL_FIELDS.map(([from,to])=>[from,service && from==='modelId'?'id':to]);
function move(record, from, to) {
  const source=from.split('.'), target=to.split('.');
  let parent=record;for(const key of source.slice(0,-1))parent=parent?.[key];
  const key=source.at(-1);if(!parent || !Object.hasOwn(parent,key))return;
  const value=parent[key];delete parent[key];
  let destination=record;for(const key of target.slice(0,-1))destination=destination[key] ||= {};
  destination[target.at(-1)]=value;
}
export function storedModel(record, service=false) {
  const result=structuredClone(record);for(const [from,to]of fields(service))move(result,from,to);return result;
}
export function domainModel(record, service=false) {
  const result=structuredClone(record);for(const [from,to]of [...fields(service)].reverse())move(result,to,from);
  // Remove only containers created by the field projection.
  if(result.architecture && !Object.keys(result.architecture).length)delete result.architecture;
  return result;
}
export function domainModelWorkspace(state) {
  return {...state,models:state.models.map(row=>domainModel(row,true)),modelTemplates:state.modelTemplates.map(row=>domainModel(row))};
}
