import { onRequest as __proxy_js_onRequest } from "/Users/aizu/rich-rss-reader/functions/proxy.js"

export const routes = [
    {
      routePath: "/proxy",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__proxy_js_onRequest],
    },
  ]