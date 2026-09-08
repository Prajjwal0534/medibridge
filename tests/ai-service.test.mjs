import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const filename = html.match(/src="(medibridge-ai-service[^"?]+\.js)\?/)[1];
const source = fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');

function service(fetcher, session = {access_token: 'synthetic-session'}) {
  const context = vm.createContext({
    AbortController, DOMException, setTimeout, clearTimeout, fetch: fetcher,
    window: {MEDIBRIDGE_AI_CONFIG: {enabled: true, provider: 'backend', endpoint: '/test'}},
    supabaseClient: {auth: {getSession: async () => ({data: {session}, error: null})}}
  });
  vm.runInContext(source, context);
  return context.window.MediBridgeAI;
}

test('Stop during response-body parsing remains a cancellation', async () => {
  const controller = new AbortController();
  const ai = service(async () => ({ok: true, json: async () => {
    controller.abort();
    throw new DOMException('Body aborted', 'AbortError');
  }}));
  await assert.rejects(ai.chatWithAI({messages: [{role: 'user', content: 'Synthetic'}], signal: controller.signal}),
    error => error.code === 'MEDIBRIDGE_AI_CANCELLED');
});

test('client omits browser system messages and attaches the session token', async () => {
  const ai = service(async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(JSON.parse(options.body).messages.length, 1);
    return Response.json({text: 'Synthetic answer', model: 'test-model'});
  });
  const result = await ai.chatWithAI({messages: [{role: 'system', content: 'not permitted'}, {role: 'user', content: 'Synthetic'}]});
  assert.equal(result.text, 'Synthetic answer');
});

test('missing session fails before sending a request', async () => {
  let calls = 0;
  const ai = service(async () => {calls++;}, null);
  await assert.rejects(ai.chatWithAI({messages: []}), /Sign in again/);
  assert.equal(calls, 0);
});
