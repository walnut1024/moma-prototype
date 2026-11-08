import { useEffect, useRef, useState } from 'react';
import { MARKET_EVENT, marketRequest } from './CloudMarket';
import { cloudMarketPresentation } from './service-directory.mjs';

const empty = { keys:[], routes:[], orders:[], plans:[], services:[], projects:[], requests:[], models:[],
  organization:{ departments:[], members:[], audit:[] }, error:'' };

export function useTenantData() {
  const [data, setData] = useState(empty);
  const [refresh, setRefresh] = useState(0);
  const pending=useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    marketRequest('workspace', null, controller.signal).then(result => {
      if (!controller.signal.aborted) setData({ ...result, services:result.services.map(cloudMarketPresentation), error:'' });
    }).catch(error => {
      if (!controller.signal.aborted) setData({ ...empty, error:error.message });
    });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    const update = event => {
      if(['login','logout','switch'].includes(event.detail)){pending.current=null;setData(empty);}
      setRefresh(value => value+1);
    };
    window.addEventListener(MARKET_EVENT, update);
    window.addEventListener('focus', update);
    return () => { window.removeEventListener(MARKET_EVENT, update); window.removeEventListener('focus', update); };
  }, []);
  return { ...data, reload:() => setRefresh(value => value+1),
    command: async (action, payload, expectedRevision = data.revision) => {
      if (!data.identity) throw Error('请先登录客户账号');
      const input={tenantId:data.identity.tenantId,expectedRevision,action,data:payload},signature=JSON.stringify(input);
      const receipt=pending.current?.signature===signature?pending.current:{signature,id:crypto.randomUUID()};
      pending.current=receipt;
      let result;
      try {
        result=await marketRequest('commands',{operationId:receipt.id,...input});
      } catch(error) {
        if(error.status<500 && pending.current===receipt)pending.current=null;
        throw error;
      }
      if(pending.current===receipt)pending.current=null;
      window.dispatchEvent(new Event(MARKET_EVENT));
      return result;
    },
  };
}
