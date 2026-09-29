import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

createServer(async (req, res) => {
  const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safePath = normalize(requested).replace(/^\.+/, '').replace(/^\//, '');
  const file = join(root, safePath);
  if (!file.startsWith(root)) return response(res, 403, 'forbidden');
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(content);
  } catch {
    response(res, 404, 'not found');
  }
}).listen(process.env.PORT || 4188, () => console.log('Sessia running on http://127.0.0.1:' + (process.env.PORT || 4188)));

function response(res, status, message) { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }); res.end(message); }
