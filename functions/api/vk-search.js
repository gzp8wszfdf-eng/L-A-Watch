export async function onRequest({ request }) {
  if (request.method !== "GET") return new Response(JSON.stringify({error:"Method not allowed"}), {status:405, headers:{"content-type":"application/json"}});
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0,100);
  if (q.length < 2) return new Response(JSON.stringify({error:"Введите минимум 2 символа."}), {status:400,headers:{"content-type":"application/json"}});
  try {
    const target = "https://vkvideo.ru/video?q=" + encodeURIComponent(q);
    const response = await fetch(target, {headers:{"accept":"text/html,application/xhtml+xml","accept-language":"ru-RU,ru;q=0.9,en;q=0.7","user-agent":"Mozilla/5.0 (compatible; LAWatch/1.0)"}, redirect:"follow"});
    if (!response.ok) return new Response(JSON.stringify({error:"Публичный поиск VK временно недоступен ("+response.status+")."}),{status:502,headers:{"content-type":"application/json"}});
    const html = (await response.text()).slice(0,8000000);
    const items = [];
    const seen = new Set();
    const re = /video(-?\d+)_(\d+)/g;
    let match;
    while ((match = re.exec(html)) && items.length < 20) {
      const key = match[1] + "_" + match[2];
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Math.max(0, match.index - 1200);
      const end = Math.min(html.length, match.index + 1200);
      const chunk = html.slice(start, end);
      const titleMatch = chunk.match(/"title"\s*:\s*"([^"]{3,250})"/i);
      const authorMatch = chunk.match(/"(?:author_name|owner_name)"\s*:\s*"([^"]{2,100})"/i);
      const imageMatch = chunk.match(/https?:\\?\/\\?\/[^"\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"\s<>]*)?/i);
      items.push({
        id:key,
        title:titleMatch ? titleMatch[1].replace(/\\u([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\n/g," ").slice(0,250) : "Видео VK",
        author:authorMatch ? authorMatch[1].slice(0,100) : "VK Видео",
        thumbnail:imageMatch ? imageMatch[0].replace(/\\\//g,"/") : "",
        url:"https://vkvideo.ru/video"+key
      });
    }
    return new Response(JSON.stringify({items,message:items.length ? "" : "VK не вернул публичные результаты. Возможно, поиск временно ограничен."}),{status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=30"}});
  } catch (error) {
    return new Response(JSON.stringify({error:"Не удалось связаться с публичным поиском VK. Попробуй позже."}),{status:502,headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
}