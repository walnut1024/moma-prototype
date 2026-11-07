import {commitAdminState,canMutate} from './state-transaction.js';
export {commitAdminState,canMutate} from './state-transaction.js';
import {initialApplicationData} from "../mock/application-data.js";
import {initialWorkspace,MODEL_DATA_COLLECTIONS,systemModelData,systemModelOrigin,applyModelDataset} from "../mock/model-data.js";



import { activeAdmin } from '../linked-accounts.mjs';
import {readLinkedState,notifyLinkedState,LINK_EVENT} from "../service-access.mjs";
import { MODEL_OPERATIONS_EXAMPLE_ID } from './model-operations-examples.js';
import { usageDemoRequests } from './usage-demo.js';
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";








import { prepareMockOnboardingSync, commitMockOnboardingSync } from './mock-onboarding-sync.js';
import { assertNewMockPublications } from './mock-publication-gate.js';

export const STORAGE_KEY = "moma.adminV2.5120.v1";
const isDerivedUsageRequest = request => request.id?.startsWith('usage-demo-');

export function serializeAdminState(state) {
  // parseAdminState rebuilds these derived examples on every load.
  return JSON.stringify({ ...state, requests: state.requests.filter(request => !isDerivedUsageRequest(request)) });
}

export function createAdminSeed() {
  const builtin = systemModelData(), initial = initialApplicationData();
  const state = { ...initial, ...builtin, modelData: systemModelOrigin() };
  state.requests.push(...usageDemoRequests(state, Date.now()));
  return state;
}

export function parseAdminState(raw) {
  if (!raw) return initialWorkspace(createAdminSeed());
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.models) || !Array.isArray(value.apiKeys)) throw new Error("数据格式不兼容");
  const seed = createAdminSeed();
  const restored = { ...seed, ...value, ...Object.fromEntries(["serviceRoutes", "modelOnboardings", "tariffDictionary", "modelTemplates", "modelSupplies", "modelSalePrices", "users", "organizations", "modelVersions", "validations", "clusters", "artifacts", "deployments", "supplyPrices", "memberships", "grants", "ledger", "routes", "limits", "fallbacks", "releases", "caches", "requests", "alerts", "incidents", "products", "prices", "orders", "bills", "settlements", "adjustments", "announcements", "admins", "approvals", "integrations"].map(key => [key, Array.isArray(value[key]) ? value[key] : seed[key]])) };
  // Stored business records are authoritative; never refill deleted models or channels.
  restored.modelData = value.modelData;
  restored.initialData = value.initialData;
  for (const key of Object.keys(seed.initialData.builtinIds)) restored[key] = Array.isArray(value[key]) ? value[key] : [];
  for (const key of MODEL_DATA_COLLECTIONS) restored[key] = Array.isArray(value[key]) ? value[key] : [];
  restored.requests = [...restored.requests.filter(item => !isDerivedUsageRequest(item)), ...usageDemoRequests(restored,Date.now())];
  return restored;
}

export function persistAdminAction(state, action, storage) {
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (raw && JSON.parse(raw).revision !== state.revision) throw new Error('数据已变化，请载入新版本后重试');
  const account = action.type === 'enterAdmin' ? null : activeAdmin(state);
  const next = commitAdminState(state, action, account?.role);
  if (account && next.audits[0]) next.audits[0].actorId = account.id;
  assertNewMockPublications(state,next,action);
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  notifyLinkedState();
  return next;
}

export function persistModelAction(state, action, storage) {
  if (!['modelOperation', 'modelOperations'].includes(action.type)) throw new Error('此入口仅支持模型操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (raw && JSON.parse(raw).revision !== state.revision) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const account = action.type === 'enterAdmin' ? null : activeAdmin(state);
  const next = commitAdminState(state, action, account?.role);
  if (account && next.audits[0]) next.audits[0].actorId = account.id;
  const prepared = prepareMockOnboardingSync(state, next, action), serialized = serializeAdminState(next);
  assertNewMockPublications(state,next,action,prepared?.after);
  storage.setItem(STORAGE_KEY, serialized);
  try { commitMockOnboardingSync(prepared, next); }
  catch (error) {
    if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error('保存期间数据已变化，请重新载入核对，未覆盖其他修改');
    try { if (raw === null) storage.removeItem(STORAGE_KEY); else storage.setItem(STORAGE_KEY, raw); }
    catch { throw new Error('接入状态同步失败且本地恢复未完成，请重新载入核对'); }
    throw error;
  }
  notifyLinkedState();
  return next;
}

export function persistProviderAction(state, action, storage, expectedRevision = state.revision) {
  if (action.type !== 'providerOperation') throw new Error('此入口仅支持服务商操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (state.revision !== expectedRevision || (raw && JSON.parse(raw).revision !== expectedRevision)) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const account = action.type === 'enterAdmin' ? null : activeAdmin(state);
  const next = commitAdminState(state, action, account?.role);
  if (account && next.audits[0]) next.audits[0].actorId = account.id;
  const prepared = prepareMockOnboardingSync(state, next, action), serialized = serializeAdminState(next);
  assertNewMockPublications(state,next,action,prepared?.after);
  storage.setItem(STORAGE_KEY, serialized);
  try { commitMockOnboardingSync(prepared, next); }
  catch (error) {
    if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error('保存期间数据已变化，请重新载入核对，未覆盖其他修改');
    try { if (raw === null) storage.removeItem(STORAGE_KEY); else storage.setItem(STORAGE_KEY, raw); }
    catch { throw new Error('接入状态同步失败且本地恢复未完成，请重新载入核对'); }
    throw error;
  }
  notifyLinkedState();
  return next;
}

export function persistEnterpriseAction(state, action, storage, expectedRevision = state.revision) {
  if (action.type !== 'enterprise') throw new Error('此入口仅支持企业操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (expectedRevision !== state.revision || (raw && JSON.parse(raw).revision !== state.revision)) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const account = action.type === 'enterAdmin' ? null : activeAdmin(state);
  const next = commitAdminState(state, action, account?.role);
  if (account && next.audits[0]) next.audits[0].actorId = account.id;
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  notifyLinkedState();
  return next;
}

export function persistIndividualAction(state, action, storage, expectedRevision = state.revision) {
  if (action.type !== 'individual') throw new Error('此入口仅支持个人用户操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (expectedRevision !== state.revision || (raw && JSON.parse(raw).revision !== state.revision)) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const account = action.type === 'enterAdmin' ? null : activeAdmin(state);
  const next = commitAdminState(state, action, account?.role);
  if (account && next.audits[0]) next.audits[0].actorId = account.id;
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  notifyLinkedState();
  return next;
}

export function persistAdminAccountAction(state, action, storage, expectedRevision = state.revision) {
  if (action.type !== 'adminAccount') throw new Error('此入口仅支持后台账号操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (state.revision !== expectedRevision || (raw && JSON.parse(raw).revision !== expectedRevision)) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const account = action.type === 'enterAdmin' ? null : activeAdmin(state);
  const next = commitAdminState(state, action, account?.role);
  if (account && next.audits[0]) next.audits[0].actorId = account.id;
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  notifyLinkedState();
  return next;
}

export function loadAdminState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  const state = parseAdminState(raw);
  let completed = raw ? state : applyModelDataset(state);
  if (!completed.adminSession?.accountId) {
    const account = completed.admins.find(row => row.role === '平台管理员' && row.status === '已启用');
    if (account) completed = { ...completed, adminSession: { accountId: account.id }, currentRole: account.role };
  }
  const storedRequests = raw ? JSON.parse(raw).requests : [];
  if (completed === state && raw && (!Array.isArray(storedRequests) || !storedRequests.some(isDerivedUsageRequest))) return state;
  const next = raw ? { ...completed, revision: state.revision + 1 } : completed;
  try {
    if (storage.getItem(STORAGE_KEY) !== raw) throw new Error('数据已变化，请载入最新数据后重试');
    storage.setItem(STORAGE_KEY, serializeAdminState(next));
    return next;
  } catch (error) {
    return { ...state, storageError: error.message };
  }
}

export function prepareModelOperationsExamples(storage = globalThis.localStorage) {
  const state = readLinkedState(storage), account = activeAdmin(state);
  const action = { type: 'modelOperations', operation: 'prepareModelOperationsExamples', data: { confirmed: true } };
  if (!canMutate(account.role, action)) throw new Error('当前后台账号无权准备模型运营 Mock 数据');
  if (state.audits.some(row => row.objectId === MODEL_OPERATIONS_EXAMPLE_ID)) return false;
  persistModelAction(state, action, storage);
  return true;
}

export function useAdminStore() {
  const [state, setState] = useState(() => { try { return loadAdminState(localStorage); } catch (error) { return { ...createAdminSeed(), storageError: error.message }; } });
  const [conflict, setConflict] = useState(false);
  const currentState = useRef(state);
  currentState.current = state;
  useEffect(() => {
    const sync = () => queueMicrotask(() => {
      try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw || JSON.parse(raw).revision !== currentState.current.revision) setConflict(true); }
      catch { setConflict(true); }
    });
    for (const event of ['storage', LINK_EVENT, 'focus']) addEventListener(event, sync);
    return () => { for (const event of ['storage', LINK_EVENT, 'focus']) removeEventListener(event, sync); };
  }, []);
  const dispatch = action => {
    try {
      if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试');
      const next = persistAdminAction(currentState.current, action, localStorage);
      currentState.current = next; setState(next);
      if (action.type !== 'setRole' && action.feedback !== false) {
        const names = { clusters: '集群', deployments: '模型部署', artifacts: '制品', routes: '路由策略', limits: '限流规则', fallbacks: '回退策略', caches: '缓存策略', releases: '配置版本', alerts: '告警', incidents: '事件', products: '商品', orders: '订单', announcements: '公告', settlements: '结算单', adjustments: '调账', bills: '账单', prices: '价格' };
        const collection = action.collection || action.changes?.[0]?.collection;
        const status = action.changes?.status;
        toast.success(action.feedback || `${names[collection] || '配置'}${status?.startsWith('已') ? status : action.type === 'add' ? '已新建' : '已更新'}`);
      }
      return next;
    } catch (error) { toast.error(error.message); return null; }
  };
  const transact = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistEnterpriseAction(currentState.current, action, localStorage, state.revision);
    currentState.current = next;
    setState(next);
    return next;
  };
  const transactModel = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistModelAction(currentState.current, action, localStorage);
    currentState.current = next;
    setState(next);
    return next;
  };
  const transactIndividual = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistIndividualAction(currentState.current, action, localStorage, state.revision);
    currentState.current = next;
    setState(next);
    return next;
  };
  const transactProvider = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistProviderAction(currentState.current, action, localStorage, state.revision);
    currentState.current = next;
    setState(next);
    return next;
  };
  const transactTraffic = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistAdminAction(currentState.current, { ...action, type: 'trafficOperation' }, localStorage);
    currentState.current = next;
    setState(next);
    return next;
  };
  const reload = () => { try { const fresh = loadAdminState(localStorage); currentState.current = fresh; setState(fresh); setConflict(false); if (fresh.storageError) toast.error(fresh.storageError); else toast.success("已载入最新数据"); } catch (error) { toast.error(error.message); setState(current => ({ ...current, storageError: error.message })); } };
  const transactAdminAccount = (action, expectedRevision) => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistAdminAccountAction(currentState.current, action, localStorage, expectedRevision);
    currentState.current = next;
    setState(next);
    return next;
  };
  return { state, dispatch, transact, transactModel, transactIndividual, transactProvider, transactAdminAccount, transactTraffic, reload, conflict };
}
