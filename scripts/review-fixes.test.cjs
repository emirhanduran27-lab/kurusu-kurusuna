const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('renderer/sync.js', 'utf8');
function context(state, user) {
  const ctx = vm.createContext({ SYNC: { cloud: {}, user }, syncState: () => state,
    syncSummary: () => '', esc: s => s, openModal: value => { ctx.modal = value; } });
  for (const [start, end] of [['function syncCardHtml()', 'function authForm('], ['function accountMenu()', 'Object.assign(ACTIONS']]) {
    const offset = source.indexOf(start);
    vm.runInContext(source.slice(offset, source.indexOf(end, offset)), ctx);
  }
  return ctx;
}
test('Signed-in user without a vault key can reach account deletion', () => {
  const ctx = context(null, { email: 'test@example.com' });
  assert.match(vm.runInContext('syncCardHtml()', ctx), /data-action="acct-menu"/);
  vm.runInContext('accountMenu()', ctx);
  assert.equal(ctx.modal.title, 'test@example.com');
  assert.match(ctx.modal.body, /data-action="sync-delete"/);
  assert.doesNotMatch(ctx.modal.body, /data-action="sync-change-pass"/);
});
test('Configured account keeps password and deletion actions', () => {
  const ctx = context({ key: 'key', email: 'test@example.com' }, { email: 'test@example.com' });
  vm.runInContext('accountMenu()', ctx);
  assert.match(ctx.modal.body, /data-action="sync-change-pass"/);
  assert.match(ctx.modal.body, /data-action="sync-delete"/);
});
test('Signed-out account card offers sign-in rather than account controls', () => {
  const ctx = context(null, null);
  const html = vm.runInContext('syncCardHtml()', ctx);
  assert.match(html, /data-action="sync-login"/);
  assert.doesNotMatch(html, /data-action="acct-menu"/);
});
test('Mobile URL opener allows the privacy page and blocks lookalike URLs', async () => {
  const bridge = fs.readFileSync('mobile/bridge.js', 'utf8');
  const method = bridge.match(/openUrl: (async url => .*),\r?\n/)[1];
  const opened = [];
  const ctx = vm.createContext({ Browser: { open: async ({url}) => opened.push(url) } });
  const open = vm.runInContext('(' + method + ')', ctx);
  const url = 'https://emirhanduran27-lab.github.io/kurusu-kurusuna/gizlilik.html';
  await open(url);
  await open(url + '/unexpected');
  await open('https://emirhanduran27-lab.github.io.evil.example/kurusu-kurusuna/gizlilik.html');
  assert.deepEqual(opened, [url]);
});
