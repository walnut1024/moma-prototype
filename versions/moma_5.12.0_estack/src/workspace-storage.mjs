import { uiModified } from './prototype-ui.mjs';

export const workspaceStoragePrefix = uiModified ? 'moma-5120-workspace-v2:ui-modified:' : 'moma-5120-workspace-v2:';
export const infrastructureStoragePrefix = uiModified ? 'moma-ui-modified:' : 'moma-5.12.0-estack:';
export const ADMIN_DATA_KEY = workspaceStoragePrefix + 'admin';
export const AUTH_DATA_KEY = workspaceStoragePrefix + 'auth';
