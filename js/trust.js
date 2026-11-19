/* Trust pages: About, Privacy, Terms, Community Guidelines, Contact. Plain static views, no backend. */
(function(){
var C=window.AEVY_CONFIG||{},MAIL=C.contactEmail||'';
var $=function(s){return document.querySelector(s)};
function page(id,eyebrow,title,lead,body){
  var s=document.createElement('section');s.className='view';s.id='view-'+id;s.dataset.view=id;
  s.innerHTML='<div class="page-head"><div class="wrap"><p class="eyebrow">'+eyebrow+'</p><h1>'+title+'</h1><p>'+lead+'</p></div></div><div class="wrap"><article class="legal">'+body+'</article></div>';
  $('main').appendChild(s);
}
var UP='Last updated: November 2026';
page('about','About Aevy','A home for CPM scripts, built in the open.','Aevy is where creators publish, share and discover CPM scripts, with real accounts and real ownership.',
'<h2>What Aevy is</h2><p>Aevy is a free community platform for CPM scripts. You create an account, publish scripts, follow other creators, chat, and keep private work private.</p>'+
'<h2>What we stand for</h2><ul><li><b>You own your work.</b> Only you can edit or delete what you publish.</li><li><b>No ads, no tracking.</b> We do not sell your data and we do not run ad trackers.</li><li><b>Your email stays private.</b> It is never shown on your profile or to other users.</li><li><b>Real accounts.</b> Sign in with email and password. Passwords are hashed by our auth provider and never visible to us.</li></ul>'+
'<h2>How it is built</h2><p>Accounts, data and files are stored with Supabase, a SOC 2 audited platform. Connections use HTTPS. Access to every table is limited by row-level security rules, so one user cannot change another user\'s content.</p>'+
'<h2>Get in touch</h2><p>Questions, bug reports or takedown requests: see the <a href="#/contact">Contact page</a>.</p>');
page('privacy','Privacy','Privacy Policy.','What we collect, why, and what we never do. '+UP+'.',
'<h2>What we collect</h2><ul><li><b>Account data:</b> your email address, a hashed password, username and display name.</li><li><b>Content you add:</b> scripts, profile text, photos, messages, likes, reviews and follows.</li><li><b>Basic usage counts:</b> downloads and views of scripts, shown as public counters.</li></ul>'+
'<h2>What is public</h2><p>Your username, display name, bio, photos and public scripts are visible to others. Your email address and private scripts are not.</p>'+
'<h2>What we never do</h2><ul><li>We never sell or rent your data.</li><li>We never show ads or use third-party advertising trackers.</li><li>We never ask for your password in a message or email.</li></ul>'+
'<h2>Where data lives</h2><p>Data is stored with Supabase and delivered over HTTPS. Fonts are loaded from Google Fonts and a code library from jsDelivr, which may receive your IP address as any website host would.</p>'+
'<h2>Your control</h2><p>You can edit your profile, delete any script, and delete your account from your profile settings. Deleting your account removes your profile, scripts and photos.</p>'+
'<h2>Contact</h2><p>Privacy questions: <a href="#/contact">Contact page</a>.</p>');
page('terms','Terms','Terms of Service.','The simple rules for using Aevy. '+UP+'.',
'<h2>Your account</h2><p>You are responsible for your account and password. Use a real email address you control. One person, one account.</p>'+
'<h2>Your content</h2><p>You keep ownership of what you publish. By publishing publicly you let others view and download it on Aevy. Only publish content you have the right to share.</p>'+
'<h2>What is not allowed</h2><ul><li>Malware, scripts meant to steal data or harm devices or accounts.</li><li>Harassment, hate, threats or impersonation.</li><li>Copyright infringement or sharing other people\'s private data.</li><li>Spam, scams and attempts to break or overload the service.</li></ul>'+
'<h2>Downloading scripts</h2><p>Scripts are written by community members. Read a script before you run it. Aevy does not guarantee that any script is safe or fit for a purpose.</p>'+
'<h2>Enforcement</h2><p>We may remove content or suspend accounts that break these terms. Report problems through the <a href="#/contact">Contact page</a>.</p>'+
'<h2>Changes</h2><p>We may update these terms and will change the date above when we do.</p>');
page('guidelines','Safety','Community Guidelines.','Keep Aevy a place people can trust.',
'<h2>Be honest</h2><p>Say what your script does. Do not hide behaviour, and do not pretend to be someone else.</p>'+
'<h2>Be safe</h2><p>No malicious code, no credential stealers, no links to harmful downloads. Report anything suspicious instead of running it.</p>'+
'<h2>Be respectful</h2><p>Disagree with ideas, not people. No harassment, hate or threats in comments, reviews or chat.</p>'+
'<h2>Respect ownership</h2><p>Credit original authors. Do not re-upload someone else\'s work as yours.</p>'+
'<h2>Report a problem</h2><p>Use the <a href="#/contact">Contact page</a> with a link to the script or profile.</p>');
page('contact','Contact','Contact us.','Real people read every message.',
'<h2>Support and reports</h2>'+(MAIL?'<p>Email <a href="mailto:'+MAIL+'">'+MAIL+'</a>. For a report, include the link to the script or profile and what is wrong.</p>':'<p>Contact details are being set up. Until then, message the <a href="#/u/Aevy">Aevy account</a> on the community.</p>')+
'<h2>What to include</h2><ul><li>Your username</li><li>A link to the page involved</li><li>A short description of the problem</li></ul>'+
'<p>Never send your password. We will never ask for it.</p>');
})();
