export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 2) {
    return new Response(JSON.stringify({ error: "Введите минимум 2 символа для поиска." }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const upstreamUrl = new URL("https://rutube.ru/api/search/video/");
    upstreamUrl.searchParams.set("query", q);
    upstreamUrl.searchParams.set("page", "1");
    upstreamUrl.searchParams.set("limit", "15");

    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; LAWatch/1.0)"
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: response.status === 429
          ? "RUTUBE временно ограничил частоту поиска. Попробуй чуть позже."
          : "RUTUBE временно не отвечает. Попробуй позже."
      }), {
        status: 502,
        headers: { "content-type": "application/json", "cache-control": "no-store" }
      });
    }

    const data = await response.json();
    const sourceItems = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.items)
        ? data.items
        : [];

    const items = sourceItems.map((item) => {
      const id = String(item?.id || item?.video_id || "").trim();
      if (!id) return null;

      const candidateUrl = String(item?.video_url || item?.url || "");
      const safeUrl = /^https?:\/\/(?:www\.)?rutube\.ru\//i.test(candidateUrl)
        ? candidateUrl
        : "https://rutube.ru/video/" + encodeURIComponent(id) + "/";

      return {
        id,
        title: String(item?.title || item?.name || "Видео RUTUBE").slice(0, 300),
        author: String(
          item?.author?.name ||
          item?.author_name ||
          item?.channel?.name ||
          item?.owner?.name ||
          "RUTUBE"
        ).slice(0, 160),
        thumbnail: String(
          item?.thumbnail_url ||
          item?.thumbnail ||
          item?.picture ||
          item?.thumbnails?.[0]?.url ||
          ""
        ),
        url: safeUrl
      };
    }).filter(Boolean);

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=45"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Не удалось связаться с поиском RUTUBE." }), {
      status: 502,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }
}
