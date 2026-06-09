const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGE_MIME_BY_EXT = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
]);

const MIME_BY_EXT = new Map([
  ...IMAGE_MIME_BY_EXT,
  ['.pdf', 'application/pdf'],
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.markdown', 'text/markdown'],
  ['.json', 'application/json'],
  ['.jsonl', 'application/jsonl'],
  ['.csv', 'text/csv'],
  ['.xml', 'application/xml'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.js', 'text/javascript'],
  ['.jsx', 'text/javascript'],
  ['.ts', 'text/typescript'],
  ['.tsx', 'text/typescript'],
  ['.css', 'text/css'],
  ['.scss', 'text/x-scss'],
  ['.yaml', 'application/yaml'],
  ['.yml', 'application/yaml'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.zip', 'application/zip'],
]);

function getMimeType(filePath) {
  return MIME_BY_EXT.get(path.extname(String(filePath || '')).toLowerCase()) || 'application/octet-stream';
}

function isInlineImageMime(mimeType) {
  return IMAGE_MIME_BY_EXT.has(path.extname(String(mimeType || '')).toLowerCase())
    || ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(String(mimeType || '').toLowerCase());
}

function kindForMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('yaml')) return 'text';
  return 'file';
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function quoteMentionPath(filePath) {
  const safe = String(filePath || '').replace(/"/g, '');
  return `@"${safe}"`;
}

async function attachmentFromPath(filePath) {
  const fullPath = path.resolve(String(filePath || ''));
  const stat = await fs.promises.stat(fullPath);
  if (!stat.isFile()) throw new Error(`Not a file: ${fullPath}`);
  const mimeType = getMimeType(fullPath);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    path: fullPath,
    name: path.basename(fullPath),
    size: stat.size,
    sizeLabel: formatBytes(stat.size),
    mimeType,
    kind: kindForMime(mimeType),
  };
}

async function normalizeAttachment(raw) {
  const filePath = raw && typeof raw === 'object' ? raw.path : raw;
  return attachmentFromPath(filePath);
}

async function buildMessageContentWithAttachments(text, attachments = [], options = {}) {
  const maxInlineImageBytes = Number(options.maxInlineImageBytes ?? 5 * 1024 * 1024);
  const rawList = Array.isArray(attachments) ? attachments : [];
  const resolved = [];
  const warnings = [];
  const imageBlocks = [];
  const inlinePaths = new Set();

  for (const raw of rawList) {
    try {
      const att = await normalizeAttachment(raw);
      resolved.push(att);
      if (att.kind === 'image' && isInlineImageMime(att.mimeType) && att.size <= maxInlineImageBytes) {
        const data = await fs.promises.readFile(att.path, 'base64');
        imageBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mimeType,
            data,
          },
        });
        inlinePaths.add(att.path);
      }
    } catch (err) {
      warnings.push(err && err.message ? err.message : String(err));
    }
  }

  const baseText = String(text || '').trim() || (resolved.length ? 'Analise os arquivos anexados.' : '');
  if (resolved.length === 0) {
    return { content: baseText, attachments: resolved, warnings };
  }

  const lines = resolved.map((att, index) => {
    const inline = inlinePaths.has(att.path);
    return `${index + 1}. ${quoteMentionPath(att.path)} (${att.name}; ${att.mimeType}; ${att.sizeLabel}${inline ? '; imagem enviada inline' : ''})`;
  });

  const textBlock = [
    baseText,
    '',
    'Arquivos anexados:',
    ...lines,
    '',
    'Use os @caminhos acima com as ferramentas de leitura quando precisar. Se houver imagem inline, analise visualmente também.',
  ].join('\n');

  if (imageBlocks.length > 0) {
    return { content: [...imageBlocks, { type: 'text', text: textBlock }], attachments: resolved, warnings };
  }
  return { content: textBlock, attachments: resolved, warnings };
}

module.exports = {
  getMimeType,
  isInlineImageMime,
  kindForMime,
  formatBytes,
  quoteMentionPath,
  attachmentFromPath,
  buildMessageContentWithAttachments,
};
