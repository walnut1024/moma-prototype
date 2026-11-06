export function serviceReleaseScope(model) {
  const scope={openScope:model.openScope,tenantIds:model.tenantIds || []};
  if(model.releaseStage!=='gray')return scope;
  return {openScope:'selected',tenantIds:(model.releaseTenantIds || []).filter(id=>scope.openScope==='all' || scope.openScope==='selected' && scope.tenantIds.includes(id))};
}
