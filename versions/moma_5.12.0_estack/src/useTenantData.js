import {useCallback,useEffect,useState} from 'react';
import {tenantData, createTenantProject, updateTenantProject, saveTenantKeys} from './tenant-data.mjs';
import {LINK_EVENT} from './service-access.mjs';
const read=usageReport=>{try{return tenantData(undefined,{usageReport});}catch(error){return {keys:[],routes:[],orders:[],plans:[],services:[],projects:[],requests:[],models:[],organization:{departments:[],members:[],audit:[]},error:error.message};}};
export function useTenantData({ usageReport = false } = {}) {
  const [data, setData] = useState(() => read(usageReport));
  const reload = useCallback(() => setData(read(usageReport)), [usageReport]);
  useEffect(() => {
    for (const event of [LINK_EVENT,'storage','focus']) window.addEventListener(event, reload);
    return () => { for (const event of [LINK_EVENT,'storage','focus']) window.removeEventListener(event, reload); };
  }, [reload]);
  return { ...data, reload, createProject:createTenantProject, updateProject:updateTenantProject, saveProjectKeys:saveTenantKeys };
}
