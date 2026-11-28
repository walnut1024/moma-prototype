import '@douyinfe/semi-ui/react19-adapter';
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { PRIVATE_SITE } from "./site-config.mjs";
import { isPortalHomeEntry, PORTAL_HOME_ENDPOINT, portalHomeUrl } from "./portal-home.mjs";
import { API_PREFIX } from "../api-path.js";
import "./styles.css";

async function readPortalAddress(entry) {
  if (!PRIVATE_SITE || !isPortalHomeEntry(location)) return '';
  try {
    const prefetched = window.momaPortalStartup;
    const response = await (prefetched?.entry === entry ? prefetched.response : fetch(API_PREFIX + PORTAL_HOME_ENDPOINT, {
      credentials: 'omit', signal: AbortSignal.timeout(2500),
    }));
    return response?.ok ? portalHomeUrl((await response.json()).url, location.origin) : '';
  } catch {
    return '';
  }
}

async function start() {
  const entry = location.href;
  const address = await readPortalAddress(entry);
  if (address && location.href === entry) {
    const target = new URL(address);
    if (target.origin === location.origin && target.pathname === location.pathname && target.search === location.search) {
      history.replaceState(null, '', address);
    } else {
      location.replace(address);
      return;
    }
  }
  createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
}

start();
