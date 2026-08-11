'use strict';

/**
 * Minimal multipart/form-data parser (no dependencies).
 * Handles text fields and a single `file` field per request.
 * Buffer-based boundary scanning keeps binary files intact.
 */

function parseMultipart(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('Upload too large (max ' + Math.round(maxBytes / 1024 / 1024) + ' MB)'));
        cleanup();
        req.destroy();
        return;
      }
      chunks.push(c);
    };
    const onEnd = () => {
      try {
        resolve(parseBuffer(Buffer.concat(chunks), req.headers['content-type']));
      } catch (e) {
        reject(e);
      }
    };
    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
    };
    const onError = (e) => { cleanup(); reject(e); };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

function parseBuffer(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw new Error('multipart boundary missing');
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim(), 'latin1');
  const fields = {};
  let file = null;
  let pos = 0;
  while (pos < buf.length) {
    const bIdx = buf.indexOf(boundary, pos);
    if (bIdx < 0) break;
    const afterB = bIdx + boundary.length;
    // end marker "--\r\n" or "--" at end
    if (buf[afterB] === 0x2d && buf[afterB + 1] === 0x2d) break;
    // skip \r\n after boundary
    let contentStart = afterB;
    if (buf[contentStart] === 0x0d && buf[contentStart + 1] === 0x0a) contentStart += 2;
    const nextB = buf.indexOf(boundary, contentStart);
    if (nextB < 0) break;
    // header block ends at \r\n\r\n
    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), contentStart);
    if (headerEnd < 0 || headerEnd > nextB) { pos = nextB; continue; }
    const headers = buf.slice(contentStart, headerEnd).toString('latin1');
    const bodyStart = headerEnd + 4;
    let bodyEnd = nextB;
    // strip trailing \r\n before boundary
    if (bodyEnd > bodyStart && buf[bodyEnd - 2] === 0x0d && buf[bodyEnd - 1] === 0x0a) bodyEnd -= 2;
    const body = buf.slice(bodyStart, bodyEnd);
    const nameM = /name="([^"]*)"/.exec(headers);
    if (!nameM) { pos = nextB; continue; }
    const name = nameM[1];
    if (/filename="/.test(headers)) {
      const fnM = /filename="([^"]*)"/.exec(headers);
      const typeM = /Content-Type:\s*([^\r\n]+)/i.exec(headers);
      if (!file) {
        file = {
          field: name,
          filename: fnM ? fnM[1] : 'file',
          type: typeM ? typeM[1].trim() : 'application/octet-stream',
          bytes: Buffer.from(body),
        };
      }
    } else {
      fields[name] = body.toString('utf8');
    }
    pos = nextB;
  }
  return { fields, file };
}

module.exports = { parseMultipart };