/* Aevy profile (own page #/profile and everyone's page #/u/<username>):
   cover + photo header, stats, tabs (Scripts / Posts / About / Settings), edit-profile dialog.
   Follow / Message / online status are added to the header by js/social.js (it looks for .pf-main, .pf-un, .pf-acts, .pf-stats). */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth;
if(!C||!A)return;
var esc=C.esc,$=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var ctx=null,tab='scripts',lastUid='',lay=(function(){try{return localStorage.getItem('aevy.lay')==='list'?'list':'grid'}catch(e){return 'grid'}})();
function safeImg(u){return /^https:\/\//i.test(u||'')?u:''}
function av(u,n){return window.AevyEco?AevyEco.avatar(u,n):''}
function badge(u,big){return window.AevyBadge?AevyBadge.html(u,big):''}
function n0(n){return (n||0).toLocaleString()}
function totals(list){
  var t={dl:0,likes:0,rs:0,rc:0};
  list.forEach(function(s){t.dl+=s.downloads||0;t.likes+=s.likes||0;t.rs+=s.rsum||0;t.rc+=s.rcount||0});
  return t;
}
function ic(p){return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'}
var IC={
  pin:ic('<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  link:ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  cal:ic('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  cam:ic('<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/>'),
  share:ic('<path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  check:ic('<path d="M5 12.5l4.2 4.2L19 7"/>')
};

function header(u,own,list){
  var t=totals(list),cv=safeImg(u.cover);
  var rating=t.rc?(t.rs/t.rc).toFixed(1):'-';
  var tabs=[['scripts','Scripts',list.length],['photos','Photos'],['about','About']];
  if(own)tabs.push(['saved','Saved']);
  if(own)tabs.push(['settings','Settings']);
  var web=u.website?'<a class="ig-web" href="'+esc(u.website)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(u.website.replace(/^https?:\/\/(www\.)?/i,'').replace(/\/$/,''))+'</a>':'';
  return '<div class="pp-card ig"><div class="pp-cover'+(cv?' has':'')+'" style="--c:'+esc(u.color)+(cv?';background-image:url(\''+esc(cv)+'\')':'')+'"></div>'+
    '<div class="pp-head ig-head"><div class="pp-av ig-av"><span class="ig-ring">'+av(u,150)+'</span>'+(own?'<button type="button" class="pf-cam" data-img="avatar" aria-label="Change profile photo" title="Change profile photo">'+IC.cam+'</button>':'')+'</div>'+
    '<div class="pf-main" data-uid="'+esc(u.id)+'"><div class="pf-row"><div class="pp-id"><h1>'+esc(u.username)+'</h1><p class="pf-un">'+esc(u.name)+badge(u,true)+'</p></div>'+
    '<div class="pf-acts">'+(own?'<button type="button" class="btn btn-sm" data-pp="edit">Edit profile</button>':'')+'<button type="button" class="btn btn-sm" data-pp="share">'+IC.share+'Share</button>'+(own?'':'<button type="button" class="btn btn-sm" data-pp="report">Report</button>')+'</div></div>'+
    '<ul class="pf-stats"><li><b>'+n0(list.length)+'</b><span>'+(list.length===1?'script':'scripts')+'</span></li></ul>'+
    '<div class="ig-bio"><strong class="ig-name">'+esc(u.name)+'</strong>'+(u.bio?'<p>'+esc(u.bio)+'</p>':'')+(u.location?'<p class="ig-loc">'+IC.pin+esc(u.location)+'</p>':'')+web+
    '<p class="ig-sub">'+n0(t.dl)+' downloads &middot; '+n0(t.likes)+' likes &middot; '+rating+' &#9733;</p></div></div></div>'+
    '<nav class="pp-tabs ig-tabs" role="tablist" aria-label="Profile sections">'+tabs.map(function(x){return '<button type="button" role="tab" data-ptab="'+x[0]+'" class="'+(x[0]===tab?'on':'')+'" aria-selected="'+(x[0]===tab)+'">'+x[1]+(x[2]!=null?'<small>'+x[2]+'</small>':'')+'</button>'}).join('')+'</nav></div>';
}
function aboutCard(u,own){
  var meta='';
  if(u.location)meta+='<li>'+IC.pin+'<span>'+esc(u.location)+'</span></li>';
  if(u.website)meta+='<li>'+IC.link+'<a href="'+esc(u.website)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(u.website.replace(/^https?:\/\/(www\.)?/i,'').replace(/\/$/,''))+'</a></li>';
  meta+='<li>'+IC.cal+'<span>Joined '+C.fmtDate(u.created)+'</span></li>';
  var w=window.AevyBadge,b='';
  if(w&&w.isAdmin(u))b='<span class="rbadge admin">Admin</span> ';
  var pres='';
  return '<div class="hs-card pp-about"><h3>About</h3>'+(u.bio?'<p class="pp-bio">'+esc(u.bio)+'</p>':'<p class="pp-bio muted-p">'+(own?'Add a short bio so people know who you are.':'No bio yet.')+'</p>')+'<ul class="pp-meta">'+meta+'</ul>'+
    (w&&(w.isVerified(u)||w.isAdmin(u))?'<p class="pp-ver">'+(window.AevyBadge?AevyBadge.html(u):'')+'<span>'+(w.isAdmin(u)?'Aevy administrator':'Creator')+'</span></p>':'')+'</div>'+(own?completeCard(u):'');
}
function completeCard(u){
  var steps=[['Profile photo',!!safeImg(u.avatar),'data-img="avatar"'],['Cover photo',!!safeImg(u.cover),'data-img="cover"'],['Bio',!!u.bio,'data-pp="edit"'],['Location',!!u.location,'data-pp="edit"'],['Website',!!u.website,'data-pp="edit"']];
  var done=steps.filter(function(s){return s[1]}).length;
  if(done===steps.length)return '';
  return '<div class="hs-card pp-complete"><h3>Complete your profile</h3><div class="pp-bar"><i style="width:'+Math.round(done/steps.length*100)+'%"></i></div><p class="muted-p">'+done+' of '+steps.length+' done</p><ul>'+
    steps.map(function(s){return '<li class="'+(s[1]?'done':'')+'">'+(s[1]?'<span class="tick">'+IC.check+'</span>':'<button type="button" class="linkish" '+s[2]+'>+ Add</button>')+'<span>'+s[0]+'</span></li>'}).join('')+'</ul></div>';
}

function scriptsPane(){
  var u=ctx.u,own=ctx.own,list=ctx.list,lg=own?C.localCount():0;
  return '<div class="pp-tools">'+(list.length>4?'<input class="field" id="ppSearch" type="search" placeholder="Search scripts" aria-label="Search scripts">':'<span></span>')+'<span class="pp-view" role="group" aria-label="Layout"><button type="button" data-lay="list" class="'+(lay==='list'?'on':'')+'" aria-label="List view" title="List">'+ic('<path d="M4 6h16M4 12h16M4 18h16"/>')+'</button><button type="button" data-lay="grid" class="'+(lay==='grid'?'on':'')+'" aria-label="Grid view" title="Grid">'+ic('<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>')+'</button></span>'+(own?'<a class="btn btn-primary btn-sm" href="#/publish">Publish script</a>':'')+'</div>'+
   (lg?'<div class="notice">'+lg+' script'+(lg===1?'':'s')+' found in this browser from the old local version. <button class="btn" id="claim">Upload '+(lg===1?'it':'them')+' to your account</button></div>':'')+
   '<div class="feed-list'+(lay==='grid'?' pp-grid':'')+'" id="ppCards">'+cards(list,own)+'</div>';
}
function cards(list,own){
  if(lay==='grid'&&C.tileHTML&&list.length)return list.map(C.tileHTML).join('');
  return list.length?list.map(C.cardHTML).join(''):'<div class="empty"><h3>'+(own?'Nothing published yet':'No public scripts yet')+'</h3><p>'+(own?'Your scripts appear here. Only you can edit or delete them.':'Check back later.')+'</p>'+(own?'<a class="btn btn-primary" href="#/publish">Publish your first script</a>':'')+'</div>';
}
function savedPane(){
  var l=window.AevySaved?AevySaved.list():[];
  return '<div class="feed-list'+(lay==='grid'?' pp-grid':'')+'">'+(l.length?l.map(C.cardHTML).join(''):'<div class="empty"><h3>Nothing saved yet</h3><p>Tap Save on any script and it appears here. Only you can see this tab.</p><a class="btn btn-primary" href="#/scripts">Browse scripts</a></div>')+'</div>';
}
function decorate(){
  if(!ctx||!window.AevyPins)return;
  var ids=AevyPins.ids(ctx.u.id);
  $$('#ppCards .card[data-open]').forEach(function(c){
    var old=c.querySelector('.pin-ctl');if(old)old.remove();
    var id=c.dataset.open,on=ids.indexOf(id)>-1,h=c.querySelector('.post-head'),v=c.querySelector('.vtag');
    c.classList.toggle('is-pinned',on);
    if(!h||(!on&&!ctx.own))return;
    var el=document.createElement('span');el.className='pin-ctl';
    el.innerHTML=(on?'<span class="pin-tag">Pinned</span>':'')+(ctx.own?'<button type="button" class="pin-btn" data-pin="'+esc(id)+'">'+(on?'Unpin':'Pin')+'</button>':'');
    h.insertBefore(el,v||null);
  });
}
function applyPins(){
  if(!ctx||!window.AevyPins)return;
  ctx.list=AevyPins.sort(ctx.list,ctx.u.id);
  if(tab==='scripts'&&$('#ppPane'))paintPane();
}
window.addEventListener('aevy:pins',function(){if(ctx&&ctx.own)applyPins()});
window.addEventListener('aevy:saved',function(){if(tab==='saved'&&ctx&&ctx.own&&$('#ppPane'))paintPane()});
function aboutPane(){
  var u=ctx.u;
  return '<div class="hs-card"><h3>About '+esc(u.name)+'</h3><p class="pp-bio">'+(u.bio?esc(u.bio):'<span class="muted-p">No bio yet.</span>')+'</p></div>';
}
function settingsPane(){
  var vis=window.AevySocial&&AevySocial.visible?AevySocial.visible():true;
  var priv=false;try{priv=localStorage.getItem('aevy_priv')==='1'}catch(e){}
  var dark=document.documentElement.dataset.theme==='dark';
  function row(t,sub,ctl){return '<div class="ig-row"><span><b>'+t+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</span>'+ctl+'</div>'}
  function sw(id,on){return '<label class="ig-sw"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+'><i></i></label>'}
  return '<div class="pp-settings ig-settings">'+
   '<h4>Your account</h4><div class="ig-group">'+
    row('Edit profile','Name, bio, photo, links','<button class="btn btn-sm" id="igEdit" type="button">Edit</button>')+
    row('Email',esc(A.email()),'')+'</div>'+
   '<h4>Who can see your content</h4><div class="ig-group">'+
    row('Private account','Only approved followers can see your posts',sw('igPriv',priv))+
    row('Activity status','Show when you are online',sw('ppVis',vis))+'</div>'+
   '<h4>How you use Aevy</h4><div class="ig-group">'+
    row('Dark mode','',sw('igDark',dark))+
    row('Notifications','Message and like alerts',sw('igNotif',(window.Notification&&Notification.permission==='granted')))+'</div>'+
   '<h4>Login and security</h4><form class="ig-group form" id="pw"><div class="ig-row col"><b>Change password</b><input class="field" id="pOld" type="password" placeholder="Current password" autocomplete="current-password" required><input class="field" id="pNew" type="password" placeholder="New password (8+ characters)" autocomplete="new-password" required><p class="ferr" role="alert"></p><button class="btn btn-primary btn-sm">Update password</button></div></form>'+
   '<h4>More info and support</h4><div class="ig-group"><a class="ig-row" href="#/privacy"><b>Privacy and data</b><span>&rsaquo;</span></a><a class="ig-row" href="#/terms"><b>Terms</b><span>&rsaquo;</span></a></div>'+
   '<div class="ig-group"><button class="ig-row ig-link" id="igOut" type="button"><b>Log out</b></button></div>'+
   '<div class="danger-zone"><h3>Delete account</h3><p>Permanently removes your account, profile, photos, every script you published and all their files.</p><form id="del"><input class="field" id="dPw" type="password" placeholder="Confirm password" required><button class="btn btn-danger">Delete account</button></form><p class="ferr" id="dErr" role="alert"></p></div></div>';
}
function paintPane(){
  var pane=$('#ppPane');if(!pane||!ctx)return;
  $$('.pp-tabs [data-ptab]').forEach(function(b){var on=b.dataset.ptab===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
  if(tab==='photos'&&window.AevyPhotos)AevyPhotos.pane(ctx.u,ctx.own,pane);
  else if(tab==='about')pane.innerHTML=aboutPane();
  else if(tab==='saved'&&ctx.own)pane.innerHTML=savedPane();
  else if(tab==='settings'&&ctx.own){pane.innerHTML=settingsPane();wireSettings()}
  else{tab='scripts';pane.innerHTML=scriptsPane();wireScripts();decorate()}
}
function wireScripts(){
  var s=$('#ppSearch');
  if(s)s.oninput=function(){var q=this.value.trim().toLowerCase();$('#ppCards').innerHTML=cards(ctx.list.filter(function(x){return !q||(x.title+' '+(x.desc||'')+' '+(x.tags||[]).join(' ')).toLowerCase().indexOf(q)>-1}),ctx.own);decorate()};
  var c=$('#claim');
  if(c)c.onclick=function(){var b=this;b.disabled=true;b.textContent='Uploading...';C.importLocal().then(function(n){C.toast(n+' script(s) uploaded');window.dispatchEvent(new Event('aevy:auth'))},function(x){b.disabled=false;C.toast(x.message)})};
}
function wireSettings(){
  var e1=$('#igEdit');if(e1)e1.onclick=openEdit;
  var pv=$('#igPriv');if(pv)pv.onchange=function(){try{localStorage.setItem('aevy_priv',this.checked?'1':'0')}catch(x){}C.toast(this.checked?'Account set to private (display only)':'Account is public')};
  var dk=$('#igDark');if(dk)dk.onchange=function(){var t=document.getElementById('theme');if(t)t.click()};
  var nf=$('#igNotif');if(nf)nf.onchange=function(){var b=this;if(b.checked&&window.Notification)Notification.requestPermission().then(function(r){b.checked=r==='granted'})};
  var lo=$('#igOut');if(lo)lo.onclick=function(){var f=A.signOut||A.logout||A.out;if(f)Promise.resolve(f.call(A)).then(function(){location.hash='#/'});else C.toast('Use the account menu to sign out')};
  var v=$('#ppVis');if(v)v.onchange=function(){if(window.AevySocial&&AevySocial.setVisible)AevySocial.setVisible(this.checked);C.toast(this.checked?'Online status is visible':'Online status is hidden')};
  var m=ctx.u;
  $('#pw').onsubmit=function(e){e.preventDefault();var b=this.querySelector('.ferr'),f=this;b.textContent='';A.changePassword($('#pOld').value,$('#pNew').value).then(function(){f.reset();C.toast('Password changed')},function(x){b.textContent=x.message||String(x)})};
  $('#del').onsubmit=function(e){e.preventDefault();if(!confirm('Delete your account and all your scripts? This cannot be undone.'))return;
    A.remove($('#dPw').value,function(){return A.purgeImages().then(C.purgeFiles)}).then(function(){C.dropOwner(m.id);window.dispatchEvent(new Event('aevy:auth'));location.hash='#/'},function(x){$('#dErr').textContent=x.message||String(x)})};
}

/* ---------- edit dialog ---------- */
var dlg=document.createElement('dialog');dlg.className='pp-dlg';dlg.id='ppEdit';document.body.appendChild(dlg);
dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close()});
function openEdit(){
  var m=A.current();if(!m)return;
  dlg.innerHTML='<form class="form" id="ppForm"><div class="pp-dh"><h2>Edit profile</h2><button type="button" class="icon-btn" data-x aria-label="Close">&times;</button></div>'+
   '<div class="pp-photos">'+av(m,56)+'<div><button type="button" class="btn btn-sm" data-img="avatar">Change photo</button> <button type="button" class="btn btn-sm" data-img="cover">Change cover</button></div></div>'+
   '<div><label class="l" for="pName">Display name</label><input class="field" id="pName" maxlength="40" value="'+esc(m.name)+'" required></div>'+
   '<div><label class="l" for="pBio">Bio <span class="muted-p" id="pBioN">'+(m.bio||'').length+'/280</span></label><textarea class="field" id="pBio" maxlength="280" rows="3" placeholder="Tell people about yourself">'+esc(m.bio)+'</textarea></div>'+
   '<div class="row2"><div><label class="l" for="pLoc">Location</label><input class="field" id="pLoc" maxlength="40" value="'+esc(m.location)+'" placeholder="City, Country"></div>'+
   '<div><label class="l" for="pWeb">Website</label><input class="field" id="pWeb" maxlength="100" inputmode="url" value="'+esc(m.website)+'" placeholder="https://"></div></div>'+
   '<p class="ferr" role="alert" id="pfErr"></p><div class="pp-df"><button type="button" class="btn" data-x>Cancel</button><button class="btn btn-primary">Save changes</button></div></form>';
  $('#pBio',dlg).oninput=function(){$('#pBioN',dlg).textContent=this.value.length+'/280'};
  $$('[data-x]',dlg).forEach(function(b){b.onclick=function(){dlg.close()}});
  $('#ppForm',dlg).onsubmit=function(e){
    e.preventDefault();var er=$('#pfErr',dlg),btn=this.querySelector('.btn-primary');er.textContent='';btn.disabled=true;
    A.update({name:$('#pName',dlg).value,bio:$('#pBio',dlg).value,location:$('#pLoc',dlg).value,website:$('#pWeb',dlg).value}).then(function(){dlg.close();C.toast('Profile saved');C.refresh()},function(x){btn.disabled=false;er.textContent=x.message||String(x)});
  };
  dlg.showModal();
}
/* photo buttons inside the dialog use the same picker as the page (eco.js) */
dlg.addEventListener('click',function(e){var b=e.target.closest('[data-img]');if(b&&window.AevyEco&&AevyEco.pick){dlg.close();AevyEco.pick(b.dataset.img)}});

document.addEventListener('click',function(e){
  var lb=e.target.closest('[data-lay]');
  if(lb&&lb.closest('.pp')){lay=lb.dataset.lay;try{localStorage.setItem('aevy.lay',lay)}catch(x){}paintPane();return}
  var t=e.target.closest('[data-ptab]');
  if(t&&t.closest('.pp')){tab=t.dataset.ptab;paintPane();return}
  var a=e.target.closest('[data-pp]');
  if(!a||!a.closest('#view-profile,#view-u'))return;
  if(a.dataset.pp==='edit')openEdit();
  if(a.dataset.pp==='report'&&ctx&&window.AevyReport)AevyReport.open('profile',ctx.u.id,'@'+ctx.u.username);
  if(a.dataset.pp==='share'&&ctx){
    var url=location.origin+location.pathname+'#/u/'+ctx.u.username;
    if(navigator.share){navigator.share({title:ctx.u.name+' (@'+ctx.u.username+') on Aevy',text:'Check out '+ctx.u.name+' on Aevy',url:url}).catch(function(){});return}
    (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(url):Promise.reject()).then(function(){C.toast('Profile link copied')},function(){window.prompt('Copy this link',url)});
  }
});

function render(sel,u,own){
  var box=$(sel);if(!box)return;
  if(lastUid!==u.id+(own?'!':'')){tab='scripts';lastUid=u.id+(own?'!':'')}
  var list=own?C.mine().slice().sort(function(a,b){return b.created-a.created}):C.vis().filter(function(s){return s.owner===u.id}).sort(function(a,b){return b.created-a.created});
  ctx={u:u,own:own,list:list};
  box.innerHTML='<div class="wrap pp">'+header(u,own,list)+'<div class="pp-body"><aside class="pp-side">'+aboutCard(u,own)+'</aside><section class="pp-pane" id="ppPane"></section></div></div>';
  paintPane();
  if(window.AevyPins){var uid=u.id;AevyPins.load(uid).then(function(){if(ctx&&ctx.u.id===uid)applyPins()})}
}
window.AevyProfile={render:render};
})();
