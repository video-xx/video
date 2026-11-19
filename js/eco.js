/* Aevy ecosystem views: auth, profile, publisher pages, categories. */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,esc=C.esc;
function $(s){return document.querySelector(s)}
function mk(id,html){var s=document.createElement('section');s.className='view';s.id='view-'+id;s.dataset.view=id;s.innerHTML=html;$('main').appendChild(s);return s}
function head(e,t,p){return '<div class="page-head"><div class="wrap"><p class="eyebrow">'+e+'</p><h1>'+t+'</h1>'+(p?'<p>'+p+'</p>':'')+'</div></div>'}
function safeImg(u){return /^https:\/\//i.test(u||'')?u:''}
function hsh(s){var h=2166136261;s=String(s);for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function genAv(u){
  /* generated profile picture for guests: seeded gradient, sun and a friendly character (same name = same picture) */
  var h=hsh(u.username||u.id),a=h%360,b=(a+50+(h>>>8)%110)%360,sx=14+(h>>>12)%36,sy=12+(h>>>16)%22,r=12+(h>>>20)%12,ears=(h>>>24)%3,
      skin='hsl('+((b+20)%360)+',75%,90%)',inner='hsl('+a+',70%,45%)',g='g'+h;
  var e=ears===1?'<circle cx="21" cy="19" r="5" fill="'+skin+'"/><circle cx="43" cy="19" r="5" fill="'+skin+'"/>':ears===2?'<path d="M21 26 20 12 29 20zM43 26 44 12 35 20z" fill="'+skin+'"/>':'';
  return '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="'+g+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl('+a+',85%,62%)"/><stop offset="1" stop-color="hsl('+b+',85%,52%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#'+g+')"/><circle cx="'+sx+'" cy="'+sy+'" r="'+r+'" fill="#fff" opacity=".22"/><path d="M10 66c1-14 11-20 22-20s21 6 22 20z" fill="'+skin+'"/>'+e+'<circle cx="32" cy="29" r="12" fill="'+skin+'"/><circle cx="27.5" cy="28" r="1.7" fill="'+inner+'"/><circle cx="36.5" cy="28" r="1.7" fill="'+inner+'"/><path d="M27.5 33.5q4.5 3.5 9 0" stroke="'+inner+'" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
}
function avatar(u,sz){
  if(u.guest&&!safeImg(u.avatar))return '<span class="avatar has-img gen" data-uid="'+esc(u.id||'')+'" style="width:'+sz+'px;height:'+sz+'px">'+genAv(u)+'</span>';
  var st='--c:'+u.color+';width:'+sz+'px;height:'+sz+'px;font-size:'+Math.round(sz*.42)+'px',img=safeImg(u.avatar);
  if(img)return '<span class="avatar has-img" data-uid="'+esc(u.id||'')+'" style="'+st+'"><img src="'+esc(img)+'" alt="" loading="lazy" decoding="async"></span>';
  return '<span class="avatar" data-uid="'+esc(u.id||'')+'" style="'+st+'">'+esc((u.name||u.username).charAt(0).toUpperCase())+'</span>';
}
function err(box,e){box.textContent=e.message||String(e)}
function changed(){window.dispatchEvent(new Event('aevy:auth'))}

var EYE='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
function pw(id,label,ac,extra){return '<div><label class="l" for="'+id+'">'+label+'</label><div class="pwrap"><input class="field" id="'+id+'" type="password" autocomplete="'+ac+'" required '+(extra||'')+'><button type="button" class="eye" data-eye="'+id+'" aria-label="Show password">'+EYE+'</button></div></div>'}
function idf(id,hint){return '<input class="field" id="'+id+'" type="email" autocomplete="email" autocapitalize="off" spellcheck="false" required placeholder="you@example.com">'}
mk('auth','<div class="auth-shell"><aside class="auth-side"><span></span>'+
 '<div><p class="eyebrow">CPM script ecosystem</p><h1 id="aTitle">Welcome back.</h1><p class="auth-lead" id="aLead">Sign in to publish scripts, manage your files and keep your private work private.</p></div>'+
 '<ul class="auth-points"><li><b>Own your uploads</b><span>Only you can edit or delete what you publish.</span></li><li><b>Public or private</b><span>Choose who can see each script.</span></li><li><b>Free, no ads</b><span>No card, no spam, no selling your data. Your email stays private.</span></li><li><b>Secure by design</b><span>Passwords are encrypted and never visible to us.</span></li></ul></aside>'+
 '<div class="auth-main"><div class="auth-card">'+
 '<div id="stChoose" hidden><h2>Pick your username</h2><p class="sub2" id="stSub">One last step. Your username is your public handle.</p>'+
 '<form class="form" id="fDone"><div><label class="l" for="dN">Display name</label><input class="field" id="dN" maxlength="40" autocomplete="name"></div>'+
 '<div><label class="l" for="dU">Username</label><input class="field" id="dU" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="letters, numbers, _"><p class="hint" id="dH"></p></div>'+
 '<p class="ferr" role="alert"></p><button class="btn btn-primary btn-lg">Continue</button><button type="button" class="linkbtn" id="dOut">Use a different account</button></form></div>'+
 '<div id="stMain"><div class="seg" role="tablist"><button type="button" role="tab" class="on" data-mode="in">Sign in</button><button type="button" role="tab" data-mode="up">Create account</button></div>'+
 '<form class="form" id="fIn"><div><label class="l" for="siE">Email</label>'+idf('siE')+'</div>'+pw('siP','Password','current-password')+
 '<div class="rowsb"><span class="ferr" role="alert" id="inErr"></span><button type="button" class="linkbtn" id="fgt">Forgot password?</button></div><button class="btn btn-primary btn-lg">Sign in</button></form>'+
 '<form class="form" id="fUp" hidden><div><label class="l" for="suU">Username</label><input class="field" id="suU" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false" required placeholder="letters, numbers, _"><p class="hint" id="suH"></p></div>'+
 '<div><label class="l" for="suN">Display name <small>(optional)</small></label><input class="field" id="suN" maxlength="40" autocomplete="name"></div>'+
 '<div><label class="l" for="suE">Email</label>'+idf('suE')+'</div>'+pw('suP','Password','new-password','minlength="8"')+
 '<div class="pm"><div class="pmeter" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="hint" id="suM">Use 8 or more characters.</p></div>'+
 '<p class="ferr" role="alert" id="upErr"></p><button class="btn btn-primary btn-lg">Create account</button></form>'+
 '<p class="note">By continuing you agree to our <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a>. Your email is never shown publicly.</p></div></div></div></div>');
var au=$('#view-auth'),ST={mode:'in'};
function idv(id){return $('#'+id).value.trim()}
function busy(f,on){var bt=f.querySelector('button:not([type=button])');if(bt){bt.disabled=on;bt.classList.toggle('loading',on)}}
function setMode(m){
  ST.mode=m;
  au.querySelectorAll("[data-mode]").forEach(function(x){var on=x.dataset.mode===m;x.classList.toggle('on',on);x.setAttribute('aria-selected',on)});
  $('#fIn').hidden=m!=='in';$('#fUp').hidden=m!=='up';au.querySelector('.seg').hidden=false;
  $('#aTitle').textContent=m==='in'?'Welcome back.':'Create your account.';
  $('#aLead').textContent=m==='in'?'Sign in to publish scripts, manage your files and keep your private work private.':'Join Aevy to publish, version and share your CPM scripts in under a minute.';
  ['#inErr','#upErr'].forEach(function(q){au.querySelector(q).textContent=''});
}
function renderAuth(){
  var pend=A.pending();
  $('#stChoose').hidden=!pend;$('#stMain').hidden=pend;
  if(pend){
    var sg=A.suggest();
    $('#dN').value=$('#dN').value||sg.name;$('#dU').value=$('#dU').value||sg.username;
    $('#stSub').textContent='Signed in as '+A.email()+'. Your username is your public handle.';
    $('#aTitle').textContent='Almost there.';$('#aLead').textContent='Choose a username to finish setting up your profile.';
    if($('#dU').value)hint($('#dU'),$('#dH'));
  }else setMode(ST.mode);
}
au.querySelectorAll("[data-mode]").forEach(function(b){b.onclick=function(){setMode(b.dataset.mode)}});
au.addEventListener('click',function(e){var b=e.target.closest('[data-eye]');if(!b)return;var i=$('#'+b.dataset.eye),sh=i.type==='password';i.type=sh?'text':'password';b.setAttribute('aria-label',sh?'Hide password':'Show password');b.classList.toggle('on',sh)});
/* live username availability */
var tmr;
function hint(inp,box){
  clearTimeout(tmr);var v=inp.value.trim().toLowerCase();box.className='hint';
  if(!v){box.textContent='';return}
  if(!/^[a-z0-9_]{3,20}$/.test(v)){box.textContent='3 to 20 characters: letters, numbers or underscore';return}
  box.textContent='Checking...';
  tmr=setTimeout(function(){A.checkUsername(v).then(function(f){
    if(inp.value.trim().toLowerCase()!==v)return;
    if(f===true){box.textContent='@'+v+' is available';box.className='hint ok'}
    else if(f===false){box.textContent='@'+v+' is already taken';box.className='hint bad'}
    else box.textContent='';
  })},350);
}
$('#suU').oninput=function(){hint(this,$('#suH'))};
$('#dU').oninput=function(){hint(this,$('#dH'))};
$('#suP').oninput=function(){
  var v=this.value,n=0;if(v.length>=8)n++;if(/[a-z]/.test(v)&&/[A-Z]/.test(v))n++;if(/\d/.test(v))n++;if(/[^A-Za-z0-9]/.test(v)||v.length>=14)n++;
  if(v.length<8)n=Math.min(n,1);
  au.querySelectorAll('.pmeter i').forEach(function(i,k){i.className=k<n?'s'+n:''});
  $('#suM').textContent=!v?'Use 8 or more characters.':v.length<8?'Too short':['','Weak','Okay','Good','Strong'][n];
};
function done(){ST.mode='in';changed();location.hash='#/profile'}
function after(m){if(m)done();else{changed();renderAuth()}}
$('#fgt').onclick=function(){var e=$('#inErr'),v=idv('siE');e.className='ferr';e.textContent='';
  A.resetPassword(v).then(function(){e.className='ferr okmsg';e.textContent='If that email has an account, a reset link is on its way.'},function(x){e.textContent=x.message})};
$('#fIn').onsubmit=function(e){e.preventDefault();var f=this,b=$('#inErr');b.className='ferr';b.textContent='';busy(f,true);A.signIn(idv('siE'),$('#siP').value).then(function(m){busy(f,false);f.reset();after(m)},function(x){busy(f,false);err(b,x)})};
$('#fUp').onsubmit=function(e){e.preventDefault();var f=this,b=$('#upErr');b.textContent='';busy(f,true);A.signUp({name:$('#suN').value,id:idv('suE'),username:$('#suU').value,password:$('#suP').value}).then(function(r){busy(f,false);f.reset();$('#suH').textContent='';done()},function(x){busy(f,false);err(b,x)})};
$('#fDone').onsubmit=function(e){e.preventDefault();var f=this,b=f.querySelector('.ferr');b.textContent='';busy(f,true);A.completeProfile({name:$('#dN').value,username:$('#dU').value}).then(function(){busy(f,false);done()},function(x){busy(f,false);err(b,x)})};
$('#dOut').onclick=function(){A.signOut().then(function(){changed();renderAuth()})};

mk('profile','<div id="profBody"></div>');
mk('u','<div id="pubBody"></div>');

var PIN='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
var LINK='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
var CAL='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
var CAM='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
function n0(n){return (n||0).toLocaleString()}
function totals(list){
  var t={scripts:list.length,dl:0,likes:0,views:0,rs:0,rc:0};
  list.forEach(function(s){t.dl+=s.downloads||0;t.likes+=s.likes||0;t.views+=s.views||0;t.rs+=s.rsum||0;t.rc+=s.rcount||0});
  return t;
}
/* Facebook / Instagram style header: cover photo, round profile photo, counts, bio and details. */
function pfHeader(u,own,list,mine){
  var t=totals(list),cv=safeImg(u.cover);
  var meta=[];
  if(u.location)meta.push('<li>'+PIN+'<span>'+esc(u.location)+'</span></li>');
  if(u.website)meta.push('<li>'+LINK+'<a href="'+esc(u.website)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(u.website.replace(/^https?:\/\/(www\.)?/i,'').replace(/\/$/,''))+'</a></li>');
  meta.push('<li>'+CAL+'<span>Joined '+C.fmtDate(u.created)+'</span></li>');
  var acts=own?(mine?'<a class="btn btn-sm" href="#/u/'+esc(u.username)+'">View as visitor</a>':'<a class="btn btn-primary btn-sm" href="#/profile">Edit profile</a>'):'';
  return '<div class="pf-cover'+(cv?' has':'')+'" style="--c:'+esc(u.color)+(cv?';background-image:url(\''+esc(cv)+'\')':'')+'">'+
    (own&&mine?'<div class="pf-cbtns"><button type="button" class="btn btn-sm" data-img="cover">'+CAM+(cv?'Change cover':'Add cover photo')+'</button>'+(cv?'<button type="button" class="btn btn-sm" data-rm="cover">Remove</button>':'')+'</div>':'')+'</div>'+
    '<div class="wrap pf-top"><div class="pf-av">'+avatar(u,132)+(own&&mine?'<button type="button" class="pf-cam" data-img="avatar" aria-label="Change profile photo" title="Change profile photo">'+CAM+'</button>':'')+'</div>'+
    '<div class="pf-main" data-uid="'+esc(u.id)+'"><div class="pf-row"><div><h1>'+esc(u.name)+(window.AevyBadge?AevyBadge.html(u,true):'')+'</h1><p class="pf-un">@'+esc(u.username)+'</p></div><div class="pf-acts">'+acts+'</div></div>'+
    '<ul class="pf-stats"><li><b>'+n0(t.scripts)+'</b><span>Scripts</span></li><li><b>'+n0(t.dl)+'</b><span>Downloads</span></li><li><b>'+n0(t.likes)+'</b><span>Likes</span></li><li><b>'+(t.rc?(t.rs/t.rc).toFixed(1):'-')+'</b><span>Rating</span></li></ul>'+
    (u.bio?'<p class="pf-bio">'+esc(u.bio)+'</p>':'')+'<ul class="pf-meta">'+meta.join('')+'</ul></div></div>';
}
/* ---- photo picking: shrink in the browser (profile 400x400, cover 1500x500) so uploads stay small ---- */
function shrink(file,w,h){
  return new Promise(function(res,rej){
    if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type))return rej(new Error('Choose a JPG, PNG or WebP image'));
    if(file.size>15*1048576)return rej(new Error('That image is too large (max 15 MB)'));
    var url=URL.createObjectURL(file),img=new Image();
    img.onload=function(){
      var sw=img.naturalWidth,sh=img.naturalHeight,r=Math.max(w/sw,h/sh),dw=sw*r,dh=sh*r;
      var c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
      x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingQuality='high';x.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);
      URL.revokeObjectURL(url);
      c.toBlob(function(b){b?res(b):rej(new Error('Could not process the image'))},'image/jpeg',.86);
    };
    img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('That file is not a readable image'))};
    img.src=url;
  });
}
var pickKind='';
var picker=document.createElement('input');picker.type='file';picker.accept='image/jpeg,image/png,image/webp';picker.hidden=true;document.body.appendChild(picker);
picker.addEventListener('change',function(){
  var f=picker.files&&picker.files[0],kind=pickKind;picker.value='';
  if(!f||!kind)return;
  C.toast(kind==='avatar'?'Uploading profile photo...':'Uploading cover photo...');
  (kind==='avatar'?shrink(f,400,400):shrink(f,1500,500)).then(function(b){return A.setImage(kind,b)}).then(function(){C.toast(kind==='avatar'?'Profile photo updated':'Cover photo updated');C.refresh()},function(x){C.toast(x.message||'Upload failed')});
});
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-img]'),r=e.target.closest('[data-rm]');
  if(b&&b.closest('#view-profile,#view-u')){pickKind=b.dataset.img;picker.click()}
  if(r&&r.closest('#view-profile,#view-u')){A.removeImage(r.dataset.rm).then(function(){C.toast('Removed');C.refresh()},function(x){C.toast(x.message)})}
});

function renderProfile(){
  var m=A.current();if(!m)return;
  if(window.AevyProfile){AevyProfile.render('#profBody',m,true);return}
  var mine=C.mine(),lg=C.localCount();
  $('#profBody').innerHTML=pfHeader(m,true,mine,true)+
  '<div class="wrap prof-grid"><form class="form" id="pf"><h2>Edit profile</h2><p class="note">Signed in as '+esc(A.email())+'</p>'+
  '<div><label class="l" for="pName">Display name</label><input class="field" id="pName" maxlength="40" value="'+esc(m.name)+'"></div>'+
  '<div><label class="l" for="pBio">Bio</label><textarea class="field" id="pBio" maxlength="280" rows="3" placeholder="Tell people about yourself">'+esc(m.bio)+'</textarea></div>'+
  '<div class="row2"><div><label class="l" for="pLoc">Location</label><input class="field" id="pLoc" maxlength="40" value="'+esc(m.location)+'" placeholder="City, Country"></div>'+
  '<div><label class="l" for="pWeb">Website</label><input class="field" id="pWeb" maxlength="100" inputmode="url" value="'+esc(m.website)+'" placeholder="https://"></div></div>'+
  '<p class="ferr" role="alert" id="pfErr"></p><button class="btn btn-primary">Save profile</button></form>'+
  '<form class="form" id="pw"><h2>Password</h2><input class="field" id="pOld" type="password" placeholder="Current password" autocomplete="current-password" required><input class="field" id="pNew" type="password" placeholder="New password (8+)" autocomplete="new-password" required><p class="ferr" role="alert"></p><button class="btn">Change password</button></form></div>'+
  '<div class="wrap"><div class="sec-head"><div><p class="eyebrow">Upload management</p><h2>Your scripts ('+mine.length+')</h2></div><div class="row-btns"><a class="btn btn-primary" href="#/publish">Publish script</a></div></div>'+
  (lg?'<div class="notice">'+lg+' script'+(lg===1?'':'s')+' found in this browser from the old local version. <button class="btn" id="claim">Upload '+(lg===1?'it':'them')+' to your account</button></div>':'')+
  '<div class="cards" id="myCards">'+(mine.length?mine.map(C.cardHTML).join(''):'<div class="empty"><h3>Nothing published yet</h3><p>Your scripts appear here, and only you can edit or delete them.</p></div>')+'</div>'+
  '<div class="danger-zone"><h3>Delete account</h3><p>Permanently removes your account, profile, photos, every script you published and all their files.</p><form id="del"><input class="field" id="dPw" type="password" placeholder="Confirm password" required><button class="btn btn-danger">Delete account</button></form><p class="ferr" id="dErr" role="alert"></p></div></div>';
  $('#pf').onsubmit=function(e){e.preventDefault();var er=$('#pfErr');er.textContent='';A.update({name:$('#pName').value,bio:$('#pBio').value,location:$('#pLoc').value,website:$('#pWeb').value}).then(function(){C.toast('Profile saved');C.refresh()},function(x){er.textContent=x.message})};
  $('#pw').onsubmit=function(e){e.preventDefault();var b=this.querySelector('.ferr'),f=this;A.changePassword($('#pOld').value,$('#pNew').value).then(function(){f.reset();b.textContent='';C.toast('Password changed')},function(x){err(b,x)})};
  if($('#claim'))$('#claim').onclick=function(){var bt=this;bt.disabled=true;bt.textContent='Uploading...';C.importLocal().then(function(n){C.toast(n+' script(s) uploaded');changed()},function(x){bt.disabled=false;C.toast(x.message)})};
  $('#del').onsubmit=function(e){e.preventDefault();if(!confirm('Delete your account and all your scripts? This cannot be undone.'))return;A.remove($('#dPw').value,function(){return A.purgeImages().then(C.purgeFiles)}).then(function(){C.dropOwner(m.id);changed();location.hash='#/'},function(x){err($('#dErr'),x)})};
}
function renderPublisher(raw){
  var name=decodeURIComponent((raw.split('/')[1]||'')),u=A.byName(name),box=$('#pubBody');
  if(!u){box.innerHTML=head('Profile','Not found','Nobody uses that username.');return}
  if(window.AevyProfile){AevyProfile.render('#pubBody',u,!!A.current()&&A.current().id===u.id);return}
  var list=C.vis().filter(function(s){return s.owner===u.id}),own=!!A.current()&&A.current().id===u.id;
  box.innerHTML=pfHeader(u,own,list,false)+'<div class="wrap"><div class="pf-tab"><span>Scripts</span><small>'+list.length+'</small></div><div class="cards" style="padding-top:20px">'+
    (list.length?list.map(C.cardHTML).join(''):'<div class="empty"><h3>No public scripts yet</h3><p>'+(own?'<a href="#/publish"><u>Publish your first script</u></a>':'Check back later.')+'</p></div>')+'</div></div>';
}
function userSlot(){
  var m=A.current(),s=$('#userSlot');
  s.innerHTML=m?'<a class="userchip" href="#/profile" aria-label="Your profile">'+avatar(m,28)+'<span class="hide-sm">'+esc(m.username)+'</span>'+(window.AevyBadge?AevyBadge.html(m):'')+'</a><button class="btn btn-sm" id="so">Sign out</button>':'<a class="btn btn-sm" href="#/auth">Sign in</a>';
  var so=$('#so');if(so)so.onclick=function(){A.signOut().then(function(){changed();location.hash='#/'})};
  var pb=document.querySelector('.bar-actions .btn-primary');if(pb)pb.hidden=false;
}
function catChips(){
  if($('#catChips'))return;var chips=$('#chips');if(!chips)return;
  var d=document.createElement('div');d.className='chips';d.id='catChips';chips.parentNode.insertBefore(d,chips);
  d.onclick=function(e){var b=e.target.closest('[data-c]');if(!b)return;window.catFilter=b.dataset.c;draw();C.refresh()};draw();
  function draw(){var f=window.catFilter||'all';d.innerHTML=['all'].concat(C.cats).map(function(c){return '<button class="chip'+(c===f?' on':'')+'" data-c="'+esc(c)+'">'+(c==='all'?'All categories':esc(c))+'</button>'}).join('')}
}
function publishForm(){
  var a=$('#fAuthor');if(!a)return;var row=a.parentNode;
  row.innerHTML='<label class="l" for="fCat">Category</label><select class="field sel" id="fCat" style="width:100%">'+C.cats.map(function(c){return '<option>'+esc(c)+'</option>'}).join('')+'</select>';
  var v=document.createElement('div');v.innerHTML='<label class="l" for="fVis">Visibility</label><select class="field sel" id="fVis" style="width:100%"><option value="public">Public (anyone can view and download)</option><option value="private">Private (only you)</option></select>';
  row.parentNode.insertBefore(v,row.nextSibling);
}
window.AevyEco={avatar:avatar,pick:function(k){pickKind=k;picker.click()},render:function(h,raw){
  userSlot();
  if(h==='auth')renderAuth();
  if(h==='profile')renderProfile();
  if(h==='u')renderPublisher(raw);
  if(h==='scripts')catChips();
}};
/* Password reset: the email link signs the visitor in and Supabase fires a recovery event; ask for the new password. */
var recShown=false;
function showRecovery(){
  if(recShown||!A.recovery())return;recShown=true;
  var d=$('#dlg');
  $('#dlgTitle').textContent='Choose a new password';$('#dlgSub').textContent='Enter a new password for your account.';
  $('#dlgBody').innerHTML='<form class="form" id="rf"><div><label class="l" for="rpN">New password</label><input class="field" id="rpN" type="password" autocomplete="new-password" minlength="8" required></div><p class="ferr" role="alert"></p><button class="btn btn-primary">Save password</button></form>';
  $('#rf').onsubmit=function(e){e.preventDefault();var f=this,b=f.querySelector('.ferr');b.textContent='';busy(f,true);
    A.setNewPassword($('#rpN').value).then(function(){busy(f,false);d.close();C.toast('Password updated')},function(x){busy(f,false);err(b,x)})};
  if(!d.open){d.showModal();document.body.classList.add('lock')}
}
window.addEventListener('aevy:recovery',function(){recShown=false;showRecovery()});
A.ready.then(showRecovery);
publishForm();userSlot();
})();
