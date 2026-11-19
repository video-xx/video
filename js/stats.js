/* Aevy live layer: download / view / visitor counters, likes, reviews and per-post stats.
   Everything is pushed to every open browser through Supabase Realtime (one channel, see start()).
   Counters are changed only by the SQL functions in supabase/schema.sql, never directly by the browser. */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SB=window.AevySB&&window.AevySB.client;
if(!C||!A||!SB)return;
var esc=C.esc;
function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function num(n){return (n||0).toLocaleString()}

/* ---------- icons ---------- */
function ic(p,w){return '<svg width="'+(w||14)+'" height="'+(w||14)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'}
var I={
  dl:ic('<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14"/>'),
  eye:ic('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  heart:ic('<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.1 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/>'),
  star:ic('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>')
};

/* ---------- visitor id: random, anonymous, kept in this browser ---------- */
var vid='';
function uuid(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  var b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=b[6]&15|64;b[8]=b[8]&63|128;
  var h=Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2)}).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
try{vid=localStorage.getItem('aevy.vid')||'';if(!/^[0-9a-f-]{36}$/.test(vid)){vid=uuid();localStorage.setItem('aevy.vid',vid)}}catch(e){vid=vid||uuid()}

function rpc(name,args){
  return SB.rpc(name,args).then(function(r){if(r.error){console.warn('[aevy] '+name+': '+r.error.message);return null}return r.data},function(){return null});
}

/* ---------- today's numbers ---------- */
var today={day:'',visitors:0,views:0,downloads:0},ready=false;
function loadToday(){
  return rpc('get_today').then(function(d){if(d){today=d;ready=true;paintToday()}});
}
function bump(el){if(!el||window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump')}
function totalDownloads(){var n=0;C.vis().forEach(function(s){n+=s.downloads||0});return n}
function paintToday(){
  var vals={visitors:today.visitors,views:today.views,downloads:today.downloads,total:totalDownloads()};
  $$('[data-t]').forEach(function(el){
    var v=num(vals[el.dataset.t]);
    if(el.textContent!==v){var first=el.textContent==='-';el.textContent=v;if(!first)bump(el)}
  });
}
function liveStrip(){
  return '<div class="live-strip" role="group" aria-label="Live statistics"><div class="wrap live-grid">'+
   '<div class="live-tag"><span class="live-dot" aria-hidden="true"></span>Live today</div>'+
   '<div class="lv"><strong data-t="visitors">-</strong><span>Visitors</span></div>'+
   '<div class="lv"><strong data-t="views">-</strong><span>Script views</span></div>'+
   '<div class="lv"><strong data-t="downloads">-</strong><span>Downloads</span></div>'+
   '<div class="lv"><strong data-t="total">-</strong><span>Downloads all time</span></div>'+
   '</div></div>';
}
function injectStrips(){
  var home=$('#view-home .stats');if(home&&!$('#view-home .live-strip'))home.insertAdjacentHTML('afterend',liveStrip());
  var sc=$('#view-scripts .page-head');if(sc&&!$('#view-scripts .live-strip'))sc.insertAdjacentHTML('afterend',liveStrip());
}

/* ---------- tracking ---------- */
var viewed={};
function view(s){
  if(!s||viewed[s.id])return;viewed[s.id]=1;
  rpc('track_view',{sid:s.id,v:vid});
}
function downloaded(list){
  var ids=list.map(function(s){return s.id}).filter(Boolean);if(!ids.length)return;
  rpc('track_download',{ids:ids});
}

/* ---------- per-script counters on cards and in the dialog ---------- */
function rating(s){return s.rcount?s.rsum/s.rcount:0}
function cardStats(s){
  return '<div class="cstats" data-sid="'+esc(s.id)+'">'+statsInner(s)+'</div>';
}
function statsInner(s){
  var r=rating(s);
  return '<span class="cs" title="Views"><b>'+num(s.views)+'</b> views</span>'+
   '<span class="cs" title="Downloads"><b>'+num(s.downloads)+'</b> downloads</span>'+
   (r?'<span class="cs on" title="'+r.toFixed(1)+' average from '+s.rcount+' review'+(s.rcount===1?'':'s')+'"><b>'+r.toFixed(1)+'</b> &#9733;</span>':'');
}
function paintScript(s){
  $$('.cstats[data-sid="'+s.id+'"]').forEach(function(el){el.innerHTML=statsInner(s)});
  $$('.pc[data-lc="'+s.id+'"]').forEach(function(el){el.textContent=s.likes?num(s.likes):''});
  $$('.pact[data-act="like"][data-id="'+s.id+'"]').forEach(function(b){b.classList.toggle('on',!!mine[s.id]);b.setAttribute('aria-pressed',!!mine[s.id])});
  if(openS&&openS.id===s.id)paintSocialBar();
  paintToday();
}

/* ---------- likes ---------- */
var mine={};   /* script id -> true for the scripts the signed-in user likes */
function loadMine(){
  mine={};var m=A.current();if(!m)return Promise.resolve();
  return SB.from('script_likes').select('script_id').eq('owner',m.id).limit(2000).then(function(r){
    (r.data||[]).forEach(function(x){mine[x.script_id]=true});
  },function(){});
}
function toggleLike(s,btn){
  var m=A.current();
  if(!m){C.toast('Sign in to like scripts');location.hash='#/auth';var d=$('#dlg');if(d&&d.open)d.close();return}
  var on=!mine[s.id];btn.disabled=true;
  mine[s.id]=on;s.likes=Math.max(0,(s.likes||0)+(on?1:-1));paintScript(s);
  var q=on?SB.from('script_likes').insert({script_id:s.id,owner:m.id}):SB.from('script_likes').delete().eq('script_id',s.id).eq('owner',m.id);
  q.then(function(r){
    btn.disabled=false;
    if(r.error&&!(on&&r.error.code==='23505')){mine[s.id]=!on;s.likes=Math.max(0,(s.likes||0)+(on?-1:1));paintScript(s);C.toast(r.error.message||'Could not save your like')}
  },function(){btn.disabled=false;mine[s.id]=!on;paintScript(s);C.toast('Could not reach the server')});
}

/* ---------- reviews and comments (dialog) ---------- */
var openS=null,comments=[],pickRating=0;
function who(id){return A.byId(id)}
function avatar(u,sz){
  if(u&&window.AevyEco)return window.AevyEco.avatar(u,sz);
  return '<span class="avatar" style="--c:#3b424d;width:'+sz+'px;height:'+sz+'px;font-size:'+Math.round(sz*.42)+'px">?</span>';
}
function ago(t){
  var s=Math.max(0,(Date.now()-t)/1000);
  if(s<45)return 'just now';
  if(s<3600)return Math.round(s/60)+' min ago';
  if(s<86400)return Math.round(s/3600)+' h ago';
  if(s<86400*7)return Math.round(s/86400)+' d ago';
  return C.fmtDate(t);
}
function stars(n){var o='';for(var i=1;i<=5;i++)o+='<span class="st'+(i<=n?' on':'')+'">'+I.star+'</span>';return '<span class="stars" aria-label="'+n+' out of 5">'+o+'</span>'}
function mineReview(){var m=A.current();return !!m&&comments.some(function(c){return c.owner===m.id&&c.rating})}
function row(r){return {id:r.id,script_id:r.script_id,owner:r.owner,body:r.body,rating:r.rating||0,t:Date.parse(r.created)||Date.now()}}

function paintSocialBar(){
  var s=openS,bar=$('#socBar');if(!s||!bar)return;
  var r=rating(s),liked=!!mine[s.id];
  bar.innerHTML=
   '<button class="btn like'+(liked?' on':'')+'" id="likeBtn" aria-pressed="'+liked+'">'+I.heart+'<span>'+(liked?'Liked':'Like')+'</span><b>'+num(s.likes)+'</b></button>'+
   '<span class="sb">'+I.dl+'<b>'+num(s.downloads)+'</b> downloads</span>'+
   '<span class="sb">'+I.eye+'<b>'+num(s.views)+'</b> views</span>'+
   '<span class="sb">'+(r?stars(Math.round(r))+'<b>'+r.toFixed(1)+'</b> ('+s.rcount+')':I.star+'No reviews yet')+'</span>';
  $('#likeBtn').onclick=function(){toggleLike(s,this)};
}
function composer(){
  var s=openS,m=A.current(),box=$('#socForm');if(!box)return;
  if(!m){box.innerHTML='<p class="note nm"><a href="#/auth" data-close><u>Sign in</u></a> to like, review and comment.</p>';return}
  var own=C.isOwner(s),canRate=!own&&!mineReview();
  box.innerHTML='<form id="cForm" class="cmp">'+avatar(m,38)+'<div class="cmp-main">'+
   (canRate?'<div class="rate" role="radiogroup" aria-label="Your rating">'+[1,2,3,4,5].map(function(i){return '<button type="button" class="rt" role="radio" aria-checked="false" data-r="'+i+'" aria-label="'+i+' star'+(i>1?'s':'')+'">'+I.star.replace(/width="14" height="14"/,'width="20" height="20"')+'</button>'}).join('')+'<span class="rhint" id="rHint">Rate this script (optional)</span></div>':
    '<p class="cmp-note">'+(own?'You can reply to your community, but not rate your own script.':'You already reviewed this script. You can still comment.')+'</p>')+
   '<textarea class="field" id="cBody" maxlength="600" rows="2" placeholder="'+(canRate?'Share your experience with this script...':'Add a comment...')+'"></textarea>'+
   '<div class="crow"><span class="cmp-count" id="cCount">0 / 600</span><span class="ferr" id="cErr" role="alert"></span><button class="btn btn-primary btn-sm" type="submit">Post</button></div></div></form>';
  pickRating=0;
  var f=$('#cForm');
  $('#cBody').oninput=function(){$('#cCount').textContent=this.value.length+' / 600'};
  $$('.rt',f).forEach(function(b){b.onclick=function(){
    pickRating=pickRating===+b.dataset.r?0:+b.dataset.r;
    $$('.rt',f).forEach(function(x){var on=+x.dataset.r<=pickRating;x.classList.toggle('on',on);x.setAttribute('aria-checked',+x.dataset.r===pickRating)});
    $('#rHint').textContent=pickRating?['','Poor','Fair','Good','Very good','Excellent'][pickRating]:'Rate this script (optional)';
  }});
  f.onsubmit=function(e){
    e.preventDefault();
    var body=$('#cBody').value.trim(),err=$('#cErr'),btn=f.querySelector('[type=submit]');err.textContent='';
    if(!body){err.textContent='Write something first';return}
    btn.disabled=true;
    var payload={script_id:s.id,owner:m.id,body:body};if(pickRating)payload.rating=pickRating;
    SB.from('script_comments').insert(payload).select('*').single().then(function(r){
      btn.disabled=false;
      if(r.error){err.textContent=r.error.code==='23505'?'You already reviewed this script':(r.error.message||'Could not post');return}
      addComment(row(r.data),true);composer();
    },function(){btn.disabled=false;err.textContent='Cannot reach the server'});
  };
}
function commentHTML(c,fresh){
  var u=who(c.owner),m=A.current(),canDel=m&&(c.owner===m.id||A.isAdmin()||(openS&&C.isOwner(openS)));
  return '<li class="cmt'+(fresh?' fresh':'')+'" data-cid="'+esc(c.id)+'">'+avatar(u,40)+
   '<div class="cbody"><div class="ch">'+(u?'<a class="cn" href="#/u/'+esc(u.username)+'" data-close>'+esc(u.name)+'</a>'+(window.AevyBadge?AevyBadge.html(u):''):'<span class="cn">Member</span>')+
   '<time>'+ago(c.t)+'</time>'+(canDel?'<button class="cdel" data-del="'+esc(c.id)+'" aria-label="Delete">Delete</button>':'')+'</div>'+
   (c.rating?'<div class="cr">'+stars(c.rating)+'<span class="badge">Review</span></div>':'')+
   '<p>'+esc(c.body)+'</p></div></li>';
}
function paintComments(){
  var ul=$('#cList');if(!ul)return;
  $('#cTitle').textContent=comments.length?comments.length+(comments.length===1?' comment':' comments'):'Comments';
  ul.innerHTML=comments.length?comments.map(function(c){return commentHTML(c)}).join(''):'<li class="cempty">No reviews yet. Be the first to share your thoughts.</li>';
}
function addComment(c,fresh){
  if(!openS||c.script_id!==openS.id)return;
  if(comments.some(function(x){return x.id===c.id}))return;
  comments.unshift(c);
  comments.sort(function(a,b){return b.t-a.t});
  var ul=$('#cList');if(!ul)return;
  if($('.cempty',ul))ul.innerHTML='';
  var li=document.createElement('div');li.innerHTML=commentHTML(c,true);
  var idx=comments.indexOf(c),ref=ul.children[idx];
  if(ref)ul.insertBefore(li.firstChild,ref);else ul.appendChild(li.firstChild);
  $('#cTitle').textContent=comments.length+(comments.length===1?' comment':' comments');
  if(!who(c.owner))A.refreshProfiles().then(paintComments);
}
function removeComment(id){
  comments=comments.filter(function(c){return c.id!==id});
  if(openS)paintComments();composer();
}
function mount(s){
  var box=$('#social');if(!box)return;
  openS=s;comments=[];
  box.innerHTML='<section class="social"><div class="soc-bar" id="socBar"></div>'+
   '<div class="soc-head"><h3 id="cTitle">Comments</h3><span class="live-tag sm"><span class="live-dot"></span>Live</span></div>'+
   '<div id="socForm"></div><ul class="cmts" id="cList"><li class="cempty">Loading...</li></ul></section>';
  paintSocialBar();composer();
  SB.from('script_comments').select('*').eq('script_id',s.id).order('created',{ascending:false}).limit(100).then(function(r){
    if(!openS||openS.id!==s.id)return;
    if(r.error){$('#cList').innerHTML='<li class="cempty">Reviews are not available yet. Run the latest supabase/schema.sql.</li>';return}
    comments=r.data.map(row);
    var miss=comments.some(function(c){return !who(c.owner)});
    (miss?A.refreshProfiles():Promise.resolve()).then(function(){if(openS&&openS.id===s.id){paintComments();composer()}});
  },function(){});
}
document.addEventListener('click',function(e){
  var d=e.target.closest('[data-del]');if(!d||!openS)return;
  if(!confirm('Delete this comment?'))return;
  var id=d.dataset.del;d.disabled=true;
  SB.from('script_comments').delete().eq('id',id).select('id').then(function(r){
    if(r.error||!r.data||!r.data.length){d.disabled=false;C.toast('Could not delete');return}
    removeComment(id);
  });
});
(function(){var dlg=$('#dlg');if(dlg)dlg.addEventListener('close',function(){openS=null;comments=[]})})();

/* ---------- Live activity helpers ---------- */
var feed=[],FEED_MAX=40;

function fItem(f){
  var s=C.byId(f.sid);if(!s||s.vis!=='public')return '';   /* the public feed never shows private scripts */
  var u=who(f.owner),nm=u?esc(u.name)+(window.AevyBadge?AevyBadge.html(u):''):'Someone',link='<a href="#" data-open="'+esc(s.id)+'"><b>'+esc(s.title)+'</b></a>',txt='';
  if(f.k==='script')txt=nm+' published '+link;
  if(f.k==='like')txt=nm+' liked '+link;
  if(f.k==='review')txt=nm+' reviewed '+link+' '+stars(f.rating);
  if(f.k==='comment')txt=nm+' commented on '+link;
  return '<li class="fi'+(f.fresh?' fresh':'')+'" data-k="'+f.k+'">'+avatar(u,32)+'<div><p>'+txt+'</p>'+(f.body?'<q>'+esc(f.body.length>140?f.body.slice(0,140)+'...':f.body)+'</q>':'')+'<time>'+ago(f.t)+'</time></div></li>';
}
function comActive(){return sec.classList.contains('active')}
function paintFeed(){
  var ol=$('#feed'),items=feed.map(fItem).filter(Boolean);
  ol.innerHTML=items.length?items.join(''):'<li class="cempty">Nothing yet. Publish a script or leave the first review.</li>';
  feed.forEach(function(f){f.fresh=false});
}
function paintTop(){
  var v=C.vis();
  function list(arr,fn){return arr.length?arr.map(function(s,i){return '<li><span class="rk">'+(i+1)+'</span><a href="#" data-open="'+esc(s.id)+'">'+esc(s.title)+'</a><em>'+fn(s)+'</em></li>'}).join(''):'<li class="cempty">Nothing yet</li>'}
  var dl=v.filter(function(s){return s.downloads>0}).sort(function(a,b){return b.downloads-a.downloads}).slice(0,5);
  var rt=v.filter(function(s){return s.rcount>0}).sort(function(a,b){return rating(b)-rating(a)||b.rcount-a.rcount}).slice(0,5);
  $('#topDl').innerHTML=list(dl,function(s){return num(s.downloads)+' dl'});
  $('#topRated').innerHTML=list(rt,function(s){return rating(s).toFixed(1)+' ('+s.rcount+')'});
}
function pushFeed(f){
  if(feed.some(function(x){return x.k===f.k&&x.id===f.id}))return;
  f.fresh=true;feed.unshift(f);feed.sort(function(a,b){return b.t-a.t});feed=feed.slice(0,FEED_MAX);
  if(comActive())paintFeed();
  if(!who(f.owner))A.refreshProfiles().then(function(){if(comActive())paintFeed()});
}
var feedLoaded=false;
function loadFeed(){
  if(feedLoaded)return;feedLoaded=true;
  Promise.all([
    SB.from('script_comments').select('*').order('created',{ascending:false}).limit(25),
    SB.from('script_likes').select('*').order('created',{ascending:false}).limit(25)
  ]).then(function(r){
    var out=[];
    C.vis().forEach(function(s){if(s.vis==='public')out.push({k:'script',id:s.id,sid:s.id,owner:s.owner,t:s.created})});
    ((r[0].data)||[]).forEach(function(c){out.push({k:c.rating?'review':'comment',id:c.id,sid:c.script_id,owner:c.owner,body:c.body,rating:c.rating,t:Date.parse(c.created)})});
    ((r[1].data)||[]).forEach(function(l){out.push({k:'like',id:l.script_id+l.owner,sid:l.script_id,owner:l.owner,t:Date.parse(l.created)})});
    out.sort(function(a,b){return b.t-a.t});feed=out.slice(0,FEED_MAX);
    return A.refreshProfiles();
  }).then(function(){if(comActive()){paintFeed();paintTop()}},function(){feedLoaded=false});
}
sec.addEventListener('click',function(e){
  var a=e.target.closest('[data-open]');
  if(a)e.preventDefault();   /* the global click handler in app.js opens the script */
});

/* ---------- realtime: one channel for everything ---------- */
function onScript(p){
  var n=p.new,o=p.old;
  if(p.eventType==='DELETE'){if(o&&o.id)C.drop(o.id);return}
  if(!n)return;
  var known=C.byId(n.id),s=window.AevyDB.toScript(n);
  if(!known){
    if(n.vis==='public'||C.isOwner(s)){C.upsert(s);if(n.vis==='public')pushFeed({k:'script',id:s.id,sid:s.id,owner:s.owner,t:s.created})}
    return;
  }
  if(known.updated!==s.updated){C.upsert(s);return}   /* the publisher edited it elsewhere */
  known.downloads=s.downloads;known.views=s.views;known.likes=s.likes;known.rsum=s.rsum;known.rcount=s.rcount;
  paintScript(known);
  if(comActive())paintTop();
}
function onComment(p){
  if(p.eventType==='DELETE'){var id=p.old&&p.old.id;if(id){removeComment(id);feed=feed.filter(function(f){return f.id!==id});if(comActive())paintFeed()}return}
  var c=p.new;if(!c)return;
  addComment(row(c),false);
  pushFeed({k:c.rating?'review':'comment',id:c.id,sid:c.script_id,owner:c.owner,body:c.body,rating:c.rating,t:Date.parse(c.created)||Date.now()});
}
function onLike(p){
  var l=p.new;
  if(p.eventType==='INSERT'&&l){var m=A.current();if(!(m&&l.owner===m.id))pushFeed({k:'like',id:l.script_id+l.owner,sid:l.script_id,owner:l.owner,t:Date.parse(l.created)||Date.now()})}
}
function onDaily(p){
  var n=p.new;if(!n)return;
  if(today.day&&n.day!==today.day){loadToday();return}
  today={day:n.day,visitors:n.visitors,views:n.views,downloads:n.downloads};paintToday();
}
var ch=null;
function start(){
  if(ch)return;
  ch=SB.channel('aevy-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'scripts'},onScript)
    .on('postgres_changes',{event:'*',schema:'public',table:'script_comments'},onComment)
    .on('postgres_changes',{event:'*',schema:'public',table:'script_likes'},onLike)
    .on('postgres_changes',{event:'*',schema:'public',table:'daily_stats'},onDaily)
    .subscribe();
}

/* ---------- boot ---------- */
function render(h){
  injectStrips();paintToday();
}
window.AevyStats={like:toggleLike,liked:function(id){return !!mine[id]},cardStats:cardStats,view:view,downloaded:downloaded,mount:mount,render:render};

A.ready.then(function(){
  rpc('track_visit',{v:vid}).then(loadToday);
  loadMine().then(function(){C.all().forEach(paintScript);$$('.like').length&&paintSocialBar()});
  start();
});
window.addEventListener('aevy:auth',function(){loadMine().then(function(){C.all().forEach(paintScript);if(openS){paintSocialBar();composer();paintComments()}})});
/* safety nets: refresh today's numbers after a rollover or a dropped connection, and keep "x min ago" honest */
setInterval(function(){if(!document.hidden)loadToday()},60000);
document.addEventListener('visibilitychange',function(){if(!document.hidden&&ready)loadToday()});
setInterval(function(){if(comActive()&&!document.hidden)paintFeed()},60000);
})();
