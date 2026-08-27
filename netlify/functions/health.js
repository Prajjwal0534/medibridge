'use strict';

exports.handler=async event=>({
  statusCode:event.httpMethod==='GET'?200:405,
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
  body:JSON.stringify(event.httpMethod==='GET'?{status:'ok',service:'medibridge-web',build:'40.5'}:{error:'Method not allowed'})
});
