function decodeHtml(value) {
  return String(value || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function clean(value, max=250) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g," ")).replace(/\\s+/g," ").trim().slice(0,max);
}
function unwrapUrl(raw) {
  try {
    const u=new URL(decodeHtml(raw),"https://duckduckgo.com");
    const redirected=u.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : u.href;
  } catch { return ""; }
}
export async function onRequest({request}) {
  if(request.method!=="GET") return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:{"content-type":"application/json"}});
  const q=(new URL(request.url).searchParams.get("q")||"").trim().slice(0,100);
  if(q.length<2) return new Response(JSON.stringify({error:"Введите минимум 2 символа."}),{status:400,headers:{"content-type":"application/json"}});
  try {
    const searchUrl="https://html.duckduckgo.com/html/?q="+encodeURIComponent("site:vkvideo.ru/video OR site:vk.com/video "+q);
    const response=await fetch(searchUrl,{headers:{"accept":"text/html,application/xhtml+xml","accept-language":"ru-RU,ru;q=0.9,en;q=0.7","user-agent":"Mozilla/5.0 (compatible; LAWatch/1.0)"}});
    if(!response.ok) throw new Error("Search provider unavailable");
    const html=(await response.text()).slice(0,5000000);
    const items=[],seen=new Set();
    const anchors=html.match(/<a\\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*>[\\s\\S]*?<\\/a>/gi)||[];
    for(const anchor of anchors) {
      const hrefMatch=anchor.match(/href=["']([^"']+)["']/i);
      if(!hrefMatch) continue;
      const videoUrl=unwrapUrl(hrefMatch[1]);
      let parsed;
      try { parsed=new URL(videoUrl); } catch { continue; }
      const host=parsed.hostname.replace(/^www\\./,"").toLowerCase();
      if(host!=="vkvideo.ru"&&host!=="vk.com") continue;
      const idMatch=parsed.pathname.match(/video(-?\\d+_\\d+)/i);
      if(!idMatch||seen.has(idMatch[1])) continue;
      seen.add(idMatch[1]);
      const title=clean(anchor.replace(/<\\/a>/i,"").replace(/<[^>]*>/g," "));
      items.push({id:idMatch[1],title:title||"Видео VK",author:"VK Видео",thumbnail:"",url:"https://vkvideo.ru/video"+idMatch[1]});
      if(items.length>=15) break;
    }
    return new Response(JSON.stringify({items,message:items.length?"":"Поисковик пока не нашёл индексированные публичные видео VK. Попробуй другой запрос."}),{status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=60"}});
  } catch {
    return new Response(JSON.stringify({error:"Внешний поисковик временно недоступен. Попробуй позже."}),{status:502,headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
}