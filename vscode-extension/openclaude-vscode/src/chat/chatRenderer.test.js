const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FAVORITE_SLASH_COMMANDS,
  buildSlashCommandItems,
  filterSlashCommandItems,
  resolveSlashSelection,
  renderChatHtml,
} = require('./chatRenderer');

test('slash palette favorites render before dynamic CLI commands', () => {
  const items = buildSlashCommandItems(['cost', 'compact', 'wiki']);

  assert.equal(items[0].command, '/full');
  assert.equal(items[1].command, '/safe');
  assert.equal(items[2].command, '/plan');
  assert.equal(items.findIndex(item => item.command === '/cost'), FAVORITE_SLASH_COMMANDS.findIndex(item => item.command === '/cost'));
  assert.equal(items.at(-1).command, '/wiki');
});

test('slash palette filters common daily commands', () => {
  const items = buildSlashCommandItems(['cost', 'compact', 'security-review', 'wiki']);

  assert.deepEqual(filterSlashCommandItems(items, '/co').map(item => item.command).slice(0, 3), [
    '/cost',
    '/context',
    '/compact',
  ]);
  assert.equal(filterSlashCommandItems(items, '/security')[0].command, '/security-review');
});

test('slash palette selection resolves local, fill, and direct send actions', () => {
  const items = buildSlashCommandItems(['wiki']);

  assert.deepEqual(resolveSlashSelection(items.find(item => item.command === '/full')), {
    action: 'local',
    command: '/full',
  });
  assert.deepEqual(resolveSlashSelection(items.find(item => item.command === '/commit-message')), {
    action: 'fill',
    text: '/commit-message ',
  });
  assert.deepEqual(resolveSlashSelection(items.find(item => item.command === '/cost')), {
    action: 'send',
    text: '/cost',
  });
});

test('rendered chat includes slash palette controls and power badge', () => {
  const html = renderChatHtml({ nonce: 'test-nonce', platform: 'win32' });

  assert.match(html, /id="slashPalette"/);
  assert.match(html, /id="powerBadge"/);
  assert.match(html, /id="attachBtn"/);
  assert.match(html, /id="attachmentsTray"/);
  assert.match(html, /pick_files/);
  assert.match(html, /attachments_picked/);
  assert.match(html, /paste_files/);
  assert.match(html, /handlePaste/);
  assert.match(html, /FileReader/);
  assert.match(html, /maybeAppendToolFailureHint/);
  assert.match(html, /Dica Windows/);
  assert.match(html, /Mensagem para o OPEN MATRIX/);
  assert.match(html, /Historico de conversas/);
  assert.doesNotMatch(html, /Hist\?rico/);
  assert.doesNotMatch(html, /startsPor/);
  assert.match(html, /startsWith\('\/'\)/);
  assert.doesNotMatch(html, /statusUsage\.textContent = msg\.model/);
  assert.match(html, /local_slash_command/);
  assert.match(html, /ArrowDown/);
  assert.match(html, /Escape/);
  assert.match(html, /function setPowerBadge/);
  assert.match(html, /function updateSlashPalette/);
  assert.match(html, /function chooseSlashItem/);
  assert.doesNotMatch(html, /DEFAULT_DYNAMIC_SLASH_COMMANDS/);
  assert.doesNotMatch(html, /\$\{JSON\.stringify/);

  const script = html.match(/<script nonce="test-nonce">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
});
