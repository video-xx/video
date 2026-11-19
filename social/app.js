const SUPABASE_URL = window.AEVY_SOCIAL.url;
const SUPABASE_KEY = window.AEVY_SOCIAL.key;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

let me=null, peer=null, people=[], convos={}, thread=[], online=new Set(), typingUntil=0, lastTyped=0, channel=null, signup=false;

/* ---------- helpers ---------- */
const hue = s => { let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))%360; return h; };
const PAL=[['#0695ff','#a334fa'],['#a334fa','#ff6968'],['#ff6968','#ff7e29'],['#00b2ff','#006aff'],['#31a24c','#00c6a2'],['#ff5280','#a334fa']];
function avatar(p, cls=''){
  const a=document.createElement('div'); a.className='av '+cls;
  const pc=PAL[hue(p.username)%PAL.length]; a.style.background=`linear-gradient(135deg,${pc[0]},${pc[1]})`;
  if(p.avatar_url&&p.avatar_url.startsWith(SUPABASE_URL+'/')&&/^[^"'()\s]+$/.test(p.avatar_url)) a.style.background='center/cover url("'+p.avatar_url+'")';
  else a.textContent=p.username[0].toUpperCase();
  if(online.has(p.id)){ a.appendChild(document.createElement('i')); }
  return a;
}
const sameDay=(a,b)=>a.toDateString()===b.toDateString();
function dayLabel(d){
  const t=new Date(), y=new Date(Date.now()-864e5);
  if(sameDay(d,t)) return 'Today'; if(sameDay(d,y)) return 'Yesterday';
  return d.toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'});
}
function stamp(iso){
  const d=new Date(iso), n=new Date();
  if(sameDay(d,n)) return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  if(n-d<6048e5) return d.toLocaleDateString([], {weekday:'short'});
  return d.toLocaleDateString([], {month:'short',day:'numeric'});
}
function toast(t){ const e=document.createElement('div'); e.className='toast'; e.textContent=t; document.body.appendChild(e); setTimeout(()=>e.remove(),3200); }
const isEmoji = s => s && s.length<=8 && /^(\p{Extended_Pictographic}|\u200d|\ufe0f|\s)+$/u.test(s);

/* ---------- theme ---------- */
let meEmail='';
const PD={theme:'system',accent:'',wall:'dots',size:'15',enter:!matchMedia('(hover:none)').matches,sound:true,typing:true,active:true};
let P={...PD}; try{ P={...PD,...JSON.parse(localStorage.getItem('avey-prefs')||'{}')}; }catch(e){}
const savePrefs=()=>{ try{localStorage.setItem('avey-prefs',JSON.stringify(P))}catch(e){} };
function applyPrefs(){
  const d=document.documentElement, dark=P.theme==='dark'||(P.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
  d.dataset.theme=dark?'dark':'light'; d.dataset.wall=P.wall; d.style.setProperty('--fs',P.size+'px');
  if(P.accent){ d.style.setProperty('--blue',P.accent); d.style.setProperty('--mine',P.accent); } else { d.style.removeProperty('--blue'); d.style.removeProperty('--mine'); }
  document.querySelector('meta[name=theme-color]').content=dark?'#111b21':'#ffffff';
}
applyPrefs(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyPrefs);
$('theme').onclick=()=>{ P.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'; savePrefs(); applyPrefs(); };

/* ---------- auth ---------- */
function setMode(s){
  signup=s;
  $('auth-title').textContent = s?'Create account':'Sign in';
  $('auth-btn').textContent = s?'Create account':'Sign in';
  $('switch-text').textContent = s?'Already have an account?':'New here?';
  $('switch-btn').textContent = s?'Sign in':'Create an account';
  $('name-wrap').classList.toggle('hidden',!s);
  $('password').autocomplete = s?'new-password':'current-password';
  say('');
}
function say(t,ok){ const m=$('auth-msg'); m.textContent=t; m.className='msg'+(ok?' ok':''); }
$('switch-btn').onclick = () => setMode(!signup);
$('auth-form').onsubmit = async e => {
  e.preventDefault();
  const email=$('email').value.trim(), password=$('password').value, btn=$('auth-btn');
  btn.disabled=true; say('');
  try{
    if(signup){
      const username=$('username').value.trim().toLowerCase();
      if(!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error('Username must be 3–20 letters, numbers or underscores.');
      const {data,error}=await sb.auth.signUp({email,password,options:{data:{username}}});
      if(error) throw error;
      if(!data.session){ setMode(false); say('Check your email to confirm your account, then sign in.',true); }
    }else{
      const {error}=await sb.auth.signInWithPassword({email,password});
      if(error) throw error;
    }
  }catch(err){
    const m=err.message||'Something went wrong.';
    say(/database error|username/i.test(m)&&signup ? 'That username is taken. Try another.' : m);
  }finally{ btn.disabled=false; }
};
$('out').onclick = async () => { await dropPush(); sb.auth.signOut(); };
sb.auth.onAuthStateChange((_e,session)=>{
  if(session?.user){ if(!me||me.id!==session.user.id) setTimeout(()=>boot(session.user),0); }
  else teardown();
});

/* ---------- boot ---------- */
async function boot(user){
  const {data:prof}=await sb.from('profiles').select('id,username,avatar_url,bio,verified').eq('id',user.id).single();
  me=prof||{id:user.id,username:(user.email||'me').split('@')[0]};
  $('me-name').textContent=', '+me.username; meEmail=user.email||'';
  $('auth').classList.add('hidden'); $('app').classList.remove('hidden');
  const [{data:pp},{data:ms,error}]=await Promise.all([
    sb.from('profiles').select('id,username,avatar_url,bio,verified').neq('id',me.id).order('username'),
    sb.from('messages').select('*').order('created_at',{ascending:false}).limit(600)
  ]);
  people=pp||[];
  if(error) toast('Run schema.sql in Supabase to enable messages.');
  convos={};
  for(const m of (ms||[])){
    const pid=m.sender_id===me.id?m.recipient_id:m.sender_id;
    const c=convos[pid]||(convos[pid]={last:m,unread:0});
    if(m.recipient_id===me.id&&!m.read_at) c.unread++;
  }
  renderList();

  openFromUrl(); loadExtras(); initPush(); loadRooms(); loadContacts();
  channel=sb.channel('avey',{config:{presence:{key:me.id},broadcast:{self:false}}})
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'recipient_id=eq.'+me.id},p=>incoming(p.new))
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages',filter:'sender_id=eq.'+me.id},p=>{
      const t=thread.find(x=>x.id===p.new.id); if(t){Object.assign(t,p.new); renderLog();}
      const c=convos[p.new.recipient_id]; if(c&&c.last.id===p.new.id) c.last=p.new;
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages',filter:'recipient_id=eq.'+me.id},p=>{ const t=thread.find(x=>x.id===p.new.id); if(t){Object.assign(t,p.new); renderLog();} const c=convos[p.new.sender_id]; if(c&&c.last.id===p.new.id){c.last=p.new; renderList();} })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages'},p=>{ const i=thread.findIndex(x=>x.id===p.old.id); if(i>-1){thread.splice(i,1); renderLog();} for(const k in convos) if(convos[k].last.id===p.old.id) convos[k].last={...convos[k].last,body:'Message deleted',image_url:null,audio_url:null}; renderList(); })
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'room_messages'},p=>roomIncoming(p.new))
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'room_messages'},p=>{ thread=thread.filter(x=>x.id!==p.old.id); if(room) renderLog(); loadRooms(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'room_members'},()=>{ clearTimeout(rT); rT=setTimeout(loadRooms,400); })
    .on('postgres_changes',{event:'*',schema:'public',table:'follows'},p=>onLive('follows',p))
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},p=>onLive('profiles',p))
    .on('postgres_changes',{event:'*',schema:'public',table:'stories'},p=>onLive('stories',p))
    .on('postgres_changes',{event:'*',schema:'public',table:'notes'},p=>onLive('notes',p))
    .on('postgres_changes',{event:'*',schema:'public',table:'story_likes'},p=>onLive('story_likes',p))
    .on('postgres_changes',{event:'*',schema:'public',table:'message_likes'},p=>onLive('message_likes',p))
    .on('presence',{event:'sync'},()=>{ online=new Set(Object.keys(channel.presenceState())); renderList(); head(); })
    .on('broadcast',{event:'file'},({payload})=>onFile(payload))
    .on('broadcast',{event:'call'},({payload})=>onCall(payload))
    .on('broadcast',{event:'typing'},({payload})=>{
      if(peer&&payload.from===peer.id){ typingUntil=Date.now()+3000; head(); renderLog(); setTimeout(()=>{head();renderLog();},3100); }
    })
    .subscribe(s=>{ if(s==='SUBSCRIBED'){ if(P.active!==false) channel.track({u:me.username}); channel.send({type:'broadcast',event:'call',payload:{to:'*',from:me.id,kind:'sync'}}); } });
}
function teardown(){
  if(channel){ sb.removeChannel(channel); channel=null; }
  me=peer=room=null; rooms=[]; rconvos={}; contacts=[]; discover=[]; people=[]; convos={}; thread=[]; online=new Set(); stories=[]; sLikes=[]; notes={}; mLikes=[]; follows=[]; closeViewer(); closeProfile(); if(call) endCall(); xfers.forEach(closeX); xfers.clear(); for(const k in tx) delete tx[k];
  $('app').classList.add('hidden'); $('app').classList.remove('chatting');
  $('chat').style.display='none'; $('placeholder').classList.remove('hidden');
  $('auth').classList.remove('hidden');
}

/* ---------- chat list ---------- */
function preview(m){
  const mine=m.sender_id===me.id;
  return (mine?'You: ':'')+(m.audio_url&&!m.body?'Sent a voice message':m.image_url&&!m.body?'Sent a photo':m.body);
}
function rowFor(p,c){
  const b=document.createElement('button'); b.className='row'+(c&&c.unread?' unread':'');
  b.setAttribute('aria-current',peer&&peer.id===p.id?'true':'false');
  const mid=document.createElement('div'); mid.className='mid';
  const nm=document.createElement('div'); nm.className='nm'; nm.textContent=p.username; badge(nm,p); mid.appendChild(nm);
  if(c){ const pv=document.createElement('div'); pv.className='pv';
    const a=document.createElement('span'); a.textContent=preview(c.last);
    pv.appendChild(a); mid.appendChild(pv); }
  b.append(avatar(p),mid);
  if(c){ const end=document.createElement('div'); end.className='end';
    const t=document.createElement('span'); t.textContent=stamp(c.last.created_at); end.appendChild(t);
    if(c.unread){ const g=document.createElement('span'); g.className='badge'; g.textContent=c.unread>99?'99+':c.unread; end.appendChild(g); }
    b.appendChild(end); }
  b.onclick=()=>openChat(p);
  return b;
}
function renderList(){
  if(tabSel!=='chats') return renderTab();
  const q=$('q').value.trim().toLowerCase(), box=$('list'); box.innerHTML='';
  const byId=Object.fromEntries(people.map(p=>[p.id,p]));
  const talking=Object.keys(convos).filter(id=>byId[id]).sort((a,b)=>new Date(convos[b].last.created_at)-new Date(convos[a].last.created_at)).map(id=>byId[id]);
  const others=people.filter(p=>!convos[p.id]).sort((a,b)=>following(b.id)-following(a.id));
  const f=l=>l.filter(p=>p.username.includes(q));
  const A=f(talking), B=f(others);
  if(A.length){ if(q){const h=document.createElement('div');h.className='sec';h.textContent='Chats';box.appendChild(h);} A.forEach(p=>box.appendChild(rowFor(p,convos[p.id]))); }
  if(B.length){ const h=document.createElement('div'); h.className='sec'; h.textContent=A.length||q?'People':'People on aveysocial'; box.appendChild(h); B.forEach(p=>box.appendChild(rowFor(p,null))); }
  if(!A.length&&!B.length){
    const e=document.createElement('div');
    if(q){ e.className='empty'; e.textContent='No one found with that name.'; }
    else{
      e.className='noone';
      e.innerHTML='<div class="ic"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M17 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-2.7-1.7-4.8-4-5.6"/></svg></div><b>Find your people</b>Invite friends to join aveysocial, then chat, share stories and follow each other.';
      const bt=document.createElement('button'); bt.className='btn'; bt.textContent='Copy invite link'; bt.onclick=invite; e.appendChild(bt);
    }
    box.appendChild(e);
  }
}
$('q').oninput=renderList;

/* ---------- conversation ---------- */
function head(){
  if(room){ roomHead(); return; }
  if(!peer) return;
  $('h-name').textContent=peer.username; badge($('h-name'),peer);
  $('h-status').textContent = Date.now()<typingUntil ? 'typing…' : online.has(peer.id)?'Active now':'Offline';
  const h=$('h-av'); h.innerHTML=''; h.appendChild(avatar(peer,'sm'));
}
async function openChat(p){
  abortRec(); clearBar(); room=null; peer=p; thread=[]; typingUntil=0;
  $('placeholder').classList.add('hidden'); $('chat').style.display='flex';
  $('app').classList.add('chatting'); chatUI(); head(); renderLog(); renderList();
  const {data,error}=await sb.from('messages').select('*')
    .or(`and(sender_id.eq.${me.id},recipient_id.eq.${p.id}),and(sender_id.eq.${p.id},recipient_id.eq.${me.id})`)
    .order('created_at',{ascending:false}).limit(300);
  if(peer!==p) return;
  if(error){ toast('Could not load messages.'); return; }
  thread=data.reverse(); renderLog(true); markRead(); $('text').focus();
}
async function markRead(){
  if(!peer) return; const c=convos[peer.id];
  if(c&&c.unread){ c.unread=0; renderList(); }
  await sb.rpc('mark_read',{peer_id:peer.id});
}
let rlq=0,rlj=false,stuck=false;
function renderLog(jump){ rlj=rlj||!!jump; if(rlq) return; rlq=requestAnimationFrame(()=>{ rlq=0; const j=rlj; rlj=false; renderLogNow(j); }); }
function renderLogNow(jump){
  const items=thread.concat(txItems()).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const log=$('log'), near=jump||log.scrollHeight-log.scrollTop-log.clientHeight<140, st=log.scrollTop; stuck=near;
  log.innerHTML='';
  if(!items.length&&(peer||room)){
    const e=document.createElement('div'); e.className='empty'; e.append(avatar(peer||room),document.createElement('br'));
    e.lastChild.replaceWith(document.createElement('br'));
    const t=document.createElement('div'); t.textContent=(room?'No messages yet in '+room.name+'.':'This is the start of your chat with '+peer.username+'. Say hello!'); e.appendChild(t); log.appendChild(e);
  }
  let lastOwn=-1; items.forEach((m,i)=>{ if(m.sender_id===me.id&&!m._tx&&!m._room) lastOwn=i; });
  items.forEach((m,i)=>{
    const d=new Date(m.created_at), prev=items[i-1], next=items[i+1];
    if(!prev||!sameDay(new Date(prev.created_at),d)){ const s=document.createElement('div'); s.className='day'; s.textContent=dayLabel(d); log.appendChild(s); }
    const mine=m.sender_id===me.id;
    const first=!prev||prev.sender_id!==m.sender_id||!sameDay(new Date(prev.created_at),d)||(d-new Date(prev.created_at))>9e5;
    const last=!next||next.sender_id!==m.sender_id||(new Date(next.created_at)-d)>9e5;
    const row=document.createElement('div'); row.className='m '+(mine?'mine':'theirs')+(first?' first':'')+(last?' last':'');
    if(!mine){ if(last) row.appendChild(avatar(userById(m.sender_id)||peer||room)); else { const sp=document.createElement('span'); sp.className='sp'; row.appendChild(sp);} }
    if(!mine&&last) row.firstChild.className='av';
    const wrap=document.createElement('div'); wrap.style.display='contents';
    if(m.image_url){ const b=document.createElement('div'); b.className='b img'; const im=document.createElement('img'); im.src=m.image_url; im.alt='Photo'; im.loading='lazy'; im.onload=()=>{ if(stuck) $('log').scrollTop=$('log').scrollHeight; }; im.onclick=()=>{ $('lightbox').querySelector('img').src=m.image_url; $('lightbox').classList.remove('hidden'); }; b.appendChild(im); row.appendChild(b); }
    if(m._tx) row.appendChild(fileBubble(m));
    if(m.audio_url) row.appendChild(voiceBubble(m));
    if(m.body){ const b=document.createElement('div'); b.className='b'+(isEmoji(m.body)?' emoji':'');
      if(room&&!mine&&first){ const u=userById(m.sender_id), sn=document.createElement('b'); sn.className='sn'; sn.textContent=u?u.username:'Member'; sn.style.color='hsl('+hue(sn.textContent)+',55%,45%)'; badge(sn,u); b.appendChild(sn); }
      if(m.reply_to){ const rp=items.find(x=>x.id===m.reply_to), q=document.createElement('div'); q.className='q'; const qb=document.createElement('b'), qs=document.createElement('span');
        qb.textContent=rp?(rp.sender_id===me.id?'You':((userById(rp.sender_id)||{}).username||'Member')):'Message'; qs.textContent=rp?(rp.body||(rp.audio_url?'🎤 Voice message':'📷 Photo')):'Original message unavailable'; q.append(qb,qs); b.appendChild(q); }
      b.appendChild(document.createTextNode(m.body));
      const tm=document.createElement('span'); tm.className='tm'+(mine&&m.read_at?' rd':''); tm.textContent=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+(m.edited_at?' · edited':'')+(mine?(m.pending?' 🕓':m.read_at?' ✓✓':' ✓'):'');
      b.appendChild(tm); b.title=d.toLocaleString(); row.appendChild(b); }
    log.appendChild(row); decorate(row,m,mine);
    if(i===lastOwn){ const s=document.createElement('div'); s.className='status'; s.textContent=m.read_at?'Seen '+stamp(m.read_at):(m.pending?'Sending…':'Sent'); log.appendChild(s); }
  });
  if(Date.now()<typingUntil){ const t=document.createElement('div'); t.className='m theirs first last'; t.appendChild(avatar(peer)); const d=document.createElement('div'); d.className='b dots'; d.innerHTML='<i></i><i></i><i></i>'; t.appendChild(d); log.appendChild(t); }
  log.scrollTop=near?log.scrollHeight:st;
}
function touch(pid,m,unreadDelta){
  const c=convos[pid]||(convos[pid]={last:m,unread:0}); c.last=m; c.unread+=unreadDelta; renderList();
}
function incoming(m){
  if(P.sound!==false&&(document.hidden||!peer||m.sender_id!==peer.id)) blip();
  if(peer&&m.sender_id===peer.id){ thread.push(m); typingUntil=0; head(); renderLog(); touch(m.sender_id,m,0); markRead(); }
  else{
    touch(m.sender_id,m,1);
    if(!people.some(p=>p.id===m.sender_id)) sb.from('profiles').select('id,username,avatar_url,bio,verified').order('username').neq('id',me.id).then(({data})=>{people=data||people;renderList();});
  }
}

/* ---------- sending ---------- */
async function sendMessage(body,image_url,audio_url,audio_secs){
  if(room) return sendRoom(body);
  if(!peer) return;
  const rt=replyTo?replyTo.id:null; clearBar();
  const tmp={reply_to:rt,id:'t'+Date.now(),sender_id:me.id,recipient_id:peer.id,body,image_url:image_url||null,audio_url:audio_url||null,audio_secs:audio_secs||null,created_at:new Date().toISOString(),pending:true};
  thread.push(tmp); renderLog(true);
  const {data,error}=await sb.from('messages').insert({sender_id:me.id,recipient_id:peer.id,body,reply_to:rt,image_url:image_url||null,audio_url:audio_url||null,audio_secs:audio_secs||null}).select().single();
  const i=thread.indexOf(tmp);
  if(error){ if(i>-1) thread.splice(i,1); renderLog(); toast('Message not sent: '+error.message); return false; }
  if(i>-1) thread[i]=data; renderLog(); touch(peer.id,data,0); pingPeer(peer.id); return true;
}
function syncSendIcon(){ $('sendicon').textContent=$('text').value.trim()?'➤':'👍'; $('sendicon').style.cssText='font-size:'+($('text').value.trim()?'18px':'22px'); }
$('send').onsubmit=async e=>{
  e.preventDefault();
  const v=$('text').value.trim(), ed=editing;
  $('text').value=''; autosize(); syncSendIcon(); $('emojis').classList.add('hidden');
  if(ed){
    clearBar(); if(!v||v===ed.body) return;
    const {data,error}=await sb.from('messages').update({body:v,edited_at:new Date().toISOString()}).eq('id',ed.id).select().single();
    if(error) return toast(error.message);
    Object.assign(ed,data); renderLog(); const c=convos[peer.id]; if(c&&c.last.id===ed.id){ c.last=ed; renderList(); } return;
  }
  await sendMessage(v||'👍');
};
$('text').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey&&P.enter){ e.preventDefault(); $('send').requestSubmit(); } });
$('text').addEventListener('input',()=>{
  autosize(); syncSendIcon();
  if(channel&&peer&&P.typing!==false&&Date.now()-lastTyped>2000){ lastTyped=Date.now(); channel.send({type:'broadcast',event:'typing',payload:{from:me.id,to:peer.id}}); }
});
function autosize(){ const t=$('text'); t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,140)+'px'; }

$('attach').onclick=()=>$('file').click();
$('file').onchange=e=>{ const fs=[...e.target.files]; e.target.value=''; fs.forEach(sendFile); };

const EMO='😀 😂 😍 😘 😎 🥳 😭 😡 👍 👎 🙏 👏 🔥 ❤️ 💔 🎉 😮 🤔 😴 🤝 💯 ✨ 😅 🙌'.split(' ');
EMO.forEach(x=>{ const b=document.createElement('button'); b.type='button'; b.textContent=x; b.onclick=()=>{ const t=$('text'); t.value+=x; t.focus(); autosize(); syncSendIcon(); }; $('emojis').appendChild(b); });
$('emoji').onclick=()=>$('emojis').classList.toggle('hidden');
$('back').onclick=()=>{ peer=room=null; $('app').classList.remove('chatting'); $('chat').style.display='none'; $('placeholder').classList.remove('hidden'); renderList(); };
$('lightbox').onclick=()=>$('lightbox').classList.add('hidden');
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ $('lightbox').classList.add('hidden'); $('emojis').classList.add('hidden'); } });
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) markRead(); });

sb.auth.getSession().then(({data})=>{ if(!data.session) $('auth').classList.remove('hidden'); });


/* ================= likes, stories, notes ================= */
let stories=[], sLikes=[], notes={}, mLikes=[], vq=[], vi=0, vtimer=null, sFile=null, sBg='#0099ff,#0052d4';
let seen=new Set(); try{ seen=new Set(JSON.parse(localStorage.getItem('avey-seen')||'[]')); }catch(e){}
const saveSeen=()=>{ try{ localStorage.setItem('avey-seen',JSON.stringify([...seen].slice(-300))); }catch(e){} };
const userById=id=>id===me.id?me:people.find(p=>p.id===id);
const fresh=n=>n&&Date.now()-new Date(n.updated_at)<864e5;
const bgOf=s=>/^#[0-9a-f]{6},#[0-9a-f]{6}$/i.test(s||'')?`linear-gradient(160deg,${s.split(',')[0]},${s.split(',')[1]})`:'linear-gradient(160deg,#0099ff,#0052d4)';

async function loadExtras(){
  const since=new Date(Date.now()-864e5).toISOString();
  const [s,n,ml,fl]=await Promise.all([
    sb.from('stories').select('*').gt('created_at',since).order('created_at'),
    sb.from('notes').select('*'),
    sb.from('message_likes').select('*'),
    sb.from('follows').select('*')]);
  stories=s.data||[]; notes=Object.fromEntries((n.data||[]).map(x=>[x.user_id,x])); mLikes=ml.data||[]; follows=fl.data||[];
  if(s.error) toast('Run the new schema.sql to enable stories and notes.');
  sLikes=stories.length?((await sb.from('story_likes').select('*').in('story_id',stories.map(x=>x.id))).data||[]):[];
  renderTray(); if(peer) renderLog();
}
function onLive(table,p){
  const n=p.new,o=p.old;
  if(table==='stories'){
    if(p.eventType==='INSERT'&&!stories.some(x=>x.id===n.id)) stories.push(n);
    if(p.eventType==='DELETE') stories=stories.filter(x=>x.id!==o.id);
    renderTray();
  }else if(table==='follows'){
    if(p.eventType==='INSERT'){ if(!follows.some(x=>x.follower_id===n.follower_id&&x.following_id===n.following_id)) follows.push(n); }
    else{ const i=follows.findIndex(x=>x.follower_id===o.follower_id&&x.following_id===o.following_id); if(i>-1) follows.splice(i,1); }
    renderTray(); renderList(); paintProfile();
  }else if(table==='profiles'){
    if(n.id===me.id) me={...me,...n};
    const i=people.findIndex(x=>x.id===n.id);
    if(i>-1){ people[i]={...people[i],...n}; if(peer&&peer.id===n.id) peer=people[i]; }
    renderList(); renderTray(); if(peer){ head(); renderLog(); } paintProfile();
  }else if(table==='notes'){
    if(p.eventType==='DELETE') delete notes[o.user_id]; else notes[n.user_id]=n;
    renderTray();
  }else{
    const k=table==='story_likes'?'story_id':'message_id', arr=table==='story_likes'?sLikes:mLikes;
    if(p.eventType==='INSERT'){ if(!arr.some(x=>x[k]===n[k]&&x.user_id===n.user_id)) arr.push(n); }
    else{ const i=arr.findIndex(x=>x[k]===o[k]&&x.user_id===o.user_id); if(i>-1) arr.splice(i,1); }
    if(table==='message_likes') renderLog(); else if(vq.length) paintLike();
  }
}

/* message likes */
function decorate(row,m,mine){
  if(m._tx||String(m.id).startsWith('t')) return;
  if(m._room){ addMore(row,m,mine); return; }
  const likes=mLikes.filter(l=>l.message_id===m.id), liked=likes.some(l=>l.user_id===me.id);
  const bubbles=row.querySelectorAll('.b'); bubbles.forEach(b=>b.ondblclick=()=>toggleMsgLike(m));
  if(likes.length&&bubbles.length){
    const b=bubbles[bubbles.length-1]; b.classList.add('liked');
    const h=document.createElement('span'); h.className='heart'; h.textContent='❤️'+(likes.length>1?' '+likes.length:''); b.appendChild(h);
  }
  const btn=document.createElement('button'); btn.type='button'; btn.className='lk'+(liked?' on':'');
  btn.textContent=liked?'❤️':'🤍'; btn.title=liked?'Remove like':'Like'; btn.setAttribute('aria-label',btn.title); btn.onclick=()=>toggleMsgLike(m);
  mine?row.prepend(btn):row.appendChild(btn);
  const mb=document.createElement('button'); mb.type='button'; mb.className='lk'; mb.textContent='⋯'; mb.setAttribute('aria-label','Message options'); mb.onclick=e=>openMenu(e,m,mine); mine?row.prepend(mb):row.appendChild(mb);
  row.oncontextmenu=e=>{ e.preventDefault(); openMenu(e,m,mine); }; lp(row,m,mine);
}
async function toggleMsgLike(m){
  const i=mLikes.findIndex(l=>l.message_id===m.id&&l.user_id===me.id);
  if(i>-1){ mLikes.splice(i,1); renderLog(); await sb.from('message_likes').delete().match({message_id:m.id,user_id:me.id}); return; }
  const row={message_id:m.id,user_id:me.id}; mLikes.push(row); renderLog();
  const {error}=await sb.from('message_likes').insert(row);
  if(error){ mLikes.splice(mLikes.indexOf(row),1); renderLog(); toast('Could not like: '+error.message); }
}

/* tray */
function renderTray(){
  const t=$('tray'); if(!t||!me) return; t.innerHTML=''; paintWelcome();
  const ids=[me.id,...people.filter(p=>stories.some(s=>s.user_id===p.id)||fresh(notes[p.id])).sort((a,b)=>following(b.id)-following(a.id)).map(p=>p.id)];
  ids.forEach(id=>{
    const u=userById(id), us=stories.filter(s=>s.user_id===id), note=notes[id], mine=id===me.id;
    const b=document.createElement('button'); b.type='button'; b.className='tr';
    if(fresh(note)){ const n=document.createElement('span'); n.className='note'; n.textContent=note.body; b.appendChild(n); }
    const ring=document.createElement('div'); ring.className='ring'+(us.length?(us.some(s=>!seen.has(s.id))?' new':' old'):''); ring.appendChild(avatar(u));
    if(mine){ const pl=document.createElement('span'); pl.className='plus'; pl.textContent='+'; pl.title='Add a story or note'; pl.onclick=e=>{e.stopPropagation(); openCompose(fresh(note)&&!us.length?'note':'story');}; ring.appendChild(pl); }
    const lb=document.createElement('small'); lb.textContent=mine?(us.length?'Your story':'Add story'):u.username;
    b.append(ring,lb);
    b.onclick=()=>{ if(us.length) openViewer(id); else if(mine) openCompose('story'); else openChat(u); };
    t.appendChild(b);
  });
}

/* viewer */
function openViewer(uid){
  vq=stories.filter(s=>s.user_id===uid); if(!vq.length) return;
  vi=Math.max(0,vq.findIndex(s=>!seen.has(s.id))); $('viewer').classList.remove('hidden'); showStory();
}
function closeViewer(){ clearTimeout(vtimer); vq=[]; const v=$('viewer'); if(v) v.classList.add('hidden'); if(me) renderTray(); }
function showStory(){
  clearTimeout(vtimer); const s=vq[vi]; if(!s) return closeViewer();
  seen.add(s.id); saveSeen(); const u=userById(s.user_id)||{username:'?',id:''};
  $('v-name').textContent=s.user_id===me.id?'You':u.username; badge($('v-name'),u); $('v-time').textContent=stamp(s.created_at);
  const av=$('v-av'); av.innerHTML=''; av.appendChild(avatar(u,'sm')); av.firstChild.querySelector('i')?.remove();
  const body=$('v-body'); body.innerHTML=''; body.style.background=bgOf(s.bg);
  if(s.image_url){ const im=document.createElement('img'); im.src=s.image_url; im.alt='Story photo'; body.appendChild(im); }
  if(s.text){ const p=document.createElement('p'); p.textContent=s.text; if(s.image_url){ p.style.cssText='align-self:end;margin-bottom:70px;background:rgba(0,0,0,.5);padding:8px 14px;border-radius:12px;font-size:18px'; } body.appendChild(p); }
  const bars=$('bars'); bars.innerHTML=''; vq.forEach((_,k)=>{ const i=document.createElement('i'); i.className=k<vi?'full':k===vi?'run':''; bars.appendChild(i); });
  $('v-del').classList.toggle('hidden',s.user_id!==me.id); paintLike();
  vtimer=setTimeout(nextStory,5000);
}
function nextStory(){ vi++; vi>=vq.length?closeViewer():showStory(); }
function paintLike(){
  const s=vq[vi]; if(!s) return;
  const likes=sLikes.filter(l=>l.story_id===s.id), liked=likes.some(l=>l.user_id===me.id), mine=s.user_id===me.id;
  const b=$('v-like'); b.textContent=(liked?'❤️':'🤍')+' '+(mine?(likes.length+(likes.length===1?' like':' likes')):(liked?'Liked':'Like'));
  b.title=mine?likes.map(l=>userById(l.user_id)?.username).filter(Boolean).join(', '):'';
}
$('v-like').onclick=async()=>{
  const s=vq[vi]; if(!s) return;
  const i=sLikes.findIndex(l=>l.story_id===s.id&&l.user_id===me.id);
  if(i>-1){ sLikes.splice(i,1); paintLike(); await sb.from('story_likes').delete().match({story_id:s.id,user_id:me.id}); return; }
  const row={story_id:s.id,user_id:me.id}; sLikes.push(row); paintLike();
  const {error}=await sb.from('story_likes').insert(row);
  if(error){ sLikes.splice(sLikes.indexOf(row),1); paintLike(); toast('Could not like: '+error.message); }
};
$('v-del').onclick=async()=>{
  const s=vq[vi]; if(!s||!confirm('Delete this story?')) return;
  const {error}=await sb.from('stories').delete().eq('id',s.id); if(error) return toast(error.message);
  stories=stories.filter(x=>x.id!==s.id); vq.splice(vi,1); vq.length?(vi=Math.min(vi,vq.length-1),showStory()):closeViewer();
};
$('v-next').onclick=nextStory;
$('v-prev').onclick=()=>{ vi=Math.max(0,vi-1); showStory(); };
$('v-close').onclick=closeViewer;

/* composer: story + note */
const SW=['#0099ff,#0052d4','#ff5f6d,#ffc371','#7f00ff,#e100ff','#11998e,#38ef7d','#232526,#414345','#f7971e,#ffd200'];
SW.forEach(c=>{ const b=document.createElement('button'); b.type='button'; b.style.background=bgOf(c); b.setAttribute('aria-label','Background'); b.onclick=()=>{ sBg=c; paintPrev(); }; $('sw').appendChild(b); });
function paintPrev(){
  const p=$('prev'); p.style.background=sFile?`center/cover url(${URL.createObjectURL(sFile)})`:bgOf(sBg);
  [...$('sw').children].forEach((b,i)=>b.classList.toggle('on',!sFile&&SW[i]===sBg));
}
function tab(t){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  $('p-story').classList.toggle('hidden',t!=='story'); $('p-note').classList.toggle('hidden',t!=='note');
}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.t));
function openCompose(t){
  sFile=null; $('s-text').value=''; $('n-text').value=fresh(notes[me.id])?notes[me.id].body:'';
  $('n-del').classList.toggle('hidden',!fresh(notes[me.id])); tab(t); paintPrev(); $('compose').classList.remove('hidden');
}
const closeCompose=()=>$('compose').classList.add('hidden');
$('c-close').onclick=closeCompose; $('compose').onclick=e=>{ if(e.target===$('compose')) closeCompose(); };
$('s-img').onclick=()=>$('s-file').click();
$('s-file').onchange=e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  if(!f.type.startsWith('image/')) return toast('Choose an image file.');
  if(f.size>5*1024*1024) return toast('Images must be under 5 MB.');
  sFile=f; paintPrev();
};
$('s-post').onclick=async()=>{
  const text=$('s-text').value.trim(), btn=$('s-post');
  if(!text&&!sFile) return toast('Add some text or a photo first.');
  btn.disabled=true; let image_url=null;
  try{
    if(sFile){
      const path=`${me.id}/story-${Date.now()}-${sFile.name.replace(/[^a-z0-9._-]/gi,'_')}`;
      const up=await sb.storage.from('chat-images').upload(path,sFile,{contentType:sFile.type}); if(up.error) throw up.error;
      image_url=sb.storage.from('chat-images').getPublicUrl(path).data.publicUrl;
    }
    const {data,error}=await sb.from('stories').insert({user_id:me.id,text,bg:sBg,image_url}).select().single(); if(error) throw error;
    if(!stories.some(x=>x.id===data.id)) stories.push(data); seen.add(data.id); closeCompose(); renderTray(); toast('Story shared for 24 hours.');
  }catch(err){ toast('Could not share: '+err.message); }
  finally{ btn.disabled=false; }
};
$('n-save').onclick=async()=>{
  const body=$('n-text').value.trim(); if(!body) return toast('Write a short note first.');
  const row={user_id:me.id,body,updated_at:new Date().toISOString()};
  const {error}=await sb.from('notes').upsert(row,{onConflict:'user_id'}); if(error) return toast(error.message);
  notes[me.id]=row; closeCompose(); renderTray();
};
$('n-del').onclick=async()=>{ await sb.from('notes').delete().eq('user_id',me.id); delete notes[me.id]; closeCompose(); renderTray(); };
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeViewer(); closeCompose(); } });


/* ================= profiles & follows ================= */
let follows=[], pfUser=null;
const following=id=>follows.some(f=>f.follower_id===me.id&&f.following_id===id)?1:0;
const followedBy=id=>follows.some(f=>f.follower_id===id&&f.following_id===me.id);
function openProfile(u){ pfUser=u; $('profile').classList.remove('hidden'); paintProfile(true); }
function closeProfile(){ pfUser=null; const p=$('profile'); if(p) p.classList.add('hidden'); }
function paintProfile(fresh){
  if(!pfUser||!me) return;
  const u=pfUser.id===me.id?me:(people.find(p=>p.id===pfUser.id)||pfUser), own=u.id===me.id; pfUser=u;
  const a=$('pf-av'); a.innerHTML=''; a.appendChild(avatar(u));
  $('pf-name').textContent='@'+u.username; badge($('pf-name'),u);
  $('pf-fers').textContent=follows.filter(f=>f.following_id===u.id).length;
  $('pf-fing').textContent=follows.filter(f=>f.follower_id===u.id).length;
  $('pf-rel').textContent=own?'This is how others see you':(followedBy(u.id)?'Follows you':'');
  $('pf-change').classList.toggle('hidden',!own);
  $('pf-bio-in').classList.toggle('hidden',!own); if(own&&fresh) $('pf-bio-in').value=u.bio||'';
  $('pf-bio').classList.toggle('hidden',own); $('pf-bio').textContent=u.bio||'No bio yet.';
  $('pf-msg').classList.toggle('hidden',own);
  const m=$('pf-main'), f=following(u.id);
  m.textContent=own?'Save profile':(f?'Following':'Follow'); m.classList.toggle('alt',!own&&!!f);
}
$('pf-main').onclick=async()=>{
  const u=pfUser; if(!u) return;
  if(u.id===me.id){
    const bio=$('pf-bio-in').value.trim().slice(0,100);
    const {error}=await sb.from('profiles').update({bio}).eq('id',me.id);
    if(error) return toast(error.message); me.bio=bio; toast('Profile saved.'); return;
  }
  const i=follows.findIndex(f=>f.follower_id===me.id&&f.following_id===u.id);
  if(i>-1){
    const [r]=follows.splice(i,1); paintProfile(); renderTray(); renderList();
    const {error}=await sb.from('follows').delete().match({follower_id:me.id,following_id:u.id});
    if(error){ follows.push(r); paintProfile(); renderTray(); renderList(); toast(error.message); }
  }else{
    const row={follower_id:me.id,following_id:u.id}; follows.push(row); paintProfile(); renderTray(); renderList();
    const {error}=await sb.from('follows').insert(row);
    if(error){ follows.splice(follows.indexOf(row),1); paintProfile(); renderTray(); renderList(); toast(error.message); }
  }
};
$('pf-msg').onclick=()=>{ const u=pfUser; closeProfile(); if(u) openChat(u); };
$('pf-change').onclick=()=>$('pf-file').click();
$('pf-file').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  if(!f.type.startsWith('image/')) return toast('Choose an image file.');
  if(f.size>3*1024*1024) return toast('Photos must be under 3 MB.');
  toast('Uploading photo…');
  const ext=(f.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').slice(0,5)||'jpg';
  const path=`${me.id}/avatar-${Date.now()}.${ext}`;
  const up=await sb.storage.from('chat-images').upload(path,f,{contentType:f.type}); if(up.error) return toast('Upload failed: '+up.error.message);
  const url=sb.storage.from('chat-images').getPublicUrl(path).data.publicUrl;
  const {error}=await sb.from('profiles').update({avatar_url:url}).eq('id',me.id); if(error) return toast(error.message);
  me.avatar_url=url; paintProfile(); renderTray(); if(peer) head();
};
$('me-btn').onclick=()=>openProfile(me);
$('h-av').onclick=$('h-name').onclick=()=>{ if(peer) openProfile(peer); else if(room) openRoomInfo(); };
$('pf-close').onclick=closeProfile;
$('profile').onclick=e=>{ if(e.target===$('profile')) closeProfile(); };
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeProfile(); });


/* ================= welcome panel ================= */
function paintWelcome(){
  if(!me) return;
  const done={photo:!!me.avatar_url,story:stories.some(s=>s.user_id===me.id),note:!!fresh(notes[me.id])};
  for(const k in done) $('wc-'+k).classList.toggle('done',done[k]);
}
async function invite(){
  const url=(SITE_URL||location.href).split('#')[0].split('?')[0];
  try{ if(navigator.share&&/Mobi|Android/i.test(navigator.userAgent)){ await navigator.share({title:'aveysocial',text:'Join me on aveysocial',url}); return; } }
  catch(e){ if(e.name==='AbortError') return; }
  try{ await navigator.clipboard.writeText(url); toast('Invite link copied. Send it to your friends.'); }
  catch(e){ prompt('Copy your invite link:',url); }
}
$('wc-photo').onclick=()=>openProfile(me);
$('wc-story').onclick=()=>openCompose('story');
$('wc-note').onclick=()=>openCompose('note');
$('wc-invite').onclick=invite;


/* ================= voice messages ================= */
const fmtDur=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
const audios=new Map(); let playing=null;
function voiceBubble(m){
  const b=document.createElement('div'); b.className='b voice';
  let a=audios.get(m.id); if(!a){ a=new Audio(); a.preload='none'; a.src=m.audio_url; audios.set(m.id,a); }
  const btn=document.createElement('button'); btn.type='button'; btn.className='vp'; btn.setAttribute('aria-label','Play voice message');
  const wave=document.createElement('div'); wave.className='wave'; const bars=[];
  let seed=Number(String(m.id).replace(/\D/g,''))||7;
  for(let i=0;i<26;i++){ seed=(seed*9301+49297)%233280; const s=document.createElement('i'); s.style.height=(6+Math.round(seed/233280*18))+'px'; wave.appendChild(s); bars.push(s); }
  const t=document.createElement('span'); t.className='vt';
  const paint=()=>{
    const f=a.duration?a.currentTime/a.duration:0; bars.forEach((s,i)=>s.classList.toggle('on',i/bars.length<f));
    btn.textContent=a.paused?'▶':'❚❚'; t.textContent=fmtDur(a.currentTime>0?Math.floor(a.currentTime):(m.audio_secs||0));
  };
  a.ontimeupdate=paint; a.onplay=paint; a.onpause=paint; a.onended=()=>{ a.currentTime=0; if(playing===a) playing=null; paint(); };
  btn.onclick=()=>{ if(a.paused){ if(playing&&playing!==a) playing.pause(); playing=a; a.play().catch(()=>toast('Could not play this message.')); } else a.pause(); };
  wave.onclick=e=>{ if(a.duration){ const r=wave.getBoundingClientRect(); a.currentTime=a.duration*(e.clientX-r.left)/r.width; paint(); } };
  paint(); b.append(btn,wave,t); return b;
}
let rec=null, recChunks=[], recStart=0, recTimer=null, recStream=null, recCancel=false;
function tickRec(){ const s=Math.round((Date.now()-recStart)/1000); $('rec-t').textContent=fmtDur(s); if(s>=300&&rec&&rec.state==='recording') rec.stop(); }
function abortRec(){ if(rec&&rec.state==='recording'){ recCancel=true; rec.stop(); } }
async function startRec(){
  if(!peer||rec&&rec.state==='recording') return;
  if(!navigator.mediaDevices||!window.MediaRecorder) return toast('Voice recording is not supported in this browser.');
  try{ recStream=await navigator.mediaDevices.getUserMedia({audio:true}); }catch(e){ return toast('Allow microphone access to record.'); }
  const mt=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t))||'';
  const r=rec=new MediaRecorder(recStream,mt?{mimeType:mt}:{}); recChunks=[]; recCancel=false;
  r.ondataavailable=e=>{ if(e.data.size) recChunks.push(e.data); };
  r.onstop=async()=>{
    clearInterval(recTimer); recStream.getTracks().forEach(t=>t.stop()); $('recbar').classList.add('hidden');
    const secs=Math.round((Date.now()-recStart)/1000), type=(r.mimeType||mt||'audio/webm');
    if(recCancel||secs<1) return;
    const blob=new Blob(recChunks,{type}), path=`${me.id}/voice-${Date.now()}.${type.includes('mp4')?'m4a':'webm'}`;
    toast('Sending voice message…');
    const up=await sb.storage.from('chat-images').upload(path,blob,{contentType:type.split(';')[0]});
    if(up.error) return toast('Upload failed: '+up.error.message);
    await sendMessage('',null,sb.storage.from('chat-images').getPublicUrl(path).data.publicUrl,secs);
  };
  r.start(); recStart=Date.now(); $('recbar').classList.remove('hidden'); tickRec(); recTimer=setInterval(tickRec,500);
}
$('mic').onclick=startRec;
$('rec-x').onclick=()=>{ recCancel=true; if(rec&&rec.state==='recording') rec.stop(); };
$('rec-ok').onclick=()=>{ if(rec&&rec.state==='recording') rec.stop(); };

/* ================= voice & video calls (WebRTC) ================= */
// STUN only. For users behind strict firewalls, add a TURN server here.
const ICE=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
let call=null, ac=null, ringT=null;
const sig=(to,kind,extra={})=>channel&&me&&channel.send({type:'broadcast',event:'call',payload:{to,from:me.id,kind,...extra}});
const getMedia=v=>navigator.mediaDevices.getUserMedia({audio:true,video:v?{facingMode:'user'}:false});
function ring(on){
  clearInterval(ringT); ringT=null; if(!on) return;
  const beep=()=>{ try{ ac=ac||new (window.AudioContext||window.webkitAudioContext)(); const o=ac.createOscillator(), g=ac.createGain();
    o.frequency.value=call&&call.dir==='in'?740:440; g.gain.value=.08; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+.35); }catch(e){} };
  beep(); ringT=setInterval(beep,1600);
}
function makePC(c){
  const pc=c.pc=new RTCPeerConnection({iceServers:ICE}); c.remote=new MediaStream();
  pc.onicecandidate=e=>{ if(e.candidate){ const cand=e.candidate.toJSON(); (c.ice=c.ice||[]).push(cand); sig(c.peer.id,'ice',{cand}); } };
  pc.ontrack=e=>{ e.streams[0].getTracks().forEach(t=>c.remote.addTrack(t)); $('c-remote').srcObject=c.remote; paintCall(); };
  pc.onconnectionstatechange=()=>{
    if(call!==c) return; const s=pc.connectionState;
    if(s==='connected'&&!c.t0){ c.t0=Date.now(); c.state='live'; ring(false); clearTimeout(c.ringTimeout); c.timer=setInterval(paintCall,1000); paintCall(); }
    if(s==='failed'){ toast('Call connection failed. Please try again.'); endCall('end'); }
    if(s==='disconnected') setTimeout(()=>{ if(call===c&&pc.connectionState!=='connected'){ toast('Call ended.'); endCall('end'); } },8000);
  };
}
function paintCall(){
  const c=call; if(!c) return; const v=c.video;
  $('c-name').textContent=c.peer.username;
  const av=$('c-av'); if(av.dataset.id!==c.peer.id){ av.innerHTML=''; av.appendChild(avatar(c.peer)); av.dataset.id=c.peer.id; }
  $('c-state').textContent=c.state==='live'?fmtDur(Math.round((Date.now()-c.t0)/1000)):c.state==='calling'?'Calling…':c.state==='ringing'?'Incoming '+(v?'video':'voice')+' call':'Connecting…';
  const inRing=c.state==='ringing';
  $('c-acc').classList.toggle('hidden',!inRing); $('c-mute').classList.toggle('hidden',inRing); $('c-cam').classList.toggle('hidden',inRing||!v);
  $('call').classList.toggle('vc',!!v&&!inRing); $('call').classList.toggle('video',!!v&&c.remote&&c.remote.getVideoTracks().length>0);
  if($('c-local').srcObject!==c.stream) $('c-local').srcObject=c.stream||null;
}
async function startCall(video){
  if(!peer||call) return;
  const target=peer, r=await notifyPeer(target.id,'call',{video});
  if(!online.has(target.id)&&!(r&&r.sent>0)) return toast(target.username+' is offline right now.');
  if(peer!==target||call) return;
  if(!navigator.mediaDevices||!window.RTCPeerConnection) return toast('Calls are not supported in this browser.');
  let stream; try{ stream=await getMedia(video); }catch(e){ return toast('Allow microphone'+(video?' and camera':'')+' access to call.'); }
  const c=call={peer,dir:'out',video,stream,queue:[],state:'calling'};
  makePC(c); stream.getTracks().forEach(t=>c.pc.addTrack(t,stream)); paintCall(); $('call').classList.remove('hidden'); ring(true);
  const offer=await c.pc.createOffer(); await c.pc.setLocalDescription(offer);
  c.offerMsg={sdp:{type:offer.type,sdp:offer.sdp},video}; sig(peer.id,'offer',c.offerMsg);
  c.ringTimeout=setTimeout(()=>{ if(call===c&&c.state==='calling'){ toast('No answer.'); endCall('end'); } },45000);
}
async function acceptCall(){
  const c=call; if(!c||c.dir!=='in'||c.pc) return;
  clearTimeout(c.ringTimeout); ring(false);
  try{ c.stream=await getMedia(c.video); }catch(e){ toast('Allow microphone'+(c.video?' and camera':'')+' access to answer.'); return endCall('decline'); }
  makePC(c); c.stream.getTracks().forEach(t=>c.pc.addTrack(t,c.stream)); c.state='connecting'; paintCall();
  await c.pc.setRemoteDescription(c.offer);
  for(const k of c.queue) await c.pc.addIceCandidate(k).catch(()=>{}); c.queue=[];
  const ans=await c.pc.createAnswer(); await c.pc.setLocalDescription(ans);
  sig(c.peer.id,'answer',{sdp:{type:ans.type,sdp:ans.sdp}});
}
async function onCall(p){
  if(!p||!me||(p.to!==me.id&&!(p.to==='*'&&p.kind==='sync'&&p.from!==me.id))) return;
  const c=call;
  if(p.kind==='sync'){
    // the other person just opened the app: re-send our ringing call so they can answer it
    if(c&&c.dir==='out'&&c.state==='calling'&&c.peer.id===p.from&&c.offerMsg){ sig(p.from,'offer',c.offerMsg); (c.ice||[]).forEach(cand=>sig(p.from,'ice',{cand})); }
    return;
  }
  if(p.kind==='offer'){
    if(c){ if(c.dir==='in'&&c.peer.id===p.from) return; return sig(p.from,'busy'); }
    const u=people.find(x=>x.id===p.from); if(!u) return;
    const n=call={peer:u,dir:'in',video:!!p.video,offer:p.sdp,queue:[],state:'ringing'};
    paintCall(); $('call').classList.remove('hidden'); ring(true);
    n.ringTimeout=setTimeout(()=>{ if(call===n&&n.state==='ringing') endCall('decline'); },45000);
  }else if(c&&c.peer.id===p.from){
    if(p.kind==='answer'&&c.pc){
      await c.pc.setRemoteDescription(p.sdp); c.state='connecting'; paintCall();
      for(const k of c.queue) await c.pc.addIceCandidate(k).catch(()=>{}); c.queue=[];
    }else if(p.kind==='ice'){
      if(c.pc&&c.pc.remoteDescription) await c.pc.addIceCandidate(p.cand).catch(()=>{}); else c.queue.push(p.cand);
    }else if(p.kind==='end'||p.kind==='decline'||p.kind==='busy'){
      toast(p.kind==='busy'?c.peer.username+' is on another call.':p.kind==='decline'?'Call declined.':(c.state==='ringing'?'Missed call from '+c.peer.username+'.':'Call ended.'));
      endCall();
    }
  }
}
function endCall(notify){
  const c=call; if(!c) return; call=null;
  clearTimeout(c.ringTimeout); clearInterval(c.timer); ring(false);
  if(notify) sig(c.peer.id,notify);
  if(c.pc) c.pc.close(); if(c.stream) c.stream.getTracks().forEach(t=>t.stop());
  $('call').classList.add('hidden'); $('call').classList.remove('video','vc'); $('c-remote').srcObject=null; $('c-local').srcObject=null; $('c-av').dataset.id='';
  $('c-mute').classList.remove('off'); $('c-cam').classList.remove('off');
  if(c.dir==='out'&&me) logCall(c,c.t0?Math.round((Date.now()-c.t0)/1000):0);
}
async function logCall(c,s){
  const kind=c.video?'video':'voice', text=(c.video?'📹 ':'📞 ')+(s?(c.video?'Video':'Voice')+' call · '+fmtDur(s):'Missed '+kind+' call');
  const {data}=await sb.from('messages').insert({sender_id:me.id,recipient_id:c.peer.id,body:text}).select().single();
  if(!data) return; if(peer&&peer.id===c.peer.id){ thread.push(data); renderLog(true); } touch(c.peer.id,data,0);
}
$('h-call').onclick=()=>startCall(false);
$('h-video').onclick=()=>startCall(true);
$('c-acc').onclick=acceptCall;
$('c-end').onclick=()=>{ if(call) endCall(call.state==='ringing'?'decline':'end'); };
$('c-mute').onclick=()=>{ if(!call||!call.stream) return; const t=call.stream.getAudioTracks(); const off=t.some(x=>x.enabled); t.forEach(x=>x.enabled=!off); $('c-mute').classList.toggle('off',off); };
$('c-cam').onclick=()=>{ if(!call||!call.stream) return; const t=call.stream.getVideoTracks(); const off=t.some(x=>x.enabled); t.forEach(x=>x.enabled=!off); $('c-cam').classList.toggle('off',off); };


/* ================= push notifications (calls + messages when the app is closed) ================= */
const VAPID_PUBLIC_KEY=''; // paste your VAPID public key here (see README)
const isNative=()=>!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform());
const SITE_URL=''; // your hosted website address, used for invite links (important inside the Android app)
const pushOK=()=>!isNative()&&!!VAPID_PUBLIC_KEY&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&(location.protocol==='https:'||location.hostname==='localhost');
const b64u=s=>{ const b=atob((s+'='.repeat((4-s.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(b,c=>c.charCodeAt(0)); };
let swReg=null; const lastPing={};
async function initPush(){
  if(!pushOK()) return;
  if(!swReg){
    try{ swReg=await navigator.serviceWorker.register('sw.js'); }catch(e){ return; }
    navigator.serviceWorker.addEventListener('message',e=>{ if(e.data&&e.data.type==='open'){ const u=people.find(p=>p.id===e.data.from); if(u) openChat(u); } });
  }
  if(Notification.permission==='granted') await savePush();
  else if(Notification.permission==='default'&&!localStorage.getItem('avey-push-no')) $('pushbar').classList.remove('hidden');
}
async function savePush(){
  try{
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(VAPID_PUBLIC_KEY)});
    const j=sub.toJSON();
    const {error}=await sb.rpc('save_push_subscription',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth});
    return !error;
  }catch(e){ return false; }
}
async function dropPush(){
  try{ if(!swReg) return; const s=await swReg.pushManager.getSubscription(); if(s) await sb.from('push_subscriptions').delete().eq('endpoint',s.endpoint); }catch(e){}
}
async function notifyPeer(to,kind,extra={}){
  if(!VAPID_PUBLIC_KEY) return null;
  try{ const {data}=await sb.functions.invoke('notify',{body:{to,kind,...extra}}); return data; }catch(e){ return null; }
}
function pingPeer(id){
  if(!VAPID_PUBLIC_KEY||Date.now()-(lastPing[id]||0)<8000) return;
  lastPing[id]=Date.now(); notifyPeer(id,'message');
}
function openFromUrl(){
  const q=new URLSearchParams(location.search), who=q.get('chat')||q.get('call'); if(!who) return;
  const u=people.find(p=>p.id===who); if(u) openChat(u);
  history.replaceState(null,'',location.pathname);
}
$('push-on').onclick=async()=>{
  const perm=await Notification.requestPermission(); $('pushbar').classList.add('hidden');
  if(perm==='granted') toast(await savePush()?'Notifications are on.':'Could not turn on notifications.');
  else toast('Notifications are blocked. Allow them in your browser settings.');
};
$('push-x').onclick=()=>{ $('pushbar').classList.add('hidden'); try{ localStorage.setItem('avey-push-no','1'); }catch(e){} };


/* ================= direct file & photo sharing =================
   Files travel straight from one device to the other over a WebRTC data channel.
   Nothing is uploaded to Supabase: not the file, not its name. Both people must be online. */
const CHUNK=16384, HIGH=4*1024*1024, MAXFILE=100*1024*1024;
const tx={}, xfers=new Map();
const txList=id=>tx[id]||(tx[id]=[]);
const txItems=()=>peer?txList(peer.id).map(x=>({...x,_tx:true,id:'x'+x.tid,sender_id:x.dir==='out'?me.id:peer.id})):[];
const isImg=m=>/^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(m||'');
const fmtSize=n=>n<1024?n+' B':n<1048576?Math.round(n/1024)+' KB':(n/1048576).toFixed(1)+' MB';
const safeName=n=>String(n).replace(/[\\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,120)||'file';
const fsig=(to,kind,tid,extra={})=>channel&&me&&channel.send({type:'broadcast',event:'file',payload:{to,from:me.id,kind,tid,...extra}});
const FINAL=['done','declined','canceled','failed'];

function closeX(x){ x.dead=true; clearTimeout(x.timer); try{ x.dc&&x.dc.close(); }catch(e){} try{ x.pc&&x.pc.close(); }catch(e){} }
function failX(x,msg){ if(FINAL.includes(x.item.state)) return; x.item.state='failed'; x.item.err=msg; closeX(x); toast('File transfer failed: '+msg); renderLog(); }
function prog(x,f){
  x.item.pct=f; const t=Date.now(); if(t-(x.last||0)<120&&f<1) return; x.last=t;
  document.querySelectorAll(`[data-tid="${x.item.tid}"] .bar i`).forEach(e=>e.style.width=Math.round(f*100)+'%');
}
function newPC(x,toId){
  const pc=x.pc=new RTCPeerConnection({iceServers:ICE});
  pc.onicecandidate=e=>{ if(e.candidate) fsig(toId,'ice',x.item.tid,{cand:e.candidate.toJSON()}); };
  pc.onconnectionstatechange=()=>{ if(['failed','closed'].includes(pc.connectionState)&&!FINAL.includes(x.item.state)&&!x.dead) failX(x,'connection lost'); };
  return pc;
}

/* sending */
async function sendFile(file){
  if(!peer||!file) return;
  if(!online.has(peer.id)) return toast(peer.username+' needs to be online to receive files. Files go directly between devices and are never stored.');
  if(file.size>MAXFILE) return toast('Files must be under 100 MB.');
  if(!window.RTCPeerConnection) return toast('File sharing is not supported in this browser.');
  const to=peer, tid=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const item={tid,dir:'out',name:safeName(file.name),size:file.size,mime:file.type||'application/octet-stream',state:'waiting',pct:0,url:isImg(file.type)?URL.createObjectURL(file):null,created_at:new Date().toISOString()};
  txList(to.id).push(item);
  const x={item,file,to}; xfers.set(tid,x); renderLog(true);
  touch(to.id,{id:'x'+tid,sender_id:me.id,recipient_id:to.id,body:(isImg(item.mime)?'Sent a photo':'Sent a file: '+item.name),created_at:item.created_at,read_at:null},0);
  const pc=newPC(x,to.id), dc=x.dc=pc.createDataChannel('file'); x.queue=[];
  dc.binaryType='arraybuffer'; dc.bufferedAmountLowThreshold=1<<20;
  dc.onopen=()=>pump(x);
  dc.onmessage=e=>{
    if(typeof e.data!=='string') return; let j; try{ j=JSON.parse(e.data); }catch(_){ return; }
    if(j.t==='ack'){ item.state='done'; item.pct=1; renderLog(); setTimeout(()=>closeX(x),1500); }
    if(j.t==='nack') failX(x,'the other device did not get the whole file');
  };
  const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
  fsig(to.id,'offer',tid,{sdp:{type:offer.type,sdp:offer.sdp},name:item.name,size:item.size,mime:item.mime});
  item.state='offered'; renderLog();
  x.timer=setTimeout(()=>{ if(item.state==='offered') failX(x,'no response'); },90000);
}
async function pump(x){
  const {dc,file,item}=x; clearTimeout(x.timer); item.state='sending'; renderLog();
  dc.send(JSON.stringify({t:'meta',size:item.size}));
  let off=0;
  while(off<file.size&&!x.dead){
    if(dc.bufferedAmount>HIGH){ await new Promise(r=>dc.addEventListener('bufferedamountlow',r,{once:true})); continue; }
    const buf=await file.slice(off,off+CHUNK).arrayBuffer();
    if(x.dead||dc.readyState!=='open') return;
    dc.send(buf); off+=buf.byteLength; prog(x,off/file.size);
  }
  if(!x.dead&&dc.readyState==='open') dc.send(JSON.stringify({t:'end'}));
}

/* receiving */
async function onFile(p){
  if(!p||!me||p.to!==me.id) return;
  if(p.kind==='offer'){
    const u=people.find(z=>z.id===p.from), size=Number(p.size)||0;
    if(!u||typeof p.name!=='string'||size<=0||size>MAXFILE||xfers.has(p.tid)) return;
    const item={tid:p.tid,dir:'in',name:safeName(p.name),size,mime:String(p.mime||'application/octet-stream'),state:'offered',pct:0,url:null,created_at:new Date().toISOString()};
    txList(u.id).push(item);
    const x={item,from:u,offer:p.sdp,queue:[],chunks:[],got:0}; xfers.set(p.tid,x);
    const open=peer&&peer.id===u.id;
    touch(u.id,{id:'x'+p.tid,sender_id:u.id,recipient_id:me.id,body:(isImg(item.mime)?'Sent a photo':'Sent a file: '+item.name),created_at:item.created_at,read_at:null},open?0:1);
    if(open) renderLog(true); else toast(u.username+' is sending you '+(isImg(item.mime)?'a photo.':'a file.'));
    if(isImg(item.mime)&&size<=10*1024*1024) acceptX(x);
    return;
  }
  const x=xfers.get(p.tid); if(!x||p.from!==(x.to||x.from).id) return;
  if(p.kind==='answer'&&x.pc){
    clearTimeout(x.timer); await x.pc.setRemoteDescription(p.sdp);
    for(const c of x.queue) await x.pc.addIceCandidate(c).catch(()=>{}); x.queue=[];
  }else if(p.kind==='ice'){
    if(x.pc&&x.pc.remoteDescription) await x.pc.addIceCandidate(p.cand).catch(()=>{}); else x.queue.push(p.cand);
  }else if(p.kind==='decline'||p.kind==='cancel'){
    if(FINAL.includes(x.item.state)) return;
    x.item.state=p.kind==='decline'?'declined':'canceled'; closeX(x); renderLog();
  }
}
async function acceptX(x){
  const it=x.item; if(it.state!=='offered') return;
  it.state='receiving'; renderLog();
  try{
    const pc=newPC(x,x.from.id);
    pc.ondatachannel=e=>{ const dc=x.dc=e.channel; dc.binaryType='arraybuffer'; dc.onmessage=m=>onData(x,m.data); };
    await pc.setRemoteDescription(x.offer);
    for(const c of x.queue) await pc.addIceCandidate(c).catch(()=>{}); x.queue=[];
    const ans=await pc.createAnswer(); await pc.setLocalDescription(ans);
    fsig(x.from.id,'answer',it.tid,{sdp:{type:ans.type,sdp:ans.sdp}});
    x.timer=setTimeout(()=>{ if(it.state==='receiving'&&!x.got) failX(x,'could not connect'); },30000);
  }catch(e){ failX(x,'could not connect'); }
}
function onData(x,d){
  const it=x.item; if(x.dead) return;
  if(typeof d==='string'){
    let j; try{ j=JSON.parse(d); }catch(_){ return; }
    if(j.t==='end'){
      if(x.got!==it.size){ try{ x.dc.send(JSON.stringify({t:'nack'})); }catch(e){} return failX(x,'file was incomplete'); }
      it.url=URL.createObjectURL(new Blob(x.chunks,{type:isImg(it.mime)?it.mime:'application/octet-stream'}));
      x.chunks=[]; it.state='done'; it.pct=1; clearTimeout(x.timer);
      try{ x.dc.send(JSON.stringify({t:'ack'})); }catch(e){}
      renderLog(true); setTimeout(()=>closeX(x),2000);
    }
    return;
  }
  clearTimeout(x.timer); x.chunks.push(d); x.got+=d.byteLength;
  if(x.got>it.size) return failX(x,'unexpected data');
  prog(x,x.got/it.size);
}
function declineX(x){ if(!x||x.item.state!=='offered') return; fsig(x.from.id,'decline',x.item.tid); x.item.state='declined'; closeX(x); renderLog(); }
function cancelX(x){ if(!x||FINAL.includes(x.item.state)) return; fsig((x.to||x.from).id,'cancel',x.item.tid); x.item.state='canceled'; closeX(x); renderLog(); }

/* the file bubble */
function fileBubble(m){
  const x=xfers.get(m.tid), b=document.createElement('div'); b.dataset.tid=m.tid;
  const status={waiting:'Connecting…',offered:m.dir==='out'?'Waiting for them to accept…':'Wants to send you this file',sending:'Sending…',receiving:'Receiving…',done:m.dir==='out'?'Sent directly':'Received',declined:'Declined',canceled:'Canceled',failed:m.err||'Failed'}[m.state];
  const bar=()=>{ const r=document.createElement('div'); r.className='bar'; const i=document.createElement('i'); i.style.width=Math.round((m.pct||0)*100)+'%'; r.appendChild(i); return r; };
  const btn=(t,fn,alt)=>{ const e=document.createElement('button'); e.type='button'; e.textContent=t; if(alt) e.className='alt'; e.onclick=fn; return e; };
  if(isImg(m.mime)&&m.url){
    b.className='b img'; const im=document.createElement('img'); im.src=m.url; im.alt=m.name;
    im.onclick=()=>{ $('lightbox').querySelector('img').src=m.url; $('lightbox').classList.remove('hidden'); }; b.appendChild(im);
    if(['sending','receiving'].includes(m.state)) b.appendChild(bar());
    if(['failed','canceled','declined'].includes(m.state)){ const s=document.createElement('small'); s.textContent=status; b.appendChild(s); }
    return b;
  }
  b.className='b file';
  const ic=document.createElement('div'); ic.className='fic';
  ic.innerHTML='<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  const meta=document.createElement('div'); meta.className='fmeta';
  const nm=document.createElement('b'); nm.textContent=m.name; nm.title=m.name;
  const sm=document.createElement('small'); sm.textContent=fmtSize(m.size)+' · '+status;
  meta.append(nm,sm);
  if(['sending','receiving'].includes(m.state)) meta.appendChild(bar());
  const bt=document.createElement('div'); bt.className='fbtns';
  const incomingOffer=m.state==='offered'&&m.dir==='in';
  if(incomingOffer) bt.append(btn('Accept',()=>acceptX(x)),btn('Decline',()=>declineX(x),true));
  else if(!FINAL.includes(m.state)) bt.append(btn('Cancel',()=>cancelX(x),true));
  if(m.state==='done'&&m.dir==='in'&&m.url) bt.append(btn('Save',()=>saveFile(m)));
  if(bt.children.length) meta.appendChild(bt);
  b.append(ic,meta); return b;
}

/* drag & drop and paste */
$('chat').addEventListener('dragover',e=>e.preventDefault());
$('chat').addEventListener('drop',e=>{ e.preventDefault(); [...(e.dataTransfer.files||[])].forEach(sendFile); });
$('text').addEventListener('paste',e=>{ const fs=[...((e.clipboardData&&e.clipboardData.files)||[])]; if(fs.length){ e.preventDefault(); fs.forEach(sendFile); } });


/* saving a received file: browsers download it, the Android app opens the share/save sheet */
async function saveFile(m){
  const P=isNative()&&Capacitor.Plugins;
  if(P&&P.Filesystem&&P.Share){
    try{
      const blob=await (await fetch(m.url)).blob();
      const data=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(blob); });
      const f=await P.Filesystem.writeFile({path:m.name,data,directory:'CACHE'});
      await P.Share.share({title:m.name,url:f.uri,dialogTitle:'Save or open file'});
    }catch(e){ if(!/cancel/i.test(String(e&&e.message))) toast('Could not save the file.'); }
    return;
  }
  const a=document.createElement('a'); a.href=m.url; a.download=m.name; a.click();
}


/* ================= message actions: reply, copy, edit, delete ================= */
let replyTo=null, editing=null;
function showBar(t,x){ $('rb-t').textContent=t; $('rb-s').textContent=x; $('replybar').classList.remove('hidden'); $('text').focus(); }
function clearBar(){ replyTo=editing=null; $('replybar').classList.add('hidden'); }
const setReply=m=>{ editing=null; replyTo=m; showBar('Replying to '+(m.sender_id===me.id?'yourself':(userById(m.sender_id)||peer||room).username),m.body||(m.audio_url?'Voice message':'Photo')); };
function startEdit(m){ replyTo=null; editing=m; $('text').value=m.body; autosize(); syncSendIcon(); showBar('Edit message',m.body); }
$('rb-x').onclick=()=>{ if(editing){ $('text').value=''; autosize(); syncSendIcon(); } clearBar(); };
async function delMsg(m){
  if(!confirm('Delete this message for everyone?')) return;
  const {error}=await sb.from(m._room?'room_messages':'messages').delete().eq('id',m.id); if(error) return toast(error.message);
  thread=thread.filter(x=>x.id!==m.id); const l=thread[thread.length-1]; const cv=m._room?rconvos:convos, ck=m._room?room.id:peer.id; if(l&&cv[ck]) cv[ck].last=l; else delete cv[ck];
  renderLog(); renderList();
}
const closeMenu=()=>{ const o=$('mm'); if(o) o.remove(); };
function openMenu(e,m,mine){
  closeMenu(); const liked=mLikes.some(l=>l.message_id===m.id&&l.user_id===me.id);
  const it=[['↩  Reply',()=>setReply(m)]];
  if(m.body) it.push(['⧉  Copy',()=>navigator.clipboard&&navigator.clipboard.writeText(m.body).then(()=>toast('Copied'))]);
  if(!m._room) it.push([liked?'🤍  Remove like':'❤️  Like',()=>toggleMsgLike(m)]);
  if(mine&&!m._room&&m.body&&!m.audio_url&&!m.image_url) it.push(['✎  Edit',()=>startEdit(m)]);
  if(mine) it.push(['🗑  Delete',()=>delMsg(m),1]);
  const mm=document.createElement('div'); mm.id='mm'; mm.className='mm';
  it.forEach(([t,fn,dg])=>{ const b=document.createElement('button'); b.type='button'; b.textContent=t; if(dg) b.className='dg'; b.onclick=fn; mm.appendChild(b); });
  mm.style.left=Math.max(8,Math.min(e.clientX,innerWidth-196))+'px'; mm.style.top=Math.max(8,Math.min(e.clientY,innerHeight-it.length*40-20))+'px';
  document.body.appendChild(mm); const t0=Date.now(); setTimeout(()=>document.addEventListener('click',function f(){ if(Date.now()-t0<400) return; closeMenu(); document.removeEventListener('click',f); }),0);
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeMenu(); });

/* ================= settings ================= */
let bac=null;
function blip(){ try{ bac=bac||new (window.AudioContext||window.webkitAudioContext)(); const o=bac.createOscillator(), g=bac.createGain(), t=bac.currentTime;
  o.frequency.value=880; g.gain.setValueAtTime(.001,t); g.gain.exponentialRampToValueAtTime(.12,t+.02); g.gain.exponentialRampToValueAtTime(.001,t+.25); o.connect(g); g.connect(bac.destination); o.start(); o.stop(t+.26); }catch(e){} }
function setPref(k,v){ P[k]=v; savePrefs(); applyPrefs(); if(k==='active'&&channel){ v?channel.track({u:me.username}):channel.untrack(); } }
const SET=[
  ['Appearance',[
    ['sel','theme','Theme',[['system','System'],['light','Light'],['dark','Dark']]],
    ['sw','accent','Chat color',['','#0084ff','#00a884','#7c4dff','#e91e63','#ff6d00']],
    ['sel','wall','Chat wallpaper',[['none','Plain'],['dots','Dots'],['warm','Warm'],['night','Night']]],
    ['sel','size','Text size',[['14','Small'],['15','Medium'],['17','Large']]]]],
  ['Chats',[
    ['tog','enter','Enter key sends','Shift + Enter adds a new line'],
    ['tog','sound','Message sounds','Play a sound for new messages']]],
  ['Privacy',[
    ['tog','active','Show when I am online','Others can see “Active now”'],
    ['tog','typing','Share typing status','Others can see when you are typing']]]
];
function openSettings(){
  const old=$('settings'); if(old) old.remove();
  const s=document.createElement('div'); s.id='settings'; s.className='modal'; const sh=document.createElement('div'); sh.className='sheet set'; s.appendChild(sh);
  const hd=document.createElement('div'); hd.className='sh'; hd.innerHTML='<b>Settings</b>'; const x=document.createElement('button'); x.type='button'; x.className='ibtn'; x.textContent='✕'; x.setAttribute('aria-label','Close'); x.onclick=()=>s.remove(); hd.appendChild(x); sh.appendChild(hd);
  const pc=document.createElement('button'); pc.type='button'; pc.className='spc'; pc.appendChild(avatar(me));
  const pt=document.createElement('div'), pn=document.createElement('b'), pe=document.createElement('small'); pn.textContent='@'+me.username; badge(pn,me); pe.textContent=meEmail||'Edit photo and bio'; pt.append(pn,pe); pc.appendChild(pt); pc.onclick=()=>{ s.remove(); openProfile(me); }; sh.appendChild(pc);
  SET.forEach(([title,rows])=>{
    const h=document.createElement('h4'); h.textContent=title; sh.appendChild(h);
    rows.forEach(([type,key,label,opts])=>{
      const r=document.createElement('div'); r.className='srow'+(type==='tog'?'':' col'); const l=document.createElement('div'), a=document.createElement('span'); a.textContent=label; l.appendChild(a);
      if(type==='tog'){ const d=document.createElement('small'); d.textContent=opts; l.appendChild(d); }
      r.appendChild(l);
      if(type==='tog'){ const t=document.createElement('input'); t.type='checkbox'; t.className='tg'; t.checked=P[key]!==false&&!!P[key]; t.setAttribute('aria-label',label); t.onchange=()=>setPref(key,t.checked); r.appendChild(t); }
      else{
        const g=document.createElement('div'); g.className=type==='sw'?'swt':'seg';
        (type==='sw'?opts.map(c=>[c,c]):opts).forEach(([v,t])=>{
          const b=document.createElement('button'); b.type='button';
          if(type==='sw'){ b.style.background=v||'linear-gradient(135deg,#0695ff,#a334fa)'; b.setAttribute('aria-label','Color '+(v||'default')); } else b.textContent=t;
          b.classList.toggle('on',String(P[key])===v);
          b.onclick=()=>{ setPref(key,v); [...g.children].forEach(c=>c.classList.remove('on')); b.classList.add('on'); };
          g.appendChild(b);
        });
        r.appendChild(g);
      }
      sh.appendChild(r);
    });
  });
  const h=document.createElement('h4'); h.textContent='Account'; sh.appendChild(h);
  const act=(t,fn,cls)=>{ const b=document.createElement('button'); b.type='button'; b.className='sact '+(cls||''); b.textContent=t; b.onclick=fn; sh.appendChild(b); };
  if(pushOK()) act(Notification.permission==='granted'?'Notifications are on ✓':'Turn on notifications',()=>$('push-on').onclick());
  act('Change password',async()=>{ const pw=prompt('New password (6+ characters):'); if(!pw) return; if(pw.length<6) return toast('Password must be at least 6 characters.'); const {error}=await sb.auth.updateUser({password:pw}); toast(error?error.message:'Password updated.'); });
  act('Sign out',()=>{ s.remove(); $('out').click(); },'dg');
  s.onclick=e=>{ if(e.target===s) s.remove(); }; document.body.appendChild(s);
}
$('set-btn').onclick=openSettings;
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ const o=$('settings'); if(o) o.remove(); } });


/* ================= groups, channels, contacts ================= */
let rooms=[], rconvos={}, room=null, contacts=[], tabSel='chats', discover=[], rT=null;
function addMore(row,m,mine){
  const mb=document.createElement('button'); mb.type='button'; mb.className='lk'; mb.textContent='⋯'; mb.setAttribute('aria-label','Message options'); mb.onclick=e=>openMenu(e,m,mine); mine?row.prepend(mb):row.appendChild(mb);
  row.oncontextmenu=e=>{ e.preventDefault(); openMenu(e,m,mine); }; lp(row,m,mine);
}
function chatUI(){
  const inRoom=!!room, canPost=!inRoom||room.kind==='group'||['owner','admin'].includes(room.role);
  ['attach','mic','h-call','h-video'].forEach(i=>$(i).classList.toggle('hidden',inRoom));
  $('send').classList.toggle('hidden',!canPost); $('ro').classList.toggle('hidden',canPost);
}
function roomHead(){
  $('h-name').textContent=room.name; $('h-status').textContent=(room.kind==='channel'?'Channel':'Group')+' · tap for info';
  const h=$('h-av'); h.innerHTML=''; h.appendChild(avatar(room,'sm'));
}
async function loadRooms(){
  if(!me) return;
  const {data:mem,error}=await sb.from('room_members').select('room_id,role,last_read_at,rooms(*)').eq('user_id',me.id);
  if(error) return;
  rooms=(mem||[]).filter(x=>x.rooms).map(x=>({...x.rooms,username:x.rooms.name,role:x.role,last_read_at:x.last_read_at}));
  rconvos={};
  if(rooms.length){
    const {data:ms}=await sb.from('room_messages').select('*').in('room_id',rooms.map(r=>r.id)).order('created_at',{ascending:false}).limit(600);
    for(const m of (ms||[])){ const r=rooms.find(x=>x.id===m.room_id), c=rconvos[m.room_id]||(rconvos[m.room_id]={last:m,unread:0});
      if(m.sender_id!==me.id&&new Date(m.created_at)>new Date(r.last_read_at)&&!(room&&room.id===r.id)) c.unread++; }
  }
  if(room){ const r=rooms.find(x=>x.id===room.id); if(r){ room=r; chatUI(); head(); } }
  renderList();
}
async function loadContacts(){ const {data}=await sb.from('contacts').select('contact_id'); contacts=(data||[]).map(x=>x.contact_id); if(tabSel==='contacts') renderList(); }
async function loadDiscover(){
  const {data}=await sb.from('rooms').select('*').eq('kind','channel').order('created_at',{ascending:false}).limit(50);
  discover=(data||[]).filter(r=>!rooms.some(x=>x.id===r.id)).map(r=>({...r,username:r.name})); if(tabSel==='channels') renderList();
}
async function toggleContact(p){
  const has=contacts.includes(p.id); contacts=has?contacts.filter(x=>x!==p.id):[...contacts,p.id]; renderList();
  const {error}=has?await sb.from('contacts').delete().match({owner_id:me.id,contact_id:p.id}):await sb.from('contacts').insert({owner_id:me.id,contact_id:p.id});
  if(error){ loadContacts(); toast(error.message); } else toast(has?'Removed from contacts.':p.username+' added to contacts.');
}
async function joinRoom(r){
  const {error}=await sb.rpc('join_room',{p_room:r.id}); if(error) return toast(error.message);
  await loadRooms(); discover=discover.filter(x=>x.id!==r.id); const j=rooms.find(x=>x.id===r.id); if(j) openRoom(j);
}
function roomRow(r,joined){
  const c=rconvos[r.id], b=document.createElement('button'); b.className='row'+(c&&c.unread?' unread':''); b.setAttribute('aria-current',room&&room.id===r.id?'true':'false');
  const mid=document.createElement('div'); mid.className='mid', nm=document.createElement('div'), pv=document.createElement('div'), sp=document.createElement('span');
  nm.className='nm'; nm.textContent=(r.kind==='channel'?'📢 ':'')+r.name; pv.className='pv';
  sp.textContent=c?((c.last.sender_id===me.id?'You':((userById(c.last.sender_id)||{}).username||'Member'))+': '+c.last.body):(r.description||(r.kind==='channel'?'Channel':'Group')); pv.appendChild(sp); mid.append(nm,pv);
  b.append(avatar(r),mid);
  if(c){ const end=document.createElement('div'); end.className='end'; const t=document.createElement('span'); t.textContent=stamp(c.last.created_at); end.appendChild(t);
    if(c.unread){ const g=document.createElement('span'); g.className='badge'; g.textContent=c.unread>99?'99+':c.unread; end.appendChild(g); } b.appendChild(end); }
  b.onclick=()=>joined?openRoom(r):joinRoom(r); return b;
}
function renderTab(){
  const box=$('list'); box.innerHTML=''; const q=$('q').value.trim().toLowerCase();
  const sec=t=>{ const h=document.createElement('div'); h.className='sec'; h.textContent=t; box.appendChild(h); };
  const act=(t,fn)=>{ const b=document.createElement('button'); b.type='button'; b.className='newb'; b.textContent=t; b.onclick=fn; box.appendChild(b); };
  const empty=t=>{ const e=document.createElement('div'); e.className='empty'; e.textContent=t; box.appendChild(e); };
  const wrap=(row,label,on,fn)=>{ const w=document.createElement('div'); w.className='crow'; const b=document.createElement('button'); b.type='button'; b.className='cbtn'+(on?' on':''); b.textContent=label; b.onclick=fn; w.append(row,b); box.appendChild(w); };
  const t=r=>new Date((rconvos[r.id]?rconvos[r.id].last:r).created_at);
  const mineRooms=k=>rooms.filter(r=>r.kind===k&&r.name.toLowerCase().includes(q)).sort((a,b)=>t(b)-t(a));
  if(tabSel==='contacts'){
    const mine=people.filter(p=>contacts.includes(p.id)&&p.username.includes(q)), rest=people.filter(p=>!contacts.includes(p.id)&&p.username.includes(q));
    sec('My contacts ('+mine.length+')'); mine.length?mine.forEach(p=>wrap(rowFor(p,null),'Remove',true,()=>toggleContact(p))):empty('No contacts yet. Add people below.');
    if(rest.length){ sec('People on aveysocial'); rest.forEach(p=>wrap(rowFor(p,null),'Add',false,()=>toggleContact(p))); }
  }else{
    const k=tabSel==='groups'?'group':'channel', list=mineRooms(k);
    act('＋ New '+k,()=>openNewRoom(k));
    list.forEach(r=>box.appendChild(roomRow(r,true)));
    if(!list.length&&k==='group') empty('No groups yet. Create one and add your friends.');
    if(k==='channel'){ const d=discover.filter(r=>r.name.toLowerCase().includes(q)); if(d.length){ sec('Discover channels'); d.forEach(r=>wrap(roomRow(r,false),'Join',false,()=>joinRoom(r))); } else if(!list.length) empty('No channels yet. Create the first one.'); }
  }
}
function syncTabs(){ document.querySelectorAll('#ptabs button').forEach(b=>b.classList.toggle('on',b.dataset.p===tabSel)); $('tray').classList.toggle('hidden',tabSel!=='chats'); renderList(); }
document.querySelectorAll('#ptabs button').forEach(b=>b.onclick=()=>{ tabSel=b.dataset.p; if(tabSel==='channels') loadDiscover(); syncTabs(); });

async function openRoom(r){
  abortRec(); clearBar(); peer=null; room=r; thread=[]; typingUntil=0;
  $('placeholder').classList.add('hidden'); $('chat').style.display='flex'; $('app').classList.add('chatting'); chatUI(); head(); renderLog(); renderList();
  const {data,error}=await sb.from('room_messages').select('*').eq('room_id',r.id).order('created_at',{ascending:false}).limit(300);
  if(!room||room.id!==r.id) return; if(error){ toast('Could not load messages.'); return; }
  thread=data.reverse().map(m=>({...m,_room:true})); renderLog(true); roomRead();
}
function roomRead(){ if(!room) return; const c=rconvos[room.id]; if(c) c.unread=0; sb.rpc('mark_room_read',{p_room:room.id}); renderList(); }
async function sendRoom(body){
  const rt=replyTo?replyTo.id:null; clearBar(); const r=room;
  const tmp={id:'t'+Date.now(),_room:true,room_id:r.id,sender_id:me.id,body,reply_to:rt,created_at:new Date().toISOString(),pending:true};
  thread.push(tmp); renderLog(true);
  const {data,error}=await sb.from('room_messages').insert({room_id:r.id,sender_id:me.id,body,reply_to:rt}).select().single();
  const i=thread.indexOf(tmp);
  if(error){ if(i>-1) thread.splice(i,1); renderLog(); toast('Message not sent: '+error.message); return false; }
  const m={...data,_room:true}; if(i>-1) thread[i]=m; rconvos[r.id]={last:m,unread:0}; renderLog(); renderList(); return true;
}
function roomIncoming(m){
  const r=rooms.find(x=>x.id===m.room_id); if(!r){ loadRooms(); return; }
  const mine=m.sender_id===me.id, open=room&&room.id===m.room_id;
  if(open&&!mine&&!thread.some(x=>x.id===m.id)){ thread.push({...m,_room:true}); renderLog(); }
  const c=rconvos[m.room_id]||(rconvos[m.room_id]={last:m,unread:0}); c.last=m;
  if(!mine){ if(open&&!document.hidden) roomRead(); else { c.unread++; if(P.sound!==false) blip(); } }
  renderList();
}
function picker(list,picked){
  const pl=document.createElement('div'); pl.className='pick';
  list.forEach(p=>{ const l=document.createElement('label'); l.className='pk', c=document.createElement('input'), n=document.createElement('span'); c.type='checkbox'; c.onchange=()=>c.checked?picked.add(p.id):picked.delete(p.id); n.textContent=p.username; l.append(avatar(p,'sm'),n,c); pl.appendChild(l); });
  return pl;
}
function shell(id,title){
  const o=$(id); if(o) o.remove();
  const s=document.createElement('div'); s.id=id; s.className='modal'; const sh=document.createElement('div'); sh.className='sheet set'; s.appendChild(sh);
  const hd=document.createElement('div'); hd.className='sh'; const b=document.createElement('b'); b.textContent=title; const x=document.createElement('button'); x.type='button'; x.className='ibtn'; x.textContent='✕'; x.setAttribute('aria-label','Close'); x.onclick=()=>s.remove(); hd.append(b,x); sh.appendChild(hd);
  s.onclick=e=>{ if(e.target===s) s.remove(); }; document.body.appendChild(s); return [s,sh];
}
function openNewRoom(kind){
  const [s,sh]=shell('newroom',kind==='group'?'New group':'New channel'), picked=new Set();
  const f=document.createElement('div'); f.className='nrf'; f.innerHTML='<input class="field" id="nr-name" maxlength="40" placeholder="Name"><textarea class="field" id="nr-desc" rows="2" maxlength="120" placeholder="Description (optional)"></textarea>'; sh.appendChild(f);
  if(kind==='group'){ const h=document.createElement('h4'); h.textContent='Add members'; sh.appendChild(h); sh.appendChild(picker(people.slice().sort((a,b)=>contacts.includes(b.id)-contacts.includes(a.id)),picked)); }
  const go=document.createElement('button'); go.type='button'; go.className='btn'; go.style.cssText='margin:14px 18px 0;width:calc(100% - 36px)'; go.textContent='Create'; sh.appendChild(go);
  go.onclick=async()=>{
    const name=$('nr-name').value.trim(); if(name.length<2) return toast('Enter a name (2+ characters).'); go.disabled=true;
    const {data,error}=await sb.rpc('create_room',{p_kind:kind,p_name:name,p_desc:$('nr-desc').value.trim(),p_members:[...picked]}); go.disabled=false; if(error) return toast(error.message);
    s.remove(); await loadRooms(); const r=rooms.find(x=>x.id===data); if(r){ tabSel=kind==='group'?'groups':'channels'; syncTabs(); openRoom(r); }
  };
}
async function openRoomInfo(){
  const r=room; if(!r) return; const [s,sh]=shell('roominfo',r.name);
  const d=document.createElement('p'); d.style.cssText='margin:0 18px;color:var(--muted)'; d.textContent=(r.kind==='channel'?'Channel':'Group')+(r.description?' · '+r.description:''); sh.appendChild(d);
  const {data}=await sb.from('room_members').select('user_id,role').eq('room_id',r.id); const mem=data||[], owner=r.role==='owner', admin=owner||r.role==='admin';
  const h=document.createElement('h4'); h.textContent=mem.length+' member'+(mem.length===1?'':'s'); sh.appendChild(h);
  mem.forEach(m=>{
    const u=userById(m.user_id)||{username:'Unknown',id:m.user_id}, w=document.createElement('div'), n=document.createElement('span'); w.className='mrow'; n.textContent=u.username+(m.user_id===me.id?' (you)':''); badge(n,u); w.append(avatar(u,'sm'),n);
    if(m.role!=='member'){ const b=document.createElement('small'); b.textContent=m.role; w.appendChild(b); }
    if(owner&&m.role!=='owner'){ const b=document.createElement('button'); b.type='button'; b.className='cbtn on'; b.textContent=m.role==='admin'?'Remove admin':'Make admin';
      b.onclick=async()=>{ const {error}=await sb.rpc('set_role',{p_room:r.id,p_user:m.user_id,p_role:m.role==='admin'?'member':'admin'}); if(error) return toast(error.message); openRoomInfo(); }; w.appendChild(b); }
    sh.appendChild(w);
  });
  const ids=new Set(mem.map(m=>m.user_id)), rest=people.filter(p=>!ids.has(p.id));
  if(admin&&rest.length){
    const h2=document.createElement('h4'); h2.textContent='Add members'; sh.appendChild(h2); const picked=new Set(); sh.appendChild(picker(rest,picked));
    const add=document.createElement('button'); add.type='button'; add.className='sact'; add.textContent='Add selected';
    add.onclick=async()=>{ if(!picked.size) return; const {error}=await sb.rpc('add_members',{p_room:r.id,p_members:[...picked]}); if(error) return toast(error.message); toast('Members added.'); openRoomInfo(); }; sh.appendChild(add);
  }
  const lv=document.createElement('button'); lv.type='button'; lv.className='sact dg'; lv.textContent='Leave '+r.kind;
  lv.onclick=async()=>{ if(!confirm('Leave '+r.name+'?')) return; const {error}=await sb.rpc('leave_room',{p_room:r.id}); if(error) return toast(error.message); s.remove(); $('back').onclick(); loadRooms(); }; sh.appendChild(lv);
}


/* ================= verified badge ================= */
const VB='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1d9bf0"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function badge(el,u){ if(u&&u.verified){ const b=document.createElement('span'); b.className='vb'; b.title='Verified'; b.innerHTML=VB; el.appendChild(b); } return el; }


/* ================= mobile ================= */
function lp(row,m,mine){
  let t=null,x=0,y=0; const clr=()=>{ clearTimeout(t); t=null; };
  row.addEventListener('touchstart',e=>{ const p=e.touches[0]; x=p.clientX; y=p.clientY; t=setTimeout(()=>{ t=null; if(navigator.vibrate) navigator.vibrate(10); openMenu({clientX:x,clientY:y},m,mine); },450); },{passive:true});
  row.addEventListener('touchmove',e=>{ const p=e.touches[0]; if(Math.abs(p.clientX-x)>8||Math.abs(p.clientY-y)>8) clr(); },{passive:true});
  row.addEventListener('touchend',clr); row.addEventListener('touchcancel',clr);
}
$('log').addEventListener('scroll',()=>{ const l=$('log'); stuck=l.scrollHeight-l.scrollTop-l.clientHeight<140; },{passive:true});
// keyboard-safe height (iOS Safari does not shrink the page when the keyboard opens)
if(window.visualViewport){
  const f=()=>{ document.documentElement.style.setProperty('--vh',visualViewport.height+'px'); window.scrollTo(0,0); if(stuck) $('log').scrollTop=$('log').scrollHeight; };
  visualViewport.addEventListener('resize',f); visualViewport.addEventListener('scroll',f); f();
}
$('text').addEventListener('focus',()=>setTimeout(()=>{ $('log').scrollTop=$('log').scrollHeight; },300));
// phone back button / swipe-back closes the chat instead of leaving the app
const goBack=$('back').onclick;
$('back').onclick=()=>{ history.state&&history.state.chat?history.back():goBack(); };
addEventListener('popstate',()=>{ if($('app').classList.contains('chatting')) goBack(); });
const _cu=chatUI; chatUI=function(){ _cu(); if(!(history.state&&history.state.chat)) history.pushState({chat:1},''); };
