/* Aevy photos + activity (mobile-first, Instagram-style):
   - Create: pick or take a photo, crop (1:1 / 4:5 / original), filters, brightness / contrast, caption, share.
   - Photo feed on Home, Photos tab on every profile (3-column grid), full viewer with double-tap like and comments.
   - Activity tab (#/activity): follows, likes and comments on your photos and scripts, with an unread dot.
   Needs the v9 part of supabase/schema.sql (posts.image, Storage bucket "posts", get_activity()). */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SBW=window.AevySB;
if(!C||!A||!SBW)return;
var SB=SBW.client,esc=C.esc;
var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var HEART='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 4.8 6.9 4.8c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.3 0 5.2 3.2 4.1 6.4-1.7 4.7-9.2 9.3-9.2 9.3z"/></svg>';
var CMT='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.5-4.4A8.5 8.5 0 1 1 20.5 11.5z"/></svg>';
var SHARE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/></svg>';
var DOTS='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>';
var PLUS='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8v8M8 12h8"/></svg>';
function me(){return A.current()}
function isG(){var u=me();return !u||!!u.guest}
function av(u,n){return window.AevyEco&&u?AevyEco.avatar(u,n):'<span class="avatar" style="width:'+n+'px;height:'+n+'px">?</span>'}
function badge(u){return window.AevyBadge&&u?AevyBadge.html(u):''}
function safe(u){return /^https:\/\//i.test(u||'')?u:''}
function ago(t){var s=Math.max(0,(Date.now()-t)/1000);if(s<60)return 'now';if(s<3600)return Math.round(s/60)+'m';if(s<86400)return Math.round(s/3600)+'h';if(s<604800)return Math.round(s/86400)+'d';return C.fmtDate(t)}
function ts(x){var n=Date.parse(x);return isNaN(n)?Date.now():n}
function needAccount(){
  if(!me()){location.hash='#/auth';return true}
  if(me().guest){if(window.AevyGuest)AevyGuest.prompt();else C.toast('Create an account to do this');return true}
  return false;
}
function fail(e){
  var m=String((e&&e.message)||e||'');
  if(/bucket not found/i.test(m))m='Photo storage is not set up. Run the latest supabase/schema.sql in Supabase';
  else if(/column .*image|schema cache|42703|PGRST204/i.test(m+((e&&e.code)||'')))m='Photos are not set up. Run the latest supabase/schema.sql in Supabase';
  else if(/row-level security|not authorized/i.test(m))m='Not allowed. Guests cannot post photos';
  C.toast(m||'Something went wrong');
}

/* ---------- data ---------- */
var feed=[],liked={},loaded=false,cache={};
var PCOLS='id,owner,body,image,likes,comments,created';
function norm(r){return {id:r.id,owner:r.owner,body:r.body||'',image:safe(r.image),likes:r.likes||0,comments:r.comments||0,created:ts(r.created)}}
function remember(list){list.forEach(function(p){cache[p.id]=p})}
function loadMine(){
  liked={};if(!me())return Promise.resolve();
  return SB.from('post_likes').select('post_id').eq('owner',me().id).limit(2000).then(function(r){(r.data||[]).forEach(function(x){liked[x.post_id]=1})},function(){});
}
function loadFeed(){
  return SB.from('posts').select(PCOLS).neq('image','').order('created',{ascending:false}).limit(30).then(function(r){
    if(r.error)throw r.error;
    feed=(r.data||[]).map(norm).filter(function(p){return p.image});remember(feed);loaded=true;
  }).then(loadMine);
}

/* ---------- feed cards ---------- */
function cardHTML(p){
  var u=A.byId(p.owner),on=!!liked[p.id],mineP=me()&&p.owner===me().id;
  return '<article class="ph-card" data-pid="'+esc(p.id)+'">'+
   '<header class="ph-h"><a class="ph-who" href="#/u/'+esc(u?u.username:'')+'">'+av(u,34)+'<b>'+esc(u?u.username:'user')+badge(u)+'</b></a><span class="ph-t">'+ago(p.created)+'</span>'+
   (mineP||A.isAdmin()?'<button type="button" class="ph-ic" data-pdel="'+esc(p.id)+'" aria-label="Delete post">'+DOTS+'</button>':'')+'</header>'+
   '<div class="ph-img" data-pdbl="'+esc(p.id)+'"><img src="'+esc(p.image)+'" alt="Photo by '+esc(u?u.username:'user')+'" loading="lazy" decoding="async"><i class="ph-pop">'+HEART+'</i></div>'+
   '<div class="ph-acts"><button type="button" class="ph-ic ph-like'+(on?' on':'')+'" data-plk="'+esc(p.id)+'" aria-pressed="'+on+'" aria-label="Like">'+HEART+'</button>'+
   '<button type="button" class="ph-ic" data-pcm="'+esc(p.id)+'" aria-label="Comments">'+CMT+'</button>'+
   '<button type="button" class="ph-ic" data-psh="'+esc(p.id)+'" aria-label="Share">'+SHARE+'</button></div>'+
   '<p class="ph-likes"><b data-plc>'+p.likes.toLocaleString()+'</b> '+(p.likes===1?'like':'likes')+'</p>'+
   (p.body?'<p class="ph-cap"><b>'+esc(u?u.username:'user')+'</b> '+esc(p.body)+'</p>':'')+
   (p.comments?'<button type="button" class="ph-vc" data-pcm="'+esc(p.id)+'">View all '+p.comments+' comment'+(p.comments===1?'':'s')+'</button>':'<button type="button" class="ph-vc" data-pcm="'+esc(p.id)+'">Add a comment...</button>')+
  '</article>';
}
function newBar(){
  var m=me();
  return '<div class="ph-new">'+(m?av(m,40):'<span class="avatar" style="width:40px;height:40px">A</span>')+'<button type="button" class="ph-newin" data-newphoto>Share a photo'+(m&&!m.guest?', '+esc(m.name.split(' ')[0]):'')+'...</button><button type="button" class="btn btn-primary btn-sm" data-newphoto>'+PLUS+'Photo</button></div>';
}
function paintFeed(){
  var box=$('#photoFeed');if(!box)return;
  box.innerHTML=newBar()+(feed.length?feed.map(cardHTML).join(''):(loaded?'<p class="ph-empty">No photos yet. Be the first to share one.</p>':'<p class="ph-empty">Loading photos...</p>'));
}
function refreshFeed(){
  return loadFeed().then(paintFeed,function(e){
    loaded=true;paintFeed();
    if(/image|schema|42703|PGRST/i.test(String((e&&e.message)||'')+((e&&e.code)||'')))console.warn('Photos need the latest supabase/schema.sql');
  });
}
function inject(){
  var mid=$('#homeRoot .hs-mid');if(!mid||$('#photoFeed',mid))return;
  var s=document.createElement('section');s.id='photoFeed';s.className='ph-feed';s.setAttribute('aria-label','Photos');
  var comp=$('.composer',mid);
  if(comp&&comp.nextSibling)mid.insertBefore(s,comp.nextSibling);else mid.insertBefore(s,mid.firstChild);
  paintFeed();
  if(!loaded)refreshFeed();else loadMine().then(paintFeed);
}
var root=document.getElementById('homeRoot');
if(root)new MutationObserver(inject).observe(root,{childList:true});

/* ---------- like / delete / share ---------- */
function setCount(id,n){
  $$('[data-pid="'+id+'"] [data-plc]').forEach(function(b){b.textContent=n.toLocaleString();b.parentNode.lastChild.textContent=n===1?' like':' likes'});
  $$('.ph-v [data-vlikes]').forEach(function(b){if(b.dataset.vlikes===id)b.innerHTML='<b>'+n.toLocaleString()+'</b> '+(n===1?'like':'likes')});
}
function paintLike(id){
  var on=!!liked[id];
  $$('[data-plk="'+id+'"],[data-vplk="'+id+'"]').forEach(function(b){b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
}
function toggleLike(id,force){
  if(needAccount())return;
  var p=cache[id];if(!p)return;
  var on=force!=null?force:!liked[id];if(!!liked[id]===on)return;
  liked[id]=on?1:0;if(!on)delete liked[id];
  p.likes=Math.max(0,p.likes+(on?1:-1));paintLike(id);setCount(id,p.likes);
  var q=on?SB.from('post_likes').insert({post_id:id,owner:me().id}):SB.from('post_likes').delete().eq('post_id',id).eq('owner',me().id);
  q.then(function(r){
    if(r.error&&!(on&&r.error.code==='23505')){if(on)delete liked[id];else liked[id]=1;p.likes=Math.max(0,p.likes+(on?-1:1));paintLike(id);setCount(id,p.likes);fail(r.error)}
  },function(e){if(on)delete liked[id];else liked[id]=1;p.likes=Math.max(0,p.likes+(on?-1:1));paintLike(id);setCount(id,p.likes);fail(e)});
}
function delPost(id){
  var p=cache[id];if(!p||!confirm('Delete this photo?'))return;
  SB.from('posts').delete().eq('id',id).then(function(r){
    if(r.error){fail(r.error);return}
    var m=/\/posts\/(.+?)(\?|$)/.exec(p.image);if(m)SB.storage.from('posts').remove([decodeURIComponent(m[1])]).then(function(){},function(){});
    feed=feed.filter(function(x){return x.id!==id});delete cache[id];closeViewer();paintFeed();
    if(prof&&$('#ppPane'))prof.paint();
    C.toast('Photo deleted');
  },fail);
}
function share(id){
  var url=location.origin+location.pathname+'#/u/'+((A.byId(cache[id]&&cache[id].owner)||{}).username||'');
  if(navigator.share){navigator.share({title:'Photo on Aevy',url:url}).catch(function(){});return}
  (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(url):Promise.reject()).then(function(){C.toast('Link copied')},function(){window.prompt('Copy this link',url)});
}
document.addEventListener('click',function(e){
  var t;
  if((t=e.target.closest('[data-plk],[data-vplk]'))){toggleLike(t.dataset.plk||t.dataset.vplk);return}
  if((t=e.target.closest('[data-pcm]'))){openViewer(t.dataset.pcm,true);return}
  if((t=e.target.closest('[data-psh]'))){share(t.dataset.psh);return}
  if((t=e.target.closest('[data-pdel]'))){delPost(t.dataset.pdel);return}
  if((t=e.target.closest('[data-pgrid]'))){openViewer(t.dataset.pgrid);return}
  if(e.target.closest('[data-newphoto]')){openCreate();return}
});
/* double-tap the picture to like it */
var lastTap={id:'',t:0};
function dbl(el){
  var id=el.dataset.pdbl,now=Date.now();
  if(lastTap.id===id&&now-lastTap.t<350){
    var pop=$('.ph-pop',el);if(pop){pop.classList.remove('go');void pop.offsetWidth;pop.classList.add('go')}
    if(!liked[id])toggleLike(id,true);else if(needAccount()){}
    lastTap.t=0;return;
  }
  lastTap={id:id,t:now};
}
document.addEventListener('click',function(e){var el=e.target.closest('[data-pdbl]');if(el)dbl(el)});

/* ---------- viewer (full post + comments) ---------- */
var viewer=null;
function closeViewer(){if(viewer){viewer.remove();viewer=null;document.body.classList.remove('ph-lock')}}
function fetchPost(id){
  if(cache[id])return Promise.resolve(cache[id]);
  return SB.from('posts').select(PCOLS).eq('id',id).maybeSingle().then(function(r){if(r.error||!r.data)throw new Error('This photo is no longer available');var p=norm(r.data);cache[id]=p;return p});
}
function commentHTML(c){
  var u=A.byId(c.owner),mineC=me()&&(c.owner===me().id||A.isAdmin());
  return '<li class="ph-c" data-cid="'+esc(c.id)+'">'+av(u,32)+'<div><p><b>'+esc(u?u.username:'guest')+'</b> '+esc(c.body)+'</p><small>'+ago(ts(c.created))+'</small></div>'+(mineC?'<button type="button" class="ph-cx" data-cdel="'+esc(c.id)+'" aria-label="Delete comment">&times;</button>':'')+'</li>';
}
function openViewer(id,focus){
  closeViewer();
  fetchPost(id).then(function(p){
    var u=A.byId(p.owner),on=!!liked[p.id];
    viewer=document.createElement('div');viewer.className='ph-v';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');
    viewer.innerHTML='<div class="ph-vbar"><button type="button" class="ph-ic" data-vclose aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><b>Photo</b><span></span></div>'+
     '<div class="ph-vbody"><header class="ph-h"><a class="ph-who" href="#/u/'+esc(u?u.username:'')+'" data-vclose>'+av(u,34)+'<b>'+esc(u?u.username:'user')+badge(u)+'</b></a><span class="ph-t">'+ago(p.created)+'</span>'+
     (me()&&(p.owner===me().id||A.isAdmin())?'<button type="button" class="ph-ic" data-pdel="'+esc(p.id)+'" aria-label="Delete post">'+DOTS+'</button>':'')+'</header>'+
     '<div class="ph-img" data-pdbl="'+esc(p.id)+'"><img src="'+esc(p.image)+'" alt="Photo"><i class="ph-pop">'+HEART+'</i></div>'+
     '<div class="ph-acts"><button type="button" class="ph-ic ph-like'+(on?' on':'')+'" data-vplk="'+esc(p.id)+'" aria-pressed="'+on+'" aria-label="Like">'+HEART+'</button><button type="button" class="ph-ic" id="phFocus" aria-label="Comment">'+CMT+'</button><button type="button" class="ph-ic" data-psh="'+esc(p.id)+'" aria-label="Share">'+SHARE+'</button></div>'+
     '<p class="ph-likes" data-vlikes="'+esc(p.id)+'"><b>'+p.likes.toLocaleString()+'</b> '+(p.likes===1?'like':'likes')+'</p>'+
     (p.body?'<p class="ph-cap"><b>'+esc(u?u.username:'user')+'</b> '+esc(p.body)+'</p>':'')+
     '<ul class="ph-cl" id="phCl"><li class="ph-empty">Loading comments...</li></ul></div>'+
     '<form class="ph-cf" id="phCf" autocomplete="off">'+(me()?av(me(),30):'')+'<input class="field" id="phCi" maxlength="500" placeholder="Add a comment..." aria-label="Add a comment"><button class="ph-post" type="submit">Post</button></form>';
    document.body.appendChild(viewer);document.body.classList.add('ph-lock');
    viewer.addEventListener('click',function(e){if(e.target.closest('[data-vclose]'))closeViewer()});
    var cl=$('#phCl',viewer);
    function paint(list){cl.innerHTML=list.length?list.map(commentHTML).join(''):'<li class="ph-empty">No comments yet.</li>'}
    var list=[];
    SB.from('post_comments').select('id,owner,body,created').eq('post_id',p.id).order('created',{ascending:true}).limit(150).then(function(r){list=r.data||[];paint(list)},function(){cl.innerHTML='<li class="ph-empty">Could not load comments</li>'});
    $('#phFocus',viewer).onclick=function(){if(!needAccount())$('#phCi',viewer).focus()};
    $('#phCf',viewer).onsubmit=function(ev){
      ev.preventDefault();if(needAccount())return;
      var inp=$('#phCi',viewer),body=inp.value.trim();if(!body)return;
      var btn=$('.ph-post',viewer);btn.disabled=true;
      SB.from('post_comments').insert({post_id:p.id,owner:me().id,body:body}).select('id,owner,body,created').single().then(function(r){
        btn.disabled=false;if(r.error){fail(r.error);return}
        list.push(r.data);paint(list);inp.value='';p.comments=list.length;paintFeed();
      },function(e){btn.disabled=false;fail(e)});
    };
    cl.addEventListener('click',function(ev){
      var d=ev.target.closest('[data-cdel]');if(!d)return;
      SB.from('post_comments').delete().eq('id',d.dataset.cdel).then(function(r){if(r.error){fail(r.error);return}list=list.filter(function(c){return c.id!==d.dataset.cdel});p.comments=list.length;paint(list);paintFeed()});
    });
    if(focus&&me()&&!me().guest)setTimeout(function(){var i=$('#phCi',viewer);if(i)i.focus()},50);
  },function(e){C.toast(e.message||'Could not open the photo')});
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeViewer();closeCreate()}});

/* ---------- profile Photos tab ---------- */
var prof=null;
function pane(u,own,el){
  prof={paint:function(){pane(u,own,el)}};
  el.innerHTML='<p class="ph-empty">Loading photos...</p>';
  SB.from('posts').select(PCOLS).eq('owner',u.id).neq('image','').order('created',{ascending:false}).limit(120).then(function(r){
    if(r.error)throw r.error;
    var list=(r.data||[]).map(norm).filter(function(p){return p.image});remember(list);
    if(!$('#ppPane')||$('#ppPane')!==el)return;
    el.innerHTML=(own&&!isG()?'<div class="ph-new">'+av(u,40)+'<button type="button" class="ph-newin" data-newphoto>Share a photo...</button><button type="button" class="btn btn-primary btn-sm" data-newphoto>'+PLUS+'Photo</button></div>':'')+
     (list.length?'<div class="ph-grid">'+list.map(function(p){return '<button type="button" class="ph-tile" data-pgrid="'+esc(p.id)+'" aria-label="Open photo"><img src="'+esc(p.image)+'" alt="" loading="lazy" decoding="async"><span class="ph-ov"><i>'+HEART+'</i>'+p.likes+' <i>'+CMT+'</i>'+p.comments+'</span></button>'}).join('')+'</div>':
     '<div class="empty"><h3>'+(own?'Share your first photo':'No photos yet')+'</h3><p>'+(own?'Photos you share appear here as a grid.':'Check back later.')+'</p>'+(own&&!isG()?'<button type="button" class="btn btn-primary" data-newphoto>Share a photo</button>':'')+'</div>');
    loadMine();
  }).then(null,function(e){el.innerHTML='<div class="empty"><h3>Photos are not set up yet</h3><p>Run the latest supabase/schema.sql in Supabase.</p></div>';console.warn(e)});
}

/* ---------- create: choose, crop, filter, caption, share ---------- */
var FILTERS=[
  {n:'Normal'},{n:'Clarity',c:1.18,s:1.1},{n:'Warm',tr:14,tb:-14,s:1.12,br:1.03},{n:'Cool',tr:-12,tb:16,s:.96},
  {n:'Vivid',s:1.55,c:1.1},{n:'Fade',c:.86,fade:.14,s:.85},{n:'Mono',s:0,c:1.08},{n:'Noir',s:0,c:1.4,br:.92},{n:'Sepia',sepia:.85}
];
var RATIOS=[['sq','Square',1],['port','Portrait',4/5],['orig','Original',0]];
var cr=null;
function closeCreate(){if(cr){cr.el.remove();cr=null;document.body.classList.remove('ph-lock')}}
function crop(st,W){
  var b=st.bmp,bw=b.naturalWidth||b.width,bh=b.naturalHeight||b.height,r=st.ratio==='sq'?1:st.ratio==='port'?.8:Math.min(1.91,Math.max(.8,bw/bh));
  var sw=bw,sh=bw/r;if(sh>bh){sh=bh;sw=bh*r}
  return {sx:(bw-sw)/2,sy:(bh-sh)/2,sw:sw,sh:sh,W:W,H:Math.round(W*sh/sw)};
}
function paint(cv,st,W,f){
  var k=crop(st,W);cv.width=k.W;cv.height=k.H;
  var x=cv.getContext('2d',{willReadFrequently:true});
  x.drawImage(st.bmp,k.sx,k.sy,k.sw,k.sh,0,0,k.W,k.H);
  f=f||FILTERS[st.f];var br=(f.br||1)*(1+st.b/100),ct=(f.c||1)*(1+st.c/100),sat=f.s==null?1:f.s,fade=f.fade||0,sp=f.sepia||0,tr=f.tr||0,tb=f.tb||0;
  if(f.n==='Normal'&&!st.b&&!st.c)return;
  var d=x.getImageData(0,0,k.W,k.H),a=d.data;
  for(var i=0;i<a.length;i+=4){
    var r=a[i],g=a[i+1],b=a[i+2],y=.299*r+.587*g+.114*b;
    if(sp){var sr=.393*r+.769*g+.189*b,sg=.349*r+.686*g+.168*b,sb2=.272*r+.534*g+.131*b;r+=(sr-r)*sp;g+=(sg-g)*sp;b+=(sb2-b)*sp;y=.299*r+.587*g+.114*b}
    if(sat!==1){r=y+(r-y)*sat;g=y+(g-y)*sat;b=y+(b-y)*sat}
    r=(r-128)*ct+128;g=(g-128)*ct+128;b=(b-128)*ct+128;
    r=r*br+tr;g=g*br;b=b*br+tb;
    if(fade){r=r*(1-fade)+fade*70;g=g*(1-fade)+fade*70;b=b*(1-fade)+fade*80}
    a[i]=r<0?0:r>255?255:r;a[i+1]=g<0?0:g>255?255:g;a[i+2]=b<0?0:b>255?255:b;
  }
  x.putImageData(d,0,0);
}
function loadBitmap(file){
  if(window.createImageBitmap)return createImageBitmap(file,{imageOrientation:'from-image'}).catch(function(){return viaImg(file)});
  return viaImg(file);
}
function viaImg(file){
  return new Promise(function(ok,no){var u=URL.createObjectURL(file),i=new Image();i.onload=function(){URL.revokeObjectURL(u);ok(i.naturalWidth?{width:i.naturalWidth,height:i.naturalHeight,_i:i}:null);};i.onerror=function(){URL.revokeObjectURL(u);no(new Error('Could not read that image'))};i.src=u});
}
function openCreate(){
  if(needAccount())return;
  closeCreate();
  var el=document.createElement('div');el.className='ph-cr';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
  el.innerHTML='<div class="ph-vbar"><button type="button" class="ph-ic" data-cclose aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button><b>New photo</b><button type="button" class="ph-share" id="crShare" disabled>Share</button></div>'+
   '<div class="ph-cbody" id="crBody"><div class="ph-pick"><div class="ph-pickic">'+PLUS+'</div><h3>Choose a photo</h3><p>JPG, PNG or WebP. It is resized on your device before upload.</p>'+
   '<label class="btn btn-primary">Choose from gallery<input type="file" accept="image/*" id="crFile" hidden></label>'+
   '<label class="btn">Take a photo<input type="file" accept="image/*" capture="environment" id="crCam" hidden></label></div></div>';
  document.body.appendChild(el);document.body.classList.add('ph-lock');
  cr={el:el,st:null};
  el.addEventListener('click',function(e){if(e.target.closest('[data-cclose]'))closeCreate()});
  function got(f){
    if(!f)return;
    if(!/^image\//.test(f.type)){C.toast('Choose an image file');return}
    if(f.size>25*1024*1024){C.toast('That photo is too large (25 MB max)');return}
    $('#crBody',el).innerHTML='<p class="ph-empty">Opening photo...</p>';
    loadBitmap(f).then(function(bmp){
      if(!bmp)throw new Error('Could not read that image');
      var raw=bmp._i||bmp;
      cr.st={bmp:raw,ratio:'sq',f:0,b:0,c:0,cap:''};edit();
    },function(e){C.toast(e.message||'Could not open that photo');closeCreate()});
  }
  $('#crFile',el).onchange=function(){got(this.files[0])};
  $('#crCam',el).onchange=function(){got(this.files[0])};
}
function edit(){
  var el=cr.el,st=cr.st;
  $('#crBody',el).innerHTML='<div class="ph-stage"><canvas id="crCv"></canvas></div>'+
   '<div class="ph-seg" id="crRatio">'+RATIOS.map(function(r){return '<button type="button" data-r="'+r[0]+'" class="'+(r[0]===st.ratio?'on':'')+'">'+r[1]+'</button>'}).join('')+'</div>'+
   '<div class="ph-filters" id="crFilters">'+FILTERS.map(function(f,i){return '<button type="button" data-f="'+i+'" class="'+(i===st.f?'on':'')+'"><canvas width="64" height="64"></canvas><span>'+f.n+'</span></button>'}).join('')+'</div>'+
   '<div class="ph-adj"><label>Brightness<input type="range" id="crB" min="-40" max="40" value="'+st.b+'"></label><label>Contrast<input type="range" id="crC" min="-40" max="40" value="'+st.c+'"></label></div>'+
   '<label class="ph-capl">Caption<textarea class="field" id="crCap" rows="3" maxlength="1000" placeholder="Write a caption...">'+esc(st.cap)+'</textarea></label>';
  var cv=$('#crCv',el),q=0;
  function draw(){if(q)return;q=requestAnimationFrame(function(){q=0;paint(cv,st,Math.min(720,Math.max(320,el.clientWidth||540)))})}
  function thumbs(){$$('#crFilters button',el).forEach(function(b){
    var c=$('canvas',b),s2={bmp:st.bmp,ratio:'sq',f:0,b:0,c:0};paint(c,s2,64,FILTERS[+b.dataset.f]);
  })}
  draw();thumbs();
  $('#crRatio',el).onclick=function(e){var b=e.target.closest('[data-r]');if(!b)return;st.ratio=b.dataset.r;$$('#crRatio button',el).forEach(function(x){x.classList.toggle('on',x===b)});draw()};
  $('#crFilters',el).onclick=function(e){var b=e.target.closest('[data-f]');if(!b)return;st.f=+b.dataset.f;$$('#crFilters button',el).forEach(function(x){x.classList.toggle('on',x===b)});draw()};
  $('#crB',el).oninput=function(){st.b=+this.value;draw()};
  $('#crC',el).oninput=function(){st.c=+this.value;draw()};
  $('#crCap',el).oninput=function(){st.cap=this.value};
  var sh=$('#crShare',el);sh.disabled=false;sh.onclick=function(){publish(sh)};
}
function publish(btn){
  if(!cr||!cr.st||needAccount())return;
  var st=cr.st,m=me();btn.disabled=true;btn.textContent='Sharing...';
  var out=document.createElement('canvas');paint(out,st,Math.max(320,Math.min(1080,Math.floor(crop(st,1).sw))));
  function done(msg){btn.disabled=false;btn.textContent='Share';if(msg)fail(msg)}
  out.toBlob(function(blob){
    if(!blob){done(new Error('Could not process the photo'));return}
    var path=m.id+'/'+Date.now()+'.jpg';
    SB.storage.from('posts').upload(path,blob,{contentType:'image/jpeg',cacheControl:'31536000'}).then(function(r){
      if(r.error)throw r.error;
      var url=SB.storage.from('posts').getPublicUrl(path).data.publicUrl;
      return SB.from('posts').insert({owner:m.id,body:(st.cap||'').trim(),image:url}).select(PCOLS).single().then(function(r2){
        if(r2.error){SB.storage.from('posts').remove([path]).then(function(){},function(){});throw r2.error}
        return norm(r2.data);
      });
    }).then(function(p){
      cache[p.id]=p;feed.unshift(p);closeCreate();C.toast('Photo shared');
      if(location.hash==='#/'||location.hash===''){paintFeed();window.scrollTo(0,0)}else location.hash='#/';
    },function(e){done(e)});
  },'image/jpeg',.86);
}
/* the "+" buttons (bottom bar, header): choose Photo or Script */
var sheet=null;
function closeSheet(){if(sheet){sheet.remove();sheet=null}}
function openSheet(){
  closeSheet();
  sheet=document.createElement('div');sheet.className='ph-sheet';
  sheet.innerHTML='<div class="ph-sheet-b" role="dialog" aria-label="Create"><i class="ph-grab"></i><h3>Create</h3>'+
   '<button type="button" data-sh="photo"><span>'+PLUS+'</span><b>Photo post<small>Share a picture with filters</small></b></button>'+
   '<button type="button" data-sh="script"><span><svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/></svg></span><b>Script<small>Publish a CPM script</small></b></button>'+
   '<button type="button" class="ph-cancel" data-sh="x">Cancel</button></div>';
  document.body.appendChild(sheet);
  sheet.addEventListener('click',function(e){
    var b=e.target.closest('[data-sh]');
    if(!b){if(e.target===sheet)closeSheet();return}
    var k=b.dataset.sh;closeSheet();
    if(k==='photo')openCreate();
    if(k==='script')location.hash='#/publish';
  });
}
window.addEventListener('click',function(e){
  var a=e.target.closest('#tabbar a[data-route="publish"],.pub-top');
  if(!a)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!me()){location.hash='#/auth';return}
  if(me().guest){if(window.AevyGuest)AevyGuest.prompt();return}
  openCreate();
},true);

/* ---------- Activity ---------- */
var SEEN='aevy_act_seen',acts=[],latest=0;
function seenAt(){try{return +localStorage.getItem(SEEN)||0}catch(e){return 0}}
function markSeen(){try{localStorage.setItem(SEEN,String(Date.now()))}catch(e){}paintDot(0)}
function paintDot(n){$$('.act-dot').forEach(function(d){d.hidden=!n})}
function fetchActs(){
  if(!me())return Promise.resolve([]);
  return SB.rpc('get_activity',{lim:60}).then(function(r){
    if(r.error)throw r.error;
    return (r.data||[]).map(function(x){return {kind:x.kind,actor:x.actor,ref:x.ref,snippet:x.snippet||'',t:ts(x.created)}});
  });
}
function pollDot(){
  if(!me()||document.hidden)return;
  fetchActs().then(function(l){acts=l;latest=l.length?l[0].t:0;var s=seenAt();paintDot(l.filter(function(x){return x.t>s}).length);
    if(location.hash==='#/activity')markSeen()},function(){});
}
var TEXT={follow:'started following you.',plike:'liked your photo.',slike:'liked your script',pcomment:'commented:',scomment:'commented on your script:'};
function actRow(a,thumbs,fresh){
  var u=A.byId(a.actor);if(!u)return '';
  var txt=a.kind==='slike'?'liked your script <b>'+esc(a.snippet)+'</b>.':(TEXT[a.kind]+(a.kind==='pcomment'||a.kind==='scomment'?' <span class="act-q">'+esc(a.snippet)+'</span>':''));
  var right='';
  if(a.kind==='follow'&&window.AevySocial)right=AevySocial.followBtn(u.id);
  else if((a.kind==='plike'||a.kind==='pcomment')&&thumbs[a.ref])right='<img class="act-th" src="'+esc(thumbs[a.ref])+'" alt="">';
  var go=a.kind==='follow'?'data-ugo="'+esc(u.username)+'"':(a.kind==='plike'||a.kind==='pcomment')?'data-pgrid="'+esc(a.ref)+'"':'data-sgo="'+esc(a.ref)+'"';
  return '<li class="act-row'+(fresh?' new':'')+'"><div class="act-main" '+go+' role="button" tabindex="0">'+av(u,44)+'<p><b>'+esc(u.username)+'</b> '+txt+' <small>'+ago(a.t)+'</small></p></div>'+right+'</li>';
}
function renderActivity(){
  var box=$('#actRoot');if(!box)return;
  if(!me()){box.innerHTML='<div class="wrap act"><h1>Activity</h1><div class="empty"><h3>Sign in to see your activity</h3><p>Follows, likes and comments show up here.</p><a class="btn btn-primary" href="#/auth">Sign in</a></div></div>';return}
  box.innerHTML='<div class="wrap act"><h1>Activity</h1><p class="ph-empty">Loading...</p></div>';
  var s=seenAt();
  fetchActs().then(function(l){
    acts=l;
    var ids=l.filter(function(a){return a.kind==='plike'||a.kind==='pcomment'}).map(function(a){return a.ref}).filter(function(v,i,a){return a.indexOf(v)===i});
    return (ids.length?SB.from('posts').select('id,image').in('id',ids).then(function(r){var t={};(r.data||[]).forEach(function(p){t[p.id]=safe(p.image)});return t},function(){return {}}):Promise.resolve({})).then(function(t){return [l,t]});
  }).then(function(x){
    var l=x[0],th=x[1],fresh=l.filter(function(a){return a.t>s}),old=l.filter(function(a){return a.t<=s});
    function sec(title,list,f){var h=list.map(function(a){return actRow(a,th,f)}).join('');return h?'<h2>'+title+'</h2><ul class="act-list">'+h+'</ul>':''}
    var html=sec('New',fresh,true)+sec(fresh.length?'Earlier':'Recent',old,false);
    if(!html)html='<div class="empty"><h3>Nothing yet</h3><p>When someone follows you, or likes or comments on your photos and scripts, you will see it here.</p></div>';
    box.innerHTML='<div class="wrap act"><h1>Activity</h1>'+html+'</div>';
    markSeen();
  },function(e){box.innerHTML='<div class="wrap act"><h1>Activity</h1><div class="empty"><h3>Activity is not set up yet</h3><p>Run the latest supabase/schema.sql in Supabase.</p></div></div>';console.warn(e)});
}
document.addEventListener('click',function(e){
  var t;
  if((t=e.target.closest('[data-ugo]'))&&!e.target.closest('[data-follow]')){location.hash='#/u/'+t.dataset.ugo;return}
  if((t=e.target.closest('[data-sgo]'))){if(C.open)C.open(t.dataset.sgo);return}
});
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.matches&&e.target.matches('.act-main'))e.target.click()});

/* ---------- tab bar: Activity heart with an unread dot; Messages icon in the header ---------- */
(function(){
  var tb=$('#tabbar');
  if(tb){
    var ai=tb.querySelector('[data-route="ai"]');
    var a=document.createElement('a');a.href='#/activity';a.dataset.route='activity';a.setAttribute('aria-label','Activity');
    a.innerHTML=HEART+'<i class="act-dot" hidden></i>';
    if(ai)tb.replaceChild(a,ai);else tb.insertBefore(a,tb.lastElementChild);
  }
  var bar=$('.bar-actions');
  if(bar&&!$('#dmTop')){
    var d=document.createElement('a');d.className='icon-btn dm-top';d.id='dmTop';d.href='#/messages';d.setAttribute('aria-label','Messages');
    d.innerHTML=SHARE+'<i class="act-dot" id="dmTopDot" hidden></i>';
    bar.insertBefore(d,bar.firstChild);
    var ub=$('#unreadBadge');
    if(ub)new MutationObserver(function(){$('#dmTopDot').hidden=ub.hidden}).observe(ub,{attributes:true,attributeFilter:['hidden']});
  }
})();

window.AevyPhotos={render:function(h){if(h==='activity')renderActivity()},pane:pane,open:openViewer,create:openCreate};
window.addEventListener('aevy:auth',function(){loaded=false;liked={};if($('#photoFeed'))refreshFeed();setTimeout(pollDot,500)});
setTimeout(pollDot,2500);setInterval(pollDot,60000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)pollDot()});
})();
