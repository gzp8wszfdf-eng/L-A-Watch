import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ArrowLeft, DoorOpen, LogOut, Plus, RefreshCw, Send, Users, Play, Lock, Globe, X } from 'lucide-react';

type Room = { id: string; code: string; title: string; visibility: 'public'|'private'; created_at?: string };
type Message = { id: string; room_id: string; username: string; content: string; created_at: string };
type Playback = { room_id: string; video_url: string|null; video_position: number; is_playing: boolean; updated_at?: string; client_id?: string };
const clientId = Math.random().toString(36).slice(2);

function videoEmbed(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return 'https://www.youtube-nocookie.com/embed/' + u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
      return id ? 'https://www.youtube-nocookie.com/embed/' + id : '';
    }
    if (u.hostname.includes('rutube.ru')) {
      const id = u.pathname.match(/(?:video|play\/embed)\/([a-zA-Z0-9]+)/)?.[1];
      return id ? 'https://rutube.ru/play/embed/' + id : '';
    }
    return '';
  } catch { return ''; }
}

export default function Watch() {
  const [session,setSession]=useState<Session|null>(null);
  const [authReady,setAuthReady]=useState(false);
  const [authMode,setAuthMode]=useState<'login'|'signup'>('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [username,setUsername]=useState('');
  const [displayName,setDisplayName]=useState('');
  const [authMessage,setAuthMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [tab,setTab]=useState<'public'|'mine'>('public');
  const [rooms,setRooms]=useState<Room[]>([]);
  const [code,setCode]=useState('');
  const [title,setTitle]=useState('Комната просмотра');
  const [visibility,setVisibility]=useState<'public'|'private'>('private');
  const [notice,setNotice]=useState('');
  const [activeRoom,setActiveRoom]=useState<Room|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState('');
  const [videoUrl,setVideoUrl]=useState('');
  const [videoInput,setVideoInput]=useState('');
  const [profileName,setProfileName]=useState('');
  const [guest,setGuest]=useState(false);

  const user: User|undefined=session?.user;
  const isGuest=!!(user?.is_anonymous || guest);
  const say=(s:string)=>setNotice(s);

  useEffect(()=>{
    let alive=true;
    supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setAuthReady(true)}});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setAuthReady(true)});
    return ()=>{alive=false;subscription.unsubscribe()};
  },[]);

  useEffect(()=>{
    if(!user){setProfileName('');setGuest(false);return}
    setGuest(!!user.is_anonymous);
    if(user.is_anonymous){setProfileName('Гость');return}
    supabase.from('profiles').select('username').eq('id',user.id).maybeSingle()
      .then(({data})=>setProfileName(data?.username||user.email?.split('@')[0]||'Пользователь'));
  },[user?.id]);

  const loadRooms=useCallback(async()=>{
    if(!user){setRooms([]);return}
    if(tab==='public'){
      const {data,error}=await supabase.rpc('list_public_watch_rooms');
      if(error){say('Не удалось загрузить открытые комнаты: '+error.message);return}
      setRooms((data||[]).map((r:any)=>({id:r.room_id,code:r.room_code,title:r.room_title||'Комната просмотра',visibility:'public'})));
    } else {
      const {data,error}=await supabase.from('room_members').select('room_id,rooms!inner(id,code,title,visibility,created_at)').eq('user_id',user.id).order('joined_at',{ascending:false});
      if(error){say('Не удалось загрузить твои комнаты: '+error.message);return}
      setRooms((data||[]).map((r:any)=>r.rooms).filter(Boolean));
    }
  },[user?.id,tab]);

  useEffect(()=>{loadRooms()},[loadRooms]);

  const enterRoom=async(room:Room)=>{
    setBusy(true);say('Подключаемся к комнате…');
    const {data:member,error:memberError}=await supabase.from('room_members').select('room_id').eq('room_id',room.id).eq('user_id',user?.id).maybeSingle();
    if(memberError||!member){setBusy(false);say('Не удалось подтвердить участие в комнате. Войди по коду ещё раз.');return}
    setActiveRoom(room);setVideoUrl('');setVideoInput('');setMessages([]);
    const [{data:msgs,error:msgError},{data:playback}]=await Promise.all([
      supabase.from('messages').select('*').eq('room_id',room.id).order('created_at',{ascending:true}).limit(100),
      supabase.from('playback_state').select('*').eq('room_id',room.id).maybeSingle()
    ]);
    if(msgError)say('Комната открыта, но чат не загрузился: '+msgError.message);
    setMessages(msgs||[]);
    if(playback?.video_url){setVideoUrl(playback.video_url);setVideoInput(playback.video_url)}
    setBusy(false);say('Ты в комнате. Чат и выбранное видео синхронизируются.');
  };

  useEffect(()=>{
    if(!activeRoom)return;
    const channel=supabase.channel('one-watch-'+activeRoom.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'room_id=eq.'+activeRoom.id},payload=>{
        const msg=payload.new as Message;
        setMessages(prev=>prev.some(x=>x.id===msg.id)?prev:[...prev,msg]);
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'playback_state',filter:'room_id=eq.'+activeRoom.id},payload=>{
        const state=payload.new as Playback;
        if(state?.video_url && state.client_id!==clientId){setVideoUrl(state.video_url);setVideoInput(state.video_url)}
      })
      .subscribe();
    return ()=>{supabase.removeChannel(channel)};
  },[activeRoom?.id]);

  const authSubmit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setAuthMessage('');
    try{
      if(authMode==='login'){
        const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
        if(error)throw error;
      }else{
        const clean=username.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
        if(clean.length<3)throw new Error('Ник должен содержать минимум 3 символа.');
        const {data,error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password,options:{data:{username:clean,display_name:displayName.trim()}}});
        if(error)throw error;
        if(!data.session)setAuthMessage('Аккаунт создан. Подтверди почту по ссылке из письма, затем войди.');
      }
    }catch(err){setAuthMessage(err instanceof Error?err.message:'Не удалось выполнить вход.')}
    finally{setBusy(false)}
  };

  const createRoom=async()=>{
    if(!user)return;
    if(isGuest){say('Гости могут входить в комнаты, но создавать их могут только зарегистрированные пользователи.');return}
    setBusy(true);
    const {data,error}=await supabase.rpc('create_watch_room',{p_visibility:visibility,p_title:title.trim()||'Комната просмотра'});
    if(error){say('Не удалось создать комнату: '+error.message);setBusy(false);return}
    const row=Array.isArray(data)?data[0]:data;
    if(!row?.room_id||!row?.room_code){say('Сервер не вернул код комнаты.');setBusy(false);return}
    const room:Room={id:row.room_id,code:row.room_code,title:title.trim()||'Комната просмотра',visibility};
    await loadRooms();await enterRoom(room);setBusy(false);
  };

  const joinRoom=async()=>{
    if(!code.trim()){say('Введи код комнаты.');return}
    setBusy(true);
    const {data:id,error}=await supabase.rpc('join_watch_room',{p_code:code.trim().toUpperCase()});
    if(error){say('Не удалось войти: '+error.message);setBusy(false);return}
    const {data:room}=await supabase.from('rooms').select('id,code,title,visibility').eq('id',id).maybeSingle();
    if(room)await enterRoom(room as Room);else say('Вход выполнен, но не удалось загрузить комнату.');
    setBusy(false);
  };

  const sendMessage=async(e:FormEvent)=>{
    e.preventDefault();if(!activeRoom||!user||!draft.trim())return;
    if(isGuest){say('Гостям доступен просмотр, но писать в чат могут только зарегистрированные пользователи.');return}
    const text=draft.trim().slice(0,1000);setDraft('');
    const {error}=await supabase.from('messages').insert({room_id:activeRoom.id,username:profileName||user.email?.split('@')[0]||'Пользователь',content:text});
    if(error){setDraft(text);say('Не удалось отправить сообщение: '+error.message)}
  };

  const setVideo=async(e:FormEvent)=>{
    e.preventDefault();if(!activeRoom||!videoInput.trim())return;
    const url=videoInput.trim();
    if(!/^https?:\/\//i.test(url)){say('Вставь полную ссылку, начинающуюся с https://');return}
    const {error}=await supabase.from('playback_state').upsert({room_id:activeRoom.id,video_url:url,video_position:0,is_playing:true,updated_at:new Date().toISOString(),client_id:clientId},{onConflict:'room_id'});
    if(error){say('Не удалось отправить видео: '+error.message);return}
    setVideoUrl(url);say('Видео отправлено всем участникам комнаты.');
  };

  const searchVideos=async(e?:FormEvent)=>{
    e?.preventDefault();
    const q=searchQuery.trim();
    if(q.length<2){setSearchError('Введи минимум 2 символа.');return}
    setSearchBusy(true);setSearchError('');setSearchResults([]);
    try{
      const endpoint=searchProvider==='youtube'?'/api/youtube-search':'/api/rutube-search';
      const response=await fetch('https://l-a-watch.pages.dev'+endpoint+'?q='+encodeURIComponent(q));
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||'Поиск временно недоступен.');
      const items=searchProvider==='youtube'?(data.items||[]).filter((x:any)=>x.id?.videoId).map((x:any)=>({id:x.id.videoId,title:x.snippet?.title||'Видео YouTube',author:x.snippet?.channelTitle||'YouTube',thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||'',url:'https://www.youtube.com/watch?v='+x.id.videoId})):(data.items||[]);
      setSearchResults(items);if(!items.length)setSearchError('Ничего не найдено. Попробуй другой запрос.');
    }catch(err){setSearchError(err instanceof Error?err.message:'Не удалось выполнить поиск.')}
    finally{setSearchBusy(false)}
  };
  const chooseSearchVideo=async(url:string)=>{
    if(!activeRoom)return;
    const {error}=await supabase.from('playback_state').upsert({room_id:activeRoom.id,video_url:url,video_position:0,is_playing:true,updated_at:new Date().toISOString(),client_id:clientId},{onConflict:'room_id'});
    if(error){say('Не удалось отправить видео: '+error.message);return}
    setVideoUrl(url);setVideoInput(url);setSearchOpen(false);setSearchQuery('');setSearchResults([]);say('Видео отправлено всем участникам комнаты.');
  };
  const signOut=async()=>{await supabase.auth.signOut();setActiveRoom(null);setRooms([]);say('Ты вышел из аккаунта.')};
  const embed=useMemo(()=>videoEmbed(videoUrl),[videoUrl]);

  if(!authReady)return <div className="watch-live-panel">Подключаем L&amp;A Watch…</div>;

  return <section className="watch-live">
    <div className="watch-hero">
      <div className="watch-hero-top"><span className="watch-live-dot"/> L&amp;A WATCH <span className="watch-beta">LIVE</span></div>
      <h1>Смотри <em>вместе.</em></h1>
      <p>Настоящие комнаты L&amp;A Watch — общие сессии с сайта и One.</p>
    </div>
    {!session ? <div className="watch-live-panel">
      <h2>{authMode==='login'?'Войти в L&A Watch':'Создать аккаунт'}</h2>
      <p>Используй тот же аккаунт, что и на сайте L&amp;A Watch.</p>
      <form className="watch-auth-form" onSubmit={authSubmit}>
        {authMode==='signup'&&<><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Ник (латиница, цифры, _)"/><input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Имя (необязательно)"/></>}
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Электронная почта" required/>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль" required minLength={6}/>
        <button className="primary" disabled={busy}>{busy?'Подождите…':authMode==='login'?'Войти':'Зарегистрироваться'}</button>
      </form>
      <button className="watch-text-btn" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthMessage('')}}>{authMode==='login'?'Нет аккаунта? Зарегистрироваться':'Уже есть аккаунт? Войти'}</button>
      <button className="watch-text-btn" onClick={async()=>{setBusy(true);const {error}=await supabase.auth.signInAnonymously();setBusy(false);if(error)setAuthMessage(error.message)}}>Продолжить как гость</button>
      {authMessage&&<p className="watch-notice">{authMessage}</p>}
    </div> : activeRoom ? <div className="watch-live-panel">
      <div className="watch-room-top"><button className="watch-back" onClick={()=>{setActiveRoom(null);loadRooms()}}><ArrowLeft size={16}/> Комнаты</button><span className="watch-room-code">{activeRoom.visibility==='private'?'КОД: '+activeRoom.code:'ОТКРЫТАЯ'}</span></div>
      <h2>{activeRoom.title}</h2>
      <div className="watch-video-frame">{embed?<iframe src={embed} title="L&A Watch video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/>:<div className="watch-video-empty"><Play size={32}/><b>Добавь видео</b><small>YouTube, RuTube или ссылку на видео</small></div>}</div>
      <div className="watch-search-actions"><button type="button" onClick={()=>{setSearchProvider("youtube");setSearchOpen(true);setSearchError("");setSearchResults([])}}><Youtube size={17}/> Найти на YouTube</button><button type="button" onClick={()=>{setSearchProvider("rutube");setSearchOpen(true);setSearchError("");setSearchResults([])}}><Film size={17}/> Найти на RuTube</button></div><form className="watch-video-form" onSubmit={setVideo}><input value={videoInput} onChange={e=>setVideoInput(e.target.value)} placeholder="Или вставь ссылку на видео"/><button className="primary">▶</button></form>
      <div className="watch-chat-head">Чат комнаты <span>{messages.length}</span></div>
      <div className="watch-chat-list">{messages.map(m=><div className="watch-chat-message" key={m.id}><b>{m.username}</b><span>{m.content}</span></div>)}</div>
      {isGuest?<p className="watch-muted">Гостевой режим: можно смотреть, но нельзя писать.</p>:<form className="watch-chat-form" onSubmit={sendMessage}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Сообщение…"/><button aria-label="Отправить"><Send size={17}/></button></form>}
      <button className="watch-text-btn" onClick={()=>{setActiveRoom(null);loadRooms()}}>Выйти из комнаты</button>
    </div> : <>
      <div className="watch-live-panel">
        <div className="watch-user-line"><span>Вошёл как <b>{profileName||'Пользователь'}</b>{isGuest?' · гость':''}</span><button className="watch-text-btn" onClick={signOut}><LogOut size={14}/> Выйти</button></div>
        {!isGuest&&<><h2>Создать комнату</h2><input className="watch-full-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Название комнаты"/><div className="watch-visibility"><button className={visibility==='public'?'selected':''} onClick={()=>setVisibility('public')}><Globe size={15}/> Открытая</button><button className={visibility==='private'?'selected':''} onClick={()=>setVisibility('private')}><Lock size={15}/> Закрытая</button></div><button className="primary watch-create" onClick={createRoom} disabled={busy}><Plus size={16}/> Создать комнату</button></>}
        <h2>Войти по коду</h2><div className="watch-join-form"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="КОД КОМНАТЫ" maxLength={12}/><button className="primary" onClick={joinRoom} disabled={busy}>Войти</button></div>
        <div className="watch-section-head"><h2>Комнаты</h2><button className="icon-btn tiny" onClick={loadRooms}><RefreshCw size={16}/></button></div>
        <div className="watch-tabs"><button className={tab==='public'?'selected':''} onClick={()=>setTab('public')}>Открытые</button><button className={tab==='mine'?'selected':''} onClick={()=>setTab('mine')}>Мои комнаты</button></div>
        <div className="watch-live-room-list">{rooms.length?rooms.map(r=><div className="watch-live-room" key={r.id}><div><b>{r.title}</b><small>{r.visibility==='public'?'Открытая комната':'Закрытая комната'}</small></div><button className="outline" onClick={()=>enterRoom(r)} disabled={busy}>Войти <DoorOpen size={14}/></button></div>):<div className="watch-empty"><Users size={24}/><b>Комнат пока нет</b><small>Создай свою или обнови список позже.</small></div>}</div>
      </div>
    </>}
<    {searchOpen&&<div className="watch-search-overlay"><div className="watch-search-modal"><div className="watch-search-title"><div><b>Поиск видео</b><small>{searchProvider==="youtube"?"YouTube":"RuTube"}</small></div><button type="button" onClick={()=>setSearchOpen(false)} aria-label="Закрыть"><X/></button></div><div className="watch-search-tabs"><button className={searchProvider==="youtube"?"selected":""} onClick={()=>{setSearchProvider("youtube");setSearchResults([]);setSearchError("")}}><Youtube size={16}/> YouTube</button><button className={searchProvider==="rutube"?"selected":""} onClick={()=>{setSearchProvider("rutube");setSearchResults([]);setSearchError("")}}><Film size={16}/> RuTube</button></div><form className="watch-search-form" onSubmit={searchVideos}><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Название фильма или видео…"/><button className="primary" disabled={searchBusy}><Search size={17}/></button></form>{searchBusy&&<p className="watch-search-state">Ищем видео…</p>}{searchError&&<p className="watch-search-state">{searchError}</p>}<div className="watch-search-results">{searchResults.map((item:any)=><button className="watch-search-result" key={item.id} onClick={()=>chooseSearchVideo(item.url)}>{item.thumbnail?<img src={item.thumbnail} alt=""/>:<div className="watch-search-thumb"><Play/></div>}<span><b>{item.title}</b><small>{item.author}</small></span><Play size={17}/></button>)}</div></div></div>}
    {notice&&<div className="watch-notice"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={14}/></button></div>}
  </section>;
}
