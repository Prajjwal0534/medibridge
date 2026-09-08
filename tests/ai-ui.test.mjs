import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const activeApp = html.match(/src="(app-v[^"?]+\.js)\?/)[1];
const source = fs.readFileSync(new URL(activeApp, root), 'utf8');
// Exercise the actual AI controller in isolation from unrelated live bootstrap calls.
const aiController = source.slice(source.indexOf("let currentAiMode='patient_explain';"), source.indexOf('const CONSENT_SCOPE_LABELS='));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

function harness({secure = false, chat, invoke} = {}) {
  const elements = new Map();
  function element() {
    const classes = new Set();
    return {
      value: '', innerHTML: '', textContent: '', disabled: false, style: {}, dataset: {},
      scrollHeight: 60, scrollTop: 0, children: [],
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        toggle(name, force) {if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name);},
        contains: name => classes.has(name)
      },
      replaceChildren() {this.children = []; this.innerHTML = '';},
      appendChild(child) {this.children.push(child);},
      querySelector() {return null;}, addEventListener() {}, focus() {}
    };
  }
  const get = id => {if (!elements.has(id)) elements.set(id, element()); return elements.get(id);};
  const messages = [];
  const context = vm.createContext({
    AbortController,
    currentUser: {id: 'synthetic-account-a'}, currentProfile: {role: 'patient'}, activeSubject: 'subject-a',
    document: {getElementById: get, querySelectorAll: () => [], createElement: element},
    window: {MediBridgeAI: {isEnabled: () => true, isSecureBackendMode: () => secure, chatWithAI: chat}},
    supabaseClient: {functions: {invoke}},
    msg: (...args) => messages.push(args), escapeAdmin: String, renderAiMarkdown: String,
    safeHttpsUrl: () => false, safeUrlForMarkup: String
  });
  vm.runInContext('function patientSubjectId(){return activeSubject}', context);
  vm.runInContext(aiController, context);
  return {context, get, messages, run: code => vm.runInContext(code, context)};
}

test('starting a new chat ignores a late answer and an old completion cannot unlock the new request', async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const h = harness({chat: () => (++calls === 1 ? first.promise : second.promise)});
  h.get('aiPrompt').value = 'Old synthetic question';
  const oldRequest = h.run('askMediBridgeAI()');
  h.run('newMediBridgeAiChat()');
  h.get('aiPrompt').value = 'New synthetic question';
  const newRequest = h.run('askMediBridgeAI()');
  first.resolve({text: 'OLD ANSWER MUST NOT APPEAR'});
  await oldRequest;
  assert.equal(h.get('aiAskBtn').disabled, true);
  assert.doesNotMatch(h.get('aiChatThread').innerHTML, /OLD ANSWER/);
  second.resolve({text: 'Current answer'});
  await newRequest;
  assert.equal(h.get('aiAskBtn').disabled, false);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(getAiConversation())')).map(x => x.content), ['New synthetic question', 'Current answer']);
});

test('late secure record summaries cannot populate a different family profile or show old sources', async () => {
  const pending = deferred();
  const h = harness({secure: true, invoke: () => pending.promise});
  h.run("currentAiMode='patient_summary'");
  const request = h.run('askMediBridgeAI()');
  h.run("cancelMediBridgeAiRequest(); activeSubject='subject-b'; mediBridgeAiChats={}; renderAiChatThread()");
  pending.resolve({data: {answer: 'PRIVATE OLD SUMMARY', sources: [{title: 'OLD SOURCE'}]}, error: null});
  await request;
  assert.equal(h.run('getAiConversation().length'), 0);
  assert.doesNotMatch(h.get('aiChatThread').innerHTML, /PRIVATE OLD SUMMARY/);
  assert.equal(h.get('aiSources').innerHTML, '');
  assert.equal(h.get('aiAnswerCard').classList.contains('hidden'), true);
});

test('doctor patient-review histories are separate for each selected patient', () => {
  const h = harness();
  h.run("currentProfile={role:'doctor'}; currentAiMode='doctor_patient_review'");
  h.get('doctorAiPatientSelect').value = 'account-a::subject-a';
  h.run("getAiConversation().push({role:'assistant',content:'Patient A only'})");
  h.get('doctorAiPatientSelect').value = 'account-b::subject-b';
  assert.equal(h.run('getAiConversation().length'), 0);
  h.get('doctorAiPatientSelect').value = 'account-a::subject-a';
  assert.equal(h.run('getAiConversation()[0].content'), 'Patient A only');
});

test('a late error after account change does not replace the new account status', async () => {
  const pending = deferred();
  const h = harness({chat: () => pending.promise});
  h.get('aiPrompt').value = 'Synthetic request';
  const request = h.run('askMediBridgeAI()');
  h.run("cancelMediBridgeAiRequest(); currentUser={id:'synthetic-account-b'}; mediBridgeAiChats={}; renderAiChatThread()");
  const count = h.messages.length;
  pending.reject(new Error('Old network failure'));
  await request;
  assert.equal(h.messages.length, count);
  assert.equal(h.run('getAiConversation().length'), 0);
});
