export function requestIdentity(row) {
  const id = row.requestId || row.id;
  return id ? JSON.stringify([row.tenantId || null, id]) : null;
}

function revisionTime(row) {
  const time = row.updatedAt || row.createdAt;
  return typeof time === 'number' ? time : Date.parse(time);
}

export function latestRequests(rows) {
  const requests = new Map();
  for (const row of rows) {
    const identity = requestIdentity(row);
    if (!identity) continue;
    const previous = requests.get(identity);
    const revision = revisionTime(row);
    const previousRevision = previous && revisionTime(previous);
    if (!previous || Number.isFinite(revision) && (!Number.isFinite(previousRevision) || revision > previousRevision)) {
      requests.set(identity, row);
    }
  }
  return [...requests.values()];
}

const diagnosticPurposes = new Set(['trial', 'gateway-test', 'metering-test', 'platform-trial']);

export function diagnosticRequest(row) {
  if (row.purpose === 'customer') return false;
  return diagnosticPurposes.has(row.purpose) || diagnosticPurposes.has(row.identityType) ||
    !row.purpose && /^req_(gateway|demo)_/.test(row.requestId || '');
}
