import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PLAYLINK_MINI_GAME_PORT ?? 7780);
const root = resolve(dirname(fileURLToPath(import.meta.url)));
const sdkRoot = resolve(root, '..', '..', 'packages', 'js-sdk');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const pages = {
  '/': 'mini-game.html',
  '/mini-game': 'mini-game.html',
  '/mini-game.html': 'mini-game.html',
  '/tanks': 'tanks.html',
  '/tanks.html': 'tanks.html',
};

const sdkPathMap = {
  '/playlink-client.js': 'index.js',
  '/client.js': 'client.js',
  '/state-snapshot.js': 'state-snapshot.js',
  '/protocol.js': 'protocol.js',
  '/utils.js': 'utils.js',
};

function safePath(rootDir, urlPath) {
  const normalized = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const filePath = resolve(rootDir, normalized);
  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${sep}`)) {
    return null;
  }
  return filePath;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const urlPath = url.pathname;

    // The browser's import map points `@playlink/client` at
    // `/playlink-client.js`. We serve the SDK source files directly
    // from packages/js-sdk/src/ so the example does not need a
    // bundler. The index re-exports the internal modules with bare
    // relative paths, so we also serve client.js, state-snapshot.js,
    // protocol.js, and utils.js under the same root.
    let filePath;
    if (Object.hasOwn(sdkPathMap, urlPath)) {
      filePath = resolve(sdkRoot, 'src', sdkPathMap[urlPath]);
    } else if (Object.hasOwn(pages, urlPath)) {
      filePath = resolve(root, pages[urlPath]);
    } else {
      filePath = safePath(root, urlPath);
    }

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

server.listen(port, '0.0.0.0', () => {
  console.log(`Playlink examples:`);
  console.log(`  Mini game:   http://0.0.0.0:${port}/`);
  console.log(`  Tank Wars:   http://0.0.0.0:${port}/tanks`);
  console.log(`Start the Playlink server separately with: rustup run stable cargo run`);
});
