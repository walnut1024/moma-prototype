import '@douyinfe/semi-ui/react19-adapter';
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { PRIVATE_SITE } from "./site-config.mjs";
import { isPortalHomeEntry, PORTAL_HOME_ENDPOINT, portalHomeUrl } from "./portal-home.mjs";
import { API_PREFIX } from "../api-path.js";
import "./styles.css";

async function start() {
  if (PRIVATE_SITE && isPortalHomeEntry(location)) {
    const entry = location.href;
    try {
      const response = await fetch(API_PREFIX + PORTAL_HOME_ENDPOINT, {
        credentials: 'omit', signal: AbortSignal.timeout(2500),
      });
      const address = response.ok ? portalHomeUrl((await response.json()).url, location.origin) : '';
      if (address && location.href === entry) {
        const target = new URL(address);
        if (target.origin === location.origin && target.pathname === location.pathname && target.search === location.search) {
          history.replaceState(null, '', address);
        } else {
          location.replace(address);
          return;
        }
      }
    } catch {
      // The existing home remains available when the portal setting cannot be read.
    }
  }
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

start();
