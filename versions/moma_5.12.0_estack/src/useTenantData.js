import { maskedProjectKeys } from './project-keys.mjs';
import { useEffect, useRef, useState } from 'react';
import { cloudAdminRequest } from './admin-v2/admin-client.mjs';
import { MARKET_EVENT, marketRequest } from './CloudMarket';
import { cloudMarketPresentation } from './service-directory.mjs';

const empty = { keys:[], routes:[], orders:[], plans:[], services:[], projects:[], requests:[], models:[],
  projectServices:[], logKeys:[], projectMembers:{}, projectAudits:[], projectBudgets:{}, accountProjects:[],
  organization:{ departments:[], members:[], audit:[] }, error:'' };

export function useTenantData({ enabled = true, adminTenantId } = {}) {
  const [data, setData] = useState(empty);
  const [refresh, setRefresh] = useState(0);
  const pending=useRef(null);
  const request = (path, body, signal) => adminTenantId
    ? cloudAdminRequest('/tenants/' + encodeURIComponent(adminTenantId) + '/' + path,
      {method:body ? 'POST' : 'GET', body:body || undefined, signal})
    : marketRequest(path, body, signal);
  useEffect(() => {
    if (!enabled) { setData(empty); return; }
    const controller = new AbortController();
    request('workspace', null, controller.signal).then(result => {
      if (!controller.signal.aborted) setData({ ...result, services:result.services.map(cloudMarketPresentation),
        projectServices:(result.projectServices || []).map(row => ({ ...cloudMarketPresentation(row), modelKey:row.serviceModelId, materialId:row.modelKey })), error:'' });
    }).catch(error => {
      if (!controller.signal.aborted) setData({ ...empty, error:error.message });
    });
    return () => controller.abort();
  }, [enabled,refresh,adminTenantId]);
  useEffect(() => {
    if (!enabled) return;
    const update = event => {
      if(['login','logout','switch'].includes(event.detail)){pending.current=null;setData(empty);}
      setRefresh(value => value+1);
    };
    window.addEventListener(MARKET_EVENT, update);
    window.addEventListener('focus', update);
    return () => { window.removeEventListener(MARKET_EVENT, update); window.removeEventListener('focus', update); };
  }, [enabled]);
  async function command(action, payload, expectedRevision = data.revision) {
      if (!data.identity) throw Error('请先登录客户账号');
      const input={tenantId:data.identity.tenantId,expectedRevision,action,data:payload},signature=JSON.stringify(input);
      const receipt=pending.current?.signature===signature?pending.current:{signature,id:crypto.randomUUID()};
      pending.current=receipt;
      let result;
      try {
        result=await request('commands',{operationId:receipt.id,...input});
      } catch(error) {
        if(error.status<500 && pending.current===receipt)pending.current=null;
        throw error;
      }
      if(pending.current===receipt)pending.current=null;
      window.dispatchEvent(new Event(MARKET_EVENT));
      return result;
  }
  const checkSpace = identityKey => {
    if (data.identity?.key !== identityKey) throw Error('当前使用空间已变化，请重新打开操作');
  };
  return { ...data, report:data.report ? { ...data.report, asOf:new Date(data.report.asOf) } : undefined, reload:() => setRefresh(value => value+1), command, inviteMember:membershipId=>request('invitations',{membershipId}),
    createProject:async (input, options) => {
      checkSpace(options.identityKey);
      const { operationId } = await command('projectCreate', input, options.expectedRevision);
      return { id:'project-' + operationId, status:'正常' };
    },
    updateProject:(projectId, type, input, options) => {
      checkSpace(options.identityKey);
      return command('projectUpdate', { projectId, type, input }, options.expectedRevision);
    },
    saveProjectKeys:async (rows, { expectedRevision, ...scope }) => {
      const masked = maskedProjectKeys(rows);
      const payload = await Promise.all(masked.map(async (row, index) => {
        const value = rows[index].key;
        if (!/^sk-[a-f0-9]{32}$/.test(value || '')) return row;
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return { ...row, credentialDigest:Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('') };
      }));
      return command('keys', { ...scope, rows:payload }, expectedRevision);
    },
  };
}
