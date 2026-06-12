import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PLAYLINK_MINI_GAME_PORT ?? 7780);
const root = resolve(dirname(fileURLToPath(import.meta.url)));

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function safePath(urlPath) {
  const requested = urlPath === '/' ? '/mini-game.html' : urlPath;
  const normalized = normalize(decodeURIComponent(requested)).replace(/^([/\\])+/, '');
  const filePath = resolve(root, normalized);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    return null;
  }
  return filePath;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const filePath = safePath(url.pathname);
    if (!filePath) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Playlink mini game example: http://127.0.0.1:${port}/`);
  console.log('Start the Playlink server separately with: rustup run stable cargo run');
});
