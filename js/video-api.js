/* Browser client for the Aevy video API.
   - If js/config.js has a videoApiBase (Cloudflare Worker URL), the real API is used.
   - If it is empty, or the Worker is unreachable, only videos published by users on this site are shown
     (there is no demo content).
   Provider credentials never live here; they stay in the Worker. */
(function(){
  'use strict';
  var cfg=window.AEVY_CONFIG||{};
  var base=String(cfg.videoApiBase||'').replace(/\/+$/,'');

  /* ---------- videos published by users on this site ---------- */
  function parse(u){
    u=String(u||'').trim();if(!u)return null;
    var url;try{url=new URL(/^https?:\/\//i.test(u)?u:'https://'+u)}catch(e){return null}
    var h=url.hostname.replace(/^(www|m)\./,''),id=null,m;
    if(h==='youtu.be')id=url.pathname.slice(1).split('/')[0];
    else if(/^(music\.)?youtube(-nocookie)?\.com$/.test(h)){
      if(url.pathname==='/watch')id=url.searchParams.get('v');
      else if((m=url.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/)))id=m[2];
    }
    if(id&&/^[\w-]{6,}$/.test(id))return {thumb:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',embed:'https://www.youtube-nocookie.com/embed/'+id+'?rel=0&modestbranding=1&playsinline=1',watch:'https://www.youtube.com/watch?v='+id,provider:'YouTube'};
    if(h==='vimeo.com'||h==='player.vimeo.com'){m=url.pathname.match(/(\d{5,})/);if(m)return {thumb:'',embed:'https://player.vimeo.com/video/'+m[1],watch:'https://vimeo.com/'+m[1],provider:'Vimeo'}}
    if(/\.(mp4|webm|ogv|m4v)$/i.test(url.pathname))return {thumb:'',embed:url.href,watch:url.href,provider:'MP4'};
    return null;
  }
  function published(){
    var C=window.AevyCore,out=[];
    try{(C&&C.vis?C.vis():[]).forEach(function(s){
      var v=parse(s.video);if(!v)return;
      out.push({id:'post-'+s.id,title:s.title||'Untitled video',description:s.desc||'',channel_title:s.author||'Aevy creator',provider:v.provider,
        thumbnail_url:v.thumb,playback_url:v.embed,source_url:v.watch,view_count:s.views||0,
        owner:s.owner,published_at:s.created||s.updated||null,categories:[s.cat&&s.cat!=='Other'?s.cat:'Community']});
    })}catch(e){}
    return out;
  }
  function catalog(){return published()}

  function slug(c){return String(c).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
  function localList(o){
    o=o||{};
    var q=String(o.q||'').toLowerCase().trim(),cat=String(o.category||'').toLowerCase(),
        page=Math.max(1,parseInt(o.page,10)||1),limit=Math.min(48,Math.max(1,parseInt(o.limit,10)||24)),
        owners=o.owners||null;
    var items=catalog().filter(function(v){
      if(owners&&!owners[v.owner])return false;
      if(cat&&v.categories.map(function(c){return c.toLowerCase()}).indexOf(cat)<0&&v.categories.map(slug).indexOf(cat)<0)return false;
      if(q&&(v.title+' '+v.description+' '+v.channel_title).toLowerCase().indexOf(q)<0)return false;
      return true;
    });
    if(o.sort==='popular')items.sort(function(a,b){return (b.view_count||0)-(a.view_count||0)});
    else items.sort(function(a,b){return Date.parse(b.published_at||0)-Date.parse(a.published_at||0)});
    var start=(page-1)*limit;
    return {configured:false,local:true,items:items.slice(start,start+limit),hasMore:start+limit<items.length};
  }
  function localCategories(){
    var seen={},items=[];
    catalog().forEach(function(v){v.categories.forEach(function(c){if(!seen[c]){seen[c]=1;items.push({name:c,slug:slug(c)})}})});
    return {configured:false,local:true,items:items};
  }

  /* ---------- remote API (Cloudflare Worker) with local fallback ---------- */
  function get(path){
    return fetch(base+'/api/'+path,{headers:{Accept:'application/json'},credentials:'omit'})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(x){if(!r.ok)throw new Error(x.error||('Video API HTTP '+r.status));return x})});
  }
  function withFallback(path,local){
    if(!base)return Promise.resolve(local());
    return get(path).then(function(r){
      if(r&&r.configured===false)return local();   /* Worker deployed but provider not mapped yet */
      return r;
    },function(){return local()});
  }

  window.AevyVideoAPI={
    /* o: {q, category (slug), page, limit, sort, owners (map of creator ids: Subscriptions tab)} */
    list:function(o){
      o=o||{};
      if(o.owners)return Promise.resolve(localList(o));   /* Subscriptions = videos from creators you follow on this site */
      var p=new URLSearchParams();
      Object.keys(o).forEach(function(k){if(k!=='owners'&&o[k]!==''&&o[k]!=null)p.set(k,o[k])});
      return withFallback('videos?'+p.toString(),function(){return localList(o)});
    },
    categories:function(){return withFallback('categories',localCategories)},
    configured:function(){return !!base},
    health:function(){return base?get('health').catch(function(){return {ok:false,local:true}}):Promise.resolve({ok:true,local:true})}
  };
})();
