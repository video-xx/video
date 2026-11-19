(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Icons ---------- */
var ICON={
  dl:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14"/></svg>',
  x:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg>'
};

/* ---------- State (loaded from Supabase) ---------- */
var K={theme:'aevy.theme'};
var DB=window.AevyDB;
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

/* ---------- Languages and highlighting ---------- */
var C_SLASH=String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`;
var LANGS={
  javascript:{label:'JavaScript',ext:'js',color:'#e8c547',c:C_SLASH,bt:1,k:'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof this null undefined true false of in yield'},
  typescript:{label:'TypeScript',ext:'ts',color:'#4a90d9',c:C_SLASH,bt:1,k:'const let var function return if else for while do switch case break continue new class extends implements interface type enum import export from default async await try catch finally throw typeof instanceof this null undefined true false of in readonly public private protected as keyof'},
  python:{label:'Python',ext:'py',color:'#5b9bd5',c:String.raw`#[^\n]*`,k:'def class return if elif else for while in not and or is import from as with try except finally raise pass break continue lambda yield None True False global nonlocal async await'},
  bash:{label:'Bash',ext:'sh',color:'#7bc96f',c:String.raw`#[^\n]*`,k:'if then else elif fi for while do done case esac function in return exit echo local export set unset readonly trap source cd test'},
  lua:{label:'Lua',ext:'lua',color:'#6a7fd8',c:String.raw`--[^\n]*`,k:'local function return if then else elseif end for while do repeat until break in and or not nil true false'},
  go:{label:'Go',ext:'go',color:'#4cc3d9',c:C_SLASH,bt:1,k:'package import func return if else for range switch case default break continue go defer chan select struct interface type map var const nil true false'},
  rust:{label:'Rust',ext:'rs',color:'#d98a5b',c:C_SLASH,k:'fn let mut pub use mod struct enum impl trait return if else for while loop match break continue as in ref self Self const static true false'},
  html:{label:'HTML',ext:'html',color:'#e5734f',c:String.raw`<!--[\s\S]*?-->`,k:''},
  css:{label:'CSS',ext:'css',color:'#8d72d8',c:String.raw`\/\*[\s\S]*?\*\/`,k:''},
  json:{label:'JSON',ext:'json',color:'#9aa3b2',c:null,k:'true false null'},
  text:{label:'Plain text',ext:'txt',color:'#7d8493',c:null,k:''}
};
var EXT={js:'javascript',mjs:'javascript',ts:'typescript',py:'python',sh:'bash',bash:'bash',lua:'lua',go:'go',rs:'rust',html:'html',htm:'html',css:'css',json:'json',txt:'text',md:'text'};
var reCache={};
function getRe(lang){
  if(reCache[lang])return reCache[lang];
  var L=LANGS[lang]||LANGS.text;
  var str=String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`+(L.bt?'|`(?:\\\\.|[^`\\\\])*`':'');
  var kw=L.k?String.raw`\b(?:`+L.k.split(' ').join('|')+String.raw`)\b`:'(?!)';
  var src='('+(L.c||'(?!)')+')|('+str+')|('+String.raw`\b\d+(?:\.\d+)?\b`+')|('+kw+')';
  return (reCache[lang]=new RegExp(src,'g'));
}
function highlight(code,lang){
  if(lang==='text'||!code)return esc(code);
  var re=getRe(lang);re.lastIndex=0;
  var out='',last=0,m;
  while((m=re.exec(code))){
    if(m[0]==='')break;
    out+=esc(code.slice(last,m.index));
    out+='<span class="'+(m[1]?'tc':m[2]?'ts':m[3]?'tn':'tk')+'">'+esc(m[0])+'</span>';
    last=m.index+m[0].length;
  }
  return out+esc(code.slice(last));
}
function lineCount(s){return s?s.split('\n').length:0}
function langLabel(k){return (LANGS[k]||LANGS.text).label}
function langExt(k){return (LANGS[k]||LANGS.text).ext}
function langColor(k){return (LANGS[k]||LANGS.text).color}
function slug(s){return (s||'script').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'script'}
function fmtDate(t){try{return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(t))}catch(e){return ''}}
var BIN=window.AevyBin;
function byteLen(s){return BIN.isBin(s)?BIN.size(s):new Blob([s]).size}
function fmtSize(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(n<10240?1:0)+' KB':(n/1048576).toFixed(1)+' MB'}
function fileNameOf(s){return slug(s.title)+'.'+(s.ext||langExt(s.lang))}
function uniqueNames(list){
  var seen={},map={};
  list.forEach(function(s){
    var base=slug(s.title),ext=s.ext||langExt(s.lang),n=base+'.'+ext,i=2;
    while(seen[n.toLowerCase()]){n=base+'-'+i+'.'+ext;i++}
    seen[n.toLowerCase()]=1;map[s.id]=n;
  });
  return map;
}

/* ---------- Data ---------- */
var scripts=[],videos=[],backendOffline=false;
function loadAll(){
  return Promise.all([DB.listScripts(),DB.listVideos()]).then(function(r){scripts=r[0];videos=r[1]});
}
function upsertLocal(n){var i=-1;scripts.forEach(function(x,k){if(x.id===n.id)i=k});if(i<0)scripts.unshift(n);else scripts[i]=n}
function fail(e){toast((e&&e.message)||'Something went wrong');console.error(e)}
var CATS=['Vehicles & Tuning','Visual & Graphics','Gameplay & Physics','Tools & Utilities','Maps & Environment','Other'];
function me(){return window.AevyAuth.current()}
function isOwner(s){var m=me();return !!(m&&s&&s.owner===m.id)}
function canSee(s){return !!s&&(s.vis!=='private'||isOwner(s))}
function vis(){return scripts.filter(canSee)}
function mine(){return scripts.filter(isOwner)}
function needOwner(s){if(isOwner(s))return true;toast('Only the publisher can do that');return false}
function byId(id){var s=scripts.filter(function(x){return x.id===id})[0];return canSee(s)?s:undefined}
function ownerOf(s){var u=window.AevyAuth.byId(s.owner);return u?u.username:''}

/* ---------- Toast ---------- */
var tt;
function toast(msg){var t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('show')},2600)}

/* ---------- Downloads, zip ---------- */
function download(name,content,type){
  var blob=content instanceof Blob?content:BIN.isBin(content)?new Blob([BIN.bytes(content)],{type:'application/octet-stream'}):new Blob([content],{type:type||'text/plain;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href)},2000);
}
var CRC=(function(){var t=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){var c=0xFFFFFFFF;for(var i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
/*ZIP_START*/
function makeZip(files){
  var enc=new TextEncoder(),chunks=[],central=[],offset=0,d=new Date();
  var dt=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
  var dd=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  files.forEach(function(f){
    var name=enc.encode(f.name),data=BIN.bytes(f.content),crc=crc32(data),size=data.length;
    var lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);
    lh.setUint16(10,dt,true);lh.setUint16(12,dd,true);lh.setUint32(14,crc,true);lh.setUint32(18,size,true);lh.setUint32(22,size,true);
    lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
    chunks.push(new Uint8Array(lh.buffer),name,data);
    var ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);
    ch.setUint16(12,dt,true);ch.setUint16(14,dd,true);ch.setUint32(16,crc,true);ch.setUint32(20,size,true);ch.setUint32(24,size,true);
    ch.setUint16(28,name.length,true);ch.setUint16(30,0,true);ch.setUint16(32,0,true);ch.setUint16(34,0,true);ch.setUint16(36,0,true);
    ch.setUint32(38,0,true);ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer),name);
    offset+=30+name.length+size;
  });
  var cd=0;central.forEach(function(c){cd+=c.length});
  var end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);
  end.setUint32(12,cd,true);end.setUint32(16,offset,true);
  return new Blob(chunks.concat(central,[new Uint8Array(end.buffer)]),{type:'application/zip'});
}
/*ZIP_END*/
function withCodes(list){return Promise.all(list.map(function(s){return DB.getCode(s)}))}
function zipScripts(list,label){
  if(!list.length){toast('There are no scripts to download');return}
  toast('Preparing zip...');
  var names=uniqueNames(list);
  withCodes(list).then(function(codes){
    var files=list.map(function(s,i){return {name:names[s.id],content:codes[i]}});
    var d=new Date().toISOString().slice(0,10);
    download('aevy-'+(label||'scripts')+'-'+d+'.zip',makeZip(files));
    toast('Downloaded '+list.length+' file'+(list.length===1?'':'s')+' as a zip');
    if(window.AevyStats)AevyStats.downloaded(list);
  }).catch(fail);
}
function downloadOne(s){
  DB.getCode(s).then(function(code){var n=fileNameOf(s);download(n,code);toast('Downloaded '+n);if(window.AevyStats)AevyStats.downloaded([s])}).catch(fail);
}
function copyScript(s){DB.getCode(s).then(function(c){if(BIN.isBin(c)){toast('Binary file: use Download');return}copyText(c)}).catch(fail)}
function copyText(text){
  var p=(navigator.clipboard&&navigator.clipboard.writeText)?navigator.clipboard.writeText(text):Promise.reject();
  p.then(function(){toast('Copied to clipboard')},function(){
    var t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();
    try{document.execCommand('copy');toast('Copied to clipboard')}catch(x){toast('Copy failed')}t.remove();
  });
}

/* ---------- Theme ---------- */
function setTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  var m=document.querySelector('meta[name=theme-color]');if(m)m.content=t==='light'?'#ffffff':'#000000';
  try{localStorage.setItem(K.theme,t)}catch(e){}
}
(function(){var t;try{t=localStorage.getItem(K.theme)}catch(e){}
  if(!t)t='light';
  setTheme(t)})();
$('#theme').addEventListener('click',function(){setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')});

/* ---------- Router ---------- */
var VIEWS=['home','explore','watch','publish','files','auth','profile','u','messages','activity','ai','about','privacy','terms','guidelines','contact'],current='';
function route(){
  var h=(location.hash||'#/').replace(/^#\/?/,'').split('/')[0]||'home';
  if(h==='library'||h==='scripts')h='explore';
  if(VIEWS.indexOf(h)<0)h='home';
  var raw=(location.hash||'#/').replace(/^#\/?/,'');
  var PUB=['auth','about','privacy','terms','guidelines','contact'];
  document.body.classList.toggle('signed-out',!me());
  document.body.classList.toggle('is-guest',!!(me()&&me().guest));
  if(me()&&me().guest&&(h==='publish'||h==='files'||h==='ai')){toast('Guests can only send messages. Create a free account for this.');location.hash='#/messages';return}
  if(h==='auth'&&me()&&!me().guest){location.hash='#/profile';return}
  if(h===current&&h!=='u'&&h!=='messages')return;
  current=h;
  $$('.view').forEach(function(v){v.classList.toggle('active',v.dataset.view===h)});
  $$('#nav a').forEach(function(a){if(a.dataset.route===h||(h==='u'&&a.dataset.route==='profile'&&false))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  $$('#tabbar a').forEach(function(a){if(a.dataset.route===h)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  closeMenu();window.scrollTo(0,0);
  document.title=h==='home'?'Aevy | Videos':'Aevy | '+({explore:'Videos',watch:'Watch',auth:'Account',profile:'Profile',u:'Profile',messages:'Messages',activity:'Activity',ai:'AI chat',about:'About',privacy:'Privacy Policy',terms:'Terms of Service',guidelines:'Community Guidelines',contact:'Contact'})[h];
  if(h==='home'){renderHome();observeReveals();runStats()}
  if(h==='scripts')renderScripts();
  if(h==='files')renderFiles();
  if(h==='publish')updatePreview();
  if(h==='watch')renderVList();
  if(window.AevyEco)AevyEco.render(h,raw);
  if(window.AevySocial)AevySocial.render(h,raw);
  if(window.AevyStats)AevyStats.render(h);
  if(window.AevyPhotos)AevyPhotos.render(h,raw);
}
window.addEventListener('hashchange',route);
window.addEventListener('aevy:auth',function(){loadAll().catch(function(){scripts=scripts.filter(canSee);videos=[]}).then(function(){current='';route()})});
function closeMenu(){$('#nav').classList.remove('open');$('#burger').setAttribute('aria-expanded','false')}
$('#burger').addEventListener('click',function(){var o=$('#nav').classList.toggle('open');this.setAttribute('aria-expanded',o)});
document.addEventListener('click',function(e){if(!e.target.closest('.site-header'))closeMenu()});

/* ---------- Reveal and stats ---------- */
var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -5% 0px'}):null;
function observeReveals(){$$('.reveal:not(.in)').forEach(function(el){io?io.observe(el):el.classList.add('in')})}
function runStats(){
  var langs={},lines=0;vis().forEach(function(s){langs[s.lang]=1;lines+=s.lines||0});
  var vals={scripts:vis().length,langs:Object.keys(langs).length,lines:lines,videos:videos.length};
  $$('[data-count]').forEach(function(el){
    var to=vals[el.dataset.count]||0;
    if(reduce){el.textContent=to.toLocaleString();return}
    var t0=performance.now(),dur=1100;
    (function step(t){var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,4);el.textContent=Math.round(to*e).toLocaleString();if(p<1)requestAnimationFrame(step)})(t0);
  });
}

/* ---------- Cards ---------- */
function timeAgo(t){
  var d=Math.max(0,(Date.now()-t)/1000);
  if(d<45)return 'Just now';
  if(d<3600)return Math.round(d/60)+' min';
  if(d<86400)return Math.round(d/3600)+' h';
  if(d<86400*7)return Math.round(d/86400)+' d';
  return fmtDate(t);
}
function pico(p){return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'}
var PI={
  like:pico('<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.1 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/>'),
  cmt:pico('<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20.5l1.4-5.4A8.5 8.5 0 1 1 21 11.5z"/>'),
  share:pico('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>'),
  copy:pico('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>'),
  dl:pico('<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14"/>'),
  globe:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>',
  file:pico('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  lock:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
};
function postAuthor(s){
  var u=window.AevyAuth&&AevyAuth.byId?AevyAuth.byId(s.owner):null;
  var name=(u&&(u.name||u.username))||s.author||'Anonymous';
  var av=u&&window.AevyEco?AevyEco.avatar(u,40):'<span class="avatar" style="width:40px;height:40px;font-size:17px">'+esc(name.charAt(0).toUpperCase())+'</span>';
  var nm=u&&u.username?'<span class="nm-line"><a class="post-name" href="#/u/'+esc(u.username)+'">'+esc(name)+'</a>'+(window.AevyBadge?AevyBadge.html(u):'')+'</span>':'<span class="post-name">'+esc(name)+'</span>';
  return {av:av,nm:nm,link:!!(u&&u.username)};
}
function cardHTML(s,idx){
  var au=postAuthor(s),id=esc(s.id),pv0=String(s.preview||'');
  var tags=(s.tags||[]).slice(0,4).map(function(t){return '<span>#'+esc(String(t).replace(/^#/,'').replace(/\s+/g,''))+'</span>'}).join(' ');
  var liked=window.AevyStats&&AevyStats.liked&&AevyStats.liked(s.id);
  var nl=(s.likes||0),nc=(s.reviews||s.comments||0),bin=/^\[Binary or encrypted/.test(pv0);
  var media=bin?'<div class="ig-media bin" data-dbl="'+id+'"><span class="ig-lang">'+esc(langLabel(s.lang))+'</span><span class="ig-binic">'+PI.file+'</span><span class="ig-bint"><b>'+esc(fileNameOf(s))+'</b><small>Compiled or protected file &middot; '+fmtSize(s.size||0)+'</small></span>'+HEARTBURST+'</div>'
   :'<div class="ig-media" data-dbl="'+id+'"><span class="ig-lang">'+esc(langLabel(s.lang))+'</span><pre>'+esc(pv0.split('\n').slice(0,5).join('\n')||s.title)+'</pre>'+HEARTBURST+'</div>';
  return '<article class="card ig-post" style="--i:'+(idx||0)+'" data-open="'+id+'">'+
   '<header class="ig-head">'+au.av+'<div class="ig-who">'+au.nm+'<span class="dot">&middot;</span><span class="ig-ago">'+esc(timeAgo(s.created))+'</span>'+(s.vis==='private'?'<span class="dot">&middot;</span>'+PI.lock:'')+'</div>'+
   '<button type="button" class="ig-more" data-act="share" data-id="'+id+'" aria-label="Share">&#8943;</button></header>'+
   '<div class="ig-title"><h3>'+esc(s.title)+'</h3>'+(s.desc?'<p class="ig-desc">'+esc(s.desc)+'</p>':'')+'</div>'+
   media+
   '<button type="button" class="ig-dlbtn" data-act="dl" data-id="'+id+'">'+PI.dl+'<span>Download</span><small>'+fmtSize(s.size||0)+'</small></button>'+
   '<div class="post-acts ig-acts">'+
    '<button class="pact'+(liked?' on':'')+'" data-act="like" data-id="'+id+'" aria-pressed="'+!!liked+'" aria-label="Like">'+PI.like+'<b class="pc" data-lc="'+id+'">'+(nl?nl.toLocaleString():'')+'</b></button>'+
    '<button class="pact" data-act="cmt" data-id="'+id+'" aria-expanded="false" aria-label="Comments">'+PI.cmt+'<b class="pc">'+(nc?nc:'')+'</b></button>'+
    '<button class="pact" data-act="share" data-id="'+id+'" aria-label="Share">'+PI.share+'</button>'+
    '<span class="ig-save">'+(window.AevySaved?AevySaved.btn(s.id):'')+'</span></div>'+
   (window.AevyStats?AevyStats.cardStats(s):'')+
   (tags?'<p class="ig-tags">'+tags+'</p>':'')+'</article>';
}
var HEARTBURST='<svg class="ig-burst" viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.1 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>';
function tileHTML(s){
  var id=esc(s.id),pv=String(s.preview||'').split('\n').slice(0,9).join('\n');
  return '<div class="tile" data-open="'+id+'" role="button" tabindex="0" aria-label="'+esc(s.title)+'" style="--lc:'+langColor(s.lang)+'">'+
   '<span class="t-lang">'+esc(langLabel(s.lang))+'</span>'+
   '<div class="t-title">'+esc(s.title)+'</div>'+
   '<div class="t-ov"><span><svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.7 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.1 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>'+(s.likes||0)+'</span>'+
   '<span><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14"/></svg>'+(s.downloads||0)+'</span></div></div>';
}
function shareScript(s){
  var url=location.origin+location.pathname+(s.video?'#/':'#/scripts'),data={title:s.title,text:s.title+' on Aevy',url:url};
  if(navigator.share){navigator.share(data).catch(function(){})}else copyText(url);
}
document.addEventListener('click',function(e){
  var a=e.target.closest('[data-act]');
  if(a&&a.dataset.id&&!a.closest('#dlgBody')){
    e.stopPropagation();
    var s=byId(a.dataset.id);if(!s)return;
    var act=a.dataset.act;
    if(act==='dl')downloadOne(s);
    if(act==='copy')copyScript(s);
    if(act==='share')shareScript(s);
    if(act==='open')openScript(s.id);
    if(act==='like'&&window.AevyStats)AevyStats.like(s,a);
    if(act==='save'&&window.AevySaved)AevySaved.toggle(s);
    if(act==='del')deleteScript(s);
    return;
  }
  var c=e.target.closest('[data-open]');if(c&&!c.classList.contains('fb-post'))openScript(c.dataset.open);
});
document.addEventListener('keydown',function(e){
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.card,.tile')){e.preventDefault();openScript(e.target.dataset.open)}
});
function deleteScript(s,after){
  if(!isOwner(s)&&!(window.AevyAuth.isAdmin&&AevyAuth.isAdmin())){toast('Only the publisher or an Admin can do that');return}
  if(!confirm('Delete "'+s.title+'"? This removes the file from cloud storage. Download it first if you want a copy.'))return;
  DB.deleteScript(s).then(function(){scripts=scripts.filter(function(x){return x.id!==s.id});if(after)after();toast('Script deleted');refreshLists()}).catch(fail);
}
function refreshLists(){
  if(current==='scripts')renderScripts();
  if(current==='home'){renderHome()}
  if(current==='files')renderFiles();
}

/* ---------- Home ---------- */
function renderHome(){
  if(window.AevyHome){try{AevyHome.render();return}catch(e){console.error('Video feed failed to render:',e)}}
  var root=$('#homeRoot');
  if(root)root.innerHTML='<div class="empty boot-error"><h2>Video feed could not start</h2><p>Check that the project files loaded and that the site is served over HTTP(S), then reload.</p><button class="btn" type="button" onclick="location.reload()">Reload</button></div>';
}


/* ---------- Scripts view ---------- */
var filter='all';
function renderScripts(){
  var used={};vis().forEach(function(s){used[s.lang]=1});
  var keys=['all'].concat(Object.keys(used).sort());
  if(keys.indexOf(filter)<0)filter='all';
  $('#chips').innerHTML=keys.map(function(k){return '<button class="chip'+(k===filter?' on':'')+'" data-f="'+k+'" aria-pressed="'+(k===filter)+'">'+(k==='all'?'All ('+vis().length+')':esc(langLabel(k)))+'</button>'}).join('');
  var q=$('#q').value.trim().toLowerCase(),sort=$('#sort').value;
  var list=vis().filter(function(s){
    if(window.catFilter&&window.catFilter!=='all'&&s.cat!==window.catFilter)return false;
    if(filter!=='all'&&s.lang!==filter)return false;
    if(!q)return true;
    return (s.title+' '+(s.desc||'')+' '+(s.tags||[]).join(' ')+' '+(s.author||'')).toLowerCase().indexOf(q)>-1;
  });
  list.sort(function(a,b){
    if(sort==='az')return a.title.localeCompare(b.title);
    if(sort==='old')return a.created-b.created;
    if(sort==='upd')return b.updated-a.updated;
    if(sort==='dl')return (b.downloads||0)-(a.downloads||0)||b.created-a.created;
    if(sort==='views')return (b.views||0)-(a.views||0)||b.created-a.created;
    if(sort==='likes')return (b.likes||0)-(a.likes||0)||b.created-a.created;
    if(sort==='rated')return (b.rcount?b.rsum/b.rcount:0)-(a.rcount?a.rsum/a.rcount:0)||b.rcount-a.rcount;
    return b.created-a.created;
  });
  $('#cards').innerHTML=list.length?list.map(tileHTML).join(''):'<div class="empty"><h3>'+(vis().length?'Nothing matches':'Your library is empty')+'</h3><p>'+(vis().length?'Try a different search or language.':'Publish a script to get started.')+'</p></div>';
}
$('#chips').addEventListener('click',function(e){var b=e.target.closest('[data-f]');if(!b)return;filter=b.dataset.f;renderScripts()});
$('#q').addEventListener('input',renderScripts);
$('#sort').addEventListener('change',renderScripts);
$('#zipAllTop').addEventListener('click',function(){zipScripts(vis(),'all-scripts')});

/* ---------- Local files view ---------- */
var selected={};
function selCount(){return Object.keys(selected).length}
function renderFiles(){
  var names=uniqueNames(mine());
  var rows=mine().slice().sort(function(a,b){return b.updated-a.updated});
  var all=rows.length&&rows.every(function(s){return selected[s.id]});
  var html='<div class="frow fhead"><label><input type="checkbox" id="selAll" aria-label="Select all"'+(all?' checked':'')+'></label><span></span><span>File</span><span>Size</span><span>Lines</span><span>Modified</span><span></span></div>';
  html+=rows.map(function(s){
    return '<div class="frow"><label><input type="checkbox" data-sel="'+esc(s.id)+'" aria-label="Select '+esc(s.title)+'"'+(selected[s.id]?' checked':'')+'></label>'+
      '<div class="fext">'+esc(langExt(s.lang))+'</div>'+
      '<div class="fmain"><b>'+esc(names[s.id])+'</b><small>'+esc(s.title)+'</small></div>'+
      '<span class="fmeta">'+fmtSize(s.size||0)+'</span><span class="fmeta">'+(s.lines||0)+'</span><span class="fmeta">'+fmtDate(s.updated)+'</span>'+
      '<div class="fact"><button class="btn btn-primary" data-act="dl" data-id="'+esc(s.id)+'">'+ICON.dl+'Download</button><button class="btn" data-act="open" data-id="'+esc(s.id)+'">Open</button><button class="btn btn-danger" data-act="del" data-id="'+esc(s.id)+'">Delete</button></div></div>';
  }).join('');
  if(!rows.length)html='<div class="empty" style="border:0"><h3>No local files yet</h3><p>Publish a script or import files to see them here.</p></div>';
  $('#ftable').innerHTML=html;
  updateSelLabel();
  var bytes=0;rows.forEach(function(s){bytes+=s.size||0});
  $('#meter').innerHTML='Cloud storage used by your scripts: '+fmtSize(bytes)+' in '+rows.length+' file'+(rows.length===1?'':'s')+' (2 MB limit per file)';
  $('#saveFolder').style.display=window.showDirectoryPicker?'':'none';
}
function updateSelLabel(){
  var n=selCount();
  $('#dlSelectedLabel').textContent=n?'Download selected ('+n+')':'Download all (.zip)';
}
$('#ftable').addEventListener('change',function(e){
  if(e.target.id==='selAll'){
    selected={};if(e.target.checked)mine().forEach(function(s){selected[s.id]=1});
    $$('[data-sel]').forEach(function(c){c.checked=e.target.checked});
  }else if(e.target.dataset.sel){
    if(e.target.checked)selected[e.target.dataset.sel]=1;else delete selected[e.target.dataset.sel];
  }
  updateSelLabel();
});
$('#dlSelected').addEventListener('click',function(){
  var n=selCount();
  if(n===1){downloadOne(byId(Object.keys(selected)[0]));return}
  zipScripts(n?mine().filter(function(s){return selected[s.id]}):mine(),n?'selected':'all-scripts');
});
$('#saveFolder').addEventListener('click',function(){
  if(!window.showDirectoryPicker){toast('Your browser cannot save to a folder. Use Download all instead.');return}
  window.showDirectoryPicker({mode:'readwrite'}).then(function(dir){
    var list=selCount()?mine().filter(function(s){return selected[s.id]}):mine(),names=uniqueNames(list),n=0;
    return list.reduce(function(p,s){
      return p.then(function(){return DB.getCode(s)}).then(function(code){return dir.getFileHandle(names[s.id],{create:true}).then(function(h){return h.createWritable()}).then(function(w){return w.write(BIN.isBin(code)?BIN.bytes(code):code).then(function(){return w.close()})})}).then(function(){n++});
    },Promise.resolve()).then(function(){toast('Saved '+n+' file'+(n===1?'':'s')+' to your folder')});
  }).catch(function(err){if(err&&err.name!=='AbortError')toast('Could not save to that folder')});
});
function importFileList(files){
  if(!me()){toast('Sign in to import files');location.hash='#/auth';return}
  var list=Array.prototype.slice.call(files||[]),added=0;
  if(!list.length)return;
  toast('Uploading '+list.length+' file'+(list.length===1?'':'s')+'...');
  list.reduce(function(p,f){
    return p.then(function(){
      if(f.size>2*1024*1024){toast(f.name+' is larger than 2 MB');return}
      return BIN.read(f).then(function(code){
        if(!code.trim())return;
        var ext=(f.name.indexOf('.')>0?f.name.split('.').pop():'').toLowerCase();
        return DB.createScript({title:f.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').slice(0,80)||'file',lang:EXT[ext]||'text',ext:EXT[ext]?'':ext,author:me().name,desc:'Imported from '+f.name,tags:[],cat:'Other',vis:'public',video:''},code).then(function(n){upsertLocal(n);added++});
      }).catch(function(e){toast(f.name+': '+((e&&e.message)||'upload failed'))});
    });
  },Promise.resolve()).then(function(){refreshLists();toast(added+' file'+(added===1?'':'s')+' imported')});
}
$('#importFiles').addEventListener('click',function(){$('#importFilesInput').click()});
$('#importFilesInput').addEventListener('change',function(){importFileList(this.files);this.value=''});
var fdrop=$('#fileDrop');
fdrop.addEventListener('click',function(){$('#importFilesInput').click()});
['dragenter','dragover'].forEach(function(ev){fdrop.addEventListener(ev,function(e){e.preventDefault();fdrop.classList.add('over')})});
['dragleave','drop'].forEach(function(ev){fdrop.addEventListener(ev,function(e){e.preventDefault();fdrop.classList.remove('over')})});
fdrop.addEventListener('drop',function(e){importFileList(e.dataTransfer.files)});
$('#backupBtn').addEventListener('click',function(){
  var list=mine();if(!list.length){toast('Nothing to back up yet');return}
  toast('Preparing backup...');
  withCodes(list).then(function(codes){
    var out=list.map(function(s,i){var o=JSON.parse(JSON.stringify(s));o.code=codes[i];delete o.path;delete o.preview;return o});
    var d=new Date().toISOString().slice(0,10);
    download('aevy-backup-'+d+'.json',JSON.stringify({app:'aevy',version:3,scripts:out,videos:videos.map(function(v){return {url:v.url,title:v.title}})},null,2),'application/json');
    toast('Backup downloaded');
  }).catch(fail);
});
$('#restoreBtn').addEventListener('click',function(){$('#restoreInput').click()});
function restoreScripts(arr,vids){
  var n=0;
  return arr.reduce(function(p,s){
    return p.then(function(){
      if(!s||typeof s.title!=='string'||typeof s.code!=='string')return;
      return DB.createScript({title:s.title.slice(0,80),lang:LANGS[s.lang]?s.lang:'text',ext:s.ext,author:me().name,desc:String(s.desc||'').slice(0,220),tags:Array.isArray(s.tags)?s.tags.slice(0,8).map(String):[],cat:CATS.indexOf(s.cat)>-1?s.cat:'Other',vis:s.vis==='private'?'private':'public',video:String(s.video||'').slice(0,300)},s.code).then(function(c){upsertLocal(c);n++},function(e){console.error(e)});
    });
  },Promise.resolve()).then(function(){
    return (vids||[]).reduce(function(p,v){
      return p.then(function(){
        if(!v||!v.url||videos.some(function(x){return x.url===v.url}))return;
        return DB.addVideo(String(v.url).slice(0,500),String(v.title||'').slice(0,90)).then(function(x){videos.unshift(x)},function(){});
      });
    },Promise.resolve());
  }).then(function(){return n});
}
$('#restoreInput').addEventListener('change',function(){
  var f=this.files[0];this.value='';if(!f)return;
  f.text().then(function(txt){
    var data=JSON.parse(txt),arr=Array.isArray(data)?data:data.scripts;
    if(!Array.isArray(arr))throw 0;
    toast('Restoring '+arr.length+' script(s)...');
    return restoreScripts(arr,data.videos);
  }).then(function(n){refreshLists();toast(n+' script'+(n===1?'':'s')+' restored')},function(){toast('That file is not a valid Aevy backup')});
});

/* ---------- Script dialog ---------- */
var dlg=$('#dlg'),openId=null;
function codeHTML(code,lang){
  var n=lineCount(code),g=[];for(var i=1;i<=n;i++)g.push(i);
  return '<div class="code"><pre class="gut" aria-hidden="true">'+g.join('\n')+'</pre><pre class="src"><code>'+highlight(code,lang)+'</code></pre></div>';
}
function catOptions(sel){return CATS.map(function(c){return '<option'+(c===sel?' selected':'')+'>'+esc(c)+'</option>'}).join('')}
function langOptions(sel){return Object.keys(LANGS).map(function(k){return '<option value="'+k+'"'+(k===sel?' selected':'')+'>'+esc(LANGS[k].label)+'</option>'}).join('')}
function splitTags(s){return s.split(',').map(function(t){return t.trim()}).filter(Boolean).slice(0,8)}
function tabKey(e){
  if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();var t=e.target,a=t.selectionStart;t.value=t.value.slice(0,a)+'  '+t.value.slice(t.selectionEnd);t.selectionStart=t.selectionEnd=a+2;t.dispatchEvent(new Event('input'))}
}
function openScript(id,edit){
  var s=byId(id);if(!s)return;
  if(edit&&!needOwner(s))edit=false;
  openId=id;
  $('#dlgTitle').textContent=s.title;
  $('#dlgSub').innerHTML='<span class="fchip"><i style="background:'+langColor(s.lang)+'"></i>'+esc(langLabel(s.lang))+'</span><span>'+(ownerOf(s)?'<a href="#/u/'+esc(ownerOf(s))+'" data-close>'+esc(s.author||ownerOf(s))+'</a>':esc(s.author||'Anonymous'))+'</span><span>'+esc(s.cat||'Other')+'</span>'+(s.vis==='private'?'<span>Private</span>':'')+'<span>'+(s.lines||0)+' lines</span><span>'+fmtSize(s.size||0)+'</span><span>Updated '+fmtDate(s.updated)+'</span>';
  var body=$('#dlgBody');
  body.innerHTML='<p class="note">Loading file...</p>';
  if(!dlg.open){dlg.showModal();document.body.classList.add('lock')}
  if(window.AevyStats)AevyStats.view(s);
  DB.getCode(s).then(function(code){
    if(openId!==id)return;
    renderScriptBody(s,code,edit);body.scrollTop=0;
  },function(e){if(openId===id)body.innerHTML='<p class="ferr">'+esc((e&&e.message)||'Could not load this file')+'</p>'});
}
var openCode='';
function renderScriptBody(s,code,edit){
  var id=s.id,body=$('#dlgBody');openCode=code;
  if(edit){
    body.innerHTML='<form class="form" id="editForm">'+
      '<div><label class="l" for="eTitle">Title</label><input class="field" id="eTitle" maxlength="80" required value="'+esc(s.title)+'"></div>'+
      '<div class="row2"><div><label class="l" for="eLang">Language</label><select class="field sel" id="eLang" style="width:100%">'+langOptions(s.lang)+'</select></div>'+
      '<div><label class="l" for="eTags">Tags</label><input class="field" id="eTags" value="'+esc((s.tags||[]).join(', '))+'"></div></div>'+
      '<div class="row2"><div><label class="l" for="eCat">Category</label><select class="field sel" id="eCat" style="width:100%">'+catOptions(s.cat)+'</select></div><div><label class="l" for="eVis">Visibility</label><select class="field sel" id="eVis" style="width:100%"><option value="public"'+(s.vis!=='private'?' selected':'')+'>Public</option><option value="private"'+(s.vis==='private'?' selected':'')+'>Private (only you)</option></select></div></div>'+
      '<div><label class="l" for="eDesc">Description</label><input class="field" id="eDesc" maxlength="220" value="'+esc(s.desc||'')+'"></div>'+
      '<div><label class="l" for="eVideo">Video link</label><input class="field" id="eVideo" inputmode="url" value="'+esc(s.video||'')+'" placeholder="YouTube or video URL"></div>'+
      (s.video?'<div class="notice">Video posts store the video URL and description. The video itself streams from its linked provider.</div>':(BIN.isBin(code)?'<div class="notice">Binary or encrypted file ('+fmtSize(s.size||0)+'): the content stays as uploaded. You can still edit the details above.</div>':'<div><label class="l" for="eCode">Code</label><textarea class="field" id="eCode" spellcheck="false" style="min-height:340px">'+esc(code)+'</textarea></div>'))+
      '<div class="actions"><button class="btn btn-primary" type="submit">Save changes</button><button class="btn" type="button" id="eCancel">Cancel</button></div></form>';
    $('#eCancel').onclick=function(){openScript(id)};
    if($('#eCode'))$('#eCode').addEventListener('keydown',tabKey);
    $('#editForm').onsubmit=function(ev){
      ev.preventDefault();
      if(!needOwner(s))return;
      var btn=this.querySelector('[type=submit]'),newCode=$('#eCode')?$('#eCode').value:code;btn.disabled=true;btn.textContent='Saving...';
      var f={title:$('#eTitle').value.trim()||s.title,lang:$('#eLang').value,tags:splitTags($('#eTags').value),cat:$('#eCat').value,vis:$('#eVis').value,desc:$('#eDesc').value.trim(),video:$('#eVideo').value.trim(),author:s.author};
      DB.updateScript(s,f,newCode!==code?newCode:undefined).then(function(n){upsertLocal(n);toast('Changes saved');openScript(id);refreshLists()},function(e){btn.disabled=false;btn.textContent='Save changes';fail(e)});
    };
  }else{
    var v=parseVideo(s.video);
    body.innerHTML=
      '<div class="dlg-bar">'+(s.video?'':('<button class="btn btn-primary btn-lg" data-a="download">'+ICON.dl+'Download '+esc(fileNameOf(s))+'</button>'))+
        (isOwner(s)?'<button class="btn btn-lg" data-a="edit">'+(s.video?'Edit video':'Edit')+'</button>':'')+(s.video?'<button class="btn btn-lg" data-a="share">Share</button>':'<button class="btn btn-lg" data-a="copy">Copy</button><button class="btn btn-lg" data-a="fork">Fork</button>')+((isOwner(s)||(window.AevyAuth.isAdmin&&AevyAuth.isAdmin()))?'<button class="btn btn-lg btn-danger" data-a="delete">Delete</button>':'<button class="btn btn-lg" data-a="report">Report</button>')+'</div>'+
      (s.desc?'<p class="desc">'+esc(s.desc)+'</p>':'')+
      ((s.tags&&s.tags.length)?'<div class="tags">'+s.tags.map(function(t){return '<span class="tag">'+esc(t)+'</span>'}).join('')+'</div>':'')+
      (v?'<div>'+playerHTML(v)+'</div>':'')+
      (s.video?'':(BIN.isBin(code)?'<div class="notice">Binary or encrypted file ('+fmtSize(s.size||0)+'). It cannot be shown as text. Use Download to get the original file.</div>':codeHTML(code,s.lang)))+
      '<div id="social"></div>';
    if(window.AevyStats)AevyStats.mount(s);
  }
}
$('#dlgBody').addEventListener('click',function(e){
  var b=e.target.closest('[data-a]');if(!b)return;
  var s=byId(openId);if(!s)return;
  var a=b.dataset.a;
  if(a==='edit'){if(needOwner(s))openScript(openId,true)}
  if(a==='download')downloadOne(s);
  if(a==='copy'){if(BIN.isBin(openCode))toast('Binary file: use Download');else copyText(openCode)}
  if(a==='fork'){
    if(!me()){toast('Sign in to fork');location.hash='#/auth';return}
    b.disabled=true;
    DB.createScript({title:(s.title+' (copy)').slice(0,80),lang:s.lang,author:me().name,desc:s.desc,tags:s.tags,cat:s.cat,vis:'private',video:s.video},openCode).then(function(c){upsertLocal(c);toast('Forked as a private script');openScript(c.id);refreshLists()},function(x){b.disabled=false;fail(x)});
  }
  if(a==='delete')deleteScript(s,function(){dlg.close()});
  if(a==='report'&&window.AevyReport)AevyReport.open('script',s.id,s.title);
});
dlg.addEventListener('click',function(e){if(e.target===dlg||e.target.closest('[data-close]'))dlg.close()});
$('#dlgClose').addEventListener('click',function(){dlg.close()});
dlg.addEventListener('close',function(){document.body.classList.remove('lock');openId=null;stopMedia(dlg)});
function stopMedia(root){$$('video',root).forEach(function(v){v.pause()});$$('iframe',root).forEach(function(f){f.src='about:blank'})}

/* ---------- Video ---------- */
function parseVideo(u){
  u=(u||'').trim();if(!u)return null;
  var url;try{url=new URL(/^https?:\/\//i.test(u)?u:'https://'+u)}catch(e){return null}
  var h=url.hostname.replace(/^(www|m)\./,''),id=null,list=url.searchParams.get('list');
  if(h==='youtu.be')id=url.pathname.slice(1).split('/')[0];
  else if(h==='youtube.com'||h==='music.youtube.com'||h==='youtube-nocookie.com'){
    if(url.pathname==='/watch')id=url.searchParams.get('v');
    else{var m=url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{6,})/);if(m)id=m[2]}
    if(!id&&list&&(url.pathname==='/playlist'||url.pathname==='/embed/videoseries'))
      return {type:'yt',embed:'https://www.youtube-nocookie.com/embed/videoseries?list='+encodeURIComponent(list),watch:'https://www.youtube.com/playlist?list='+encodeURIComponent(list),label:'YouTube playlist'};
  }
  if(id&&/^[\w-]{6,}$/.test(id)){
    var t=url.searchParams.get('t')||url.searchParams.get('start')||'',start=0,mm;
    if(/^\d+$/.test(t))start=+t;else if(t&&(mm=t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)))start=(+mm[1]||0)*3600+(+mm[2]||0)*60+(+mm[3]||0);
    return {type:'yt',id:id,thumb:'https://i.ytimg.com/vi/'+id+'/mqdefault.jpg',watch:'https://www.youtube.com/watch?v='+id+(start?'&t='+start+'s':''),
      embed:'https://www.youtube-nocookie.com/embed/'+id+'?rel=0&modestbranding=1&playsinline=1'+(start?'&start='+start:'')+(list?'&list='+encodeURIComponent(list):''),label:'YouTube'};
  }
  if(h==='vimeo.com'||h==='player.vimeo.com'){
    var vm=url.pathname.match(/(\d{5,})/);
    if(vm)return {type:'vimeo',embed:'https://player.vimeo.com/video/'+vm[1],watch:'https://vimeo.com/'+vm[1],label:'Vimeo'};
  }
  if(/\.(mp4|webm|ogv|mov|m4v)$/i.test(url.pathname))return {type:'file',src:url.href,watch:url.href,label:'Video file'};
  return null;
}
function playerFrame(v){
  if(v.type==='file'||v.type==='local')return '<div class="vframe"><video controls playsinline preload="metadata" src="'+esc(v.src)+'"></video></div>';
  return '<div class="vframe"><iframe src="'+esc(v.embed)+'" title="Video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe></div>';
}
function playerNote(v){return esc(v.label)+'. If the player shows an error, <a href="'+esc(v.watch)+'" target="_blank" rel="noopener noreferrer">open it at the source</a>.'}
function playerHTML(v){return playerFrame(v)+'<p class="vnote">'+playerNote(v)+'</p>'}
var localObjUrl=null;
function playInStage(v,note){
  if(localObjUrl&&v.type!=='local'){URL.revokeObjectURL(localObjUrl);localObjUrl=null}
  $('#stage').innerHTML=playerFrame(v);
  $('#stageNote').innerHTML=v.type==='local'?esc(note):playerNote(v);
}
function addVideo(save){
  var url=$('#vUrl').value.trim(),v=parseVideo(url);
  if(!v){toast('That does not look like a supported video link');return}
  playInStage(v);
  if(save){
    if(!me()){toast('Sign in to save videos');return}
    if(videos.some(function(x){return x.url===url})){toast('Already in your list');return}
    DB.addVideo(url.slice(0,500),$('#vTitle').value.trim()).then(function(v){videos.unshift(v);toast('Saved to your list');renderVList()},fail);
  }
}
$('#vidForm').addEventListener('submit',function(e){e.preventDefault();addVideo(false)});
$('#vSave').addEventListener('click',function(){if(!$('#vidForm').reportValidity())return;addVideo(true)});
$('#vLocal').addEventListener('click',function(){$('#vFile').click()});
$('#vFile').addEventListener('change',function(){
  var f=this.files[0];this.value='';if(!f)return;
  if(localObjUrl)URL.revokeObjectURL(localObjUrl);
  localObjUrl=URL.createObjectURL(f);
  playInStage({type:'local',src:localObjUrl},'Playing '+f.name+' from your computer. Local files are not saved to the list.');
});
function renderVList(){
  var el=$('#vlist');
  if(!videos.length){el.innerHTML='<p class="note">'+(me()?'Your saved videos will appear here.':'Sign in to keep a saved video list.')+'</p>';return}
  el.innerHTML=videos.map(function(x){
    var v=parseVideo(x.url),th=v&&v.thumb?'style="background-image:url('+esc(v.thumb)+')"':'';
    return '<div class="vitem"><button class="vplay" data-play="'+esc(x.id)+'" aria-label="Play '+esc(x.title||x.url)+'"><div class="th" '+th+'>'+(v&&v.thumb?'':esc(v?v.type:'link'))+'</div><div style="min-width:0"><b>'+esc(x.title||x.url)+'</b><small>'+esc(v?v.label:'Unsupported')+'</small></div></button><button class="x" data-del="'+esc(x.id)+'" aria-label="Remove from list">'+ICON.x+'</button></div>';
  }).join('');
}
$('#vlist').addEventListener('click',function(e){
  var p=e.target.closest('[data-play]'),d=e.target.closest('[data-del]');
  if(p){var x=videos.filter(function(i){return i.id===p.dataset.play})[0];var v=x&&parseVideo(x.url);if(v){playInStage(v);window.scrollTo({top:0,behavior:reduce?'auto':'smooth'})}}
  if(d){DB.removeVideo(d.dataset.del).then(function(){videos=videos.filter(function(i){return i.id!==d.dataset.del});renderVList()},fail)}
});

/* ---------- Publish ---------- */
$('#fLang').innerHTML=langOptions('javascript');
var pubExt='';
function pubFileName(){return slug($('#fTitle').value.trim()||'untitled')+'.'+(pubExt||langExt($('#fLang').value))}
function updatePreview(){
  var lang=$('#fLang').value,code=$('#fCode').value;
  $('#pvName').textContent=pubFileName();
  $('#pvLang').textContent=langLabel(lang);
  $('#pvMeta').textContent=fmtSize(byteLen(code))+' · '+lineCount(code)+' lines';
  $('#pvBody').innerHTML=BIN.isBin(code)?'<span class="tc">Binary or encrypted file: it will be uploaded exactly as it is.</span>':code?highlight(code.split('\n').slice(0,80).join('\n'),lang):'<span class="tc">Your code will appear here as you type.</span>';
}
['fTitle','fLang','fCode'].forEach(function(id){$('#'+id).addEventListener('input',updatePreview)});
$('#fCode').addEventListener('keydown',tabKey);
if($('#pubDownload'))$('#pubDownload').addEventListener('click',function(){
  var code=$('#fCode').value;if(!code.trim()){toast('Add some code first');return}
  var n=pubFileName();download(n,code);toast('Downloaded '+n);
});
function loadFile(f){
  if(!f)return;
  if(f.size>2*1024*1024){toast('File is larger than 2 MB');return}
  BIN.read(f).then(function(code){
    var ext=(f.name.indexOf('.')>0?f.name.split('.').pop():'').toLowerCase();
    $('#fCode').value=code;
    pubExt=EXT[ext]?'':BIN.cleanExt(ext);
    if(EXT[ext])$('#fLang').value=EXT[ext];
    if(!$('#fTitle').value.trim())$('#fTitle').value=f.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ');
    updatePreview();toast('Imported '+f.name);
  },function(){toast('Could not read that file')});
}
var drop=$('#drop');
drop.addEventListener('click',function(){$('#pubFile').click()});
drop.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#pubFile').click()}});
$('#pubFile').addEventListener('change',function(){loadFile(this.files[0]);this.value=''});
['dragenter','dragover'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add('over')})});
['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove('over')})});
drop.addEventListener('drop',function(e){loadFile(e.dataTransfer.files[0])});
$('#pubClear').addEventListener('click',function(){$('#pubForm').reset();pubExt='';updatePreview()});
$('#pubForm').addEventListener('submit',function(e){
  e.preventDefault();
  var title=$('#fTitle').value.trim(),code='AEVY VIDEO LINK\n'+$('#fVideo').value.trim();
  if(!title){toast('Add a video title');return}
  var vid=$('#fVideo').value.trim();
  if(!vid||!parseVideo(vid)){toast('Add a supported YouTube, Vimeo, or direct video URL');return}
  var m=me();if(!m){toast('Sign in to publish');location.hash='#/auth';return}
  $('#fLang').value='text';$('#fCode').value=code;
  var btn=$('#pubForm [type=submit]');btn.disabled=true;btn.textContent='Publishing...';
  DB.createScript({cat:'Other',vis:'public',title:title,lang:'text',author:m.name,desc:$('#fDesc').value.trim(),tags:splitTags($('#fTags').value),video:vid,ext:'txt'},code).then(function(s){
    upsertLocal(s);btn.disabled=false;btn.textContent='Publish video';
    $('#pubForm').reset();pubExt='';updatePreview();
    toast('Video published');
    location.hash='#/';
  },function(e){btn.disabled=false;btn.textContent='Publish video';fail(e)});
});

/* ---------- One-time import of the old browser-only data ---------- */
var OLD={scripts:'aevy.scripts.v1',videos:'aevy.videos.v1',users:'aevy.users.v1',session:'aevy.session',author:'aevy.author'};
function oldScripts(){
  try{var a=JSON.parse(localStorage.getItem(OLD.scripts))||[];return a.filter(function(x){return x&&x.owner!=='sys'&&typeof x.code==='string'&&typeof x.title==='string'})}catch(e){return []}
}
function oldVideos(){try{return JSON.parse(localStorage.getItem(OLD.videos))||[]}catch(e){return []}}
function importLocal(){
  var list=oldScripts().map(function(x){return {title:x.title,lang:x.lang,desc:x.desc,tags:x.tags,cat:x.cat,vis:x.vis,video:x.video,code:x.code}});
  return restoreScripts(list,oldVideos()).then(function(n){
    if(n===list.length){[OLD.scripts,OLD.videos,OLD.users,OLD.session,OLD.author].forEach(function(k){try{localStorage.removeItem(k)}catch(e){}})}
    return n;
  });
}

window.AevyCore={tileHTML:tileHTML,all:function(){return scripts},vis:vis,mine:mine,cats:CATS,cardHTML:cardHTML,toast:toast,esc:esc,fmtDate:fmtDate,
  localCount:function(){return oldScripts().length},importLocal:importLocal,
  purgeFiles:function(){return DB.purgeMyFiles()},
  dropOwner:function(id){scripts=scripts.filter(function(s){return s.owner!==id});videos=[]},
  refresh:function(){current='';route()},
  /* live updates pushed by AevyStats (realtime) */
  upsert:function(s){upsertLocal(s);refreshLists()},
  drop:function(id){var n=scripts.length;scripts=scripts.filter(function(x){return x.id!==id});if(scripts.length!==n)refreshLists()},
  byId:byId,open:openScript,view:function(){return current},isOwner:isOwner,backendOffline:function(){return backendOffline}};
/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded',function(){
  var boot=$('#boot');
  function go(){if(boot)boot.hidden=true;route()}
  if(!window.AevyAuth||!DB){boot.textContent='Could not start: the Supabase library failed to load.';return}
  var rendered=false,timer=setTimeout(function(){
    if(rendered)return;
    rendered=true;backendOffline=true;scripts=[];videos=[];go();
    toast('The video page loaded, but the server is taking too long. Check your connection and Supabase settings.');
  },4000);
  window.AevyAuth.ready.then(loadAll).then(function(){
    backendOffline=false;
    if(!rendered){rendered=true;clearTimeout(timer);go()}
    else{current='';route()}
  },function(e){
    console.error(e);
    var m=(e&&e.message)||'';
    var hint=/permission|insufficient|not-found|does not exist|schema cache|relation/i.test(m)?'Run supabase/schema.sql in the Supabase SQL editor.':'Check your connection and js/config.js.';
    if(!rendered){rendered=true;clearTimeout(timer);backendOffline=true;scripts=[];videos=[];go()}
    toast('Could not reach the backend. '+hint);
  });
});
})();

document.addEventListener('dblclick',function(e){var m=e.target.closest('.ig-media');if(!m)return;
  var b=document.querySelector('.ig-post .pact[data-act="like"][data-id="'+m.dataset.dbl+'"]');
  if(b&&b.getAttribute('aria-pressed')!=='true')b.click();
  m.classList.remove('pop');void m.offsetWidth;m.classList.add('pop');});
