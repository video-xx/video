/* Aevy guests. There is no sign-in gate: every visitor gets a guest account automatically (see AevyAuth.autoGuest),
   which follows the owner and likes the owner's posts. Guests can only message other guests; the database enforces
   that (supabase/schema.sql, "Guest accounts"). This file shows ONE gentle prompt, only after the visitor scrolls:
   "Create an account for a better experience". It also blocks guest-only-restricted actions in the UI with the same prompt. */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth;if(!C||!A)return;
var SEL='[data-act="like"],[data-act="cmt"],[data-follow],[data-plike],[data-pcm],[data-csend],[data-cin],a[href="#/publish"],a[href="#/ai"]';
var KEY='aevy_scroll_prompt',el=null,shown=false;
function m(){return A.current()}
function isG(){var u=m();return !u||!!u.guest}          /* guest, or nobody (anonymous sign-ins turned off) */
function seen(){try{return sessionStorage.getItem(KEY)==='1'}catch(e){return shown}}
function mark(){shown=true;try{sessionStorage.setItem(KEY,'1')}catch(e){}}
function hide(){if(el){el.classList.remove('show');var d=el;setTimeout(function(){if(d.parentNode)d.remove()},300);el=null}}
function show(){
  if(el||!isG()||location.hash==='#/auth')return;
  mark();
  el=document.createElement('div');el.className='gs-prompt';el.setAttribute('role','status');
  el.innerHTML='<p><b>Create an account for a better experience</b>Like, comment, follow and publish your own scripts.</p><a href="#/auth">Create account</a><button type="button" aria-label="Dismiss">&times;</button>';
  el.querySelector('a').addEventListener('click',hide);
  el.querySelector('button').addEventListener('click',hide);
  document.body.appendChild(el);
  requestAnimationFrame(function(){requestAnimationFrame(function(){if(el)el.classList.add('show')})});
}
/* the only automatic notice: the first real scroll of a visit */
window.addEventListener('scroll',function(){
  if(seen()||!isG())return;
  if((window.pageYOffset||document.documentElement.scrollTop||0)>240)show();
},{passive:true});
/* tapping an action a guest cannot do shows the same prompt */
window.addEventListener('click',function(e){
  if(!isG()||!m()||!e.target.closest(SEL))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(el)return;
  mark();show();
},true);
window.AevyGuest={prompt:function(){mark();show()}};
window.addEventListener('hashchange',hide);
window.addEventListener('aevy:auth',function(){if(!isG())hide()});
})();
