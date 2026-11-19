/* Instagram-style shell: icon sidebar (desktop), Profile link, Explore labels. Pure presentation. */
(function(){
var $=function(s){return document.querySelector(s)};
var P=function(d){return '<svg class="ni" viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>'};
var ICONS={
  home:P('<path d="M3.5 10.8 12 3.5l8.5 7.3V20a1 1 0 0 1-1 1H14.5v-6h-5v6H4.5a1 1 0 0 1-1-1z"/>'),
  explore:P('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  messages:P('<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>'),
  files:P('<path d="M3.5 7.5a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
  ai:P('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'),
  watch:P('<rect x="3.5" y="4.5" width="17" height="15" rx="4"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>'),
  profile:P('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>')
};
var LABEL={};
var nav=$('#nav');if(!nav)return;
if(!nav.querySelector('[data-route=profile]')){var a=document.createElement('a');a.href='#/profile';a.dataset.route='profile';a.textContent='Profile';nav.appendChild(a)}
nav.querySelectorAll('a').forEach(function(a){
  var r=a.dataset.route,t=LABEL[r]||a.firstChild.textContent.trim(),extra=a.querySelector('.ubadge');
  a.setAttribute('aria-label',t);
  var badge=extra?extra.outerHTML:'';
  a.innerHTML=(ICONS[r]||'')+'<span class="nl">'+t+'</span>'+badge;
});
var pt=$('.pub-top');if(pt){var sp=pt.querySelector('span');if(sp)sp.textContent='Share video'}
/* keep Profile highlighted on the profile page */
function mark(){var h=(location.hash||'#/').replace(/^#\/?/,'').split('/')[0]||'home';nav.querySelectorAll('a').forEach(function(a){if(a.dataset.route===h)a.setAttribute('aria-current','page')})}
window.addEventListener('hashchange',function(){setTimeout(mark,0)});mark();
})();
