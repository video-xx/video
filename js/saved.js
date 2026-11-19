/* Aevy Saved + Pinned scripts.
   Saved: private bookmarks (Save button on every script card; "Saved" tab on your own profile).
   Pinned: up to 3 of your own scripts shown first on your profile (Pin button on your profile cards).
   Needs the latest supabase/schema.sql (tables script_saves and script_pins). */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SB=window.AevySB&&window.AevySB.client;
if(!C||!A||!SB)return;
var saved={},pinsBy={};
function me(){return A.current()}
function fire(n,d){var e=new Event(n);e.detail=d;window.dispatchEvent(e)}
var BM='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4.5L5 20V5a1 1 0 0 1 1-1z"/></svg>';
function paintBtns(){
  Array.prototype.forEach.call(document.querySelectorAll('[data-act="save"]'),function(b){
    var on=!!saved[b.dataset.id];b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);
    var s=b.querySelector('span');if(s)s.textContent=on?'Saved':'Save';
  });
}
var Saved=window.AevySaved={
  has:function(id){return !!saved[id]},
  btn:function(id){var on=!!saved[id];return '<button class="pact'+(on?' on':'')+'" data-act="save" data-id="'+C.esc(id)+'" aria-pressed="'+on+'">'+BM+'<span>'+(on?'Saved':'Save')+'</span></button>'},
  list:function(){return C.vis().filter(function(s){return saved[s.id]})},
  load:function(){
    saved={};if(!me()){paintBtns();fire('aevy:saved');return Promise.resolve()}
    return SB.from('script_saves').select('script_id').eq('owner',me().id).order('created',{ascending:false}).then(function(r){
      (r.data||[]).forEach(function(x){saved[x.script_id]=1});paintBtns();fire('aevy:saved');
    },function(){});
  },
  toggle:function(s){
    if(!me()){location.hash='#/auth';return}
    var id=s.id,was=!!saved[id];
    if(was)delete saved[id];else saved[id]=1;paintBtns();fire('aevy:saved');
    var q=was?SB.from('script_saves').delete().eq('owner',me().id).eq('script_id',id):SB.from('script_saves').insert({script_id:id,owner:me().id});
    q.then(function(r){
      if(r.error){if(was)saved[id]=1;else delete saved[id];paintBtns();fire('aevy:saved');C.toast('Could not save: '+(r.error.message||'try again'))}
      else C.toast(was?'Removed from Saved':'Saved to your profile');
    },function(){if(was)saved[id]=1;else delete saved[id];paintBtns();fire('aevy:saved')});
  }
};
var Pins=window.AevyPins={
  ids:function(uid){return pinsBy[uid]||[]},
  load:function(uid){
    return SB.from('script_pins').select('script_id').eq('owner',uid).order('created').then(function(r){
      pinsBy[uid]=(r.data||[]).map(function(x){return x.script_id});return pinsBy[uid];
    },function(){return pinsBy[uid]||[]});
  },
  sort:function(list,uid){
    var p=Pins.ids(uid);if(!p.length)return list;
    return list.map(function(s,i){return {s:s,i:i,k:p.indexOf(s.id)}}).sort(function(a,b){
      var ap=a.k>-1,bp=b.k>-1;if(ap!==bp)return ap?-1:1;return ap?a.k-b.k:a.i-b.i}).map(function(x){return x.s});
  },
  toggle:function(sid){
    var m=me();if(!m)return;
    var cur=Pins.ids(m.id).slice(),was=cur.indexOf(sid)>-1;
    var q=was?SB.from('script_pins').delete().eq('owner',m.id).eq('script_id',sid):SB.from('script_pins').insert({script_id:sid,owner:m.id});
    q.then(function(r){
      if(r.error){C.toast(r.error.message||'Could not pin');return}
      pinsBy[m.id]=was?cur.filter(function(x){return x!==sid}):cur.concat(sid);
      C.toast(was?'Unpinned':'Pinned to your profile');fire('aevy:pins',{uid:m.id});
    },function(){C.toast('Could not pin, try again')});
  }
};
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-pin]');
  if(b){e.preventDefault();e.stopPropagation();Pins.toggle(b.dataset.pin)}
});
window.addEventListener('aevy:auth',function(){Saved.load()});
(A.ready||Promise.resolve()).then(function(){Saved.load()});
})();
