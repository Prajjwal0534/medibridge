import {json} from './_shared/http.js';

export default async function health(request) {
  return request.method === 'GET'
    ? json(200, {status: 'ok', service: 'medibridge-web', build: '40.6'})
    : json(405, {error: 'Method not allowed'}, {Allow: 'GET'});
}
