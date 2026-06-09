const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getBundledPopplerBinDir, withBundledPopplerEnv } = require('./poppler');

function makePopplerFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openmatrix-poppler-'));
  const binDir = path.join(root, 'vendor', 'poppler', 'win32-x64', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'pdftotext.exe'), '');
  fs.writeFileSync(path.join(binDir, 'pdftoppm.exe'), '');
  return { root, binDir };
}

test('getBundledPopplerBinDir resolves Windows x64 vendor binaries', () => {
  const { root, binDir } = makePopplerFixture();

  const resolved = getBundledPopplerBinDir({
    platform: 'win32',
    arch: 'x64',
    extensionRoot: root,
  });

  assert.equal(resolved.available, true);
  assert.equal(resolved.binDir, binDir);
  assert.equal(resolved.pdftotextPath, path.join(binDir, 'pdftotext.exe'));
  assert.equal(resolved.pdftoppmPath, path.join(binDir, 'pdftoppm.exe'));
});

test('getBundledPopplerBinDir reports unavailable when binaries are missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openmatrix-poppler-missing-'));

  const resolved = getBundledPopplerBinDir({
    platform: 'win32',
    arch: 'x64',
    extensionRoot: root,
  });

  assert.equal(resolved.available, false);
  assert.match(resolved.reason, /Bundled Poppler binaries missing/);
});

test('withBundledPopplerEnv prepends PATH and exports PDF tool paths', () => {
  const { root, binDir } = makePopplerFixture();
  const existingPath = ['C:\\Windows\\System32', 'C:\\Tools'].join(path.delimiter);

  const env = withBundledPopplerEnv({ Path: existingPath }, {
    platform: 'win32',
    arch: 'x64',
    extensionRoot: root,
  });

  assert.equal(env.Path, [binDir, existingPath].join(path.delimiter));
  assert.equal(env.OPEN_MATRIX_POPPLER_PATH, binDir);
  assert.equal(env.OPEN_MATRIX_PDFTOTEXT_PATH, path.join(binDir, 'pdftotext.exe'));
  assert.equal(env.OPEN_MATRIX_PDFTOPPM_PATH, path.join(binDir, 'pdftoppm.exe'));
});
