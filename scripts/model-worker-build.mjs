import {readFile} from 'node:fs/promises';

// Large browser seed catalogues must not allocate all their objects on a free Worker cold start.
export const modelWorkerDataPlugin={name:'lazy-model-reference-data',setup(build){
  build.onLoad({filter:/src\/mock\/(application|catalogues|system-model-catalogue|initial-workspace|model-operations)\.json$/},async({path})=>{
    const source=JSON.parse(await readFile(path,'utf8'));
    const properties=Object.entries(source).map(([key,value])=>`${JSON.stringify(key)}:{enumerable:true,get(){return data[${JSON.stringify(key)}]??=JSON.parse(${JSON.stringify(JSON.stringify(value))});}}`);
    return {contents:`const data={};export default Object.defineProperties({}, {${properties.join(',')}});`,loader:'js'};
  });
}};
