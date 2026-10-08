import {app,BrowserWindow,ipcMain,shell} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import QRCode from 'qrcode';
import {createGatewayServer} from '../gateway/src/index.js';
import {RECEIVER_PORT,prepareReceiverPort} from './port-manager.js';
const directory=typeof __dirname!=='undefined'?__dirname:path.dirname(fileURLToPath(import.meta.url));
let window=null,instance=null,bridge=null,poll=null,pinTimer=null,quitting=false,selectedAddress=null,networkSignature='',pairingUpdate=null,networkSelectionManual=false;
const state={url:'',nonce:'------',expiresAt:0,qrDataUrl:'',port:RECEIVER_PORT,bridgeStatus:{status:'starting'},runtime:null,devices:[]};
const emit=(event,data)=>{if(window&&!window.isDestroyed())window.webContents.send(event,data);};
function spawnBridge(){
  const published=path.resolve(directory,'../bridge/publish/Bridge.exe');
  const packaged=path.join(process.resourcesPath,'bridge/Bridge.exe');
  const exe=app.isPackaged?packaged:published;
  const mock=process.env.WHEEL_MOCK==='1'?['--mock']:[];
  const child=bridge=fs.existsSync(exe)?spawn(exe,mock,{windowsHide:true,stdio:['ignore','pipe','pipe']}):
    spawn('dotnet',['run','--project',path.resolve(directory,'../bridge/Bridge/Bridge.csproj'),'--',...mock],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  state.bridgeStatus={status:'starting'};child.stdout.on('data',d=>emit('bridge-log',d.toString().trim()));
  child.stderr.on('data',d=>emit('bridge-log',d.toString().trim()));
  child.on('error',e=>{state.bridgeStatus={status:'error',message:e.message};emit('server-error',{message:e.message});});
  child.on('exit',()=>{if(bridge===child){bridge=null;state.bridgeStatus={status:'stopped'};}});
}
async function updatePairing(newPin=false){
  if(!instance)return;
  const networks=instance.runtime.status().networks;
  const usable=networks.filter(n=>n.usable!==false);
  const selected=usable.find(n=>n.address===selectedAddress)||usable.find(n=>n.usbVerified)||usable.find(n=>n.kind==='wifi')||usable.find(n=>n.kind==='lan')||null;
  selectedAddress=selected?.address||null;state.ip=selectedAddress;state.network=selected;
  state.url=selected?'http://'+selected.address+':'+state.port:'';
  const usb=networks.filter(n=>n.usbVerified);
  state.usbStatus=usb.some(n=>n.usable)?'Đã phát hiện mạng USB dữ liệu. QR đang ưu tiên adapter USB.':usb.length?'Đã thấy adapter USB nhưng chưa nhận được IP. Hãy bật USB tethering/Personal Hotspot và chờ vài giây.':'Chưa thấy adapter mạng USB. Cáp phải hỗ trợ dữ liệu và điện thoại phải bật chia sẻ mạng qua USB.';
  if(newPin)Object.assign(state,instance.pairing.generateNonce());
  state.qrDataUrl=selected?await QRCode.toDataURL(state.url+'/#pin='+state.nonce,{width:280,margin:2,errorCorrectionLevel:'H'}):'';
  emit('server-ready',state);
}
function handlers(){
  ipcMain.handle('get-server-info',()=>state);
  ipcMain.handle('refresh-pin',async()=>{await updatePairing(true);return state;});
  ipcMain.handle('get-runtime',()=>instance?.gateway.status());
  ipcMain.handle('set-profile',(_event,value)=>{
    if(instance.gateway.status().armed)throw new Error('Tạm ngưng điều khiển trước khi đổi profile.');
    instance.runtime.choose(value);return instance.gateway.status();
  });
  ipcMain.handle('pause',()=>instance?.gateway.pause('Tạm ngưng từ Receiver'));
  ipcMain.handle('apply-profile',()=>instance?.gateway.configure());
  ipcMain.handle('select-network',async(_event,address)=>{
    const selected=instance.runtime.status().networks.find(n=>n.address===address);
    if(!selected||selected.usable===false)throw new Error('Adapter chưa có địa chỉ IP khả dụng. Bật tethering/Personal Hotspot rồi làm mới.');
    instance.gateway.pause('Đổi adapter kết nối');selectedAddress=address;networkSelectionManual=true;await updatePairing(true);return state;
  });
  ipcMain.handle('refresh-networks',async()=>{networkSelectionManual=false;selectedAddress=null;await instance.runtime.refreshNetworks();await updatePairing(false);return state;});
  ipcMain.handle('open-controller',()=>state.url?shell.openExternal(state.url):Promise.reject(new Error('Chưa có địa chỉ mạng khả dụng.')));
  ipcMain.handle('revoke-device',(_event,id)=>{instance.pairing.revokeDevice(id);return instance.pairing.list();});
  ipcMain.handle('restart-bridge',()=>{
    instance?.gateway.pause('Đang khởi động lại bridge');
    const old=bridge;if(old){old.once('exit',spawnBridge);old.kill();}else spawnBridge();
  });
  ipcMain.handle('firewall-help',()=>new Promise(resolve=>{
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      "$name='Wheel Receiver Dedicated Port 32178'; $rules=@(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue); if($rules.Count){$rules | Set-NetFirewallRule -Enabled True -Profile Private -Direction Inbound -Action Allow -ErrorAction Stop; $rules | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 32178 -ErrorAction Stop}else{New-NetFirewallRule -DisplayName $name -Direction Inbound -LocalPort 32178 -Protocol TCP -Action Allow -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null}"],
      {windowsHide:true},err=>resolve(err?'Cần chạy Receiver bằng quyền quản trị một lần để thêm rule, hoặc tự cho phép cổng '+state.port+' trên mạng Private.':'Đã thêm rule cho mạng Private / LocalSubnet.'));
  }));
}
async function start(){
  handlers();
  const iconPath=path.join(directory,'assets/icon.ico');
  const fallbackIcon=path.join(directory,'assets/icon.png');
  window=new BrowserWindow({
    width:1120,height:820,minWidth:860,minHeight:640,backgroundColor:'#131719',
    icon:fs.existsSync(iconPath)?iconPath:fs.existsSync(fallbackIcon)?fallbackIcon:undefined,
    webPreferences:{preload:path.join(directory,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  window.setMenuBarVisibility(false);await window.loadFile(path.join(directory,'renderer/index.html'));
  spawnBridge();
  instance=createGatewayServer({detect:true,dataDir:path.join(app.getPath('userData'),'wheel'),
    discoverScript:app.isPackaged?path.join(process.resourcesPath,'scripts/discover.ps1'):path.resolve(directory,'../gateway/src/discover.ps1'),
    publicDir:path.resolve(directory,'../controller-web/public'),packagesDir:path.resolve(directory,'../../packages')});
  const requestedPort=Number(process.env.PORT),port=Number.isInteger(requestedPort)&&requestedPort>=1024&&requestedPort<=65535?requestedPort:RECEIVER_PORT;
  const prepared=await prepareReceiverPort(port);state.port=port;
  if(prepared.released)emit('server-error',{message:`Đã đóng Wheel Receiver cũ đang giữ cổng ${port}.`});
  await new Promise((resolve,reject)=>{instance.server.once('error',reject);instance.server.listen(port,'0.0.0.0',()=>{instance.server.removeListener('error',reject);resolve();});});
  await updatePairing(true);
  networkSignature=JSON.stringify(instance.runtime.status().networks);
  let lastInputEmitTime=0,inputThrottleTimer=null;
  instance.pipeClient.on('input',input=>{
    const now=Date.now();
    if(now-lastInputEmitTime>=30){
      lastInputEmitTime=now;
      if(inputThrottleTimer){clearTimeout(inputThrottleTimer);inputThrottleTimer=null;}
      emit('input-state',input);
    }else if(!inputThrottleTimer){
      inputThrottleTimer=setTimeout(()=>{
        inputThrottleTimer=null;lastInputEmitTime=Date.now();
        emit('input-state',instance.pipeClient.lastFrame);
      },30);
    }
  });
  pinTimer=setInterval(()=>updatePairing(true).catch(e=>emit('server-error',{message:e.message})),120000);
  poll=setInterval(()=>{
    state.runtime=instance.gateway.status();state.devices=instance.pairing.list();
    const signature=JSON.stringify(state.runtime.networks);
    if(signature!==networkSignature){
      networkSignature=signature;const current=state.runtime.networks.find(n=>n.address===selectedAddress),usb=state.runtime.networks.find(n=>n.usbVerified&&n.usable!==false);
      if(!networkSelectionManual&&usb&&current?.address!==usb.address)selectedAddress=usb.address;
      else if(!current||current.usable===false){selectedAddress=null;networkSelectionManual=false;}
      if(!pairingUpdate)pairingUpdate=updatePairing(false).catch(e=>emit('server-error',{message:e.message})).finally(()=>pairingUpdate=null);
    }
    state.pipeConnected=instance.pipeClient.isConnected;state.controllerConnected=instance.gateway.hasActiveController;
    state.bridgeStatus={status:state.runtime.bridge.ready?'running':'error',message:state.runtime.bridge.error||state.runtime.bridge.backend};
    const {qrDataUrl:_omitted,...pollPayload}=state;
    emit('runtime-state',pollPayload);
  },250);
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{window?.restore();window?.focus();});
  app.whenReady().then(start).catch(e=>emit('server-error',{message:e.message}));
  app.on('before-quit',event=>{
    if(quitting)return;event.preventDefault();quitting=true;clearInterval(poll);clearInterval(pinTimer);
    Promise.resolve(instance?.close()).finally(()=>{setTimeout(()=>{bridge?.kill();app.exit(0);},200);});
  });
  app.on('window-all-closed',()=>app.quit());
}
