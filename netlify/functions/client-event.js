'use strict';

const rateWindows=new Map();
const MAX_BODY_BYTES=4096;
const WINDOW_MS=10*60*1000;
const LIMIT=30;

function response(status,body){
  return {statusCode:status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)};
}

function sameOrigin(event){
  const origin=event.headers?.origin||event.headers?.Origin||'';
  const allowed=new Set([
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    'https://celebrated-gecko-efd469.netlify.app'
  ].filter(Boolean));
  return allowed.has(origin);
}

function rateLimited(event){
  const ip=String(event.headers?.['x-nf-client-connection-ip']||event.headers?.['x-forwarded-for']||'unknown').split(',')[0].trim();
  const now=Date.now();
  const entry=rateWindows.get(ip);
  if(!entry||now-entry.startedAt>WINDOW_MS){rateWindows.set(ip,{startedAt:now,count:1});return false}
  entry.count+=1;
  return entry.count>LIMIT;
}

function token(value,max=80){
  return String(value||'unknown').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,max)||'unknown';
}

exports.handler=async event=>{
  if(event.httpMethod!=='POST')return response(405,{error:'Method not allowed'});
  if(!sameOrigin(event))return response(403,{error:'Origin not allowed'});
  if(rateLimited(event))return response(429,{error:'Rate limit exceeded'});
  if(Buffer.byteLength(event.body||'','utf8')>MAX_BODY_BYTES)return response(413,{error:'Payload too large'});

  let body;
  try{body=JSON.parse(event.body||'{}')}catch(_){return response(400,{error:'Invalid JSON'})}
  const allowedEvents=new Set(['client_error','unhandled_rejection','private_note_deleted','data_request_created']);
  if(!allowedEvents.has(body.event_type))return response(400,{error:'Unsupported event'});

  const record={
    kind:'medibridge_client_event',
    build:token(body.build,20),
    event_type:body.event_type,
    route:token(body.route),
    error_name:token(body.error_name),
    source:token(body.source),
    line:Number.isFinite(body.line)?Math.max(0,Math.trunc(body.line)):null,
    received_at:new Date().toISOString()
  };
  console.log(JSON.stringify(record));
  return response(202,{accepted:true});
};
