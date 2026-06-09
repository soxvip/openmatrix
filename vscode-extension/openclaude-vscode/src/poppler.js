const fs = require('fs');
const path = require('path');

const PLATFORM_DIRS = new Map([
  ['win32-x64', 'win32-x64'],
]);

function getPathKey(env) {
  return Object.keys(env || {}).find((key) => key.toLowerCase() === 'path') || 'Path';
}

function getExtensionRoot() {
  return path.resolve(__dirname, '..');
}

function getBundledPopplerBinDir(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const extensionRoot = options.extensionRoot || getExtensionRoot();
  const platformDir = PLATFORM_DIRS.get(`${platform}-${arch}`);

  if (!platformDir) {
    return {
      available: false,
      reason: `Bundled Poppler unavailable for ${platform}-${arch}`,
      binDir: null,
      pdftotextPath: null,
      pdftoppmPath: null,
    };
  }

  const binDir = path.join(extensionRoot, 'vendor', 'poppler', platformDir, 'bin');
  const exeSuffix = platform === 'win32' ? '.exe' : '';
  const pdftotextPath = path.join(binDir, `pdftotext${exeSuffix}`);
  const pdftoppmPath = path.join(binDir, `pdftoppm${exeSuffix}`);

  if (!fs.existsSync(pdftotextPath) || !fs.existsSync(pdftoppmPath)) {
    return {
      available: false,
      reason: `Bundled Poppler binaries missing in ${binDir}`,
      binDir,
      pdftotextPath,
      pdftoppmPath,
    };
  }

  return {
    available: true,
    reason: null,
    binDir,
    pdftotextPath,
    pdftoppmPath,
  };
}

function addPathEntry(env, entry) {
  if (!entry) return { ...(env || {}) };
  const nextEnv = { ...(env || {}) };
  const pathKey = getPathKey(nextEnv);
  const currentPath = nextEnv[pathKey] || '';
  const entries = String(currentPath).split(path.delimiter).filter(Boolean);
  const hasEntry = entries.some((part) => part.toLowerCase() === String(entry).toLowerCase());
  if (!hasEntry) {
    nextEnv[pathKey] = [entry, currentPath].filter(Boolean).join(path.delimiter);
  }
  return nextEnv;
}

function withBundledPopplerEnv(env = {}, options = {}) {
  const resolved = getBundledPopplerBinDir(options);
  if (!resolved.available) return { ...(env || {}) };

  const nextEnv = addPathEntry(env, resolved.binDir);
  nextEnv.OPEN_MATRIX_POPPLER_PATH = resolved.binDir;
  nextEnv.OPEN_MATRIX_PDFTOTEXT_PATH = resolved.pdftotextPath;
  nextEnv.OPEN_MATRIX_PDFTOPPM_PATH = resolved.pdftoppmPath;
  return nextEnv;
}

module.exports = {
  getBundledPopplerBinDir,
  withBundledPopplerEnv,
};
