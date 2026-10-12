import { parseDelimitedCells } from '../tabular-import.mjs';
import { modelCode } from './model-management.js';
import { operationsTransaction } from './model-operations.js';
export const SUPPLY_HEADERS = ['模型编码', '接入名称', '上游Model ID', '计价单位', '输入或单价', '输出采购价', '实际上下文Token', '实际最大输出Token'];
export function parseSupplyImport(state, providerId, text) {
  const cells = parseDelimitedCells(text).filter(row => row.some(value => String(value ?? '').trim()));
  if (cells[0]?.length !== SUPPLY_HEADERS.length || SUPPLY_HEADERS.some((label,index) => cells[0][index] !== label)) throw new Error('请保留八列表头及顺序');
  if (cells.length < 2 || cells.length > 501) throw new Error('每批需录入 1–500 条供给');
  const working = structuredClone(state);
  return cells.slice(1).map((cells,index) => {
    try {
      const [code,name,upstreamModelId,unit,inputPrice,outputPrice,context,output] = cells.map(value=>String(value??'').trim());
      if (cells.length > SUPPLY_HEADERS.length) throw new Error('列数超过模板范围');
      const model=state.models.find(model=>modelCode(model)===code), endpoint=state.endpoints.find(ep=>ep.providerId===providerId&&ep.name===name);
      if (!model) throw new Error('模型不存在，请先添加模型资料');
      if (!endpoint) throw new Error('接入名称不存在，请先配置连接');
      const data={modelId:model.id,endpointId:endpoint.id,upstreamModelId,capabilities:{context,output,streaming:false,tools:false},procurement:{unit,inputPrice,outputPrice,cachedPrice:'',cacheWritePrice:''}};
      const transaction=operationsTransaction(working,{operation:'connectSupply',modelId:model.id,data:{...data,providerId}});
      for(const change of transaction.changes){if(change.type==='add')working[change.collection].push(change.record);else Object.assign(working[change.collection].find(item=>item.id===change.id),change.changes);}
      return {row:index+2,cells,data,error:null};
    }catch(error){return {row:index+2,cells,error:error.message};}
  });
}
