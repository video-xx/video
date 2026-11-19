/* Aevy accounts on Supabase Auth (email with a password).
   Public profile data lives in the public.profiles table and is cached in memory so views can render synchronously.
   Usernames are unique through a unique index on profiles.username (see supabase/schema.sql). */
(function(){
'use strict';
var cfg=window.AEVY_CONFIG||{};
if(!window.supabase||!cfg.url||!cfg.key){console.error('Supabase library or js/config.js is missing');return}
/* PKCE keeps the auth tokens out of the URL hash, which this app uses for routing (#/scripts, #/auth ...). */
var sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.AevySB={client:sb};

var COLORS=['#5b86f5','#3fb68b','#e0954a','#9a7cf0','#e0607e','#4cb5d6'];
var profiles=[],index={},user=null,me=null,silent=0,recovering=false,booted=false;
var HOME=location.origin+location.pathname;

function ms(t){var n=t?Date.parse(t):NaN;return isNaN(n)?Date.now():n}
function pub(p){return {id:p.id,username:p.username,name:p.name,bio:p.bio||'',color:p.color,avatar:p.avatar||'',cover:p.cover||'',location:p.location||'',website:p.website||'',role:p.role==='admin'?'admin':'user',verified:!!p.verified,guest:!!p.guest,created:ms(p.created)}}
var PCOLS='id,username,name,bio,color,avatar,cover,location,website,role,verified,guest,created';
function reindex(){index={};profiles.forEach(function(p){index[p.id]=p})}
function hash(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
function aevy(msg,extra){var e=new Error(msg);e.aevy=1;if(extra)for(var k in extra)e[k]=extra[k];return e}
function nice(e){
  if(e&&e.aevy)return e;
  var c=String((e&&(e.code||e.error_code))||''),m=String((e&&e.message)||e||''),s=e&&e.status;
  if(c==='invalid_credentials'||/invalid login credentials/i.test(m))return new Error('Wrong email or password');
  if(c==='email_not_confirmed'||/email not confirmed/i.test(m))return new Error('Confirm your email first: open the link we sent you, then sign in');
  if(c==='user_already_exists'||c==='email_exists'||/already registered/i.test(m))return new Error('An account with that email already exists');
  if(c==='weak_password'||/password should be at least|weak/i.test(m))return new Error('Password must be at least 8 characters');
  if(c==='same_password'||/different from the old/i.test(m))return new Error('Choose a password different from the current one');
  if(c==='validation_failed'&&/email/i.test(m))return new Error('Enter a valid email address');
  if(/invalid email|unable to validate email/i.test(m))return new Error('Enter a valid email address');
  if(c==='over_request_rate_limit'||c==='over_email_send_rate_limit'||c==='email_rate_limit_exceeded'||s===429||/rate limit|too many/i.test(m))return new Error('Too many attempts. Wait a minute and try again');
  if(c==='signup_disabled')return new Error('Sign ups are disabled for this project');
  
  
  
  if(c==='otp_expired'||c==='invalid_otp'||/token has expired|invalid.*(otp|token|code)|otp/i.test(m))return new Error('That code is wrong or expired. Request a new one');
  if(c==='user_banned')return new Error('This account has been disabled');
  if(c==='session_not_found'||c==='reauthentication_needed'||/jwt|session/i.test(m)&&s===401)return new Error('Please sign in again, then retry');
  if(/database error saving new user/i.test(m))return new Error('That username is taken. Try another one');
  if(c==='23505'||/duplicate key/i.test(m))return new Error('That username is taken. Try another one');
  if(c==='42501'||/row-level security|permission denied/i.test(m))return new Error('Permission denied by the database. Run the latest supabase/schema.sql in the Supabase SQL editor');
  if(c==='42P01'||c==='PGRST205'||/schema cache|does not exist/i.test(m))return new Error('The database tables are missing. Run supabase/schema.sql in the Supabase SQL editor');
  if(/failed to fetch|networkerror|load failed|fetch failed/i.test(m))return new Error('Cannot reach the server. Check your connection and disable ad blockers/VPN, then retry');
  return new Error(m||'Request failed');
}
function must(r){if(r.error)throw r.error;return r.data}
var PBASE='id,username,name,bio,color,avatar,cover,location,website,created';
function loadProfiles(){
  return sb.from('profiles').select(PCOLS).order('created',{ascending:true}).limit(1000).then(function(r){
    /* the badge columns (role, verified) are missing until the latest schema.sql is run: fall back so the site keeps working */
    if(r.error&&(r.error.code==='42703'||/role|verified|guest/i.test(r.error.message||''))){
      console.warn('Run the latest supabase/schema.sql to enable badges');
      return sb.from('profiles').select(PBASE).order('created',{ascending:true}).limit(1000);
    }
    return r;
  }).then(function(r){
    profiles=must(r).map(pub);reindex();
  });
}
var EMAIL_RE=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function who(v){
  v=String(v||'').trim();
  if(!v)return {err:'Enter your email'};
  return EMAIL_RE.test(v)?{email:v}:{err:'Enter a valid email address'};
}
/* after sign-up: the profile trigger normally made it; if not, create it from the browser */
function finishUp(un,name){setMe();if(me||!un)return me;return A.claim(un,name).then(function(){return loadProfiles()}).then(function(){setMe();return me})}
function setMe(){me=user?(index[user.id]||null):null}
function ensureProfile(){return index[user.id]?Promise.resolve():loadProfiles()}

var A=window.AevyAuth={
  ready:null,
  current:function(){return me},
  isAdmin:function(){return !!(me&&me.role==='admin')},
  email:function(){return user?(user.email||''):''},
  recovery:function(){return recovering},
  byName:function(n){var k=String(n).toLowerCase();return profiles.filter(function(u){return u.username===k})[0]},
  byId:function(id){return index[id]},
  all:function(){return profiles.filter(function(u){return !u.guest||(me&&(me.guest||me.id===u.id))})},
  refreshProfiles:function(){return loadProfiles().then(setMe)},
  /* true = free, false = taken, null = could not check (never blocks the form) */
  checkUsername:function(un){
    un=String(un||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{3,20}$/.test(un))return Promise.resolve(null);
    return sb.from('profiles').select('id').eq('username',un).limit(1).then(function(r){
      if(r.error)return null;
      return r.data.length?!!(user&&r.data[0].id===user.id):true;
    },function(){return null});
  },
  /* Creates the profile of the signed-in user. The unique index on username makes the claim atomic. */
  claim:function(un,name){
    return sb.from('profiles').insert({id:user.id,username:un,name:name,bio:'',color:COLORS[hash(un)%COLORS.length]}).then(function(r){
      if(r.error){
        if(r.error.code==='23505')throw aevy('That username is taken. Try another one',{taken:1});
        throw r.error;
      }
    });
  },
  signUp:function(o){
    var un=String(o.username||'').trim().toLowerCase(),pw=o.password||'',w=who(o.id!=null?o.id:o.email);
    if(!/^[a-z0-9_]{3,20}$/.test(un))return Promise.reject(new Error('Username: 3 to 20 letters, numbers or underscores'));
    if(w.err)return Promise.reject(new Error(w.err));
    if(pw.length<8)return Promise.reject(new Error('Password must be at least 8 characters'));
    var name=((o.name||un).trim()||un).slice(0,40);
    silent++;
    return A.checkUsername(un).then(function(free){
      if(free===false)throw aevy('That username is taken. Try another one');
      /* username + name travel as user metadata; a database trigger creates the profile (works with or without confirmation) */
      var c={email:w.email,password:pw,options:{data:{username:un,name:name},emailRedirectTo:HOME}};
      return sb.auth.signUp(c).then(must);
    }).then(function(d){
      /* with confirmation on, an already registered address returns a user with no identities instead of an error */
      if(d.user&&d.user.identities&&d.user.identities.length===0)throw aevy('An account with that email already exists. Use the Sign in tab');
      if(!d.session){
        throw aevy('Account created. Open the confirmation link we emailed you, then sign in');
      }
      user=d.session.user;
      return loadProfiles().then(function(){return finishUp(un,name)});
    }).then(function(v){silent--;return v},function(e){silent--;throw nice(e)});
  },
  /* signed in but no profile yet: pick a username */
  pending:function(){return !!user&&!me},
  suggest:function(){
    if(!user)return {name:'',username:''};
    var md=user.user_metadata||{},full=md.full_name||md.name||'';
    var base=String(full||(user.email||'').split('@')[0]||'').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,16);
    return {name:full,username:base.length>=3?base:''};
  },
  completeProfile:function(o){
    if(!user)return Promise.reject(new Error('Sign in first'));
    var un=String(o.username||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{3,20}$/.test(un))return Promise.reject(new Error('Username: 3 to 20 letters, numbers or underscores'));
    var name=((o.name||un).trim()||un).slice(0,40);
    silent++;
    return A.claim(un,name).then(function(){return loadProfiles()}).then(function(){setMe();return me})
      .then(function(v){silent--;return v},function(e){silent--;throw nice(e)});
  },
  resetPassword:function(email){
    email=String(email||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return Promise.reject(new Error('Enter your email address first'));
    return sb.auth.resetPasswordForEmail(email,{redirectTo:HOME}).then(function(r){
      /* do not reveal whether an address has an account */
      if(r.error&&r.error.code!=='user_not_found')throw nice(r.error);
    },function(e){throw nice(e)});
  },
  /* used after the user opens the reset link from the email */
  setNewPassword:function(pw){
    if((pw||'').length<8)return Promise.reject(new Error('Password must be at least 8 characters'));
    return sb.auth.updateUser({password:pw}).then(must).then(function(){recovering=false},function(e){throw nice(e)});
  },
  signIn:function(idv,pw){
    var w=who(idv);
    if(w.err)return Promise.reject(new Error(w.err));
    silent++;
    return sb.auth.signInWithPassword({email:w.email,password:pw}).then(must).then(function(d){
      user=d.user;
      return ensureProfile().then(function(){setMe();return me});
    }).then(function(v){silent--;return v},function(e){silent--;throw nice(e)});
  },
  isGuest:function(){return !!(me&&me.guest)},
  guest:function(){
    silent++;
    return sb.auth.signInAnonymously().then(must).then(function(d){
      user=d.user;var n=0;
      function tryp(){return loadProfiles().then(function(){setMe();if(me||++n>6)return me;return new Promise(function(r){setTimeout(r,500)}).then(tryp)})}
      return tryp();
    }).then(function(v){silent--;if(!v)throw new Error('Could not create the guest profile. Run the latest supabase/schema.sql in Supabase.');return v},function(e){
      silent--;if(/anonymous/i.test((e&&e.message)||''))throw new Error('Guest accounts are not enabled yet. In Supabase open Authentication > Sign In / Providers and turn on "Allow anonymous sign-ins".');
      throw nice(e);
    });
  },
  /* guest welcome: the database makes the guest follow the owner (aevy) and like the owner's posts and scripts */
  welcome:function(){
    return sb.rpc('guest_welcome').then(function(){},function(){});
  },
  /* first visit: no sign-in screen. A guest account is created in the background (needs "Allow anonymous sign-ins" in Supabase). */
  autoGuest:function(){
    return A.guest().then(function(){return A.welcome()}).then(function(){return me},function(e){console.warn('Automatic guest account skipped:',e&&e.message);return null});
  },
  signOut:function(){
    silent++;
    return sb.auth.signOut().then(function(){user=null;me=null;silent--},function(){user=null;me=null;silent--});
  },
  update:function(p){
    if(!me)return Promise.reject(new Error('Sign in first'));
    var f={};
    if(p.name!=null)f.name=String(p.name).trim().slice(0,40)||me.name;
    if(p.bio!=null)f.bio=String(p.bio).slice(0,280);
    if(p.color)f.color=p.color;
    if(p.location!=null)f.location=String(p.location).trim().slice(0,40);
    if(p.website!=null){
      var w=String(p.website).trim();
      if(w&&!/^https?:\/\//i.test(w))w='https://'+w;
      if(w&&!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(w))return Promise.reject(new Error('Enter a valid website address'));
      f.website=w.slice(0,100);
    }
    if(p.avatar!=null)f.avatar=p.avatar;
    if(p.cover!=null)f.cover=p.cover;
    return sb.from('profiles').update(f).eq('id',me.id).select(PCOLS).single().then(must).then(function(d){
      var n=pub(d);profiles=profiles.map(function(u){return u.id===n.id?n:u});reindex();me=n;return n;
    }).then(null,function(e){throw nice(e)});
  },
  /* Uploads a profile photo ('avatar') or cover photo ('cover') to Storage and saves its address on the profile. */
  setImage:function(kind,blob){
    if(!me)return Promise.reject(new Error('Sign in first'));
    if(kind!=='avatar'&&kind!=='cover')return Promise.reject(new Error('Unknown image'));
    var path=me.id+'/'+kind+'.jpg';
    return sb.storage.from('avatars').upload(path,blob,{upsert:true,contentType:'image/jpeg',cacheControl:'3600'}).then(function(r){
      if(r.error)throw r.error;
      var url=sb.storage.from('avatars').getPublicUrl(path).data.publicUrl+'?v='+Date.now();
      var o={};o[kind]=url;return A.update(o);
    }).then(null,function(e){
      var m=String((e&&e.message)||e);
      if(/bucket not found/i.test(m))throw new Error('Photo storage is not set up. Run the latest supabase/schema.sql in the Supabase SQL editor');
      if(/row-level security|not authorized|unauthorized/i.test(m))throw new Error('Not allowed to upload. Run the latest supabase/schema.sql in the Supabase SQL editor');
      throw nice(e);
    });
  },
  removeImage:function(kind){
    if(!me)return Promise.reject(new Error('Sign in first'));
    var o={};o[kind]='';
    return A.update(o).then(function(n){sb.storage.from('avatars').remove([me.id+'/'+kind+'.jpg']).then(function(){},function(){});return n});
  },
  /* deletes every photo of the signed-in user (used before account deletion, best effort) */
  purgeImages:function(){
    if(!me)return Promise.resolve();
    return sb.storage.from('avatars').remove([me.id+'/avatar.jpg',me.id+'/cover.jpg']).then(function(){},function(){});
  },
  /* re-checks the password by signing in again */
  verify:function(pw,msg){
    return sb.auth.signInWithPassword({email:user.email,password:pw}).then(function(r){
      if(r.error){
        /* only a real credentials failure means "wrong password"; show any other cause as it is */
        if(r.error.code==='invalid_credentials'||/invalid login credentials/i.test(r.error.message||''))throw new Error(msg||'Password is wrong');
        throw r.error;
      }
    });
  },
  changePassword:function(oldPw,newPw){
    if(!me)return Promise.reject(new Error('Sign in first'));
    if((newPw||'').length<8)return Promise.reject(new Error('New password must be at least 8 characters'));
    silent++;
    return A.verify(oldPw,'Current password is wrong').then(function(){return sb.auth.updateUser({password:newPw}).then(must)})
      .then(function(){silent--},function(e){silent--;throw nice(e)});
  },
  /* cleanup: function returning a promise that deletes the user's scripts/videos first */
  remove:function(pw,cleanup){
    if(!me)return Promise.reject(new Error('Sign in first'));
    silent++;
    return A.verify(pw,'Password is wrong').then(function(){return cleanup?cleanup():null}).then(function(){
      /* security-definer function from schema.sql: deletes the auth user, which cascades to profile, scripts, files and videos */
      return sb.rpc('delete_my_account').then(must);
    }).then(function(){return sb.auth.signOut({scope:'local'}).catch(function(){})}).then(function(){
      user=null;me=null;return loadProfiles().catch(function(){});
    }).then(function(){silent--},function(e){silent--;throw nice(e)});
  }
};

/* Registered immediately so the PASSWORD_RECOVERY event of a reset link is never missed.
   Do not call Supabase inside this callback. */
sb.auth.onAuthStateChange(function(ev,session){
  if(ev==='PASSWORD_RECOVERY'){recovering=true;setTimeout(function(){window.dispatchEvent(new Event('aevy:recovery'))},0)}
  if(silent||!booted)return;
  /* sign-out or session change in another tab */
  var u=session?session.user:null,before=user?user.id:null,after=u?u.id:null;
  if(before===after){if(u)user=u;return}
  user=u;
  setTimeout(function(){
    (u?ensureProfile().catch(function(){}):Promise.resolve()).then(function(){setMe();window.dispatchEvent(new Event('aevy:auth'))});
  },0);
});

/* Wait for Supabase to restore a saved session (or finish a reset-link return), then load profiles. */
A.ready=sb.auth.getSession().then(function(r){
  user=(r.data&&r.data.session&&r.data.session.user)||null;
  return loadProfiles().catch(function(e){console.error(e)});
}).then(function(){
  setMe();
  /* signed in but no profile yet: send the visitor to the username step */
  if(user&&!me&&location.hash!=='#/auth'&&!recovering)history.replaceState(null,'','#/auth');
  /* no sign-in gate: a returning guest is re-welcomed (new posts of the owner get liked), a brand new visitor gets a guest account */
  if(me&&me.guest)return A.welcome();
  if(!user&&!recovering&&cfg.autoGuest!==false&&!/[?&](code|error)=/.test(location.search))return A.autoGuest();
}).then(function(){
  booted=true;
});
})();
