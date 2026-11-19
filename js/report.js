/* Report button for scripts and profiles. Stores a row in public.reports (see supabase/schema.sql). */
(function(){
var SB=window.AevySB&&window.AevySB.client,A=window.AevyAuth;
var R=[['malware','Malware or harmful code'],['spam','Spam or scam'],['impersonation','Impersonation'],['harassment','Harassment or hate'],['copyright','Copyright / stolen work'],['other','Something else']];
var dlg=document.createElement('dialog');dlg.id='rdlg';dlg.setAttribute('aria-labelledby','rTitle');
dlg.innerHTML='<div class="dlg-head"><div style="min-width:0"><h2 id="rTitle">Report</h2><div class="sub" id="rSub"></div></div><button class="icon-btn" type="button" id="rX" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg></button></div>'+
'<form class="dlg-body form" id="rForm"><div><label class="l" for="rWhy">Reason</label><select class="field sel" id="rWhy" style="width:100%">'+R.map(function(r){return '<option value="'+r[0]+'">'+r[1]+'</option>'}).join('')+'</select></div>'+
'<div><label class="l" for="rTxt">Details <small>(optional)</small></label><textarea class="field" id="rTxt" maxlength="500" style="min-height:90px" placeholder="What is wrong?"></textarea></div>'+
'<p class="ferr" role="alert" id="rErr"></p><div class="actions"><button class="btn btn-primary" type="submit">Send report</button><button class="btn" type="button" id="rC">Cancel</button></div>'+
'<p class="note">Reports are private. Only the Aevy team can see them.</p></form>';
document.body.appendChild(dlg);
var ctx=null,q=function(s){return dlg.querySelector(s)};
q('#rX').onclick=q('#rC').onclick=function(){dlg.close()};
function toast(m){var t=document.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2600)}
window.AevyReport={open:function(kind,id,label){
  if(!A||!A.current()){toast('Sign in to report');location.hash='#/auth';return}
  ctx={kind:kind,id:id};q('#rTitle').textContent='Report '+kind;q('#rSub').textContent=label||'';q('#rErr').textContent='';q('#rTxt').value='';
  dlg.showModal();
}};
q('#rForm').onsubmit=function(e){
  e.preventDefault();var b=this.querySelector('[type=submit]'),er=q('#rErr');b.disabled=true;
  SB.from('reports').insert({kind:ctx.kind,target:ctx.id,reason:q('#rWhy').value,details:q('#rTxt').value.trim()}).then(function(r){
    b.disabled=false;
    if(r.error){er.textContent=r.error.code==='23505'?'You already reported this. Thank you.':'Could not send the report. Try again later.';return}
    dlg.close();toast('Report sent. Thank you for keeping Aevy safe.');
  },function(){b.disabled=false;er.textContent='Could not send the report. Try again later.'});
};
})();
