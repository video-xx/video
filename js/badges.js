/* Aevy badges: Verified (blue check), Admin rank, New-user badge.
   Rules are decided by the database (supabase/schema.sql):
     verified  profiles.verified  - set by triggers once the user has published 2+ public scripts (Admins are always verified)
     admin     profiles.role      - 'admin', granted only from the Supabase SQL editor
     new       account age        - younger than NEW_DAYS days; older accounts show no badge (keep in step with aevy_new_user_days()) */
(function(){
'use strict';
var cfg=window.AEVY_CONFIG||{},NEW_DAYS=cfg.newDays||7,DAY=864e5,NEED=cfg.creatorPosts||3;
/* usernames that always wear the Admin badge (display only; real Admin powers come from profiles.role in the database) */
var ADMINS=(cfg.adminUsernames||[]).map(function(x){return String(x).toLowerCase()});
/* display names reserved for the site owner: only the EARLIEST account with that name gets the badge, so a later copycat does not */
var ADMIN_NAMES=(cfg.adminNames||[]).map(function(x){return String(x).trim().toLowerCase()});
function ownerByName(u){
  if(!ADMIN_NAMES.length||!u||ADMIN_NAMES.indexOf(String(u.name||'').trim().toLowerCase())<0)return false;
  var A=window.AevyAuth,all=A&&A.all?A.all():[],first=null,n=String(u.name).trim().toLowerCase();
  all.forEach(function(p){if(String(p.name||'').trim().toLowerCase()===n&&(!first||p.created<first.created))first=p});
  return !first||first.id===u.id;
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var CHECK='<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path fill="currentColor" d="M12 1.8l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.2l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z"/><path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M8 12.4l2.7 2.7L16.2 9.5"/></svg>';
function isAdmin(u){return !!u&&(u.role==='admin'||ADMINS.indexOf(String(u.username||'').toLowerCase())>-1||ownerByName(u))}
function isNew(u){return !!u&&!!u.created&&Date.now()-u.created<NEW_DAYS*DAY&&!isAdmin(u)}
function isVerified(u){return !!u&&(u.verified||isAdmin(u))}
/* html(user, big) returns the badges to place right after a name */
function html(u,big){
  if(!u)return '';
  var o='';
  if(isVerified(u))o+='<span class="vbadge" title="Creator badge" role="img" aria-label="Creator">'+CHECK+'</span>';
  if(isAdmin(u))o+='<span class="rbadge admin" title="Aevy Admin">Admin</span>';
  else if(u.guest)o+='<span class="rbadge new" title="Guest account">Guest</span>';
  else if(isNew(u))o+='<span class="rbadge new" title="New to Aevy">New</span>';
  return o?'<span class="badges'+(big?' big':'')+'">'+o+'</span>':'';
}
function isCreator(u){return isVerified(u)}
window.AevyBadge={need:NEED,isCreator:isCreator,html:html,isNew:isNew,isAdmin:isAdmin,isVerified:isVerified,newDays:NEW_DAYS};

/* repaint when profiles change (e.g. just earned the blue check) */
window.addEventListener('aevy:badges',function(){window.dispatchEvent(new Event('aevy:auth'))});
/* live: a verified / role change in the database shows without a refresh */
(function live(){
  var A=window.AevyAuth,SB=window.AevySB&&window.AevySB.client;
  if(!A||!SB)return;
  var t;
  try{SB.channel('aevy-badges').on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},function(){
    clearTimeout(t);t=setTimeout(function(){A.refreshProfiles().then(function(){window.dispatchEvent(new Event('aevy:badges'))},function(){})},400);
  }).subscribe()}catch(e){}
})();
})();
