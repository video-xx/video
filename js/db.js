/* Aevy data layer on Supabase (Postgres + Row Level Security).
   public.scripts       metadata + preview
   public.script_files  the script file itself (one row per script, max 2 MB)
   public.videos        private saved videos
   Table definitions and security policies: supabase/schema.sql */
(function(){
'use strict';
var fb=window.AevySB;if(!fb)return;
var sb=fb.client,codeCache={},MAX=2*1024*1024;
/* Any file type is accepted. Text is stored as is; binary or encrypted files (not valid UTF-8, or containing NUL bytes)
   are stored losslessly as BIN + base64 and decoded again on download. */
var BIN='@@AEVYB64@@';
function isBin(c){return typeof c==='string'&&c.indexOf(BIN)===0}
function toB64(u){var s='',n=0x8000;for(var i=0;i<u.length;i+=n)s+=String.fromCharCode.apply(null,u.subarray(i,i+n));return btoa(s)}
function fromB64(b){var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
function binSize(c){var b=c.slice(BIN.length),pad=b.endsWith('==')?2:b.endsWith('=')?1:0;return Math.max(0,Math.floor(b.length*3/4)-pad)}
function codeBytes(c){return isBin(c)?fromB64(c.slice(BIN.length)):new TextEncoder().encode(c)}
function readFileCode(f){
  return f.arrayBuffer().then(function(buf){
    var u=new Uint8Array(buf);
    try{var t=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(u);if(t.indexOf('\u0000')<0)return t}catch(e){}
    return BIN+toB64(u);
  });
}
window.AevyBin={isBin:isBin,size:binSize,bytes:codeBytes,read:readFileCode,cleanExt:function(e){e=String(e||'').toLowerCase().replace(/^\./,'');return /^[a-z0-9]{1,10}$/.test(e)?e:''}};
function bytes(s){return isBin(s)?binSize(s):new Blob([s]).size}
function lineCount(s){return isBin(s)?1:s?s.split('\n').length:0}
function meta(code){
  if(isBin(code)){var n=binSize(code);return {size:n,lines:1,preview:'[Binary or encrypted file, '+n+' bytes]'}}
  return {size:bytes(code),lines:lineCount(code),preview:code.split('\n').slice(0,7).join('\n').slice(0,1500)};
}
function ms(t){var n=t?Date.parse(t):NaN;return isNaN(n)?Date.now():n}
function toScript(r){
  return {id:r.id,owner:r.owner,title:r.title,lang:r.lang,author:r.author,desc:r.description,tags:r.tags||[],cat:r.cat,vis:r.vis,video:r.video,
    path:r.id,ext:r.ext||'',size:r.size,lines:r.lines,preview:r.preview,created:ms(r.created),updated:ms(r.updated),
    downloads:r.downloads||0,views:r.views||0,likes:r.likes||0,rsum:r.rating_sum||0,rcount:r.rating_count||0};
}
function userId(){var m=window.AevyAuth.current();if(!m)throw new Error('Sign in first');return m.id}
function row(f){
  var r={title:f.title,lang:f.lang,author:f.author||'',description:f.desc||'',tags:f.tags||[],cat:f.cat||'Other',vis:f.vis||'public',video:f.video||''};
  var e=window.AevyBin.cleanExt(f.ext);if(e)r.ext=e;   /* original file extension, kept so downloads keep their real type */
  return r;
}
function err(e){
  if(e&&(e.code==='42501'||/row-level security/i.test(e.message||'')))return new Error('Not allowed. You can only change your own scripts');
  if(e&&(e.code==='42P01'||e.code==='PGRST205'))return new Error('The database tables are missing. Run supabase/schema.sql in the Supabase SQL editor');
  if(e&&/failed to fetch|networkerror|load failed/i.test(e.message||''))return new Error('Cannot reach the server. Check your connection and retry');
  return e instanceof Error?e:new Error((e&&e.message)||'Request failed');
}
/* the database sets the Verified badge after a publish / delete: reload profiles so it shows at once */
function refreshBadge(){try{window.AevyAuth.refreshProfiles().then(function(){window.dispatchEvent(new Event('aevy:badges'))},function(){})}catch(e){}}
function must(r){if(r.error)throw r.error;return r.data}
var COLS='*';

window.AevyDB={
  toScript:toScript,
  /* All scripts the current viewer may see: every public one plus the viewer's own private ones. */
  listScripts:function(){
    var q=[sb.from('scripts').select(COLS).eq('vis','public').order('created',{ascending:false}).limit(1000).then(must)],m=window.AevyAuth.current();
    if(m)q.push(sb.from('scripts').select(COLS).eq('owner',m.id).order('created',{ascending:false}).limit(1000).then(must));
    return Promise.all(q).then(function(lists){
      var seen={},out=[];
      lists.forEach(function(l){l.forEach(function(r){if(!seen[r.id]){seen[r.id]=1;out.push(toScript(r))}})});
      return out.sort(function(a,b){return b.created-a.created});
    });
  },
  getCode:function(s){
    var c=codeCache[s.id];if(c&&c.u===s.updated)return Promise.resolve(c.code);
    return sb.from('script_files').select('code').eq('script_id',s.id).maybeSingle().then(function(r){
      if(r.error)throw r.error;
      if(!r.data)throw new Error('The file has no content');
      codeCache[s.id]={u:s.updated,code:r.data.code};return r.data.code;
    }).then(null,function(e){throw new Error('Could not load the file: '+((e&&e.message)||'download failed'))});
  },
  /* f: {title,lang,author,desc,tags,cat,vis,video}; resolves to the new script */
  createScript:function(f,code){
    var uid,id;
    try{uid=userId()}catch(e){return Promise.reject(e)}
    if(bytes(code)>MAX)return Promise.reject(new Error('Files are limited to 2 MB'));
    var r=row(f),m=meta(code);
    r.owner=uid;r.size=m.size;r.lines=m.lines;r.preview=m.preview;
    return sb.from('scripts').insert(r).select(COLS).single().then(must).then(function(d){
      id=d.id;
      return sb.from('script_files').insert({script_id:id,code:code}).then(function(x){
        if(x.error){
          /* do not leave a script without a file behind */
          return sb.from('scripts').delete().eq('id',id).then(function(){throw x.error});
        }
        var s=toScript(d);codeCache[s.id]={u:s.updated,code:code};refreshBadge();return s;
      });
    }).then(null,function(e){throw err(e)});
  },
  /* code is optional; pass it only when the file content changed */
  updateScript:function(s,f,code){
    try{userId()}catch(e){return Promise.reject(e)}
    var r=row(f);
    if(code!==undefined){
      if(bytes(code)>MAX)return Promise.reject(new Error('Files are limited to 2 MB'));
      var m=meta(code);r.size=m.size;r.lines=m.lines;r.preview=m.preview;
    }
    return sb.from('scripts').update(r).eq('id',s.id).select(COLS).then(must).then(function(rows){
      if(!rows.length)throw new Error('Not allowed. You can only change your own scripts');
      var d=rows[0];
      if(code===undefined)return toScript(d);
      return sb.from('script_files').upsert({script_id:s.id,code:code},{onConflict:'script_id'}).then(must).then(function(){
        var n=toScript(d);codeCache[n.id]={u:n.updated,code:code};return n;
      });
    }).then(null,function(e){throw err(e)});
  },
  /* the file row is removed together with the script (on delete cascade) */
  deleteScript:function(s){
    return sb.from('scripts').delete().eq('id',s.id).select('id').then(must).then(function(rows){
      if(!rows.length)throw new Error('Not allowed. You can only change your own scripts');
      delete codeCache[s.id];refreshBadge();
    }).then(null,function(e){throw err(e)});
  },
  /* removes every script (with its file) and saved video of the signed-in user; used before account deletion */
  purgeMyFiles:function(){
    var uid;try{uid=userId()}catch(e){return Promise.reject(e)}
    return sb.from('scripts').delete().eq('owner',uid).then(must).then(function(){
      return sb.from('videos').delete().eq('owner',uid).then(must);
    }).then(function(){codeCache={}}).then(null,function(e){throw err(e)});
  },
  listVideos:function(){
    var m=window.AevyAuth.current();
    if(!m)return Promise.resolve([]);
    return sb.from('videos').select('id,url,title').eq('owner',m.id).order('created',{ascending:false}).then(must).then(function(rows){
      return rows.map(function(v){return {id:v.id,url:v.url,title:v.title}});
    });
  },
  addVideo:function(url,title){
    var uid;try{uid=userId()}catch(e){return Promise.reject(e)}
    return sb.from('videos').insert({owner:uid,url:url,title:title||''}).select('id,url,title').single().then(must).then(function(v){
      return {id:v.id,url:v.url,title:v.title};
    }).then(null,function(e){throw err(e)});
  },
  removeVideo:function(id){return sb.from('videos').delete().eq('id',id).then(must).then(function(){},function(e){throw err(e)})}
};
})();
