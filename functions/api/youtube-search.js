export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  const key = env.YOUTUBE_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "YouTube API key is not configured." }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const mode = url.searchParams.get("mode") || "videos";
  const channelId = (url.searchParams.get("channelId") || "").trim();

  if (mode === "channelVideos" && !channelId) {
    return new Response(JSON.stringify({ error: "Channel ID is required." }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
  if (!q && mode !== "channelVideos") {
    return new Response(JSON.stringify({ error: "Search query is required." }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const options = mode === "channels"
      ? { part: "snippet", type: "channel", maxResults: "12", q, key }
      : mode === "channelVideos"
        ? { part: "snippet", type: "video", maxResults: "20", channelId, order: "date", key }
        : { part: "snippet", type: "video", maxResults: "12", q, key };

    const params = new URLSearchParams(options);
    const response = await fetch("https://www.googleapis.com/youtube/v3/search?" + params.toString());
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "YouTube search request failed." }), {
      status: 502,
      headers: { "content-type": "application/json" }
    });
  }
}
