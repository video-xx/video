/* Aevy Explore (photo grid + people search) and Instagram-style profile counts. */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SBW=window.AevySB;if(!C||!A||!SBW)return;
var SB=SBW.client,esc=C.esc,$=function(s){return document.querySelector(s)};
var at=0,busy=false;
function tile(p){return '<button type="button" class="ph-tile" data-pgrid="'+esc(p.id)+'" aria-label="Open photo"><img src="'+esc(p.image)+'" alt="" loading="lazy" decoding="async"><span class="ph-ov"><i>&#9829; '+(p.likes||0)+'</i><i>&#128172; '+(p.comments||0)+'</i></span></button>'}
function render(){
  var r=$('#exploreRoot');if(!r||busy)return;
  if(!r.firstChild)r.innerHTML='<div class="ex-head"><input id="exQ" class="ex-q" type="search" placeholder="Search people" autocomplete="off" aria-label="Search people"><div id="exPeople"></div></div><div id="exGrid" class="ph-grid"><p class="ph-empty">Loading...</p></div>';
  if(Date.now()-at<20000&&$('#exGrid .ph-tile'))return;
  busy=true;
  SB.from('posts').select('id,image,likes,comments,created').neq('image','').order('created',{ascending:false}).limit(90).then(function(x){
    busy=false;if(x.error){$('#exGrid').innerHTML='<div class="empty"><h3>Could not load posts</h3></div>';return}
    at=Date.now();
    var l=(x.data||[]).filter(function(p){return /^https:\/\//i.test(p.image||'')});
    l.sort(function(a,b){return (b.likes||0)-(a.likes||0)||String(b.created).localeCompare(String(a.created))});
    $('#exGrid').innerHTML=l.length?l.map(tile).join(''):'<div class="empty"><h3>No posts yet</h3><p>Be the first to share a photo.</p></div>';
  },function(){busy=false});
}
document.addEventListener('input',function(e){
  if(e.target.id!=='exQ')return;
  var q=e.target.value.trim().toLowerCase(),b=$('#exPeople');if(!q){b.innerHTML='';return}
  b.innerHTML=A.all().filter(function(u){return (u.username+' '+(u.name||'')).toLowerCase().indexOf(q)>-1}).slice(0,8).map(function(u){
    return '<a class="ex-p" href="#/u/'+esc(u.username)+'">'+(window.AevyEco?AevyEco.avatar(u,40):'')+'<b>'+esc(u.username)+'</b><small>'+esc(u.name||'')+'</small></a>';
  }).join('')||'<p class="note">No people found.</p>';
});
function check(){if(/^#\/explore/.test(location.hash))setTimeout(render,0)}
window.addEventListener('hashchange',check);setTimeout(check,900);
/* profile: posts / followers / following */
function fill(){
  var f=$('#pfFers');if(!f||f.dataset.done)return;var m=$('.pf-main');if(!m)return;f.dataset.done='1';var id=m.dataset.uid;
  if(window.AevySocial&&AevySocial.counts)AevySocial.counts(id).then(function(c){f.textContent=c[0];var g=$('#pfFing');if(g)g.textContent=c[1]});
  SB.from('posts').select('id',{count:'exact',head:true}).eq('owner',id).neq('image','').then(function(r){var p=$('#pfPosts');if(p)p.textContent=r.count||0},function(){});
}
new MutationObserver(fill).observe(document.body,{childList:true,subtree:true});
})();
