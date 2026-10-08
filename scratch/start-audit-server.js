import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createGatewayServer } from '../apps/gateway/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function start() {
  const dll = path.resolve(rootDir, 'apps/bridge/Bridge/bin/Debug/net9.0/Bridge.dll');
  const pipeName = 'wheel_audit_pipe';
  
  console.log('[AuditServer] Starting C# Mock Bridge...');
  const bridge = spawn('dotnet', [dll, '--mock', '--observe', '--pipe', pipeName], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  bridge.stdout.on('data', d => process.stdout.write(`[C# Bridge] ${d}`));
  bridge.stderr.on('data', d => process.stderr.write(`[C# Bridge Error] ${d}`));

  // Give bridge a moment to open pipe
  await new Promise(r => setTimeout(r, 800));

  console.log('[AuditServer] Starting Gateway Server...');
  const instance = createGatewayServer({
    pipePath: `\\\\.\\pipe\\${pipeName}`,
    detect: false,
    publicDir: path.resolve(rootDir, 'apps/controller-web/public'),
    packagesDir: path.resolve(rootDir, 'packages')
  });

  const PORT = 32178;
  await new Promise((resolve, reject) => {
    instance.server.once('error', reject);
    instance.server.listen(PORT, '127.0.0.1', resolve);
  });

  const { nonce } = instance.pairing.generateNonce();
  console.log(`[AuditServer] Running at http://127.0.0.1:${PORT}`);
  console.log(`[AuditServer] Active PIN: ${nonce}`);
  console.log(`[AuditServer] Direct URL: http://127.0.0.1:${PORT}#pin=${nonce}`);

  const shutdown = async () => {
    console.log('[AuditServer] Shutting down...');
    await instance.close();
    try { bridge.kill(); } catch {}
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(err => {
  console.error('[AuditServer] Failed to start:', err);
  process.exit(1);
});
