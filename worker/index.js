import { handleModelOperations } from '../versions/moma_5.12.0_estack/server/api.js';

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/5120' || pathname.startsWith('/api/5120/')) return handleModelOperations(request, env);
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
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
