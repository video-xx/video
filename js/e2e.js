/* Aevy end-to-end encryption for direct messages (Web Crypto, nothing to install).
   - Every account gets an ECDH P-256 key pair on its own device. The PUBLIC key is stored in public.user_keys.
     The PRIVATE key never leaves the device unencrypted.
   - Two people derive the same secret from (my private key + their public key), turn it into an AES-256-GCM key
     with HKDF, and every message is encrypted with a fresh random IV. The server only ever stores "e2e1:<ciphertext>".
   - The sender and recipient ids are bound into each message (AES-GCM additional data), so the server cannot
     re-label or replay a message into another conversation.
   - To read your chats on another device, you set a recovery passphrase. It encrypts your private key
     (PBKDF2-SHA256, 600,000 rounds, then AES-GCM) and only that encrypted blob is uploaded (public.key_backups).
     The passphrase is never sent anywhere. If it is lost, old messages cannot be recovered.
   - Guests keep their key on this device only (a guest session cannot move to another device anyway).
   Tables and policies: supabase/schema.sql, section "Encrypted messages". */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SB=window.AevySB&&window.AevySB.client;
if(!C||!A||!SB)return;
var subtle=window.crypto&&window.crypto.subtle,esc=C.esc;
var PREFIX='e2e1:',TE=new TextEncoder(),TD=new TextDecoder(),CURVE={name:'ECDH',namedCurve:'P-256'};
var st={uid:null,guest:false,state:'off',priv:null,jwk:null,pub:'',needBackup:false,initP:null,asked:false},peers={},aes={};

/* ---------- helpers ---------- */
function b64(buf){var a=new Uint8Array(buf),s='',i;for(i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return btoa(s)}
function unb64(s){var b=atob(s),a=new Uint8Array(b.length),i;for(i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
function pubOf(j){return JSON.stringify({kty:'EC',crv:'P-256',x:j.x,y:j.y})}
function same(j,pub){try{return pubOf(j)===pubOf(JSON.parse(pub))}catch(e){return false}}
function fail(code){var e=new Error(code);e.code=code;return e}

/* ---------- key storage on this device (IndexedDB, falls back to localStorage) ---------- */
function idb(){return new Promise(function(ok,no){var r=indexedDB.open('aevy-e2e',1);r.onupgradeneeded=function(){r.result.createObjectStore('keys')};r.onsuccess=function(){ok(r.result)};r.onerror=function(){no(r.error)}})}
function kget(id){
  return idb().then(function(db){return new Promise(function(ok,no){var q=db.transaction('keys').objectStore('keys').get(id);q.onsuccess=function(){ok(q.result||null)};q.onerror=function(){no(q.error)}})})
   .catch(function(){try{return JSON.parse(localStorage.getItem('aevy.e2e.'+id)||'null')}catch(e){return null}});
}
function kset(id,v){
  return idb().then(function(db){return new Promise(function(ok,no){var t=db.transaction('keys','readwrite');t.objectStore('keys').put(v,id);t.oncomplete=ok;t.onerror=function(){no(t.error)}})})
   .catch(function(){try{localStorage.setItem('aevy.e2e.'+id,JSON.stringify(v))}catch(e){}});
}
function kdel(id){
  try{localStorage.removeItem('aevy.e2e.'+id)}catch(e){}
  return idb().then(function(db){return new Promise(function(ok){var t=db.transaction('keys','readwrite');t.objectStore('keys').delete(id);t.oncomplete=ok;t.onerror=ok})}).catch(function(){});
}

/* ---------- key pair ---------- */
function gen(){
  return subtle.generateKey(CURVE,true,['deriveBits']).then(function(kp){return subtle.exportKey('jwk',kp.privateKey)});
}
function adopt(j){
  return subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:j.x,y:j.y,d:j.d,ext:false},CURVE,false,['deriveBits']).then(function(k){
    st.priv=k;st.jwk=j;st.pub=pubOf(j);aes={};peers={};
  });
}
function serverKey(uid){
  return SB.from('user_keys').select('pubkey').eq('user_id',uid).maybeSingle().then(function(r){
    if(r.error)throw r.error;return r.data?r.data.pubkey:null;
  });
}
function publish(){
  return SB.from('user_keys').upsert({user_id:st.uid,pubkey:st.pub}).then(function(r){if(r.error)throw r.error});
}
function hasBackup(){
  return SB.from('key_backups').select('user_id').eq('user_id',st.uid).maybeSingle().then(function(r){return !r.error&&!!r.data});
}

/* ---------- start (called once per sign-in) ---------- */
function reset(){st.uid=null;st.guest=false;st.state='off';st.priv=null;st.jwk=null;st.pub='';st.needBackup=false;st.initP=null;st.asked=false;peers={};aes={}}
function init(m){
  if(!m){reset();return Promise.resolve('off')}
  if(!subtle){reset();st.uid=m.id;st.state='off';return Promise.resolve('off')}
  if(st.uid===m.id&&st.initP)return st.initP;
  reset();st.uid=m.id;st.guest=!!m.guest;
  st.initP=Promise.all([kget(m.id),serverKey(m.id)]).then(function(r){
    var local=r[0],srv=r[1];
    if(local&&srv&&same(local,srv))return adopt(local).then(function(){return ready()});
    if(local&&!srv)return adopt(local).then(publish).then(function(){return ready()});
    if(srv&&!st.guest){if(local)kdel(m.id);st.state='locked';return st.state}   /* key exists on the server, but not on this device */
    return gen().then(function(j){return kset(m.id,j).then(function(){return adopt(j)})}).then(publish).then(function(){return ready()});   /* first use (or a guest that lost its key) */
  }).catch(function(e){console.warn('Encrypted messages: run the latest supabase/schema.sql',e);st.state='error';return st.state});
  return st.initP;
}
function ready(){
  st.state='ready';
  if(st.guest){st.needBackup=false;return st.state}
  return hasBackup().then(function(h){st.needBackup=!h;return st.state});
}

/* ---------- pass phrase backup ---------- */
function wrapKey(pass,salt,usage){
  return subtle.importKey('raw',TE.encode(pass),'PBKDF2',false,['deriveKey']).then(function(b){
    return subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:salt,iterations:600000},b,{name:'AES-GCM',length:256},false,[usage]);
  });
}
function backup(pass){
  var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  return wrapKey(pass,salt,'encrypt').then(function(k){return subtle.encrypt({name:'AES-GCM',iv:iv},k,TE.encode(JSON.stringify(st.jwk)))}).then(function(ct){
    var blob=JSON.stringify({v:1,s:b64(salt),i:b64(iv),c:b64(ct)});
    return SB.from('key_backups').upsert({user_id:st.uid,blob:blob}).then(function(r){if(r.error)throw r.error;st.needBackup=false});
  });
}
function unlock(pass){
  return SB.from('key_backups').select('blob').eq('user_id',st.uid).maybeSingle().then(function(r){
    if(r.error)throw r.error;if(!r.data)throw fail('nobackup');
    var b=JSON.parse(r.data.blob);
    return wrapKey(pass,unb64(b.s),'decrypt').then(function(k){return subtle.decrypt({name:'AES-GCM',iv:unb64(b.i)},k,unb64(b.c))}).then(function(pt){return JSON.parse(TD.decode(pt))},function(){throw fail('badpass')});
  }).then(function(j){
    return serverKey(st.uid).then(function(srv){
      if(!srv||!same(j,srv))throw fail('stale');
      return kset(st.uid,j).then(function(){return adopt(j)});
    });
  }).then(function(){st.state='ready';st.needBackup=false;changed()});
}
function resetKeys(){
  return gen().then(function(j){return kset(st.uid,j).then(function(){return adopt(j)})}).then(publish).then(function(){
    return SB.from('key_backups').delete().eq('user_id',st.uid);
  }).then(function(){st.state='ready';st.needBackup=!st.guest;changed()});
}
function changed(){window.dispatchEvent(new Event('aevy:e2e'))}

/* ---------- encrypt / decrypt ---------- */
function peerKey(id){
  if(peers[id])return peers[id];
  var p=SB.from('user_keys').select('pubkey').eq('user_id',id).maybeSingle().then(function(r){
    if(r.error||!r.data){delete peers[id];return null}return r.data.pubkey;
  },function(){delete peers[id];return null});
  peers[id]=p;return p;
}
function shared(pid){
  return peerKey(pid).then(function(pk){
    if(!pk)throw fail('nokey');
    var ck=pid+'|'+pk;if(aes[ck])return aes[ck];
    aes[ck]=subtle.importKey('jwk',JSON.parse(pk),CURVE,false,[])
      .then(function(pub){return subtle.deriveBits({name:'ECDH',public:pub},st.priv,256)})
      .then(function(bits){return subtle.importKey('raw',bits,'HKDF',false,['deriveKey'])})
      .then(function(hk){return subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:TE.encode('aevy-dm-v1'),info:TE.encode([st.uid,pid].sort().join('|'))},hk,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])});
    return aes[ck];
  });
}
function encrypt(pid,text){
  if(!subtle)return Promise.reject(fail('off'));
  if(st.state!=='ready')return Promise.reject(fail(st.state==='locked'?'locked':'off'));
  var iv=crypto.getRandomValues(new Uint8Array(12));
  return shared(pid).then(function(k){return subtle.encrypt({name:'AES-GCM',iv:iv,additionalData:TE.encode(st.uid+'>'+pid)},k,TE.encode(text))}).then(function(ct){
    var out=new Uint8Array(12+ct.byteLength);out.set(iv,0);out.set(new Uint8Array(ct),12);return PREFIX+b64(out);
  });
}
/* m = {s, r, body}. Resolves with the same object: body is the readable text, or locked=true when it cannot be read here. */
function open(m){
  if(String(m.body).indexOf(PREFIX)!==0){m.legacy=true;return Promise.resolve(m)}   /* sent before encryption was added */
  if(st.state!=='ready'){m.locked=true;m.body='';return Promise.resolve(m)}
  var raw;try{raw=unb64(m.body.slice(PREFIX.length))}catch(e){m.locked=true;m.body='';return Promise.resolve(m)}
  return shared(m.s===st.uid?m.r:m.s).then(function(k){return subtle.decrypt({name:'AES-GCM',iv:raw.subarray(0,12),additionalData:TE.encode(m.s+'>'+m.r)},k,raw.subarray(12))}).then(function(pt){m.body=TD.decode(pt);return m},function(){m.locked=true;m.body='';return m});
}

/* ---------- small dialogs ---------- */
var LOCK='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
var modal=null;
function closeModal(){if(modal){modal.remove();modal=null}}
function show(html){
  closeModal();
  modal=document.createElement('div');modal.className='e2e-bg';
  modal.innerHTML='<div class="e2e-box" role="dialog" aria-modal="true" aria-labelledby="e2eT">'+html+'</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click',function(e){if(e.target===modal)closeModal()});
  var i=modal.querySelector('input');if(i)setTimeout(function(){i.focus()},30);
  return modal;
}
function busy(btn,on,txt){btn.disabled=on;if(txt)btn.textContent=txt}
function askUnlock(){
  var m=show('<h3 id="e2eT">'+LOCK+' Unlock your messages</h3><p>Your chats are end-to-end encrypted. Enter your recovery passphrase to read them on this device.</p>'+
   '<form id="e2eF"><input class="field" type="password" id="e2eP" placeholder="Recovery passphrase" autocomplete="current-password" required><p class="ferr" id="e2eE" role="alert"></p>'+
   '<button class="btn btn-primary" id="e2eB">Unlock</button> <button type="button" class="btn" data-e2e-x>Not now</button></form>'+
   '<p class="e2e-fine">Lost your passphrase? <button type="button" class="e2e-link" id="e2eR">Reset encryption</button>. You get new keys, but old messages cannot be read again.</p>');
  m.querySelector('[data-e2e-x]').onclick=closeModal;
  m.querySelector('#e2eF').onsubmit=function(e){
    e.preventDefault();var b=m.querySelector('#e2eB'),er=m.querySelector('#e2eE');er.textContent='';busy(b,true,'Unlocking...');
    unlock(m.querySelector('#e2eP').value).then(function(){closeModal();C.toast('Messages unlocked')},function(x){
      busy(b,false,'Unlock');
      er.textContent=x.code==='badpass'?'Wrong passphrase':x.code==='nobackup'?'No recovery passphrase was ever set for this account':x.code==='stale'?'That backup is out of date. Reset encryption to continue':'Could not unlock. Try again';
    });
  };
  m.querySelector('#e2eR').onclick=function(){
    if(!confirm('Reset encryption? You will not be able to read your old messages again.'))return;
    resetKeys().then(function(){closeModal();C.toast('New keys created');askSetup()},function(){C.toast('Could not reset. Try again')});
  };
}
function askSetup(){
  var m=show('<h3 id="e2eT">'+LOCK+' Protect your messages</h3><p>Messages are end-to-end encrypted: only you and the other person can read them, not even Aevy. Set a recovery passphrase to read your chats on other devices. Aevy cannot reset it for you.</p>'+
   '<form id="e2eF"><input class="field" type="password" id="e2eP" placeholder="Recovery passphrase (8+ characters)" autocomplete="new-password" minlength="8" required><input class="field" type="password" id="e2eP2" placeholder="Repeat passphrase" autocomplete="new-password" minlength="8" required><p class="ferr" id="e2eE" role="alert"></p>'+
   '<button class="btn btn-primary" id="e2eB">Save passphrase</button> <button type="button" class="btn" data-e2e-x>Skip for now</button></form>'+
   '<p class="e2e-fine">If you skip, your messages can only be read on this device.</p>');
  m.querySelector('[data-e2e-x]').onclick=closeModal;
  m.querySelector('#e2eF').onsubmit=function(e){
    e.preventDefault();var b=m.querySelector('#e2eB'),er=m.querySelector('#e2eE'),p=m.querySelector('#e2eP').value;er.textContent='';
    if(p.length<8){er.textContent='Use at least 8 characters';return}
    if(p!==m.querySelector('#e2eP2').value){er.textContent='The passphrases do not match';return}
    busy(b,true,'Saving...');
    backup(p).then(function(){closeModal();C.toast('Recovery passphrase saved');changed()},function(){busy(b,false,'Save passphrase');er.textContent='Could not save. Try again'});
  };
}
/* force=true: always ask when something is needed. Otherwise at most once per sign-in. */
function prompt(force){
  if(!st.uid||(!force&&st.asked))return;
  if(st.state==='locked'){st.asked=true;askUnlock()}
  else if(st.state==='ready'&&st.needBackup){st.asked=true;askSetup()}
}
function banner(){
  if(st.state==='locked')return '<div class="e2e-bar">'+LOCK+'<span>Your messages are locked on this device.</span><button type="button" data-e2e>Unlock</button></div>';
  if(st.state==='ready'&&st.needBackup)return '<div class="e2e-bar">'+LOCK+'<span>Set a recovery passphrase to read your chats on other devices.</span><button type="button" data-e2e>Set up</button></div>';
  if(st.state==='error')return '<div class="e2e-bar bad">'+LOCK+'<span>Encrypted messages are not set up yet. Run the latest supabase/schema.sql.</span></div>';
  if(st.state==='off'&&st.uid)return '<div class="e2e-bar bad">'+LOCK+'<span>This browser cannot do encrypted messages. Use a current browser over https.</span></div>';
  return '';
}
document.addEventListener('click',function(e){if(e.target.closest('[data-e2e]')){e.preventDefault();prompt(true)}});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal()});
window.addEventListener('aevy:auth',function(){if(!A.current()){closeModal();reset()}});

window.AevyE2E={init:init,open:open,encrypt:encrypt,prompt:prompt,banner:banner,state:function(){return st.state},lockIcon:LOCK};
})();
