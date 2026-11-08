import { isApiPath } from '../versions/moma_5.12.0_estack/api-path.js';
import { handleModelOperations } from '../versions/moma_5.12.0_estack/server/api.js';

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (isApiPath(pathname)) return handleModelOperations(request, env);
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || pathname.startsWith('/api/') || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = indexUrl.pathname.startsWith("/moma_5.12.0_estack/")
      ? "/moma_5.12.0_estack/index.html"
      : "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
