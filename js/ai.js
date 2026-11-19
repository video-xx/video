/* Aevy AI chat. Talks to the Supabase Edge Function "ai-chat" (the Gemini key stays on the server). */
(function(){
'use strict';
var C=window.AevyCore,A=window.AevyAuth,SB=window.AevySB&&window.AevySB.client;
if(!C||!A||!SB)return;
var esc=C.esc,$=function(s,r){return (r||document).querySelector(s)};
var MODES=[['assistant','Assistant'],['code','Code helper'],['writer','Writer'],['tutor','Tutor'],['translate','Translator']];
var IDEAS=['Explain a script I paste, line by line','Write a Lua function that ...','Help me write a great post title and description','Summarize this text in 5 bullets'];
var IC={
 spark:'<svg viewBox="0 0 24 24"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
 plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
 menu:'<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
 send:'<svg viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>',
 clip:'<svg viewBox="0 0 24 24"><path d="m20 11-8.2 8.2a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7L9.5 17a1.7 1.7 0 0 1-2.4-2.4L14.6 7"/></svg>',
 globe:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z"/></svg>',
 copy:'<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg>',
 redo:'<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
 code:'<svg viewBox="0 0 24 24"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>',
 pen:'<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/></svg>',
 list:'<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>'
};
var IDEAICON=['code','code','pen','list'];
var loadedFor=null,chats=[],cur=null,busy=false,img=null,search=false,side=false;
function me(){return A.current()}
function key(){return 'aevy.ai.v1.'+(me()?me().id:'x')}
function load(){try{chats=JSON.parse(localStorage.getItem(key())||'[]')}catch(e){chats=[]}}
function save(){try{localStorage.setItem(key(),JSON.stringify(chats.slice(0,40)))}catch(e){}}
function find(id){for(var i=0;i<chats.length;i++)if(chats[i].id===id)return chats[i]}
function fresh(){var c={id:'c'+Date.now(),title:'New chat',mode:'assistant',msgs:[]};chats.unshift(c);cur=c.id;save();return c}

/* tiny safe Markdown: code blocks, inline code, bold, italic, links, lists, headings */
function md(t){
  var blocks=[];
  t=String(t).replace(/```(\w*)\n?([\s\S]*?)```/g,function(_,l,c){blocks.push('<div class="ai-code"><div class="ai-ch"><span>'+esc(l||'code')+'</span><button type="button" data-copy>Copy</button></div><pre><code>'+esc(c.replace(/\n$/,''))+'</code></pre></div>');return '\u0000'+(blocks.length-1)+'\u0000'});
  t=esc(t).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/(^|[\s(])\*([^*\n]+)\*/g,'$1<i>$2</i>')
   .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
   .replace(/^#{1,3} (.+)$/gm,'<h4>$1</h4>');
  t=t.replace(/(?:^|\n)((?:[-*] .+(?:\n|$))+)/g,function(_,l){return '<ul>'+l.trim().split('\n').map(function(x){return '<li>'+x.replace(/^[-*] /,'')+'</li>'}).join('')+'</ul>'})
   .replace(/(?:^|\n)((?:\d+\. .+(?:\n|$))+)/g,function(_,l){return '<ol>'+l.trim().split('\n').map(function(x){return '<li>'+x.replace(/^\d+\. /,'')+'</li>'}).join('')+'</ol>'});
  t=t.replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>');
  t=('<p>'+t+'</p>').replace(/\u0000(\d+)\u0000/g,function(_,i){return '</p>'+blocks[i]+'<p>'});
  t=t.replace(/(<br>)+(<(?:ul|ol|h4)>)/g,'$2').replace(/(<\/(?:ul|ol|h4)>)(<br>)+/g,'$1')   /* no stray line breaks around block elements */
   .replace(/<p>(<(?:ul|ol|h4)>)/g,'$1').replace(/(<\/(?:ul|ol|h4)>)<\/p>/g,'$1')
   .replace(/<p>(?:<br>)+/g,'<p>').replace(/(?:<br>)+<\/p>/g,'</p>');
  return t.replace(/<p>\s*<\/p>/g,'');
}
function msgHTML(m){
  if(m.r==='user')return '<div class="ai-m me"><div class="ai-b">'+(m.img?'<small class="ai-img">[image attached]</small>':'')+esc(m.t).replace(/\n/g,'<br>')+'</div></div>';
  var src=(m.src||[]).map(function(s){return '<a href="'+esc(s.u)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(s.t||s.u)+'</a>'}).join('');
  return '<div class="ai-m bot"><span class="ai-av">'+IC.spark+'</span><div class="ai-b">'+md(m.t)+(src?'<div class="ai-src">Sources: '+src+'</div>':'')+'<div class="ai-tools"><button type="button" data-copy-all>'+IC.copy+' Copy</button><button type="button" data-redo>'+IC.redo+' Regenerate</button></div></div></div>';
}
function shell(){
  var c=find(cur)||fresh();
  return '<div class="ai-app'+(side?' side':'')+'"><aside class="ai-side"><button class="ai-new" id="aiNew" type="button">'+IC.plus+' New chat</button><h5>Recent</h5><ul id="aiList">'+
   chats.map(function(x){return '<li class="'+(x.id===cur?'on':'')+'"><button type="button" data-open="'+x.id+'">'+esc(x.title)+'</button><button type="button" class="ai-x" data-del="'+x.id+'" aria-label="Delete chat">&times;</button></li>'}).join('')+'</ul></aside>'+
   '<section class="ai-main"><header class="ai-top"><button type="button" class="ai-menu" id="aiMenu" aria-label="Chats">'+IC.menu+'</button><b><i>'+IC.spark+'</i><span>Aevy AI</span></b>'+
   '<div class="ai-modes" id="aiModes" role="tablist" aria-label="Mode">'+MODES.map(function(m){return '<button type="button" role="tab" data-mode="'+m[0]+'" class="'+(c.mode===m[0]?'on':'')+'" aria-selected="'+(c.mode===m[0])+'">'+m[1]+'</button>'}).join('')+'</div>'+
   '<label class="ai-web" title="Let the AI search the web">'+IC.globe+'<input type="checkbox" id="aiWeb"'+(search?' checked':'')+'> Web</label></header>'+
   '<div class="ai-log" id="aiLog">'+(c.msgs.length?c.msgs.map(msgHTML).join('')+(!busy&&c.msgs[c.msgs.length-1].r==='user'?'<div class="ai-m bot"><span class="ai-av">'+IC.spark+'</span><div class="ai-b"><p>No answer was received.</p><div class="ai-tools"><button type="button" data-retry>'+IC.redo+' Try again</button></div></div></div>':''):'<div class="ai-empty"><div class="ai-logo">'+IC.spark+'</div><h2>How can I help you today?</h2><p>Ask anything: code, writing, study, ideas, images.</p><div class="ai-ideas">'+IDEAS.map(function(i,n){return '<button type="button" data-idea="'+esc(i)+'">'+IC[IDEAICON[n]||'spark']+'<span>'+esc(i)+'</span></button>'}).join('')+'</div></div>')+'</div>'+
   '<div class="ai-comp"><div id="aiPrev"></div><div class="ai-box"><label class="ai-att" title="Attach image"><input type="file" id="aiFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>'+IC.clip+'</label><textarea id="aiIn" rows="1" maxlength="8000" placeholder="Message Aevy AI"></textarea><button type="button" class="ai-send" id="aiSend" aria-label="Send">'+IC.send+'</button></div><small>AI can make mistakes. Check important information.</small></div></section></div>';
}
function render(){
  var root=$('#aiRoot');if(!root)return;
  if(!me()){root.innerHTML='<div class="empty"><h3>Sign in to use Aevy AI</h3><p>Chat with an AI assistant for code, writing and more.</p><a class="btn btn-primary" href="#/auth">Sign in</a></div>';return}
  if(loadedFor!==key()){load();loadedFor=key()}
  if(!find(cur))cur=chats[0]?chats[0].id:null;
  root.innerHTML=shell();wire();scroll();
}
function scroll(){var l=$('#aiLog');if(l)l.scrollTop=l.scrollHeight}
function typing(on){var l=$('#aiLog');if(!l)return;var o=$('#aiTyp');if(o)o.remove();if(on){l.insertAdjacentHTML('beforeend','<div class="ai-m bot" id="aiTyp"><span class="ai-av">'+IC.spark+'</span><div class="ai-b"><span class="ai-dots"><i></i><i></i><i></i></span></div></div>');scroll()}}
function send(text,redo){
  var c=find(cur);if(!c||busy)return;
  text=String(text||'').trim();
  if(!redo){if(!text&&!img)return;c.msgs.push({r:'user',t:text||'Describe this image.',img:!!img});if(c.title==='New chat')c.title=(text||'Image').slice(0,36)}
  var payload=c.msgs.map(function(m,i){var o={role:m.r==='user'?'user':'model',text:m.t};if(img&&!redo&&i===c.msgs.length-1&&m.r==='user')o.image=img;return o});
  var cid=c.id;
  img=null;busy=true;save();render();typing(true);
  var call=SB.functions.invoke('ai-chat',{body:{messages:payload,mode:c.mode,search:search}});
  var limit=new Promise(function(_,no){setTimeout(function(){no(new Error('The AI took too long to answer. Check that the ai-chat function is deployed and GEMINI_API_KEY is set, then try again.'))},60000)});
  Promise.race([call,limit]).then(function(r){
    var d=r.data,e=r.error;
    if(e&&e.context&&typeof e.context.json==='function'){   /* non-2xx: read the real message the function sent */
      return e.context.json().then(function(j){throw new Error((j&&j.error)||e.message)},function(){throw new Error(e.message||'AI request failed')});
    }
    if(e||!d||d.error){throw new Error((d&&d.error)||(e&&e.message)||'AI is not reachable. Check that the ai-chat function is deployed.')}
    (find(cid)||c).msgs.push({r:'bot',t:d.text,src:d.sources||[]});
  }).catch(function(x){console.error('Aevy AI:',x);(find(cid)||c).msgs.push({r:'bot',t:'Sorry, something went wrong: '+(x.message||x)})}).then(function(){busy=false;save();render()});
}
function wire(){
  var inp=$('#aiIn');
  function grow(){inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,160)+'px'}
  inp.oninput=grow;
  inp.onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();var v=inp.value;inp.value='';send(v)}};
  $('#aiSend').onclick=function(){var v=inp.value;inp.value='';send(v)};
  $('#aiNew').onclick=function(){var c=find(cur);if(!c||c.msgs.length)fresh();side=false;render()};
  $('.ai-app').addEventListener('click',function(e){if(side&&e.target===this){side=false;this.classList.remove('side')}});
  $('#aiMenu').onclick=function(){side=!side;$('.ai-app').classList.toggle('side',side)};
  $('#aiModes').onclick=function(e){var b=e.target.closest('[data-mode]');if(!b)return;find(cur).mode=b.dataset.mode;save();[].forEach.call(this.children,function(x){var on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-selected',on)})};
  $('#aiWeb').onchange=function(){search=this.checked};
  $('#aiFile').onchange=function(){var f=this.files[0];if(!f)return;if(f.size>4e6){C.toast('Image must be under 4 MB');return}
    var rd=new FileReader();rd.onload=function(){img={mime:f.type,data:String(rd.result).split(',')[1]};$('#aiPrev').innerHTML='<span class="ai-chip">'+esc(f.name)+' <button type="button" id="aiRm">&times;</button></span>';$('#aiRm').onclick=function(){img=null;$('#aiPrev').innerHTML=''}};rd.readAsDataURL(f)};
  $('#aiList').onclick=function(e){var o=e.target.closest('[data-open]'),d=e.target.closest('[data-del]');
    if(o){cur=o.dataset.open;side=false;render()}
    if(d){chats=chats.filter(function(x){return x.id!==d.dataset.del});if(cur===d.dataset.del)cur=chats[0]?chats[0].id:null;save();render()}};
  $('#aiLog').onclick=function(e){
    var i=e.target.closest('[data-idea]');if(i){inp.value=i.dataset.idea;inp.focus();return}
    var cp=e.target.closest('[data-copy]');if(cp){var code=cp.closest('.ai-code').querySelector('code').textContent;navigator.clipboard&&navigator.clipboard.writeText(code).then(function(){cp.textContent='Copied';setTimeout(function(){cp.textContent='Copy'},1200)});return}
    var ca=e.target.closest('[data-copy-all]');if(ca){var m=ca.closest('.ai-b').cloneNode(true);var t=m.querySelector('.ai-tools');if(t)t.remove();navigator.clipboard&&navigator.clipboard.writeText(m.innerText).then(function(){C.toast('Copied')});return}
    if(e.target.closest('[data-retry]')){send('',true);return}
    if(e.target.closest('[data-redo]')){var c=find(cur);if(c&&c.msgs.length&&c.msgs[c.msgs.length-1].r==='bot'){c.msgs.pop();send('',true)}}};
}
function check(){if((location.hash||'').indexOf('#/ai')===0&&!busy)setTimeout(render,0)}
window.addEventListener('hashchange',check);window.addEventListener('aevy:auth',check);setTimeout(check,300);
window.AevyAI={render:render};
})();
