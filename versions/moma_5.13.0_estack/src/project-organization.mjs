import { applyMemberBatch } from './organization-import.mjs';
import { changeOrganization } from './organization-data.mjs';

export function accountOrganization(state, identity) {
  const organizations = state.organizations.filter(item => item.tenantId === identity.tenantId && item.status !== '已删除');
  const root = organizations.find(item => !item.parentId);
  const rootId = id => id === root?.id ? 'root' : id;
  const departments = organizations.map(item => ({ ...item, description:item.description || '', ownerId:item.ownerId || '', id: rootId(item.id), parentId: rootId(item.parentId) }));
  if (!root) departments.unshift({ id:'root', parentId:null, name:identity.tenantName, ownerId:identity.userId });
  return { departments, members: state.memberships.filter(item => item.tenantId === identity.tenantId && !['已移除','已退出'].includes(item.status)).map(member => {
    const user = state.users.find(item => item.id === member.userId);
    return { ...member, id: member.userId, name:user?.name || member.userId, account:user?.login || user?.email || member.userId, phone:user?.phone || '', departmentId:rootId(member.organizationId) || 'unassigned', role:['租户管理员','企业管理员'].includes(member.role) ? '企业管理员' : member.role, status:['正常','已加入'].includes(member.status) ? '已加入' : member.status, source:member.source || '平台账号' };
  }), audit:[] };
}
export function organizationChanges(state, identity, action) {
  const current = accountOrganization(state,identity);
  if (['member.remove','member.status'].includes(action.type) && action.ids?.includes(identity.userId) && (action.type === 'member.remove' || action.status === '已停用')) throw new Error('不能移除或停用当前登录成员');
  const next = action.type === 'member.batch' ? applyMemberBatch(current,action.rows,action.mode,action.defaultDepartment,()=>crypto.randomUUID()).state : changeOrganization(current, { ...action, logId:crypto.randomUUID() });
  const changes=[];
  const root=state.organizations.find(item=>item.tenantId===identity.tenantId && !item.parentId);
  const rootId=id=>id==='root' ? root?.id || `org-${identity.tenantId}` : id;
  for (const department of next.departments) {
    const id=rootId(department.id), existing=state.organizations.find(item=>item.id===id);
    const record={...department,id,parentId:rootId(department.parentId),tenantId:identity.tenantId};
    changes.push(existing ? {type:'update',collection:'organizations',id,changes:record} : {type:'add',collection:'organizations',record});
  }
  for(const old of current.departments.filter(item=>!next.departments.some(next=>next.id===item.id))) changes.push({type:'remove',collection:'organizations',id:rootId(old.id)});
  for(const member of next.members) {
    const user=state.users.find(item=>item.id===member.id), existing=state.memberships.find(item=>item.tenantId===identity.tenantId && item.userId===member.id);
    if (!user) changes.push({type:'add',collection:'users',record:{id:member.id,name:member.name,login:member.account,phone:member.phone,status:'正常'}});
    else if(user.name!==member.name || user.login!==member.account || (user.phone || '')!==member.phone) changes.push({type:'update',collection:'users',id:user.id,changes:{name:member.name,login:member.account,phone:member.phone}});
    const record={tenantId:identity.tenantId,userId:member.id,role:member.role==='企业管理员' && existing?.role==='租户管理员' ? '租户管理员' : member.role,status:member.status==='已加入'?'正常':member.status,organizationId:member.departmentId==='unassigned'?null:rootId(member.departmentId),scopeId:rootId(member.scopeId),includeChildren:member.includeChildren};
    changes.push(existing?{type:'update',collection:'memberships',id:existing.id,changes:record}:{type:'add',collection:'memberships',record:{...record,id:crypto.randomUUID()}});
  }
  for(const old of current.members.filter(item=>!next.members.some(next=>next.id===item.id))) {
    const membership=state.memberships.find(item=>item.tenantId===identity.tenantId && item.userId===old.id);
    changes.push({type:'update',collection:'memberships',id:membership.id,changes:{status:'已移除'}});
  }
  return changes.filter(change=>change.type !== 'update' || Object.entries(change.changes).some(([key,value])=>JSON.stringify(state[change.collection].find(item=>item.id===change.id)?.[key])!==JSON.stringify(value)));
}
