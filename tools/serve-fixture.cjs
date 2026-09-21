/*
 * Tiny static server for the manual test fixture:
 *   npm run fixture   →  http://localhost:8732/test/fixture.html?site=tab4u
 * The ?site= parameter forces an adapter (tab4u | negina | generic).
 */
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png'
};

http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  const headers = {
    'Content-Type': TYPES[path.extname(file)] || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, headers);
    return res.end('not found');
  }
  res.writeHead(200, headers);
  res.end(fs.readFileSync(file));
}).listen(8732, '127.0.0.1', () => {
  console.log('fixture: http://localhost:8732/test/fixture.html?site=tab4u');
});
