import dgram from 'node:dgram';

const discoveryPort = Number(process.env.PLAYLINK_DISCOVERY_PORT ?? 7778);
const discoveryHost = process.env.PLAYLINK_DISCOVERY_HOST ?? '127.0.0.1';
const timeoutMs = Number(process.env.PLAYLINK_DISCOVERY_TIMEOUT_MS ?? 3000);

const query = Buffer.from(JSON.stringify({
  type: 'playlink_discovery_query',
  version: 1,
}));

function discover() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`timed out waiting for discovery response from ${discoveryHost}:${discoveryPort}`));
    }, timeoutMs);

    socket.on('error', (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });

    socket.on('message', (message, remote) => {
      clearTimeout(timeout);
      socket.close();
      const response = JSON.parse(message.toString('utf8'));
      resolve({ response, remote });
    });

    socket.send(query, discoveryPort, discoveryHost, (error) => {
      if (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    });
  });
}

const { response, remote } = await discover();

if (response.type !== 'playlink_discovery_response') {
  throw new Error(`unexpected discovery response type: ${JSON.stringify(response)}`);
}
if (response.version !== 1) {
  throw new Error(`unexpected discovery response version: ${JSON.stringify(response)}`);
}
if (!response.server_name) {
  throw new Error(`discovery response missing server_name: ${JSON.stringify(response)}`);
}
if (!response.ws_path) {
  throw new Error(`discovery response missing ws_path: ${JSON.stringify(response)}`);
}

console.log(`Discovered Playlink server at ${remote.address}:${remote.port}`);
console.log(JSON.stringify(response, null, 2));
