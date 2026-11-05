exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "YouTube API key is not configured in Netlify." }) };
  }
  const input = event.queryStringParameters || {};
  const q = (input.q || "").trim();
  const mode = input.mode || "videos";
  const channelId = (input.channelId || "").trim();
  if (mode === "channelVideos" && !channelId) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Channel ID is required." }) };
  if (!q && mode !== "channelVideos") {
    return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Search query is required." }) };
  }
  try {
    const options = mode === "channels" ? { part: "snippet", type: "channel", maxResults: "12", q, key } : mode === "channelVideos" ? { part: "snippet", type: "video", maxResults: "20", channelId, order: "date", key } : { part: "snippet", type: "video", maxResults: "12", q, key };
    const params = new URLSearchParams(options);
    const response = await fetch("https://www.googleapis.com/youtube/v3/search?" + params.toString());
    const data = await response.json();
    return {
      statusCode: response.status,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "YouTube search request failed." })
    };
  }
};
