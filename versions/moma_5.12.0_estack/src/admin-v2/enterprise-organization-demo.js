import { initialEnterpriseOrganization } from '../mock/application-data.js';
// Synthetic organization/member records for density, filtering and pagination demos.
// Existing identities, projects and department assignments are never replaced.
export function enterpriseOrganizationSeed() {
  return initialEnterpriseOrganization();
}
