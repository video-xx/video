/* Aevy social layer: follow / following, direct messages, online status.
   Tables, policies and functions: supabase/schema.sql (section "Social"). */
(function(){
'use strict';
var A=window.AevyAuth,C=window.AevyCore,SB=window.AevySB&&window.AevySB.client;
if(!A||!C||!SB)return;
var esc=C.esc,$=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function me(){return A.current()}
function badge(u){return window.AevyBadge?AevyBadge.html(u):''}
function av(u,n){return window.AevyEco?AevyEco.avatar(u,n):''}
function fail(e){var m=(e&&e.message)||'';if(/row-level security/i.test(m)&&me()&&me().guest)m='Guests can only message other guests. Create an account for more.';C.toast(m||'Something went wrong');console.error(e)}
var HIDE_KEY='aevy.hideStatus';
function hidden(){try{return localStorage.getItem(HIDE_KEY)==='1'}catch(e){return false}}

/* ================= online / offline ================= */
var seen={};   /* user id -> last seen (ms); missing = hidden or never seen */
function isOnline(id){return !!seen[id]&&Date.now()-seen[id]<150000}
function ago(t){
  var d=Math.max(0,(Date.now()-t)/1000);
  if(d<150)return 'Online';
  if(d<3600)return 'Last seen '+Math.round(d/60)+' min ago';
  if(d<86400)return 'Last seen '+Math.round(d/3600)+' h ago';
  if(d<86400*7)return 'Last seen '+Math.round(d/86400)+' d ago';
  return 'Last seen '+C.fmtDate(t);
}
function presRows(rows){(rows||[]).forEach(function(r){if(r.last_seen)seen[r.user_id]=Date.parse(r.last_seen);else delete seen[r.user_id]})}
function beat(){
  if(!me()||document.hidden)return Promise.resolve();
  return SB.rpc('touch_presence',{hide:hidden()}).then(function(r){if(!r.error&&!hidden())seen[me().id]=Date.now()},function(){});
}
function pollOnline(ids){
  var args=ids&&ids.length?{ids:ids}:{};
  return SB.rpc('get_presence',args).then(function(r){if(!r.error){presRows(r.data);paint();window.dispatchEvent(new Event('aevy:presence'))}},function(){});
}
function paint(){
  $$('.avatar[data-uid]').forEach(function(a){a.classList.toggle('on',isOnline(a.dataset.uid))});
  $$('.pres[data-uid]').forEach(function(p){
    var t=seen[p.dataset.uid];p.textContent=t?ago(t):'';p.classList.toggle('on',isOnline(p.dataset.uid));
  });
}
setInterval(function(){beat().then(function(){return pollOnline()})},45000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)beat().then(function(){return pollOnline()})});

/* ================= follows ================= */
var following={};   /* ids I follow */
function loadFollowing(){
  following={};
  if(!me())return Promise.resolve();
  return SB.from('follows').select('following').eq('follower',me().id).limit(5000).then(function(r){
    if(!r.error)(r.data||[]).forEach(function(x){following[x.following]=1});
  },function(){});
}
function counts(id){
  var q=function(col){return SB.from('follows').select('*',{count:'exact',head:true}).eq(col,id).then(function(r){return r.count||0},function(){return 0})};
  return Promise.all([q('following'),q('follower')]);
}
function followBtn(id){
  var on=!!following[id];
  return '<button type="button" class="fbtn'+(on?' on':'')+'" data-follow="'+esc(id)+'" aria-pressed="'+on+'"><span class="f-a">'+(on?'Following':'Follow')+'</span>'+(on?'<span class="f-b">Unfollow</span>':'')+'</button>';
}
function toggleFollow(id,btn){
  if(!me()){location.hash='#/auth';return}
  btn.disabled=true;
  var was=!!following[id],q=was?SB.from('follows').delete().eq('follower',me().id).eq('following',id):SB.from('follows').insert({follower:me().id,following:id});
  q.then(function(r){
    btn.disabled=false;
    if(r.error){fail(r.error);return}
    if(was)delete following[id];else following[id]=1;
    btn.outerHTML=followBtn(id);window.dispatchEvent(new Event('aevy:following'));
    var box=$('.pf-main[data-uid="'+id+'"]');if(box)refreshCounts(box);
  },function(e){btn.disabled=false;fail(e)});
}
function compact(n){n=n||0;if(n>=1e6)return (n/1e6).toFixed(n>=1e7?0:1).replace(/\.0$/,'')+'M';if(n>=1e4)return (n/1e3).toFixed(n>=1e5?0:1).replace(/\.0$/,'')+'K';return n.toLocaleString()}
function refreshCounts(box){
  var id=box.dataset.uid;
  counts(id).then(function(c){
    var f=$('[data-cnt="followers"] b',box),g=$('[data-cnt="following"] b',box);
    if(f){f.textContent=compact(c[0]);f.title=c[0].toLocaleString();var fl=f.parentNode.querySelector('span');if(fl)fl.textContent=c[0]===1?'follower':'followers'}if(g){g.textContent=compact(c[1]);g.title=c[1].toLocaleString()}
  });
}
function listPeople(box,kind){
  var id=box.dataset.uid,panel=$('.pf-people',box);
  if(panel&&panel.dataset.kind===kind){panel.remove();return}
  if(panel)panel.remove();
  panel=document.createElement('div');panel.className='pf-people';panel.dataset.kind=kind;panel.textContent='Loading...';
  $('.pf-stats',box).insertAdjacentElement('afterend',panel);
  var col=kind==='followers'?'follower':'following',other=kind==='followers'?'following':'follower';
  SB.from('follows').select(col).eq(other,id).order('created',{ascending:false}).limit(200).then(function(r){
    if(r.error){panel.textContent='Could not load the list';return}
    var us=(r.data||[]).map(function(x){return A.byId(x[col])}).filter(Boolean);
    var title=kind==='followers'?'Followers':'Following',m=me();
    panel.innerHTML='<div class="pf-ph"><h3>'+title+'<small>'+us.length+'</small></h3><button type="button" class="pf-x" data-pclose aria-label="Close">Close</button></div>'+
      (us.length?'<ul class="plist">'+us.map(function(u){return '<li class="prow"><a class="prow-who" href="#/u/'+esc(u.username)+'">'+av(u,44)+'<span class="prow-t"><b>'+esc(u.name)+badge(u)+'</b><small>@'+esc(u.username)+'</small></span></a>'+(m&&m.id!==u.id?followBtn(u.id):'')+'</li>'}).join('')+'</ul>':
      '<p class="pf-none">'+(kind==='followers'?'No followers yet.':'Not following anyone yet.')+'</p>');
    paint();
  },function(){panel.textContent='Could not load the list'});
}
/* adds Follow / Message buttons, counts and the online line to every profile header (see pfHeader in eco.js) */
function injectProfile(box){
  if(box.dataset.soc)return;box.dataset.soc='1';
  var id=box.dataset.uid,own=me()&&me().id===id,u=A.byId(id);
  var un=$('.pf-un',box);
  if(un)un.insertAdjacentHTML('afterend','<p class="pres" data-uid="'+esc(id)+'"></p>');
  var acts=$('.pf-acts',box);
  if(acts&&!own&&u)acts.insertAdjacentHTML('afterbegin',followBtn(id)+'<a class="btn btn-sm" href="#/messages/'+esc(u.username)+'" data-msg="'+esc(u.username)+'">Message</a>');
  var st=$('.pf-stats',box);
  if(st)st.insertAdjacentHTML('beforeend','<li data-cnt="followers"><button type="button" class="linkish" data-list="followers"><b>-</b> <span>followers</span></button></li><li data-cnt="following"><button type="button" class="linkish" data-list="following"><b>-</b> <span>following</span></button></li>');
  refreshCounts(box);
  if(me()&&!own&&un)SB.from('follows').select('follower').eq('follower',id).eq('following',me().id).limit(1).then(function(r){
    if(!r.error&&r.data&&r.data.length&&!$('.fyou',box))un.insertAdjacentHTML('beforeend',' <span class="fyou">Follows you</span>');
  },function(){});
  var av0=$('.pf-av .avatar',box);
  pollOnline([id]);
}
document.addEventListener('click',function(e){
  var f=e.target.closest('[data-follow]');if(f){e.preventDefault();toggleFollow(f.dataset.follow,f);return}
  if(e.target.closest('[data-pclose]')){var pp=e.target.closest('.pf-people');if(pp)pp.remove();return}
  var l=e.target.closest('[data-list]');if(l){var box=l.closest('.pf-main');if(box)listPeople(box,l.dataset.list)}
  var mg=e.target.closest('[data-msg]');if(mg&&!e.defaultPrevented&&!(e.metaKey||e.ctrlKey||e.shiftKey)){e.preventDefault();if(window.AevyMessenger)AevyMessenger.open(mg.dataset.msg)}
});

/* ================= messenger ================= */
/* Header icon + popup inbox, pop-up chat windows (dock), full Messages page, live typing, read receipts. */
function ico(p,s){return '<svg width="'+(s||18)+'" height="'+(s||18)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'}
var P={
  plane:'<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/>',
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20.5l1.4-5.4A8.5 8.5 0 1 1 21 11.5z"/>',
  send:'<path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  min:'<path d="M5 12h14"/>',
  full:'<path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M10 20H4v-6"/><path d="M4 20l8-8"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'
};
var msgs=[],loaded=false,chan=null,tchan=null,tmpN=0,typing={},tout={},outCh={},lastTyped={};
var threads=[],pageThread=null,dockWins=[],popTab='all',pageTab='all';
var DOCK_KEY='aevy.dock';
function E(){return window.AevyE2E}
function opened(rows){return Promise.all((rows||[]).map(function(r){var m=mrow(r);return E()?E().open(m):Promise.resolve(m)}))}
function mrow(r){return {id:r.id,s:r.sender,r:r.recipient,body:r.body,t:Date.parse(r.created)||Date.now(),read:!!r.read_at}}
function addMsg(m){for(var i=0;i<msgs.length;i++)if(msgs[i].id===m.id)return false;msgs.push(m);return true}
function loadMsgs(){
  if(!me())return Promise.resolve();
  var id=me().id;
  return SB.from('messages').select('*').or('sender.eq.'+id+',recipient.eq.'+id).order('created',{ascending:false}).limit(500).then(function(r){
    if(r.error)throw r.error;return opened(r.data).then(function(list){msgs=list;loaded=true;badgeCount()});
  });
}
function loadPair(other){
  var a=me().id;
  return SB.from('messages').select('*').or('and(sender.eq.'+a+',recipient.eq.'+other+'),and(sender.eq.'+other+',recipient.eq.'+a+')').order('created',{ascending:false}).limit(200).then(function(r){
    if(r.error)return;return opened(r.data).then(function(list){list.forEach(addMsg)});
  });
}
function unreadFrom(id){return msgs.filter(function(m){return m.s===id&&m.r===me().id&&!m.read}).length}
function unreadTotal(){return me()?msgs.filter(function(m){return m.r===me().id&&!m.read}).length:0}
function pair(pid){var id=me().id;return msgs.filter(function(m){return (m.s===id&&m.r===pid)||(m.s===pid&&m.r===id)}).sort(function(a,b){return a.t-b.t})}
function convos(){
  var id=me().id,map={};
  msgs.forEach(function(m){var o=m.s===id?m.r:m.s;if(!map[o]||m.t>map[o].t)map[o]=m});
  return Object.keys(map).map(function(o){return {id:o,last:map[o],n:unreadFrom(o)}}).filter(function(c){return A.byId(c.id)}).sort(function(a,b){return b.last.t-a.last.t});
}
function clock(t){
  var d=new Date(t),n=new Date();
  try{
    if(d.toDateString()===n.toDateString())return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(d);
    if(n-d<6*864e5)return new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(d);
    return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short'}).format(d);
  }catch(e){return ''}
}
function hm(t){try{return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(t))}catch(e){return ''}}
function fullTime(t){try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(t))}catch(e){return ''}}
function dayLabel(t){
  var d=new Date(t),n=new Date(),y=new Date(n.getTime()-864e5);
  if(d.toDateString()===n.toDateString())return 'Today';
  if(d.toDateString()===y.toDateString())return 'Yesterday';
  try{return new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long',year:d.getFullYear()===n.getFullYear()?undefined:'numeric'}).format(d)}catch(e){return ''}
}
function rich(s){return esc(s).replace(/(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])/g,function(u){return '<a href="'+u+'" target="_blank" rel="noopener noreferrer nofollow">'+u+'</a>'})}
function mobile(){return window.innerWidth<=760}
/* keep the chat exactly as tall as the visible screen: measures where the chat starts and what is really visible
   (phone address bars and keyboards change the visible height) */
(function(){var vv=window.visualViewport,raf=0,root=document.documentElement;
  function fit(){cancelAnimationFrame(raf);raf=requestAnimationFrame(function(){
    var h=vv?vv.height:window.innerHeight,v=document.querySelector('#view-messages.active'),m=document.getElementById('msgs');
    root.style.setProperty('--vvh',Math.round(h)+'px');
    if(!v||!m||window.innerWidth>760){root.style.removeProperty('--mxh');return}
    if(window.scrollY)window.scrollTo(0,0);
    var top=m.getBoundingClientRect().top-(vv?vv.offsetTop:0);
    root.style.setProperty('--mxh',Math.max(260,Math.floor(h-top))+'px');
  })}
  if(vv){vv.addEventListener('resize',fit);vv.addEventListener('scroll',fit)}
  window.addEventListener('resize',fit);window.addEventListener('orientationchange',fit);window.addEventListener('hashchange',function(){fit();setTimeout(fit,120);setTimeout(fit,500)});
  document.addEventListener('focusin',function(e){if(e.target.closest&&e.target.closest('#msgs')){fit();setTimeout(fit,250);setTimeout(fit,600)}});
  var mn=document.querySelector('main');if(mn)new MutationObserver(fit).observe(mn,{attributes:true,subtree:true,attributeFilter:['class']});
  fit();
})();
function first(u){return String(u.name||u.username).split(/\s+/)[0]}
function preview(m){if(m.locked)return 'Encrypted message';return (m.s===me().id?'You: ':'')+String(m.body).replace(/\s+/g,' ').slice(0,70)}

/* ---------- shared conversation list item ---------- */
function convoItem(c,on){
  var u=A.byId(c.id);if(!u)return '';
  return '<li><a class="ci'+(c.n?' unread':'')+(on?' on':'')+'" href="#/messages/'+esc(u.username)+'" data-chat="'+esc(u.username)+'"><span class="avw">'+av(u,44)+'</span>'+
   '<span class="ci-t"><span class="ci-top"><b>'+esc(u.name)+badge(u)+'</b><time>'+clock(c.last.t)+'</time></span>'+
   '<span class="ci-bot"><small>'+esc(preview(c.last))+'</small>'+(c.n?'<i class="ci-n">'+(c.n>99?'99+':c.n)+'</i>':'')+'</span></span></a></li>';
}
function personItem(u){
  return '<li><a class="ci" href="#/messages/'+esc(u.username)+'" data-chat="'+esc(u.username)+'"><span class="avw">'+av(u,44)+'</span><span class="ci-t"><span class="ci-top"><b>'+esc(u.name)+badge(u)+'</b></span><span class="ci-bot"><small>@'+esc(u.username)+'</small></span></span></a></li>';
}
function listHTML(q,tab,activeId,emptyMsg){
  q=q.trim().toLowerCase().replace(/^@/,'');
  if(q){
    var us=A.all().filter(function(u){return u.id!==me().id&&!!me().guest===!!u.guest&&(u.username.indexOf(q)>-1||(u.name||'').toLowerCase().indexOf(q)>-1)}).slice(0,12);
    return us.length?'<li class="ci-h">People</li>'+us.map(personItem).join(''):'<li class="ci-empty"><b>No one found</b><span>Try a different name or @username.</span></li>';
  }
  var cs=convos();if(tab==='unread')cs=cs.filter(function(c){return c.n});
  if(!cs.length&&tab!=='unread'&&me().guest){
    var gs=A.all().filter(function(u){return u.guest&&u.id!==me().id}).sort(function(a,b){return b.created-a.created}).slice(0,15);
    if(gs.length)return '<li class="ci-h">Guests you can message</li>'+gs.map(personItem).join('');
  }
  return cs.length?cs.map(function(c){return convoItem(c,c.id===activeId)}).join(''):
    '<li class="ci-empty">'+ico(P.chat,28)+'<b>'+(tab==='unread'?'You are all caught up':'No conversations yet')+'</b><span>'+(emptyMsg||'Search for a member above, or open a profile and press Message.')+'</span></li>';
}
function tabsHTML(cur,n){
  return '<button type="button" role="tab" class="'+(cur==='all'?'on':'')+'" data-tab="all" aria-selected="'+(cur==='all')+'">All</button><button type="button" role="tab" class="'+(cur==='unread'?'on':'')+'" data-tab="unread" aria-selected="'+(cur==='unread')+'">Unread'+(n?'<i>'+(n>99?'99+':n)+'</i>':'')+'</button>';
}

/* ---------- header icon + popup ---------- */
var hb=document.createElement('button');
hb.type='button';hb.className='icon-btn mbtn';hb.id='msgBtn';hb.hidden=true;
hb.setAttribute('aria-label','Messages');hb.setAttribute('aria-haspopup','dialog');hb.setAttribute('aria-expanded','false');
hb.innerHTML=ico(P.plane,22)+'<i class="mdot" id="msgDot" hidden></i>';
var bar=$('.bar-actions');if(bar)bar.insertBefore(hb,$('#theme')||bar.firstChild);
var pop=document.createElement('div');pop.className='mp';pop.id='msgPop';pop.hidden=true;pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Messages');
pop.innerHTML='<div class="mp-head"><h3>Messages</h3><span class="mp-tools"><button type="button" class="cw-ibtn" data-mp="new" title="New message" aria-label="New message">'+ico(P.edit,17)+'</button><a class="cw-ibtn" href="#/messages" title="Open Messages" aria-label="Open Messages">'+ico(P.full,17)+'</a></span></div>'+
 '<div class="mp-search">'+ico(P.search,16)+'<input id="mpFind" type="search" placeholder="Search people" autocomplete="off" aria-label="Search people"></div>'+
 '<div class="mp-tabs" id="mpTabs" role="tablist"></div><ul class="mp-list" id="mpList"></ul><a class="mp-foot" href="#/messages">See all in Messages</a>';
document.body.appendChild(pop);
function popOpen(){return !pop.hidden}
function openPop(){
  if(!me())return;pop.hidden=false;hb.setAttribute('aria-expanded','true');
  $('#mpFind').value='';paintPop();
  if(!loaded)loadMsgs().then(paintPop,function(){});
}
function closePop(){pop.hidden=true;hb.setAttribute('aria-expanded','false')}
function paintPop(){
  if(!popOpen()||!me())return;
  $('#mpTabs').innerHTML=tabsHTML(popTab,convos().filter(function(c){return c.n}).length);
  $('#mpList').innerHTML=listHTML($('#mpFind').value,popTab,null);paint();
}
hb.onclick=function(e){e.stopPropagation();if(mobile()){closePop();location.hash='#/messages';return}popOpen()?closePop():openPop()};
$('#mpFind').oninput=paintPop;
pop.addEventListener('click',function(e){
  e.stopPropagation();
  var t=e.target.closest('[data-tab]');if(t){popTab=t.dataset.tab;paintPop();return}
  if(e.target.closest('[data-mp="new"]')){$('#mpFind').focus();return}
  var o=e.target.closest('[data-chat]');
  if(o){e.preventDefault();closePop();openChat(o.dataset.chat);return}
  if(e.target.closest('a'))closePop();
});
document.addEventListener('click',function(e){if(popOpen()&&!e.target.closest('#msgPop,#msgBtn'))closePop()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&popOpen()){closePop();hb.focus()}});

/* ---------- opening a conversation ---------- */
function openChat(un){
  var u=A.byName(String(un||'').toLowerCase());if(!u||!me()||u.id===me().id)return;
  if(mobile()||/^#\/messages/.test(location.hash)){location.hash='#/messages/'+encodeURIComponent(u.username);return}
  openDock(u);
}

/* ---------- one conversation view (used by the page and by pop-up windows) ---------- */
function shell(u,kind){
  var d=kind==='dock';
  return '<header class="cw-head">'+(d?'':'<a class="cw-ibtn cw-back" href="#/messages" aria-label="Back to conversations">'+ico(P.back,20)+'</a>')+
   '<a class="cw-who" href="#/u/'+esc(u.username)+'"><span class="avw">'+av(u,d?34:42)+'</span><span class="cw-t"><b>'+esc(u.name)+badge(u)+'</b><small class="pres" data-uid="'+esc(u.id)+'"></small></span></a>'+
   '<span class="cw-tools">'+(d?'<i class="ci-n cw-n" hidden></i><button type="button" class="cw-ibtn" data-cw="min" title="Minimise" aria-label="Minimise">'+ico(P.min,17)+'</button><a class="cw-ibtn" data-cw="full" href="#/messages/'+esc(u.username)+'" title="Open in Messages" aria-label="Open in Messages">'+ico(P.full,16)+'</a><button type="button" class="cw-ibtn" data-cw="close" title="Close" aria-label="Close">'+ico(P.close,17)+'</button>':'<a class="cw-ibtn" href="#/u/'+esc(u.username)+'" title="View profile" aria-label="View profile">'+ico(P.user,18)+'</a>')+'</span></header>'+
   '<div class="cw-body" data-body tabindex="-1"></div><div class="cw-typing" data-typing aria-live="polite"></div>'+
   '<div class="cw-compose"><button type="button" class="cw-emo" data-emo aria-label="Add emoji" title="Emoji">&#128578;</button><textarea class="cw-input" rows="1" maxlength="2000" placeholder="Message '+esc(first(u))+'" aria-label="Write a message"></textarea><button type="button" class="cw-send" data-send disabled aria-label="Send message">Send</button></div>';
}
function makeThread(el,u,kind){
  var t={el:el,u:u,kind:kind};
  el.innerHTML=shell(u,kind);el._t=t;
  t.body=$('[data-body]',el);t.ta=$('.cw-input',el);t.btn=$('[data-send]',el);t.typ=$('[data-typing]',el);
  t.ta.oninput=function(){this.style.height='auto';this.style.height=Math.min(120,this.scrollHeight)+'px';t.btn.disabled=!this.value.trim();if(this.value.trim())sendTyping(u.id)};
  t.ta.onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendFrom(t)}};
  t.ta.onfocus=function(){if(visible(u.id))markRead(u.id)};
  t.btn.onclick=function(){sendFrom(t)};
  threads.push(t);paintBody(t,true);paintTyping();paint();pollOnline([u.id]);
  loadPair(u.id).then(function(){paintBody(t,true);if(visible(u.id))markRead(u.id);paintLists()});
  return t;
}
function dropThread(t){threads=threads.filter(function(x){return x!==t})}
function bubble(m,mine,fst,lst){
  var cls='cb '+(mine?'me':'them')+(fst?' first':'')+(lst?' last':'')+(m.pending?' pending':'')+(m.failed?' failed':'');
  return '<div class="'+cls+'" data-mid="'+esc(m.id)+'"><div class="cb-row">'+
   (mine&&!m.pending&&!m.failed?'<button type="button" class="cb-del" data-unsend="'+esc(m.id)+'" title="Unsend" aria-label="Unsend message">'+ico(P.trash,15)+'</button>':'')+
   '<div class="cb-in'+(m.locked?' locked':'')+'" title="'+esc(fullTime(m.t))+'"><p>'+(m.locked?'<span class="cb-lk">'+E().lockIcon+'Encrypted message</span> <button type="button" class="cb-unl" data-e2e>Unlock</button>':rich(m.body))+'</p></div></div>'+
   (lst?'<span class="cb-time">'+hm(m.t)+'</span>':'')+'</div>';
}
function paintBody(t,stick){
  var b=t.body;if(!b||!me())return;
  var id=me().id,list=pair(t.u.id).slice(-200),near=b.scrollHeight-b.scrollTop-b.clientHeight<90,html='',prevDay='',prev=null,lastMine=-1;
  list.forEach(function(m,i){if(m.s===id)lastMine=i});
  list.forEach(function(m,i){
    var day=new Date(m.t).toDateString(),next=list[i+1],mine=m.s===id;
    if(day!==prevDay){html+='<div class="cw-day"><span>'+esc(dayLabel(m.t))+'</span></div>';prevDay=day;prev=null}
    var fst=!prev||prev.s!==m.s||m.t-prev.t>300000;
    var lst=!next||next.s!==m.s||next.t-m.t>300000||new Date(next.t).toDateString()!==day;
    html+=bubble(m,mine,fst,lst);
    if(i===lastMine){
      html+='<div class="cb-status'+(m.failed?' bad':'')+'">'+(m.failed?'Not sent. <button type="button" data-retry="'+esc(m.id)+'">Retry</button> <button type="button" data-drop="'+esc(m.id)+'">Remove</button>':m.pending?'Sending…':m.read?'Seen':'Delivered')+'</div>';
    }
    prev=m;
  });
  html=(E()?E().banner():'')+html;
  if(!list.length)html=(E()?E().banner():'')+'<div class="cw-intro"><span class="avw">'+av(t.u,64)+'</span><b>'+esc(t.u.name)+'</b><span>@'+esc(t.u.username)+'</span><p>This is the start of your conversation. Say hello.</p><p class="cw-enc">'+(E()?E().lockIcon:'')+'Messages are end-to-end encrypted</p></div>';
  b.innerHTML=html;
  if(stick||near)b.scrollTop=b.scrollHeight;
}
function paintTyping(){
  threads.forEach(function(t){
    if(!t.typ)return;
    var on=!!typing[t.u.id];
    t.typ.innerHTML=on?'<span class="dots"><i></i><i></i><i></i></span><span>'+esc(first(t.u))+' is typing</span>':'';
    t.typ.classList.toggle('on',on);
    if(on&&t.body&&t.body.scrollHeight-t.body.scrollTop-t.body.clientHeight<120)t.body.scrollTop=t.body.scrollHeight;
  });
}
function repaint(pid,stick){threads.forEach(function(t){if(t.u.id===pid)paintBody(t,stick)});paintLists();paintDock()}

/* ---------- sending ---------- */
function sendFrom(t){
  var body=t.ta.value.trim();if(!body||!me())return;
  var tmp={id:'tmp'+(++tmpN),s:me().id,r:t.u.id,body:body,t:Date.now(),read:false,pending:true};
  msgs.push(tmp);t.ta.value='';t.ta.style.height='auto';t.btn.disabled=true;
  repaint(t.u.id,true);t.ta.focus();doSend(tmp);
}
function doSend(tmp){
  tmp.pending=true;tmp.failed=false;
  var e=E();
  (e?e.encrypt(tmp.r,tmp.body):Promise.reject({code:'off'})).then(function(ct){
    return SB.from('messages').insert({sender:me().id,recipient:tmp.r,body:ct}).select('*').single();
  }).then(function(r){
    if(r.error){
      tmp.pending=false;tmp.failed=true;
      C.toast(/too fast/i.test(r.error.message||'')?'You are sending messages too fast. Wait a moment':/row-level security|42501|42P01|PGRST205/i.test((r.error.message||'')+(r.error.code||''))?'Messaging is not set up yet. Run the latest supabase/schema.sql':(r.error.message||'Could not send'));
    }else{msgs=msgs.filter(function(x){return x!==tmp});var m=mrow(r.data);m.body=tmp.body;addMsg(m)}
    repaint(tmp.r,true);
  },function(x){
    tmp.pending=false;tmp.failed=true;var c=x&&x.code;
    if(c==='locked'){C.toast('Unlock your messages first');if(e)e.prompt(true)}
    else if(c==='nokey'){var u=A.byId(tmp.r);C.toast((u?'@'+u.username:'This person')+' has not turned on encrypted messages yet. They need to open Aevy once.')}
    else if(c==='off')C.toast('Encrypted messages are not available here. Use a current browser over https.');
    else C.toast('Cannot reach the server');
    repaint(tmp.r,true);
  });
}
function findTmp(id){for(var i=0;i<msgs.length;i++)if(msgs[i].id===id)return msgs[i]}
document.addEventListener('click',function(e){
  var u=e.target.closest('[data-unsend]'),rt=e.target.closest('[data-retry]'),dr=e.target.closest('[data-drop]');
  if(u){
    var id=u.dataset.unsend;u.disabled=true;
    SB.from('messages').delete().eq('id',id).then(function(r){
      if(r.error){u.disabled=false;fail(r.error);return}
      var m=findTmp(id),pid=m?(m.s===me().id?m.r:m.s):null;
      msgs=msgs.filter(function(x){return x.id!==id});if(pid)repaint(pid,false);badgeCount();
    },function(x){u.disabled=false;fail(x)});return;
  }
  if(rt){var m=findTmp(rt.dataset.retry);if(m){doSend(m);repaint(m.r,true)}return}
  if(dr){var m2=findTmp(dr.dataset.drop);if(m2){msgs=msgs.filter(function(x){return x!==m2});repaint(m2.r,false)}return}
  var cw=e.target.closest('[data-cw]');
  if(cw){
    var win=cw.closest('.cw-dock');if(!win)return;
    var a=cw.dataset.cw;
    if(a==='close'){e.preventDefault();closeDock(win._t.u.id)}
    else if(a==='min'){e.preventDefault();toggleMin(win._t.u.id)}
    else if(a==='full'){closeDock(win._t.u.id)}
    return;
  }
  var hd=e.target.closest('.cw-dock.min .cw-head');
  if(hd){e.preventDefault();toggleMin(hd.closest('.cw-dock')._t.u.id,false)}
});

/* ---------- typing indicator (Realtime broadcast; nothing is stored) ---------- */
function typingListen(){
  if(tchan){try{SB.removeChannel(tchan)}catch(e){}tchan=null}
  if(!me())return;
  tchan=SB.channel('aevy-typing-'+me().id).on('broadcast',{event:'typing'},function(p){
    var from=p&&p.payload&&p.payload.from;if(!from||from===me().id)return;
    typing[from]=1;clearTimeout(tout[from]);tout[from]=setTimeout(function(){delete typing[from];paintTyping()},4000);paintTyping();
  }).subscribe();
}
function sendTyping(pid){
  var n=Date.now();if(n-(lastTyped[pid]||0)<2500||!me())return;lastTyped[pid]=n;
  var ch=outCh[pid];
  if(!ch){ch=outCh[pid]=SB.channel('aevy-typing-'+pid);ch.subscribe()}
  try{ch.send({type:'broadcast',event:'typing',payload:{from:me().id}})}catch(e){}
}
function dropTypingChannels(){
  Object.keys(outCh).forEach(function(k){try{SB.removeChannel(outCh[k])}catch(e){}});outCh={};lastTyped={};typing={};
  if(tchan){try{SB.removeChannel(tchan)}catch(e){}tchan=null}
}

/* ---------- read state ---------- */
function visible(pid){
  if(document.hidden)return false;
  if(pageThread&&pageThread.u.id===pid&&sec.classList.contains('active'))return true;
  for(var i=0;i<dockWins.length;i++)if(dockWins[i].t.u.id===pid&&!dockWins[i].min)return true;
  return false;
}
function markRead(pid){
  if(!me()||!unreadFrom(pid))return;
  msgs.forEach(function(m){if(m.s===pid&&m.r===me().id)m.read=true});
  badgeCount();paintLists();paintDock();
  SB.rpc('mark_read',{other:pid}).then(function(){},function(){});
}
document.addEventListener('visibilitychange',function(){
  if(document.hidden||!me())return;
  threads.forEach(function(t){if(visible(t.u.id))markRead(t.u.id)});
});
function badgeCount(){
  var n=unreadTotal(),b=$('#unreadBadge'),d=$('#msgDot'),txt=n>99?'99+':String(n);
  if(b){b.textContent=txt;b.hidden=!n}
  if(d){d.textContent=txt;d.hidden=!n}
  if(hb)hb.hidden=!me();
  document.title=document.title.replace(/^\(\d+\+?\)\s/,'');
  if(n&&me())document.title='('+txt+') '+document.title;
  paintPop();
}

/* ---------- pop-up chat windows ---------- */
var dockEl=document.createElement('div');dockEl.id='chatDock';document.body.appendChild(dockEl);
function maxWins(){return Math.max(1,Math.min(3,Math.floor((window.innerWidth-24)/344)))}
function saveDock(){try{sessionStorage.setItem(DOCK_KEY,JSON.stringify(dockWins.map(function(w){return {u:w.t.u.username,m:w.min?1:0}})))}catch(e){}}
function winFor(pid){for(var i=0;i<dockWins.length;i++)if(dockWins[i].t.u.id===pid)return dockWins[i]}
function openDock(u,min){
  var w=winFor(u.id);
  if(w){if(!min)toggleMin(u.id,false);return}
  while(dockWins.length>=maxWins())closeDock(dockWins[0].t.u.id,true);
  var el=document.createElement('section');el.className='cw cw-dock'+(min?' min':'');el.setAttribute('role','dialog');el.setAttribute('aria-label','Chat with '+u.name);
  dockEl.appendChild(el);
  var t=makeThread(el,u,'dock');w={t:t,min:!!min,el:el};dockWins.push(w);
  if(!min){markRead(u.id);if(!mobile())t.ta.focus()}
  saveDock();paintDock();
}
function closeDock(pid,quiet){
  var w=winFor(pid);if(!w)return;
  dropThread(w.t);dockWins=dockWins.filter(function(x){return x!==w});w.el.remove();
  if(!quiet){saveDock();paintDock()}
}
function toggleMin(pid,force){
  var w=winFor(pid);if(!w)return;
  w.min=typeof force==='boolean'?force:!w.min;
  w.el.classList.toggle('min',w.min);saveDock();
  if(!w.min){markRead(pid);paintBody(w.t,true);if(!mobile())w.t.ta.focus()}
  paintDock();
}
function paintDock(){
  dockWins.forEach(function(w){
    var n=unreadFrom(w.t.u.id),c=$('.cw-n',w.el);
    if(c){c.hidden=!(w.min&&n);c.textContent=n>99?'99+':n}
    w.el.classList.toggle('alert',w.min&&n>0);
  });
}
function restoreDock(){
  var list=[];try{list=JSON.parse(sessionStorage.getItem(DOCK_KEY)||'[]')}catch(e){}
  if(mobile()||!Array.isArray(list))return;
  list.slice(0,maxWins()).forEach(function(x){var u=A.byName(String(x.u||'').toLowerCase());if(u&&me()&&u.id!==me().id)openDock(u,!!x.m)});
}
function clearDock(){dockWins.slice().forEach(function(w){closeDock(w.t.u.id,true)});try{sessionStorage.removeItem(DOCK_KEY)}catch(e){}}

/* ---------- new-message notification cards ---------- */
var tw=document.createElement('div');tw.id='mtoasts';tw.setAttribute('aria-live','polite');document.body.appendChild(tw);
function notify(u,m){
  if(!u)return;
  var el=document.createElement('div');el.className='mt';el.setAttribute('role','status');
  el.innerHTML='<button type="button" class="mt-main"><span class="avw">'+av(u,40)+'</span><span class="mt-t"><b>'+esc(u.name)+'</b><small>'+esc(String(m.body).replace(/\s+/g,' ').slice(0,90))+'</small></span></button><button type="button" class="mt-x" aria-label="Dismiss">'+ico(P.close,15)+'</button>';
  function gone(){el.classList.add('out');setTimeout(function(){el.remove()},220)}
  el.querySelector('.mt-main').onclick=function(){gone();openChat(u.username)};
  el.querySelector('.mt-x').onclick=gone;
  while(tw.children.length>=3)tw.firstChild.remove();
  tw.appendChild(el);paint();setTimeout(gone,7000);
}

/* ---------- Messages page ---------- */
var sec=document.createElement('section');sec.className='view';sec.id='view-messages';sec.dataset.view='messages';
sec.innerHTML='<div class="wrap"><div class="mx" id="msgs"><aside class="mx-side"><div class="mx-sh"><button type="button" class="cw-ibtn mx-back" id="mBack" aria-label="Back">'+ico(P.back,24)+'</button><h1>Messages</h1><button type="button" class="cw-ibtn" id="mNew" title="New message" aria-label="New message">'+ico(P.edit,18)+'</button></div>'+
 '<div class="mp-search">'+ico(P.search,16)+'<input id="mFind" type="search" placeholder="Search people" autocomplete="off" aria-label="Search people"></div>'+
 '<div class="mp-tabs" id="mTabs" role="tablist"></div><ul class="mx-list" id="mList"></ul>'+
 '<label class="mx-opt"><span><b>Show when I am online</b><small>Others can see your active status</small></span><input type="checkbox" id="mStatus" class="sw"></label></aside>'+
 '<section class="mx-main" id="mMain"></section></div></div>';
$('main').appendChild(sec);
$('#mStatus').onchange=function(){try{localStorage.setItem(HIDE_KEY,this.checked?'0':'1')}catch(e){}beat()};
$('#mNew').onclick=function(){$('#mFind').focus()};
$('#mBack').onclick=function(){if(history.length>1&&document.referrer.indexOf(location.host)>-1)history.back();else location.hash='#/'};
function paintList(){
  if(!me()||!sec.classList.contains('active'))return;
  $('#mTabs').innerHTML=tabsHTML(pageTab,convos().filter(function(c){return c.n}).length);
  $('#mList').innerHTML=listHTML($('#mFind').value,pageTab,pageThread&&pageThread.u.id);paint();
}
function paintLists(){paintList();paintPop();badgeCount()}
$('#mFind').oninput=paintList;
$('#mTabs').addEventListener('click',function(e){var b=e.target.closest('[data-tab]');if(b){pageTab=b.dataset.tab;paintList()}});
function blank(main,title,text,btn){
  main.innerHTML='<div class="m-blank">'+ico(P.chat,40)+'<h3>'+title+'</h3><p>'+text+'</p>'+(btn||'')+'</div>';
}
function openPage(un){
  var u=un&&A.byName(un),main=$('#mMain');
  sec.classList.toggle('thread-open',!!un);
  if(!un){
    if(pageThread){dropThread(pageThread);pageThread=null}
    blank(main,'Your messages','Pick a conversation from the list, or search for a member to start a new one.','<button type="button" class="btn btn-primary" id="mStart">New message</button>');
    var s=$('#mStart');if(s)s.onclick=function(){$('#mFind').focus()};
    paintList();return;
  }
  if(!u||u.id===me().id){
    if(pageThread){dropThread(pageThread);pageThread=null}
    blank(main,'Conversation not found','That member does not exist, or it is you.','<a class="btn" href="#/messages">Back to messages</a>');paintList();return;
  }
  if(pageThread&&pageThread.u.id===u.id&&main.contains(pageThread.el)){paintBody(pageThread,true);markRead(u.id);paintList();return}
  if(pageThread){dropThread(pageThread);pageThread=null}
  closeDock(u.id);
  main.innerHTML='';var el=document.createElement('div');el.className='cw cw-page';main.appendChild(el);
  pageThread=makeThread(el,u,'page');
  markRead(u.id);paintList();
  if(!mobile())pageThread.ta.focus();
}

/* ---------- live updates ---------- */
function listen(){
  if(chan){try{SB.removeChannel(chan)}catch(e){}chan=null}
  if(!me())return;
  chan=SB.channel('aevy-dm-'+me().id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},function(p){
     var id=me().id;if(p.new.sender!==id&&p.new.recipient!==id)return;
     opened([p.new]).then(function(l){
       var m=l[0];
       if(!addMsg(m))return;
       var other=m.s===id?m.r:m.s;
       if(m.r===id){
         delete typing[m.s];
         if(visible(m.s))markRead(m.s);else notify(A.byId(m.s),m);
       }
       repaint(other,true);paintTyping();
     });
   })
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages'},function(p){
     var n=p.new;if(!n||!n.id)return;
     for(var i=0;i<msgs.length;i++)if(msgs[i].id===n.id){var was=msgs[i].read;msgs[i].read=!!n.read_at;if(was!==msgs[i].read){var o=msgs[i].s===me().id?msgs[i].r:msgs[i].s;repaint(o,false)}break}
   })
   .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages'},function(p){
     var id=p.old&&p.old.id;if(!id)return;
     var m=findTmp(id),other=m?(m.s===me().id?m.r:m.s):null;
     msgs=msgs.filter(function(x){return x.id!==id});
     if(other)repaint(other,false);else{threads.forEach(function(t){paintBody(t,false)});paintLists()}
     badgeCount();
   })
   .on('postgres_changes',{event:'*',schema:'public',table:'follows'},function(){
     $$('.pf-main[data-uid]').forEach(refreshCounts);
   })
   .subscribe();
}

/* ================= start / route ================= */
function start(){
  badgeCount();
  if(!me()){
    msgs=[];loaded=false;clearDock();
    if(pageThread){dropThread(pageThread);pageThread=null}
    closePop();dropTypingChannels();
    if(chan){try{SB.removeChannel(chan)}catch(e){}chan=null}
    return Promise.resolve();
  }
  $('#mStatus').checked=!hidden();
  var keys=window.AevyE2E?window.AevyE2E.init(me()).catch(function(){}):Promise.resolve();
  return Promise.all([loadFollowing(),keys.then(loadMsgs).catch(function(e){console.warn('Messages: run the latest supabase/schema.sql',e)})]).then(function(){
    listen();typingListen();beat().then(function(){return pollOnline()});badgeCount();restoreDock();window.dispatchEvent(new Event('aevy:following'));
  });
}
function renderView(h,raw){
  document.body.classList.toggle('on-messages',h==='messages');
  badgeCount();
  if(h!=='messages'||!me())return;
  var un=decodeURIComponent((raw.split('/')[1]||'')).toLowerCase();
  (loaded?Promise.resolve():loadMsgs().catch(function(){})).then(function(){$('#mFind').value='';openPage(un);if(E())E().prompt(false)});
}
window.AevySocial={render:renderView,visible:function(){return !hidden()},setVisible:function(v){try{localStorage.setItem(HIDE_KEY,v?'0':'1')}catch(e){}beat()},online:isOnline,following:function(){return following},counts:counts,followBtn:followBtn,
  onlineIds:function(){return Object.keys(seen).filter(isOnline)}};
window.AevyMessenger={open:openChat,openPopup:openPop,unread:unreadTotal};
window.addEventListener('aevy:auth',function(){start()});
window.addEventListener('aevy:e2e',function(){if(!me())return;loadMsgs().catch(function(){}).then(function(){threads.forEach(function(t){paintBody(t,false)});paintLists()})});
window.addEventListener('aevy:presence',function(){paintList()});
window.addEventListener('resize',function(){while(dockWins.length>maxWins())closeDock(dockWins[0].t.u.id,true);saveDock()});
A.ready.then(function(){return start()});

/* decorate profile headers and avatars as they appear */
var pend;
new MutationObserver(function(){
  clearTimeout(pend);pend=setTimeout(function(){$$('.pf-main[data-uid]').forEach(injectProfile);paint()},120);
}).observe(document.body,{childList:true,subtree:true});
})();

/* emoji picker for the message box */
(function(){
  var E=['😀','😂','🥹','😍','😎','🤔','😭','😡','👍','👎','👏','🙏','🔥','💯','❤️','💔','🎉','✨','🚗','🏁','🔧','⚙️','📦','✅','❌','👀','🙌','🤝'];
  var pick=null;
  function close(){if(pick){pick.remove();pick=null}}
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-emo]');
    if(b){
      var same=pick&&pick._b===b;close();if(same)return;
      pick=document.createElement('div');pick.className='emo-pop';pick._b=b;
      pick.innerHTML=E.map(function(x){return '<button type="button" data-e="'+x+'">'+x+'</button>'}).join('');
      b.parentNode.appendChild(pick);return;
    }
    var o=e.target.closest('.emo-pop [data-e]');
    if(o){
      var ta=o.closest('.cw-compose').querySelector('.cw-input'),st=ta.selectionStart==null?ta.value.length:ta.selectionStart;
      ta.value=ta.value.slice(0,st)+o.dataset.e+ta.value.slice(ta.selectionEnd==null?st:ta.selectionEnd);
      ta.focus();var p=st+o.dataset.e.length;try{ta.setSelectionRange(p,p)}catch(x){}
      ta.dispatchEvent(new Event('input'));return;
    }
    if(!e.target.closest('.emo-pop'))close();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
})();
