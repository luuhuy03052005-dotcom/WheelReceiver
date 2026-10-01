import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';
import fs from 'node:fs';
import { createGatewayServer } from '@lan-racing-wheel/gateway';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, ifaceList] of Object.entries(interfaces)) {
    const isVirtual = /virtual|vmware|vbox|vethernet|wsl|npcap|bluetooth|pseudo|loopback/i.test(name);
    for (const iface of ifaceList || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        if (ip.startsWith('169.254.')) continue; // Skip link-local / APIPA
        
        let score = 0;
        if (!isVirtual) score += 100;
        if (ip.startsWith('192.168.')) score += 50;
        else if (ip.startsWith('10.')) score += 40;
        else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) score += 30;

        candidates.push({ ip, score, name });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0].ip : '127.0.0.1';
}

async function main() {
  const PORT = Number(process.env.PORT) || 32178;
  const localIp = getLocalIpAddress();
  const serverUrl = `http://${localIp}:${PORT}`;

  console.clear();
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        LAN RACING WHEEL - RECEIVER DESKTOP RUNNER         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // 1. Launch C# Bridge process
  const publishedExe = path.resolve(__dirname, '../../bridge/publish/Bridge.exe');
  const bridgeProjectPath = path.resolve(__dirname, '../../bridge/Bridge/Bridge.csproj');
  console.log('[Receiver] Spawning C# Controller Bridge (.NET 9)...');

  let cmd = 'dotnet';
  const bridgeArgs = process.env.WHEEL_MOCK === '1' ? ['--mock'] : [];
  let args = ['run', '--project', bridgeProjectPath, '--', ...bridgeArgs];
  if (fs.existsSync(publishedExe)) {
    cmd = publishedExe;
    args = bridgeArgs;
  }

  const bridgeProcess = spawn(cmd, args, {
    stdio: 'inherit',
    windowsHide: true
  });

  bridgeProcess.on('error', (err) => {
    console.error('[Receiver] Failed to start C# Bridge:', err.message);
  });

  // Give bridge a brief moment to open named pipe
  await new Promise((resolve) => setTimeout(resolve, 1200));

  // 2. Start Gateway Server
  const instance = createGatewayServer({
    detect: true,
    dataDir: path.join(os.homedir(), '.lan-racing-wheel'),
    discoverScript: path.resolve(__dirname, '../../gateway/src/discover.ps1')
  });
  const { server, pairing } = instance;
  let pinTimer;
  const displayPairing = () => {
    const { nonce } = pairing.generateNonce();
    console.log('\n=============================================================');
    console.log(` 🌐 CONTROLLER WEB URL:  ${serverUrl}`);
    console.log(` 🔑 PAIRING PIN (120s):  ${nonce}`);
    console.log('=============================================================\n');
    qrcode.generate(`${serverUrl}#pin=${nonce}`, { small: true });
  };
  server.listen(PORT, '0.0.0.0', () => {
    console.log('Scan this QR code with your phone camera to open and pair the controller:');
    displayPairing();
    pinTimer = setInterval(displayPairing, 110000);
    console.log('\n[Receiver] Ready. Auto detection is active; Manual profiles remain available in the controller.');
    console.log('[Receiver] Press CTRL+C to stop all services.\n');
  });

  // 3. Graceful shutdown handler
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\n[Receiver] Shutting down all services safely...');
    clearInterval(pinTimer);
    await instance.close();
    try {
      bridgeProcess.kill();
    } catch {}
    console.log('[Receiver] Clean exit.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Receiver] Fatal startup error:', err);
  process.exit(1);
});
