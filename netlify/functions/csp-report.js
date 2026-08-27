'use strict';

const rateWindows=new Map();
const WINDOW_MS=10*60*1000;
const LIMIT=60;
const MAX_RATE_KEYS=2000;

function reply(status){
  return {statusCode:status,headers:{'cache-control':'no-store','content-type':'application/json; charset=utf-8'},body:'{}'};
}

function safeHost(value){
  try{return new URL(String(value||'')).host.slice(0,160)}catch(_){return 'unknown'}
}

function rateLimited(event){
  const ip=String(event.headers?.['x-nf-client-connection-ip']||event.headers?.['x-forwarded-for']||'unknown').split(',')[0].trim();
  const now=Date.now();
  for(const [key,value] of rateWindows){
    if(now-value.startedAt>WINDOW_MS)rateWindows.delete(key);
  }
  if(!rateWindows.has(ip) && rateWindows.size>=MAX_RATE_KEYS){
    rateWindows.delete(rateWindows.keys().next().value);
  }
  const entry=rateWindows.get(ip);
  if(!entry){rateWindows.set(ip,{startedAt:now,count:1});return false}
  entry.count+=1;
  return entry.count>LIMIT;
}

exports.handler=async event=>{
  if(event.httpMethod!=='POST')return reply(405);
  if(rateLimited(event))return reply(429);
  if(Buffer.byteLength(event.body||'','utf8')>16384)return reply(413);
  let body;
  try{body=JSON.parse(event.body||'{}')}catch(_){return reply(400)}
  const report=body['csp-report']||body;
  console.warn(JSON.stringify({
    kind:'medibridge_csp_report',
    document_host:safeHost(report['document-uri']||report.documentURL),
    blocked_host:safeHost(report['blocked-uri']||report.blockedURL),
    violated_directive:String(report['violated-directive']||report.effectiveDirective||'unknown').replace(/[^a-zA-Z0-9 -]/g,'').slice(0,120),
    received_at:new Date().toISOString()
  }));
  return reply(204);
};
