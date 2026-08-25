'use strict';

const MEDIBRIDGE_POLICY_VERSION='2026-08-25-v1';
const MEDIBRIDGE_UNGATED_ROUTES=new Set(['home','auth','privacy','terms','emergency']);
const medibridgePolicyState={
  userId:null,
  status:'signed_out',
  acceptedAt:null,
  accountAuthority:null,
  pendingRoute:null
};

function resetMediBridgePolicyGate(){
  medibridgePolicyState.userId=null;
  medibridgePolicyState.status='signed_out';
  medibridgePolicyState.acceptedAt=null;
  medibridgePolicyState.accountAuthority=null;
  medibridgePolicyState.pendingRoute=null;
}

function mediBridgeCanOpenRoute(route){
  if(!currentUser)return true;
  if(MEDIBRIDGE_UNGATED_ROUTES.has(route))return true;
  return medibridgePolicyState.userId===currentUser.id &&
    medibridgePolicyState.status==='accepted';
}

function mediBridgeRememberBlockedRoute(route){
  if(route && !MEDIBRIDGE_UNGATED_ROUTES.has(route)){
    medibridgePolicyState.pendingRoute=route;
  }
}

function consumeMediBridgeBlockedRoute(){
  const route=medibridgePolicyState.pendingRoute;
  medibridgePolicyState.pendingRoute=null;
  return route;
}

async function refreshMediBridgePolicyGate(){
  if(!currentUser){
    resetMediBridgePolicyGate();
    return false;
  }

  const userId=currentUser.id;
  medibridgePolicyState.userId=userId;
  medibridgePolicyState.status='checking';
  medibridgePolicyState.acceptedAt=null;
  medibridgePolicyState.accountAuthority=null;

  const {data,error}=await supabaseClient.from('policy_acceptances')
    .select('accepted_at,account_authority')
    .eq('user_id',userId)
    .eq('terms_version',MEDIBRIDGE_POLICY_VERSION)
    .eq('privacy_notice_version',MEDIBRIDGE_POLICY_VERSION)
    .maybeSingle();

  if(currentUser?.id!==userId)return false;

  if(error){
    medibridgePolicyState.status='unavailable';
    console.warn('Policy acknowledgement status unavailable.',error.message);
    return false;
  }

  if(!data){
    medibridgePolicyState.status='pending';
    return false;
  }

  medibridgePolicyState.status='accepted';
  medibridgePolicyState.acceptedAt=data.accepted_at;
  medibridgePolicyState.accountAuthority=data.account_authority;
  return true;
}

window.resetMediBridgePolicyGate=resetMediBridgePolicyGate;
window.mediBridgeCanOpenRoute=mediBridgeCanOpenRoute;
window.mediBridgeRememberBlockedRoute=mediBridgeRememberBlockedRoute;
window.refreshMediBridgePolicyGate=refreshMediBridgePolicyGate;

const DATA_REQUEST_LABELS={
  export:'Data copy / export',
  correction:'Correction',
  restriction:'Processing restriction',
  withdraw_consent:'Consent withdrawal',
  deletion:'Account and eligible-data deletion'
};

async function loadPrivacyCenter(){
  const gate=document.getElementById('privacyRequestGate');
  const form=document.getElementById('privacyRequestForm');
  const list=document.getElementById('privacyRequestList');
  const acceptanceStatus=document.getElementById('policyAcceptanceStatus');
  const acceptanceForm=document.getElementById('policyAcceptanceForm');
  if(!gate||!form||!list)return;
  gate.classList.toggle('hidden',!!currentUser);
  form.classList.toggle('hidden',!currentUser);
  list.replaceChildren();
  if(!currentUser){
    if(acceptanceStatus)acceptanceStatus.textContent='Sign in to check your acknowledgement.';
    acceptanceForm?.classList.add('hidden');
    return;
  }

  if(acceptanceStatus)acceptanceStatus.textContent='Checking your acknowledgement...';

  await loadCurrentPolicyAcceptance();

  const loading=document.createElement('p');
  loading.className='muted';
  loading.textContent='Loading your previous requests...';
  list.appendChild(loading);
  const {data,error}=await supabaseClient.from('data_subject_requests')
    .select('id,request_type,status,created_at,completed_at')
    .eq('requester_id',currentUser.id)
    .order('created_at',{ascending:false})
    .limit(20);
  list.replaceChildren();
  if(error){
    const p=document.createElement('p');
    p.className='error';
    p.textContent='Data-request history is unavailable until the v39 database migration is deployed.';
    list.appendChild(p);
    return;
  }
  if(!data?.length){
    const p=document.createElement('p');
    p.className='muted';
    p.textContent='No data-rights requests submitted from this account.';
    list.appendChild(p);
    return;
  }
  for(const request of data){
    const row=document.createElement('div');
    row.className='privacy-request-row';
    const copy=document.createElement('div');
    const title=document.createElement('b');
    title.textContent=DATA_REQUEST_LABELS[request.request_type]||'Data request';
    const date=document.createElement('p');
    date.className='muted';
    date.textContent=`Submitted ${formatDateTime(request.created_at)}`;
    copy.append(title,date);
    const status=document.createElement('span');
    status.className='badge';
    status.textContent=String(request.status||'received').replaceAll('_',' ');
    row.append(copy,status);
    list.appendChild(row);
  }
}

async function loadCurrentPolicyAcceptance(){
  const status=document.getElementById('policyAcceptanceStatus');
  const form=document.getElementById('policyAcceptanceForm');
  if(!status||!form||!currentUser)return;
  await refreshMediBridgePolicyGate();
  if(medibridgePolicyState.status==='unavailable'){
    status.textContent='Acknowledgement status is unavailable until the v39 database migration is deployed.';
    form.classList.add('hidden');
    return;
  }
  if(medibridgePolicyState.status==='accepted'){
    status.textContent=`Acknowledged ${formatDateTime(medibridgePolicyState.acceptedAt)} · ${String(medibridgePolicyState.accountAuthority).replaceAll('_',' ')}`;
    form.classList.add('hidden');
    return;
  }
  status.textContent='This account has not yet acknowledged the current version.';
  form.classList.remove('hidden');
}

async function recordCurrentPolicyAcceptance(event){
  event.preventDefault();
  if(!currentUser)return;
  const authority=val('privacyAccountAuthority');
  if(!['adult_self','parent_guardian','organisation_representative'].includes(authority)){
    msg('policyAcceptanceMessage','Choose a valid account authority.','error');
    return;
  }
  const {error}=await supabaseClient.from('policy_acceptances').insert({
    user_id:currentUser.id,
    terms_version:MEDIBRIDGE_POLICY_VERSION,
    privacy_notice_version:MEDIBRIDGE_POLICY_VERSION,
    account_authority:authority,
    accepted_at:new Date().toISOString(),
    source:'privacy_center'
  });
  if(error){msg('policyAcceptanceMessage',error.message,'error');return}
  msg('policyAcceptanceMessage','Current policy acknowledgement recorded.','success');
  await refreshMediBridgePolicyGate();
  await loadCurrentPolicyAcceptance();
  const destination=consumeMediBridgeBlockedRoute()||'dashboard';
  showPage(destination);
}

async function submitDataRightsRequest(event){
  event.preventDefault();
  if(!currentUser){showPage('auth');return}
  const requestType=val('privacyRequestType');
  const details=val('privacyRequestDetails').trim();
  if(!Object.hasOwn(DATA_REQUEST_LABELS,requestType)){
    msg('privacyRequestMessage','Choose a valid request type.','error');
    return;
  }
  if(requestType==='deletion' && !confirm('Submit an account deletion request? Access may be restricted while identity and legal-retention requirements are checked.'))return;
  const button=document.getElementById('privacyRequestSubmit');
  button.disabled=true;
  button.textContent='Submitting...';
  const {error}=await supabaseClient.from('data_subject_requests').insert({
    requester_id:currentUser.id,
    request_type:requestType,
    administrative_detail:details||null,
    policy_version:MEDIBRIDGE_POLICY_VERSION,
    status:'received'
  });
  button.disabled=false;
  button.textContent='Submit request';
  if(error){
    msg('privacyRequestMessage','Could not record this request. Deploy the v39 database migration, then try again.','error');
    return;
  }
  event.target.reset();
  window.medibridgeOperationalEvent?.('data_request_created','privacy_center');
  msg('privacyRequestMessage','Request recorded. Keep your account email accessible for identity verification.','success');
  await loadPrivacyCenter();
}

async function loadAdminDataRequests(){
  if(!currentUser||currentProfile?.role!=='admin')return;
  const box=document.getElementById('adminDataRequests');
  if(!box)return;
  box.innerHTML='<div class="card"><p class="muted">Loading data-rights requests...</p></div>';
  const {data,error}=await supabaseClient.from('data_subject_requests')
    .select('id,requester_id,request_type,status,created_at,completed_at')
    .order('created_at',{ascending:true})
    .limit(100);
  if(error){box.innerHTML=`<div class="card"><p class="error">${escapeAdmin(error.message)}</p></div>`;return}
  if(!data?.length){box.innerHTML='<div class="card"><b>No data-rights requests.</b></div>';return}
  const requesterIds=[...new Set(data.map(item=>item.requester_id))];
  const {data:profiles}=await supabaseClient.from('profiles').select('id,full_name').in('id',requesterIds);
  const names=Object.fromEntries((profiles||[]).map(profile=>[profile.id,profile.full_name]));
  box.innerHTML=data.map(request=>`<article class="card"><div class="row between"><div><h3>${escapeAdmin(DATA_REQUEST_LABELS[request.request_type]||request.request_type)}</h3><p class="muted">${escapeAdmin(names[request.requester_id]||'Account holder')} · ${escapeAdmin(formatDateTime(request.created_at))}</p></div><span class="badge">${escapeAdmin(request.status)}</span></div><div class="actions"><button class="btn secondary" type="button" onclick="setAdminDataRequestStatus('${request.id}','in_progress')">Mark in progress</button><button class="btn" type="button" onclick="setAdminDataRequestStatus('${request.id}','completed')">Complete</button><button class="btn secondary" type="button" onclick="setAdminDataRequestStatus('${request.id}','rejected')">Reject with offline record</button></div></article>`).join('');
}

async function setAdminDataRequestStatus(id,status){
  if(!['in_progress','completed','rejected'].includes(status))return;
  if(!confirm(`Set this request to ${status.replaceAll('_',' ')}? Ensure identity verification and the offline case record are complete.`))return;
  const update={status,updated_at:new Date().toISOString(),handled_by:currentUser.id};
  if(['completed','rejected'].includes(status))update.completed_at=new Date().toISOString();
  const {error}=await supabaseClient.from('data_subject_requests').update(update).eq('id',id);
  if(error){toast(error.message,'error');return}
  await loadAdminDataRequests();
}
