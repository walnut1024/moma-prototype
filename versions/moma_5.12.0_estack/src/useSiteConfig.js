import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useDeploymentLicense } from './useDeploymentLicense';
import { sitePersonalEnabled, DEFAULT_SITE_LOGO, DEFAULT_SITE_TITLE, PRIVATE_SITE, readSiteConfig, SITE_CONFIG_EVENT, SITE_CONFIG_KEY } from './site-config.mjs';

function subscribe(onChange) {
  if (!PRIVATE_SITE) return () => {};
  const storageChanged = event => {
    if (event.key === SITE_CONFIG_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', storageChanged);
  window.addEventListener(SITE_CONFIG_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener(SITE_CONFIG_EVENT, onChange);
  };
}

function snapshot() {
  if (!PRIVATE_SITE) return null;
  try { return localStorage.getItem(SITE_CONFIG_KEY); }
  catch { return null; }
}

export function useSiteConfigSnapshot() {
  return useSyncExternalStore(subscribe, snapshot);
}

export function useSiteConfig() {
  const raw = useSiteConfigSnapshot();
  const license = useDeploymentLicense();
  return useMemo(() => {
    const config = readSiteConfig(raw);
    return { ...config, personalEnabled: sitePersonalEnabled(config, license) };
  }, [raw, license]);
}

export function restoreSiteImage(event, fallback) {
  const image = event.currentTarget;
  if (image.getAttribute('src') !== fallback) image.src = fallback;
}

export function useSiteChrome({ title, favicon }) {
  useLayoutEffect(() => {
    if (PRIVATE_SITE) document.title = title || DEFAULT_SITE_TITLE;
  }, [title]);
  useLayoutEffect(() => {
    if (PRIVATE_SITE) document.querySelector('link[rel="icon"]').href = favicon || DEFAULT_SITE_LOGO;
  }, [favicon]);
}

export function usePageTitle(title) {
  const { title: customTitle } = useSiteConfig();
  useEffect(() => {
    if (customTitle) return;
    const previous = document.title;
    document.title = title;
    return () => { if (document.title === title) document.title = previous; };
  }, [customTitle, title]);
}
