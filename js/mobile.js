/* Aevy mobile: bottom tab bar profile photo, hide-on-scroll header, refresh when signed in/out. */
(function(){
'use strict';
function paint(){
  var t=document.getElementById('tabProfile'),A=window.AevyAuth,m=A&&A.current&&A.current();
  if(!t)return;
  var old=t.querySelector('.tab-av');if(old)old.remove();
  var svg=t.querySelector('svg');
  if(m&&window.AevyEco){var s=document.createElement('span');s.className='tab-av';s.innerHTML=AevyEco.avatar(m,26);t.insertBefore(s,svg);svg.style.display='none'}
  else if(svg)svg.style.display='';
}
window.addEventListener('aevy:auth',paint);
window.addEventListener('hashchange',function(){setTimeout(paint,0)});
setTimeout(paint,600);setTimeout(paint,2000);
/* header slides away while scrolling down, returns on scroll up (phones only) */
var last=0,h=document.querySelector('.site-header'),mq=window.matchMedia('(max-width:760px)');
window.addEventListener('scroll',function(){
  if(!h||!mq.matches)return;
  var y=window.scrollY||0;
  h.classList.toggle('hide',y>last+6&&y>90);
  if(y<last-6||y<60)h.classList.remove('hide');
  last=y;
},{passive:true});
})();
