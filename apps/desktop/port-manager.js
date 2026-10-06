import {execFile} from 'node:child_process';

export const RECEIVER_PORT=32178;

export function isManagedReceiverProcess(info={}){
  const name=String(info.name||'').toLowerCase();
  const command=String(info.commandLine||'').toLowerCase();
  if(name==='lan racing wheel receiver.exe')return true;
  if(!['node.exe','electron.exe'].includes(name))return false;
  return /apps[\\/]receiver[\\/]src[\\/]index\.js|apps[\\/]desktop[\\/]bundle\.cjs/.test(command);
}

const runPowerShell=(command,runner=execFile)=>new Promise((resolve,reject)=>runner('powershell.exe',[
  '-NoProfile','-NonInteractive','-Command',command
],{windowsHide:true,timeout:8000},(error,stdout)=>error?reject(error):resolve(stdout.trim())));

export async function findPortOwner(port,{runner=execFile}={}){
  if(process.platform!=='win32' && runner===execFile)return null;
  const command=`$c=Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){$ownerId=[int]$c.OwningProcess; $p=Get-CimInstance Win32_Process -Filter \"ProcessId=$ownerId\"; [pscustomobject]@{processId=$ownerId;name=$p.Name;executablePath=$p.ExecutablePath;commandLine=$p.CommandLine} | ConvertTo-Json -Compress}; exit 0`;
  const output=await runPowerShell(command,runner);
  return output?JSON.parse(output):null;
}

export async function prepareReceiverPort(port=RECEIVER_PORT,options={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Cổng Receiver không hợp lệ.');
  const owner=await findPortOwner(port,options);
  if(!owner||owner.processId===process.pid)return {port,released:false};
  if(!isManagedReceiverProcess(owner))throw new Error(`Cổng ${port} đang thuộc ${owner.name||'ứng dụng khác'} (PID ${owner.processId}). Receiver sẽ không tự ý kết thúc ứng dụng này.`);
  await runPowerShell(`Stop-Process -Id ${Number(owner.processId)} -Force -ErrorAction Stop`,options.runner);
  await new Promise(resolve=>setTimeout(resolve,500));
  const remaining=await findPortOwner(port,options);
  if(remaining)throw new Error(`Không thể giải phóng cổng ${port} từ Wheel Receiver cũ (PID ${remaining.processId}).`);
  return {port,released:true,owner};
}
