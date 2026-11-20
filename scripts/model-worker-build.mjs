import {readFile} from 'node:fs/promises';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const version = fileURLToPath(new URL('../versions/moma_5.12.0_estack/', import.meta.url));
const snapshots = {
  '7e451843': new Set([
    'src/mock/catalogues.json',
    'src/deployment-license.mjs',
    'src/admin-v2/usage-analysis.js',
    'src/site-config.mjs',
    'src/admin-v2/navigation.mjs',
  ]),
};

// Large browser seed catalogues must not allocate all their objects on a free Worker cold start.
export const modelWorkerDataPlugin={name:'lazy-model-reference-data',setup(build){
  const snapshot = process.env.MOMA_WORKER_SNAPSHOT;
  if (snapshot && !Object.hasOwn(snapshots, snapshot)) throw new Error('Unknown Worker source snapshot: ' + snapshot);
  const input = path => {
    const source = relative(version, path);
    return snapshots[snapshot]?.has(source) ? join(version, 'worker-snapshots', snapshot, source) : path;
  };
  build.onLoad({filter:/src\/mock\/(application|catalogues|system-model-catalogue|initial-workspace|model-operations)\.json$/},async({path})=>{
    const source=JSON.parse(await readFile(input(path),'utf8'));
    const properties=Object.entries(source).map(([key,value])=>`${JSON.stringify(key)}:{enumerable:true,get(){return data[${JSON.stringify(key)}]??=JSON.parse(${JSON.stringify(JSON.stringify(value))});}}`);
    return {contents:`const data={};export default Object.defineProperties({}, {${properties.join(',')}});`,loader:'js'};
  });
  if (snapshot) build.onLoad({filter:/\/src\/.*\.(?:js|mjs)$/}, async ({path}) => {
    const source = input(path);
    if (source === path) return;
    return {contents: await readFile(source, 'utf8'), loader: 'js', resolveDir: dirname(path), watchFiles: [source]};
  });
}};
