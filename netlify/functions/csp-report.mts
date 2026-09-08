import {createRateLimiter, json, readJson} from './_shared/http.js';

const rateLimited=createRateLimiter(60);
const reply=status=>json(status,{});

function safeHost(value){
  try{return new URL(String(value||'')).host.slice(0,160)}catch(_){return 'unknown'}
}

export default async function cspReport(request, context={}){
  if(request.method!=='POST')return reply(405);
  if(rateLimited(context.ip))return reply(429);
  let body;
  try{body=await readJson(request,16384)}catch(error){return reply(error.status||400)}
  const report=body['csp-report']||body;
  if(typeof report!=='object'||Array.isArray(report))return reply(400);
  console.warn(JSON.stringify({
    kind:'medibridge_csp_report',
    document_host:safeHost(report['document-uri']||report.documentURL),
    blocked_host:safeHost(report['blocked-uri']||report.blockedURL),
    violated_directive:String(report['violated-directive']||report.effectiveDirective||'unknown').replace(/[^a-zA-Z0-9 -]/g,'').slice(0,120),
    received_at:new Date().toISOString()
  }));
  return reply(204);
};
