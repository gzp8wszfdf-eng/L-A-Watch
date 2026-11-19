const ALLOWED_ORIGINS = new Set(["https://lawatch-24.ru","https://www.lawatch-24.ru","https://lawatch-mobile-preview.onrender.com","https://la-one-watch-integration-preview.onrender.com","https://l-a-watch.pages.dev"]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "vary": "Origin",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type"
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

function optionsResponse(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
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

function extractItems(html) {
  const anchors = html.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
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

  return items;
}

async function searchDuckDuckGo(query) {
  const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.7",
      "user-agent": "Mozilla/5.0 (compatible; LAWatch/1.0)"
    }
  });
  if (!response.ok) throw new Error("DuckDuckGo HTTP " + response.status);
  return extractItems((await response.text()).slice(0, 2000000));
}

async function searchBing(query) {
  const url = "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: {
      "accept": "application/rss+xml,application/xml,text/xml",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.7",
      "user-agent": "Mozilla/5.0 (compatible; LAWatch/1.0)"
    }
  });
  if (!response.ok) throw new Error("Bing HTTP " + response.status);

  const xml = (await response.text()).slice(0, 2000000);
  const items = [];
  const seen = new Set();
  const entries = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const entry of entries) {
    const link = entry.match(/<link>([\s\S]*?)<\/link>/i)?.[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    if (!link) continue;

    const target = decodeHtml(link.trim());
    let parsed;
    try { parsed = new URL(target); } catch { continue; }
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "vkvideo.ru" && host !== "vk.com") continue;

    const idMatch = parsed.pathname.match(/\/video(-?\d+_\d+)/i);
    if (!idMatch || seen.has(idMatch[1])) continue;
    seen.add(idMatch[1]);

    items.push({
      id: idMatch[1],
      title: clean(title || "Видео VK"),
      author: "VK Видео",
      thumbnail: "",
      url: "https://vkvideo.ru/video" + idMatch[1]
    });
    if (items.length >= 15) break;
  }
  return items;
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return optionsResponse(request);

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(request)
  };

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) {
    return new Response(JSON.stringify({ error: "Введите минимум 2 символа." }), { status: 400, headers });
  }

  const query = "site:vkvideo.ru/video OR site:vk.com/video " + q;
  const failures = [];

  try {
    const items = await searchDuckDuckGo(query);
    return new Response(JSON.stringify({
      items,
      message: items.length ? "" : "Поисковик не нашёл индексированные публичные видео VK. Попробуй другой запрос.",
      source: "duckduckgo"
    }), {
      status: 200,
      headers: { ...headers, "cache-control": "public, max-age=60" }
    });
  } catch (error) {
    failures.push("DuckDuckGo");
  }

  try {
    const items = await searchBing(query);
    return new Response(JSON.stringify({
      items,
      message: items.length ? "" : "Поисковики не нашли индексированные публичные видео VK. Попробуй другой запрос.",
      source: "bing"
    }), {
      status: 200,
      headers: { ...headers, "cache-control": "public, max-age=60" }
    });
  } catch (error) {
    failures.push("Bing");
  }

  return new Response(JSON.stringify({
    error: "Внешние поисковики временно недоступны. Попробуй позже.",
    providers: failures
  }), { status: 502, headers });
}
