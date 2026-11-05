function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function clean(value, max = 250) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function unwrapUrl(raw) {
  try {
    const url = new URL(decodeHtml(raw), "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    return redirected || url.href;
  } catch {
    return "";
  }
}
export async function onRequest({ request }) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) {
    return new Response(JSON.stringify({ error: "Введите минимум 2 символа." }), { status: 400, headers });
  }
  try {
    const query = "site:vkvideo.ru/video OR site:vk.com/video " + q;
    const searchUrl = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
    const response = await fetch(searchUrl, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.7",
        "user-agent": "Mozilla/5.0 (compatible; LAWatch/1.0)"
      }
    });
    if (!response.ok) throw new Error("Search provider unavailable");
    const html = (await response.text()).slice(0, 2000000);
    const anchors = html.match(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*>[\s\S]*?<\/a>/gi) || [];
    const items = [];
    const seen = new Set();
    for (const anchor of anchors) {
      const hrefMatch = anchor.match(/\bhref=["']([^"']+)["']/i);
      if (!hrefMatch) continue;
      const target = unwrapUrl(hrefMatch[1]);
      let parsed;
      try { parsed = new URL(target); } catch { continue; }
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      if (host !== "vkvideo.ru" && host !== "vk.com") continue;
      const idMatch = parsed.pathname.match(/\/video(-?\d+_\d+)/i);
      if (!idMatch || seen.has(idMatch[1])) continue;
      seen.add(idMatch[1]);
      const title = clean(anchor.replace(/<\/?a\b[^>]*>/gi, ""));
      items.push({
        id: idMatch[1],
        title: title || "Видео VK",
        author: "VK Видео",
        thumbnail: "",
        url: "https://vkvideo.ru/video" + idMatch[1]
      });
      if (items.length >= 15) break;
    }
    return new Response(JSON.stringify({
      items,
      message: items.length ? "" : "Поисковик не нашёл индексированные публичные видео VK. Попробуй другой запрос."
    }), { status: 200, headers: { ...headers, "cache-control": "public, max-age=60" } });
  } catch (error) {
    return new Response(JSON.stringify({
      error: "Внешний поисковик временно недоступен. Попробуй позже."
    }), { status: 502, headers });
  }
}
