import {ADMIN_DATA_KEY} from './service-access.mjs';
import {trackUserConfiguration} from './mock/application-data.js';
export function authBusinessSnapshot(previous,auth,storage) {
  const raw=storage.getItem(ADMIN_DATA_KEY);if(!raw)return null;
  const state=JSON.parse(raw),next=structuredClone(state),at=new Date().toISOString();
  auth.identityLinks ||= [];
  for(const account of auth.accounts.filter(row=>!previous.accounts.some(old=>old.id===row.id)&&row.userType!=='enterprise')){
    const userId='user:'+account.id,tenantId='personal:'+account.id,projectId='project:'+account.id;
    if(next.users.some(row=>row.id===userId)||next.tenants.some(row=>row.id===tenantId)||next.projects.some(row=>row.id===projectId))throw Error('新用户身份引用冲突');
    next.users.push({id:userId,name:account.name,nickname:account.name,phone:account.phone,status:'正常',registeredAt:account.registeredAt || at,createdAt:at});
    next.tenants.push({id:tenantId,name:account.name,type:'个人',ownerId:userId,status:'正常',createdAt:at});
    next.projects.push({id:projectId,tenantId,name:'默认项目',ownerId:userId,status:'正常',createdAt:at});
    auth.identityLinks.push({id:account.id,authUserId:account.id,spaceId:'personal',tenantId,backendUserId:userId});
  }
  for(const account of auth.accounts){const prior=previous.accounts.find(row=>row.id===account.id),link=auth.identityLinks.find(row=>row.authUserId===account.id&&row.spaceId==='personal');if(!prior||!link)continue;const user=next.users.find(row=>row.id===link.backendUserId);if(!user)continue;if(account.name!==prior.name)user.name=user.nickname=account.name;if(account.phone!==prior.phone)user.phone=account.phone;if(JSON.stringify(account.realNameCertification)!==JSON.stringify(prior.realNameCertification))user.realNameCertification=account.realNameCertification;}
  next.customerApplications ||= [];
  for(const application of auth.applications){if(previous.applications.some(row=>row.id===application.id&&JSON.stringify(row)===JSON.stringify(application)))continue;const index=next.customerApplications.findIndex(row=>row.id===application.id);if(index<0)next.customerApplications.push(structuredClone(application));else next.customerApplications[index]=structuredClone(application);}
  const link=auth.identityLinks.find(row=>row.authUserId===auth.currentUserId&&row.spaceId===auth.activeSpace);
  if(link&&(previous.currentUserId!==auth.currentUserId||previous.activeSpace!==auth.activeSpace)){next.identityEvents ||= [];next.identityEvents.push({id:crypto.randomUUID(),type:'login',userId:link.backendUserId,tenantId:link.tenantId,at});}
  if(JSON.stringify(state)===JSON.stringify(next))return null;
  next.revision++;next.updatedAt=at;trackUserConfiguration(state,next);return {raw,encoded:JSON.stringify(next)};
}

export function authDisplayUser(auth,user,storage=globalThis.localStorage){if(!user)return user;try{const state=JSON.parse(storage.getItem(ADMIN_DATA_KEY)||'null'),link=auth.identityLinks?.find(row=>row.authUserId===user.id&&row.spaceId===auth.activeSpace),backend=state?.users?.find(row=>row.id===link?.backendUserId);return backend?{...user,name:backend.name || user.name}:user;}catch{return user;}}
