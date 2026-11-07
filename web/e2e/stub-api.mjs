// Minimal stand-in for the API so Playwright exercises the real `/api` proxy of `vite preview`.
import { createServer } from 'node:http';

const port = Number(process.env.STUB_API_PORT ?? 3399);

createServer((request, response) => {
  if (request.url === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json', 'x-stub': 'yes' });
    response.end(JSON.stringify({ status: 'ok', db: 'up' }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/problem+json' });
  response.end(JSON.stringify({ status: 404, code: 'NOT_FOUND' }));
}).listen(port, '127.0.0.1');
