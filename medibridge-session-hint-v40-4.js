/* MediBridge v40.4 — visual-only returning-session hint.
   Authorization still comes exclusively from Supabase and server-side RLS. */
(()=>{
  try{
    for(let index=0;index<localStorage.length;index+=1){
      const key=localStorage.key(index)||'';
      if(!/^sb-.*-auth-token$/.test(key))continue;
      const stored=JSON.parse(localStorage.getItem(key)||'null');
      const session=stored?.currentSession||stored?.session||stored;
      if(!session?.user?.id || (!session?.access_token && !session?.refresh_token))continue;
      const metadata=session.user.user_metadata||{};
      window.__MEDIBRIDGE_SESSION_HINT__={
        id:session.user.id,
        email:session.user.email||'',
        role:String(metadata.role||'').toLowerCase(),
        full_name:String(metadata.full_name||metadata.name||'')
      };
      document.documentElement.classList.add('mb-session-hint');
      return;
    }
  }catch(_){
    // A damaged or unavailable storage entry must never block MediBridge.
  }
  document.documentElement.classList.add('mb-no-session-hint');
})();
