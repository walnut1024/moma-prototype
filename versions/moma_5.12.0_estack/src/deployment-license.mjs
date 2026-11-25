export const LICENSE_NAMES = { internal: '对内企业运营', commercial: '对外商业运营' };
export const LICENSE_UNAVAILABLE = '商业运营授权不可用';

export function deploymentLicense(env = {}, now = Date.now()) {
  const code = env.MOMA_LICENSE_EDITION;
  const managed = code !== undefined && code !== '';
  const edition = managed ? (code === 'commercial' ? 'commercial' : 'internal') : 'commercial';
  const rawExpiry = env.MOMA_LICENSE_EXPIRES_AT;
  const expires = rawExpiry ? Date.parse(rawExpiry) : null;
  const invalid = managed && (!Object.hasOwn(LICENSE_NAMES, code) || expires !== null && !Number.isFinite(expires));
  const status = invalid ? 'invalid' : expires !== null && expires <= now ? 'expired' : 'active';
  return {
    edition, managed, status,
    expiresAt: Number.isFinite(expires) ? new Date(expires).toISOString() : null,
    commercial: edition === 'commercial',
    commerceWritable: edition === 'commercial' && status === 'active',
  };
}

export function commercialModelWrite(action) {
  if (!action) return false;
  const { operation } = action;
  if (['startSales', 'stopSales', 'pauseSales', 'salesSettings', 'publish', 'unlist', 'guidedPublish', 'publishSupplierBatch', 'publishRegisteredSupplierBatch', 'publishSupply', 'unpublishSupply', 'guidedPricingSave', 'unifiedPrice', 'reprice', 'priceDraft', 'pricePublish', 'listSupply', 'unlistSupply'].includes(operation)) return true;
  if (['commercialDraft', 'commercialPublish', 'commercialDiscard'].includes(operation)) return true;
  if (operation === 'completeOnboarding') return true;
  return false;
}

export function commercialConfigurationChanged(before, after) {
  if (JSON.stringify(before.modelSalePrices) !== JSON.stringify(after.modelSalePrices)) return true;
  const prior = new Map(before.models.map(model => [model.id, model]));
  const published = stage => stage === 'formal' || stage === 'gray';
  const changesRelease = (old, next) => old?.listingStage !== next.listingStage && published(next.listingStage)
    || Boolean(old?.salesPaused) !== Boolean(next.salesPaused);
  return after.models.some(model => {
    const old = prior.get(model.id);
    const oldScope = old?.salesScope || { openScope: 'none', tenantIds: [] };
    const nextScope = model.salesScope || { openScope: 'none', tenantIds: [] };
    if (JSON.stringify(oldScope) !== JSON.stringify(nextScope) ||
      (old?.releaseStage !== model.releaseStage && published(model.releaseStage)) ||
      old?.listingStatus !== model.listingStatus && model.listingStatus === '已上架' ||
      Boolean(old?.salesPaused) !== Boolean(model.salesPaused)) return true;
    const previousOffers = new Map((old?.serviceProviders || []).map(row => [row.channelId || row.providerId, row]));
    return (model.serviceProviders || []).some(row => changesRelease(previousOffers.get(row.channelId || row.providerId), row));
  });
}

let currentLicense = null;
export const licenseSnapshot = () => currentLicense;
export function cacheLicense(value) {
  if (JSON.stringify(currentLicense) === JSON.stringify(value)) return;
  currentLicense = value;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moma:deployment-license'));
}
