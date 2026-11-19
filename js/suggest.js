/* Aevy suggestions: a "Follow Aevy" prompt + a horizontal "Suggested accounts" strip at the top of Home.
   Real accounts only (from public.profiles); the Follow buttons use the normal follow system in social.js.
   Turn off in js/config.js with  suggest: false . */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,cfg=window.AEVY_CONFIG||{};
if(!C||!A||cfg.suggest===false)return;
var esc=C.esc,KEY='aevy.followprompt.v1';
function $(s,r){return (r||document).querySelector(s)}
function me(){return A.current()}
function S(){return window.AevySocial}
function av(u,n){return window.AevyEco?AevyEco.avatar(u,n):''}
function badge(u){return window.AevyBadge?AevyBadge.html(u):''}
function dismissed(){try{return localStorage.getItem(KEY)==='1'}catch(e){return false}}
function dismiss(){try{localStorage.setItem(KEY,'1')}catch(e){}}
function fb(u){var m=me();return m&&S()?S().followBtn(u.id):'<a class="fbtn" href="#/auth">Follow</a>'}
function aevyUser(){
  var n=((cfg.adminUsernames||[])[0]||'aevy').toLowerCase();
  return A.all().filter(function(u){return String(u.username).toLowerCase()===n})[0];
}
function prompt(){
  var u=aevyUser(),m=me(),f=S()?S().following():{};
  if(!u||dismissed()||(m&&(m.id===u.id||f[u.id])))return '';
  return '<div class="sg-prompt">'+av(u,44)+'<div class="sg-pt"><b>Follow '+esc(u.name)+badge(u)+'</b><small>Get new scripts and updates from the Aevy team in your feed.</small></div>'+fb(u)+'<button type="button" class="sg-x" data-sgx aria-label="Dismiss">&times;</button></div>';
}
function strip(){
  if(cfg.suggestStrip!==true)return '';   /* hidden by default; set suggestStrip: true in js/config.js to show it */
  var m=me(),f=S()?S().following():{},count={};
  C.vis().forEach(function(s){count[s.owner]=(count[s.owner]||0)+1});
  var aev=aevyUser();
  var us=A.all().filter(function(u){return (!m||u.id!==m.id)&&!f[u.id]&&(!aev||u.id!==aev.id)}).sort(function(a,b){return (count[b.id]||0)-(count[a.id]||0)||b.created-a.created}).slice(0,10);
  if(!us.length)return '';
  return '<div class="sg-strip"><h3>Suggested accounts</h3><div class="sg-row">'+us.map(function(u){
    return '<div class="sg-card"><a class="sg-who" href="#/u/'+esc(u.username)+'"><span class="sg-av">'+av(u,64)+'</span><b>'+esc(u.name)+badge(u)+'</b><small>@'+esc(u.username)+'</small><small>'+(count[u.id]||0)+' scripts</small></a>'+fb(u)+'</div>';
  }).join('')+'</div></div>';
}
function paint(){
  var mid=$('#homeRoot .hs-mid');if(!mid)return;
  var box=$('#sgBox');
  if(!box){box=document.createElement('section');box.id='sgBox';mid.insertBefore(box,mid.firstChild)}
  if(box.querySelector('button:disabled'))return;
  box.innerHTML=me()?'':prompt()+strip();
}
document.addEventListener('click',function(e){
  if(e.target.closest('[data-sgx]')){dismiss();var b=$('.sg-prompt');if(b)b.remove()}
});
window.addEventListener('aevy:following',function(){setTimeout(paint,150)});
window.addEventListener('aevy:auth',function(){setTimeout(paint,400)});
var root=$('#homeRoot');
if(root)new MutationObserver(function(){if(!$('#sgBox'))paint()}).observe(root,{childList:true});
(A.ready||Promise.resolve()).then(function(){setTimeout(paint,300)});
})();
