import {createRateLimiter, env, json as response, readJson} from './_shared/http.js';

const rateLimited=createRateLimiter(30);

function token(value,max=80){
  return String(value||'unknown').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,max)||'unknown';
}

export default async function clientEvent(request, context={}){
  if(request.method!=='POST')return response(405,{error:'Method not allowed'});
  const allowed=new Set([env('URL'),env('DEPLOY_PRIME_URL'),'https://celebrated-gecko-efd469.netlify.app'].filter(Boolean));
  if(!allowed.has(request.headers.get('origin')))return response(403,{error:'Origin not allowed'});
  if(rateLimited(context.ip))return response(429,{error:'Rate limit exceeded'});

  let body;
  try{body=await readJson(request,4096)}catch(error){return response(error.status||400,{error:error.status===413?'Payload too large':'Invalid JSON'})}
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
