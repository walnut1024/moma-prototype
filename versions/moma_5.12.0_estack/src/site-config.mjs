import { licenseSnapshot } from './deployment-license.mjs';
import { workspaceStoragePrefix } from "./workspace-storage.mjs";
export const PRIVATE_SITE = import.meta.env?.VITE_MOMA_PRIVATE_SITE === '1';
export const SITE_CONFIG_KEY = workspaceStoragePrefix + 'site-config';
export const SITE_CONFIG_EVENT = 'moma:5120-site-config';
export const DEFAULT_SITE_TITLE = '模型市场';
export const DEFAULT_SITE_LOGO = '/moma_5.12.0_estack/assets/jiangSuZhengWu.png';
export const DEFAULT_LOGIN_IMAGE = '/moma_5.12.0_estack/assets/auth/ai-scenarios-light.png';
export const MAX_IMAGE_BYTES = 512 * 1024;
export const MAX_SITE_TEXT = 64;
export const MAX_AGREEMENT_TEXT = 20000;
export const MAX_SITE_URL = 2048;

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml'];
export const SITE_IMAGES = [
  ['logo', '平台 Logo', DEFAULT_SITE_LOGO],
  ['favicon', 'Favicon', DEFAULT_SITE_LOGO],
  ['loginImage', '登录页插图', DEFAULT_LOGIN_IMAGE],
];
export const AGREEMENTS = [['terms', '用户协议'], ['privacy', '隐私政策']];
const EMPTY_AGREEMENT = { text: '', url: '' };
const DEFAULT_SITE = { personalEnabled:true, name: '', title: '', logo: '', favicon: '', loginImage: '', terms: EMPTY_AGREEMENT, privacy: EMPTY_AGREEMENT };

export function siteUrl(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (input.length > MAX_SITE_URL || !/^https?:\/\//i.test(input)) return '';
  try {
    const url = new URL(input);
    return !url.username && !url.password && url.href.length <= MAX_SITE_URL ? url.href : '';
  } catch {
    return '';
  }
}

export function siteImage(value) {
  if (typeof value !== 'string') return '';
  if (!value.startsWith('data:')) return siteUrl(value);
  const [, mime, bytes] = /^data:([^;,]+);base64,([a-z0-9+/]+={0,2})$/i.exec(value) || [];
  return IMAGE_TYPES.includes(mime) && bytes.length <= Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ? value : '';
}

export function readSiteConfig(raw) {
  if (!raw) return DEFAULT_SITE;
  try {
    const parsed = JSON.parse(raw);
    const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
    const config = { personalEnabled:parsed?.personalEnabled !== false, name: text(parsed?.name, MAX_SITE_TEXT), title: text(parsed?.title, MAX_SITE_TEXT) };
    for (const [key] of SITE_IMAGES) config[key] = siteImage(parsed?.[key]);
    for (const [key] of AGREEMENTS) {
      const url = siteUrl(parsed?.[key]?.url);
      config[key] = { url, text: url ? '' : text(parsed?.[key]?.text, MAX_AGREEMENT_TEXT) };
    }
    return config;
  } catch {
    return DEFAULT_SITE;
  }
}

export function saveSiteConfig(storage, expected, config) {
  if (storage.getItem(SITE_CONFIG_KEY) !== expected) return false;
  storage.setItem(SITE_CONFIG_KEY, JSON.stringify(config));
  return true;
}

export function sitePersonalEnabled(config, license = licenseSnapshot()) {
  return license?.managed ? license.commercial : config.personalEnabled;
}

export function siteSettlement(storage) {
  return sitePersonalEnabled(readSiteConfig(storage?.getItem(SITE_CONFIG_KEY))) ? 'customer' : 'internal';
}
