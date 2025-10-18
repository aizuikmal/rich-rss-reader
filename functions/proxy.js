export async function onRequest(context) {
    const { request } = context;
    const urlObj = new URL(request.url);
    const target = urlObj.searchParams.get("url");
  
    if (!target) {
      return new Response("Missing ?url=", { status: 400 });
    }
  
    try {
      const upstream = await fetch(target, {
        headers: {
          // help some servers return XML/JSON feed
          "User-Agent": "Aizu-RSS-Reader/1.0 (+cloudflare-pages)",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, text/html;q=0.8, */*;q=0.1"
        }
      });
  
      const body = await upstream.text();
      const contentType =
        upstream.headers.get("content-type") ||
        (body.trim().startsWith("{") ? "application/json; charset=utf-8" : "application/xml; charset=utf-8");
  
      return new Response(body, {
        status: upstream.status,
        headers: {
          "content-type": contentType,
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, { status: 502 });
    }
  }
  