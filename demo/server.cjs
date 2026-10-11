const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(fs.readFileSync(path.join(__dirname, 'index.html')));
});
server.listen(4173, '127.0.0.1', () => console.log('Demonstração: http://127.0.0.1:4173 • Ctrl+C para encerrar'));
