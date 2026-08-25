'use strict';

(()=>{
  const sent=new Set();
  const endpoint='/.netlify/functions/client-event';
  const build='39';

  function activeRoute(){
    return document.querySelector('.page.active')?.id?.replace(/^page-/,'')||'unknown';
  }

  function cleanToken(value,fallback='unknown'){
    const token=String(value||fallback).split('/').pop().replace(/[^a-zA-Z0-9._-]/g,'').slice(0,80);
    return token||fallback;
  }

  function send(event){
    const payload={
      build,
      event_type:cleanToken(event.event_type),
      route:cleanToken(activeRoute()),
      error_name:cleanToken(event.error_name),
      source:cleanToken(event.source),
      line:Number.isFinite(event.line)?event.line:null,
      occurred_at:new Date().toISOString()
    };
    const key=JSON.stringify(payload);
    if(sent.has(key)||sent.size>=20)return;
    sent.add(key);
    const body=JSON.stringify(payload);
    if(navigator.sendBeacon){
      navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));
      return;
    }
    fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true,credentials:'omit'}).catch(()=>{});
  }

  window.addEventListener('error',event=>send({
    event_type:'client_error',
    error_name:event.error?.name||'Error',
    source:event.filename||'browser',
    line:event.lineno
  }));

  window.addEventListener('unhandledrejection',event=>send({
    event_type:'unhandled_rejection',
    error_name:event.reason?.name||'PromiseRejection',
    source:'promise'
  }));

  window.medibridgeOperationalEvent=(eventType,source='app')=>send({
    event_type:eventType,
    error_name:'OperationalEvent',
    source
  });
})();
