'use strict';

function reply(status){
  return {statusCode:status,headers:{'cache-control':'no-store','content-type':'application/json; charset=utf-8'},body:'{}'};
}

function safeHost(value){
  try{return new URL(String(value||'')).host.slice(0,160)}catch(_){return 'unknown'}
}

exports.handler=async event=>{
  if(event.httpMethod!=='POST')return reply(405);
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
