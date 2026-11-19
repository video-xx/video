/* Aevy inline comments: tap Comment on a post and the comments open right under it (no popup).
   Uses the same script_comments table as the old popup, so existing comments and reviews still show. */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SB=window.AevySB&&window.AevySB.client;
if(!C||!A||!SB)return;
var esc=C.esc,open={},cache={};
function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function ago(t){var s=Math.max(0,(Date.now()-t)/1000);if(s<45)return 'now';if(s<3600)return Math.round(s/60)+'m';if(s<86400)return Math.round(s/3600)+'h';if(s<604800)return Math.round(s/86400)+'d';return C.fmtDate(t)}
function av(u,n){return u&&window.AevyEco?AevyEco.avatar(u,n):'<span class="avatar" style="width:'+n+'px;height:'+n+'px">?</span>'}
function row(r){return {id:r.id,owner:r.owner,body:r.body,rating:r.rating||0,t:Date.parse(r.created)||Date.now()}}
function script(id){return C.all().filter(function(s){return s.id===id})[0]}
function cardsOf(id){return $$('.ig-post,.fb-post').filter(function(c){return c.dataset.open===id})}

function itemHTML(c,s){
  var u=A.byId(c.owner),m=A.current(),can=m&&(c.owner===m.id||(A.isAdmin&&A.isAdmin())||(s&&C.isOwner(s)));
  return '<li class="ic" data-cid="'+esc(c.id)+'">'+av(u,32)+'<div class="ic-b"><p><a class="ic-n" href="#/u/'+esc(u?u.username:'')+'">'+esc(u?u.name:'Member')+'</a>'+(window.AevyBadge&&u?AevyBadge.html(u):'')+' '+(c.rating?'<span class="ic-r">'+c.rating+' &#9733;</span> ':'')+esc(c.body)+'</p>'+
   '<small>'+ago(c.t)+(can?' &middot; <button type="button" class="ic-del" data-icdel="'+esc(c.id)+'">Delete</button>':'')+'</small></div></li>';
}
function panelHTML(id){
  var list=cache[id],s=script(id),m=A.current();
  return '<div class="icp" data-icp="'+esc(id)+'"><ul class="icl">'+(list?(list.length?list.map(function(c){return itemHTML(c,s)}).join(''):'<li class="ic-empty">No comments yet. Start the conversation.</li>'):'<li class="ic-empty">Loading...</li>')+'</ul>'+
   (m?'<form class="icf" data-icf="'+esc(id)+'">'+av(m,32)+'<input class="ic-in" maxlength="600" placeholder="Add a comment..." autocomplete="off" aria-label="Add a comment"><button type="submit" class="ic-post" disabled>Post</button></form>':'<p class="ic-empty"><a href="#/auth"><u>Sign in</u></a> to comment.</p>')+'</div>';
}
function paint(id){
  cardsOf(id).forEach(function(card){
    var old=$('.icp',card),b=$('[data-act="cmt"]',card);
    if(!open[id]){if(old)old.remove();if(b){b.setAttribute('aria-expanded','false');b.classList.remove('on-c')}return}
    var keep=old&&$('.ic-in',old)?$('.ic-in',old).value:'';
    if(old)old.remove();
    card.insertAdjacentHTML('beforeend',panelHTML(id));
    if(keep){var i=$('.ic-in',card);if(i){i.value=keep;var p=$('.ic-post',card);if(p)p.disabled=false}}
    if(b){b.setAttribute('aria-expanded','true');b.classList.add('on-c')}
  });
}
function load(id){
  return SB.from('script_comments').select('*').eq('script_id',id).order('created',{ascending:false}).limit(60).then(function(r){
    cache[id]=r.error?[]:r.data.map(row);
    var miss=cache[id].some(function(c){return !A.byId(c.owner)});
    return miss?A.refreshProfiles():null;
  },function(){cache[id]=[]}).then(function(){paint(id)});
}
function toggle(id){
  open[id]=!open[id];paint(id);
  if(open[id]){load(id);var i=$('.ig-post[data-open="'+id+'"] .ic-in');if(i&&window.matchMedia('(min-width:761px)').matches)i.focus()}
}
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-act="cmt"]');
  if(b&&b.dataset.id){e.stopPropagation();toggle(b.dataset.id);return}
  var d=e.target.closest('[data-icdel]');
  if(d){
    e.stopPropagation();if(!confirm('Delete this comment?'))return;
    var id=d.dataset.icdel,sid=d.closest('.icp').dataset.icp;d.disabled=true;
    SB.from('script_comments').delete().eq('id',id).select('id').then(function(r){
      if(r.error||!r.data||!r.data.length){d.disabled=false;C.toast('Could not delete');return}
      cache[sid]=(cache[sid]||[]).filter(function(c){return c.id!==id});paint(sid);
    });
  }
},true);
document.addEventListener('input',function(e){
  var i=e.target.closest&&e.target.closest('.ic-in');if(!i)return;
  var p=i.parentNode.querySelector('.ic-post');if(p)p.disabled=!i.value.trim();
});
document.addEventListener('submit',function(e){
  var f=e.target.closest&&e.target.closest('.icf');if(!f)return;
  e.preventDefault();
  var id=f.dataset.icf,m=A.current(),i=$('.ic-in',f),body=i.value.trim(),btn=$('.ic-post',f);
  if(!m||!body)return;btn.disabled=true;
  SB.from('script_comments').insert({script_id:id,owner:m.id,body:body}).select('*').single().then(function(r){
    if(r.error){btn.disabled=false;C.toast(r.error.message||'Could not post');return}
    cache[id]=[row(r.data)].concat(cache[id]||[]);paint(id);
  },function(){btn.disabled=false;C.toast('Cannot reach the server')});
});
/* feeds redraw themselves now and then: put open comment panels back */
var t=0;
new MutationObserver(function(){
  clearTimeout(t);t=setTimeout(function(){
    Object.keys(open).forEach(function(id){
      if(!open[id])return;
      cardsOf(id).forEach(function(c){if(!$('.icp',c)){paint(id);if(!cache[id])load(id)}})
    });
  },80);
}).observe(document.body,{childList:true,subtree:true});
window.addEventListener('aevy:auth',function(){Object.keys(open).forEach(function(id){if(open[id])paint(id)})});
})();
