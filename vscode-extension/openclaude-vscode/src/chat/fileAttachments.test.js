const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  attachmentFromPath,
  buildMessageContentWithAttachments,
  quoteMentionPath,
  formatBytes,
} = require('./fileAttachments');

test('quoteMentionPath uses quoted @path for spaces', () => {
  assert.equal(quoteMentionPath('C:\\Users\\John Smith\\file.pdf'), '@"C:\\Users\\John Smith\\file.pdf"');
});

test('attachmentFromPath returns metadata', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-attach-'));
  const file = path.join(dir, 'note.txt');
  fs.writeFileSync(file, 'hello');
  const att = await attachmentFromPath(file);
  assert.equal(att.name, 'note.txt');
  assert.equal(att.size, 5);
  assert.equal(att.sizeLabel, formatBytes(5));
  assert.equal(att.kind, 'text');
  assert.equal(att.mimeType, 'text/plain');
});

test('buildMessageContentWithAttachments appends quoted @paths for non-images', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-attach-'));
  const file = path.join(dir, 'manual.pdf');
  fs.writeFileSync(file, 'fake pdf');
  const result = await buildMessageContentWithAttachments('Leia isso', [{ path: file }]);
  assert.equal(typeof result.content, 'string');
  assert.match(result.content, /Leia isso/);
  assert.match(result.content, /Arquivos anexados:/);
  assert.match(result.content, /@".*manual\.pdf"/);
  assert.equal(result.attachments[0].kind, 'pdf');
});

test('buildMessageContentWithAttachments sends small images inline plus final text block', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-attach-'));
  const file = path.join(dir, 'pixel.png');
  fs.writeFileSync(file, Buffer.from('iVBORw0KGgo=', 'base64'));
  const result = await buildMessageContentWithAttachments('Descreva', [{ path: file }], { maxInlineImageBytes: 1024 });
  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content[0].type, 'image');
  assert.equal(result.content[0].source.media_type, 'image/png');
  assert.equal(result.content.at(-1).type, 'text');
  assert.match(result.content.at(-1).text, /@".*pixel\.png"/);
});
