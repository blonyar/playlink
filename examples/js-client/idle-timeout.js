const endpoint = process.env.PLAYLINK_WS_URL ?? 'ws://localhost:7777/ws';
const expectedTimeoutMs = Number(process.env.PLAYLINK_EXPECTED_IDLE_TIMEOUT_MS ?? 3000);

async function main() {
  const socket = new WebSocket(endpoint);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timed out connecting to ${endpoint}`)), 5000);

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`failed to connect to ${endpoint}`));
    });
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`socket stayed open longer than ${expectedTimeoutMs}ms`));
    }, expectedTimeoutMs);

    socket.addEventListener('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  console.log('Playlink idle timeout test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
