/* Aevy home: a social feed. Left: your card + shortcuts. Centre: composer + feed (Latest / Following / Trending).
   Right: live stats, who to follow, who is online. */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth;
if(!C||!A)return;
var esc=C.esc,$=function(s,r){return (r||document).querySelector(s)};
var tab='latest',shown=24,STEP=24,topic='All',apiItems=[],apiPage=1,apiMore=false,apiBusy=false,apiError='',apiTimer=0,apiConfigured=false;
var TOPICS=['All'],TOPIC_ITEMS=[];
function me(){return A.current()}
function av(u,n){return window.AevyEco?AevyEco.avatar(u,n):''}
function badge(u){return window.AevyBadge?AevyBadge.html(u):''}
function S(){return window.AevySocial}
function ico(p){return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'}
var I={
  scripts:ico('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
  people:ico('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.8 3 2.6 3 5.6"/>'),
  msg:ico('<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20.5l1.4-5.4A8.5 8.5 0 1 1 21 11.5z"/>'),
  files:ico('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  play:ico('<path d="m9 6 10 6-10 6z"/>'),
  plus:ico('<path d="M12 5v14M5 12h14"/>')
};

function isCreator(id){var u=A.byId?A.byId(id):null,B=window.AevyBadge;return !!(u&&B&&B.isCreator(u))}
var reqId=0,AGE_KEY='aevy_18';
function ageOk(){if(!(window.AEVY_CONFIG||{}).ageGate)return true;try{return localStorage.getItem(AGE_KEY)==='1'}catch(e){return sessionStorage&&false}}
var ageSession=false;
function ageGateHTML(){return '<div class="empty" role="dialog" aria-labelledby="ageT"><h3 id="ageT">Adults only (18+)</h3><p>This site shows adult videos from a third-party provider. Confirm that you are at least 18 years old and that viewing adult content is legal where you live.</p><p><button class="btn btn-primary" type="button" data-age-yes>I am 18 or older</button> <a class="btn" href="https://www.google.com" rel="noopener">Leave</a></p></div>'}
function loadCategories(){if(!window.AevyVideoAPI)return;window.AevyVideoAPI.categories().then(function(res){apiConfigured=res.configured!==false;TOPIC_ITEMS=res.items||[];TOPICS=['All'].concat(TOPIC_ITEMS.map(function(c){return c.name||c.slug}).filter(Boolean));var active=TOPIC_ITEMS.filter(function(c){return (c.name||c.slug)===topic})[0];if(topic!=='All'&&!active){topic='All'}paintCategories()}).catch(function(){paintCategories()})}
function paintCategories(){var box=$('.yt-categories');if(box)box.innerHTML=TOPICS.length>1?TOPICS.map(function(t){return '<button type="button" data-topic="'+esc(t)+'" class="'+(t===topic?'on':'')+'">'+esc(t)+'</button>'}).join(''):''}
function followingMap(){var f=S()&&S().following?S().following():{};return f}
/* reset=true: start over (new tab / category / search). reset=false: "Show more" adds the next page.
   Every request has an id, so an old answer can never overwrite a newer one. */
function requestVideos(reset){
  var box=$('#homeFeed');if(!box||!window.AevyVideoAPI)return;
  if(!ageOk()&&!ageSession){box.innerHTML=ageGateHTML();return}
  if(!reset&&apiBusy)return;
  var id=++reqId,page=reset?1:apiPage;
  apiBusy=true;apiError='';if(reset){apiPage=1;apiItems=[];apiMore=false}paintFeed();
  var q=$('#videoSearch')?$('#videoSearch').value.trim():'';
  var cat=TOPIC_ITEMS.filter(function(c){return (c.name||c.slug)===topic})[0];
  var o={q:q,category:topic==='All'?'':(cat?cat.slug:topic),page:page,limit:24,sort:tab==='trending'?'popular':'newest'};
  if(tab==='following')o.owners=followingMap();
  window.AevyVideoAPI.list(o).then(function(r){
    if(id!==reqId)return;
    apiConfigured=r.configured!==false;
    var incoming=Array.isArray(r.items)?r.items:[];
    if(!reset){var have={};apiItems.forEach(function(v){have[v.id]=1});incoming=incoming.filter(function(v){return !v.id||!have[v.id]})}
    apiItems=reset?incoming:apiItems.concat(incoming);
    apiMore=!!r.hasMore&&(incoming.length>0||reset);apiPage=page;apiError='';
    if(reset)loadCategories();
  }).catch(function(e){if(id!==reqId)return;apiError=e.message||'Could not load videos';if(!reset)apiPage=Math.max(1,page-1)}).then(function(){if(id!==reqId)return;apiBusy=false;paintFeed()});
}
function videoCard(s,idx){
  var thumb=s.thumbnail_url||'',title=s.title||'Untitled video',channel=s.channel_title||s.provider||'Video creator',date=s.published_at?new Date(s.published_at):null;
  return '<article class="hs-card yt-card" style="--i:'+(idx||0)+'"><button class="yt-thumb" data-api-video="'+idx+'" aria-label="Play '+esc(title)+'" '+(thumb?'style="--thumb:url(\''+esc(thumb)+'\')"':'')+'><span class="yt-play">'+I.play+'</span></button><div class="yt-info"><span class="avatar" style="width:40px;height:40px">'+esc(channel.charAt(0).toUpperCase())+'</span><div class="yt-copy"><button class="yt-title" data-api-video="'+idx+'">'+esc(title)+'</button><span class="yt-author">'+esc(channel)+'</span><small>'+Number(s.view_count||0).toLocaleString()+' views'+(date&&!isNaN(date)?' · '+esc(date.toLocaleDateString()):'')+'</small></div></div>'+(s.description?'<p class="yt-desc">'+esc(s.description.slice(0,220))+'</p>':'')+'</article>';
}
function playVideo(s){var u=s.playback_url||s.source_url||'';if(!u)return;var dlg=$('#dlg'),body=$('#dlgBody');$('#dlgTitle').textContent=s.title||'Video';$('#dlgSub').textContent=(s.channel_title||'')+(s.provider?' · '+s.provider:'');var isFile=/\.(mp4|webm|ogg|ogv|m4v|mov)(\?|#|$)/i.test(u);body.innerHTML=isFile?'<video controls autoplay playsinline style="width:100%;max-height:70vh;background:#000" src="'+esc(u)+'"></video>'+(s.description?'<p class="desc">'+esc(s.description)+'</p>':'')+(s.source_url?'<p class="desc"><a href="'+esc(s.source_url)+'" target="_blank" rel="noopener noreferrer">Open original</a></p>':''):'<iframe title="'+esc(s.title||'Video')+'" src="'+esc(u)+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="width:100%;aspect-ratio:16/9;border:0;background:#000"></iframe>'+(s.description?'<p class="desc">'+esc(s.description)+'</p>':'');if(!dlg.open)dlg.showModal();document.body.classList.add('lock')}
function paintFeed(){
  var box=$('#homeFeed');if(!box)return;
  if(!ageOk()&&!ageSession){box.innerHTML=ageGateHTML();return}
  var parts=apiItems.map(videoCard);
  var live=window.AevyVideoAPI&&window.AevyVideoAPI.configured&&window.AevyVideoAPI.configured();
  var empty=apiBusy&&!apiItems.length?'<div class="empty"><p>Loading videos…</p></div>':apiError&&!apiItems.length?'<div class="empty"><h3>Videos could not load</h3><p>'+esc(apiError)+'</p><button class="btn" type="button" data-video-retry>Retry</button></div>':!apiItems.length?'<div class="empty"><h3>'+(tab==='following'?'Nothing from creators you follow yet':'No videos found')+'</h3><p>'+(tab==='following'?'Follow creators to see their videos here.':live&&apiConfigured?'Try another search or category.':'No video API is connected yet. Set <b>videoApiBase</b> in js/config.js to your Worker URL (see VIDEO_API_SETUP.md). Videos shared by members still appear here.')+'</p></div>':'';
  box.innerHTML=parts.length?'<div class="yt-grid">'+parts.join('')+'</div>'+(apiError?'<p class="note" role="alert">'+esc(apiError)+'</p>':'')+(apiMore||apiError?'<button class="btn feed-more" id="feedMore" type="button" '+(apiBusy?'disabled':'')+'>'+(apiBusy?'Loading…':apiError?'Try again':'Show more')+'</button>':''):empty;
  document.querySelectorAll('[data-tab]').forEach(function(b){var on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-current',on?'page':'false')});
  document.querySelectorAll('[data-topic]').forEach(function(b){var on=b.dataset.topic===topic;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
}

function leftCard(){
  var m=me();
  if(!m)return '';   /* signed out: no welcome card, the feed starts straight away */
  return '<a class="hs-card hs-me" href="#/profile"><span class="hs-cover" style="--c:'+esc(m.color)+'"></span><span class="hs-av">'+av(m,64)+'</span>'+
   '<b>'+esc(m.name)+badge(m)+'</b><small>@'+esc(m.username)+'</small>'+
   '<span class="hs-nums"><span><b id="hsScripts">'+C.mine().length+'</b>Scripts</span><span><b id="hsFollowers">-</b>Followers</span><span><b id="hsFollowing">-</b>Following</span></span></a>';
}
function nav(){
  return '<nav class="hs-card hs-nav" aria-label="Shortcuts"><a href="#/scripts">'+I.scripts+'Scripts</a>'+
   '<a href="#/messages">'+I.msg+'Messages</a><a href="#/files">'+I.files+'My files</a><a href="#/watch">'+I.play+'Watch</a></nav>';
}
function composer(){
  var m=me();
  return '<div class="hs-card composer">'+(m?av(m,42):'<span class="avatar" style="width:42px;height:42px">A</span>')+
   '<a class="composer-in" href="#/publish">'+(m?'Share a video, '+esc(m.name.split(' ')[0])+'...':'Sign in to share a video...')+'</a><a class="btn btn-primary btn-sm" href="#/publish">'+I.plus+'Share video</a></div>';
}
function suggestHTML(){
  var m=me(),f=S()?S().following():{},count={};
  C.vis().forEach(function(s){count[s.owner]=(count[s.owner]||0)+1});
  var us=A.all().filter(function(u){return (!m||u.id!==m.id)&&!f[u.id]&&isCreator(u.id)}).sort(function(a,b){return (count[b.id]||0)-(count[a.id]||0)||b.created-a.created}).slice(0,5);
  if(!us.length)return '<p class="hs-empty">No suggestions right now.</p>';
  return us.map(function(u){
    return '<div class="hs-row"><a class="hs-who" href="#/u/'+esc(u.username)+'">'+av(u,38)+'<span><b>'+esc(u.name)+badge(u)+'</b><small>@'+esc(u.username)+' &middot; '+(count[u.id]||0)+' scripts</small></span></a>'+
      (m&&S()?S().followBtn(u.id):'<a class="fbtn" href="#/auth">Follow</a>')+'</div>';
  }).join('');
}
function onlineHTML(){
  var m=me(),ids=S()?S().onlineIds():[],us=ids.map(function(id){return A.byId(id)}).filter(function(u){return u&&(!m||u.id!==m.id)}).slice(0,8);
  if(!us.length)return '<p class="hs-empty">Nobody else is online right now.</p>';
  return us.map(function(u){return '<a class="hs-on" href="#/u/'+esc(u.username)+'" title="'+esc(u.name)+'">'+av(u,38)+'<small>'+esc(u.username)+'</small></a>'}).join('');
}
function rightCol(){
  return '<div class="hs-card"><h3><span class="live-dot" aria-hidden="true"></span>Live today</h3><ul class="hs-live">'+
   '<li><b data-t="visitors">-</b><span>Visitors</span></li><li><b data-t="views">-</b><span>Views</span></li><li><b data-t="downloads">-</b><span>Downloads</span></li><li><b data-t="total">-</b><span>All time</span></li></ul></div>'+
   '<div class="hs-card"><h3>Who to follow</h3><div id="homeSuggest">'+suggestHTML()+'</div></div>'+
   '<div class="hs-card"><h3>Online now</h3><div class="hs-onl" id="homeOnline">'+onlineHTML()+'</div></div>';
}
function stories(){
  var m=me(),ids=S()?S().onlineIds():[],on={};ids.forEach(function(i){on[i]=1});
  var count={};C.vis().forEach(function(s){count[s.owner]=(count[s.owner]||0)+1});
  var us=A.all().filter(function(u){return !m||u.id!==m.id}).sort(function(a,b){return (on[b.id]?1:0)-(on[a.id]?1:0)||(count[b.id]||0)-(count[a.id]||0)}).slice(0,14);
  var mine='<a class="st" href="'+(m?'#/profile':'#/auth')+'"><span class="st-av me">'+(m?av(m,58):'<span class="avatar" style="width:58px;height:58px">A</span>')+'<i>+</i></span><small>'+(m?'Your profile':'Sign in')+'</small></a>';
  return '<div class="stories" aria-label="People">'+mine+us.map(function(u){
    return '<a class="st" href="#/u/'+esc(u.username)+'"><span class="st-av'+(on[u.id]?' live':'')+'">'+av(u,58)+'</span><small>'+esc(u.username)+'</small></a>';
  }).join('')+'</div>';
}
function meChip(){
  var m=me();if(!m)return '<div class="ig-me"><span class="avatar" style="width:44px;height:44px">A</span><div><b>Join Aevy</b><small>Sign in to follow creators</small></div><a href="#/auth">Sign in</a></div>';
  return '<div class="ig-me">'+av(m,44)+'<div><a href="#/profile"><b>'+esc(m.username)+'</b></a><small>'+esc(m.name)+'</small></div></div>';
}
function render(){
  var root=$('#homeRoot');if(!root)return;
  root.classList.toggle('guest',!me());
  root.innerHTML='<aside class="yt-sidebar" aria-label="Video navigation"><nav class="yt-side-nav">'+
   '<button type="button" class="on" data-tab="latest">'+ico('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>')+'Home</button>'+ 
   '<button type="button" data-tab="trending">'+ico('<path d="M12 22c4 0 7-2.7 7-6.5 0-2.8-1.5-4.6-4-6.5 0 2-1 3-2 3.5C13 8 10 4.8 7.5 3 8 7 5 9 5 13.5 5 18.3 7.8 22 12 22Z"/>')+'Trending</button>'+ 
   '<button type="button" data-tab="following">'+ico('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>')+'Subscriptions</button></nav><hr>'+ 
   '<h3>You</h3><nav class="yt-side-nav"><a href="#/watch">'+ico('<path d="M4 5h16M4 12h16M4 19h16"/>')+'Your library</a><a href="#/profile">'+ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6"/>')+'Your channel</a><a href="#/publish">'+I.plus+'Share video</a></nav>'+ 
   '<hr><p class="yt-side-note">Sign in to follow creators and build your video library.</p></aside>'+ 
   '<main class="yt-main"><div class="yt-categories" role="group" aria-label="Filter videos">'+TOPICS.map(function(t){return '<button type="button" data-topic="'+esc(t)+'">'+esc(t)+'</button>'}).join('')+'</div>'+ 
   '<div class="yt-heading"><h1>Recommended</h1><button class="btn btn-primary btn-sm" type="button" data-share-video>Share video</button></div>'+ 
   '<div class="feed-list" id="homeFeed"></div></main>';
  paintCategories();paintFeed();requestVideos(true);
}
document.addEventListener('click',function(e){
  var t=e.target.closest('#homeRoot [data-tab]');
  if(t){tab=t.dataset.tab;shown=STEP;requestVideos(true);return}
  var topicButton=e.target.closest('#homeRoot [data-topic]');
  if(topicButton){topic=topicButton.dataset.topic;shown=STEP;requestVideos(true);paintCategories();return}
  if(e.target.closest('[data-age-yes]')){ageSession=true;try{localStorage.setItem(AGE_KEY,'1')}catch(x){}requestVideos(true);return}
  if(e.target.closest('[data-share-video]')){location.hash='#/publish';return}
  if(e.target.closest('[data-video-retry]')){requestVideos(true);loadCategories();return}
  if(e.target.closest('#feedMore')){if(apiBusy)return;apiPage+=1;requestVideos(false);return}
  var video=e.target.closest('[data-api-video]');if(video){var v=apiItems[Number(video.dataset.apiVideo)];if(v)playVideo(v)}
});
var searchForm=$('#videoSearchForm'),searchInput=$('#videoSearch');
if(searchForm)searchForm.addEventListener('submit',function(e){e.preventDefault();if(C.view()==='home')requestVideos(true);else location.hash='#/'});
if(searchInput)searchInput.addEventListener('input',function(){clearTimeout(apiTimer);apiTimer=setTimeout(function(){if(C.view()==='home')requestVideos(true)},350)});
/* keep the side cards fresh without redrawing the feed */
window.addEventListener('aevy:presence',function(){if(C.view()!=='home')return;var o=$('#homeOnline');if(o)o.innerHTML=onlineHTML()});
setInterval(function(){if(C.view()!=='home')return;var o=$('#homeSuggest');if(o&&!o.querySelector('button:disabled'))o.innerHTML=suggestHTML()},60000);
window.addEventListener('aevy:following',function(){if(C.view()!=='home')return;var o=$('#homeSuggest');if(o)o.innerHTML=suggestHTML();if(tab==='following')paintFeed()});
window.AevyHome={render:render,suggest:suggestHTML,online:onlineHTML};
})();
