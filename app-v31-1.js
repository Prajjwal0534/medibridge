let authMode='login',currentUser=null,currentProfile=null;
let notificationFilter='all';
let timelineFilter='all';
let careTimelineCache=[];
let selectedCarePlan=null;
let carePlanCreateContext=null;
let notificationPollTimer=null;
function showPage(n){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-'+n)?.classList.add('active');if(n==='dashboard')refreshDashboard();if(n==='profile')loadOnboarding();if(n==='admin')loadAdminPage();if(n==='availability')loadAvailabilityPage();if(n==='book')loadBookingPage();if(n==='appointments')loadAppointmentsPage();if(n==='knowledge')loadClinicalKnowledgePage();if(n==='ai')loadAiPage();if(n==='consultation-explain')loadConsultationExplainPage();if(n==='reports')loadReportsHub();if(n==='pharmacy')loadPharmacyPage();if(n==='diagnostics')loadDiagnosticsPage();if(n==='followups')loadPatientFollowups();if(n==='records')loadMedicalRecordPage();if(n==='timeline')loadCareTimeline();if(n==='careplans')loadCarePlans();if(n==='consent')loadConsentPage();if(n==='referrals')loadReferralsPage();if(n==='notifications')loadNotificationsPage();if(n==='emergency')loadEmergencyPage();if(n==='hospitalops')loadHospitalOpsPage();window.scrollTo({top:0,behavior:'smooth'})}
function setAuthMode(m){authMode=m;document.getElementById('signupFields').classList.toggle('hidden',m!=='signup');document.getElementById('tabLogin').classList.toggle('active',m==='login');document.getElementById('tabSignup').classList.toggle('active',m==='signup');document.getElementById('authSubmit').textContent=m==='login'?'Login':'Create account'}
function msg(id,t,type=''){let e=document.getElementById(id);e.textContent=t;e.className='msg '+type}
function toast(t,x=''){let e=document.getElementById('toast');e.innerHTML='<b>'+t+'</b><br><small>'+x+'</small>';e.classList.remove('hidden');clearTimeout(window.tt);window.tt=setTimeout(()=>e.classList.add('hidden'),4000)}
async function submitAuth(e){e.preventDefault();let email=document.getElementById('email').value.trim(),password=document.getElementById('password').value;msg('authMessage','Working...');if(authMode==='signup'){let full_name=document.getElementById('fullName').value.trim(),role=document.getElementById('signupRole').value;if(!full_name){msg('authMessage','Enter your full name.','error');return}let {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name,role}}});if(error){msg('authMessage',error.message,'error');return}if(data.session){await handleSession(data.session);msg('authMessage','Account created.','success');showPage('profile')}else msg('authMessage','Account created. Check your email to confirm, then come back and log in.','success')}else{let {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error){msg('authMessage',error.message,'error');return}await handleSession(data.session);msg('authMessage','Logged in.','success');showPage('dashboard')}}
async function logout(){
  closeEmbeddedVideoRoom(true);
  await teardownAppointmentVideoRealtime();
  await teardownIncomingVideoCallWatcher();
  await supabaseClient.auth.signOut();
  currentUser=null;
  currentProfile=null;
  stopNotificationPolling();
  updateUI();
  showPage('home');
}
async function handleSession(s){
  currentUser=s?.user||null;
  if(currentUser)await loadProfile();else currentProfile=null;
  updateUI();
  if(currentUser){
    await setupIncomingVideoCallWatcher();
    await refreshNotificationBadge();
    startNotificationPolling();
  }else{
    await teardownIncomingVideoCallWatcher();
    stopNotificationPolling();
  }
}
async function loadProfile(){let {data,error}=await supabaseClient.from('profiles').select('*').eq('id',currentUser.id).single();if(!error){currentProfile=data;queueMicrotask(()=>updateUI())}return data}
function updateUI(){
  let l=document.getElementById('sessionLabel'),
      a=document.getElementById('adminNavBtn'),
      av=document.getElementById('availabilityNavBtn'),
      b=document.getElementById('bookNavBtn'),
      ap=document.getElementById('appointmentsNavBtn'),
      rec=document.getElementById('recordsNavBtn'),
      timeline=document.getElementById('timelineNavBtn'),
      carePlans=document.getElementById('carePlansNavBtn'),
      followups=document.getElementById('followupsNavBtn'),
      reports=document.getElementById('reportsNavBtn'),
      pharmacy=document.getElementById('pharmacyNavBtn'),
      diagnostics=document.getElementById('diagnosticsNavBtn'),
      con=document.getElementById('consentNavBtn'),
      ref=document.getElementById('referralsNavBtn'),
      notifications=document.getElementById('notificationsNavBtn'),
      hop=document.getElementById('hospitalOpsNavBtn'),
      ai=document.getElementById('aiNavBtn'),
      knowledge=document.getElementById('knowledgeNavBtn');

  if(currentUser){
    l.textContent=(currentProfile?.full_name||currentUser.email)+' · '+(currentProfile?.role||'account');
    document.getElementById('logoutBtn').classList.remove('hidden');
    document.getElementById('loginBtn').classList.add('hidden');

    const role=currentProfile?.role;

    a.classList.toggle('hidden',!(role==='admin'&&currentProfile?.verification_status==='verified'));
    knowledge.classList.toggle('hidden',!(role==='admin'&&currentProfile?.verification_status==='verified'));
    av.classList.toggle('hidden',!(role==='doctor'&&currentProfile?.verification_status==='verified'));
    hop.classList.toggle('hidden',!(role==='hospital'&&currentProfile?.verification_status==='verified'));
    b.classList.toggle('hidden',role!=='patient');
    ap.classList.toggle('hidden',!['patient','doctor','hospital','admin'].includes(role));
    rec.classList.toggle('hidden',role!=='patient');
    timeline.classList.toggle('hidden',role!=='patient');
    carePlans.classList.toggle('hidden',!['patient','doctor'].includes(role));
    followups.classList.toggle('hidden',role!=='patient');
    reports.classList.toggle('hidden',!['patient','doctor','admin'].includes(role));
    pharmacy.classList.toggle('hidden',!['patient','pharmacy','admin'].includes(role));
    diagnostics.classList.toggle('hidden',!['patient','lab','admin'].includes(role));
    con.classList.toggle('hidden',role!=='patient');
    ref.classList.toggle('hidden',!['patient','doctor'].includes(role));
    notifications.classList.remove('hidden');
    ai.classList.toggle('hidden',!(role==='patient'||(role==='doctor'&&currentProfile?.verification_status==='verified')));
  }else{
    l.textContent='Not signed in';
    document.getElementById('logoutBtn').classList.add('hidden');
    if(reports)reports.classList.add('hidden');
    document.getElementById('loginBtn').classList.remove('hidden');
    [a,av,b,ap,rec,timeline,carePlans,followups,reports,pharmacy,diagnostics,con,ref,notifications,hop,ai,knowledge]
      .filter(Boolean)
      .forEach(x=>x.classList.add('hidden'));
  }
}

function startNotificationPolling(){
  stopNotificationPolling();
  notificationPollTimer=setInterval(()=>{
    if(currentUser)refreshNotificationBadge();
  },30000);
}

function stopNotificationPolling(){
  if(notificationPollTimer){
    clearInterval(notificationPollTimer);
    notificationPollTimer=null;
  }
}

async function refreshNotificationBadge(){
  const badge=document.getElementById('notificationCountBadge');
  if(!badge || !currentUser)return;

  const {count,error}=await supabaseClient
    .from('notifications')
    .select('id',{count:'exact',head:true})
    .eq('user_id',currentUser.id)
    .eq('is_read',false);

  if(error)return;

  const n=count||0;
  badge.textContent=n>99?'99+':String(n);
  badge.classList.toggle('hidden',n===0);
}

function setNotificationFilter(filter){
  notificationFilter=filter==='unread'?'unread':'all';

  document.getElementById('notificationFilterAll')?.classList.toggle('active',notificationFilter==='all');
  document.getElementById('notificationFilterUnread')?.classList.toggle('active',notificationFilter==='unread');

  loadNotificationsPage();
}

function notificationIcon(type){
  if(type.includes('referral'))return '↗';
  if(type.includes('diagnostic'))return '🧪';
  if(type.includes('pharmacy'))return '💊';
  if(type.includes('appointment'))return '📅';
  return '•';
}

function formatNotificationTime(timestamp){
  const d=new Date(timestamp);
  const now=new Date();
  const diff=Math.max(0,now-d);
  const minutes=Math.floor(diff/60000);

  if(minutes<1)return 'Just now';
  if(minutes<60)return `${minutes} min ago`;

  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours} hr${hours===1?'':'s'} ago`;

  const days=Math.floor(hours/24);
  if(days<7)return `${days} day${days===1?'':'s'} ago`;

  return d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
}

async function loadNotificationsPage(){
  const gate=document.getElementById('notificationsGate');
  const content=document.getElementById('notificationsContent');
  const box=document.getElementById('notificationsList');

  if(!currentUser){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');

  let query=supabaseClient
    .from('notifications')
    .select('*')
    .eq('user_id',currentUser.id)
    .order('created_at',{ascending:false})
    .limit(100);

  if(notificationFilter==='unread'){
    query=query.eq('is_read',false);
  }

  const {data,error}=await query;

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!data?.length){
    box.innerHTML=`<div class="card empty-state">
      <div class="empty-icon">🔔</div>
      <h3>${notificationFilter==='unread'?'No unread notifications':'No notifications yet'}</h3>
      <p class="muted">Care updates will appear here automatically.</p>
    </div>`;
    await refreshNotificationBadge();
    return;
  }

  box.innerHTML=data.map(n=>`
    <button class="notification-card ${n.is_read?'read':'unread'}" onclick="openNotification('${n.id}','${escapeAdmin(n.entity_type||'')}','${n.entity_id||''}')">
      <span class="notification-icon">${notificationIcon(n.notification_type||'')}</span>
      <span class="notification-body">
        <span class="notification-title-row">
          <b>${escapeAdmin(n.title)}</b>
          ${n.is_read?'':'<span class="notification-unread-dot" aria-label="Unread"></span>'}
        </span>
        <span class="notification-message">${escapeAdmin(n.message)}</span>
        <small>${escapeAdmin(formatNotificationTime(n.created_at))}</small>
      </span>
    </button>
  `).join('');

  await refreshNotificationBadge();
}

async function markNotificationRead(id){
  await supabaseClient
    .from('notifications')
    .update({is_read:true})
    .eq('id',id)
    .eq('user_id',currentUser.id);

  await refreshNotificationBadge();
}

async function markAllNotificationsRead(){
  if(!currentUser)return;

  const {error}=await supabaseClient
    .from('notifications')
    .update({is_read:true})
    .eq('user_id',currentUser.id)
    .eq('is_read',false);

  if(error){
    msg('notificationsMessage',error.message,'error');
    return;
  }

  msg('notificationsMessage','All notifications marked as read.','success');
  await loadNotificationsPage();
}

async function openNotification(id,entityType,entityId){
  await markNotificationRead(id);

  if(entityType==='appointment' && entityId){
    await openAppointmentDetail(entityId);
    return;
  }

  if(entityType==='referral' && entityId){
    await openReferralDetail(entityId);
    return;
  }

  if(entityType==='care_plan' && entityId){
    showPage('careplans');
    setTimeout(()=>openCarePlan(entityId),150);
    return;
  }

  if(entityType==='diagnostic_request'){
    showPage('diagnostics');
    return;
  }

  if(entityType==='pharmacy_request'){
    showPage('pharmacy');
    return;
  }

  await loadNotificationsPage();
}

async function refreshDashboard(){let g=document.getElementById('dashGate'),c=document.getElementById('dashContent');if(!currentUser){g.classList.remove('hidden');c.classList.add('hidden');return}await loadProfile();g.classList.add('hidden');c.classList.remove('hidden');let r=currentProfile?.role||'patient';document.getElementById('dashTitle').textContent='Welcome, '+(currentProfile?.full_name||currentUser.email);document.getElementById('verifyBadge').textContent=currentProfile?.verification_status||'pending';let cards={patient:[['Appointments','Manage care'],['Health record','Connected history'],['Referrals','Track specialist care']],doctor:[['Patient queue','Clinical work'],['Reports','Review results'],['Referrals','Collaborate']],hospital:[['OPD','Patient flow'],['Emergency','Facility status'],['Referrals','Incoming care']],pharmacy:[['Prescription requests','Fulfil patient prescriptions'],['Profile','Manage pharmacy details'],['Status','Track request progress']],lab:[['Diagnostic requests','Manage patient test requests'],['Test catalogue','Manage available tests'],['Profile','Manage diagnostic centre details']],admin:[['Doctor verification','Review pending doctors'],['Hospital verification','Coming next'],['Platform safety','Admin controls']]};document.getElementById('dashCards').innerHTML=(cards[r]||cards.patient).map(x=>'<div class="card"><b>'+x[0]+'</b><p>'+x[1]+'</p></div>').join('');const followupDash=document.getElementById('patientFollowupDashboardCard');
  if(r==='patient'){
    followupDash.classList.remove('hidden');
    loadPatientFollowups();
  }else{
    followupDash.classList.add('hidden');
  }

  const consentCard=document.getElementById('doctorConsentRecordsCard');
  if(r==='doctor' && currentProfile?.verification_status==='verified'){
    consentCard.classList.remove('hidden');
    loadDoctorConsentedPatients();
  }else{
    consentCard.classList.add('hidden');
  }

  document.getElementById('nextStep').textContent=r==='admin'?'Open the Admin page to review pending doctor applications.':r==='doctor'?(currentProfile?.verification_status==='verified'?'You are a verified MediBridge doctor. Set your availability so patients can book appointments.':currentProfile?.verification_status==='pending'?'Your profile is submitted. Verification is pending.':'Your doctor verification is not active. Check your profile or contact MediBridge.'):r==='hospital'?'Complete your facility profile.':'Complete your patient and emergency information.'}
async function loadOnboarding(){
  let g=document.getElementById('profileGate'),c=document.getElementById('profileContent');
  if(!currentUser){g.classList.remove('hidden');c.classList.add('hidden');return}

  await loadProfile();
  g.classList.add('hidden');
  c.classList.remove('hidden');

  document.getElementById('pFullName').value=currentProfile?.full_name||'';
  document.getElementById('pPhone').value=currentProfile?.phone||'';

  ['patientForm','doctorForm','hospitalForm','pharmacyForm','labForm'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  let r=currentProfile?.role||'patient';

  if(r==='admin'){
    document.getElementById('profileTitle').textContent='Admin profile';
    msg('profileMessage','This is a MediBridge administrator account. Use the Admin tab to review verification requests.','success');
    return;
  }

  document.getElementById('profileTitle').textContent=
    r==='doctor'?'Doctor onboarding':
    r==='hospital'?'Hospital / Clinic onboarding':
    r==='pharmacy'?'Pharmacy onboarding':
    r==='lab'?'Diagnostic Centre / Lab onboarding':
    'Patient onboarding';

  document.getElementById(
    r==='doctor'?'doctorForm':
    r==='hospital'?'hospitalForm':
    r==='pharmacy'?'pharmacyForm':
    r==='lab'?'labForm':
    'patientForm'
  ).classList.remove('hidden');

  if(r==='doctor') await loadDoctor();
  if(r==='hospital') await loadHospital();
  if(r==='pharmacy') await loadPharmacyProfile();
  if(r==='lab') await loadLabProfile();
  if(r==='patient') await loadPatientProfile();
}
async function saveBase(e){e.preventDefault();let {error}=await supabaseClient.from('profiles').update({full_name:val('pFullName'),phone:val('pPhone')||null}).eq('id',currentUser.id);msg('profileMessage',error?error.message:'Basic profile saved.',error?'error':'success');if(!error){await loadProfile();updateUI()}}

async function loadPatientProfile(){
  const {data,error}=await supabaseClient
    .from('patient_profiles')
    .select('*')
    .eq('id',currentUser.id)
    .maybeSingle();

  if(error){msg('profileMessage',error.message,'error');return}
  if(!data)return;

  document.getElementById('patientDob').value=data.date_of_birth||'';
  document.getElementById('patientGender').value=data.gender||'';
  document.getElementById('patientBlood').value=data.blood_group||'';
  document.getElementById('patientEmergencyName').value=data.emergency_contact_name||'';
  document.getElementById('patientEmergencyPhone').value=data.emergency_contact_phone||'';
}

async function loadHospital(){
  const {data,error}=await supabaseClient
    .from('hospital_profiles')
    .select('*')
    .eq('id',currentUser.id)
    .maybeSingle();

  if(error){msg('profileMessage',error.message,'error');return}
  if(!data)return;

  document.getElementById('hospitalName').value=data.hospital_name||'';
  document.getElementById('hospitalAddress').value=data.address||'';
  document.getElementById('hospitalCity').value=data.city||'';
  document.getElementById('hospitalState').value=data.state||'Uttar Pradesh';
  document.getElementById('hospitalDistrict').value=data.district||'';
  document.getElementById('hospitalMapsLink').value=data.google_maps_url||'';
  document.getElementById('hospitalEmergency').value=String(!!data.emergency_available);
  document.getElementById('hospitalLatitude').value=data.latitude??'';
  document.getElementById('hospitalLongitude').value=data.longitude??'';
  document.getElementById('hospitalLocationStatus').textContent=
    (data.latitude!=null && data.longitude!=null)
      ? `Saved GPS: ${Number(data.latitude).toFixed(5)}, ${Number(data.longitude).toFixed(5)}`
      : 'Location not captured yet';
}

async function savePatient(e){e.preventDefault();let p={id:currentUser.id,date_of_birth:val('patientDob')||null,gender:val('patientGender')||null,blood_group:val('patientBlood')||null,emergency_contact_name:val('patientEmergencyName')||null,emergency_contact_phone:val('patientEmergencyPhone')||null};let {error}=await supabaseClient.from('patient_profiles').upsert(p);msg('profileMessage',error?error.message:'Patient profile saved.',error?'error':'success');if(!error)await loadPatientProfile()}
async function loadDoctor(){let {data}=await supabaseClient.from('doctor_profiles').select('*').eq('id',currentUser.id).maybeSingle();if(!data)return;document.getElementById('doctorSpecialty').value=data.specialty||'';document.getElementById('doctorQualification').value=data.qualification||'';document.getElementById('doctorRegistration').value=data.medical_registration_number||'';document.getElementById('doctorHospital').value=data.hospital_name||'';document.getElementById('doctorMapsLink').value=data.google_maps_url||'';
  document.getElementById('doctorLatitude').value=data.clinic_latitude??'';
  document.getElementById('doctorLongitude').value=data.clinic_longitude??'';
  document.getElementById('doctorLocationStatus').textContent=
    (data.clinic_latitude!=null && data.clinic_longitude!=null)
      ? `Saved GPS: ${Number(data.clinic_latitude).toFixed(5)}, ${Number(data.clinic_longitude).toFixed(5)}`
      : 'Location not captured yet';document.getElementById('doctorExperience').value=data.experience_years??'';if(data.license_certificate_path)msg('certificateStatus','Certificate on file: '+data.license_certificate_path,'success')}
async function saveDoctor(e){e.preventDefault();let path=null,file=document.getElementById('doctorCertificate').files[0];if(file){let allowed=['application/pdf','image/jpeg','image/png'];if(!allowed.includes(file.type)){msg('certificateStatus','Use PDF, JPG or PNG only.','error');return}if(file.size>10*1024*1024){msg('certificateStatus','Maximum 10 MB.','error');return}path=currentUser.id+'/'+Date.now()+'_'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');msg('certificateStatus','Uploading...');let {error}=await supabaseClient.storage.from('Doctor verification').upload(path,file);if(error){msg('certificateStatus',error.message,'error');return}msg('certificateStatus','Certificate uploaded privately.','success')}let dLat=val('doctorLatitude'),dLng=val('doctorLongitude');

  if(!dLat && !dLng && navigator.geolocation){
    try{
      const pos=await new Promise((resolve,reject)=>
        navigator.geolocation.getCurrentPosition(resolve,reject,{
          enableHighAccuracy:true,
          timeout:12000,
          maximumAge:0
        })
      );
      dLat=String(pos.coords.latitude);
      dLng=String(pos.coords.longitude);
      document.getElementById('doctorLatitude').value=dLat;
      document.getElementById('doctorLongitude').value=dLng;
      document.getElementById('doctorLocationStatus').textContent=
        `GPS captured: ${Number(dLat).toFixed(5)}, ${Number(dLng).toFixed(5)}`;
    }catch(_e){}
  }

  let p={id:currentUser.id,specialty:val('doctorSpecialty'),qualification:val('doctorQualification'),medical_registration_number:val('doctorRegistration'),hospital_name:val('doctorHospital')||null,
    clinic_city:val('doctorClinicCity')||null,
    clinic_district:val('doctorClinicDistrict')||null,google_maps_url:val('doctorMapsLink')||null,clinic_latitude:dLat?Number(dLat):null,clinic_longitude:dLng?Number(dLng):null,experience_years:val('doctorExperience')?Number(val('doctorExperience')):null};if(path)p.license_certificate_path=path;let {error}=await supabaseClient.from('doctor_profiles').upsert(p);msg('profileMessage',error?error.message:'Doctor profile saved. Verification remains pending.',error?'error':'success');if(!error)await loadDoctor()}
async function saveHospital(e){
  e.preventDefault();

  let lat=val('hospitalLatitude'),lng=val('hospitalLongitude');

  if(!lat && !lng && navigator.geolocation){
    msg('profileMessage','Getting hospital GPS location before saving...');
    try{
      const pos=await new Promise((resolve,reject)=>
        navigator.geolocation.getCurrentPosition(resolve,reject,{
          enableHighAccuracy:true,
          timeout:12000,
          maximumAge:0
        })
      );
      lat=String(pos.coords.latitude);
      lng=String(pos.coords.longitude);
      document.getElementById('hospitalLatitude').value=lat;
      document.getElementById('hospitalLongitude').value=lng;
      document.getElementById('hospitalLocationStatus').textContent=
        `GPS captured: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
    }catch(err){
      msg('profileMessage','Location permission is needed to save an accurate hospital location. You can still save the profile without GPS if you prefer.','error');
    }
  }

  if((lat&&!lng)||(!lat&&lng)){
    msg('profileMessage','Latitude and longitude must both be provided.','error');
    return;
  }

  if(lat && (Number(lat)<-90 || Number(lat)>90)){
    msg('profileMessage','Latitude must be between -90 and 90.','error');
    return;
  }

  if(lng && (Number(lng)<-180 || Number(lng)>180)){
    msg('profileMessage','Longitude must be between -180 and 180.','error');
    return;
  }

  const p={
    id:currentUser.id,
    hospital_name:val('hospitalName'),
    address:val('hospitalAddress')||null,
    city:val('hospitalCity')||null,
    state:val('hospitalState')||null,
    district:val('hospitalDistrict')||null,
    google_maps_url:val('hospitalMapsLink')||null,
    latitude:lat?Number(lat):null,
    longitude:lng?Number(lng):null,
    emergency_available:val('hospitalEmergency')==='true'
  };
  const {error}=await supabaseClient.from('hospital_profiles').upsert(p);
  msg('profileMessage',error?error.message:'Hospital profile saved. Verification remains pending until reviewed.',error?'error':'success');
  if(!error) await loadHospital();
}
function val(id){return document.getElementById(id).value.trim()}



let selectedReportForAppointmentLink=null;
let videoSessionRefreshTimer=null;
let videoRealtimeChannel=null;
let incomingVideoRealtimeChannel=null;
let incomingVideoAppointment=null;
let activeVideoSession=null;
let cachedVerifiedPharmacies=[];
let patientPharmacyLocation=null;
let patientPharmacyPageData={consultations:[],items:[],requests:[]};
let patientPharmacyPlaceDebounce=null;
let cachedVerifiedLabs=[];
let diagnosticUserLocation=null;
let diagnosticPlaceDebounce=null;
let jitsiApi=null;
let videoCallTimerInterval=null;
let videoCallStartedAt=null;
let doctorRingTimeout=null;
let selectedAppointment=null;
let doctorOverviewPatientId=null;
let doctorOverviewAppointmentId=null;
let currentDoctorAccessRequest=null;
let selectedConsultation=null;
let selectedReferral=null;
let referralDoctorCache=[];
let activeReferralBookingId=null;
let selectedDoctor=null;
let selectedSlot=null;
let cachedDoctors=[];
let cachedHospitals=[];
let careMode='doctor';
let careUserLocation=null;
let selectedHospital=null;
let selectedEmergencyHospital=null;

async function loadBookingPage(){
  const gate=document.getElementById('bookGate'),content=document.getElementById('bookContent');
  await loadProfile();

  if(!currentUser || currentProfile?.role!=='patient'){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');
  await loadCareResults();
}


function setCareMode(mode){
  careMode=mode;
  document.getElementById('careDoctorTab').classList.toggle('active',mode==='doctor');
  document.getElementById('careHospitalTab').classList.toggle('active',mode==='hospital');
  document.getElementById('verifiedDoctors').classList.toggle('hidden',mode!=='doctor');
  document.getElementById('verifiedHospitals').classList.toggle('hidden',mode!=='hospital');
  document.getElementById('doctorSearchInput').placeholder=
    mode==='doctor'?'Doctor, specialty, hospital...':'Hospital / clinic name...';
  loadCareResults();
}


let carePlaceDebounce=null;

function handleCarePlaceInput(){
  clearTimeout(carePlaceDebounce);
  carePlaceDebounce=setTimeout(()=>loadCareResults(),350);
}

function useCareLocation(){
  if(!navigator.geolocation){
    msg('bookingMessage','Location is not supported by this browser.','error');
    return;
  }

  const status=document.getElementById('careLocationStatus');
  status.textContent='Detecting location...';

  navigator.geolocation.getCurrentPosition(
    pos=>{
      careUserLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      status.textContent=`Location set · ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} · radius filter active`;
      msg('bookingMessage','Location detected. Results will use exact GPS distance.','success');
      loadCareResults();
    },
    err=>{
      status.textContent='Location permission denied or unavailable';
      msg('bookingMessage','Could not access location: '+err.message,'error');
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}

async function loadCareResults(){
  if(careMode==='hospital') await loadVerifiedHospitalsForBooking();
  else await loadVerifiedDoctors();
}

async function loadVerifiedDoctors(){
  const place=(document.getElementById('carePlaceInput')?.value||'').trim();
  const radius=Number(document.getElementById('careRadius')?.value||25);
  const box=document.getElementById('verifiedDoctors');

  // Strict location gate: never dump the full doctor network.
  if(!careUserLocation && place.length<2){
    cachedDoctors=[];
    box.innerHTML=`<div class="card empty-state">
      <div class="empty-icon">📍</div>
      <h3>Choose a city or district first</h3>
      <p class="muted">Enter a city/district or use your current location to see doctors and clinics available there.</p>
    </div>`;
    msg('bookingMessage','');
    return;
  }

  msg('bookingMessage','Loading verified doctors...');

  if(careUserLocation){
    const {data,error}=await supabaseClient.rpc('nearby_verified_doctors',{
      user_lat:careUserLocation.lat,
      user_lng:careUserLocation.lng,
      radius_km:radius
    });

    if(error){msg('bookingMessage',error.message,'error');return}

    cachedDoctors=(data||[]).map(x=>({...x}));
    renderDoctors(cachedDoctors);

    msg(
      'bookingMessage',
      cachedDoctors.length
        ? `Showing doctors/clinics within ${radius} km, nearest first.`
        : `No verified doctors with saved clinic GPS were found within ${radius} km.`,
      cachedDoctors.length?'success':''
    );
    return;
  }

  const {data:profiles,error:pErr}=await supabaseClient
    .from('profiles')
    .select('id,full_name,verification_status')
    .eq('role','doctor')
    .eq('verification_status','verified');

  if(pErr){msg('bookingMessage',pErr.message,'error');return}

  if(!profiles?.length){
    cachedDoctors=[];
    box.innerHTML='<div class="card"><b>No verified doctors available in MediBridge yet.</b></div>';
    msg('bookingMessage','');
    return;
  }

  const ids=profiles.map(x=>x.id);
  const {data:docs,error:dErr}=await supabaseClient
    .from('doctor_profiles')
    .select('id,specialty,qualification,hospital_name,clinic_city,clinic_district,experience_years,google_maps_url,clinic_latitude,clinic_longitude')
    .in('id',ids);

  if(dErr){msg('bookingMessage',dErr.message,'error');return}

  const dm=Object.fromEntries((docs||[]).map(x=>[x.id,x]));
  const placeLower=place.toLowerCase();

  cachedDoctors=profiles
    .map(p=>({...p,...(dm[p.id]||{}),distance_km:null}))
    .filter(d=>
      [d.clinic_city,d.clinic_district,d.hospital_name]
        .filter(Boolean)
        .some(v=>String(v).toLowerCase().includes(placeLower))
    );

  renderDoctors(cachedDoctors);

  msg(
    'bookingMessage',
    cachedDoctors.length
      ? `Showing verified doctors/clinics matching “${place}”.`
      : `No verified doctors/clinics found for “${place}”.`,
    cachedDoctors.length?'success':''
  );
}

function renderDoctors(list){
  const q=(document.getElementById('doctorSearchInput')?.value||'').toLowerCase().trim();
  const filtered=list.filter(d=>{
    const text=((d.full_name||'')+' '+(d.specialty||'')+' '+(d.hospital_name||'')+' '+(d.clinic_city||'')+' '+(d.clinic_district||'')).toLowerCase();
    return text.includes(q);
  });
  const box=document.getElementById('verifiedDoctors');

  if(!filtered.length){
    box.innerHTML='<div class="card"><b>No matching doctors.</b></div>';
    return;
  }

  box.innerHTML=filtered.map(d=>{
    let mapLink=d.google_maps_url||null;
    if(!mapLink && d.clinic_latitude!=null && d.clinic_longitude!=null){
      mapLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.clinic_latitude+','+d.clinic_longitude)}`;
    }
    return `<div class="card doctor-card">
      <div class="row between">
        <div>
          <span class="badge" style="background:#def6df;color:#17621a">Verified</span>
          <h2>${escapeAdmin(d.full_name||'Doctor')}</h2>
          <p><b>${escapeAdmin(d.specialty||'General')}</b></p>
          <p class="muted">${escapeAdmin(d.qualification||'')} ${d.hospital_name?'· '+escapeAdmin(d.hospital_name):''}</p>
          ${(d.clinic_city||d.clinic_district)?`<p class="muted">${escapeAdmin([d.clinic_city,d.clinic_district].filter(Boolean).join(' · '))}</p>`:''}
          <p class="muted">${d.experience_years??'—'} years experience</p>
          ${d.distance_km!=null?`<p><b>Distance:</b> ${Number(d.distance_km).toFixed(2)} km</p>`:''}
        </div>
        <div class="row">
          ${mapLink?`<button class="btn secondary" onclick="window.open('${mapLink.replace(/'/g,"%27")}','_blank')">Location</button>`:''}
          <button class="btn" onclick="openDoctorBooking('${d.id}')">View slots</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function loadVerifiedHospitalsForBooking(){
  const place=(document.getElementById('carePlaceInput')?.value||'').trim();
  const box=document.getElementById('verifiedHospitals');

  // Strict location gate: do not list all hospitals by default.
  if(!careUserLocation && place.length<2){
    cachedHospitals=[];
    box.innerHTML=`<div class="card empty-state">
      <div class="empty-icon">📍</div>
      <h3>Set your location first</h3>
      <p class="muted">Use your current location or enter a city/district to see nearby verified hospitals and clinics.</p>
    </div>`;
    msg('bookingMessage','');
    return;
  }

  msg('bookingMessage','Loading verified hospitals...');

  let query=supabaseClient
    .from('hospital_profiles')
    .select('id,hospital_name,address,city,district,state,google_maps_url,latitude,longitude')
    .order('hospital_name',{ascending:true});

  // If no GPS, use explicit place/district only.
  if(!careUserLocation && place){
    query=query.or(
      `city.ilike.%${place}%,district.ilike.%${place}%,address.ilike.%${place}%,hospital_name.ilike.%${place}%`
    );
  }

  const {data:hospitals,error:hErr}=await query;

  if(hErr){msg('bookingMessage',hErr.message,'error');return}

  cachedHospitals=(hospitals||[]).map(h=>{
    let distance_km=null;
    if(careUserLocation && h.latitude!=null && h.longitude!=null){
      distance_km=haversineKm(
        careUserLocation.lat,
        careUserLocation.lng,
        Number(h.latitude),
        Number(h.longitude)
      );
    }
    return {...h,distance_km};
  });

  const radius=Number(document.getElementById('careRadius')?.value||25);

  if(careUserLocation){
    cachedHospitals=cachedHospitals
      .filter(h=>h.distance_km!=null && h.distance_km<=radius)
      .sort((a,b)=>a.distance_km-b.distance_km);
  }

  renderHospitalsForBooking();

  if(careUserLocation){
    msg('bookingMessage',
      `Showing verified hospitals/clinics within ${radius} km, nearest first.`,
      'success');
  }else{
    msg('bookingMessage',
      `Showing verified hospitals/clinics matching “${place}”.`,
      'success');
  }
}

function renderHospitalsForBooking(){
  const q=(document.getElementById('doctorSearchInput')?.value||'').toLowerCase().trim();
  const list=cachedHospitals.filter(h=>
    ((h.hospital_name||'')+' '+(h.city||'')+' '+(h.district||'')+' '+(h.state||'')).toLowerCase().includes(q)
  );

  const box=document.getElementById('verifiedHospitals');

  if(!list.length){
    box.innerHTML='<div class="card"><b>No matching verified hospitals / clinics.</b></div>';
    return;
  }

  box.innerHTML=list.map(h=>{
    let mapLink=h.google_maps_url||null;
    if(!mapLink && h.latitude!=null && h.longitude!=null){
      mapLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.latitude+','+h.longitude)}`;
    }
    return `<div class="card hospital-result">
      <div class="row between">
        <div>
          <span class="badge" style="background:#def6df;color:#17621a">Verified hospital</span>
          <h2>${escapeAdmin(h.hospital_name||'Hospital')}</h2>
          <p class="muted">${escapeAdmin([h.address,h.city,h.district,h.state].filter(Boolean).join(', '))}</p>
          ${h.distance_km!=null?`<p><b>Distance:</b> ${Number(h.distance_km).toFixed(2)} km</p>`:''}
        </div>
        <div class="row">
          ${mapLink?`<button class="btn secondary" onclick="window.open('${mapLink.replace(/'/g,"%27")}','_blank')">Location</button>`:''}
          <button class="btn" onclick="openHospitalBooking('${h.id}')">Book hospital</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterCareResults(){
  if(careMode==='hospital')renderHospitalsForBooking();
  else renderDoctors(cachedDoctors);
}


function openHospitalBooking(id){
  selectedHospital=cachedHospitals.find(x=>x.id===id);
  if(!selectedHospital){
    msg('bookingMessage','Hospital not found.','error');
    return;
  }

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-book-hospital').classList.add('active');

  document.getElementById('selectedHospitalName').textContent=selectedHospital.hospital_name||'Hospital';
  document.getElementById('selectedHospitalMeta').textContent=
    [selectedHospital.address,selectedHospital.city,selectedHospital.district,selectedHospital.state].filter(Boolean).join(', ');

  const tomorrow=new Date();
  tomorrow.setDate(tomorrow.getDate()+1);
  document.getElementById('hospitalBookingDate').min=new Date().toISOString().slice(0,10);
  document.getElementById('hospitalBookingDate').value=tomorrow.toISOString().slice(0,10);
  document.getElementById('hospitalBookingTime').value='10:00';
  document.getElementById('hospitalBookingDepartment').value='';
  document.getElementById('hospitalBookingReason').value='';
  msg('hospitalBookingMessage','');
}

async function requestHospitalAppointment(e){
  e.preventDefault();
  if(!selectedHospital)return;

  const patient=await ensurePatientProfile();
  if(!patient.ok){
    msg('hospitalBookingMessage',patient.error,'error');
    return;
  }

  const date=val('hospitalBookingDate');
  const time=val('hospitalBookingTime');
  if(!date||!time){
    msg('hospitalBookingMessage','Choose a date and preferred time.','error');
    return;
  }

  const requestedStart=new Date(`${date}T${time}:00+05:30`).toISOString();

  const payload={
    patient_id:currentUser.id,
    hospital_id:selectedHospital.id,
    requested_start:requestedStart,
    department:val('hospitalBookingDepartment')||null,
    reason_for_visit:val('hospitalBookingReason')||null,
    status:'requested'
  };

  const {error}=await supabaseClient.from('hospital_appointments').insert(payload);

  if(error){
    msg('hospitalBookingMessage',error.message,'error');
    return;
  }

  msg('hospitalBookingMessage','Hospital appointment requested successfully.','success');
  toast('Appointment requested','The hospital can now confirm or reject the request.');
}

async function openDoctorBooking(id){
  selectedDoctor=cachedDoctors.find(x=>x.id===id);
  if(!selectedDoctor){
    msg('bookingMessage','Doctor not found.','error');
    return;
  }

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-book-doctor').classList.add('active');
  document.getElementById('selectedDoctorName').textContent=selectedDoctor.full_name||'Doctor';
  document.getElementById('selectedDoctorMeta').textContent=
    [selectedDoctor.specialty,selectedDoctor.qualification,selectedDoctor.hospital_name].filter(Boolean).join(' · ');

  const d=new Date();
  d.setDate(d.getDate()+1);
  document.getElementById('bookingDate').min=new Date().toISOString().slice(0,10);
  document.getElementById('bookingDate').value=d.toISOString().slice(0,10);
  selectedSlot=null;
  document.getElementById('confirmBookingBtn').disabled=true;
  await loadSlotsForDate();
}

async function loadSlotsForDate(){
  if(!selectedDoctor)return;

  selectedSlot=null;
  document.getElementById('confirmBookingBtn').disabled=true;
  document.getElementById('slotList').innerHTML='';
  msg('slotMessage','Loading slots...');

  const dateStr=document.getElementById('bookingDate').value;
  const type=document.getElementById('bookingType').value;
  if(!dateStr){msg('slotMessage','Choose a date.','error');return}

  const dateObj=new Date(dateStr+'T12:00:00+05:30');
  const dow=dateObj.getDay();

  const {data:availability,error:aErr}=await supabaseClient
    .from('doctor_availability')
    .select('*')
    .eq('doctor_id',selectedDoctor.id)
    .eq('day_of_week',dow)
    .eq('is_active',true);

  if(aErr){msg('slotMessage',aErr.message,'error');return}

  const matching=(availability||[]).filter(a=>a.consultation_type==='both'||a.consultation_type===type);
  if(!matching.length){
    msg('slotMessage','No availability for this date and consultation type.');
    return;
  }

  const dayStart=new Date(dateStr+'T00:00:00+05:30').toISOString();
  const dayEnd=new Date(dateStr+'T23:59:59+05:30').toISOString();

  const {data:appointments,error:apErr}=await supabaseClient
    .from('appointments')
    .select('appointment_start,appointment_end,status')
    .eq('doctor_id',selectedDoctor.id)
    .gte('appointment_start',dayStart)
    .lte('appointment_start',dayEnd)
    .in('status',['booked','confirmed']);

  if(apErr){msg('slotMessage',apErr.message,'error');return}

  const now=Date.now();
  let slots=[];

  matching.forEach(a=>{
    const [sh,sm]=a.start_time.split(':').map(Number);
    const [eh,em]=a.end_time.split(':').map(Number);

    let cursor=new Date(`${dateStr}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00+05:30`);
    const end=new Date(`${dateStr}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00+05:30`);

    while(cursor.getTime()+a.slot_minutes*60000<=end.getTime()){
      const slotStart=new Date(cursor);
      const slotEnd=new Date(cursor.getTime()+a.slot_minutes*60000);

      const taken=(appointments||[]).some(x=>{
        const xS=new Date(x.appointment_start),xE=new Date(x.appointment_end);
        return slotStart<xE && slotEnd>xS;
      });

      if(!taken && slotStart.getTime()>now){
        slots.push({
          start:slotStart.toISOString(),
          end:slotEnd.toISOString(),
          label:slotStart.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})
        });
      }

      cursor=new Date(cursor.getTime()+a.slot_minutes*60000);
    }
  });

  const seen=new Set();
  slots=slots.filter(s=>{
    if(seen.has(s.start))return false;
    seen.add(s.start);return true;
  }).sort((a,b)=>new Date(a.start)-new Date(b.start));

  if(!slots.length){
    msg('slotMessage','No free slots remaining for this date.');
    return;
  }

  document.getElementById('slotList').innerHTML=slots.map((s,i)=>`
    <button class="btn secondary slot-btn" id="slot-${i}" onclick='selectSlot(${JSON.stringify(s)},${i})'>${s.label}</button>
  `).join('');
  msg('slotMessage','');
}

function selectSlot(slot,i){
  selectedSlot=slot;
  document.querySelectorAll('.slot-btn').forEach(x=>x.classList.remove('selected-slot'));
  const el=document.getElementById('slot-'+i);
  if(el)el.classList.add('selected-slot');
  document.getElementById('confirmBookingBtn').disabled=false;
  msg('slotMessage','Selected: '+slot.label,'success');
}

async function ensurePatientProfile(){
  const {data,error}=await supabaseClient.from('patient_profiles').select('id').eq('id',currentUser.id).maybeSingle();
  if(error)return {ok:false,error:error.message};
  if(data)return {ok:true};

  const {error:iErr}=await supabaseClient.from('patient_profiles').insert({id:currentUser.id});
  return iErr?{ok:false,error:iErr.message}:{ok:true};
}

async function confirmBooking(){
  if(!selectedDoctor||!selectedSlot)return;

  const patient=await ensurePatientProfile();
  if(!patient.ok){
    msg('slotMessage',patient.error,'error');
    return;
  }

  document.getElementById('confirmBookingBtn').disabled=true;
  msg('slotMessage','Booking appointment...');

  const payload={
    patient_id:currentUser.id,
    doctor_id:selectedDoctor.id,
    appointment_start:selectedSlot.start,
    appointment_end:selectedSlot.end,
    consultation_type:document.getElementById('bookingType').value,
    reason_for_visit:val('reasonForVisit')||null,
    status:'booked'
  };

  const {data:bookedAppointment,error}=await supabaseClient
    .from('appointments')
    .insert(payload)
    .select('id')
    .single();

  if(error){
    msg('slotMessage',error.message,'error');
    document.getElementById('confirmBookingBtn').disabled=false;
    await loadSlotsForDate();
    return;
  }

  if(activeReferralBookingId){
    const referralId=activeReferralBookingId;
    const {error:linkError}=await supabaseClient.rpc(
      'link_referral_appointment',
      {
        target_referral:referralId,
        target_appointment:bookedAppointment.id
      }
    );

    if(linkError){
      activeReferralBookingId=null;
      msg(
        'slotMessage',
        `Appointment was booked, but referral linking failed: ${linkError.message}. Open the referral and tap Sync booked appointment.`,
        'error'
      );
      await loadSlotsForDate();
      return;
    }else{
      toast('Referral appointment booked','The specialist appointment is now linked to your referral pathway.');
      msg('slotMessage','Referral appointment booked and linked successfully.','success');
    }

    activeReferralBookingId=null;
  }else{
    toast('Appointment booked','Your appointment has been added to My Appointments.');
    msg('slotMessage','Appointment booked successfully.','success');
  }

  document.getElementById('reasonForVisit').value='';
  await loadSlotsForDate();
}

async function loadAppointmentsPage(){
  const gate=document.getElementById('appointmentsGate'),content=document.getElementById('appointmentsContent');
  if(!currentUser){
    gate.classList.remove('hidden');content.classList.add('hidden');return;
  }
  gate.classList.add('hidden');content.classList.remove('hidden');
  await loadMyAppointments();
  await loadHospitalAppointments();
}

async function loadMyAppointments(){
  msg('appointmentsMessage','Loading...');
  await loadProfile();
  const role=currentProfile?.role||'patient';

  let q=supabaseClient
    .from('appointments')
    .select('*')
    .order('appointment_start',{ascending:true});

  if(role==='doctor') q=q.eq('doctor_id',currentUser.id);
  else if(role==='patient') q=q.eq('patient_id',currentUser.id);

  const {data,error}=await q;
  if(error){msg('appointmentsMessage',error.message,'error');return}

  const list=document.getElementById('appointmentsList');

  if(!data||!data.length){
    list.innerHTML='<div class="card"><b>No appointments yet.</b></div>';
    msg('appointmentsMessage','');
    return;
  }

  const otherIds=[...new Set(data.map(x=>role==='doctor'?x.patient_id:x.doctor_id))];
  let names={};

  if(otherIds.length){
    const {data:ps}=await supabaseClient
      .from('profiles')
      .select('id,full_name')
      .in('id',otherIds);
    names=Object.fromEntries((ps||[]).map(x=>[x.id,x.full_name]));
  }

  list.innerHTML=data.map(x=>{
    const d=new Date(x.appointment_start);
    const when=d.toLocaleString('en-IN',{
      dateStyle:'medium',
      timeStyle:'short',
      timeZone:'Asia/Kolkata'
    });

    const person=role==='patient'
      ? (names[x.doctor_id]||'Doctor')
      : role==='doctor'
        ? (names[x.patient_id]||'Patient')
        : 'Appointment';

    const canCancel=['booked','confirmed'].includes(x.status) &&
      (role==='patient'||role==='doctor');

    const doctorActions=role==='doctor' && ['booked','confirmed'].includes(x.status)
      ? `<button class="btn secondary" onclick="event.stopPropagation();updateAppointmentStatus('${x.id}','confirmed')">Confirm</button>
         <button class="btn secondary" onclick="event.stopPropagation();updateAppointmentStatus('${x.id}','completed')">Complete</button>
         <button class="btn secondary" onclick="event.stopPropagation();updateAppointmentStatus('${x.id}','no_show')">No-show</button>`
      : '';

    return `<div class="card">
      <div class="row between">
        <div onclick="openAppointmentDetail('${x.id}')" style="cursor:pointer;flex:1">
          <h2 style="margin:0">${escapeAdmin(person)}</h2>
          <p><b>${when}</b></p>
          <p class="muted">${formatConsultationType(x.consultation_type)} · ${escapeAdmin(x.reason_for_visit||'No reason provided')}</p>
          <small>Tap appointment to open details and shared files.</small>
        </div>
        <span class="badge">${escapeAdmin(x.status)}</span>
      </div>
      <div class="row" style="margin-top:12px">
        ${doctorActions}
        ${canCancel?`<button class="btn secondary" onclick="cancelAppointment('${x.id}')">Cancel appointment</button>`:''}
        <button class="btn" onclick="openAppointmentDetail('${x.id}')">Open</button>
      </div>
    </div>`;
  }).join('');

  msg('appointmentsMessage','');
}



async function loadHospitalAppointments(){
  const section=document.getElementById('hospitalAppointmentsSection');
  const box=document.getElementById('hospitalAppointmentsList');
  if(!section||!box||!currentUser)return;

  const role=currentProfile?.role;
  if(!['patient','hospital','admin'].includes(role)){
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  let q=supabaseClient
    .from('hospital_appointments')
    .select('*')
    .order('requested_start',{ascending:true});

  if(role==='patient')q=q.eq('patient_id',currentUser.id);
  if(role==='hospital')q=q.eq('hospital_id',currentUser.id);

  const {data,error}=await q;
  if(error){
    box.innerHTML=`<div class="card"><span class="error">${escapeAdmin(error.message)}</span></div>`;
    return;
  }

  if(!data?.length){
    box.innerHTML='<div class="card"><b>No hospital appointments yet.</b></div>';
    return;
  }

  const otherIds=[...new Set(data.map(x=>role==='patient'?x.hospital_id:x.patient_id))];
  let names={};

  if(role==='patient'&&otherIds.length){
    const {data:h}=await supabaseClient.from('hospital_profiles').select('id,hospital_name').in('id',otherIds);
    names=Object.fromEntries((h||[]).map(x=>[x.id,x.hospital_name]));
  }else if(otherIds.length){
    const {data:p}=await supabaseClient.from('profiles').select('id,full_name').in('id',otherIds);
    names=Object.fromEntries((p||[]).map(x=>[x.id,x.full_name]));
  }

  box.innerHTML=data.map(x=>{
    const when=new Date(x.requested_start).toLocaleString('en-IN',{
      dateStyle:'medium',
      timeStyle:'short',
      timeZone:'Asia/Kolkata'
    });

    const title=role==='patient'
      ? (names[x.hospital_id]||'Hospital')
      : (names[x.patient_id]||'Patient');

    const patientCancel=role==='patient'&&['requested','confirmed'].includes(x.status)
      ? `<button class="btn secondary" onclick="updateHospitalAppointmentStatus('${x.id}','cancelled')">Cancel</button>`
      : '';

    const hospitalActions=role==='hospital'&&x.status==='requested'
      ? `<button class="btn" onclick="updateHospitalAppointmentStatus('${x.id}','confirmed')">Confirm</button>
         <button class="btn secondary" onclick="updateHospitalAppointmentStatus('${x.id}','rejected')">Reject</button>`
      : role==='hospital'&&x.status==='confirmed'
        ? `<button class="btn" onclick="updateHospitalAppointmentStatus('${x.id}','completed')">Complete</button>
           <button class="btn secondary" onclick="updateHospitalAppointmentStatus('${x.id}','cancelled')">Cancel</button>`
        : '';

    return `<div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${escapeAdmin(title)}</h2>
          <p><b>${when}</b></p>
          <p class="muted">${escapeAdmin(x.department||'General appointment')} · ${escapeAdmin(x.reason_for_visit||'No reason provided')}</p>
        </div>
        <span class="badge">${escapeAdmin(x.status)}</span>
      </div>
      <div class="row">${patientCancel}${hospitalActions}</div>
    </div>`;
  }).join('');
}

async function updateHospitalAppointmentStatus(id,status){
  const {error}=await supabaseClient
    .from('hospital_appointments')
    .update({status})
    .eq('id',id);

  if(error){
    msg('appointmentsMessage',error.message,'error');
    return;
  }

  toast('Hospital appointment updated',status);
  await loadHospitalAppointments();
}

async function updateAppointmentStatus(id,status){
  const allowed=['confirmed','completed','cancelled','no_show'];
  if(!allowed.includes(status))return;

  const {error}=await supabaseClient
    .from('appointments')
    .update({status})
    .eq('id',id);

  if(error){
    msg('appointmentsMessage',error.message,'error');
    return;
  }

  if(['no_show','completed'].includes(status)){
    const {error:syncError}=await supabaseClient.rpc(
      'sync_referral_for_appointment',
      {target_appointment:id}
    );

    if(
      syncError &&
      !String(syncError.message||'').includes('No referral is linked')
    ){
      toast('Appointment updated',`Referral sync warning: ${syncError.message}`);
    }
  }

  toast(
    'Appointment updated',
    status==='no_show'
      ? 'No-show recorded. Any linked referral is now marked missed.'
      : status
  );

  await loadMyAppointments();

  if(selectedAppointment?.id===id){
    selectedAppointment.status=status;
    renderAppointmentDetail();
    await loadConsultation();
    await loadAppointmentLinkedReports();
    await loadAppointmentFiles();
  }
}

async function cancelAppointment(id){
  if(!confirm('Cancel this appointment?'))return;

  const {error}=await supabaseClient
    .from('appointments')
    .update({status:'cancelled'})
    .eq('id',id);

  if(error){
    msg('appointmentsMessage',error.message,'error');
    return;
  }

  toast('Appointment cancelled','The slot is available again for future booking.');
  await loadMyAppointments();

  if(selectedAppointment?.id===id){
    selectedAppointment.status='cancelled';
    renderAppointmentDetail();
    await loadConsultation();
    await loadAppointmentLinkedReports();
    await loadAppointmentFiles();
  }
}

async function openAppointmentDetail(id){
  const {data,error}=await supabaseClient
    .from('appointments')
    .select('*')
    .eq('id',id)
    .single();

  if(error){
    msg('appointmentsMessage',error.message,'error');
    return;
  }

  selectedAppointment=data;

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-appointment-detail').classList.add('active');

  renderAppointmentDetail();
  await loadVideoConsultationSession();
  await loadAppointmentLinkedReports();
  await loadAppointmentFiles();
  await loadConsultation();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderAppointmentDetail(){
  if(!selectedAppointment)return;

  const x=selectedAppointment;
  const start=new Date(x.appointment_start);
  const end=new Date(x.appointment_end);

  const when=start.toLocaleString('en-IN',{
    dateStyle:'full',
    timeStyle:'short',
    timeZone:'Asia/Kolkata'
  });

  const endTime=end.toLocaleTimeString('en-IN',{
    hour:'numeric',
    minute:'2-digit',
    hour12:true,
    timeZone:'Asia/Kolkata'
  });

  document.getElementById('appointmentDetailTitle').textContent='Appointment details';
  document.getElementById('appointmentDetailMeta').textContent=
    when+' – '+endTime;

  const role=currentProfile?.role||'patient';
  const canCancel=['booked','confirmed'].includes(x.status) &&
    (role==='patient'||role==='doctor');

  const doctorActions=role==='doctor' && ['booked','confirmed'].includes(x.status)
    ? `<button class="btn secondary" onclick="updateAppointmentStatus('${x.id}','confirmed')">Confirm</button>
       <button class="btn secondary" onclick="updateAppointmentStatus('${x.id}','completed')">Mark completed</button>
       <button class="btn secondary" onclick="updateAppointmentStatus('${x.id}','no_show')">Mark no-show</button>`
    : '';

  const fileWritable=['booked','confirmed'].includes(x.status);
  document.getElementById('fileUploadControls').classList.toggle('hidden',!fileWritable);
  document.getElementById('fileReadOnlyNotice').classList.toggle('hidden',fileWritable);

  const referralCard=document.getElementById('referralCreateCard');
  const canRefer=currentProfile?.role==='doctor' &&
    currentUser?.id===x.doctor_id &&
    ['confirmed','completed'].includes(x.status);

  referralCard.classList.toggle('hidden',!canRefer);
  if(canRefer) loadReferralDoctorOptions();

  const patientOverviewAction=role==='doctor' && currentUser?.id===x.doctor_id
    ? `<button class="btn" onclick="openDoctorPatientOverview('${x.patient_id}','${x.id}')">Patient overview</button>`
    : '';

  const carePlanAction=role==='doctor' &&
    currentUser?.id===x.doctor_id &&
    ['confirmed','completed'].includes(x.status)
      ? `<button class="btn secondary" onclick="openCarePlanForAppointment('${x.patient_id}','${x.id}')">Care plan</button>`
      : '';

  document.getElementById('appointmentDetailCard').innerHTML=`
    <div class="row between">
      <div>
        <p><b>Status:</b> ${escapeAdmin(x.status)}</p>
        <p><b>Consultation:</b> ${formatConsultationType(x.consultation_type)}</p>
        <p><b>Reason:</b> ${escapeAdmin(x.reason_for_visit||'Not provided')}</p>
      </div>
      <span class="badge">${escapeAdmin(x.status)}</span>
    </div>
    <div class="row" style="margin-top:12px">
      ${patientOverviewAction}
      ${carePlanAction}
      ${doctorActions}
      ${canCancel?`<button class="btn secondary" onclick="cancelAppointment('${x.id}')">Cancel appointment</button>`:''}
    </div>`;
}




function doctorOverviewUnavailable(label){
  return `<div class="doctor-overview-empty">No ${escapeAdmin(label)} is currently available to this doctor, or the patient has not shared it.</div>`;
}

function doctorOverviewMiniList(rows, mapper, emptyLabel){
  if(!rows?.length)return doctorOverviewUnavailable(emptyLabel);
  return `<div class="doctor-overview-mini-list">${rows.map(mapper).join('')}</div>`;
}

function doctorOverviewDate(value, dateOnly=false){
  if(!value)return 'Date not recorded';
  const d=dateOnly
    ? new Date(`${String(value).slice(0,10)}T12:00:00`)
    : new Date(value);

  if(Number.isNaN(d.getTime()))return 'Date not recorded';

  return d.toLocaleString('en-IN',{
    dateStyle:'medium',
    ...(dateOnly?{}:{timeStyle:'short'}),
    timeZone:'Asia/Kolkata'
  });
}

function safeRows(result){
  return result?.error ? [] : (result?.data||[]);
}

async function openDoctorPatientOverview(patientId,appointmentId){
  if(
    !currentUser ||
    currentProfile?.role!=='doctor' ||
    !patientId ||
    !appointmentId
  ){
    return;
  }

  doctorOverviewPatientId=patientId;
  doctorOverviewAppointmentId=appointmentId;

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-doctor-patient-overview')?.classList.add('active');

  await loadDoctorPatientOverview(patientId,appointmentId);
  window.scrollTo({top:0,behavior:'smooth'});
}

async function reloadDoctorPatientOverview(){
  if(!doctorOverviewPatientId || !doctorOverviewAppointmentId)return;
  await loadDoctorPatientOverview(
    doctorOverviewPatientId,
    doctorOverviewAppointmentId
  );
}

async function backToOverviewAppointment(){
  if(doctorOverviewAppointmentId){
    await openAppointmentDetail(doctorOverviewAppointmentId);
    return;
  }
  showPage('appointments');
}

async function loadDoctorPatientOverview(patientId,appointmentId){
  const identity=document.getElementById('doctorPatientIdentity');
  const snapshot=document.getElementById('doctorCriticalSnapshot');
  const recent=document.getElementById('doctorRecentCare');
  const title=document.getElementById('doctorPatientOverviewTitle');
  const meta=document.getElementById('doctorPatientOverviewMeta');

  identity.innerHTML='<p class="muted">Loading patient...</p>';
  snapshot.innerHTML='';
  recent.innerHTML='<div class="card"><p class="muted">Loading clinical history...</p></div>';

  // Verify this doctor can read the appointment before showing an overview.
  const {data:appointment,error:appointmentError}=await supabaseClient
    .from('appointments')
    .select('id,patient_id,doctor_id,appointment_start,status,reason_for_visit')
    .eq('id',appointmentId)
    .single();

  if(
    appointmentError ||
    !appointment ||
    appointment.patient_id!==patientId ||
    appointment.doctor_id!==currentUser.id
  ){
    identity.innerHTML='<p class="error">This patient overview is not available for the current account.</p>';
    snapshot.innerHTML='';
    recent.innerHTML='';
    return;
  }

  const [
    profileResult,
    patientProfileResult,
    allergyResult,
    conditionResult,
    medicationResult,
    vitalsResult,
    appointmentsResult,
    consultationsResult,
    reportsResult,
    referralsResult,
    followupsResult
  ]=await Promise.all([
    supabaseClient
      .from('profiles')
      .select('id,full_name,phone')
      .eq('id',patientId)
      .maybeSingle(),

    supabaseClient
      .from('patient_profiles')
      .select('*')
      .eq('id',patientId)
      .maybeSingle(),

    supabaseClient
      .from('patient_allergies')
      .select('*')
      .eq('patient_id',patientId)
      .limit(20),

    supabaseClient
      .from('patient_conditions')
      .select('*')
      .eq('patient_id',patientId)
      .limit(20),

    supabaseClient
      .from('patient_medications')
      .select('*')
      .eq('patient_id',patientId)
      .limit(20),

    supabaseClient
      .from('patient_vitals')
      .select('*')
      .eq('patient_id',patientId)
      .order('measured_at',{ascending:false})
      .limit(3),

    supabaseClient
      .from('appointments')
      .select('id,appointment_start,status,reason_for_visit,consultation_type')
      .eq('patient_id',patientId)
      .eq('doctor_id',currentUser.id)
      .order('appointment_start',{ascending:false})
      .limit(8),

    supabaseClient
      .from('consultations')
      .select('id,appointment_id,diagnosis,assessment,investigations,advice,follow_up_date,created_at')
      .eq('patient_id',patientId)
      .eq('doctor_id',currentUser.id)
      .order('created_at',{ascending:false})
      .limit(6),

    supabaseClient
      .from('medical_reports')
      .select('id,title,report_type,report_date,appointment_id,file_path,file_name,notes,created_at')
      .eq('patient_id',patientId)
      .order('created_at',{ascending:false})
      .limit(6),

    supabaseClient
      .from('referrals')
      .select('id,from_doctor_id,to_doctor_id,specialty_requested,reason,urgency,status,created_at,updated_at')
      .eq('patient_id',patientId)
      .or(`from_doctor_id.eq.${currentUser.id},to_doctor_id.eq.${currentUser.id}`)
      .order('created_at',{ascending:false})
      .limit(6),

    supabaseClient
      .from('followup_reminders')
      .select('id,consultation_id,appointment_id,follow_up_date,status,created_at')
      .eq('patient_id',patientId)
      .order('follow_up_date',{ascending:false})
      .limit(6)
  ]);

  const p=profileResult?.data||{};
  const pp=patientProfileResult?.data||{};
  const patientName=p.full_name||'Patient';

  title.textContent=patientName;
  meta.textContent=`Current appointment: ${doctorOverviewDate(appointment.appointment_start)} · ${appointment.status}`;

  const profileBits=[
    pp.blood_group ? `Blood group: ${pp.blood_group}` : null,
    p.phone ? `Phone: ${p.phone}` : null,
    pp.emergency_contact_name ? `Emergency contact: ${pp.emergency_contact_name}` : null
  ].filter(Boolean);

  identity.innerHTML=`
    <div class="row between">
      <div>
        <small>PATIENT</small>
        <h2>${escapeAdmin(patientName)}</h2>
        <p class="muted">${escapeAdmin(profileBits.join(' · ')||'Basic profile details are limited by current access.')}</p>
      </div>
      <span class="badge">${escapeAdmin(appointment.status)}</span>
    </div>
    <div class="doctor-current-encounter">
      <b>Current reason for visit</b>
      <span>${escapeAdmin(appointment.reason_for_visit||'Not provided')}</span>
    </div>`;

  const allergies=safeRows(allergyResult);
  const conditions=safeRows(conditionResult);
  const medications=safeRows(medicationResult);
  const vitals=safeRows(vitalsResult);

  const activeConditions=conditions.filter(x=>
    !x.status || ['active','ongoing','current'].includes(String(x.status).toLowerCase())
  );

  const currentMeds=medications.filter(x=>
    !x.status || !['stopped','completed','inactive'].includes(String(x.status).toLowerCase())
  );

  const latestVitals=vitals[0];

  snapshot.innerHTML=`
    <div class="card doctor-snapshot-card critical">
      <small>ALLERGIES</small>
      <h2>${allergies.length}</h2>
      ${doctorOverviewMiniList(
        allergies.slice(0,5),
        x=>`<div><b>${escapeAdmin(x.allergen||'Allergy')}</b><span>${escapeAdmin([x.reaction,x.severity].filter(Boolean).join(' · ')||'Reaction not recorded')}</span></div>`,
        'allergy information'
      )}
    </div>

    <div class="card doctor-snapshot-card">
      <small>ACTIVE CONDITIONS</small>
      <h2>${activeConditions.length}</h2>
      ${doctorOverviewMiniList(
        activeConditions.slice(0,5),
        x=>`<div><b>${escapeAdmin(x.condition_name||'Condition')}</b><span>${escapeAdmin(x.status||'Status not recorded')}</span></div>`,
        'condition information'
      )}
    </div>

    <div class="card doctor-snapshot-card">
      <small>CURRENT MEDICINES</small>
      <h2>${currentMeds.length}</h2>
      ${doctorOverviewMiniList(
        currentMeds.slice(0,5),
        x=>`<div><b>${escapeAdmin(x.medicine_name||'Medicine')}</b><span>${escapeAdmin([x.strength,x.dose,x.frequency].filter(Boolean).join(' · ')||'Dose details not recorded')}</span></div>`,
        'medication information'
      )}
    </div>

    <div class="card doctor-snapshot-card">
      <small>LATEST VITALS</small>
      <h2>${latestVitals?doctorOverviewDate(latestVitals.measured_at):'—'}</h2>
      ${latestVitals
        ? `<div class="doctor-vitals-grid">
            <span><b>BP</b>${latestVitals.systolic??'—'}/${latestVitals.diastolic??'—'}</span>
            <span><b>Pulse</b>${latestVitals.pulse??'—'}</span>
            <span><b>SpO₂</b>${latestVitals.spo2??'—'}%</span>
            <span><b>Temp</b>${latestVitals.temperature_c??'—'}°C</span>
           </div>`
        : doctorOverviewUnavailable('vital-sign information')}
    </div>`;

  const consultations=safeRows(consultationsResult);
  const reports=safeRows(reportsResult);
  const referrals=safeRows(referralsResult);
  const followups=safeRows(followupsResult);
  const appointments=safeRows(appointmentsResult);

  const appointmentById=Object.fromEntries(appointments.map(x=>[x.id,x]));

  const consultationHtml=doctorOverviewMiniList(
    consultations,
    c=>{
      const a=appointmentById[c.appointment_id];
      return `<button class="doctor-history-row" onclick="openAppointmentDetail('${c.appointment_id}')">
        <span>
          <b>${escapeAdmin(c.diagnosis||a?.reason_for_visit||'Consultation')}</b>
          <small>${escapeAdmin(doctorOverviewDate(a?.appointment_start||c.created_at))}</small>
        </span>
        <span class="doctor-history-meta">${escapeAdmin(c.follow_up_date?`Follow-up ${doctorOverviewDate(c.follow_up_date,true)}`:'Open')}</span>
      </button>`;
    },
    'consultation history'
  );

  const reportHtml=doctorOverviewMiniList(
    reports,
    r=>`<div class="doctor-history-row static">
      <span>
        <b>${escapeAdmin(r.title||r.file_name||'Medical report')}</b>
        <small>${escapeAdmin(doctorOverviewDate(r.report_date?`${r.report_date}T12:00:00`:r.created_at))}</small>
      </span>
      <span class="doctor-history-meta">${escapeAdmin((r.report_type||'report').replaceAll('_',' '))}</span>
    </div>`,
    'report history'
  );

  const referralHtml=doctorOverviewMiniList(
    referrals,
    r=>`<button class="doctor-history-row" onclick="openReferralDetail('${r.id}')">
      <span>
        <b>${escapeAdmin(r.specialty_requested||r.reason||'Referral')}</b>
        <small>${escapeAdmin(doctorOverviewDate(r.updated_at||r.created_at))}</small>
      </span>
      <span class="doctor-history-meta">${escapeAdmin(referralStatusLabel(r.status))}</span>
    </button>`,
    'referral history'
  );

  const followupHtml=doctorOverviewMiniList(
    followups,
    f=>`<div class="doctor-history-row static">
      <span>
        <b>Follow-up</b>
        <small>${escapeAdmin(doctorOverviewDate(f.follow_up_date,true))}</small>
      </span>
      <span class="doctor-history-meta">${escapeAdmin((f.status||'pending').replaceAll('_',' '))}</span>
    </div>`,
    'follow-up information'
  );

  recent.innerHTML=`
    <div class="doctor-history-grid">
      <div class="card">
        <h3>My recent consultations</h3>
        <p class="muted">Consultations involving this doctor.</p>
        ${consultationHtml}
      </div>

      <div class="card">
        <h3>Accessible reports</h3>
        <p class="muted">Only reports currently visible under MediBridge access rules.</p>
        ${reportHtml}
      </div>

      <div class="card">
        <h3>Referral history</h3>
        <p class="muted">Referrals involving this doctor.</p>
        ${referralHtml}
      </div>

      <div class="card">
        <h3>Follow-ups</h3>
        <p class="muted">Follow-up information currently available to this doctor.</p>
        ${followupHtml}
      </div>
    </div>`;

  await loadDoctorAccessRequestState(patientId);
  msg('doctorPatientOverviewMessage','');
}


async function loadDoctorAccessRequestState(patientId){
  const statusEl=document.getElementById('doctorAccessRequestStatus');
  const cancelBtn=document.getElementById('cancelDoctorAccessRequestBtn');
  if(!statusEl || !patientId || currentProfile?.role!=='doctor')return;
  currentDoctorAccessRequest=null; statusEl.textContent='Not requested'; cancelBtn?.classList.add('hidden');
  const {data,error}=await supabaseClient.from('record_access_requests').select('*').eq('doctor_id',currentUser.id).eq('patient_id',patientId).in('status',['pending','approved']).order('created_at',{ascending:false}).limit(1);
  if(error){statusEl.textContent='Unavailable';return;}
  const row=data?.[0]; if(!row)return;
  currentDoctorAccessRequest=row;
  statusEl.textContent=row.status==='approved'?'Approved':'Pending patient approval';
  if(row.status==='pending'){cancelBtn?.classList.remove('hidden');msg('doctorAccessRequestMessage','Request sent. The patient decides what to share and for how long.');}
  else msg('doctorAccessRequestMessage','The patient approved this request. Refresh the overview to see newly accessible records.','success');
}

async function submitDoctorAccessRequest(){
  if(!doctorOverviewPatientId || currentProfile?.role!=='doctor')return;
  const scopes=[...document.querySelectorAll('.doctor-access-scope:checked')].map(x=>x.value);
  const reason=document.getElementById('doctorAccessRequestReason')?.value?.trim()||'';
  if(!scopes.length){msg('doctorAccessRequestMessage','Choose at least one record type.','error');return;}
  if(reason.length<8){msg('doctorAccessRequestMessage','Add a short clinical reason for the patient.','error');return;}
  const {error}=await supabaseClient.rpc('request_patient_record_access',{target_patient:doctorOverviewPatientId,requested_scopes:scopes,request_reason:reason});
  if(error){msg('doctorAccessRequestMessage',error.message,'error');return;}
  toast('Access request sent','The patient has been notified.');
  await loadDoctorAccessRequestState(doctorOverviewPatientId);
}

async function cancelDoctorAccessRequest(){
  if(!currentDoctorAccessRequest)return;
  const {error}=await supabaseClient.rpc('cancel_patient_record_access_request',{target_request:currentDoctorAccessRequest.id});
  if(error){msg('doctorAccessRequestMessage',error.message,'error');return;}
  toast('Request cancelled','No access was granted.'); currentDoctorAccessRequest=null; await loadDoctorAccessRequestState(doctorOverviewPatientId);
}

async function loadPendingAccessRequests(){
  const box=document.getElementById('pendingAccessRequests');
  if(!box || !currentUser || currentProfile?.role!=='patient')return;
  const {data,error}=await supabaseClient.from('record_access_requests').select('*').eq('patient_id',currentUser.id).eq('status','pending').order('created_at',{ascending:false});
  if(error){box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;return;}
  if(!data?.length){box.innerHTML='<p class="muted">No doctor is currently waiting for additional record access.</p>';return;}
  const ids=[...new Set(data.map(x=>x.doctor_id))];
  const [{data:profiles},{data:doctors}]=await Promise.all([supabaseClient.from('profiles').select('id,full_name').in('id',ids),supabaseClient.from('doctor_profiles').select('id,specialty,hospital_name').in('id',ids)]);
  const names=Object.fromEntries((profiles||[]).map(x=>[x.id,x.full_name||'Doctor'])); const docs=Object.fromEntries((doctors||[]).map(x=>[x.id,x]));
  box.innerHTML=data.map(r=>{const d=docs[r.doctor_id]||{}; const scopes=(r.requested_scopes||[]).map(s=>CONSENT_SCOPE_LABELS[s]||s).join(', '); return `<div class="access-request-item"><div><b>${escapeAdmin(names[r.doctor_id]||'Doctor')}</b><div class="muted">${escapeAdmin([d.specialty,d.hospital_name].filter(Boolean).join(' · ')||'Verified doctor')}</div><p><b>Requested:</b> ${escapeAdmin(scopes)}</p><p><b>Reason:</b> ${escapeAdmin(r.reason||'Not provided')}</p><small>Requested ${escapeAdmin(new Date(r.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}))}</small></div><div class="access-request-actions"><label>Share for<select id="access-duration-${r.id}"><option value="24">24 hours</option><option value="168" selected>7 days</option><option value="720">30 days</option><option value="0">Until I revoke</option></select></label><div class="row"><button class="btn" onclick="respondToAccessRequest('${r.id}',true)">Approve</button><button class="btn secondary" onclick="respondToAccessRequest('${r.id}',false)">Decline</button></div></div></div>`;}).join('');
}

async function respondToAccessRequest(requestId,approve){
  const duration=approve?Number(document.getElementById(`access-duration-${requestId}`)?.value||168):0;
  const {error}=await supabaseClient.rpc('respond_patient_record_access_request',{target_request:requestId,approve_request:approve,consent_hours:duration});
  if(error){msg('consentMessage',error.message,'error');return;}
  toast(approve?'Access approved':'Request declined',approve?'The selected record types are now shared under your chosen duration.':'No additional access was granted.');
  await Promise.all([loadPendingAccessRequests(),loadActiveConsents(),loadRecordAccessHistory()]);
}

function clearVideoSessionTimer(){
  if(videoSessionRefreshTimer){
    clearInterval(videoSessionRefreshTimer);
    videoSessionRefreshTimer=null;
  }
  if(doctorRingTimeout){
    clearTimeout(doctorRingTimeout);
    doctorRingTimeout=null;
  }
}

async function removeRealtimeChannel(channel){
  if(!channel)return;
  try{await supabaseClient.removeChannel(channel)}catch(_){}
}

async function teardownAppointmentVideoRealtime(){
  if(videoRealtimeChannel){
    await removeRealtimeChannel(videoRealtimeChannel);
    videoRealtimeChannel=null;
  }
}

async function teardownIncomingVideoCallWatcher(){
  hideIncomingVideoCall();
  incomingVideoAppointment=null;
  if(incomingVideoRealtimeChannel){
    await removeRealtimeChannel(incomingVideoRealtimeChannel);
    incomingVideoRealtimeChannel=null;
  }
}

async function setupIncomingVideoCallWatcher(){
  await teardownIncomingVideoCallWatcher();

  if(!currentUser || currentProfile?.role!=='patient')return;

  // Catch a ringing call that started while this page/app was not active.
  const {data:existing}=await supabaseClient
    .from('video_consultation_sessions')
    .select('*')
    .eq('patient_id',currentUser.id)
    .eq('status','calling')
    .order('updated_at',{ascending:false})
    .limit(1);

  if(existing?.[0]){
    await showIncomingVideoCall(existing[0]);
  }

  incomingVideoRealtimeChannel=supabaseClient
    .channel(`patient-video-calls-${currentUser.id}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event:'*',
        schema:'public',
        table:'video_consultation_sessions',
        filter:`patient_id=eq.${currentUser.id}`
      },
      async payload=>{
        const session=payload.new||null;
        if(!session)return;

        if(session.status==='calling'){
          await showIncomingVideoCall(session);
        }else if(
          incomingVideoAppointment?.id===session.appointment_id &&
          session.status!=='calling'
        ){
          hideIncomingVideoCall();
        }

        if(
          selectedAppointment?.id===session.appointment_id &&
          selectedAppointment?.consultation_type==='online'
        ){
          handleVideoSessionRealtimeUpdate(session);
        }
      }
    )
    .subscribe();
}

async function showIncomingVideoCall(session){
  if(!session?.appointment_id)return;

  const modal=document.getElementById('incomingVideoCallModal');
  const doctorName=document.getElementById('incomingVideoDoctorName');
  const meta=document.getElementById('incomingVideoCallMeta');

  const {data:appt}=await supabaseClient
    .from('appointments')
    .select('id,doctor_id,appointment_start,reason_for_visit,consultation_type,status')
    .eq('id',session.appointment_id)
    .single();

  if(!appt || appt.consultation_type!=='online')return;

  let name='Your doctor';
  const {data:doctor}=await supabaseClient
    .from('profiles')
    .select('full_name')
    .eq('id',appt.doctor_id)
    .single();

  if(doctor?.full_name)name=`Dr. ${doctor.full_name}`;

  incomingVideoAppointment=appt;
  doctorName.textContent=`${name} is calling`;

  const when=new Date(appt.appointment_start).toLocaleString('en-IN',{
    dateStyle:'medium',
    timeStyle:'short',
    timeZone:'Asia/Kolkata'
  });

  meta.textContent=`Scheduled consultation · ${when}${appt.reason_for_visit?` · ${appt.reason_for_visit}`:''}`;
  modal.classList.remove('hidden');
}

function hideIncomingVideoCall(){
  document.getElementById('incomingVideoCallModal')?.classList.add('hidden');
}

async function respondIncomingVideoCall(action){
  if(!incomingVideoAppointment?.id)return;

  const appointmentId=incomingVideoAppointment.id;

  const {data,error}=await supabaseClient.rpc(
    'respond_video_consultation',
    {
      target_appointment:appointmentId,
      response_action:action
    }
  );

  if(error){
    alert(error.message);
    return;
  }

  hideIncomingVideoCall();

  if(action==='decline'){
    incomingVideoAppointment=null;
    return;
  }

  // Open the appointment screen and the embedded room automatically.
  await openAppointmentDetail(appointmentId);
  activeVideoSession=data;
  await openEmbeddedVideoRoom(data);
  incomingVideoAppointment=null;
}

async function subscribeToAppointmentVideoSession(appointmentId){
  await teardownAppointmentVideoRealtime();

  videoRealtimeChannel=supabaseClient
    .channel(`appointment-video-${appointmentId}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event:'*',
        schema:'public',
        table:'video_consultation_sessions',
        filter:`appointment_id=eq.${appointmentId}`
      },
      payload=>{
        if(payload.new)handleVideoSessionRealtimeUpdate(payload.new);
      }
    )
    .subscribe();
}

async function loadVideoConsultationSession(){
  clearVideoSessionTimer();

  const card=document.getElementById('videoConsultationCard');
  const body=document.getElementById('videoSessionBody');
  const actions=document.getElementById('videoSessionActions');
  const badge=document.getElementById('videoSessionBadge');

  if(!card || !selectedAppointment)return;

  const x=selectedAppointment;

  if(x.consultation_type!=='online'){
    card.classList.add('hidden');
    await teardownAppointmentVideoRealtime();
    return;
  }

  card.classList.remove('hidden');
  await subscribeToAppointmentVideoSession(x.id);

  if(!['booked','confirmed'].includes(x.status)){
    badge.textContent='closed';
    body.innerHTML='<p class="muted">This appointment is no longer active.</p>';
    actions.innerHTML='';
    return;
  }

  const {data,error}=await supabaseClient.rpc(
    'get_video_consultation_session',
    {target_appointment:x.id}
  );

  if(error){
    body.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    actions.innerHTML='';
    return;
  }

  activeVideoSession=data||null;
  renderVideoConsultationSession(activeVideoSession);

  // Polling remains as a fallback if Realtime is briefly unavailable.
  videoSessionRefreshTimer=setInterval(async()=>{
    if(!selectedAppointment?.id || selectedAppointment.id!==x.id){
      clearVideoSessionTimer();
      return;
    }

    const {data:latest}=await supabaseClient.rpc(
      'get_video_consultation_session',
      {target_appointment:x.id}
    );

    if(latest)handleVideoSessionRealtimeUpdate(latest);
  },15000);
}

function videoStatusLabel(status){
  return ({
    idle:'Ready',
    calling:'Calling',
    accepted:'Accepted',
    connecting:'Connecting',
    connected:'Connected',
    declined:'Declined',
    missed:'No answer',
    ended:'Ended'
  })[status]||status||'Ready';
}

function renderVideoConsultationSession(session){
  if(!selectedAppointment)return;

  activeVideoSession=session||null;

  const body=document.getElementById('videoSessionBody');
  const actions=document.getElementById('videoSessionActions');
  const badge=document.getElementById('videoSessionBadge');
  const role=currentProfile?.role;
  const status=session?.status||'idle';

  badge.textContent=videoStatusLabel(status);

  if(!session?.appointment_id || status==='idle'){
    if(role==='doctor'){
      body.innerHTML=`
        <div class="call-state call-state-ready">
          <b>Ready to call patient</b>
          <p class="muted">Start the consultation when you are ready. The patient will receive an incoming-call popup.</p>
        </div>`;
      actions.innerHTML=`
        <button class="btn" onclick="startVideoConsultation()">Start video consultation</button>
        <button class="btn secondary" onclick="scrollToConsultationNotes()">Open consultation notes</button>`;
    }else{
      body.innerHTML=`
        <div class="call-state">
          <b>Waiting for doctor</b>
          <p class="muted">You will receive an incoming call when the doctor starts your consultation.</p>
        </div>`;
      actions.innerHTML='';
    }
    return;
  }

  if(status==='calling'){
    if(role==='doctor'){
      body.innerHTML=`
        <div class="calling-pulse">
          <span class="calling-dot"></span>
          <div><b>Calling patient…</b><p class="muted">Waiting for the patient to accept.</p></div>
        </div>`;
      actions.innerHTML=`
        <button class="btn secondary" onclick="endVideoConsultation()">Cancel call</button>
        <button class="btn secondary" onclick="scrollToConsultationNotes()">Open consultation notes</button>`;
    }else{
      body.innerHTML='<p><b>Incoming consultation is ringing.</b></p>';
      actions.innerHTML='';
    }
    return;
  }

  if(status==='accepted' || status==='connecting'){
    body.innerHTML=`
      <div class="calling-pulse">
        <span class="calling-dot"></span>
        <div>
          <b>${status==='accepted'?'Patient accepted. Connecting…':'Connecting video…'}</b>
          <p class="muted">MediBridge is opening the shared consultation room.</p>
        </div>
      </div>`;
    actions.innerHTML=role==='doctor'
      ? `<button class="btn secondary" onclick="scrollToConsultationNotes()">Open consultation notes</button>
         <button class="btn secondary" onclick="endVideoConsultation()">End call</button>`
      : `<button class="btn secondary" onclick="endPatientVideoView()">Leave call view</button>`;

    // Doctor automatically enters after patient accepts.
    if(role==='doctor' && !isVideoRoomOpenFor(session.appointment_id)){
      openEmbeddedVideoRoom(session);
    }
    return;
  }

  if(status==='connected'){
    body.innerHTML=`
      <div class="video-connected-summary">
        <b>Video consultation connected</b>
        <span class="muted">Doctor and patient are both in the consultation room.</span>
      </div>`;
    actions.innerHTML=role==='doctor'
      ? `<button class="btn secondary" onclick="scrollToConsultationNotes()">Open consultation notes</button>
         <button class="btn secondary" onclick="endVideoConsultation()">End video consultation</button>`
      : `<button class="btn secondary" onclick="leaveVideoCallUI()">Minimize call</button>`;

    if(!isVideoRoomOpenFor(session.appointment_id)){
      openEmbeddedVideoRoom(session);
    }
    return;
  }

  if(status==='declined'){
    body.innerHTML='<div class="call-state"><b>Patient declined the call.</b><p class="muted">You can start another call when appropriate.</p></div>';
    actions.innerHTML=role==='doctor'
      ? `<button class="btn" onclick="startVideoConsultation()">Call again</button>
         <button class="btn secondary" onclick="scrollToConsultationNotes()">Open consultation notes</button>`
      : '';
    closeEmbeddedVideoRoom(false);
    return;
  }

  if(status==='missed'){
    body.innerHTML='<div class="call-state"><b>No answer.</b><p class="muted">The patient did not accept the consultation call.</p></div>';
    actions.innerHTML=role==='doctor'
      ? `<button class="btn" onclick="startVideoConsultation()">Call again</button>
         <button class="btn secondary" onclick="scrollToConsultationNotes()">Open consultation notes</button>`
      : '';
    closeEmbeddedVideoRoom(false);
    return;
  }

  if(status==='ended'){
    body.innerHTML='<div class="call-state"><b>Consultation call ended.</b><p class="muted">The video session is closed.</p></div>';
    actions.innerHTML=role==='doctor'
      ? `<button class="btn" onclick="startVideoConsultation()">Start another call</button>
         <button class="btn secondary" onclick="scrollToConsultationNotes()">Open consultation notes</button>`
      : '';
    closeEmbeddedVideoRoom(false);
  }
}

function handleVideoSessionRealtimeUpdate(session){
  if(!session)return;
  activeVideoSession=session;

  if(
    selectedAppointment?.id===session.appointment_id &&
    selectedAppointment?.consultation_type==='online'
  ){
    renderVideoConsultationSession(session);
  }

  if(currentProfile?.role==='patient'){
    if(session.status==='calling'){
      showIncomingVideoCall(session);
    }else if(incomingVideoAppointment?.id===session.appointment_id){
      hideIncomingVideoCall();
    }
  }
}

async function startVideoConsultation(){
  if(!selectedAppointment)return;

  msg('videoSessionMessage','Calling patient...');

  const {data,error}=await supabaseClient.rpc(
    'start_video_consultation',
    {target_appointment:selectedAppointment.id}
  );

  if(error){
    msg('videoSessionMessage',error.message,'error');
    return;
  }

  activeVideoSession=data;
  renderVideoConsultationSession(data);
  msg('videoSessionMessage','Calling patient. Waiting for acceptance.','success');

  if(doctorRingTimeout)clearTimeout(doctorRingTimeout);

  doctorRingTimeout=setTimeout(async()=>{
    if(
      selectedAppointment?.id===data.appointment_id &&
      activeVideoSession?.status==='calling'
    ){
      const {data:missed}=await supabaseClient.rpc(
        'mark_video_consultation_missed',
        {target_appointment:data.appointment_id}
      );
      if(missed)handleVideoSessionRealtimeUpdate(missed);
    }
  },45000);
}

function roomOpenKey(appointmentId){
  return `medibridge_video_open_${appointmentId}`;
}

function isVideoRoomOpenFor(appointmentId){
  return sessionStorage.getItem(roomOpenKey(appointmentId))==='yes' && !!jitsiApi;
}

async function openEmbeddedVideoRoom(session){
  if(!session?.room_name || !session?.appointment_id)return;
  if(isVideoRoomOpenFor(session.appointment_id))return;

  const container=document.getElementById('jitsiContainer');
  const stage=document.getElementById('videoCallStage');

  if(!container || !stage)return;

  if(typeof JitsiMeetExternalAPI==='undefined'){
    msg('videoSessionMessage','Video provider did not load. Check internet connection and try again.','error');
    return;
  }

  closeEmbeddedVideoRoom(false);

  stage.classList.remove('hidden');
  container.innerHTML='';
  sessionStorage.setItem(roomOpenKey(session.appointment_id),'yes');

  const displayName=currentProfile?.role==='doctor'
    ? `Dr. ${currentProfile?.full_name||'Doctor'}`
    : currentProfile?.full_name||'Patient';

  jitsiApi=new JitsiMeetExternalAPI('meet.jit.si',{
    roomName:session.room_name,
    parentNode:container,
    width:'100%',
    height:'100%',
    userInfo:{displayName},
    configOverwrite:{
      prejoinPageEnabled:false,
      disableDeepLinking:true,
      startWithAudioMuted:false,
      startWithVideoMuted:false
    }
  });

  videoCallStartedAt=Date.now();
  startVideoCallTimer();

  jitsiApi.addListener('videoConferenceJoined',async()=>{
    const {data,error}=await supabaseClient.rpc(
      'mark_video_consultation_joined',
      {target_appointment:session.appointment_id}
    );

    if(!error && data){
      handleVideoSessionRealtimeUpdate(data);
    }
  });

  jitsiApi.addListener('readyToClose',()=>{
    leaveVideoCallUI();
  });

  jitsiApi.addListener('videoConferenceLeft',()=>{
    clearLocalVideoRoomFlag(session.appointment_id);
  });
}

function startVideoCallTimer(){
  if(videoCallTimerInterval)clearInterval(videoCallTimerInterval);

  const el=document.getElementById('videoCallTimer');

  const tick=()=>{
    if(!el || !videoCallStartedAt)return;
    const secs=Math.floor((Date.now()-videoCallStartedAt)/1000);
    const m=String(Math.floor(secs/60)).padStart(2,'0');
    const s=String(secs%60).padStart(2,'0');
    el.textContent=`${m}:${s}`;
  };

  tick();
  videoCallTimerInterval=setInterval(tick,1000);
}

function clearLocalVideoRoomFlag(appointmentId){
  if(appointmentId)sessionStorage.removeItem(roomOpenKey(appointmentId));
}

function closeEmbeddedVideoRoom(clearFlag=true){
  const appointmentId=activeVideoSession?.appointment_id||selectedAppointment?.id;

  if(jitsiApi){
    try{jitsiApi.dispose()}catch(_){}
    jitsiApi=null;
  }

  if(videoCallTimerInterval){
    clearInterval(videoCallTimerInterval);
    videoCallTimerInterval=null;
  }

  videoCallStartedAt=null;

  const container=document.getElementById('jitsiContainer');
  const stage=document.getElementById('videoCallStage');

  if(container)container.innerHTML='';
  if(stage)stage.classList.add('hidden');

  if(clearFlag)clearLocalVideoRoomFlag(appointmentId);
}

function leaveVideoCallUI(){
  closeEmbeddedVideoRoom(true);
}

function endPatientVideoView(){
  leaveVideoCallUI();
}

async function endVideoConsultation(){
  if(!selectedAppointment)return;

  const label=activeVideoSession?.status==='calling'
    ? 'Cancel this consultation call?'
    : 'End this video consultation?';

  if(!confirm(label))return;

  const {data,error}=await supabaseClient.rpc(
    'end_video_consultation',
    {target_appointment:selectedAppointment.id}
  );

  if(error){
    msg('videoSessionMessage',error.message,'error');
    return;
  }

  closeEmbeddedVideoRoom(true);
  handleVideoSessionRealtimeUpdate(data);
  msg('videoSessionMessage','Video consultation ended.','success');
}

function scrollToConsultationNotes(){
  const form=document.getElementById('consultationForm');
  if(form){
    form.scrollIntoView({behavior:'smooth',block:'start'});
  }
}

async function uploadAppointmentFile(){
  if(!selectedAppointment)return;
  if(!['booked','confirmed'].includes(selectedAppointment.status)){
    msg('appointmentFileMessage','This appointment is read-only. New files cannot be uploaded.','error');
    return;
  }

  const input=document.getElementById('appointmentFileInput');
  const file=input.files[0];

  if(!file){
    msg('appointmentFileMessage','Choose a file first.','error');
    return;
  }

  const allowed=[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if(!allowed.includes(file.type)){
    msg('appointmentFileMessage','Use PDF, JPG, PNG, DOC or DOCX.','error');
    return;
  }

  if(file.size>10*1024*1024){
    msg('appointmentFileMessage','Maximum file size is 10 MB.','error');
    return;
  }

  const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`${selectedAppointment.id}/${currentUser.id}/${Date.now()}_${clean}`;

  msg('appointmentFileMessage','Uploading file...');

  const {error:uploadError}=await supabaseClient.storage
    .from('Appointment files')
    .upload(path,file,{upsert:false});

  if(uploadError){
    msg('appointmentFileMessage',uploadError.message,'error');
    return;
  }

  const {error:metaError}=await supabaseClient
    .from('appointment_files')
    .insert({
      appointment_id:selectedAppointment.id,
      uploader_id:currentUser.id,
      file_name:file.name,
      file_path:path,
      mime_type:file.type||null,
      file_size:file.size
    });

  if(metaError){
    await supabaseClient.storage.from('Appointment files').remove([path]);
    msg('appointmentFileMessage',metaError.message,'error');
    return;
  }

  input.value='';
  msg('appointmentFileMessage','File uploaded privately.','success');
  await loadAppointmentFiles();
}

async function loadAppointmentFiles(){
  if(!selectedAppointment)return;

  const {data,error}=await supabaseClient
    .from('appointment_files')
    .select('*')
    .eq('appointment_id',selectedAppointment.id)
    .order('created_at',{ascending:false});

  const box=document.getElementById('appointmentFilesList');

  if(error){
    msg('appointmentFileMessage',error.message,'error');
    return;
  }

  if(!data||!data.length){
    box.innerHTML='<p class="muted">No files attached yet.</p>';
    return;
  }

  box.innerHTML=data.map(f=>{
    const mine=f.uploader_id===currentUser.id;
    const size=f.file_size?formatFileSize(f.file_size):'';
    return `<div class="card" style="margin-top:10px">
      <div class="row between">
        <div>
          <b>${escapeAdmin(f.file_name)}</b>
          <p class="muted" style="margin:3px 0">${size}</p>
        </div>
        <div class="row">
          <button class="btn secondary" onclick="openAppointmentFile('${f.file_path.replace(/'/g,"\\'")}')">Open</button>
          ${mine?`<button class="btn secondary" onclick="deleteAppointmentFile('${f.id}','${f.file_path.replace(/'/g,"\\'")}')">Delete</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openAppointmentFile(path){
  const {data,error}=await supabaseClient.storage
    .from('Appointment files')
    .createSignedUrl(path,60);

  if(error){
    msg('appointmentFileMessage',error.message,'error');
    return;
  }

  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}

async function deleteAppointmentFile(id,path){
  if(!confirm('Delete this file?'))return;

  const {error:sErr}=await supabaseClient.storage
    .from('Appointment files')
    .remove([path]);

  if(sErr){
    msg('appointmentFileMessage',sErr.message,'error');
    return;
  }

  const {error:mErr}=await supabaseClient
    .from('appointment_files')
    .delete()
    .eq('id',id);

  if(mErr){
    msg('appointmentFileMessage',mErr.message,'error');
    return;
  }

  msg('appointmentFileMessage','File deleted.','success');
  await loadAppointmentFiles();
}


function resetConsultationForm(){
  ['clinicalNotes','assessment','diagnosis','investigations','advice','followUpDate'].forEach(id=>{
    const e=document.getElementById(id);
    if(e)e.value='';
  });
  document.getElementById('medicineRows').innerHTML='';
}

function setConsultationEditable(editable,notice=''){
  const form=document.getElementById('consultationForm');
  form.querySelectorAll('input,textarea,button').forEach(el=>{
    if(el.type!=='button' || el.id==='addMedicineBtn') el.disabled=!editable;
  });
  document.getElementById('addMedicineBtn').disabled=!editable;
  document.getElementById('consultationActions').classList.toggle('hidden',!editable);
  const n=document.getElementById('consultationReadOnlyNotice');
  n.textContent=notice;
  n.classList.toggle('hidden',!notice);
}

function addMedicineRow(item={}){
  const role=currentProfile?.role;
  const editable=role==='doctor' && ['booked','confirmed'].includes(selectedAppointment?.status);
  const row=document.createElement('div');
  row.className='medicine-row';
  row.innerHTML=`
    <label>Medicine<input class="med-name" value="${escapeAdmin(item.medicine_name||'')}" ${editable?'':'disabled'}></label>
    <label>Strength<input class="med-strength" value="${escapeAdmin(item.strength||'')}" ${editable?'':'disabled'}></label>
    <label>Dose<input class="med-dose" value="${escapeAdmin(item.dose||'')}" ${editable?'':'disabled'}></label>
    <label>Frequency<input class="med-frequency" value="${escapeAdmin(item.frequency||'')}" ${editable?'':'disabled'}></label>
    <label>Duration<input class="med-duration" value="${escapeAdmin(item.duration||'')}" ${editable?'':'disabled'}></label>
    <label>Instructions<input class="med-instructions" value="${escapeAdmin(item.instructions||'')}" ${editable?'':'disabled'}></label>
    <button type="button" class="btn secondary remove-med" onclick="this.parentElement.remove()" ${editable?'':'disabled'}>Remove</button>`;
  document.getElementById('medicineRows').appendChild(row);
}

async function loadConsultation(){
  if(!selectedAppointment)return;
  resetConsultationForm();
  selectedConsultation=null;

  const {data,error}=await supabaseClient
    .from('consultations')
    .select('*')
    .eq('appointment_id',selectedAppointment.id)
    .maybeSingle();

  if(error){
    msg('consultationMessage',error.message,'error');
    return;
  }

  const role=currentProfile?.role||'patient';
  const editable=role==='doctor' && ['booked','confirmed'].includes(selectedAppointment.status);

  if(data){
    selectedConsultation=data;
    document.getElementById('clinicalNotes').value=data.clinical_notes||'';
    document.getElementById('assessment').value=data.assessment||'';
    document.getElementById('diagnosis').value=data.diagnosis||'';
    document.getElementById('investigations').value=data.investigations||'';
    document.getElementById('advice').value=data.advice||'';
    document.getElementById('followUpDate').value=data.follow_up_date||'';

    const {data:items,error:iErr}=await supabaseClient
      .from('prescription_items')
      .select('*')
      .eq('consultation_id',data.id)
      .order('created_at',{ascending:true});

    if(iErr){
      msg('consultationMessage',iErr.message,'error');
      return;
    }

    (items||[]).forEach(addMedicineRow);
    document.getElementById('consultationStatusBadge').textContent='Saved';
  }else{
    document.getElementById('consultationStatusBadge').textContent='Not started';
    if(editable)addMedicineRow();
  }

  if(editable){
    setConsultationEditable(true,'');
  }else{
    let notice='';
    if(role==='patient') notice='Consultation information is view-only for patients.';
    else if(selectedAppointment.status==='completed') notice='This completed consultation is read-only.';
    else if(selectedAppointment.status==='cancelled') notice='The appointment was cancelled. Consultation editing is disabled.';
    else if(selectedAppointment.status==='no_show') notice='The appointment was marked no-show. Consultation editing is disabled.';
    else notice='Consultation editing is unavailable.';
    setConsultationEditable(false,notice);
  }

  msg('consultationMessage','');
}

function collectMedicineRows(){
  return [...document.querySelectorAll('.medicine-row')].map(row=>({
    medicine_name:row.querySelector('.med-name')?.value.trim()||'',
    strength:row.querySelector('.med-strength')?.value.trim()||null,
    dose:row.querySelector('.med-dose')?.value.trim()||null,
    frequency:row.querySelector('.med-frequency')?.value.trim()||null,
    duration:row.querySelector('.med-duration')?.value.trim()||null,
    instructions:row.querySelector('.med-instructions')?.value.trim()||null
  })).filter(x=>x.medicine_name);
}

async function saveConsultation(e){
  if(e)e.preventDefault();

  if(!selectedAppointment ||
     currentProfile?.role!=='doctor' ||
     !['booked','confirmed'].includes(selectedAppointment.status)){
    msg('consultationMessage','Consultation is read-only.','error');
    return false;
  }

  const payload={
    appointment_id:selectedAppointment.id,
    doctor_id:currentUser.id,
    patient_id:selectedAppointment.patient_id,
    clinical_notes:val('clinicalNotes')||null,
    assessment:val('assessment')||null,
    diagnosis:val('diagnosis')||null,
    investigations:val('investigations')||null,
    advice:val('advice')||null,
    follow_up_date:val('followUpDate')||null
  };

  msg('consultationMessage','Saving consultation...');

  let consultationId=selectedConsultation?.id;

  if(consultationId){
    const {data,error}=await supabaseClient
      .from('consultations')
      .update(payload)
      .eq('id',consultationId)
      .select()
      .single();

    if(error){msg('consultationMessage',error.message,'error');return false}
    selectedConsultation=data;
  }else{
    const {data,error}=await supabaseClient
      .from('consultations')
      .insert(payload)
      .select()
      .single();

    if(error){msg('consultationMessage',error.message,'error');return false}
    selectedConsultation=data;
    consultationId=data.id;
  }

  const {error:delErr}=await supabaseClient
    .from('prescription_items')
    .delete()
    .eq('consultation_id',consultationId);

  if(delErr){msg('consultationMessage',delErr.message,'error');return false}

  const meds=collectMedicineRows().map(x=>({...x,consultation_id:consultationId}));

  if(meds.length){
    const {error:medErr}=await supabaseClient
      .from('prescription_items')
      .insert(meds);

    if(medErr){msg('consultationMessage',medErr.message,'error');return false}
  }

  document.getElementById('consultationStatusBadge').textContent='Saved';
  msg('consultationMessage','Consultation and prescription saved.','success');
  return true;
}

async function saveAndCompleteConsultation(){
  const ok=await saveConsultation();
  if(!ok)return;

  const {error}=await supabaseClient
    .from('appointments')
    .update({status:'completed'})
    .eq('id',selectedAppointment.id);

  if(error){
    msg('consultationMessage',error.message,'error');
    return;
  }

  selectedAppointment.status='completed';
  toast('Consultation completed','The appointment is now read-only.');
  renderAppointmentDetail();
  await loadConsultation();
  await loadAppointmentFiles();
}


function collectDoctorDraftForAiReview(){
  return {
    appointment_id:selectedAppointment?.id||null,
    reason_for_visit:selectedAppointment?.reason_for_visit||null,
    clinical_notes:val('clinicalNotes')||null,
    assessment:val('assessment')||null,
    diagnosis:val('diagnosis')||null,
    investigations:val('investigations')||null,
    advice:val('advice')||null,
    follow_up_date:val('followUpDate')||null,
    prescription:collectMedicineRows()
  };
}

function clearDoctorPrecompletionReview(){
  const box=document.getElementById('doctorReviewAnswer');
  if(box){
    box.innerHTML='<p class="muted">Save is not required first. MediBridge reviews the fields currently typed into this form.</p>';
  }

  const btn=document.getElementById('runDoctorReviewBtn');
  if(btn){
    btn.disabled=false;
    btn.textContent='Review current draft';
  }

  doctorPrecompletionReviewInFlight=false;
  msg('doctorReviewMessage','');
}

async function runDoctorPrecompletionReview(){
  if(doctorPrecompletionReviewInFlight)return;

  if(
    !selectedAppointment ||
    currentProfile?.role!=='doctor' ||
    !['booked','confirmed'].includes(selectedAppointment.status)
  ){
    msg('doctorReviewMessage','Pre-completion review is available only for an active doctor consultation.','error');
    return;
  }

  const draft=collectDoctorDraftForAiReview();

  if(
    !draft.clinical_notes &&
    !draft.assessment &&
    !draft.diagnosis &&
    !draft.investigations &&
    !draft.advice &&
    !draft.prescription.length
  ){
    msg('doctorReviewMessage','Enter some consultation information before asking AI to review it.','error');
    return;
  }

  const btn=document.getElementById('runDoctorReviewBtn');
  doctorPrecompletionReviewInFlight=true;
  btn.disabled=true;
  btn.textContent='Reviewing draft...';

  msg(
    'doctorReviewMessage',
    'Checking documentation completeness and available patient safety context...'
  );

  try{
    const {data,error}=await supabaseClient.functions.invoke('medibridge-ai',{
      body:{
        mode:'doctor_precompletion_review',
        prompt:'Review this consultation draft before I complete the appointment.',
        appointment_id:selectedAppointment.id,
        draft_context:draft
      }
    });

    if(error)throw error;
    if(data?.error)throw new Error(data.error);

    document.getElementById('doctorReviewAnswer').innerHTML=
      renderAiMarkdown(data.answer||'No review generated.');

    msg(
      'doctorReviewMessage',
      'AI review generated. Nothing has been changed in the consultation record.',
      'success'
    );

    btn.textContent='Review again';
  }catch(err){
    msg(
      'doctorReviewMessage',
      err?.message||'Could not review the consultation draft.',
      'error'
    );
    btn.textContent='Try review again';
  }finally{
    doctorPrecompletionReviewInFlight=false;
    btn.disabled=false;
  }
}



async function loadAppointmentLinkedReports(){
  const box=document.getElementById('appointmentLinkedReports');
  const card=document.getElementById('appointmentLinkedReportsCard');

  if(!box || !card)return;

  if(!currentUser || !selectedAppointment?.id){
    box.innerHTML='<p class="muted">No appointment selected.</p>';
    return;
  }

  const role=currentProfile?.role;

  if(!['patient','doctor','admin'].includes(role)){
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  const {data,error}=await supabaseClient
    .from('medical_reports')
    .select('*')
    .eq('appointment_id',selectedAppointment.id)
    .order('report_date',{ascending:false,nullsFirst:false})
    .order('created_at',{ascending:false});

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  const rows=data||[];

  if(!rows.length){
    box.innerHTML=role==='patient'
      ? '<p class="muted">No reports linked to this appointment yet. Link one from the Reports page.</p>'
      : '<p class="muted">The patient has not linked any reports to this appointment.</p>';
    return;
  }

  box.innerHTML=rows.map(r=>{
    const when=r.report_date
      ? new Date(`${r.report_date}T00:00:00`).toLocaleDateString('en-IN',{dateStyle:'medium'})
      : 'Date not recorded';

    return `
      <div class="appointment-report-row">
        <div class="appointment-report-main">
          <div class="report-title-row">
            <span class="report-type-badge">${escapeAdmin((r.report_type||'other').replace('_',' '))}</span>
            <b>${escapeAdmin(r.title||'Medical report')}</b>
          </div>
          <p class="muted">${escapeAdmin(when)}${r.file_name?` · ${escapeAdmin(r.file_name)}`:''}</p>
          ${r.notes?`<p>${escapeAdmin(r.notes)}</p>`:''}
        </div>

        <div class="appointment-report-actions">
          <button class="btn secondary" onclick="openMedicalReport('${r.id}','${encodeURIComponent(r.file_path)}')">Open report</button>
          ${role==='patient' && r.uploaded_by===currentUser.id
            ? `<button class="btn secondary" onclick="unlinkMedicalReportFromAppointment('${r.id}')">Unlink</button>`
            : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function unlinkMedicalReportFromAppointment(reportId){
  if(currentProfile?.role!=='patient')return;

  const {error}=await supabaseClient
    .from('medical_reports')
    .update({appointment_id:null})
    .eq('id',reportId)
    .eq('patient_id',currentUser.id);

  if(error){
    alert(error.message);
    return;
  }

  await loadAppointmentLinkedReports();
}


async function loadPatientFollowups(){
  const summary=document.getElementById('patientFollowupSummary');
  const list=document.getElementById('patientFollowupList');

  if(!currentUser || currentProfile?.role!=='patient'){
    if(summary)summary.innerHTML='<p class="muted">Patient account required.</p>';
    if(list)list.innerHTML='<p class="muted">Patient account required.</p>';
    return;
  }

  const {data,error}=await supabaseClient
    .from('followup_reminders')
    .select('id,consultation_id,appointment_id,follow_up_date,status,created_at')
    .eq('patient_id',currentUser.id)
    .neq('status','dismissed')
    .order('follow_up_date',{ascending:true});

  if(error){
    const t=`<p class="error">${escapeAdmin(error.message)}</p>`;
    if(summary)summary.innerHTML=t;
    if(list)list.innerHTML=t;
    return;
  }

  const rows=data||[];
  const appointmentIds=[...new Set(rows.map(r=>r.appointment_id).filter(Boolean))];
  const appointments={};

  if(appointmentIds.length){
    const {data:apptRows}=await supabaseClient
      .from('appointments')
      .select('id,doctor_id,appointment_start,reason_for_visit,status')
      .in('id',appointmentIds);

    (apptRows||[]).forEach(a=>appointments[a.id]=a);
  }

  const doctorIds=[...new Set(Object.values(appointments).map(a=>a.doctor_id).filter(Boolean))];
  const doctors={};

  if(doctorIds.length){
    const {data:profiles}=await supabaseClient
      .from('profiles')
      .select('id,full_name')
      .in('id',doctorIds);

    (profiles||[]).forEach(p=>doctors[p.id]=p.full_name||'Doctor');
  }

  const today=new Date();
  today.setHours(0,0,0,0);

  const enriched=rows.map(r=>{
    const d=new Date(`${r.follow_up_date}T00:00:00`);
    const diffDays=Math.round((d-today)/86400000);
    const appt=appointments[r.appointment_id]||null;

    return {
      ...r,
      diffDays,
      appointment:appt,
      doctorName:appt?doctors[appt.doctor_id]||'Doctor':'Doctor'
    };
  });

  const pending=enriched.filter(r=>r.status==='pending');
  const upcoming=pending.filter(r=>r.diffDays>=0);
  const overdue=pending.filter(r=>r.diffDays<0);

  if(summary){
    if(!pending.length){
      summary.innerHTML='<b>No pending follow-ups.</b><p class="muted">Any follow-up date recorded by your doctor will appear here.</p>';
    }else{
      const next=upcoming[0]||overdue[0];
      summary.innerHTML=`
        <div class="followup-summary-grid">
          <div class="followup-stat">
            <span class="followup-stat-number">${upcoming.length}</span>
            <span class="muted">Upcoming</span>
          </div>
          <div class="followup-stat ${overdue.length?'followup-overdue-stat':''}">
            <span class="followup-stat-number">${overdue.length}</span>
            <span class="muted">Overdue</span>
          </div>
          <div class="followup-next">
            <b>${next.diffDays<0?'Overdue follow-up':'Next follow-up'}</b>
            <span>${formatFollowupDate(next.follow_up_date)}</span>
            <small class="muted">${escapeAdmin(next.doctorName)}</small>
          </div>
        </div>`;
    }
  }

  if(!list)return;

  if(!rows.length){
    list.innerHTML='<p class="muted">No follow-up dates have been recorded yet.</p>';
    return;
  }

  list.innerHTML=enriched.map(r=>{
    const overdueNow=r.status==='pending' && r.diffDays<0;
    const upcomingNow=r.status==='pending' && r.diffDays>=0;

    const timing=r.status!=='pending'
      ? r.status
      : r.diffDays<0
      ? `${Math.abs(r.diffDays)} day${Math.abs(r.diffDays)===1?'':'s'} overdue`
      : r.diffDays===0
      ? 'Due today'
      : r.diffDays===1
      ? 'Tomorrow'
      : `In ${r.diffDays} days`;

    const reason=r.appointment?.reason_for_visit||'Consultation follow-up';

    return `
      <div class="followup-card ${overdueNow?'overdue':upcomingNow?'upcoming':'completed'}">
        <div class="followup-title-row">
          <span class="followup-status-badge">${escapeAdmin(timing)}</span>
          <h3>${formatFollowupDate(r.follow_up_date)}</h3>
        </div>
        <p><b>${escapeAdmin(r.doctorName)}</b></p>
        <p class="muted">${escapeAdmin(reason)}</p>

        <div class="followup-actions">
          <button class="btn secondary" onclick="openFollowupConsultation('${r.appointment_id}')">View consultation</button>
          ${r.status==='pending'
            ? `<button class="btn" onclick="rebookFromFollowup('${r.id}')">Book follow-up</button>
               <button class="btn secondary" onclick="dismissFollowup('${r.id}')">Dismiss</button>`
            : ''}
        </div>
      </div>`;
  }).join('');
}

function formatFollowupDate(dateString){
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-IN',{
    weekday:'short',
    day:'numeric',
    month:'short',
    year:'numeric'
  });
}

async function openFollowupConsultation(appointmentId){
  await openAppointmentDetail(appointmentId);
}

async function rebookFromFollowup(reminderId){
  const {error}=await supabaseClient
    .from('followup_reminders')
    .update({status:'booked',updated_at:new Date().toISOString()})
    .eq('id',reminderId)
    .eq('patient_id',currentUser.id);

  if(error){
    alert(error.message);
    return;
  }

  showPage('book');
  toast('Follow-up ready to book','Choose an available doctor slot.');
}

async function dismissFollowup(reminderId){
  if(!confirm('Dismiss this follow-up reminder?'))return;

  const {error}=await supabaseClient
    .from('followup_reminders')
    .update({status:'dismissed',updated_at:new Date().toISOString()})
    .eq('id',reminderId)
    .eq('patient_id',currentUser.id);

  if(error){
    alert(error.message);
    return;
  }

  await loadPatientFollowups();
}

async function loadReportsHub(){
  await loadProfile();

  const uploadCard=document.getElementById('reportsPatientUploadCard');
  const title=document.getElementById('reportsListTitle');
  const subtitle=document.getElementById('reportsListSubtitle');
  const list=document.getElementById('reportsList');

  if(!currentUser || !currentProfile){
    list.innerHTML='<p class="muted">Sign in to view reports.</p>';
    return;
  }

  if(currentProfile.role==='patient'){
    uploadCard.classList.remove('hidden');
    title.textContent='My reports';
    subtitle.textContent='Your uploaded reports and investigations.';

    const {data:appointments,error:aErr}=await supabaseClient
      .from('appointments')
      .select('id,appointment_start,status,reason_for_visit')
      .eq('patient_id',currentUser.id)
      .order('appointment_start',{ascending:false})
      .limit(30);

    const select=document.getElementById('reportAppointment');
    if(select){
      select.innerHTML='<option value="">Not linked to an appointment</option>';
      if(!aErr){
        (appointments||[]).forEach(a=>{
          const opt=document.createElement('option');
          opt.value=a.id;
          const when=new Date(a.appointment_start).toLocaleString('en-IN',{
            dateStyle:'medium',
            timeStyle:'short',
            timeZone:'Asia/Kolkata'
          });
          opt.textContent=`${when} · ${a.status}${a.reason_for_visit?` · ${a.reason_for_visit}`:''}`;
          select.appendChild(opt);
        });
      }
    }
  }else{
    uploadCard.classList.add('hidden');

    if(currentProfile.role==='doctor'){
      title.textContent='Patient reports available to you';
      subtitle.textContent='Reports linked to your appointments or shared through active patient consent.';
    }else if(currentProfile.role==='admin'){
      title.textContent='Medical reports';
      subtitle.textContent='Reports accessible to the admin account.';
    }else{
      title.textContent='Reports';
      subtitle.textContent='Reports available to this account.';
    }
  }

  const {data,error}=await supabaseClient
    .from('medical_reports')
    .select('*')
    .order('report_date',{ascending:false,nullsFirst:false})
    .order('created_at',{ascending:false})
    .limit(100);

  if(error){
    list.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  const rows=data||[];

  if(!rows.length){
    list.innerHTML='<p class="muted">No reports available yet.</p>';
    return;
  }

  const patientIds=[...new Set(rows.map(r=>r.patient_id).filter(Boolean))];
  let patientNames={};

  if(patientIds.length){
    const {data:profiles}=await supabaseClient
      .from('profiles')
      .select('id,full_name')
      .in('id',patientIds);

    (profiles||[]).forEach(p=>{
      patientNames[p.id]=p.full_name||'Patient';
    });
  }

  list.innerHTML=rows.map(r=>{
    const when=r.report_date
      ? new Date(`${r.report_date}T00:00:00`).toLocaleDateString('en-IN',{dateStyle:'medium'})
      : 'Date not recorded';

    return `
      <div class="report-card">
        <div class="row between">
          <div>
            <div class="report-title-row">
              <span class="report-type-badge">${escapeAdmin((r.report_type||'other').replace('_',' '))}</span>
              <h3>${escapeAdmin(r.title||'Medical report')}</h3>
            </div>
            ${currentProfile.role!=='patient'?`<p class="muted">Patient: ${escapeAdmin(patientNames[r.patient_id]||'Patient')}</p>`:''}
            <p class="muted">${escapeAdmin(when)}${r.file_name?` · ${escapeAdmin(r.file_name)}`:''}</p>
          </div>
        </div>

        ${r.notes?`<p>${escapeAdmin(r.notes)}</p>`:''}

        <div class="report-actions">
          <button class="btn secondary" onclick="openMedicalReport('${r.id}','${encodeURIComponent(r.file_path)}')">Open report</button>
          ${currentProfile.role==='patient'
            ? `<button class="btn secondary" onclick="changeReportAppointmentLink('${r.id}')">${r.appointment_id?'Change linked appointment':'Link to appointment'}</button>`
            : ''}
          ${r.uploaded_by===currentUser.id?`<button class="btn secondary" onclick="deleteMedicalReport('${r.id}','${encodeURIComponent(r.file_path)}')">Delete</button>`:''}
        </div>
      </div>
    `;
  }).join('');
}


async function changeReportAppointmentLink(reportId){
  if(currentProfile?.role!=='patient')return;

  selectedReportForAppointmentLink=reportId;

  const modal=document.getElementById('reportAppointmentModal');
  const list=document.getElementById('reportAppointmentModalList');

  modal.classList.remove('hidden');
  list.innerHTML='<p class="muted">Loading appointments...</p>';

  const {data:appointments,error}=await supabaseClient
    .from('appointments')
    .select('id,appointment_start,status,reason_for_visit,consultation_type')
    .eq('patient_id',currentUser.id)
    .order('appointment_start',{ascending:false})
    .limit(30);

  if(error){
    list.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  const rows=appointments||[];

  if(!rows.length){
    list.innerHTML='<p class="muted">You do not have any appointments yet.</p>';
    return;
  }

  list.innerHTML=rows.map((a,index)=>{
    const when=new Date(a.appointment_start).toLocaleString('en-IN',{
      dateStyle:'medium',
      timeStyle:'short',
      timeZone:'Asia/Kolkata'
    });

    return `
      <button class="report-appointment-choice" onclick="confirmReportAppointmentLink('${a.id}')">
        <span class="report-appointment-number">${index+1}</span>
        <span class="report-appointment-copy">
          <b>${escapeAdmin(when)}</b>
          <span>${escapeAdmin(a.status)} · ${formatConsultationType(a.consultation_type)}</span>
          ${a.reason_for_visit?`<span>Reason: ${escapeAdmin(a.reason_for_visit)}</span>`:''}
        </span>
      </button>
    `;
  }).join('');
}

function closeReportAppointmentModal(){
  document.getElementById('reportAppointmentModal')?.classList.add('hidden');
  selectedReportForAppointmentLink=null;
}

async function confirmReportAppointmentLink(appointmentId){
  if(!selectedReportForAppointmentLink)return;

  const reportId=selectedReportForAppointmentLink;

  const {error}=await supabaseClient
    .from('medical_reports')
    .update({appointment_id:appointmentId})
    .eq('id',reportId)
    .eq('patient_id',currentUser.id);

  if(error){
    alert(error.message);
    return;
  }

  closeReportAppointmentModal();
  await loadReportsHub();

  if(selectedAppointment?.id){
    await loadAppointmentLinkedReports();
  }
}

async function uploadPatientReport(){
  if(!currentUser || currentProfile?.role!=='patient'){
    msg('reportUploadMessage','Only patient accounts can upload reports here.','error');
    return;
  }

  const title=val('reportTitle').trim();
  const reportType=val('reportType');
  const reportDate=val('reportDate')||null;
  const appointmentId=val('reportAppointment')||null;
  const notes=val('reportNotes').trim()||null;
  const input=document.getElementById('reportFile');
  const file=input?.files?.[0];

  if(!title){
    msg('reportUploadMessage','Enter a report title.','error');
    return;
  }

  if(!file){
    msg('reportUploadMessage','Choose a report file.','error');
    return;
  }

  if(file.size>15*1024*1024){
    msg('reportUploadMessage','Report file must be 15 MB or smaller.','error');
    return;
  }

  const allowedTypes=[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if(file.type && !allowedTypes.includes(file.type)){
    msg('reportUploadMessage','Use PDF, JPG, PNG, WEBP, DOC or DOCX.','error');
    return;
  }

  const btn=document.getElementById('uploadReportBtn');
  btn.disabled=true;
  btn.textContent='Uploading...';

  try{
    const cleanName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${currentUser.id}/${Date.now()}_${cleanName}`;

    const {error:uploadError}=await supabaseClient.storage
      .from('Medical reports')
      .upload(path,file,{
        cacheControl:'3600',
        upsert:false,
        contentType:file.type||undefined
      });

    if(uploadError)throw uploadError;

    const {error:insertError}=await supabaseClient
      .from('medical_reports')
      .insert({
        patient_id:currentUser.id,
        appointment_id:appointmentId,
        uploaded_by:currentUser.id,
        title,
        report_type:reportType,
        report_date:reportDate,
        notes,
        file_name:file.name,
        file_path:path,
        mime_type:file.type||null,
        file_size:file.size
      });

    if(insertError){
      await supabaseClient.storage.from('Medical reports').remove([path]);
      throw insertError;
    }

    document.getElementById('reportTitle').value='';
    document.getElementById('reportNotes').value='';
    document.getElementById('reportDate').value='';
    document.getElementById('reportAppointment').value='';
    input.value='';

    msg('reportUploadMessage','Report uploaded successfully.','success');
    await loadReportsHub();
  }catch(err){
    msg('reportUploadMessage',err?.message||'Could not upload report.','error');
  }finally{
    btn.disabled=false;
    btn.textContent='Upload report';
  }
}

async function openMedicalReport(reportId,encodedPath){
  const path=decodeURIComponent(encodedPath);

  const {data,error}=await supabaseClient.storage
    .from('Medical reports')
    .createSignedUrl(path,120);

  if(error){
    alert(error.message);
    return;
  }

  if(data?.signedUrl){
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }
}

async function deleteMedicalReport(reportId,encodedPath){
  if(!confirm('Delete this report?'))return;

  const path=decodeURIComponent(encodedPath);

  const {error:rowError}=await supabaseClient
    .from('medical_reports')
    .delete()
    .eq('id',reportId);

  if(rowError){
    alert(rowError.message);
    return;
  }

  await supabaseClient.storage
    .from('Medical reports')
    .remove([path]);

  await loadReportsHub();
}

function formatFileSize(bytes){
  if(bytes<1024)return bytes+' B';
  if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';
  return (bytes/(1024*1024)).toFixed(1)+' MB';
}


async function loadReferralDoctorOptions(){
  if(!selectedAppointment)return;

  const {data,error}=await supabaseClient.rpc('get_verified_referral_doctors');

  if(error){
    msg('referralCreateMessage',error.message,'error');
    return;
  }

  referralDoctorCache=data||[];

  const specialties=[...new Set(
    referralDoctorCache.map(d=>d.specialty).filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b));

  const specialtySelect=document.getElementById('referralSpecialty');
  specialtySelect.innerHTML=
    '<option value="">Select specialty</option>'+
    specialties.map(s=>`<option value="${escapeAdmin(s)}">${escapeAdmin(s)}</option>`).join('');

  filterReferralDoctorOptions();
}

function filterReferralDoctorOptions(){
  const specialty=(document.getElementById('referralSpecialty')?.value||'').trim().toLowerCase();
  const location=(document.getElementById('referralLocation')?.value||'').trim().toLowerCase();
  const select=document.getElementById('referralDoctorSelect');

  if(!select)return;

  if(!specialty || location.length<2){
    select.disabled=true;
    select.innerHTML='<option value="">Select specialty and city/district first</option>';
    return;
  }

  const rows=referralDoctorCache.filter(d=>{
    const specialtyOk=String(d.specialty||'').trim().toLowerCase()===specialty;
    const city=String(d.clinic_city||'').trim().toLowerCase();
    const district=String(d.clinic_district||'').trim().toLowerCase();
    const locationOk=
      city===location ||
      district===location ||
      city.includes(location) ||
      district.includes(location);

    return specialtyOk && locationOk;
  });

  select.disabled=false;

  if(!rows.length){
    select.innerHTML='<option value="">No verified specialist found for this specialty and location</option>';
    return;
  }

  select.innerHTML=
    '<option value="">Choose specialist</option>'+
    rows.map(d=>{
      const loc=[d.clinic_city,d.clinic_district].filter(Boolean).join(' · ');
      return `<option value="${d.id}">${escapeAdmin(d.full_name)} — ${escapeAdmin(d.specialty||'General')}${d.hospital_name?' · '+escapeAdmin(d.hospital_name):''}${loc?' · '+escapeAdmin(loc):''}</option>`;
    }).join('');
}


async function createReferralFromAppointment(){
  if(!selectedAppointment || currentProfile?.role!=='doctor')return;

  const toDoctor=document.getElementById('referralDoctorSelect').value;
  const reason=val('referralReason');
  const note=val('referralNote');
  const specialty=val('referralSpecialty');
  const urgency=val('referralUrgency')||'routine';

  const location=val('referralLocation');

  if(!specialty){
    msg('referralCreateMessage','Select the required specialty first.','error');
    return;
  }

  if(!location || location.trim().length<2){
    msg('referralCreateMessage','Enter the city or district before choosing a specialist.','error');
    return;
  }

  if(!toDoctor || !reason){
    msg('referralCreateMessage','Choose a matching specialist and enter the referral reason.','error');
    return;
  }

  const payload={
    patient_id:selectedAppointment.patient_id,
    from_doctor_id:currentUser.id,
    to_doctor_id:toDoctor,
    source_appointment_id:selectedAppointment.id,
    specialty_requested:specialty||null,
    urgency,
    reason,
    note:note||null
  };

  const {error}=await supabaseClient.from('referrals').insert(payload);

  if(error){msg('referralCreateMessage',error.message,'error');return}

  document.getElementById('referralReason').value='';
  document.getElementById('referralNote').value='';
  msg('referralCreateMessage','Referral created. Patient approval is required before records are shared.','success');
}


let currentHealthRecordTab='allergies';

const HEALTH_TABLES={
  allergies:'patient_allergies',
  conditions:'patient_conditions',
  medications:'patient_medications',
  surgeries:'patient_surgeries',
  immunizations:'patient_immunizations',
  family:'patient_family_history',
  vitals:'patient_vitals'
};

function setHealthRecordTab(tab,btn){
  currentHealthRecordTab=tab;
  document.querySelectorAll('.record-tabs button').forEach(x=>x.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderHealthRecordEditor(tab);
}

async function loadStructuredHealthRecord(){
  if(!currentUser || currentProfile?.role!=='patient')return;

  await Promise.all([
    loadPatientEmergencySummary(),
    loadLatestVitals()
  ]);

  renderHealthRecordEditor(currentHealthRecordTab);
}

async function loadPatientEmergencySummary(){
  const {data,error}=await supabaseClient
    .from('patient_profiles')
    .select('blood_group,emergency_contact_name,emergency_contact_phone')
    .eq('id',currentUser.id)
    .maybeSingle();

  const box=document.getElementById('patientEmergencySummary');
  if(error){box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;return}

  box.innerHTML=`
    <p><b>Blood group:</b> ${escapeAdmin(data?.blood_group||'Not recorded')}</p>
    <p><b>Emergency contact:</b> ${escapeAdmin(data?.emergency_contact_name||'Not recorded')} ${escapeAdmin(data?.emergency_contact_phone||'')}</p>`;
}

async function loadLatestVitals(){
  const {data,error}=await supabaseClient
    .from('patient_vitals')
    .select('*')
    .eq('patient_id',currentUser.id)
    .order('measured_at',{ascending:false})
    .limit(1)
    .maybeSingle();

  const box=document.getElementById('latestVitalsSummary');
  if(error){box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;return}

  if(!data){
    box.innerHTML='<p class="muted">No vitals recorded yet.</p>';
    return;
  }

  box.innerHTML=`
    <p><b>BP:</b> ${data.systolic??'—'}/${data.diastolic??'—'} mmHg</p>
    <p><b>Pulse:</b> ${data.pulse??'—'} bpm</p>
    <p><b>SpO₂:</b> ${data.spo2??'—'}%</p>
    <p><b>Temperature:</b> ${data.temperature_c??'—'} °C</p>
    <p><b>Weight:</b> ${data.weight_kg??'—'} kg</p>`;
}

function renderHealthRecordEditor(tab){
  const box=document.getElementById('healthRecordEditor');
  if(!box)return;

  const templates={
    allergies:`<div class="health-entry-form">
      <input id="hrAllergen" placeholder="Allergen">
      <input id="hrReaction" placeholder="Reaction">
      <select id="hrSeverity"><option value="">Severity</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select>
      <button class="btn" onclick="addHealthRecordItem('allergies')">Add allergy</button>
    </div>`,
    conditions:`<div class="health-entry-form">
      <input id="hrCondition" placeholder="Condition">
      <input id="hrConditionDate" type="date">
      <input id="hrConditionNotes" placeholder="Notes">
      <button class="btn" onclick="addHealthRecordItem('conditions')">Add condition</button>
    </div>`,
    medications:`<div class="health-entry-form">
      <input id="hrMedicine" placeholder="Medicine">
      <input id="hrMedicineStrength" placeholder="Strength">
      <input id="hrMedicineDose" placeholder="Dose">
      <input id="hrMedicineFrequency" placeholder="Frequency">
      <button class="btn" onclick="addHealthRecordItem('medications')">Add medication</button>
    </div>`,
    surgeries:`<div class="health-entry-form">
      <input id="hrSurgery" placeholder="Procedure / surgery">
      <input id="hrSurgeryDate" type="date">
      <input id="hrSurgeryHospital" placeholder="Hospital">
      <button class="btn" onclick="addHealthRecordItem('surgeries')">Add surgery</button>
    </div>`,
    immunizations:`<div class="health-entry-form">
      <input id="hrVaccine" placeholder="Vaccine">
      <input id="hrDoseLabel" placeholder="Dose">
      <input id="hrVaccineDate" type="date">
      <button class="btn" onclick="addHealthRecordItem('immunizations')">Add immunization</button>
    </div>`,
    family:`<div class="health-entry-form">
      <input id="hrRelation" placeholder="Relation">
      <input id="hrFamilyCondition" placeholder="Condition">
      <input id="hrFamilyNotes" placeholder="Notes">
      <button class="btn" onclick="addHealthRecordItem('family')">Add family history</button>
    </div>`,
    vitals:`<div class="health-entry-form vitals-form">
      <input id="hrSys" type="number" placeholder="Systolic">
      <input id="hrDia" type="number" placeholder="Diastolic">
      <input id="hrPulse" type="number" placeholder="Pulse">
      <input id="hrSpo2" type="number" placeholder="SpO₂">
      <input id="hrTemp" type="number" step="0.1" placeholder="Temp °C">
      <input id="hrWeight" type="number" step="0.1" placeholder="Weight kg">
      <input id="hrHeight" type="number" step="0.1" placeholder="Height cm">
      <button class="btn" onclick="addHealthRecordItem('vitals')">Add vitals</button>
    </div>`
  };

  box.innerHTML=(templates[tab]||'')+'<div id="healthRecordItems" style="margin-top:14px"></div>';
  loadHealthRecordItems(tab);
}

async function addHealthRecordItem(tab){
  if(!currentUser)return;

  let payload={patient_id:currentUser.id};
  const v=id=>document.getElementById(id)?.value.trim()||'';

  if(tab==='allergies'){
    if(!v('hrAllergen'))return msg('healthRecordMessage','Enter an allergen.','error');
    payload={...payload,allergen:v('hrAllergen'),reaction:v('hrReaction')||null,severity:v('hrSeverity')||null};
  }else if(tab==='conditions'){
    if(!v('hrCondition'))return msg('healthRecordMessage','Enter a condition.','error');
    payload={...payload,condition_name:v('hrCondition'),diagnosed_on:v('hrConditionDate')||null,notes:v('hrConditionNotes')||null};
  }else if(tab==='medications'){
    if(!v('hrMedicine'))return msg('healthRecordMessage','Enter a medicine.','error');
    payload={...payload,medicine_name:v('hrMedicine'),strength:v('hrMedicineStrength')||null,dose:v('hrMedicineDose')||null,frequency:v('hrMedicineFrequency')||null};
  }else if(tab==='surgeries'){
    if(!v('hrSurgery'))return msg('healthRecordMessage','Enter the procedure.','error');
    payload={...payload,procedure_name:v('hrSurgery'),procedure_date:v('hrSurgeryDate')||null,hospital_name:v('hrSurgeryHospital')||null};
  }else if(tab==='immunizations'){
    if(!v('hrVaccine'))return msg('healthRecordMessage','Enter the vaccine name.','error');
    payload={...payload,vaccine_name:v('hrVaccine'),dose_label:v('hrDoseLabel')||null,administered_on:v('hrVaccineDate')||null};
  }else if(tab==='family'){
    if(!v('hrRelation')||!v('hrFamilyCondition'))return msg('healthRecordMessage','Enter relation and condition.','error');
    payload={...payload,relation:v('hrRelation'),condition_name:v('hrFamilyCondition'),notes:v('hrFamilyNotes')||null};
  }else if(tab==='vitals'){
    payload={
      ...payload,
      systolic:v('hrSys')?Number(v('hrSys')):null,
      diastolic:v('hrDia')?Number(v('hrDia')):null,
      pulse:v('hrPulse')?Number(v('hrPulse')):null,
      spo2:v('hrSpo2')?Number(v('hrSpo2')):null,
      temperature_c:v('hrTemp')?Number(v('hrTemp')):null,
      weight_kg:v('hrWeight')?Number(v('hrWeight')):null,
      height_cm:v('hrHeight')?Number(v('hrHeight')):null,
      source:'patient'
    };
  }

  const {error}=await supabaseClient.from(HEALTH_TABLES[tab]).insert(payload);
  if(error){msg('healthRecordMessage',error.message,'error');return}

  msg('healthRecordMessage','Saved.','success');
  renderHealthRecordEditor(tab);
  if(tab==='vitals')await loadLatestVitals();
}

async function loadHealthRecordItems(tab){
  const table=HEALTH_TABLES[tab];
  const {data,error}=await supabaseClient
    .from(table)
    .select('*')
    .eq('patient_id',currentUser.id)
    .order(tab==='vitals'?'measured_at':'created_at',{ascending:false});

  const box=document.getElementById('healthRecordItems');
  if(error){box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;return}
  if(!data?.length){box.innerHTML='<p class="muted">No entries yet.</p>';return}

  box.innerHTML=data.map(x=>`<div class="mini-row">
    <div>${formatHealthRecordItem(tab,x)}</div>
    <button class="btn secondary" onclick="deleteHealthRecordItem('${tab}','${x.id}')">Delete</button>
  </div>`).join('');
}

function formatHealthRecordItem(tab,x){
  if(tab==='allergies')return `<b>${escapeAdmin(x.allergen)}</b><div class="muted">${escapeAdmin(x.reaction||'')} ${x.severity?'· '+escapeAdmin(x.severity):''}</div>`;
  if(tab==='conditions')return `<b>${escapeAdmin(x.condition_name)}</b><div class="muted">${escapeAdmin(x.status)} ${x.diagnosed_on?'· '+escapeAdmin(x.diagnosed_on):''}</div>`;
  if(tab==='medications')return `<b>${escapeAdmin(x.medicine_name)}</b><div class="muted">${escapeAdmin([x.strength,x.dose,x.frequency].filter(Boolean).join(' · '))}</div>`;
  if(tab==='surgeries')return `<b>${escapeAdmin(x.procedure_name)}</b><div class="muted">${escapeAdmin([x.procedure_date,x.hospital_name].filter(Boolean).join(' · '))}</div>`;
  if(tab==='immunizations')return `<b>${escapeAdmin(x.vaccine_name)}</b><div class="muted">${escapeAdmin([x.dose_label,x.administered_on].filter(Boolean).join(' · '))}</div>`;
  if(tab==='family')return `<b>${escapeAdmin(x.relation)} — ${escapeAdmin(x.condition_name)}</b><div class="muted">${escapeAdmin(x.notes||'')}</div>`;
  if(tab==='vitals')return `<b>${new Date(x.measured_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})}</b><div class="muted">BP ${x.systolic??'—'}/${x.diastolic??'—'} · Pulse ${x.pulse??'—'} · SpO₂ ${x.spo2??'—'}% · Temp ${x.temperature_c??'—'}°C · ${x.weight_kg??'—'} kg</div>`;
  return '';
}

async function deleteHealthRecordItem(tab,id){
  if(!confirm('Delete this health record entry?'))return;
  const {error}=await supabaseClient.from(HEALTH_TABLES[tab]).delete().eq('id',id);
  if(error){msg('healthRecordMessage',error.message,'error');return}
  await loadHealthRecordItems(tab);
  if(tab==='vitals')await loadLatestVitals();
}



function carePlanStatusLabel(status){
  return ({
    active:'Active',
    completed:'Completed',
    cancelled:'Closed'
  })[status]||status;
}

function carePlanTaskTypeLabel(type){
  return ({
    medication:'Medication',
    test:'Test / investigation',
    follow_up:'Follow-up',
    lifestyle:'Lifestyle / self-care',
    other:'Other'
  })[type]||type;
}

async function loadCarePlans(){
  const gate=document.getElementById('carePlansGate');
  const content=document.getElementById('carePlansContent');
  const list=document.getElementById('carePlansList');

  if(!currentUser){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  if(!['patient','doctor'].includes(currentProfile?.role)){
    gate.classList.remove('hidden');
    gate.innerHTML='<h2>Care Plans</h2><p class="muted">Care Plans are available to patient and doctor accounts.</p>';
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');
  document.getElementById('carePlanDetail')?.classList.add('hidden');

  let query=supabaseClient
    .from('care_plans')
    .select('*')
    .order('created_at',{ascending:false});

  query=currentProfile.role==='patient'
    ? query.eq('patient_id',currentUser.id)
    : query.eq('doctor_id',currentUser.id);

  const {data,error}=await query;

  if(error){
    list.innerHTML=`<div class="card"><p class="error">${escapeAdmin(error.message)}</p></div>`;
    return;
  }

  if(!data?.length){
    list.innerHTML=`<div class="card empty-state">
      <div class="empty-icon">📋</div>
      <h3>No care plans yet</h3>
      <p class="muted">${currentProfile.role==='doctor'
        ? 'Open a confirmed or completed appointment to create a care plan.'
        : 'A care plan created by your doctor will appear here.'}</p>
    </div>`;
    return;
  }

  const otherIds=[...new Set(
    data.map(p=>currentProfile.role==='patient'?p.doctor_id:p.patient_id).filter(Boolean)
  )];

  const names={};
  if(otherIds.length){
    const {data:profiles}=await supabaseClient
      .from('profiles')
      .select('id,full_name')
      .in('id',otherIds);
    (profiles||[]).forEach(p=>names[p.id]=p.full_name||'Account');
  }

  list.innerHTML=data.map(plan=>{
    const other=currentProfile.role==='patient'
      ? `Dr. ${names[plan.doctor_id]||'Doctor'}`
      : names[plan.patient_id]||'Patient';

    return `<div class="card care-plan-list-card">
      <div class="row between">
        <div>
          <small>${currentProfile.role==='patient'?'CARE WITH':'PATIENT'} ${escapeAdmin(other)}</small>
          <h3>${escapeAdmin(plan.title)}</h3>
        </div>
        <span class="timeline-status ${plan.status==='active'?'active':plan.status==='completed'?'success':'closed'}">${escapeAdmin(carePlanStatusLabel(plan.status))}</span>
      </div>
      <p class="muted">${escapeAdmin(plan.summary||'No summary added.')}</p>
      <div class="care-plan-list-meta">
        <span>Started ${escapeAdmin(doctorOverviewDate(plan.start_date,true))}</span>
        ${plan.target_date?`<span>Target ${escapeAdmin(doctorOverviewDate(plan.target_date,true))}</span>`:''}
      </div>
      <button class="btn secondary" onclick="openCarePlan('${plan.id}')">Open plan</button>
    </div>`;
  }).join('');
}

async function openCarePlanForAppointment(patientId,appointmentId){
  if(currentProfile?.role!=='doctor')return;

  carePlanCreateContext={patientId,appointmentId};
  showPage('careplans');

  const {data:patient}=await supabaseClient
    .from('profiles')
    .select('full_name')
    .eq('id',patientId)
    .maybeSingle();

  document.getElementById('carePlanCreateTitle').textContent=
    `Create care plan for ${patient?.full_name||'patient'}`;

  document.getElementById('carePlanCreateCard').classList.remove('hidden');
  document.getElementById('carePlanDetail').classList.add('hidden');
  document.getElementById('carePlanTitle').value='';
  document.getElementById('carePlanSummary').value='';
  document.getElementById('carePlanTargetDate').value='';
  msg('carePlanCreateMessage','');
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelCarePlanCreate(){
  carePlanCreateContext=null;
  document.getElementById('carePlanCreateCard')?.classList.add('hidden');
}

async function submitCarePlan(e){
  e.preventDefault();

  if(currentProfile?.role!=='doctor' || !carePlanCreateContext){
    msg('carePlanCreateMessage','Open a confirmed or completed appointment first.','error');
    return;
  }

  const title=document.getElementById('carePlanTitle').value.trim();
  const summary=document.getElementById('carePlanSummary').value.trim();
  const targetDate=document.getElementById('carePlanTargetDate').value||null;

  msg('carePlanCreateMessage','Creating...');

  const {data,error}=await supabaseClient
    .from('care_plans')
    .insert({
      patient_id:carePlanCreateContext.patientId,
      doctor_id:currentUser.id,
      source_appointment_id:carePlanCreateContext.appointmentId,
      title,
      summary:summary||null,
      target_date:targetDate
    })
    .select()
    .single();

  if(error){
    msg('carePlanCreateMessage',error.message,'error');
    return;
  }

  toast('Care plan created','The patient can now see this plan.');
  carePlanCreateContext=null;
  document.getElementById('carePlanCreateCard').classList.add('hidden');
  await loadCarePlans();
  await openCarePlan(data.id);
}

async function openCarePlan(id){
  const {data:plan,error}=await supabaseClient
    .from('care_plans')
    .select('*')
    .eq('id',id)
    .single();

  if(error){
    msg('carePlansMessage',error.message,'error');
    return;
  }

  const {data:tasks,error:tasksError}=await supabaseClient
    .from('care_plan_tasks')
    .select('*')
    .eq('care_plan_id',id)
    .order('due_date',{ascending:true,nullsFirst:false})
    .order('created_at',{ascending:true});

  if(tasksError){
    msg('carePlansMessage',tasksError.message,'error');
    return;
  }

  const ids=[plan.patient_id,plan.doctor_id];
  const {data:profiles}=await supabaseClient
    .from('profiles')
    .select('id,full_name')
    .in('id',ids);

  const names={};
  (profiles||[]).forEach(p=>names[p.id]=p.full_name||'Account');

  selectedCarePlan=plan;

  const list=document.getElementById('carePlansList');
  const detail=document.getElementById('carePlanDetail');
  list.classList.add('hidden');
  document.getElementById('carePlanCreateCard').classList.add('hidden');
  detail.classList.remove('hidden');

  document.getElementById('carePlanDetailTitle').textContent=plan.title;
  document.getElementById('carePlanDetailMeta').textContent=
    `${names[plan.patient_id]||'Patient'} · Dr. ${names[plan.doctor_id]||'Doctor'} · ${carePlanStatusLabel(plan.status)}`;

  document.getElementById('carePlanDetailSummary').innerHTML=`
    <div class="care-plan-summary-box">
      <div>
        <small>PLAN SUMMARY</small>
        <p>${escapeAdmin(plan.summary||'No summary added.')}</p>
      </div>
      <div class="care-plan-dates">
        <span><b>Started</b>${escapeAdmin(doctorOverviewDate(plan.start_date,true))}</span>
        <span><b>Target</b>${plan.target_date?escapeAdmin(doctorOverviewDate(plan.target_date,true)):'Not set'}</span>
        <span><b>Status</b>${escapeAdmin(carePlanStatusLabel(plan.status))}</span>
      </div>
    </div>`;

  renderCarePlanTasks(tasks||[]);

  const doctorActions=document.getElementById('carePlanDoctorActions');
  doctorActions.classList.toggle(
    'hidden',
    currentProfile?.role!=='doctor' ||
    plan.doctor_id!==currentUser.id ||
    plan.status!=='active'
  );

  window.scrollTo({top:0,behavior:'smooth'});
}

function renderCarePlanTasks(tasks){
  const box=document.getElementById('carePlanTasks');
  document.getElementById('carePlanTaskCount').textContent=String(tasks.length);

  if(!tasks.length){
    box.innerHTML='<div class="doctor-overview-empty">No care actions have been added yet.</div>';
    return;
  }

  box.innerHTML=tasks.map(task=>`
    <div class="care-plan-task ${task.status}">
      <div class="care-plan-task-icon">${task.task_type==='medication'?'💊':task.task_type==='test'?'🧪':task.task_type==='follow_up'?'📅':task.task_type==='lifestyle'?'✓':'•'}</div>
      <div class="care-plan-task-body">
        <div class="row between">
          <div>
            <small>${escapeAdmin(carePlanTaskTypeLabel(task.task_type))}</small>
            <h4>${escapeAdmin(task.title)}</h4>
          </div>
          <span class="timeline-status ${task.status==='completed'?'success':task.status==='cancelled'?'closed':'active'}">${escapeAdmin(task.status)}</span>
        </div>
        ${task.instructions?`<p class="muted">${escapeAdmin(task.instructions)}</p>`:''}
        ${task.due_date?`<p class="care-plan-due">Due ${escapeAdmin(doctorOverviewDate(task.due_date,true))}</p>`:''}
        ${currentProfile?.role==='patient' && task.status==='pending' && selectedCarePlan?.status==='active'
          ? `<button class="btn secondary" onclick="completeCarePlanTask('${task.id}')">Mark done</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

async function addCarePlanTask(e){
  e.preventDefault();

  if(
    currentProfile?.role!=='doctor' ||
    !selectedCarePlan ||
    selectedCarePlan.doctor_id!==currentUser.id
  )return;

  const payload={
    care_plan_id:selectedCarePlan.id,
    task_type:document.getElementById('carePlanTaskType').value,
    title:document.getElementById('carePlanTaskTitle').value.trim(),
    instructions:document.getElementById('carePlanTaskInstructions').value.trim()||null,
    due_date:document.getElementById('carePlanTaskDueDate').value||null
  };

  msg('carePlanTaskMessage','Adding...');

  const {error}=await supabaseClient
    .from('care_plan_tasks')
    .insert(payload);

  if(error){
    msg('carePlanTaskMessage',error.message,'error');
    return;
  }

  document.getElementById('carePlanTaskTitle').value='';
  document.getElementById('carePlanTaskInstructions').value='';
  document.getElementById('carePlanTaskDueDate').value='';
  msg('carePlanTaskMessage','Action added.','success');
  await openCarePlan(selectedCarePlan.id);
}

async function completeCarePlanTask(taskId){
  const {error}=await supabaseClient.rpc(
    'complete_my_care_plan_task',
    {target_task:taskId}
  );

  if(error){
    alert(error.message);
    return;
  }

  toast('Care action completed','Marked as done.');
  await openCarePlan(selectedCarePlan.id);
}

async function setCarePlanStatus(status){
  if(
    currentProfile?.role!=='doctor' ||
    !selectedCarePlan ||
    !['completed','cancelled'].includes(status)
  )return;

  if(!confirm(status==='completed'
    ? 'Mark this care plan completed?'
    : 'Close this care plan?'))return;

  const {error}=await supabaseClient
    .from('care_plans')
    .update({status})
    .eq('id',selectedCarePlan.id)
    .eq('doctor_id',currentUser.id);

  if(error){
    alert(error.message);
    return;
  }

  toast('Care plan updated',carePlanStatusLabel(status));
  await openCarePlan(selectedCarePlan.id);
}

function closeCarePlanDetail(){
  selectedCarePlan=null;
  document.getElementById('carePlanDetail')?.classList.add('hidden');
  document.getElementById('carePlansList')?.classList.remove('hidden');
  loadCarePlans();
}

function setTimelineFilter(filter){
  timelineFilter=filter||'all';

  document.querySelectorAll('.timeline-filter').forEach(btn=>{
    btn.classList.toggle(
      'active',
      btn.dataset.timelineFilter===timelineFilter
    );
  });

  renderCareTimeline();
}

function timelineDateValue(value){
  if(!value)return 0;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?0:d.getTime();
}

function timelineDisplayDate(value,dateOnly=false){
  if(!value)return 'Date not recorded';

  const d=dateOnly
    ? new Date(`${String(value).slice(0,10)}T12:00:00`)
    : new Date(value);

  if(Number.isNaN(d.getTime()))return 'Date not recorded';

  return d.toLocaleString('en-IN',{
    dateStyle:'medium',
    ...(dateOnly?{}:{timeStyle:'short'}),
    timeZone:'Asia/Kolkata'
  });
}

function timelineTypeLabel(type){
  return ({
    consultation:'Consultation',
    report:'Report',
    referral:'Referral',
    diagnostic:'Diagnostics',
    pharmacy:'Pharmacy',
    followup:'Follow-up'
  })[type]||type;
}

function timelineIcon(type){
  return ({
    consultation:'🩺',
    report:'📄',
    referral:'↗',
    diagnostic:'🧪',
    pharmacy:'💊',
    followup:'⏱'
  })[type]||'•';
}

function timelineStatusClass(status=''){
  const s=String(status).toLowerCase();
  if(['completed','fulfilled','report_ready','verified'].includes(s))return 'success';
  if(['cancelled','rejected','declined','closed_no_show','no_show'].includes(s))return 'closed';
  if(['appointment_missed','overdue'].includes(s))return 'warning';
  return 'active';
}

async function loadCareTimeline(){
  const gate=document.getElementById('timelineGate');
  const content=document.getElementById('timelineContent');
  const list=document.getElementById('careTimelineList');

  await loadProfile();

  if(!currentUser || currentProfile?.role!=='patient'){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');
  list.innerHTML='<div class="card"><p class="muted">Building your care timeline...</p></div>';

  const [
    appointmentsResult,
    consultationsResult,
    reportsResult,
    referralsResult,
    diagnosticsResult,
    pharmacyResult,
    followupsResult
  ]=await Promise.all([
    supabaseClient
      .from('appointments')
      .select('id,doctor_id,appointment_start,appointment_end,consultation_type,reason_for_visit,status,created_at')
      .eq('patient_id',currentUser.id)
      .order('appointment_start',{ascending:false}),

    supabaseClient
      .from('consultations')
      .select('id,appointment_id,doctor_id,diagnosis,assessment,follow_up_date,created_at')
      .eq('patient_id',currentUser.id)
      .order('created_at',{ascending:false}),

    supabaseClient
      .from('medical_reports')
      .select('id,title,report_type,report_date,appointment_id,diagnostic_request_id,file_path,file_name,notes,created_at')
      .eq('patient_id',currentUser.id)
      .order('created_at',{ascending:false}),

    supabaseClient
      .from('referrals')
      .select('id,from_doctor_id,to_doctor_id,reason,note,specialty_requested,urgency,status,booked_appointment_id,created_at,updated_at')
      .eq('patient_id',currentUser.id)
      .order('created_at',{ascending:false}),

    supabaseClient
      .from('diagnostic_requests')
      .select('id,lab_id,requested_date,preferred_time,status,patient_note,lab_note,requested_at,updated_at')
      .eq('patient_id',currentUser.id)
      .order('requested_at',{ascending:false}),

    supabaseClient
      .from('pharmacy_requests')
      .select('id,pharmacy_id,consultation_id,status,patient_note,pharmacy_note,requested_at,updated_at')
      .eq('patient_id',currentUser.id)
      .order('requested_at',{ascending:false}),

    supabaseClient
      .from('followup_reminders')
      .select('id,consultation_id,appointment_id,follow_up_date,status,created_at,updated_at')
      .eq('patient_id',currentUser.id)
      .order('follow_up_date',{ascending:false})
  ]);

  const results=[
    appointmentsResult,consultationsResult,reportsResult,referralsResult,
    diagnosticsResult,pharmacyResult,followupsResult
  ];

  const firstError=results.find(r=>r.error)?.error;
  if(firstError){
    list.innerHTML=`<div class="card"><p class="error">${escapeAdmin(firstError.message)}</p></div>`;
    return;
  }

  const appointments=appointmentsResult.data||[];
  const consultations=consultationsResult.data||[];
  const reports=reportsResult.data||[];
  const referrals=referralsResult.data||[];
  const diagnostics=diagnosticsResult.data||[];
  const pharmacyRequests=pharmacyResult.data||[];
  const followups=followupsResult.data||[];

  const doctorIds=[...new Set([
    ...appointments.map(a=>a.doctor_id),
    ...referrals.map(r=>r.from_doctor_id),
    ...referrals.map(r=>r.to_doctor_id)
  ].filter(Boolean))];

  const doctorNames={};
  const doctorSpecialties={};

  if(doctorIds.length){
    const [{data:profiles},{data:doctorProfiles}]=await Promise.all([
      supabaseClient.from('profiles').select('id,full_name').in('id',doctorIds),
      supabaseClient.from('doctor_profiles').select('id,specialty').in('id',doctorIds)
    ]);

    (profiles||[]).forEach(p=>doctorNames[p.id]=p.full_name||'Doctor');
    (doctorProfiles||[]).forEach(d=>doctorSpecialties[d.id]=d.specialty||'');
  }

  let labNames={};
  const labIds=[...new Set(diagnostics.map(d=>d.lab_id).filter(Boolean))];
  if(labIds.length){
    const {data:labs}=await supabaseClient.rpc('get_verified_labs');
    (labs||[]).forEach(l=>labNames[l.id]=l.lab_name||'Diagnostic centre');
  }

  let pharmacyNames={};
  const pharmacyIds=[...new Set(pharmacyRequests.map(p=>p.pharmacy_id).filter(Boolean))];
  if(pharmacyIds.length){
    const {rows}=await getVerifiedPharmacies();
    (rows||[]).forEach(p=>pharmacyNames[p.id]=p.pharmacy_name||'Pharmacy');
  }

  const appointmentMap=Object.fromEntries(appointments.map(a=>[a.id,a]));
  const consultationMap=Object.fromEntries(consultations.map(c=>[c.id,c]));

  const events=[];

  consultations.forEach(c=>{
    const a=appointmentMap[c.appointment_id];
    const eventDate=a?.appointment_start||c.created_at;
    const doctor=doctorNames[c.doctor_id||a?.doctor_id]||'Doctor';
    const specialty=doctorSpecialties[c.doctor_id||a?.doctor_id]||'';

    events.push({
      type:'consultation',
      status:a?.status||'completed',
      date:eventDate,
      sortDate:timelineDateValue(eventDate),
      title:c.diagnosis||a?.reason_for_visit||'Medical consultation',
      subtitle:[doctor,specialty].filter(Boolean).join(' · '),
      detail:c.assessment||'Consultation record saved.',
      actionLabel:'Open consultation',
      action:`openAppointmentDetail('${c.appointment_id}')`
    });
  });

  reports.forEach(r=>{
    const eventDate=r.report_date
      ? `${r.report_date}T12:00:00`
      : r.created_at;

    events.push({
      type:'report',
      status:'completed',
      date:eventDate,
      sortDate:timelineDateValue(eventDate),
      title:r.title||'Medical report',
      subtitle:(r.report_type||'other').replaceAll('_',' '),
      detail:r.notes||r.file_name||'Medical report added to your record.',
      actionLabel:'Open report',
      action:`openMedicalReport('${r.id}','${encodeURIComponent(r.file_path)}')`
    });
  });

  referrals.forEach(r=>{
    const eventDate=r.updated_at||r.created_at;
    const fromName=doctorNames[r.from_doctor_id]||'Doctor';
    const toName=doctorNames[r.to_doctor_id]||'Specialist';

    events.push({
      type:'referral',
      status:r.status,
      date:eventDate,
      sortDate:timelineDateValue(eventDate),
      title:r.specialty_requested||r.reason||'Specialist referral',
      subtitle:`${fromName} → ${toName}`,
      detail:`${referralStatusLabel(r.status)} · ${(r.urgency||'routine').replace('_',' ')}`,
      actionLabel:'Open referral',
      action:`openReferralDetail('${r.id}')`
    });
  });

  diagnostics.forEach(d=>{
    const eventDate=d.updated_at||d.requested_at;
    events.push({
      type:'diagnostic',
      status:d.status,
      date:eventDate,
      sortDate:timelineDateValue(eventDate),
      title:labNames[d.lab_id]||'Diagnostic request',
      subtitle:diagnosticStatusLabel(d.status),
      detail:d.lab_note||d.patient_note||(
        d.requested_date
          ? `Requested for ${timelineDisplayDate(d.requested_date,true)}`
          : 'Diagnostic test request'
      ),
      actionLabel:'Open diagnostics',
      action:`showPage('diagnostics')`
    });
  });

  pharmacyRequests.forEach(p=>{
    const eventDate=p.updated_at||p.requested_at;
    events.push({
      type:'pharmacy',
      status:p.status,
      date:eventDate,
      sortDate:timelineDateValue(eventDate),
      title:pharmacyNames[p.pharmacy_id]||'Prescription fulfilment',
      subtitle:(p.status||'requested').replaceAll('_',' '),
      detail:p.pharmacy_note||p.patient_note||'Prescription fulfilment request.',
      actionLabel:'Open pharmacy',
      action:`showPage('pharmacy')`
    });
  });

  followups.forEach(f=>{
    const eventDate=f.follow_up_date
      ? `${f.follow_up_date}T12:00:00`
      : f.updated_at||f.created_at;

    const appt=appointmentMap[f.appointment_id];

    events.push({
      type:'followup',
      status:f.status,
      date:eventDate,
      sortDate:timelineDateValue(eventDate),
      title:'Follow-up',
      subtitle:f.status==='pending'
        ? `Due ${timelineDisplayDate(f.follow_up_date,true)}`
        : (f.status||'follow-up').replaceAll('_',' '),
      detail:appt?.reason_for_visit||'Doctor follow-up reminder.',
      actionLabel:'Open follow-ups',
      action:`showPage('followups')`
    });
  });

  careTimelineCache=events.sort((a,b)=>b.sortDate-a.sortDate);
  renderCareTimeline();
}

function renderCareTimeline(){
  const list=document.getElementById('careTimelineList');
  const summary=document.getElementById('timelineSummary');
  if(!list || !summary)return;

  const all=careTimelineCache||[];
  const rows=timelineFilter==='all'
    ? all
    : all.filter(e=>e.type===timelineFilter);

  const counts={
    consultation:all.filter(e=>e.type==='consultation').length,
    report:all.filter(e=>e.type==='report').length,
    referral:all.filter(e=>e.type==='referral').length,
    diagnostic:all.filter(e=>e.type==='diagnostic').length,
    pharmacy:all.filter(e=>e.type==='pharmacy').length,
    followup:all.filter(e=>e.type==='followup').length
  };

  summary.innerHTML=`
    <div><b>${counts.consultation}</b><span>Consultations</span></div>
    <div><b>${counts.report}</b><span>Reports</span></div>
    <div><b>${counts.referral}</b><span>Referrals</span></div>
    <div><b>${counts.diagnostic}</b><span>Diagnostics</span></div>
    <div><b>${counts.pharmacy}</b><span>Pharmacy</span></div>
    <div><b>${counts.followup}</b><span>Follow-ups</span></div>`;

  if(!rows.length){
    list.innerHTML=`<div class="card empty-state">
      <div class="empty-icon">🩺</div>
      <h3>No ${timelineFilter==='all'?'care events':timelineTypeLabel(timelineFilter).toLowerCase()} yet</h3>
      <p class="muted">New healthcare activity will appear here automatically.</p>
    </div>`;
    return;
  }

  let lastGroup='';

  list.innerHTML=rows.map(e=>{
    const d=new Date(e.date);
    const group=Number.isNaN(d.getTime())
      ? 'Other'
      : d.toLocaleDateString('en-IN',{
          month:'long',
          year:'numeric',
          timeZone:'Asia/Kolkata'
        });

    const heading=group!==lastGroup
      ? `<div class="timeline-month">${escapeAdmin(group)}</div>`
      : '';

    lastGroup=group;

    return `${heading}
      <div class="care-timeline-event">
        <div class="care-timeline-rail">
          <span class="care-timeline-icon ${escapeAdmin(e.type)}">${timelineIcon(e.type)}</span>
        </div>

        <div class="care-timeline-card">
          <div class="row between">
            <div>
              <small>${escapeAdmin(timelineTypeLabel(e.type).toUpperCase())}</small>
              <h3>${escapeAdmin(e.title||timelineTypeLabel(e.type))}</h3>
            </div>
            <span class="timeline-status ${timelineStatusClass(e.status)}">${escapeAdmin(String(e.status||'').replaceAll('_',' '))}</span>
          </div>

          <p class="timeline-event-date">${escapeAdmin(timelineDisplayDate(e.date))}</p>
          ${e.subtitle?`<p><b>${escapeAdmin(e.subtitle)}</b></p>`:''}
          ${e.detail?`<p class="muted">${escapeAdmin(e.detail)}</p>`:''}

          ${e.action?`<button class="btn secondary" onclick="${e.action}">${escapeAdmin(e.actionLabel||'Open')}</button>`:''}
        </div>
      </div>`;
  }).join('');
}

async function loadMedicalRecordPage(){
  const gate=document.getElementById('recordsGate'),
        content=document.getElementById('recordsContent');

  await loadProfile();

  if(!currentUser || currentProfile?.role!=='patient'){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');
  await Promise.all([loadMedicalRecord(),loadStructuredHealthRecord()]);
}

async function loadMedicalRecord(){
  msg('recordsMessage','Loading medical record...');

  const {data:appointments,error:aErr}=await supabaseClient
    .from('appointments')
    .select('*')
    .eq('patient_id',currentUser.id)
    .eq('status','completed')
    .order('appointment_start',{ascending:false});

  if(aErr){msg('recordsMessage',aErr.message,'error');return}

  if(!appointments?.length){
    document.getElementById('medicalRecordList').innerHTML='<div class="card"><b>No completed consultations yet.</b></div>';
    msg('recordsMessage','');return;
  }

  const apptIds=appointments.map(a=>a.id);
  const doctorIds=[...new Set(appointments.map(a=>a.doctor_id))];

  const [{data:consults},{data:doctorProfiles},{data:profiles}]=await Promise.all([
    supabaseClient.from('consultations').select('*').in('appointment_id',apptIds),
    supabaseClient.from('doctor_profiles').select('id,specialty').in('id',doctorIds),
    supabaseClient.from('profiles').select('id,full_name').in('id',doctorIds)
  ]);

  const cm=Object.fromEntries((consults||[]).map(c=>[c.appointment_id,c]));
  const dm=Object.fromEntries((doctorProfiles||[]).map(d=>[d.id,d]));
  const pm=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));

  const consultationIds=(consults||[]).map(c=>c.id);
  let meds=[];
  if(consultationIds.length){
    const {data}=await supabaseClient.from('prescription_items').select('*').in('consultation_id',consultationIds);
    meds=data||[];
  }
  const medsBy={};
  meds.forEach(m=>(medsBy[m.consultation_id]??=[]).push(m));

  document.getElementById('medicalRecordList').innerHTML=appointments.map(a=>{
    const c=cm[a.id];
    const doctor=pm[a.doctor_id]?.full_name||'Doctor';
    const specialty=dm[a.doctor_id]?.specialty||'';
    const when=new Date(a.appointment_start).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'});
    const rx=c?(medsBy[c.id]||[]):[];

    return `<div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${escapeAdmin(doctor)}</h2>
          <p class="muted">${escapeAdmin(specialty)} · ${when}</p>
        </div>
        <span class="badge">completed</span>
      </div>
      ${c?`
        <p><b>Diagnosis:</b> ${escapeAdmin(c.diagnosis||'Not recorded')}</p>
        <p><b>Assessment:</b> ${escapeAdmin(c.assessment||'Not recorded')}</p>
        <p><b>Investigations:</b> ${escapeAdmin(c.investigations||'None recorded')}</p>
        <p><b>Advice:</b> ${escapeAdmin(c.advice||'None recorded')}</p>
        ${c.follow_up_date?`<p><b>Follow-up:</b> ${escapeAdmin(c.follow_up_date)}</p>`:''}
        <h3>Prescription</h3>
        ${rx.length?rx.map(m=>`<p>• <b>${escapeAdmin(m.medicine_name)}</b> ${escapeAdmin(m.strength||'')} — ${escapeAdmin([m.dose,m.frequency,m.duration].filter(Boolean).join(' · '))} ${m.instructions?'— '+escapeAdmin(m.instructions):''}</p>`).join(''):'<p class="muted">No medicines recorded.</p>'}
        <div class="record-ai-action">
          <button class="btn secondary" onclick="openPatientConsultationExplain('${a.id}')">
            Doctor + AI explanation
          </button>
          <p class="muted small-note">See the original doctor record and a simple AI explanation side by side.</p>
        </div>
      `:`<p class="muted">No consultation summary recorded for this appointment.</p>
          <p class="muted small-note">AI explanation becomes available after the doctor records the consultation summary.</p>`}
    </div>`;
  }).join('');

  msg('recordsMessage','');
}

async function loadReferralsPage(){
  const gate=document.getElementById('referralsGate'),
        content=document.getElementById('referralsContent');

  await loadProfile();

  if(!currentUser || !['patient','doctor'].includes(currentProfile?.role)){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');
  await loadReferrals();
}

async function loadReferrals(){
  msg('referralsMessage','Loading referrals...');

  const {data,error}=await supabaseClient
    .from('referrals')
    .select('*')
    .order('created_at',{ascending:false});

  if(error){msg('referralsMessage',error.message,'error');return}

  const box=document.getElementById('referralsList');

  if(!data?.length){
    box.innerHTML='<div class="card"><b>No referrals yet.</b></div>';
    msg('referralsMessage','');return;
  }

  const ids=[...new Set(data.flatMap(r=>[r.patient_id,r.from_doctor_id,r.to_doctor_id]))];
  const {data:profiles}=await supabaseClient.from('profiles').select('id,full_name').in('id',ids);
  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name]));

  box.innerHTML=data.map(r=>{
    const role=currentProfile?.role;
    const counterpart=role==='patient'
      ? `${names[r.from_doctor_id]||'Doctor'} → ${names[r.to_doctor_id]||'Doctor'}`
      : currentUser.id===r.from_doctor_id
        ? `To ${names[r.to_doctor_id]||'Doctor'}`
        : `From ${names[r.from_doctor_id]||'Doctor'}`;

    return `<div class="card referral-pathway-card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${escapeAdmin(counterpart)}</h2>
          <p><b>${escapeAdmin(r.specialty_requested||'Specialist care')}</b> · ${escapeAdmin(r.reason)}</p>
          <p class="muted">${escapeAdmin(r.note||'')}</p>
        </div>
        <div class="referral-badges">
          <span class="referral-urgency ${escapeAdmin(r.urgency||'routine')}">${escapeAdmin(r.urgency||'routine')}</span>
          <span class="referral-status">${escapeAdmin(referralStatusLabel(r.status))}</span>
        </div>
      </div>
      <div class="referral-mini-progress">${renderReferralProgress(r.status)}</div>
      <button class="btn" onclick="openReferralDetail('${r.id}')">Open care pathway</button>
    </div>`;
  }).join('');

  msg('referralsMessage','');
}

function referralStatusLabel(status){
  return ({
    proposed:'Awaiting patient approval',
    patient_approved:'Awaiting specialist',
    accepted:'Ready to book',
    booked:'Appointment booked',
    appointment_missed:'Appointment missed — rebook',
    closed_no_show:'Closed after no-show',
    declined:'Declined',
    completed:'Completed',
    cancelled:'Cancelled'
  })[status]||status;
}

function renderReferralProgress(status){
  if(status==='closed_no_show'){
    const labels=['Referral','Approved','Accepted','Booked','No-show','Closed'];
    return labels.map((label,i)=>`
      <span class="referral-step done ${i===labels.length-1?'current terminal-close':''}">
        <span class="referral-step-dot">${i+1}</span>
        <span>${label}</span>
      </span>`).join('');
  }

  if(status==='appointment_missed'){
    const labels=['Referral','Approved','Accepted','Booked','No-show'];
    return labels.map((label,i)=>`
      <span class="referral-step done ${i===labels.length-1?'current missed-step':''}">
        <span class="referral-step-dot">${i+1}</span>
        <span>${label}</span>
      </span>`).join('');
  }

  if(status==='completed'){
    const labels=['Referral','Approved','Accepted','Booked','Consulted','Completed'];
    return labels.map((label,i)=>`
      <span class="referral-step done ${i===labels.length-1?'current completed-step':''}">
        <span class="referral-step-dot">${i+1}</span>
        <span>${label}</span>
      </span>`).join('');
  }

  const order=['proposed','patient_approved','accepted','booked'];
  const terminal=['declined','cancelled'];

  if(terminal.includes(status)){
    return `<span class="referral-progress-terminal">${escapeAdmin(referralStatusLabel(status))}</span>`;
  }

  const current=Math.max(0,order.indexOf(status));
  const labels=['Referral','Approved','Accepted','Booked'];

  return labels.map((label,i)=>`
    <span class="referral-step ${i<=current?'done':''} ${i===current?'current':''}">
      <span class="referral-step-dot">${i+1}</span>
      <span>${label}</span>
    </span>`).join('');
}

async function openReferralDetail(id){
  const {data,error}=await supabaseClient
    .from('referrals')
    .select('*')
    .eq('id',id)
    .single();

  if(error){msg('referralsMessage',error.message,'error');return}

  selectedReferral=data;

  if(data.status==='booked' && data.booked_appointment_id){
    const {data:synced,error:syncError}=await supabaseClient.rpc(
      'sync_referral_for_appointment',
      {target_appointment:data.booked_appointment_id}
    );

    if(!syncError){
      const syncedRow=Array.isArray(synced)?synced[0]:synced;
      if(syncedRow && syncedRow.status!==data.status){
        return openReferralDetail(id);
      }
    }
  }

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-referral-detail').classList.add('active');

  const ids=[data.patient_id,data.from_doctor_id,data.to_doctor_id];
  const {data:profiles}=await supabaseClient.from('profiles').select('id,full_name').in('id',ids);
  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name]));

  const {data:doctorRows}=await supabaseClient.rpc('get_verified_referral_doctors');
  const toDoctor=(doctorRows||[]).find(d=>d.id===data.to_doctor_id)||{};
  const destination=[toDoctor.specialty,toDoctor.hospital_name,toDoctor.clinic_city,toDoctor.clinic_district].filter(Boolean).join(' · ');

  document.getElementById('referralDetailTitle').textContent=data.reason;
  document.getElementById('referralDetailMeta').textContent=
    `${names[data.from_doctor_id]||'Doctor'} → ${names[data.to_doctor_id]||'Doctor'}`;

  const role=currentProfile?.role;
  let actions='';

  if(role==='patient' && data.patient_id===currentUser.id && data.status==='proposed'){
    actions=`<button class="btn secondary" onclick="updateReferralStatus('cancelled')">Cancel referral</button>`;
  } else if(role==='patient' && data.patient_id===currentUser.id && data.status==='accepted'){
    actions=data.urgency==='urgent'
      ? `<div class="referral-next-step urgent-auto">
           <b>Urgent referral accepted</b>
           <span>No patient slot selection is required. The specialist is being prioritized for the earliest possible consultation. If no free slot exists within 2 hours, the care team must coordinate directly.</span>
         </div>
         <button class="btn secondary" onclick="syncReferralAppointment('${data.id}')">Check urgent schedule</button>`
      : `<button class="btn" onclick="bookFromReferral('${data.id}')">Book referred specialist</button>
         <button class="btn secondary" onclick="syncReferralAppointment('${data.id}')">Sync booked appointment</button>
         <button class="btn secondary" onclick="updateReferralStatus('cancelled')">Cancel referral</button>`;
  } else if(role==='patient' && data.patient_id===currentUser.id && data.status==='booked'){
    actions=`<button class="btn" onclick="openLinkedReferralAppointment('${data.booked_appointment_id||''}')">Open booked appointment</button>`;
  } else if(role==='patient' && data.patient_id===currentUser.id && data.status==='appointment_missed'){
    actions=`<div class="referral-next-step missed">
      <b>Specialist appointment missed</b>
      <span>This referral is still active. Book another slot with the same specialist.</span>
    </div>
    <button class="btn" onclick="bookFromReferral('${data.id}')">Rebook specialist</button>`;
  } else if(role==='patient' && data.patient_id===currentUser.id && data.status==='closed_no_show'){
    actions=`<div class="referral-next-step">
      <b>Referral closed after no-show</b>
      <span>The receiving specialist ended this referral after the missed appointment. A new referral is required for another specialist pathway.</span>
    </div>`;
  } else if(role==='patient' && data.patient_id===currentUser.id && data.status==='completed' && !data.booked_appointment_id){
    actions=`<button class="btn" onclick="reopenLegacyReferral('${data.id}')">Reopen referral to book specialist</button>
             <span class="muted">This referral was completed before a specialist appointment was booked.</span>`;
  } else if(role==='doctor' && data.to_doctor_id===currentUser.id && data.status==='patient_approved'){
    actions=`<button class="btn" onclick="updateReferralStatus('accepted')">Accept referral</button>
             <button class="btn secondary" onclick="updateReferralStatus('declined')">Decline</button>`;
  } else if(role==='doctor' && data.to_doctor_id===currentUser.id && data.status==='accepted'){
    actions=data.urgency==='urgent'
      ? `<div class="referral-next-step urgent-auto">
           <b>Urgent referral accepted — no free slot found within 2 hours</b>
           <span>This case should be coordinated urgently outside the normal patient booking flow.</span>
         </div>`
      : `<div class="referral-next-step">
           <b>Waiting for patient booking</b>
           <span>If the patient has already booked and this still says Ready to book, use Sync appointment status.</span>
         </div>
         <button class="btn secondary" onclick="syncReferralAppointment('${data.id}')">Sync appointment status</button>`;
  } else if(role==='doctor' && data.to_doctor_id===currentUser.id && data.status==='booked'){
    actions=`<button class="btn" onclick="openLinkedReferralAppointment('${data.booked_appointment_id||''}')">Open specialist appointment</button>
             <button class="btn secondary" onclick="syncReferralAppointment('${data.id}')">Sync appointment status</button>
             <span class="muted">${data.urgency==='urgent'?'Urgent slot was auto-scheduled by MediBridge. ':''}If this appointment was marked no-show or completed, Sync will repair the referral immediately.</span>`;
  } else if(role==='doctor' && data.to_doctor_id===currentUser.id && data.status==='appointment_missed'){
    actions=`<div class="referral-next-step missed">
      <b>Patient did not attend</b>
      <span>The referral remains active. You may wait for the patient to rebook, or close this referral from your side.</span>
    </div>
    <button class="btn secondary" onclick="closeNoShowReferral('${data.id}')">End referral after no-show</button>`;
  } else if(role==='doctor' && data.to_doctor_id===currentUser.id && data.status==='completed' && !data.booked_appointment_id){
    actions=`<button class="btn" onclick="reopenLegacyReferral('${data.id}')">Continue referral — appointment required</button>
             <span class="muted">This test referral was closed before a specialist appointment was linked. Reopen it, then let the patient book your slot.</span>`;
  }

  document.getElementById('referralDetailCard').innerHTML=`
    <div class="referral-detail-progress">${renderReferralProgress(data.status)}</div>
    <div class="referral-detail-grid">
      <div><small>STATUS</small><p><b>${escapeAdmin(referralStatusLabel(data.status))}</b></p></div>
      <div><small>URGENCY</small><p><span class="referral-urgency ${escapeAdmin(data.urgency||'routine')}">${escapeAdmin(data.urgency||'routine')}</span></p></div>
      <div><small>SPECIALTY</small><p><b>${escapeAdmin(data.specialty_requested||toDoctor.specialty||'Specialist care')}</b></p></div>
      <div><small>REFERRED TO</small><p><b>${escapeAdmin(names[data.to_doctor_id]||'Doctor')}</b></p></div>
    </div>
    ${destination?`<p><b>Care location:</b> ${escapeAdmin(destination)}</p>`:''}
    <p><b>Reason:</b> ${escapeAdmin(data.reason)}</p>
    <p><b>Referral note:</b> ${escapeAdmin(data.note||'Not provided')}</p>
    ${data.booked_at?`<p><b>Booked:</b> ${new Date(data.booked_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</p>`:''}
    <div class="row">${actions}</div>`;

  const patientShare=document.getElementById('patientShareCard');
  patientShare.classList.toggle('hidden',!(role==='patient'&&data.patient_id===currentUser.id&&data.status==='proposed'));

  const sharedCard=document.getElementById('sharedRecordsCard');
  const canSeeShared=(role==='patient') ||
    (role==='doctor' && (data.from_doctor_id===currentUser.id || data.to_doctor_id===currentUser.id));
  sharedCard.classList.toggle('hidden',!canSeeShared);

  if(!patientShare.classList.contains('hidden')) await loadShareableRecords();
  if(!sharedCard.classList.contains('hidden')) await loadSharedReferralRecords();

  window.scrollTo({top:0,behavior:'smooth'});
}

async function bookFromReferral(referralId){
  const {data,error}=await supabaseClient.rpc(
    'get_referral_booking_doctor',
    {target_referral:referralId}
  );

  if(error){
    alert(error.message);
    return;
  }

  const doctor=Array.isArray(data)?data[0]:data;

  if(!doctor?.id){
    alert('The referred specialist is not available for booking.');
    return;
  }

  activeReferralBookingId=referralId;

  const existing=cachedDoctors.findIndex(d=>d.id===doctor.id);
  if(existing>=0)cachedDoctors[existing]={...cachedDoctors[existing],...doctor};
  else cachedDoctors.push({...doctor,distance_km:null});

  await openDoctorBooking(doctor.id);

  if(selectedReferral?.id===referralId){
    document.getElementById('reasonForVisit').value=`Referral: ${selectedReferral.reason||selectedReferral.specialty_requested||'specialist review'}`;
  }
}

async function closeNoShowReferral(referralId){
  if(!confirm('End this referral after the patient no-show? The patient will no longer be able to rebook through this referral.'))return;

  const {error}=await supabaseClient.rpc(
    'close_no_show_referral',
    {target_referral:referralId}
  );

  if(error){
    alert(error.message);
    return;
  }

  toast('Referral closed','This no-show referral has been ended by the receiving doctor.');
  await openReferralDetail(referralId);
}

async function syncReferralAppointment(referralId){
  const {data,error}=await supabaseClient.rpc(
    'sync_referral_appointment',
    {target_referral:referralId}
  );

  if(error){
    alert(error.message);
    return;
  }

  const row=Array.isArray(data)?data[0]:data;
  const status=row?.status||'booked';

  toast(
    'Referral synchronized',
    status==='completed'
      ? 'The completed specialist appointment is linked and the referral is completed.'
      : status==='appointment_missed'
        ? 'The no-show appointment is linked. The referral remains active for rebooking.'
        : 'The specialist appointment is now linked to this referral.'
  );

  await openReferralDetail(referralId);
}

async function reopenLegacyReferral(referralId){
  const {error}=await supabaseClient.rpc(
    'reopen_unbooked_completed_referral',
    {target_referral:referralId}
  );

  if(error){
    alert(error.message);
    return;
  }

  toast('Referral reopened','The patient can now book the receiving specialist.');
  await openReferralDetail(referralId);
}

async function openLinkedReferralAppointment(appointmentId){
  if(!appointmentId){
    alert('Linked appointment not found.');
    return;
  }
  await openAppointmentDetail(appointmentId);
}

async function loadShareableRecords(){
  const {data:appointments,error}=await supabaseClient
    .from('appointments')
    .select('id,appointment_start,doctor_id')
    .eq('patient_id',currentUser.id)
    .eq('status','completed')
    .order('appointment_start',{ascending:false});

  if(error){msg('shareRecordsMessage',error.message,'error');return}

  const box=document.getElementById('shareableRecordList');

  if(!appointments?.length){
    box.innerHTML='<p class="muted">No completed consultation records available to share.</p>';
    return;
  }

  const doctorIds=[...new Set(appointments.map(a=>a.doctor_id))];
  const {data:profiles}=await supabaseClient.from('profiles').select('id,full_name').in('id',doctorIds);
  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name]));

  box.innerHTML=appointments.map(a=>{
    const when=new Date(a.appointment_start).toLocaleDateString('en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'});
    const checked=a.id===selectedReferral.source_appointment_id?'checked':'';
    return `<label class="record-check">
      <input type="checkbox" class="share-record-checkbox" value="${a.id}" ${checked}>
      <span><b>${escapeAdmin(names[a.doctor_id]||'Doctor')}</b><br><span class="muted">${when}</span></span>
    </label>`;
  }).join('');
}

async function approveReferralWithSelectedRecords(){
  if(!selectedReferral || currentProfile?.role!=='patient')return;

  const ids=[...document.querySelectorAll('.share-record-checkbox:checked')].map(x=>x.value);

  if(ids.length){
    const rows=ids.map(id=>({
      referral_id:selectedReferral.id,
      appointment_id:id,
      shared_by:currentUser.id
    }));

    const {error:shareErr}=await supabaseClient
      .from('referral_shared_appointments')
      .upsert(rows);

    if(shareErr){msg('shareRecordsMessage',shareErr.message,'error');return}
  }

  const {error}=await supabaseClient
    .from('referrals')
    .update({status:'patient_approved'})
    .eq('id',selectedReferral.id);

  if(error){msg('shareRecordsMessage',error.message,'error');return}

  selectedReferral.status='patient_approved';
  msg('shareRecordsMessage','Referral approved. The receiving doctor can now view only the records you selected.','success');
  await openReferralDetail(selectedReferral.id);
}

async function updateReferralStatus(status){
  if(!selectedReferral)return;

  if(
    status==='accepted' &&
    selectedReferral.urgency==='urgent' &&
    currentProfile?.role==='doctor' &&
    selectedReferral.to_doctor_id===currentUser.id
  ){
    const {data,error}=await supabaseClient.rpc(
      'accept_urgent_referral',
      {target_referral:selectedReferral.id}
    );

    if(error){
      msg('referralsMessage',error.message,'error');
      return;
    }

    const row=Array.isArray(data)?data[0]:data;

    if(row?.status==='booked'){
      toast(
        'Urgent referral auto-scheduled',
        'MediBridge reserved the earliest free specialist slot within the next 2 hours.'
      );
    }else{
      toast(
        'Urgent referral accepted',
        'No free 20-minute slot was found in the next 2 hours. Urgent manual coordination is required.'
      );
    }

    await openReferralDetail(selectedReferral.id);
    return;
  }

  const {error}=await supabaseClient
    .from('referrals')
    .update({status})
    .eq('id',selectedReferral.id);

  if(error){msg('referralsMessage',error.message,'error');return}

  selectedReferral.status=status;
  toast('Referral updated',status);
  await openReferralDetail(selectedReferral.id);
}

async function loadSharedReferralRecords(){
  if(!selectedReferral)return;

  const {data:links,error:lErr}=await supabaseClient
    .from('referral_shared_appointments')
    .select('appointment_id')
    .eq('referral_id',selectedReferral.id);

  if(lErr){msg('sharedRecordsMessage',lErr.message,'error');return}

  const box=document.getElementById('sharedReferralRecords');

  if(!links?.length){
    box.innerHTML='<p class="muted">No consultation records were shared with this referral.</p>';
    return;
  }

  const ids=links.map(x=>x.appointment_id);

  const {data:consults,error:cErr}=await supabaseClient
    .from('consultations')
    .select('*')
    .in('appointment_id',ids);

  if(cErr){
    box.innerHTML='<p class="muted">Shared records are not available until patient approval.</p>';
    return;
  }

  if(!consults?.length){
    box.innerHTML='<p class="muted">No consultation summaries found for the selected records.</p>';
    return;
  }

  const consultationIds=consults.map(c=>c.id);
  const {data:meds}=await supabaseClient
    .from('prescription_items')
    .select('*')
    .in('consultation_id',consultationIds);

  const medsBy={};
  (meds||[]).forEach(m=>(medsBy[m.consultation_id]??=[]).push(m));

  box.innerHTML=consults.map(c=>`
    <div class="card" style="box-shadow:none">
      <p><b>Diagnosis:</b> ${escapeAdmin(c.diagnosis||'Not recorded')}</p>
      <p><b>Assessment:</b> ${escapeAdmin(c.assessment||'Not recorded')}</p>
      <p><b>Investigations:</b> ${escapeAdmin(c.investigations||'None recorded')}</p>
      <p><b>Advice:</b> ${escapeAdmin(c.advice||'None recorded')}</p>
      <h3>Prescription</h3>
      ${(medsBy[c.id]||[]).length
        ? (medsBy[c.id]||[]).map(m=>`<p>• <b>${escapeAdmin(m.medicine_name)}</b> ${escapeAdmin(m.strength||'')} — ${escapeAdmin([m.dose,m.frequency,m.duration].filter(Boolean).join(' · '))}</p>`).join('')
        : '<p class="muted">No medicines recorded.</p>'}
    </div>`).join('');

  msg('sharedRecordsMessage','');
}


const HOSPITAL_CAPABILITIES=[
  ['trauma','Trauma'],
  ['cardiac','Cardiac'],
  ['stroke','Stroke'],
  ['maternity','Maternity'],
  ['pediatric','Pediatric'],
  ['icu','ICU'],
  ['emergency_surgery','Emergency surgery'],
  ['blood_bank','Blood bank']
];

let emergencyUserLocation=null;

function useHospitalLocation(){
  if(!navigator.geolocation){
    msg('profileMessage','Location is not supported by this browser.','error');
    return;
  }

  const status=document.getElementById('hospitalLocationStatus');
  status.textContent='Detecting location...';

  navigator.geolocation.getCurrentPosition(
    pos=>{
      const lat=pos.coords.latitude;
      const lng=pos.coords.longitude;
      document.getElementById('hospitalLatitude').value=lat;
      document.getElementById('hospitalLongitude').value=lng;
      status.textContent=`GPS captured: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      msg('profileMessage','Hospital GPS location captured. Save the hospital profile to store it.','success');
    },
    err=>{
      status.textContent='Location permission denied or unavailable';
      msg('profileMessage','Could not access location: '+err.message,'error');
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}



function useDoctorClinicLocation(){
  if(!navigator.geolocation){
    msg('profileMessage','Location is not supported by this browser.','error');
    return;
  }

  const status=document.getElementById('doctorLocationStatus');
  status.textContent='Detecting location...';

  navigator.geolocation.getCurrentPosition(
    pos=>{
      const lat=pos.coords.latitude;
      const lng=pos.coords.longitude;
      document.getElementById('doctorLatitude').value=lat;
      document.getElementById('doctorLongitude').value=lng;
      status.textContent=`GPS captured: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      msg('profileMessage','Clinic GPS location captured. Save the doctor profile to store it.','success');
    },
    err=>{
      status.textContent='Location permission denied or unavailable';
      msg('profileMessage','Could not access location: '+err.message,'error');
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}

function openHospitalMapsLink(){
  const url=val('hospitalMapsLink');
  if(!url){
    msg('profileMessage','Paste a Google Maps link first.','error');
    return;
  }
  window.open(url,'_blank','noopener,noreferrer');
}

async function loadPendingHospitals(){
  const box=document.getElementById('pendingHospitals');
  if(!box || currentProfile?.role!=='admin')return;

  const {data:profiles,error:pErr}=await supabaseClient
    .from('profiles')
    .select('id,full_name,phone,verification_status,created_at')
    .eq('role','hospital')
    .eq('verification_status','pending')
    .order('created_at',{ascending:true});

  if(pErr){
    box.innerHTML=`<div class="card"><span class="error">${escapeAdmin(pErr.message)}</span></div>`;
    return;
  }

  if(!profiles?.length){
    box.innerHTML='<div class="card"><b>No pending hospital applications.</b></div>';
    return;
  }

  const ids=profiles.map(p=>p.id);
  const {data:hospitals,error:hErr}=await supabaseClient
    .from('hospital_profiles')
    .select('*')
    .in('id',ids);

  if(hErr){
    box.innerHTML=`<div class="card"><span class="error">${escapeAdmin(hErr.message)}</span></div>`;
    return;
  }

  const hm=Object.fromEntries((hospitals||[]).map(h=>[h.id,h]));

  box.innerHTML=profiles.map(p=>{
    const h=hm[p.id]||{};
    return `<div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${escapeAdmin(h.hospital_name||p.full_name||'Hospital')}</h2>
          <span class="badge">pending</span>
        </div>
      </div>
      <div class="grid" style="margin-top:12px">
        <div><small>ADDRESS</small><p>${escapeAdmin(h.address||'—')}</p></div>
        <div><small>CITY / STATE</small><p>${escapeAdmin([h.city,h.state].filter(Boolean).join(', ')||'—')}</p></div>
        <div><small>EMERGENCY</small><p>${h.emergency_available?'Yes':'No'}</p></div>
        <div><small>COORDINATES</small><p>${h.latitude??'—'}, ${h.longitude??'—'}</p></div>
      </div>
      <div class="row">
        <button class="btn" onclick="setHospitalVerification('${p.id}','verified')">Approve hospital</button>
        <button class="btn secondary" onclick="setHospitalVerification('${p.id}','rejected')">Reject</button>
      </div>
    </div>`;
  }).join('');
}

async function setHospitalVerification(id,status){
  if(!['verified','rejected'].includes(status))return;
  if(!confirm(`${status==='verified'?'Approve':'Reject'} this hospital?`))return;

  const {error}=await supabaseClient
    .from('profiles')
    .update({verification_status:status})
    .eq('id',id)
    .eq('role','hospital');

  if(error){msg('adminMessage',error.message,'error');return}
  toast('Hospital verification updated',status);
  await loadPendingHospitals();
  await loadPendingPharmacies();
  await loadPendingLabs();
}





async function loadClinicalKnowledgePage(){
  const gate=document.getElementById('knowledgeGate');
  const content=document.getElementById('knowledgeContent');

  await loadProfile();

  const allowed=currentProfile?.role==='admin'&&currentProfile?.verification_status==='verified';
  gate.classList.toggle('hidden',allowed);
  content.classList.toggle('hidden',!allowed);
  if(!allowed)return;

  await Promise.all([
    loadMedicalBookLibrary(),
    loadClinicalKnowledgeList()
  ]);
}


const CLINICAL_BOOK_BUCKET='Clinical knowledge documents';

function cleanBookPathPart(value){
  return String(value||'')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80)||'book';
}

function formatBytes(bytes){
  const value=Number(bytes||0);
  if(!value)return '0 B';
  const units=['B','KB','MB','GB'];
  const i=Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1);
  return `${(value/Math.pow(1024,i)).toFixed(i===0?0:1)} ${units[i]}`;
}

function setBookUploadProgress(percent,label){
  const wrap=document.getElementById('medicalBookUploadProgressWrap');
  const bar=document.getElementById('medicalBookUploadBar');
  const pct=document.getElementById('medicalBookUploadPercent');
  const status=document.getElementById('medicalBookUploadStatus');

  wrap?.classList.remove('hidden');
  if(bar)bar.style.width=`${Math.max(0,Math.min(100,percent))}%`;
  if(pct)pct.textContent=`${Math.round(percent)}%`;
  if(status)status.textContent=label||'Uploading…';
}

async function uploadMedicalBook(){
  const bookName=val('medicalBookName');
  const edition=val('medicalBookEdition');
  const input=document.getElementById('medicalBookFile');
  const file=input?.files?.[0];

  if(!bookName||!edition||!file){
    msg('medicalBookMessage','Book name, edition and PDF are required.','error');
    return;
  }

  if(file.type && file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){
    msg('medicalBookMessage','Please choose a PDF file.','error');
    return;
  }

  if(!window.tus?.Upload){
    msg('medicalBookMessage','Large-file uploader did not load. Refresh the page and try again.','error');
    return;
  }

  const {data:{session},error:sessionError}=await supabaseClient.auth.getSession();
  if(sessionError||!session?.access_token){
    msg('medicalBookMessage','Your session has expired. Sign in again.','error');
    return;
  }

  const projectId=new URL(SUPABASE_URL).hostname.split('.')[0];
  const safeBook=cleanBookPathPart(bookName);
  const safeEdition=cleanBookPathPart(edition);
  const random=crypto.randomUUID();
  const objectPath=`books/${safeBook}/${safeEdition}/${random}.pdf`;

  const btn=document.getElementById('medicalBookUploadBtn');
  btn.disabled=true;
  btn.textContent='Uploading…';
  msg('medicalBookMessage','Uploading PDF securely...');
  setBookUploadProgress(0,'Starting resumable upload…');

  try{
    await new Promise((resolve,reject)=>{
      const upload=new window.tus.Upload(file,{
        endpoint:`https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
        retryDelays:[0,1000,3000,5000,10000],
        headers:{
          authorization:`Bearer ${session.access_token}`,
          'x-upsert':'false'
        },
        uploadDataDuringCreation:true,
        removeFingerprintOnSuccess:true,
        metadata:{
          bucketName:CLINICAL_BOOK_BUCKET,
          objectName:objectPath,
          contentType:'application/pdf',
          cacheControl:'3600'
        },
        chunkSize:6*1024*1024,
        onError:error=>reject(error),
        onProgress:(uploaded,total)=>{
          const percent=total?uploaded/total*100:0;
          setBookUploadProgress(percent,'Uploading textbook PDF…');
        },
        onSuccess:()=>resolve()
      });

      upload.findPreviousUploads().then(previous=>{
        if(previous?.length)upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }).catch(()=>upload.start());
    });

    setBookUploadProgress(100,'Upload complete. Saving library record…');

    const {error:insertError}=await supabaseClient
      .from('clinical_source_documents')
      .insert({
        book_name:bookName,
        edition,
        storage_bucket:CLINICAL_BOOK_BUCKET,
        storage_path:objectPath,
        original_file_name:file.name,
        file_size_bytes:file.size,
        mime_type:file.type||'application/pdf',
        processing_status:'uploaded',
        created_by:currentUser.id
      });

    if(insertError){
      // Best effort cleanup if metadata insert fails.
      await supabaseClient.storage.from(CLINICAL_BOOK_BUCKET).remove([objectPath]);
      throw insertError;
    }

    document.getElementById('medicalBookName').value='';
    document.getElementById('medicalBookEdition').value='';
    input.value='';

    msg('medicalBookMessage','Book uploaded successfully. It is stored privately and waiting for the indexing processor.','success');
    toast('Medical book uploaded',`${bookName} — ${edition}`);
    await loadMedicalBookLibrary();
  }catch(error){
    msg('medicalBookMessage',error?.message||'Book upload failed. Please try again.','error');
    setBookUploadProgress(0,'Upload failed');
  }finally{
    btn.disabled=false;
    btn.textContent='Upload book';
  }
}

async function loadMedicalBookLibrary(){
  const box=document.getElementById('medicalBookLibraryList');
  if(!box)return;

  box.innerHTML='<p class="muted">Loading medical book library...</p>';

  const {data,error}=await supabaseClient
    .from('clinical_source_documents')
    .select('id,book_name,edition,original_file_name,file_size_bytes,processing_status,chunk_count,error_message,created_at')
    .order('created_at',{ascending:false})
    .limit(200);

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!data?.length){
    box.innerHTML=`<div class="empty-state">
      <div class="empty-icon">📚</div>
      <h3>No medical books uploaded yet</h3>
      <p class="muted">Add your first PDF using only the book name and edition.</p>
    </div>`;
    return;
  }

  const statusLabels={
    uploaded:'Waiting for indexing',
    processing:'Processing',
    ready:'Ready for AI',
    failed:'Processing failed'
  };

  box.innerHTML=data.map(doc=>`
    <div class="medical-book-row">
      <div class="medical-book-icon">📘</div>
      <div class="medical-book-main">
        <div class="row between">
          <div>
            <b>${escapeAdmin(doc.book_name)}</b>
            <div class="muted">${escapeAdmin(doc.edition)} edition</div>
          </div>
          <span class="timeline-status ${
            doc.processing_status==='ready'
              ? 'success'
              : doc.processing_status==='failed'
                ? 'closed'
                : 'active'
          }">${escapeAdmin(statusLabels[doc.processing_status]||doc.processing_status)}</span>
        </div>
        <div class="medical-book-meta">
          <span>${escapeAdmin(doc.original_file_name||'PDF')}</span>
          <span>${escapeAdmin(formatBytes(doc.file_size_bytes))}</span>
          ${doc.chunk_count?`<span>${Number(doc.chunk_count).toLocaleString()} indexed chunks</span>`:''}
          <span>Uploaded ${escapeAdmin(doctorOverviewDate(doc.created_at,true))}</span>
        </div>
        ${doc.error_message?`<p class="error">${escapeAdmin(doc.error_message)}</p>`:''}
      </div>
    </div>
  `).join('');
}

async function addClinicalKnowledge(){
  const title=val('kbTitle');
  const content=val('kbContent');

  if(!title||!content){
    msg('knowledgeMessage','Source title and approved passage are required.','error');
    return;
  }

  msg('knowledgeMessage','Creating embedding and adding the passage...');

  const {data,error}=await supabaseClient.functions.invoke('clinical-knowledge-ingest',{
    body:{
      title,
      publisher:val('kbPublisher')||null,
      source_url:val('kbUrl')||null,
      topic:val('kbTopic')||null,
      content
    }
  });

  if(error){
    msg('knowledgeMessage',error.message,'error');
    return;
  }

  if(data?.error){
    msg('knowledgeMessage',data.error,'error');
    return;
  }

  ['kbTitle','kbPublisher','kbUrl','kbTopic','kbContent'].forEach(id=>document.getElementById(id).value='');
  msg('knowledgeMessage','Clinical passage added and indexed.','success');
  await loadClinicalKnowledgeList();
}

async function loadClinicalKnowledgeList(){
  const {data,error}=await supabaseClient
    .from('clinical_knowledge_chunks')
    .select('id,title,publisher,source_url,topic,is_active,created_at')
    .order('created_at',{ascending:false})
    .limit(100);

  const box=document.getElementById('clinicalKnowledgeList');

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!data?.length){
    box.innerHTML='<p class="muted">No approved medical passages have been added yet.</p>';
    return;
  }

  box.innerHTML=data.map(x=>`<div class="mini-row">
    <div>
      <b>${escapeAdmin(x.title)}</b>
      <div class="muted">${escapeAdmin([x.publisher,x.topic].filter(Boolean).join(' · '))}</div>
      ${x.source_url?`<a href="${x.source_url}" target="_blank" rel="noopener noreferrer">Source link</a>`:''}
    </div>
    <div class="row">
      <span class="badge">${x.is_active?'active':'inactive'}</span>
      <button class="btn secondary" onclick="toggleClinicalKnowledge('${x.id}',${!x.is_active})">${x.is_active?'Disable':'Enable'}</button>
    </div>
  </div>`).join('');
}

async function toggleClinicalKnowledge(id,isActive){
  const {error}=await supabaseClient
    .from('clinical_knowledge_chunks')
    .update({is_active:isActive})
    .eq('id',id);

  if(error){
    msg('knowledgeMessage',error.message,'error');
    return;
  }

  await loadClinicalKnowledgeList();
}


function renderAiMarkdown(text){
  if(!text)return '';

  const esc=(s)=>String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');

  const inline=(s)=>{
    let x=esc(s);

    // Inline code
    x=x.replace(/`([^`]+)`/g,'<code>$1</code>');

    // Bold
    x=x.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');

    // Source references such as [S1]
    x=x.replace(/\[(S\d+)\]/g,'<span class="source-ref">$1</span>');

    return x;
  };

  const lines=String(text).replace(/\r/g,'').split('\n');
  let out='';
  let inList=false;

  const closeList=()=>{
    if(inList){
      out+='</ul>';
      inList=false;
    }
  };

  for(const raw of lines){
    const line=raw.trimEnd();

    if(!line.trim()){
      closeList();
      continue;
    }

    const h3=line.match(/^###\s+(.+)/);
    const h2=line.match(/^##\s+(.+)/);
    const h1=line.match(/^#\s+(.+)/);
    const bullet=line.match(/^\s*[-*]\s+(.+)/);
    const numbered=line.match(/^\s*\d+\.\s+(.+)/);

    if(h1){
      closeList();
      out+=`<h2>${inline(h1[1])}</h2>`;
    }else if(h2){
      closeList();
      out+=`<h3>${inline(h2[1])}</h3>`;
    }else if(h3){
      closeList();
      out+=`<h4>${inline(h3[1])}</h4>`;
    }else if(bullet || numbered){
      if(!inList){
        out+='<ul>';
        inList=true;
      }
      out+=`<li>${inline((bullet||numbered)[1])}</li>`;
    }else if(line.trim()==='---'){
      closeList();
      out+='<hr>';
    }else{
      closeList();
      out+=`<p>${inline(line)}</p>`;
    }
  }

  closeList();
  return out;
}


let selectedPatientConsultationAppointmentId=null;
let selectedPatientConsultationPayload=null;
let consultationExplanationRequestInFlight=false;
let consultationFollowupRequestInFlight=false;
let doctorPrecompletionReviewInFlight=false;

async function openPatientConsultationExplain(appointmentId){
  selectedPatientConsultationAppointmentId=appointmentId;
  selectedPatientConsultationPayload=null;

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-consultation-explain').classList.add('active');

  await loadConsultationExplainPage();
  window.scrollTo({top:0,behavior:'smooth'});
}

async function loadConsultationExplainPage(){
  const gate=document.getElementById('consultationExplainGate');
  const content=document.getElementById('consultationExplainContent');

  await loadProfile();

  if(
    !currentUser ||
    currentProfile?.role!=='patient' ||
    !selectedPatientConsultationAppointmentId
  ){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  const appointmentId=selectedPatientConsultationAppointmentId;

  const {data:appointment,error:aErr}=await supabaseClient
    .from('appointments')
    .select('id,appointment_start,status,doctor_id,reason_for_visit,consultation_type')
    .eq('id',appointmentId)
    .eq('patient_id',currentUser.id)
    .single();

  if(aErr){
    gate.innerHTML=`<p class="error">${escapeAdmin(aErr.message)}</p>`;
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  if(appointment.status!=='completed'){
    gate.innerHTML='<p class="muted">This explanation is available after the consultation is completed.</p>';
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  const {data:consultation,error:cErr}=await supabaseClient
    .from('consultations')
    .select('*')
    .eq('appointment_id',appointmentId)
    .maybeSingle();

  if(cErr){
    gate.innerHTML=`<p class="error">${escapeAdmin(cErr.message)}</p>`;
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  let prescriptions=[];
  if(consultation?.id){
    const {data:pData,error:pErr}=await supabaseClient
      .from('prescription_items')
      .select('*')
      .eq('consultation_id',consultation.id)
      .order('created_at',{ascending:true});

    if(pErr){
      gate.innerHTML=`<p class="error">${escapeAdmin(pErr.message)}</p>`;
      gate.classList.remove('hidden');
      content.classList.add('hidden');
      return;
    }
    prescriptions=pData||[];
  }

  const {data:doctorProfile}=await supabaseClient
    .from('profiles')
    .select('full_name')
    .eq('id',appointment.doctor_id)
    .maybeSingle();

  selectedPatientConsultationPayload={
    appointment,
    consultation,
    prescriptions,
    doctor_name:doctorProfile?.full_name||'Doctor'
  };

  document.getElementById('doctorSummaryTitle').textContent=
    `${selectedPatientConsultationPayload.doctor_name} — consultation record`;

  document.getElementById('doctorSummaryBody').innerHTML=
    renderDoctorConsultationRecord(selectedPatientConsultationPayload);

  clearConsultationExplanation();

  gate.classList.add('hidden');
  content.classList.remove('hidden');

  await loadConsultationFollowupHistory();
}

function renderDoctorConsultationRecord(payload){
  const a=payload.appointment||{};
  const c=payload.consultation||{};
  const meds=payload.prescriptions||[];

  const when=a.appointment_start
    ? new Date(a.appointment_start).toLocaleString('en-IN',{
        dateStyle:'medium',
        timeStyle:'short',
        timeZone:'Asia/Kolkata'
      })
    : 'Not recorded';

  const medsHtml=meds.length
    ? `<ul>${meds.map(m=>`<li><b>${escapeAdmin(m.medicine_name||'Medicine')}</b>${m.strength?` ${escapeAdmin(m.strength)}`:''}${m.dose?` — ${escapeAdmin(m.dose)}`:''}${m.frequency?` · ${escapeAdmin(m.frequency)}`:''}${m.duration?` · ${escapeAdmin(m.duration)}`:''}${m.instructions?`<br><span class="muted">${escapeAdmin(m.instructions)}</span>`:''}</li>`).join('')}</ul>`
    : '<p class="muted">No prescription items recorded.</p>';

  return `
    <div class="doctor-record-section">
      <p><b>Date:</b> ${escapeAdmin(when)}</p>
      <p><b>Reason for visit:</b> ${escapeAdmin(a.reason_for_visit||'Not recorded')}</p>
    </div>

    <div class="doctor-record-section">
      <h3>Assessment / diagnosis</h3>
      <p><b>Assessment:</b> ${escapeAdmin(c.assessment||'Not recorded')}</p>
      <p><b>Diagnosis:</b> ${escapeAdmin(c.diagnosis||'Not recorded')}</p>
    </div>

    <div class="doctor-record-section">
      <h3>Clinical notes</h3>
      <p>${escapeAdmin(c.clinical_notes||'Not recorded')}</p>
    </div>

    <div class="doctor-record-section">
      <h3>Investigations</h3>
      <p>${escapeAdmin(c.investigations||'Not recorded')}</p>
    </div>

    <div class="doctor-record-section">
      <h3>Prescription</h3>
      ${medsHtml}
    </div>

    <div class="doctor-record-section">
      <h3>Advice</h3>
      <p>${escapeAdmin(c.advice||'Not recorded')}</p>
    </div>

    <div class="doctor-record-section">
      <h3>Follow-up</h3>
      <p><b>Date:</b> ${escapeAdmin(c.follow_up_date||'Not recorded')}</p>
    </div>
  `;
}

async function generateConsultationExplanation(){
  if(!selectedPatientConsultationPayload?.appointment?.id){
    msg('patientConsultationAiMessage','No consultation selected.','error');
    return;
  }

  if(consultationExplanationRequestInFlight){
    return;
  }

  consultationExplanationRequestInFlight=true;

  const btn=document.getElementById('explainConsultationBtn');
  btn.disabled=true;
  btn.textContent='Preparing explanation...';

  msg(
    'patientConsultationAiMessage',
    'Checking for a saved explanation. A new one is generated only if the doctor record has changed.'
  );

  try{
    const {data,error}=await supabaseClient.functions.invoke('medibridge-ai',{
      body:{
        mode:'patient_consultation_explain',
        prompt:'Explain this completed consultation to me fully in simple language.',
        appointment_id:selectedPatientConsultationPayload.appointment.id
      }
    });

    if(error)throw error;
    if(data?.error)throw new Error(data.error);

    document.getElementById('patientConsultationAiAnswer').innerHTML=
      renderAiMarkdown(data.answer||'No explanation generated.');

    const sourceText=data.cached
      ? 'Saved explanation loaded instantly.'
      : 'New complete explanation generated and saved for this consultation.';

    msg(
      'patientConsultationAiMessage',
      `${sourceText} Follow the doctor’s actual instructions if anything differs.`,
      'success'
    );

    btn.textContent='Explanation ready';
  }catch(err){
    msg(
      'patientConsultationAiMessage',
      err?.message||'Could not generate the explanation.',
      'error'
    );
    btn.textContent='Try again';
  }finally{
    consultationExplanationRequestInFlight=false;
    btn.disabled=false;
  }
}

function clearConsultationExplanation(){
  const box=document.getElementById('patientConsultationAiAnswer');
  if(box){
    box.innerHTML='<p class="muted">Tap “Explain in simple words” once. MediBridge saves the explanation for this consultation and reuses it unless the doctor record changes.</p>';
  }
  const btn=document.getElementById('explainConsultationBtn');
  if(btn){
    btn.disabled=false;
    btn.textContent='Explain in simple words';
  }
  consultationExplanationRequestInFlight=false;
  msg('patientConsultationAiMessage','');
}


async function loadConsultationFollowupHistory(){
  const box=document.getElementById('consultationFollowupHistory');
  if(!box)return;

  if(!currentUser || currentProfile?.role!=='patient' || !selectedPatientConsultationAppointmentId){
    box.innerHTML='<p class="muted">No consultation selected.</p>';
    return;
  }

  const {data,error}=await supabaseClient
    .from('patient_consultation_ai_messages')
    .select('id,message_role,message_text,created_at')
    .eq('patient_id',currentUser.id)
    .eq('appointment_id',selectedPatientConsultationAppointmentId)
    .order('created_at',{ascending:true})
    .limit(40);

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  const rows=data||[];
  if(!rows.length){
    box.innerHTML='<p class="muted">No follow-up questions yet.</p>';
    return;
  }

  box.innerHTML=rows.map(row=>{
    const isUser=row.message_role==='user';
    return `
      <div class="consultation-chat-message ${isUser?'patient-message':'assistant-message'}">
        <div class="chat-role">${isUser?'You':'MediBridge AI'}</div>
        <div class="chat-text">${isUser?escapeAdmin(row.message_text):renderAiMarkdown(row.message_text)}</div>
      </div>
    `;
  }).join('');

  box.scrollTop=box.scrollHeight;
}

function clearConsultationFollowupInput(){
  const input=document.getElementById('consultationFollowupQuestion');
  if(input)input.value='';
  msg('consultationFollowupMessage','');
}

async function askQuickConsultationQuestion(question){
  const input=document.getElementById('consultationFollowupQuestion');
  if(input)input.value=question;
  await askConsultationFollowup();
}

async function askConsultationFollowup(){
  if(consultationFollowupRequestInFlight)return;

  if(!selectedPatientConsultationAppointmentId){
    msg('consultationFollowupMessage','No consultation selected.','error');
    return;
  }

  const input=document.getElementById('consultationFollowupQuestion');
  const question=(input?.value||'').trim();

  if(!question){
    msg('consultationFollowupMessage','Type a question first.','error');
    return;
  }

  const btn=document.getElementById('askConsultationFollowupBtn');
  consultationFollowupRequestInFlight=true;
  btn.disabled=true;
  btn.textContent='Thinking...';

  msg('consultationFollowupMessage','Reviewing this consultation and your recent questions...');

  try{
    const {data,error}=await supabaseClient.functions.invoke('medibridge-ai',{
      body:{
        mode:'patient_consultation_question',
        prompt:question,
        appointment_id:selectedPatientConsultationAppointmentId
      }
    });

    if(error)throw error;
    if(data?.error)throw new Error(data.error);

    input.value='';
    await loadConsultationFollowupHistory();

    msg(
      'consultationFollowupMessage',
      'Answered using this consultation record. Follow the doctor’s actual instructions if anything differs.',
      'success'
    );
  }catch(err){
    msg('consultationFollowupMessage',err?.message||'Could not answer this question.','error');
  }finally{
    consultationFollowupRequestInFlight=false;
    btn.disabled=false;
    btn.textContent='Ask about this consultation';
  }
}

let currentAiMode='patient_explain';
let mediBridgeAiChats={};
let mediBridgeAiGenerationStopped=false;
let mediBridgeAiRequestInFlight=false;
let mediBridgeAiAbortController=null;
let currentAiQuickPrompts=[];


function aiConversationKey(){
  return `${currentProfile?.role||'guest'}:${currentAiMode}`;
}

function getAiConversation(){
  const key=aiConversationKey();
  if(!mediBridgeAiChats[key]){
    mediBridgeAiChats[key]=[];
  }
  return mediBridgeAiChats[key];
}

function renderAiChatThread(){
  const box=document.getElementById('aiChatThread');
  if(!box)return;

  const conversation=getAiConversation();
  const visible=conversation;

  if(!visible.length){
    box.innerHTML=`
      <div class="ai-chat-empty">
        <b>MediBridge AI</b>
        <p>Ask a ${currentProfile?.role==='doctor'?'clinical-reference':'health-information'} question. General chat stays in this browser session and is not written to the MediBridge record.</p>
      </div>`;
    return;
  }

  box.innerHTML=visible.map((m,index)=>{
    const user=m.role==='user';
    return `<div class="ai-chat-message ${user?'user':'assistant'}" data-ai-message-index="${index}">
      <div class="ai-chat-role">${user?'You':'MediBridge AI'}</div>
      <div class="ai-chat-text">${user?escapeAdmin(m.content):renderAiMarkdown(m.content)}</div>
      ${user?'':`<div class="ai-message-actions"><button class="ai-message-action" type="button" onclick="copyMediBridgeAiMessage(${index})">Copy answer</button></div>`}
    </div>`;
  }).join('');

  box.scrollTop=box.scrollHeight;
}

function appendStreamingAiBubble(){
  const box=document.getElementById('aiChatThread');
  if(!box)return null;

  if(box.querySelector('.ai-chat-empty'))box.innerHTML='';

  const wrapper=document.createElement('div');
  wrapper.className='ai-chat-message assistant streaming';
  wrapper.innerHTML=`
    <div class="ai-chat-role">MediBridge AI</div>
    <div class="ai-chat-text"><span class="ai-thinking-dots">Thinking…</span></div>`;
  box.appendChild(wrapper);
  box.scrollTop=box.scrollHeight;
  return {
    wrapper,
    text:wrapper.querySelector('.ai-chat-text')
  };
}

const MEDIBRIDGE_AI_QUICK_PROMPTS={
  patient_explain:[
    'Explain high blood pressure in simple words.',
    'Help me understand common terms on a blood test report.',
    'What information should I prepare before a doctor appointment?'
  ],
  patient_questions:[
    'Help me prepare questions about recurring headaches.',
    'What should I ask before starting a newly prescribed medicine?',
    'Help me prepare for a follow-up appointment.'
  ],
  patient_summary:[
    'Summarize my MediBridge record in clear language.'
  ],
  doctor_reference:[
    'Create a concise differential framework for an undifferentiated presentation.',
    'List the safety checks to verify before finalizing this clinical plan.',
    'Summarize what should be confirmed in current local guidelines for this question.'
  ],
  doctor_patient_review:[
    'Review the consented record and identify unanswered clinical questions.'
  ]
};

function renderAiQuickPrompts(){
  const box=document.getElementById('aiQuickPrompts');
  if(!box)return;

  currentAiQuickPrompts=MEDIBRIDGE_AI_QUICK_PROMPTS[currentAiMode]||[];
  box.innerHTML=currentAiQuickPrompts.map((prompt,index)=>
    `<button class="ai-quick-prompt" type="button" onclick="useMediBridgeAiQuickPrompt(${index})">${escapeAdmin(prompt)}</button>`
  ).join('');
}

function useMediBridgeAiQuickPrompt(index){
  const prompt=currentAiQuickPrompts[index];
  const input=document.getElementById('aiPrompt');
  if(!prompt||!input)return;
  input.value=prompt;
  input.focus();
}

function updateAiUrgencyBanner(meta){
  const banner=document.getElementById('aiUrgencyBanner');
  if(!banner)return;
  banner.classList.toggle('hidden',!meta?.urgent);
}

function clearAiUrgencyBanner(){
  updateAiUrgencyBanner({urgent:false});
}

function setAiMode(mode,btn){
  currentAiMode=mode;
  document.querySelectorAll('.ai-mode-tabs button').forEach(x=>x.classList.remove('active'));
  if(btn)btn.classList.add('active');

  const patientLabel=document.getElementById('doctorAiPatientLabel');
  if(patientLabel)patientLabel.classList.toggle('hidden',mode!=='doctor_patient_review');

  const prompt=document.getElementById('aiPrompt');
  const placeholders={
    patient_explain:'Example: What does high blood pressure mean?',
    patient_questions:'Example: What should I ask my doctor about recurring headaches?',
    patient_summary:'Secure record summary uses the existing MediBridge backend.',
    doctor_reference:'Example: Summarize the key guideline considerations for this clinical question.',
    doctor_patient_review:'Secure consented-patient review uses the existing MediBridge backend.'
  };

  prompt.placeholder=placeholders[mode]||'Ask MediBridge AI...';
  renderAiQuickPrompts();
  clearAiUrgencyBanner();
  renderAiChatThread();
  msg('aiMessage','');
}

async function updateAiProviderStatus(){
  const label=document.getElementById('aiProviderLabel');
  const status=document.getElementById('aiProviderStatus');
  const stateBadge=document.getElementById('aiProviderStateBadge');
  if(!label||!status)return;

  const service=window.MediBridgeAI;
  const enabled=Boolean(service?.isEnabled?.());

  label.textContent='MediBridge AI';

  if(!enabled){
    status.textContent='AI is disabled. The rest of MediBridge remains available.';
    if(stateBadge){
      stateBadge.textContent='Disabled';
      stateBadge.className='ai-status-pill unavailable';
    }
    return;
  }

  status.textContent='Checking the secure AI gateway...';
  if(stateBadge){
    stateBadge.textContent='Checking';
    stateBadge.className='ai-status-pill checking';
  }

  const gateway=await service?.getStatus?.();
  const gatewayStatus=gateway?.status||'unavailable';

  if(gatewayStatus==='ready'){
    label.textContent='MediBridge AI Core';
    status.textContent=`Connected through the secure gateway · ${gateway.provider||'configured provider'} · ${gateway.model||'configured model'}.`;
    if(stateBadge){
      stateBadge.textContent='Ready';
      stateBadge.className='ai-status-pill ready';
    }
  }else if(gatewayStatus==='configuration_required'){
    status.textContent='The AI gateway is installed but its private environment variables still need to be configured.';
    if(stateBadge){
      stateBadge.textContent='Setup needed';
      stateBadge.className='ai-status-pill configuration_required';
    }
  }else{
    status.textContent='The AI gateway could not be reached. Other MediBridge features remain available.';
    if(stateBadge){
      stateBadge.textContent='Unavailable';
      stateBadge.className='ai-status-pill unavailable';
    }
  }
}

async function loadAiPage(){
  const gate=document.getElementById('aiGate');
  const content=document.getElementById('aiContent');

  await loadProfile();

  const role=currentProfile?.role;
  const allowed=role==='patient'||(role==='doctor'&&currentProfile?.verification_status==='verified');

  gate.classList.toggle('hidden',allowed);
  content.classList.toggle('hidden',!allowed);
  if(!allowed)return;

  const patientControls=document.getElementById('patientAiControls');
  const doctorControls=document.getElementById('doctorAiControls');

  patientControls.classList.toggle('hidden',role!=='patient');
  doctorControls.classList.toggle('hidden',role!=='doctor');

  if(role==='patient'){
    document.getElementById('aiPageTitle').textContent='Patient AI';
    document.getElementById('aiPageSubtitle').textContent='General health explanations, care navigation and better questions for your clinician.';
    document.getElementById('aiSafetyText').textContent='This assistant provides general information and does not replace a clinician or emergency care.';
    currentAiMode='patient_explain';
    setAiMode('patient_explain',document.querySelector('[data-ai-mode="patient_explain"]'));
  }else{
    document.getElementById('aiPageTitle').textContent='Doctor AI';
    document.getElementById('aiPageSubtitle').textContent='Clinical reference and second-look support. Patient-specific data remains consent-controlled.';
    document.getElementById('aiSafetyText').textContent='AI output requires clinician verification. Do not use it as autonomous clinical decision-making.';
    currentAiMode='doctor_reference';
    setAiMode('doctor_reference',document.querySelector('[data-ai-mode="doctor_reference"]'));
    await loadAiConsentedPatients();
  }

  await updateAiProviderStatus();
  renderAiChatThread();

  const prompt=document.getElementById('aiPrompt');
  if(prompt && !prompt.dataset.aiEnterBound){
    prompt.dataset.aiEnterBound='1';
    prompt.addEventListener('keydown',e=>{
      if(e.key==='Enter' && !e.shiftKey){
        e.preventDefault();
        askMediBridgeAI();
      }
    });
  }
}

async function loadAiConsentedPatients(){
  const select=document.getElementById('doctorAiPatientSelect');
  if(!select || !currentUser)return;

  const {data:consents,error}=await supabaseClient
    .from('record_consents')
    .select('*')
    .eq('doctor_id',currentUser.id)
    .eq('status','active')
    .order('granted_at',{ascending:false});

  if(error){
    select.innerHTML='<option value="">Could not load patients</option>';
    return;
  }

  const active=(consents||[]).filter(c=>!c.expires_at||new Date(c.expires_at).getTime()>Date.now());
  const ids=[...new Set(active.map(c=>c.patient_id))];

  if(!ids.length){
    select.innerHTML='<option value="">No active patient consent</option>';
    return;
  }

  const {data:profiles}=await supabaseClient
    .from('profiles')
    .select('id,full_name')
    .in('id',ids);

  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name]));
  select.innerHTML=ids.map(id=>`<option value="${id}">${escapeAdmin(names[id]||'Patient')}</option>`).join('');
}

async function askSecureBackendAi(prompt,patientId){
  const {data,error}=await supabaseClient.functions.invoke('medibridge-ai',{
    body:{
      mode:currentAiMode,
      prompt,
      patient_id:patientId,
      use_clinical_knowledge: currentProfile?.role==='doctor'
        ? Boolean(document.getElementById('useClinicalKnowledge')?.checked)
        : false
    }
  });

  if(error)throw error;
  if(data?.error)throw new Error(data.error);
  return data;
}

async function askMediBridgeAI(){
  if(mediBridgeAiRequestInFlight)return;

  const input=document.getElementById('aiPrompt');
  const prompt=input.value.trim();
  const patientId=currentAiMode==='doctor_patient_review'
    ? document.getElementById('doctorAiPatientSelect')?.value||null
    : null;

  if(currentAiMode!=='patient_summary' && !prompt){
    msg('aiMessage','Enter a question or request.','error');
    return;
  }

  if(currentAiMode==='doctor_patient_review' && !patientId){
    msg('aiMessage','Choose a patient with active consent.','error');
    return;
  }

  const secureBackendMode=window.MediBridgeAI?.isSecureBackendMode?.(currentAiMode);

  if(!secureBackendMode && !window.MediBridgeAI?.isEnabled?.()){
    msg('aiMessage','MediBridge AI is currently disabled. Other MediBridge features are still available.','error');
    return;
  }

  const btn=document.getElementById('aiAskBtn');
  const stopBtn=document.getElementById('aiStopBtn');

  mediBridgeAiRequestInFlight=true;
  mediBridgeAiGenerationStopped=false;
  btn.disabled=true;
  btn.textContent='Sending…';
  stopBtn.classList.toggle('hidden',secureBackendMode);
  mediBridgeAiAbortController=secureBackendMode?null:new AbortController();
  clearAiUrgencyBanner();

  try{
    if(secureBackendMode){
      msg('aiMessage','Using the existing consent-aware MediBridge backend for record-specific assistance...');

      const userText=prompt || (
        currentAiMode==='patient_summary'
          ? 'Summarize my MediBridge record in clear language.'
          : 'Review the consented patient record.'
      );

      const conversation=getAiConversation();
      conversation.push({role:'user',content:userText});
      renderAiChatThread();

      const data=await askSecureBackendAi(prompt,patientId);

      conversation.push({
        role:'assistant',
        content:data.answer||'No response generated.'
      });
      renderAiChatThread();

      const sourcesBox=document.getElementById('aiSources');
      const answerCard=document.getElementById('aiAnswerCard');

      if(data.sources?.length){
        answerCard.classList.remove('hidden');
        sourcesBox.classList.remove('hidden');
        sourcesBox.innerHTML='<h3>Clinical sources used</h3>'+
          data.sources.map(s=>`<div class="source-item">
            <div class="source-title-row">
              <span class="source-chip">${escapeAdmin(s.id)}</span>
              <div>
                <b>${escapeAdmin(s.title||'Source')}</b>
                ${s.publisher?`<span class="muted"> — ${escapeAdmin(s.publisher)}</span>`:''}
              </div>
            </div>
            <div class="source-meta">
              ${s.retrieval_method?`<span class="badge subtle">${escapeAdmin(s.retrieval_method)}</span>`:''}
              ${s.source_url?`<a href="${s.source_url}" target="_blank" rel="noopener noreferrer">Open source ↗</a>`:''}
            </div>
          </div>`).join('');
      }else{
        answerCard.classList.add('hidden');
        sourcesBox.classList.add('hidden');
        sourcesBox.innerHTML='';
      }

      input.value='';
      msg('aiMessage','Secure record-specific response generated. Verify important clinical information before use.','success');
      return;
    }

    const conversation=getAiConversation();
    conversation.push({role:'user',content:prompt});
    input.value='';
    renderAiChatThread();

    const streamingBubble=appendStreamingAiBubble();
    msg('aiMessage','Generating a secure response...');

    const result=await window.MediBridgeAI.chatWithAI({
      messages:conversation,
      assistantType: currentProfile?.role==='doctor' ? 'doctor' : 'patient',
      mode:currentAiMode,
      signal:mediBridgeAiAbortController?.signal,
      onMeta:meta=>updateAiUrgencyBanner(meta),
      onToken:(_delta,fullText)=>{
        if(!streamingBubble?.text)return;
        streamingBubble.text.classList.add('ai-stream-cursor');
        streamingBubble.text.innerHTML=renderAiMarkdown(fullText);
        const box=document.getElementById('aiChatThread');
        if(box)box.scrollTop=box.scrollHeight;
      }
    });

    if(streamingBubble?.text){
      streamingBubble.text.classList.remove('ai-stream-cursor');
      streamingBubble.text.innerHTML=renderAiMarkdown(result?.text||'');
      const box=document.getElementById('aiChatThread');
      if(box)box.scrollTop=box.scrollHeight;
    }

    const text=(result?.text||'').trim();

    if(mediBridgeAiGenerationStopped){
      if(text){
        conversation.push({
          role:'assistant',
          content:text + '\n\n[Generation stopped by user.]'
        });
      }
      renderAiChatThread();
      msg('aiMessage','Generation stopped.','');
      return;
    }

    if(!text)throw new Error('The AI provider returned an empty response.');

    conversation.push({role:'assistant',content:text});
    renderAiChatThread();

    updateAiUrgencyBanner(result);
    msg(
      'aiMessage',
      result?.urgent
        ? 'Emergency guidance shown. Do not delay professional help.'
        : 'Response generated. Verify important medical information before use.',
      result?.urgent?'error':'success'
    );
  }catch(err){
    renderAiChatThread();

    if(err?.name==='AbortError'){
      msg('aiMessage','Generation stopped.','');
      return;
    }

    const raw=String(err?.message||'AI request failed.');
    let friendly='MediBridge AI could not complete the request. Please try again.';

    if(/load|undefined|not available/i.test(raw)){
      friendly='MediBridge AI is temporarily unavailable. Please try again.';
    }else if(/auth|sign.?in|permission|unauthor/i.test(raw)){
      friendly='The AI provider needs authorization before this request can continue.';
    }else if(/network|fetch|connection/i.test(raw)){
      friendly='Network connection to the AI provider failed. Check your connection and try again.';
    }else if(/model/i.test(raw)){
      friendly='MediBridge AI is temporarily unavailable. Please try again.';
    }

    msg('aiMessage',friendly,'error');
  }finally{
    mediBridgeAiRequestInFlight=false;
    mediBridgeAiGenerationStopped=false;
    mediBridgeAiAbortController=null;
    btn.disabled=false;
    btn.textContent='Send';
    stopBtn.classList.add('hidden');
  }
}

function stopMediBridgeAiGeneration(){
  if(!mediBridgeAiRequestInFlight)return;
  mediBridgeAiGenerationStopped=true;
  mediBridgeAiAbortController?.abort();
  msg('aiMessage','Stopping generation...');
}

function newMediBridgeAiChat(){
  if(mediBridgeAiRequestInFlight){
    mediBridgeAiGenerationStopped=true;
    mediBridgeAiAbortController?.abort();
  }
  mediBridgeAiChats[aiConversationKey()]=[];

  const input=document.getElementById('aiPrompt');
  if(input)input.value='';

  const sourcesBox=document.getElementById('aiSources');
  if(sourcesBox){
    sourcesBox.innerHTML='';
    sourcesBox.classList.add('hidden');
  }

  document.getElementById('aiAnswerCard')?.classList.add('hidden');
  clearAiUrgencyBanner();
  renderAiChatThread();
  msg('aiMessage','New chat started.','success');
}

async function copyMediBridgeAiMessage(index){
  const message=getAiConversation()[index];
  if(!message||message.role!=='assistant')return;

  try{
    await navigator.clipboard.writeText(message.content);
    msg('aiMessage','Answer copied.','success');
  }catch(_){
    msg('aiMessage','Could not copy the answer on this device.','error');
  }
}

async function copyLastMediBridgeAiAnswer(){
  const conversation=getAiConversation();
  for(let index=conversation.length-1;index>=0;index--){
    if(conversation[index].role==='assistant'){
      await copyMediBridgeAiMessage(index);
      return;
    }
  }
  msg('aiMessage','No AI answer to copy yet.','error');
}

function exportMediBridgeAiChat(){
  const conversation=getAiConversation();
  if(!conversation.length){
    msg('aiMessage','No chat to export yet.','error');
    return;
  }

  const title=`MediBridge AI · ${currentAiMode.replaceAll('_',' ')}`;
  const content=[
    title,
    `Exported: ${new Date().toLocaleString('en-IN')}`,
    '',
    ...conversation.map(message=>
      `${message.role==='user'?'YOU':'MEDIBRIDGE AI'}\n${message.content}\n`
    ),
    'Important: This AI-generated information may be incomplete or incorrect and does not replace professional medical care.'
  ].join('\n');

  const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=`medibridge-ai-${currentAiMode}-${new Date().toISOString().slice(0,10)}.txt`;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  msg('aiMessage','Chat exported to this device.','success');
}

function clearAiAnswer(){
  newMediBridgeAiChat();
}


const CONSENT_SCOPE_LABELS={
  consultations:'Consultations',
  prescriptions:'Prescriptions',
  appointment_files:'Uploaded reports/files',
  referrals:'Referrals',
  emergency_summary:'Emergency summary',
  health_profile:'Structured health profile',
  vitals:'Vitals'
};

let selectedConsentedPatient=null;

async function loadConsentPage(){
  const gate=document.getElementById('consentGate'),
        content=document.getElementById('consentContent');

  await loadProfile();

  if(!currentUser || currentProfile?.role!=='patient'){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');

  await Promise.all([
    loadPendingAccessRequests(),
    loadConsentDoctorOptions(),
    loadActiveConsents(),
    loadRecordAccessHistory()
  ]);
}

async function loadConsentDoctorOptions(){
  const {data:profiles,error:pErr}=await supabaseClient
    .from('profiles')
    .select('id,full_name')
    .eq('role','doctor')
    .eq('verification_status','verified');

  if(pErr){
    msg('consentMessage',pErr.message,'error');
    return;
  }

  if(!profiles?.length){
    document.getElementById('consentDoctorSelect').innerHTML=
      '<option value="">No verified doctors available</option>';
    return;
  }

  const ids=profiles.map(p=>p.id);
  const {data:doctors,error:dErr}=await supabaseClient
    .from('doctor_profiles')
    .select('id,specialty,hospital_name')
    .in('id',ids);

  if(dErr){
    msg('consentMessage',dErr.message,'error');
    return;
  }

  const dm=Object.fromEntries((doctors||[]).map(d=>[d.id,d]));
  document.getElementById('consentDoctorSelect').innerHTML=
    profiles.map(p=>{
      const d=dm[p.id]||{};
      return `<option value="${p.id}">${escapeAdmin(p.full_name||'Doctor')} — ${escapeAdmin(d.specialty||'General')}${d.hospital_name?' · '+escapeAdmin(d.hospital_name):''}</option>`;
    }).join('');
}

async function grantDoctorConsent(){
  const doctorId=document.getElementById('consentDoctorSelect').value;
  const scopes=[...document.querySelectorAll('.consent-scope:checked')].map(x=>x.value);
  const duration=Number(document.getElementById('consentDuration').value||0);

  if(!doctorId){
    msg('consentMessage','Choose a doctor.','error');
    return;
  }

  if(!scopes.length){
    msg('consentMessage','Choose at least one record type.','error');
    return;
  }

  const expiresAt=duration>0
    ? new Date(Date.now()+duration*60*60*1000).toISOString()
    : null;

  // revoke old active consent for same doctor first
  await supabaseClient
    .from('record_consents')
    .update({status:'revoked',revoked_at:new Date().toISOString()})
    .eq('patient_id',currentUser.id)
    .eq('doctor_id',doctorId)
    .eq('status','active');

  const {error}=await supabaseClient
    .from('record_consents')
    .insert({
      patient_id:currentUser.id,
      doctor_id:doctorId,
      scopes,
      expires_at:expiresAt,
      status:'active'
    });

  if(error){
    msg('consentMessage',error.message,'error');
    return;
  }

  msg('consentMessage','Access granted successfully. You can revoke it at any time.','success');
  await loadActiveConsents();
}

async function loadActiveConsents(){
  const {data,error}=await supabaseClient
    .from('record_consents')
    .select('*')
    .eq('patient_id',currentUser.id)
    .order('granted_at',{ascending:false});

  const box=document.getElementById('activeConsents');

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!data?.length){
    box.innerHTML='<p class="muted">You have not granted record access to any doctor yet.</p>';
    return;
  }

  const ids=[...new Set(data.map(x=>x.doctor_id))];
  const {data:profiles}=await supabaseClient
    .from('profiles')
    .select('id,full_name')
    .in('id',ids);

  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name]));

  box.innerHTML=data.map(c=>{
    const now=Date.now();
    const expired=c.expires_at && new Date(c.expires_at).getTime()<=now;
    const effective=expired && c.status==='active'?'expired':c.status;
    const scopeLabels=(c.scopes||[]).map(s=>CONSENT_SCOPE_LABELS[s]||s).join(', ');
    const expires=c.expires_at
      ? new Date(c.expires_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})
      : 'Until revoked';

    return `<div class="mini-row">
      <div>
        <b>${escapeAdmin(names[c.doctor_id]||'Doctor')}</b>
        <div class="muted">${escapeAdmin(scopeLabels||'No scopes')}</div>
        <small>Expires: ${escapeAdmin(expires)}</small>
      </div>
      <div class="row">
        <span class="badge">${escapeAdmin(effective)}</span>
        ${effective==='active'
          ? `<button class="btn secondary" onclick="revokeConsent('${c.id}')">Revoke</button>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

async function revokeConsent(id){
  if(!confirm('Revoke this doctor’s record access?'))return;

  const {error}=await supabaseClient
    .from('record_consents')
    .update({
      status:'revoked',
      revoked_at:new Date().toISOString()
    })
    .eq('id',id)
    .eq('patient_id',currentUser.id);

  if(error){
    msg('consentMessage',error.message,'error');
    return;
  }

  toast('Access revoked','The doctor can no longer use this consent.');
  await loadActiveConsents();
}

async function loadRecordAccessHistory(){
  const {data,error}=await supabaseClient
    .from('record_access_log')
    .select('*')
    .eq('patient_id',currentUser.id)
    .order('accessed_at',{ascending:false})
    .limit(100);

  const box=document.getElementById('recordAccessHistory');

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!data?.length){
    box.innerHTML='<p class="muted">No recorded access events yet.</p>';
    return;
  }

  const ids=[...new Set(data.map(x=>x.accessor_id))];
  const {data:profiles}=await supabaseClient
    .from('profiles')
    .select('id,full_name,role')
    .in('id',ids);

  const pm=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));

  box.innerHTML=data.map(x=>{
    const who=pm[x.accessor_id];
    const when=new Date(x.accessed_at).toLocaleString('en-IN',{
      dateStyle:'medium',
      timeStyle:'short',
      timeZone:'Asia/Kolkata'
    });
    return `<div class="mini-row">
      <div>
        <b>${escapeAdmin(who?.full_name||'Account')}</b>
        <div class="muted">${escapeAdmin(CONSENT_SCOPE_LABELS[x.access_type]||x.access_type)} · ${escapeAdmin(x.source)}</div>
      </div>
      <small>${when}</small>
    </div>`;
  }).join('');
}

async function loadDoctorConsentedPatients(){
  const box=document.getElementById('doctorConsentedPatients');
  if(!box || !currentUser || currentProfile?.role!=='doctor')return;

  const {data,error}=await supabaseClient
    .from('record_consents')
    .select('*')
    .eq('doctor_id',currentUser.id)
    .eq('status','active')
    .order('granted_at',{ascending:false});

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  const active=(data||[]).filter(c=>
    !c.expires_at || new Date(c.expires_at).getTime()>Date.now()
  );

  if(!active.length){
    box.innerHTML='<p class="muted">No patients currently share records with you.</p>';
    return;
  }

  const patientIds=[...new Set(active.map(c=>c.patient_id))];
  const {data:profiles}=await supabaseClient
    .from('profiles')
    .select('id,full_name')
    .in('id',patientIds);

  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name]));

  box.innerHTML=active.map(c=>{
    const labels=(c.scopes||[]).map(s=>CONSENT_SCOPE_LABELS[s]||s).join(', ');
    return `<div class="mini-row">
      <div>
        <b>${escapeAdmin(names[c.patient_id]||'Patient')}</b>
        <div class="muted">${escapeAdmin(labels)}</div>
      </div>
      <button class="btn" onclick="openConsentedPatientRecord('${c.patient_id}','${c.id}')">Open record</button>
    </div>`;
  }).join('');
}

async function openConsentedPatientRecord(patientId,consentId){
  selectedConsentedPatient={patientId,consentId};

  const {data:consent,error:cErr}=await supabaseClient
    .from('record_consents')
    .select('*')
    .eq('id',consentId)
    .single();

  if(cErr){
    msg('sharedPatientMessage',cErr.message,'error');
    return;
  }

  const valid=consent.status==='active' &&
    (!consent.expires_at || new Date(consent.expires_at).getTime()>Date.now());

  if(!valid){
    msg('sharedPatientMessage','This consent is no longer active.','error');
    return;
  }

  const {data:profile}=await supabaseClient
    .from('profiles')
    .select('full_name')
    .eq('id',patientId)
    .single();

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-shared-patient-records').classList.add('active');

  document.getElementById('sharedPatientTitle').textContent=profile?.full_name||'Patient record';
  document.getElementById('sharedPatientMeta').textContent='Only record types currently consented to by the patient are shown.';
  document.getElementById('sharedConsentSummary').innerHTML=
    `<p><b>Allowed:</b> ${escapeAdmin((consent.scopes||[]).map(s=>CONSENT_SCOPE_LABELS[s]||s).join(', '))}</p>`+
    `<p><b>Expires:</b> ${consent.expires_at?new Date(consent.expires_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}):'Until revoked'}</p>`;

  await supabaseClient.rpc('log_record_access',{
    target_patient:patientId,
    requested_scope:'record_overview',
    source_name:'consent',
    source_reference:consentId
  });

  await loadConsentedRecordSections(patientId,consent);
  window.scrollTo({top:0,behavior:'smooth'});
}

async function loadConsentedRecordSections(patientId,consent){
  const box=document.getElementById('sharedPatientRecordList');
  box.innerHTML='';
  const scopes=new Set(consent.scopes||[]);

  if(scopes.has('consultations')){
    await supabaseClient.rpc('log_record_access',{
      target_patient:patientId,
      requested_scope:'consultations',
      source_name:'consent',
      source_reference:consent.id
    });

    const {data:appts,error:aErr}=await supabaseClient
      .from('appointments')
      .select('id,appointment_start,doctor_id,status')
      .eq('patient_id',patientId)
      .eq('status','completed')
      .order('appointment_start',{ascending:false});

    if(aErr){
      box.innerHTML+=`<div class="card"><h2>Consultations</h2><p class="error">${escapeAdmin(aErr.message)}</p></div>`;
    }else{
      const ids=(appts||[]).map(a=>a.id);
      let consults=[];
      if(ids.length){
        const {data}=await supabaseClient.from('consultations').select('*').in('appointment_id',ids);
        consults=data||[];
      }

      box.innerHTML+=`<div class="card"><h2>Consultations</h2>${
        consults.length
          ? consults.map(c=>`<div class="record-block"><p><b>Diagnosis:</b> ${escapeAdmin(c.diagnosis||'Not recorded')}</p><p><b>Assessment:</b> ${escapeAdmin(c.assessment||'Not recorded')}</p><p><b>Advice:</b> ${escapeAdmin(c.advice||'Not recorded')}</p><button class="btn secondary" onclick="openPatientConsultationExplain('${c.appointment_id}')">Doctor + AI explanation</button></div>`).join('')
          : '<p class="muted">No completed consultation summaries available.</p>'
      }</div>`;
    }
  }

  if(scopes.has('prescriptions')){
    await supabaseClient.rpc('log_record_access',{
      target_patient:patientId,
      requested_scope:'prescriptions',
      source_name:'consent',
      source_reference:consent.id
    });

    const {data:consults}=await supabaseClient
      .from('consultations')
      .select('id')
      .eq('patient_id',patientId);

    const ids=(consults||[]).map(c=>c.id);
    let meds=[];
    if(ids.length){
      const {data}=await supabaseClient.from('prescription_items').select('*').in('consultation_id',ids);
      meds=data||[];
    }

    box.innerHTML+=`<div class="card"><h2>Prescriptions</h2>${
      meds.length
        ? meds.map(m=>`<p>• <b>${escapeAdmin(m.medicine_name)}</b> ${escapeAdmin(m.strength||'')} — ${escapeAdmin([m.dose,m.frequency,m.duration].filter(Boolean).join(' · '))}</p>`).join('')
        : '<p class="muted">No prescription items available.</p>'
    }</div>`;
  }

  if(scopes.has('referrals')){
    await supabaseClient.rpc('log_record_access',{
      target_patient:patientId,
      requested_scope:'referrals',
      source_name:'consent',
      source_reference:consent.id
    });

    const {data:refs}=await supabaseClient
      .from('referrals')
      .select('*')
      .eq('patient_id',patientId)
      .order('created_at',{ascending:false});

    box.innerHTML+=`<div class="card"><h2>Referrals</h2>${
      refs?.length
        ? refs.map(r=>`<p><b>${escapeAdmin(r.reason)}</b> · ${escapeAdmin(r.status)}<br><span class="muted">${escapeAdmin(r.note||'')}</span></p>`).join('')
        : '<p class="muted">No referrals available.</p>'
    }</div>`;
  }

  if(scopes.has('appointment_files')){
    await supabaseClient.rpc('log_record_access',{
      target_patient:patientId,
      requested_scope:'appointment_files',
      source_name:'consent',
      source_reference:consent.id
    });

    const {data:appts}=await supabaseClient
      .from('appointments')
      .select('id')
      .eq('patient_id',patientId);

    const ids=(appts||[]).map(a=>a.id);
    let files=[];
    if(ids.length){
      const {data}=await supabaseClient
        .from('appointment_files')
        .select('*')
        .in('appointment_id',ids)
        .order('created_at',{ascending:false});
      files=data||[];
    }

    box.innerHTML+=`<div class="card"><h2>Reports / files</h2>${
      files.length
        ? files.map(f=>`<div class="mini-row"><div><b>${escapeAdmin(f.file_name)}</b></div><button class="btn secondary" onclick="openConsentedFile('${f.file_path.replace(/'/g,"\\'")}','${patientId}','${consent.id}')">Open</button></div>`).join('')
        : '<p class="muted">No shared appointment files available.</p>'
    }</div>`;
  }


  if(scopes.has('health_profile')){
    await supabaseClient.rpc('log_record_access',{
      target_patient:patientId,
      requested_scope:'health_profile',
      source_name:'consent',
      source_reference:consent.id
    });

    const [allergies,conditions,medications,surgeries,immunizations,family]=await Promise.all([
      supabaseClient.from('patient_allergies').select('*').eq('patient_id',patientId),
      supabaseClient.from('patient_conditions').select('*').eq('patient_id',patientId),
      supabaseClient.from('patient_medications').select('*').eq('patient_id',patientId),
      supabaseClient.from('patient_surgeries').select('*').eq('patient_id',patientId),
      supabaseClient.from('patient_immunizations').select('*').eq('patient_id',patientId),
      supabaseClient.from('patient_family_history').select('*').eq('patient_id',patientId)
    ]);

    box.innerHTML+=`<div class="card"><h2>Structured health profile</h2>
      <h3>Allergies</h3>${(allergies.data||[]).length?(allergies.data||[]).map(x=>`<p>• <b>${escapeAdmin(x.allergen)}</b> ${escapeAdmin(x.reaction||'')} ${x.severity?'· '+escapeAdmin(x.severity):''}</p>`).join(''):'<p class="muted">None recorded.</p>'}
      <h3>Conditions</h3>${(conditions.data||[]).length?(conditions.data||[]).map(x=>`<p>• <b>${escapeAdmin(x.condition_name)}</b> · ${escapeAdmin(x.status||'')}</p>`).join(''):'<p class="muted">None recorded.</p>'}
      <h3>Current medications</h3>${(medications.data||[]).length?(medications.data||[]).map(x=>`<p>• <b>${escapeAdmin(x.medicine_name)}</b> ${escapeAdmin([x.strength,x.dose,x.frequency].filter(Boolean).join(' · '))}</p>`).join(''):'<p class="muted">None recorded.</p>'}
      <h3>Surgeries</h3>${(surgeries.data||[]).length?(surgeries.data||[]).map(x=>`<p>• ${escapeAdmin(x.procedure_name)} ${x.procedure_date?'· '+escapeAdmin(x.procedure_date):''}</p>`).join(''):'<p class="muted">None recorded.</p>'}
      <h3>Immunizations</h3>${(immunizations.data||[]).length?(immunizations.data||[]).map(x=>`<p>• ${escapeAdmin(x.vaccine_name)} ${x.administered_on?'· '+escapeAdmin(x.administered_on):''}</p>`).join(''):'<p class="muted">None recorded.</p>'}
      <h3>Family history</h3>${(family.data||[]).length?(family.data||[]).map(x=>`<p>• ${escapeAdmin(x.relation)} — ${escapeAdmin(x.condition_name)}</p>`).join(''):'<p class="muted">None recorded.</p>'}
    </div>`;
  }

  if(scopes.has('vitals')){
    await supabaseClient.rpc('log_record_access',{
      target_patient:patientId,
      requested_scope:'vitals',
      source_name:'consent',
      source_reference:consent.id
    });

    const {data:vitals}=await supabaseClient
      .from('patient_vitals')
      .select('*')
      .eq('patient_id',patientId)
      .order('measured_at',{ascending:false})
      .limit(20);

    box.innerHTML+=`<div class="card"><h2>Vitals</h2>${
      vitals?.length
        ? vitals.map(x=>`<p><b>${new Date(x.measured_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})}</b> — BP ${x.systolic??'—'}/${x.diastolic??'—'}, Pulse ${x.pulse??'—'}, SpO₂ ${x.spo2??'—'}%, Temp ${x.temperature_c??'—'}°C, Weight ${x.weight_kg??'—'} kg</p>`).join('')
        : '<p class="muted">No vitals recorded.</p>'
    }</div>`;
  }

  if(scopes.has('emergency_summary')){
    await supabaseClient.rpc('log_record_access',{
      target_patient:patientId,
      requested_scope:'emergency_summary',
      source_name:'consent',
      source_reference:consent.id
    });

    const {data:p}=await supabaseClient
      .from('patient_profiles')
      .select('blood_group,emergency_contact_name,emergency_contact_phone')
      .eq('id',patientId)
      .single();

    box.innerHTML+=`<div class="card"><h2>Emergency summary</h2>
      <p><b>Blood group:</b> ${escapeAdmin(p?.blood_group||'Not recorded')}</p>
      <p><b>Emergency contact:</b> ${escapeAdmin(p?.emergency_contact_name||'Not recorded')} ${escapeAdmin(p?.emergency_contact_phone||'')}</p>
    </div>`;
  }

  msg('sharedPatientMessage','');
}

async function openConsentedFile(path,patientId,consentId){
  const {error:logErr}=await supabaseClient.rpc('log_record_access',{
    target_patient:patientId,
    requested_scope:'appointment_files',
    source_name:'consent',
    source_reference:consentId
  });

  if(logErr){
    msg('sharedPatientMessage',logErr.message,'error');
    return;
  }

  const {data,error}=await supabaseClient.storage
    .from('Appointment files')
    .createSignedUrl(path,60);

  if(error){
    msg('sharedPatientMessage',error.message,'error');
    return;
  }

  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}

function openEmergencyArrivalNotice(id,name,meta){
  if(!currentUser || currentProfile?.role!=='patient'){
    msg('emergencyMessage','Sign in with a patient account to send an arrival notice.','error');
    return;
  }

  selectedEmergencyHospital={id,name,meta};
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-emergency-notice').classList.add('active');
  document.getElementById('noticeHospitalName').textContent=name||'Hospital';
  document.getElementById('noticeHospitalMeta').textContent=meta||'';
  document.getElementById('noticeEtaMinutes').value='20';
  document.getElementById('noticeNote').value='';
  msg('noticeMessage','');
  window.scrollTo({top:0,behavior:'smooth'});
}

async function submitEmergencyArrivalNotice(e){
  e.preventDefault();
  if(!selectedEmergencyHospital)return;

  const patient=await ensurePatientProfile();
  if(!patient.ok){
    msg('noticeMessage',patient.error,'error');
    return;
  }

  const payload={
    patient_id:currentUser.id,
    hospital_id:selectedEmergencyHospital.id,
    emergency_type:document.getElementById('noticeEmergencyType').value,
    eta_minutes:Number(document.getElementById('noticeEtaMinutes').value)||null,
    note:val('noticeNote')||null,
    status:'sent'
  };

  const {error}=await supabaseClient
    .from('emergency_arrival_requests')
    .insert(payload);

  if(error){
    msg('noticeMessage',error.message,'error');
    return;
  }

  msg('noticeMessage','Arrival notice sent. This does not guarantee admission or treatment priority.','success');
  toast('Hospital notified','The hospital can acknowledge your arrival notice.');
}

async function loadMyEmergencyNotices(){
  if(!currentUser || currentProfile?.role!=='patient')return;

  const {data,error}=await supabaseClient
    .from('emergency_arrival_requests')
    .select('*')
    .eq('patient_id',currentUser.id)
    .order('created_at',{ascending:false});

  const box=document.getElementById('myEmergencyNotices');
  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!data?.length){
    box.innerHTML='<p class="muted">No active or previous emergency arrival notices.</p>';
    return;
  }

  const ids=[...new Set(data.map(x=>x.hospital_id))];
  const {data:hospitals}=await supabaseClient
    .from('hospital_profiles')
    .select('id,hospital_name')
    .in('id',ids);

  const names=Object.fromEntries((hospitals||[]).map(h=>[h.id,h.hospital_name]));

  box.innerHTML=data.map(x=>{
    const when=new Date(x.created_at).toLocaleString('en-IN',{
      dateStyle:'medium',
      timeStyle:'short',
      timeZone:'Asia/Kolkata'
    });
    const canCancel=['sent','acknowledged'].includes(x.status);
    return `<div class="mini-row">
      <div>
        <b>${escapeAdmin(names[x.hospital_id]||'Hospital')}</b>
        <div class="muted">${escapeAdmin(x.emergency_type)} · ETA ${x.eta_minutes??'—'} min · ${when}</div>
      </div>
      <div class="row">
        <span class="badge">${escapeAdmin(x.status)}</span>
        ${canCancel?`<button class="btn secondary" onclick="updateEmergencyArrivalStatus('${x.id}','cancelled')">Cancel notice</button>`:''}
      </div>
    </div>`;
  }).join('');
}

async function loadHospitalOpsAppointments(){
  if(!currentUser || currentProfile?.role!=='hospital')return;

  const {data,error}=await supabaseClient
    .from('hospital_appointments')
    .select('*')
    .eq('hospital_id',currentUser.id)
    .order('requested_start',{ascending:true});

  const box=document.getElementById('hospitalOpsAppointments');
  const count=document.getElementById('hospitalAppointmentCount');

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  const active=(data||[]).filter(x=>['requested','confirmed'].includes(x.status));
  count.textContent=String(active.length);

  if(!active.length){
    box.innerHTML='<p class="muted">No active appointment requests.</p>';
    return;
  }

  const patientIds=[...new Set(active.map(x=>x.patient_id))];
  const {data:profiles}=await supabaseClient
    .from('profiles')
    .select('id,full_name')
    .in('id',patientIds);
  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name]));

  box.innerHTML=active.map(x=>{
    const when=new Date(x.requested_start).toLocaleString('en-IN',{
      dateStyle:'medium',
      timeStyle:'short',
      timeZone:'Asia/Kolkata'
    });
    const actions=x.status==='requested'
      ? `<button class="btn" onclick="hospitalOpsUpdateAppointment('${x.id}','confirmed')">Confirm</button>
         <button class="btn secondary" onclick="hospitalOpsUpdateAppointment('${x.id}','rejected')">Reject</button>`
      : `<button class="btn" onclick="hospitalOpsUpdateAppointment('${x.id}','completed')">Complete</button>
         <button class="btn secondary" onclick="hospitalOpsUpdateAppointment('${x.id}','cancelled')">Cancel</button>`;

    return `<div class="mini-row">
      <div>
        <b>${escapeAdmin(names[x.patient_id]||'Patient')}</b>
        <div class="muted">${when} · ${escapeAdmin(x.department||'General')}</div>
        ${x.reason_for_visit?`<div>${escapeAdmin(x.reason_for_visit)}</div>`:''}
      </div>
      <div class="row">${actions}</div>
    </div>`;
  }).join('');
}

async function hospitalOpsUpdateAppointment(id,status){
  const {error}=await supabaseClient
    .from('hospital_appointments')
    .update({status})
    .eq('id',id);

  if(error){
    msg('hospitalOpsMessage',error.message,'error');
    return;
  }

  toast('Appointment updated',status);
  await loadHospitalOpsAppointments();
}

async function loadHospitalOpsEmergencyArrivals(){
  if(!currentUser || currentProfile?.role!=='hospital')return;

  const {data,error}=await supabaseClient
    .from('emergency_arrival_requests')
    .select('*')
    .eq('hospital_id',currentUser.id)
    .order('created_at',{ascending:false});

  const box=document.getElementById('hospitalOpsEmergencyArrivals');
  const count=document.getElementById('emergencyArrivalCount');

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  const active=(data||[]).filter(x=>['sent','acknowledged'].includes(x.status));
  count.textContent=String(active.length);

  if(!active.length){
    box.innerHTML='<p class="muted">No active emergency arrival notices.</p>';
    return;
  }

  const patientIds=[...new Set(active.map(x=>x.patient_id))];
  const {data:profiles}=await supabaseClient
    .from('profiles')
    .select('id,full_name')
    .in('id',patientIds);
  const names=Object.fromEntries((profiles||[]).map(p=>[p.id,p.full_name]));

  box.innerHTML=active.map(x=>{
    const when=new Date(x.created_at).toLocaleTimeString('en-IN',{
      hour:'numeric',
      minute:'2-digit',
      timeZone:'Asia/Kolkata'
    });

    const actions=x.status==='sent'
      ? `<button class="btn" onclick="updateEmergencyArrivalStatus('${x.id}','acknowledged')">Acknowledge</button>
         <button class="btn secondary" onclick="updateEmergencyArrivalStatus('${x.id}','cancelled')">Close</button>`
      : `<button class="btn" onclick="updateEmergencyArrivalStatus('${x.id}','arrived')">Mark arrived</button>
         <button class="btn secondary" onclick="updateEmergencyArrivalStatus('${x.id}','closed')">Close</button>`;

    return `<div class="mini-row urgent-row">
      <div>
        <b>${escapeAdmin(names[x.patient_id]||'Patient')}</b>
        <div><b>${escapeAdmin(x.emergency_type)}</b> · ETA ${x.eta_minutes??'—'} min</div>
        <div class="muted">${when}${x.note?' · '+escapeAdmin(x.note):''}</div>
      </div>
      <div class="row">${actions}</div>
    </div>`;
  }).join('');
}

async function updateEmergencyArrivalStatus(id,status){
  const {error}=await supabaseClient
    .from('emergency_arrival_requests')
    .update({status})
    .eq('id',id);

  if(error){
    if(document.getElementById('hospitalOpsMessage'))msg('hospitalOpsMessage',error.message,'error');
    else msg('emergencyMessage',error.message,'error');
    return;
  }

  toast('Emergency arrival updated',status);

  if(currentProfile?.role==='hospital'){
    await loadHospitalOpsEmergencyArrivals();
  }else if(currentProfile?.role==='patient'){
    await loadMyEmergencyNotices();
  }
}

async function loadHospitalOpsPage(){
  const gate=document.getElementById('hospitalOpsGate'),
        content=document.getElementById('hospitalOpsContent');

  await loadProfile();

  const allowed=currentUser &&
    currentProfile?.role==='hospital' &&
    currentProfile?.verification_status==='verified';

  if(!allowed){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');

  document.getElementById('capabilityChecks').innerHTML=HOSPITAL_CAPABILITIES.map(([id,label])=>
    `<label class="cap-item"><input type="checkbox" class="hospital-cap-check" value="${id}"><span>${label}</span></label>`
  ).join('');

  await Promise.all([loadHospitalEmergencyStatus(),loadHospitalCapabilities(),loadHospitalOpsAppointments(),loadHospitalOpsEmergencyArrivals()]);
}

async function loadHospitalEmergencyStatus(){
  const {data,error}=await supabaseClient
    .from('hospital_emergency_status')
    .select('*')
    .eq('hospital_id',currentUser.id)
    .maybeSingle();

  if(error){msg('hospitalOpsMessage',error.message,'error');return}

  if(data){
    document.getElementById('hospitalOpsStatus').value=data.status;
    document.getElementById('hospitalOpsEmergencyBeds').value=data.emergency_beds_available??'';
    document.getElementById('hospitalOpsIcuBeds').value=data.icu_beds_available??'';
    document.getElementById('hospitalOpsNote').value=data.status_note||'';
  }
}

async function saveHospitalEmergencyStatus(e){
  e.preventDefault();

  const eBeds=val('hospitalOpsEmergencyBeds'),
        iBeds=val('hospitalOpsIcuBeds');

  const payload={
    hospital_id:currentUser.id,
    status:document.getElementById('hospitalOpsStatus').value,
    emergency_beds_available:eBeds?Number(eBeds):null,
    icu_beds_available:iBeds?Number(iBeds):null,
    status_note:val('hospitalOpsNote')||null,
    updated_at:new Date().toISOString()
  };

  const {error}=await supabaseClient
    .from('hospital_emergency_status')
    .upsert(payload);

  msg('hospitalOpsMessage',error?error.message:'Emergency status updated.',error?'error':'success');
}

async function loadHospitalCapabilities(){
  const {data,error}=await supabaseClient
    .from('hospital_capabilities')
    .select('capability')
    .eq('hospital_id',currentUser.id);

  if(error){msg('hospitalOpsMessage',error.message,'error');return}

  const set=new Set((data||[]).map(x=>x.capability));
  document.querySelectorAll('.hospital-cap-check').forEach(x=>x.checked=set.has(x.value));
}

async function saveHospitalCapabilities(){
  const selected=[...document.querySelectorAll('.hospital-cap-check:checked')].map(x=>x.value);

  const {error:delErr}=await supabaseClient
    .from('hospital_capabilities')
    .delete()
    .eq('hospital_id',currentUser.id);

  if(delErr){msg('hospitalOpsMessage',delErr.message,'error');return}

  if(selected.length){
    const {error:insErr}=await supabaseClient
      .from('hospital_capabilities')
      .insert(selected.map(capability=>({hospital_id:currentUser.id,capability})));

    if(insErr){msg('hospitalOpsMessage',insErr.message,'error');return}
  }

  msg('hospitalOpsMessage','Capabilities saved.','success');
}

async function loadEmergencyPage(){
  await searchEmergencyHospitals();
  const card=document.getElementById('myEmergencyNoticesCard');
  if(currentUser && currentProfile?.role==='patient'){
    card.classList.remove('hidden');
    await loadMyEmergencyNotices();
  }else{
    card.classList.add('hidden');
  }
}

function useEmergencyLocation(){
  if(!navigator.geolocation){
    msg('emergencyMessage','Location is not supported by this browser.','error');
    return;
  }

  msg('emergencyMessage','Getting your location...');

  navigator.geolocation.getCurrentPosition(
    pos=>{
      emergencyUserLocation={
        lat:pos.coords.latitude,
        lng:pos.coords.longitude
      };
      document.getElementById('emergencyLocationLabel').textContent=
        `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      msg('emergencyMessage','Location added. Results are sorted by approximate straight-line distance.','success');
      searchEmergencyHospitals();
    },
    err=>msg('emergencyMessage','Could not access location: '+err.message,'error'),
    {enableHighAccuracy:true,timeout:10000}
  );
}

async function searchEmergencyHospitals(){
  const capability=document.getElementById('emergencyCapability')?.value||'';
  const radiusValue=document.getElementById('emergencyRadius')?.value||'25';
  const district=(document.getElementById('emergencyDistrict')?.value||'').trim();

  msg('emergencyMessage','Searching verified emergency hospitals...');

  // True radius mode: exact server-side PostGIS calculation.
  if(radiusValue!=='district' && emergencyUserLocation){
    const radius=Number(radiusValue);

    const {data,error}=await supabaseClient.rpc('nearby_emergency_hospitals',{
      user_lat:emergencyUserLocation.lat,
      user_lng:emergencyUserLocation.lng,
      radius_km:radius,
      needed_capability:capability||null
    });

    if(error){
      msg('emergencyMessage',error.message,'error');
      return;
    }

    renderEmergencyHospitalResults(data||[],{
      mode:'radius',
      radius,
      district:''
    });
    return;
  }

  // If user selected a kilometre radius but has not shared GPS,
  // never pretend that district filtering is a radius calculation.
  if(radiusValue!=='district' && !emergencyUserLocation){
    document.getElementById('emergencyHospitalResults').innerHTML=
      '<div class="card"><b>Location is required for a kilometre-radius search.</b><p class="muted">Tap “Use my location”, or choose District-wide if you prefer not to share GPS.</p></div>';
    msg('emergencyMessage','No radius calculation was performed because GPS location is not available.','error');
    return;
  }

  // Explicit district-wide fallback only.
  if(!district){
    document.getElementById('emergencyHospitalResults').innerHTML=
      '<div class="card"><b>Enter a district for district-wide search.</b></div>';
    msg('emergencyMessage','');
    return;
  }

  const {data:hospitals,error:hErr}=await supabaseClient
    .from('hospital_profiles')
    .select('id,hospital_name,address,city,state,district,google_maps_url,latitude,longitude,emergency_available')
    .eq('emergency_available',true)
    .or(`district.ilike.%${district}%,city.ilike.%${district}%`);

  if(hErr){
    msg('emergencyMessage',hErr.message,'error');
    return;
  }

  const ids=(hospitals||[]).map(h=>h.id);
  if(!ids.length){
    renderEmergencyHospitalResults([],{mode:'district',district});
    return;
  }

  const [{data:statuses,error:sErr},{data:caps,error:cErr}]=await Promise.all([
    supabaseClient.from('hospital_emergency_status').select('*').in('hospital_id',ids),
    supabaseClient.from('hospital_capabilities').select('*').in('hospital_id',ids)
  ]);

  if(sErr||cErr){
    msg('emergencyMessage',(sErr||cErr).message,'error');
    return;
  }

  const sm=Object.fromEntries((statuses||[]).map(s=>[s.hospital_id,s]));
  const cm={};
  (caps||[]).forEach(c=>(cm[c.hospital_id]??=[]).push(c.capability));

  let results=(hospitals||[]).map(h=>({
    ...h,
    emergency_status:sm[h.id]?.status||'offline',
    emergency_beds_available:sm[h.id]?.emergency_beds_available??null,
    icu_beds_available:sm[h.id]?.icu_beds_available??null,
    status_note:sm[h.id]?.status_note||null,
    capabilities:cm[h.id]||[],
    distance_km:null
  })).filter(h=>['accepting','limited','diverting'].includes(h.emergency_status));

  if(capability){
    results=results.filter(h=>h.capabilities.includes(capability));
  }

  renderEmergencyHospitalResults(results,{mode:'district',district});
}

function renderEmergencyHospitalResults(results,context){
  const box=document.getElementById('emergencyHospitalResults');

  if(!results.length){
    box.innerHTML='<div class="card"><b>No matching verified emergency hospital was found.</b><p class="muted">Try a wider radius or district-wide search. For urgent emergencies, contact emergency services directly.</p></div>';
    msg('emergencyMessage','');
    return;
  }

  box.innerHTML=results.map(h=>{
    const status=h.emergency_status||'offline';
    const labels=(h.capabilities||[]).map(c=>(HOSPITAL_CAPABILITIES.find(x=>x[0]===c)||[c,c])[1]);

    let mapsLink=h.google_maps_url||null;
    if(!mapsLink && h.latitude!=null && h.longitude!=null){
      mapsLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.latitude+','+h.longitude)}`;
    }

    let directionsLink=null;
    if(h.latitude!=null && h.longitude!=null){
      directionsLink=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(h.latitude+','+h.longitude)}`;
    }else if(h.google_maps_url){
      directionsLink=h.google_maps_url;
    }

    return `<div class="card hospital-result">
      <div class="row between">
        <div>
          <h2 style="margin:0">${escapeAdmin(h.hospital_name)}</h2>
          <p class="muted">${escapeAdmin([h.address,h.city,h.district,h.state].filter(Boolean).join(', '))}</p>
        </div>
        <span class="badge status-${status}">${escapeAdmin(status)}</span>
      </div>

      ${h.distance_km!=null
        ? `<p><b>Distance:</b> ${Number(h.distance_km).toFixed(2)} km</p>`
        : `<p class="muted"><b>Distance:</b> not calculated in district-wide mode</p>`}

      <p><b>Capabilities:</b> ${labels.length?escapeAdmin(labels.join(', ')):'Not specified'}</p>

      ${h.emergency_beds_available!=null?`<p><b>Reported emergency beds:</b> ${h.emergency_beds_available}</p>`:''}
      ${h.icu_beds_available!=null?`<p><b>Reported ICU beds:</b> ${h.icu_beds_available}</p>`:''}
      ${h.status_note?`<p><b>Status note:</b> ${escapeAdmin(h.status_note)}</p>`:''}

      <div class="row">
        ${mapsLink?`<button class="btn secondary" onclick="window.open('${mapsLink.replace(/'/g,"%27")}','_blank')">Open location</button>`:''}
        ${directionsLink?`<button class="btn" onclick="window.open('${directionsLink.replace(/'/g,"%27")}','_blank')">Directions</button>`:''}
        ${(currentUser&&currentProfile?.role==='patient')
          ? `<button class="btn secondary" onclick="openEmergencyArrivalNotice('${h.id}','${String(h.hospital_name||'Hospital').replace(/'/g,"&#39;")}','${String([h.address,h.city,h.district,h.state].filter(Boolean).join(', ')).replace(/'/g,"&#39;")}')">Notify hospital</button>`
          : ''}
      </div>
    </div>`;
  }).join('');

  if(context.mode==='radius'){
    msg('emergencyMessage',
      `Showing only verified matching hospitals within ${context.radius} km, ordered by PostGIS-calculated distance. Hospital status/capacity is still hospital-reported.`,
      'success');
  }else{
    msg('emergencyMessage',
      `District-wide results for ${context.district}. Distance is intentionally not shown because this is not a GPS radius search.`,
      'success');
  }
}

function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
    Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

async function loadAvailabilityPage(){
  const gate=document.getElementById('availabilityGate'),
        content=document.getElementById('availabilityContent');

  await loadProfile();

  const allowed=currentUser &&
    currentProfile?.role==='doctor' &&
    currentProfile?.verification_status==='verified';

  if(!allowed){
    gate.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  content.classList.remove('hidden');
  await loadAvailability();
}

async function loadAvailability(){
  if(!currentUser ||
     currentProfile?.role!=='doctor' ||
     currentProfile?.verification_status!=='verified') return;

  msg('availabilityMessage','Loading...');

  const {data,error}=await supabaseClient
    .from('doctor_availability')
    .select('*')
    .eq('doctor_id',currentUser.id)
    .order('day_of_week',{ascending:true})
    .order('start_time',{ascending:true});

  if(error){
    msg('availabilityMessage',error.message,'error');
    return;
  }

  const list=document.getElementById('availabilityList');

  if(!data || data.length===0){
    list.innerHTML='<div class="card"><b>No availability added yet.</b><p class="muted">Use the form above to add your first working period.</p></div>';
    msg('availabilityMessage','');
    return;
  }

  list.innerHTML=data.map(x=>`
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${DAY_NAMES[x.day_of_week]||'Day'}</h2>
          <p style="margin:6px 0"><b>${formatTime(x.start_time)} – ${formatTime(x.end_time)}</b></p>
          <p class="muted" style="margin:4px 0">
            ${x.slot_minutes} minute slots · ${formatConsultationType(x.consultation_type)}
          </p>
          <p style="margin:4px 0">${escapeAdmin(x.location_name||'Location not specified')}</p>
        </div>
        <button class="btn secondary" onclick="deleteAvailability('${x.id}')">Delete</button>
      </div>
    </div>
  `).join('');

  msg('availabilityMessage','');
}

async function saveAvailability(e){
  e.preventDefault();

  if(!currentUser ||
     currentProfile?.role!=='doctor' ||
     currentProfile?.verification_status!=='verified'){
    msg('availabilityMessage','Only verified doctors can add availability.','error');
    return;
  }

  const start=val('availabilityStart');
  const end=val('availabilityEnd');

  if(!start || !end){
    msg('availabilityMessage','Choose both start and end time.','error');
    return;
  }

  if(end<=start){
    msg('availabilityMessage','End time must be later than start time.','error');
    return;
  }

  const payload={
    doctor_id:currentUser.id,
    day_of_week:Number(document.getElementById('availabilityDay').value),
    start_time:start,
    end_time:end,
    slot_minutes:Number(document.getElementById('availabilitySlot').value),
    consultation_type:document.getElementById('availabilityType').value,
    location_name:val('availabilityLocation')||null,
    is_active:true
  };

  const {error}=await supabaseClient
    .from('doctor_availability')
    .insert(payload);

  if(error){
    msg('availabilityMessage',error.message,'error');
    return;
  }

  msg('availabilityMessage','Availability added successfully.','success');
  document.getElementById('availabilityStart').value='';
  document.getElementById('availabilityEnd').value='';
  document.getElementById('availabilityLocation').value='';
  await loadAvailability();
}

async function deleteAvailability(id){
  if(!confirm('Delete this availability period?')) return;

  const {error}=await supabaseClient
    .from('doctor_availability')
    .delete()
    .eq('id',id)
    .eq('doctor_id',currentUser.id);

  if(error){
    msg('availabilityMessage',error.message,'error');
    return;
  }

  msg('availabilityMessage','Availability deleted.','success');
  await loadAvailability();
}

function formatConsultationType(x){
  if(x==='in_person') return 'In-person';
  if(x==='online') return 'Online';
  return 'In-person + Online';
}

function formatTime(t){
  if(!t) return '';
  const parts=t.split(':');
  let h=Number(parts[0]),m=parts[1];
  const ap=h>=12?'PM':'AM';
  h=h%12||12;
  return `${h}:${m} ${ap}`;
}



async function loadLabProfile(){
  const {data,error}=await supabaseClient
    .from('lab_profiles')
    .select('*')
    .eq('id',currentUser.id)
    .maybeSingle();

  if(error){
    msg('profileMessage',error.message,'error');
    return;
  }

  const l=data||{};
  document.getElementById('labName').value=l.lab_name||'';
  document.getElementById('labRegistration').value=l.registration_number||'';
  document.getElementById('labAddress').value=l.address||'';
  document.getElementById('labCity').value=l.city||'';
  document.getElementById('labDistrict').value=l.district||'';
  document.getElementById('labState').value=l.state||'Uttar Pradesh';
  document.getElementById('labPhone').value=l.phone||'';
  document.getElementById('labMapsLink').value=l.google_maps_url||'';
  document.getElementById('labLatitude').value=l.latitude??'';
  document.getElementById('labLongitude').value=l.longitude??'';

  document.getElementById('labLocationStatus').textContent=
    (l.latitude!=null&&l.longitude!=null)
      ? `${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)}`
      : 'Location not captured yet';
}

async function saveLabProfile(e){
  e.preventDefault();

  const lat=val('labLatitude');
  const lng=val('labLongitude');

  const payload={
    id:currentUser.id,
    lab_name:val('labName'),
    registration_number:val('labRegistration'),
    address:val('labAddress')||null,
    city:val('labCity')||null,
    district:val('labDistrict')||null,
    state:val('labState')||'Uttar Pradesh',
    phone:val('labPhone')||null,
    google_maps_url:val('labMapsLink')||null,
    latitude:lat?Number(lat):null,
    longitude:lng?Number(lng):null,
    updated_at:new Date().toISOString()
  };

  const {error}=await supabaseClient
    .from('lab_profiles')
    .upsert(payload);

  msg(
    'profileMessage',
    error?error.message:'Diagnostic centre profile saved. Verification remains pending until approved.',
    error?'error':'success'
  );
}

function useLabLocation(){
  const status=document.getElementById('labLocationStatus');

  if(!navigator.geolocation){
    status.textContent='Location is not supported on this device/browser.';
    return;
  }

  status.textContent='Detecting location...';

  navigator.geolocation.getCurrentPosition(
    pos=>{
      document.getElementById('labLatitude').value=pos.coords.latitude;
      document.getElementById('labLongitude').value=pos.coords.longitude;
      status.textContent=`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    },
    err=>{
      status.textContent=err.code===1
        ? 'Location permission is blocked. You can enter coordinates manually.'
        : (err.message||'Could not detect location.');
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}

async function loadDiagnosticsPage(){
  await loadProfile();

  const patientView=document.getElementById('patientDiagnosticsView');
  const labView=document.getElementById('labDiagnosticsView');
  const gate=document.getElementById('diagnosticsGate');

  patientView.classList.add('hidden');
  labView.classList.add('hidden');
  gate.classList.add('hidden');

  if(currentProfile?.role==='patient'){
    patientView.classList.remove('hidden');
    document.getElementById('diagnosticsPageTitle').textContent='Diagnostic tests';
    document.getElementById('diagnosticsPageSubtitle').textContent='Find verified diagnostic centres, choose tests and track your request.';
    await loadPatientDiagnosticsPage();
    return;
  }

  if(currentProfile?.role==='lab' && currentProfile?.verification_status==='verified'){
    labView.classList.remove('hidden');
    document.getElementById('diagnosticsPageTitle').textContent='Diagnostic centre workspace';
    document.getElementById('diagnosticsPageSubtitle').textContent='Manage test catalogue and incoming diagnostic requests.';
    await Promise.all([loadLabCatalogue(),loadLabDiagnosticInbox()]);
    return;
  }

  gate.classList.remove('hidden');
}

async function getVerifiedLabs(){
  const {data,error}=await supabaseClient.rpc('get_verified_labs');
  cachedVerifiedLabs=data||[];
  return {rows:cachedVerifiedLabs,error};
}

function diagnosticDistanceKm(lat1,lng1,lat2,lng2){
  const toRad=x=>x*Math.PI/180;
  const R=6371;
  const dLat=toRad(lat2-lat1);
  const dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function handleDiagnosticPlaceInput(){
  diagnosticUserLocation=null;
  const status=document.getElementById('diagnosticLocationStatus');
  if(status)status.textContent='Searching by city/district. Distance filter is off.';
  clearTimeout(diagnosticPlaceDebounce);
  diagnosticPlaceDebounce=setTimeout(()=>renderDiagnosticDiscovery(),250);
}

function useDiagnosticLocation(){
  const status=document.getElementById('diagnosticLocationStatus');

  if(!navigator.geolocation){
    status.textContent='Location is not supported. Search by city/district instead.';
    return;
  }

  status.textContent='Detecting your location...';

  navigator.geolocation.getCurrentPosition(
    pos=>{
      diagnosticUserLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      status.textContent=`Location detected · ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      renderDiagnosticDiscovery();
    },
    err=>{
      diagnosticUserLocation=null;
      status.textContent=err.code===1
        ? 'Location permission is blocked. Search by city/district instead.'
        : (err.message||'Could not detect location.');
      renderDiagnosticDiscovery();
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
  );
}

function getFilteredDiagnosticCentres(){
  const place=(document.getElementById('diagnosticPlace')?.value||'').trim().toLowerCase();
  const radius=Number(document.getElementById('diagnosticRadius')?.value||25);

  if(!diagnosticUserLocation && place.length<2)return [];

  let rows=cachedVerifiedLabs.map(l=>{
    let distance=null;
    if(diagnosticUserLocation && l.latitude!=null && l.longitude!=null){
      distance=diagnosticDistanceKm(
        diagnosticUserLocation.lat,diagnosticUserLocation.lng,
        Number(l.latitude),Number(l.longitude)
      );
    }
    return {...l,distance};
  });

  if(diagnosticUserLocation){
    rows=rows
      .filter(l=>l.distance!=null && l.distance<=radius)
      .sort((a,b)=>a.distance-b.distance);
  }else{
    rows=rows.filter(l=>
      [l.city,l.district]
        .filter(Boolean)
        .some(v=>String(v).toLowerCase().includes(place))
    );
  }

  return rows;
}

async function loadPatientDiagnosticsPage(){
  const [{error:labErr},{data:requests,error:reqErr}]=await Promise.all([
    getVerifiedLabs(),
    supabaseClient
      .from('diagnostic_requests')
      .select('*')
      .eq('patient_id',currentUser.id)
      .order('requested_at',{ascending:false})
  ]);

  if(labErr){
    document.getElementById('diagnosticCentresList').innerHTML=`<p class="error">${escapeAdmin(labErr.message)}</p>`;
    return;
  }

  renderDiagnosticDiscovery();

  const box=document.getElementById('patientDiagnosticRequests');
  if(reqErr){
    box.innerHTML=`<p class="error">${escapeAdmin(reqErr.message)}</p>`;
    return;
  }

  await renderPatientDiagnosticRequests(requests||[],box);
}

async function renderDiagnosticDiscovery(){
  const box=document.getElementById('diagnosticCentresList');
  if(!box)return;

  const place=(document.getElementById('diagnosticPlace')?.value||'').trim();

  if(!diagnosticUserLocation && place.length<2){
    box.innerHTML=`<div class="empty-state compact-empty-state">
      <div class="empty-icon">🧪</div>
      <h3>Choose your location first</h3>
      <p class="muted">Enter a city/district or use GPS to see diagnostic centres available there.</p>
    </div>`;
    return;
  }

  const rows=getFilteredDiagnosticCentres();

  if(!rows.length){
    box.innerHTML='<p class="muted">No verified diagnostic centres are available in this selected location yet.</p>';
    return;
  }

  const ids=rows.map(l=>l.id);
  const {data:tests,error}=await supabaseClient.rpc(
    'get_verified_lab_tests',
    {target_lab_ids:ids}
  );

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  const testMap={};
  (tests||[]).forEach(t=>(testMap[t.lab_id] ||= []).push(t));

  box.innerHTML=rows.map((l,index)=>{
    const centreTests=testMap[l.id]||[];

    return `
      <div class="diagnostic-centre-card">
        <div class="row between">
          <div>
            <div class="diagnostic-title-row">
              <span class="diagnostic-number">${index+1}</span>
              <div>
                <h3>${escapeAdmin(l.lab_name||'Diagnostic centre')}</h3>
                <p class="muted">${escapeAdmin([l.address,l.city,l.district,l.state].filter(Boolean).join(' · '))}</p>
              </div>
            </div>
          </div>
          ${l.distance!=null?`<span class="badge">${l.distance.toFixed(1)} km</span>`:''}
        </div>

        <div class="diagnostic-tests">
          ${centreTests.length
            ? centreTests.map(t=>`
                <label class="diagnostic-test-choice">
                  <input type="checkbox" value="${t.id}" data-lab="${l.id}">
                  <span>
                    <b>${escapeAdmin(t.test_name)}</b>
                    <small>${escapeAdmin([t.category,t.sample_or_modality,t.turnaround_time].filter(Boolean).join(' · '))}</small>
                    ${t.indicative_price!=null?`<small>Indicative price: ₹${Number(t.indicative_price).toFixed(0)}</small>`:''}
                  </span>
                </label>`).join('')
            : '<p class="muted">This centre has not added its test catalogue yet.</p>'
          }
        </div>

        ${centreTests.length?`
          <div class="diagnostic-request-form">
            <label>Preferred date<input id="diagnosticDate-${l.id}" type="date"></label>
            <label>Preferred time<input id="diagnosticTime-${l.id}" type="time"></label>
            <label>Note (optional)<input id="diagnosticNote-${l.id}" placeholder="e.g. Morning sample preferred"></label>
            <button class="btn" onclick="sendDiagnosticRequest('${l.id}')">Request selected tests</button>
          </div>`:''}

        <div class="row" style="margin-top:10px">
          ${l.google_maps_url?`<button class="btn secondary" onclick="window.open('${escapeAdmin(l.google_maps_url)}','_blank','noopener,noreferrer')">Open Maps</button>`:''}
        </div>
      </div>`;
  }).join('');
}

async function sendDiagnosticRequest(labId){
  const selected=[...document.querySelectorAll(`input[type="checkbox"][data-lab="${labId}"]:checked`)]
    .map(x=>x.value);

  if(!selected.length){
    alert('Select at least one test.');
    return;
  }

  const date=document.getElementById(`diagnosticDate-${labId}`)?.value||null;
  const time=document.getElementById(`diagnosticTime-${labId}`)?.value||null;
  const note=document.getElementById(`diagnosticNote-${labId}`)?.value||'';

  const {error}=await supabaseClient.rpc(
    'create_diagnostic_request',
    {
      target_lab:labId,
      target_test_ids:selected,
      target_date:date,
      target_time:time,
      request_note:note
    }
  );

  if(error){
    alert(error.message);
    return;
  }

  toast('Diagnostic request sent','The diagnostic centre can now review your test request.');
  await loadPatientDiagnosticsPage();
}

function diagnosticStatusLabel(status){
  return ({
    requested:'Requested',
    accepted:'Accepted',
    sample_pending:'Sample / visit pending',
    in_process:'In process',
    report_ready:'Report ready',
    completed:'Completed',
    rejected:'Rejected',
    cancelled:'Cancelled'
  })[status]||status;
}

async function renderPatientDiagnosticRequests(requests,box){
  if(!requests.length){
    box.innerHTML='<p class="muted">No diagnostic requests yet.</p>';
    return;
  }

  const labIds=[...new Set(requests.map(r=>r.lab_id))];
  const reqIds=requests.map(r=>r.id);

  const [{data:labs},{data:items},{data:reports}]=await Promise.all([
    supabaseClient.from('lab_profiles').select('id,lab_name,city,district').in('id',labIds),
    supabaseClient.from('diagnostic_request_items').select('*').in('request_id',reqIds),
    supabaseClient.from('medical_reports').select('id,diagnostic_request_id,file_path').in('diagnostic_request_id',reqIds)
  ]);

  const labMap=Object.fromEntries((labs||[]).map(l=>[l.id,l]));
  const itemMap={};
  (items||[]).forEach(i=>(itemMap[i.request_id] ||= []).push(i));
  const reportMap=Object.fromEntries((reports||[]).map(r=>[r.diagnostic_request_id,r]));

  box.innerHTML=requests.map(r=>{
    const l=labMap[r.lab_id]||{};
    const tests=itemMap[r.id]||[];
    const report=reportMap[r.id]||null;

    return `
      <div class="diagnostic-request-card">
        <div class="row between">
          <div>
            <h3>${escapeAdmin(l.lab_name||'Diagnostic centre')}</h3>
            <p class="muted">${escapeAdmin([l.city,l.district].filter(Boolean).join(' · '))}</p>
          </div>
          <span class="diagnostic-status ${escapeAdmin(r.status)}">${escapeAdmin(diagnosticStatusLabel(r.status))}</span>
        </div>

        <div class="diagnostic-item-list">
          ${tests.map(t=>`<div><b>${escapeAdmin(t.test_name)}</b><small>${escapeAdmin(t.category||'')}</small></div>`).join('')}
        </div>

        ${r.requested_date?`<p><b>Requested date:</b> ${escapeAdmin(r.requested_date)} ${r.preferred_time?`· ${escapeAdmin(r.preferred_time)}`:''}</p>`:''}
        ${r.lab_note?`<p><b>Centre note:</b> ${escapeAdmin(r.lab_note)}</p>`:''}

        <div class="row diagnostic-patient-actions">
          ${report?`<button class="btn" onclick="openMedicalReport('${report.id}','${encodeURIComponent(report.file_path)}')">Open report</button>`:''}
          ${r.status==='requested'?`<button class="btn secondary" onclick="cancelDiagnosticRequest('${r.id}')">Cancel request</button>`:''}
        </div>
      </div>`;
  }).join('');
}

async function cancelDiagnosticRequest(requestId){
  if(!confirm('Cancel this diagnostic request?'))return;

  const {error}=await supabaseClient.rpc(
    'cancel_diagnostic_request',
    {target_request:requestId}
  );

  if(error){
    alert(error.message);
    return;
  }

  await loadPatientDiagnosticsPage();
}

async function loadLabCatalogue(){
  const box=document.getElementById('labCatalogue');

  const {data,error}=await supabaseClient
    .from('lab_tests')
    .select('*')
    .eq('lab_id',currentUser.id)
    .order('test_name');

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!data?.length){
    box.innerHTML='<p class="muted">No tests added yet.</p>';
    return;
  }

  box.innerHTML=data.map(t=>`
    <div class="lab-test-row">
      <div>
        <b>${escapeAdmin(t.test_name)}</b>
        <p class="muted">${escapeAdmin([t.category,t.sample_or_modality,t.turnaround_time].filter(Boolean).join(' · '))}</p>
      </div>
      <span class="badge">${t.indicative_price!=null?'₹'+Number(t.indicative_price).toFixed(0):'Price optional'}</span>
    </div>`).join('');
}

async function addLabTest(e){
  e.preventDefault();

  const price=val('labTestPrice');

  const {error}=await supabaseClient
    .from('lab_tests')
    .insert({
      lab_id:currentUser.id,
      test_name:val('labTestName'),
      category:val('labTestCategory'),
      sample_or_modality:val('labTestSample')||null,
      turnaround_time:val('labTestTurnaround')||null,
      indicative_price:price?Number(price):null
    });

  if(error){
    alert(error.message);
    return;
  }

  document.getElementById('labTestName').value='';
  document.getElementById('labTestSample').value='';
  document.getElementById('labTestTurnaround').value='';
  document.getElementById('labTestPrice').value='';

  await loadLabCatalogue();
}

async function loadLabDiagnosticInbox(){
  const box=document.getElementById('labDiagnosticInbox');

  const {data:requests,error}=await supabaseClient
    .from('diagnostic_requests')
    .select('*')
    .eq('lab_id',currentUser.id)
    .order('requested_at',{ascending:false});

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!requests?.length){
    box.innerHTML='<p class="muted">No diagnostic requests yet.</p>';
    return;
  }

  const reqIds=requests.map(r=>r.id);
  const patientIds=[...new Set(requests.map(r=>r.patient_id))];

  const [{data:items},{data:patients},{data:reports}]=await Promise.all([
    supabaseClient.from('diagnostic_request_items').select('*').in('request_id',reqIds),
    supabaseClient.from('profiles').select('id,full_name').in('id',patientIds),
    supabaseClient.from('medical_reports').select('id,diagnostic_request_id,file_path,file_name').in('diagnostic_request_id',reqIds)
  ]);

  const itemMap={};
  (items||[]).forEach(i=>(itemMap[i.request_id] ||= []).push(i));
  const patientMap=Object.fromEntries((patients||[]).map(p=>[p.id,p.full_name||'Patient']));
  const reportMap=Object.fromEntries((reports||[]).map(r=>[r.diagnostic_request_id,r]));

  box.innerHTML=requests.map(r=>{
    const tests=itemMap[r.id]||[];
    const report=reportMap[r.id]||null;

    return `
      <div class="diagnostic-request-card">
        <div class="row between">
          <div>
            <h3>${escapeAdmin(patientMap[r.patient_id]||'Patient')}</h3>
            <p class="muted">${new Date(r.requested_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</p>
          </div>
          <span class="diagnostic-status ${escapeAdmin(r.status)}">${escapeAdmin(diagnosticStatusLabel(r.status))}</span>
        </div>

        <div class="diagnostic-item-list">
          ${tests.map(t=>`<div><b>${escapeAdmin(t.test_name)}</b><small>${escapeAdmin([t.category,t.sample_or_modality].filter(Boolean).join(' · '))}</small></div>`).join('')}
        </div>

        ${r.patient_note?`<p><b>Patient note:</b> ${escapeAdmin(r.patient_note)}</p>`:''}
        ${r.requested_date?`<p><b>Preferred:</b> ${escapeAdmin(r.requested_date)} ${r.preferred_time?`· ${escapeAdmin(r.preferred_time)}`:''}</p>`:''}

        <div class="pharmacy-inbox-actions">
          ${r.status==='requested'
            ? `<button class="btn" onclick="setDiagnosticRequestStatus('${r.id}','accepted')">Accept</button>
               <button class="btn secondary" onclick="setDiagnosticRequestStatus('${r.id}','rejected')">Reject</button>`
            : ''}
          ${r.status==='accepted'
            ? `<button class="btn" onclick="setDiagnosticRequestStatus('${r.id}','sample_pending')">Await sample / visit</button>`
            : ''}
          ${r.status==='sample_pending'
            ? `<button class="btn" onclick="setDiagnosticRequestStatus('${r.id}','in_process')">Start processing</button>`
            : ''}
          ${r.status==='in_process' && !report
            ? `<button class="btn" onclick="showDiagnosticReportUpload('${r.id}','${r.patient_id}')">Upload & publish report</button>`
            : ''}
          ${report
            ? `<button class="btn secondary" onclick="openMedicalReport('${report.id}','${encodeURIComponent(report.file_path)}')">Open published report</button>`
            : ''}
          ${r.status==='report_ready' && report
            ? `<button class="btn" onclick="setDiagnosticRequestStatus('${r.id}','completed')">Mark completed</button>`
            : ''}
        </div>

        ${r.status==='in_process' && !report?`
          <div id="diagnosticReportUpload-${r.id}" class="diagnostic-report-upload hidden">
            <h4>Publish patient report</h4>
            <p class="muted">Upload the final PDF or report image. It will automatically appear in the patient's Reports Hub.</p>
            <input id="diagnosticReportFile-${r.id}" type="file" accept="application/pdf,image/jpeg,image/png,image/webp">
            <input id="diagnosticReportNote-${r.id}" placeholder="Optional note for patient">
            <div class="row">
              <button class="btn" onclick="publishDiagnosticReport('${r.id}','${r.patient_id}')">Publish report</button>
              <button class="btn secondary" onclick="hideDiagnosticReportUpload('${r.id}')">Cancel</button>
            </div>
            <p id="diagnosticReportMessage-${r.id}" class="msg"></p>
          </div>`:''}
      </div>`;
  }).join('');
}


function showDiagnosticReportUpload(requestId){
  document.getElementById(`diagnosticReportUpload-${requestId}`)?.classList.remove('hidden');
}

function hideDiagnosticReportUpload(requestId){
  document.getElementById(`diagnosticReportUpload-${requestId}`)?.classList.add('hidden');
}

async function publishDiagnosticReport(requestId,patientId){
  const input=document.getElementById(`diagnosticReportFile-${requestId}`);
  const note=document.getElementById(`diagnosticReportNote-${requestId}`)?.value||'';
  const file=input?.files?.[0];
  const messageId=`diagnosticReportMessage-${requestId}`;

  if(!file){
    msg(messageId,'Choose the final report file.','error');
    return;
  }

  if(file.size>15*1024*1024){
    msg(messageId,'Report file must be 15 MB or smaller.','error');
    return;
  }

  const allowed=['application/pdf','image/jpeg','image/png','image/webp'];
  if(file.type && !allowed.includes(file.type)){
    msg(messageId,'Use PDF, JPG, PNG or WEBP.','error');
    return;
  }

  const cleanName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`${patientId}/${currentUser.id}/${requestId}/${Date.now()}_${cleanName}`;

  msg(messageId,'Uploading report...');

  const {error:uploadError}=await supabaseClient.storage
    .from('Medical reports')
    .upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});

  if(uploadError){
    msg(messageId,uploadError.message,'error');
    return;
  }

  const {data,error}=await supabaseClient.rpc(
    'publish_diagnostic_report',
    {
      target_request:requestId,
      target_file_path:path,
      target_file_name:file.name,
      target_mime_type:file.type||null,
      target_file_size:file.size,
      report_note:note
    }
  );

  if(error){
    await supabaseClient.storage.from('Medical reports').remove([path]);
    msg(messageId,error.message,'error');
    return;
  }

  msg(messageId,'Report published to the patient medical record.','success');
  toast('Report published','The patient can now open it from Diagnostics and Reports.');
  await loadLabDiagnosticInbox();
}

async function setDiagnosticRequestStatus(requestId,status){
  const note=['rejected','report_ready'].includes(status)
    ? (prompt(status==='rejected'?'Optional rejection reason:':'Optional note for patient:')||'')
    : '';

  const {error}=await supabaseClient.rpc(
    'update_diagnostic_request_status',
    {
      target_request:requestId,
      new_status:status,
      note
    }
  );

  if(error){
    alert(error.message);
    return;
  }

  await loadLabDiagnosticInbox();
}

async function loadPendingLabs(){
  const container=document.getElementById('pendingLabs');
  if(!container || currentProfile?.role!=='admin')return;

  const {data:profiles,error}=await supabaseClient
    .from('profiles')
    .select('id,full_name,verification_status,created_at')
    .eq('role','lab')
    .eq('verification_status','pending')
    .order('created_at',{ascending:true});

  if(error){
    container.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!profiles?.length){
    container.innerHTML='<div class="card"><b>No pending diagnostic-centre applications.</b></div>';
    return;
  }

  const ids=profiles.map(p=>p.id);
  const {data:details}=await supabaseClient
    .from('lab_profiles')
    .select('*')
    .in('id',ids);

  const detailMap=Object.fromEntries((details||[]).map(l=>[l.id,l]));

  container.innerHTML=profiles.map(p=>{
    const l=detailMap[p.id]||{};

    return `
      <div class="card">
        <div class="row between">
          <div>
            <h2 style="margin:0">${escapeAdmin(l.lab_name||p.full_name||'Diagnostic centre')}</h2>
            <span class="badge">pending</span>
          </div>
        </div>
        <div class="grid" style="margin-top:14px">
          <div><small>REGISTRATION</small><p>${escapeAdmin(l.registration_number||'—')}</p></div>
          <div><small>DISTRICT</small><p>${escapeAdmin(l.district||'—')}</p></div>
          <div><small>CITY</small><p>${escapeAdmin(l.city||'—')}</p></div>
          <div><small>PHONE</small><p>${escapeAdmin(l.phone||'—')}</p></div>
        </div>
        <div class="row">
          <button class="btn" onclick="setLabVerification('${p.id}','verified')">Approve centre</button>
          <button class="btn secondary" onclick="setLabVerification('${p.id}','rejected')">Reject</button>
        </div>
      </div>`;
  }).join('');
}

async function setLabVerification(userId,status){
  if(!['verified','rejected'].includes(status))return;
  if(!confirm(`${status==='verified'?'Approve':'Reject'} this diagnostic centre?`))return;

  const {error}=await supabaseClient
    .from('profiles')
    .update({verification_status:status})
    .eq('id',userId)
    .eq('role','lab');

  if(error){
    alert(error.message);
    return;
  }

  await loadPendingLabs();
}

async function loadPharmacyProfile(){
  const {data,error}=await supabaseClient
    .from('pharmacy_profiles')
    .select('*')
    .eq('id',currentUser.id)
    .maybeSingle();

  if(error){
    msg('profileMessage',error.message,'error');
    return;
  }

  const p=data||{};
  document.getElementById('pharmacyName').value=p.pharmacy_name||'';
  document.getElementById('pharmacyLicense').value=p.drug_license_number||'';
  document.getElementById('pharmacyAddress').value=p.address||'';
  document.getElementById('pharmacyCity').value=p.city||'';
  document.getElementById('pharmacyDistrict').value=p.district||'';
  document.getElementById('pharmacyState').value=p.state||'Uttar Pradesh';
  document.getElementById('pharmacyPhone').value=p.phone||'';
  document.getElementById('pharmacyMapsLink').value=p.google_maps_url||'';
  document.getElementById('pharmacyLatitude').value=p.latitude??'';
  document.getElementById('pharmacyLongitude').value=p.longitude??'';

  const status=document.getElementById('pharmacyLocationStatus');
  status.textContent=(p.latitude!=null&&p.longitude!=null)
    ? `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}`
    : 'Location not captured yet';
}

async function savePharmacy(e){
  e.preventDefault();

  const lat=val('pharmacyLatitude');
  const lng=val('pharmacyLongitude');

  const payload={
    id:currentUser.id,
    pharmacy_name:val('pharmacyName'),
    drug_license_number:val('pharmacyLicense'),
    address:val('pharmacyAddress')||null,
    city:val('pharmacyCity')||null,
    district:val('pharmacyDistrict')||null,
    state:val('pharmacyState')||'Uttar Pradesh',
    phone:val('pharmacyPhone')||null,
    google_maps_url:val('pharmacyMapsLink')||null,
    latitude:lat?Number(lat):null,
    longitude:lng?Number(lng):null,
    updated_at:new Date().toISOString()
  };

  const {error}=await supabaseClient
    .from('pharmacy_profiles')
    .upsert(payload);

  msg(
    'profileMessage',
    error?error.message:'Pharmacy profile saved. Verification remains pending until approved.',
    error?'error':'success'
  );
}

function usePharmacyLocation(){
  const status=document.getElementById('pharmacyLocationStatus');
  const help=document.getElementById('pharmacyLocationHelp');

  if(!navigator.geolocation){
    status.textContent='Location is not supported on this device/browser.';
    help.textContent='Enter latitude/longitude manually or keep your Google Maps link.';
    return;
  }

  status.textContent='Detecting location...';
  help.textContent='';

  navigator.geolocation.getCurrentPosition(
    pos=>{
      document.getElementById('pharmacyLatitude').value=pos.coords.latitude;
      document.getElementById('pharmacyLongitude').value=pos.coords.longitude;
      status.textContent=`Location detected: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      help.textContent='This location will help patients find this pharmacy by distance.';
    },
    err=>{
      if(err.code===1){
        status.textContent='Location permission is blocked.';
        help.textContent='Enable Location Services and browser location permission, then tap Retry GPS. You can also enter latitude/longitude manually.';
      }else{
        status.textContent='Could not detect location.';
        help.textContent=(err.message||'Try again or enter coordinates manually.');
      }
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}

function retryPharmacyLocation(){
  usePharmacyLocation();
}

async function loadPharmacyPage(){
  await loadProfile();

  const patientView=document.getElementById('patientPharmacyView');
  const pharmacyView=document.getElementById('pharmacyOperatorView');
  const gate=document.getElementById('pharmacyGate');

  patientView.classList.add('hidden');
  pharmacyView.classList.add('hidden');
  gate.classList.add('hidden');

  if(!currentUser){
    gate.classList.remove('hidden');
    return;
  }

  if(currentProfile?.role==='patient'){
    patientView.classList.remove('hidden');
    document.getElementById('pharmacyPageTitle').textContent='Prescription fulfilment';
    document.getElementById('pharmacyPageSubtitle').textContent='Send a doctor-recorded prescription to a verified participating pharmacy and track its status.';
    await loadPatientPharmacyPage();
    return;
  }

  if(currentProfile?.role==='pharmacy' && currentProfile?.verification_status==='verified'){
    pharmacyView.classList.remove('hidden');
    document.getElementById('pharmacyPageTitle').textContent='Pharmacy workspace';
    document.getElementById('pharmacyPageSubtitle').textContent='Receive prescription requests and move them through preparation to fulfilment.';
    await loadPharmacyInbox();
    return;
  }

  gate.classList.remove('hidden');
}

async function getVerifiedPharmacies(){
  const {data,error}=await supabaseClient.rpc('get_verified_pharmacies');

  cachedVerifiedPharmacies=data||[];
  return {rows:cachedVerifiedPharmacies,error};
}

function pharmacyDistanceKm(lat1,lng1,lat2,lng2){
  const toRad=x=>x*Math.PI/180;
  const R=6371;
  const dLat=toRad(lat2-lat1);
  const dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function getLocationFilteredPharmacies(){
  const place=(document.getElementById('patientPharmacyPlace')?.value||'').trim().toLowerCase();
  const radius=Number(document.getElementById('patientPharmacyRadius')?.value||25);

  // Location is mandatory: either explicit place or GPS.
  if(!patientPharmacyLocation && place.length<2)return [];

  let rows=cachedVerifiedPharmacies.map(p=>{
    let distance=null;
    if(patientPharmacyLocation && p.latitude!=null && p.longitude!=null){
      distance=pharmacyDistanceKm(
        patientPharmacyLocation.lat,
        patientPharmacyLocation.lng,
        Number(p.latitude),
        Number(p.longitude)
      );
    }
    return {...p,distance};
  });

  if(patientPharmacyLocation){
    rows=rows
      .filter(p=>p.distance!=null && p.distance<=radius)
      .sort((a,b)=>a.distance-b.distance);
  }else{
    rows=rows.filter(p=>
      [p.city,p.district]
        .filter(Boolean)
        .some(v=>String(v).toLowerCase().includes(place))
    );
  }

  return rows;
}

function handlePatientPharmacyPlaceInput(){
  patientPharmacyLocation=null;
  const status=document.getElementById('patientPharmacyLocationStatus');
  if(status)status.textContent='Searching by city/district. Distance filter is off.';
  clearTimeout(patientPharmacyPlaceDebounce);
  patientPharmacyPlaceDebounce=setTimeout(()=>refreshPatientPharmacyLocationView(),250);
}

function refreshPatientPharmacyLocationView(){
  renderPatientPharmacyDiscovery();
  renderPatientPrescriptionFulfilment();
}

function renderPatientPharmacyDiscovery(){
  const box=document.getElementById('patientNearbyPharmacies');
  if(!box)return;

  const place=(document.getElementById('patientPharmacyPlace')?.value||'').trim();
  const radius=Number(document.getElementById('patientPharmacyRadius')?.value||25);

  if(!patientPharmacyLocation && place.length<2){
    box.innerHTML=`<div class="empty-state compact-empty-state">
      <div class="empty-icon">📍</div>
      <h3>Choose your location first</h3>
      <p class="muted">Enter a city/district or use your current location. Pharmacies will not be listed globally.</p>
    </div>`;
    return;
  }

  const rows=getLocationFilteredPharmacies();

  if(!rows.length){
    box.innerHTML='<p class="muted">No verified participating pharmacies are available in this selected location yet.</p>';
    return;
  }

  box.innerHTML=rows.map((p,index)=>`
    <div class="pharmacy-discovery-card">
      <div class="pharmacy-discovery-number">${index+1}</div>
      <div class="pharmacy-discovery-main">
        <h3>${escapeAdmin(p.pharmacy_name||'Pharmacy')}</h3>
        <p class="muted">${escapeAdmin([p.address,p.city,p.district,p.state].filter(Boolean).join(' · '))}</p>
        <div class="pharmacy-discovery-meta">
          ${p.distance!=null?`<span>📍 ${p.distance.toFixed(1)} km away</span>`:''}
          ${p.phone?`<span>☎ ${escapeAdmin(p.phone)}</span>`:''}
        </div>
        <div class="row" style="margin-top:8px">
          ${p.google_maps_url?`<button class="btn secondary" onclick="window.open('${escapeAdmin(p.google_maps_url)}','_blank','noopener,noreferrer')">Open Maps</button>`:''}
        </div>
      </div>
    </div>
  `).join('');
}

function usePatientPharmacyLocation(){
  const status=document.getElementById('patientPharmacyLocationStatus');

  if(!navigator.geolocation){
    status.textContent='Location is not supported on this device/browser.';
    return;
  }

  status.textContent='Detecting your location...';

  navigator.geolocation.getCurrentPosition(
    pos=>{
      patientPharmacyLocation={
        lat:pos.coords.latitude,
        lng:pos.coords.longitude
      };
      status.textContent=`Location detected · ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      refreshPatientPharmacyLocationView();
    },
    err=>{
      patientPharmacyLocation=null;
      status.textContent=err.code===1
        ? 'Location permission is blocked. Enable Location Services/browser permission, or search by city/district.'
        : (err.message||'Could not detect location. Search by city/district instead.');
      refreshPatientPharmacyLocationView();
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
  );
}

async function loadPatientPharmacyPage(){
  const list=document.getElementById('patientPrescriptionFulfilmentList');
  const requestsBox=document.getElementById('patientPharmacyRequests');

  const [{data:consultations,error:cErr},pharmacyResult,{data:requests,error:rErr}]=await Promise.all([
    supabaseClient
      .from('consultations')
      .select('id,appointment_id,diagnosis,follow_up_date,created_at')
      .eq('patient_id',currentUser.id)
      .order('created_at',{ascending:false}),
    getVerifiedPharmacies(),
    supabaseClient
      .from('pharmacy_requests')
      .select('*')
      .eq('patient_id',currentUser.id)
      .order('requested_at',{ascending:false})
  ]);

  if(cErr){
    list.innerHTML=`<p class="error">${escapeAdmin(cErr.message)}</p>`;
    return;
  }

  if(pharmacyResult.error){
    list.innerHTML=`<p class="error">${escapeAdmin(pharmacyResult.error.message)}</p>`;
    return;
  }

  const consultationIds=(consultations||[]).map(c=>c.id);
  let items=[];
  if(consultationIds.length){
    const {data}=await supabaseClient
      .from('prescription_items')
      .select('*')
      .in('consultation_id',consultationIds);
    items=data||[];
  }

  const itemMap={};
  items.forEach(i=>{
    (itemMap[i.consultation_id] ||= []).push(i);
  });

  const pharmacies=pharmacyResult.rows||[];
  cachedVerifiedPharmacies=pharmacies;

  patientPharmacyPageData={
    consultations:consultations||[],
    items,
    requests:requests||[]
  };

  renderPatientPharmacyDiscovery();
  renderPatientPrescriptionFulfilment();

  if(rErr){
    requestsBox.innerHTML=`<p class="error">${escapeAdmin(rErr.message)}</p>`;
    return;
  }

  await renderPatientPharmacyRequests(requests||[],requestsBox);
}


function renderPatientPrescriptionFulfilment(){
  const list=document.getElementById('patientPrescriptionFulfilmentList');
  if(!list)return;

  const {consultations,items,requests}=patientPharmacyPageData;

  const itemMap={};
  (items||[]).forEach(i=>{
    (itemMap[i.consultation_id] ||= []).push(i);
  });

  const requestByConsultation={};
  (requests||[]).forEach(r=>{
    if(['requested','accepted','preparing','ready'].includes(r.status) && !requestByConsultation[r.consultation_id]){
      requestByConsultation[r.consultation_id]=r;
    }
  });

  const withRx=(consultations||[]).filter(c=>(itemMap[c.id]||[]).length);

  if(!withRx.length){
    list.innerHTML='<p class="muted">No doctor-recorded prescriptions are available yet.</p>';
    return;
  }

  const place=(document.getElementById('patientPharmacyPlace')?.value||'').trim();
  const locationChosen=!!patientPharmacyLocation || place.length>=2;
  const pharmacies=locationChosen ? getLocationFilteredPharmacies() : [];

  list.innerHTML=withRx.map(c=>{
    const meds=itemMap[c.id]||[];
    const active=requestByConsultation[c.id];

    const pharmacyOptions=pharmacies.map(p=>
      `<option value="${p.id}">${escapeAdmin(p.pharmacy_name)}${p.district?` · ${escapeAdmin(p.district)}`:''}${p.distance!=null?` · ${p.distance.toFixed(1)} km`:''}</option>`
    ).join('');

    let fulfilmentArea='';

    if(active){
      fulfilmentArea=`
        <div class="pharmacy-active-request">
          <b>Already sent</b>
          <span>${escapeAdmin(pharmacyStatusLabel(active.status))}</span>
        </div>`;
    }else if(!locationChosen){
      fulfilmentArea=`
        <div class="prescription-location-note">
          <b>Want to send this prescription to a pharmacy?</b>
          <span class="muted">Choose a city/district or use your current location above. Your prescription remains visible regardless of location.</span>
        </div>`;
    }else if(!pharmacies.length){
      fulfilmentArea=`
        <div class="prescription-location-note">
          <b>No participating pharmacy found in this location.</b>
          <span class="muted">Try another city/district or a different GPS radius.</span>
        </div>`;
    }else{
      fulfilmentArea=`
        <div class="pharmacy-send-box">
          <label><b>Choose pharmacy in selected location</b>
            <select id="pharmacySelect-${c.id}">${pharmacyOptions}</select>
          </label>
          <label><b>Note (optional)</b>
            <input id="pharmacyNote-${c.id}" placeholder="e.g. Please confirm when ready">
          </label>
          <button class="btn" onclick="sendPrescriptionToPharmacy('${c.id}')">Send prescription</button>
        </div>`;
    }

    return `
      <div class="prescription-fulfilment-card">
        <div class="row between">
          <div>
            <span class="badge">Prescription</span>
            <h3>${escapeAdmin(c.diagnosis||'Consultation prescription')}</h3>
            <p class="muted">${new Date(c.created_at).toLocaleDateString('en-IN',{dateStyle:'medium'})}</p>
          </div>
        </div>

        <div class="rx-medicine-list">
          ${meds.map(m=>`
            <div class="rx-medicine-row">
              <b>${escapeAdmin(m.medicine_name)}</b>
              <span class="muted">${escapeAdmin([m.strength,m.dose,m.frequency,m.duration].filter(Boolean).join(' · '))}</span>
              ${m.instructions?`<small>${escapeAdmin(m.instructions)}</small>`:''}
            </div>`).join('')}
        </div>

        ${fulfilmentArea}
      </div>`;
  }).join('');
}


function pharmacyStatusLabel(status){
  return ({
    requested:'Sent to pharmacy',
    accepted:'Accepted',
    preparing:'Preparing medicines',
    ready:'Ready for collection',
    fulfilled:'Fulfilled',
    rejected:'Rejected by pharmacy',
    cancelled:'Cancelled'
  })[status]||status;
}

async function renderPatientPharmacyRequests(requests,box){
  if(!requests.length){
    box.innerHTML='<p class="muted">No pharmacy requests yet.</p>';
    return;
  }

  const pharmacyIds=[...new Set(requests.map(r=>r.pharmacy_id))];
  const {data:pharmacies}=await supabaseClient
    .from('pharmacy_profiles')
    .select('id,pharmacy_name,district,city')
    .in('id',pharmacyIds);

  const pMap=Object.fromEntries((pharmacies||[]).map(p=>[p.id,p]));

  box.innerHTML=requests.map(r=>{
    const p=pMap[r.pharmacy_id]||{};
    return `
      <div class="pharmacy-request-card">
        <div class="row between">
          <div>
            <h3>${escapeAdmin(p.pharmacy_name||'Pharmacy')}</h3>
            <p class="muted">${escapeAdmin([p.city,p.district].filter(Boolean).join(' · '))}</p>
          </div>
          <span class="pharmacy-status ${escapeAdmin(r.status)}">${escapeAdmin(pharmacyStatusLabel(r.status))}</span>
        </div>
        ${r.pharmacy_note?`<p><b>Pharmacy note:</b> ${escapeAdmin(r.pharmacy_note)}</p>`:''}
        <p class="muted">Sent ${new Date(r.requested_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</p>
        ${r.status==='requested'?`<button class="btn secondary" onclick="cancelPharmacyRequest('${r.id}')">Cancel request</button>`:''}
      </div>`;
  }).join('');
}

async function sendPrescriptionToPharmacy(consultationId){
  const pharmacyId=document.getElementById(`pharmacySelect-${consultationId}`)?.value;
  const note=document.getElementById(`pharmacyNote-${consultationId}`)?.value||'';

  if(!pharmacyId){
    alert('Choose a pharmacy.');
    return;
  }

  const {error}=await supabaseClient.rpc(
    'create_pharmacy_request',
    {
      target_consultation:consultationId,
      target_pharmacy:pharmacyId,
      request_note:note
    }
  );

  if(error){
    alert(error.message);
    return;
  }

  toast('Prescription sent','The pharmacy can now review the request.');
  await loadPatientPharmacyPage();
}

async function cancelPharmacyRequest(requestId){
  if(!confirm('Cancel this pharmacy request?'))return;

  const {error}=await supabaseClient.rpc(
    'cancel_pharmacy_request',
    {target_request:requestId}
  );

  if(error){
    alert(error.message);
    return;
  }

  await loadPatientPharmacyPage();
}

async function loadPharmacyInbox(){
  const box=document.getElementById('pharmacyRequestInbox');

  const {data:requests,error}=await supabaseClient
    .from('pharmacy_requests')
    .select('*')
    .eq('pharmacy_id',currentUser.id)
    .order('requested_at',{ascending:false});

  if(error){
    box.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!requests?.length){
    box.innerHTML='<p class="muted">No prescription requests yet.</p>';
    return;
  }

  const requestIds=requests.map(r=>r.id);
  const patientIds=[...new Set(requests.map(r=>r.patient_id))];

  const [{data:items},{data:patients}]=await Promise.all([
    supabaseClient.from('pharmacy_request_items').select('*').in('request_id',requestIds),
    supabaseClient.from('profiles').select('id,full_name').in('id',patientIds)
  ]);

  const itemMap={};
  (items||[]).forEach(i=>(itemMap[i.request_id] ||= []).push(i));
  const patientMap=Object.fromEntries((patients||[]).map(p=>[p.id,p.full_name||'Patient']));

  box.innerHTML=requests.map(r=>{
    const meds=itemMap[r.id]||[];
    return `
      <div class="pharmacy-request-card pharmacy-inbox-card">
        <div class="row between">
          <div>
            <h3>${escapeAdmin(patientMap[r.patient_id]||'Patient')}</h3>
            <p class="muted">Requested ${new Date(r.requested_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</p>
          </div>
          <span class="pharmacy-status ${escapeAdmin(r.status)}">${escapeAdmin(pharmacyStatusLabel(r.status))}</span>
        </div>

        ${r.patient_note?`<p><b>Patient note:</b> ${escapeAdmin(r.patient_note)}</p>`:''}

        <div class="rx-medicine-list">
          ${meds.map(m=>`
            <div class="rx-medicine-row">
              <b>${escapeAdmin(m.medicine_name)}</b>
              <span class="muted">${escapeAdmin([m.strength,m.dose,m.frequency,m.duration].filter(Boolean).join(' · '))}</span>
              ${m.instructions?`<small>${escapeAdmin(m.instructions)}</small>`:''}
            </div>`).join('')}
        </div>

        <div class="pharmacy-inbox-actions">
          ${r.status==='requested'
            ? `<button class="btn" onclick="setPharmacyRequestStatus('${r.id}','accepted')">Accept</button>
               <button class="btn secondary" onclick="setPharmacyRequestStatus('${r.id}','rejected')">Reject</button>`
            : ''}
          ${r.status==='accepted'
            ? `<button class="btn" onclick="setPharmacyRequestStatus('${r.id}','preparing')">Start preparing</button>`
            : ''}
          ${r.status==='preparing'
            ? `<button class="btn" onclick="setPharmacyRequestStatus('${r.id}','ready')">Mark ready</button>`
            : ''}
          ${r.status==='ready'
            ? `<button class="btn" onclick="setPharmacyRequestStatus('${r.id}','fulfilled')">Mark fulfilled</button>`
            : ''}
        </div>
      </div>`;
  }).join('');
}

async function setPharmacyRequestStatus(requestId,status){
  const note=status==='rejected'
    ? (prompt('Optional reason for rejection:')||'')
    : '';

  const {error}=await supabaseClient.rpc(
    'update_pharmacy_request_status',
    {
      target_request:requestId,
      new_status:status,
      note
    }
  );

  if(error){
    alert(error.message);
    return;
  }

  await loadPharmacyInbox();
}

async function loadPendingPharmacies(){
  const container=document.getElementById('pendingPharmacies');
  if(!container || currentProfile?.role!=='admin')return;

  const {data:profiles,error}=await supabaseClient
    .from('profiles')
    .select('id,full_name,phone,verification_status,created_at')
    .eq('role','pharmacy')
    .eq('verification_status','pending')
    .order('created_at',{ascending:true});

  if(error){
    container.innerHTML=`<p class="error">${escapeAdmin(error.message)}</p>`;
    return;
  }

  if(!profiles?.length){
    container.innerHTML='<div class="card"><b>No pending pharmacy applications.</b></div>';
    return;
  }

  const ids=profiles.map(p=>p.id);
  const {data:details}=await supabaseClient
    .from('pharmacy_profiles')
    .select('*')
    .in('id',ids);

  const detailMap=Object.fromEntries((details||[]).map(p=>[p.id,p]));

  container.innerHTML=profiles.map(p=>{
    const d=detailMap[p.id]||{};
    return `
      <div class="card">
        <div class="row between">
          <div>
            <h2 style="margin:0">${escapeAdmin(d.pharmacy_name||p.full_name||'Unnamed pharmacy')}</h2>
            <span class="badge">pending</span>
          </div>
        </div>
        <div class="grid" style="margin-top:14px">
          <div><small>DRUG LICENCE</small><p>${escapeAdmin(d.drug_license_number||'—')}</p></div>
          <div><small>DISTRICT</small><p>${escapeAdmin(d.district||'—')}</p></div>
          <div><small>CITY</small><p>${escapeAdmin(d.city||'—')}</p></div>
          <div><small>PHONE</small><p>${escapeAdmin(d.phone||p.phone||'—')}</p></div>
        </div>
        <div class="row">
          <button class="btn" onclick="setPharmacyVerification('${p.id}','verified')">Approve pharmacy</button>
          <button class="btn secondary" onclick="setPharmacyVerification('${p.id}','rejected')">Reject</button>
        </div>
      </div>`;
  }).join('');
}

async function setPharmacyVerification(userId,status){
  if(!['verified','rejected'].includes(status))return;
  if(!confirm(`${status==='verified'?'Approve':'Reject'} this pharmacy?`))return;

  const {error}=await supabaseClient
    .from('profiles')
    .update({verification_status:status})
    .eq('id',userId)
    .eq('role','pharmacy');

  if(error){
    alert(error.message);
    return;
  }

  await loadPendingPharmacies();
}

async function loadAdminPage(){
  const gate=document.getElementById('adminGate'),content=document.getElementById('adminContent');
  await loadProfile();
  const allowed=currentUser&&currentProfile?.role==='admin'&&currentProfile?.verification_status==='verified';
  if(!allowed){gate.classList.remove('hidden');content.classList.add('hidden');return}
  gate.classList.add('hidden');content.classList.remove('hidden');
  await loadPendingDoctors();
  await loadPendingHospitals();
}

async function loadPendingDoctors(){
  if(!currentUser||currentProfile?.role!=='admin')return;
  msg('adminMessage','Loading...');
  const {data:profiles,error:pErr}=await supabaseClient
    .from('profiles')
    .select('id,full_name,phone,verification_status,created_at')
    .eq('role','doctor')
    .eq('verification_status','pending')
    .order('created_at',{ascending:true});

  if(pErr){msg('adminMessage',pErr.message,'error');return}
  const container=document.getElementById('pendingDoctors');
  if(!profiles||profiles.length===0){
    container.innerHTML='<div class="card"><b>No pending doctor applications.</b></div>';
    msg('adminMessage','');
    return;
  }

  const ids=profiles.map(x=>x.id);
  const {data:doctors,error:dErr}=await supabaseClient
    .from('doctor_profiles')
    .select('id,specialty,qualification,medical_registration_number,hospital_name,experience_years,license_certificate_path')
    .in('id',ids);

  if(dErr){msg('adminMessage',dErr.message,'error');return}
  const doctorMap=Object.fromEntries((doctors||[]).map(d=>[d.id,d]));

  container.innerHTML=profiles.map(p=>{
    const d=doctorMap[p.id]||{};
    const certButton=d.license_certificate_path
      ? `<button class="btn secondary" onclick="openDoctorCertificate('${p.id}')">Open certificate</button>`
      : `<span class="muted">No certificate uploaded</span>`;
    return `<div class="card" id="doctor-${p.id}">
      <div class="row between">
        <div>
          <h2 style="margin:0">${escapeAdmin(p.full_name||'Unnamed doctor')}</h2>
          <span class="badge">pending</span>
        </div>
      </div>
      <div class="grid" style="margin-top:14px">
        <div><small>SPECIALTY</small><p>${escapeAdmin(d.specialty||'—')}</p></div>
        <div><small>QUALIFICATION</small><p>${escapeAdmin(d.qualification||'—')}</p></div>
        <div><small>REGISTRATION NUMBER</small><p>${escapeAdmin(d.medical_registration_number||'—')}</p></div>
        <div><small>HOSPITAL / CLINIC</small><p>${escapeAdmin(d.hospital_name||'—')}</p></div>
        <div><small>EXPERIENCE</small><p>${d.experience_years??'—'} years</p></div>
        <div><small>PHONE</small><p>${escapeAdmin(p.phone||'—')}</p></div>
      </div>
      <div class="row" style="margin-top:12px">
        ${certButton}
        <button class="btn" onclick="setDoctorVerification('${p.id}','verified')">Approve doctor</button>
        <button class="btn secondary" onclick="setDoctorVerification('${p.id}','rejected')">Reject</button>
      </div>
    </div>`;
  }).join('');
  msg('adminMessage','');
}

async function openDoctorCertificate(userId){
  const {data:doctor,error}=await supabaseClient
    .from('doctor_profiles')
    .select('license_certificate_path')
    .eq('id',userId)
    .single();

  if(error||!doctor?.license_certificate_path){
    msg('adminMessage',error?.message||'No certificate found.','error');
    return;
  }

  const {data,error:sErr}=await supabaseClient.storage
    .from('Doctor verification')
    .createSignedUrl(doctor.license_certificate_path,60);

  if(sErr){msg('adminMessage',sErr.message,'error');return}
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}

async function setDoctorVerification(userId,status){
  if(!['verified','rejected'].includes(status))return;
  const action=status==='verified'?'approve':'reject';
  if(!confirm(`Are you sure you want to ${action} this doctor?`))return;

  const {error}=await supabaseClient
    .from('profiles')
    .update({verification_status:status})
    .eq('id',userId)
    .eq('role','doctor');

  if(error){msg('adminMessage',error.message,'error');return}
  msg('adminMessage',status==='verified'?'Doctor approved successfully.':'Doctor application rejected.','success');
  await loadPendingDoctors();
}

function escapeAdmin(s){
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

supabaseClient.auth.onAuthStateChange((_e,s)=>handleSession(s));(async()=>{let {data}=await supabaseClient.auth.getSession();await handleSession(data.session)})();
