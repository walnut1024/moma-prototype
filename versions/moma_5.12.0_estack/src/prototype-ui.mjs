export const PLANNING_BASE = '/moma_5.12.0_estack/';
export const UI_MODIFIED_BASE = '/ui-modified/';
export const uiModified = import.meta.env?.BASE_URL === UI_MODIFIED_BASE;
export const appBase = uiModified ? UI_MODIFIED_BASE : PLANNING_BASE;
export const appVersionId = appBase.slice(1, -1);
