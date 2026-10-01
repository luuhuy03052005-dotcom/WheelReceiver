const api=window.electronAPI,$=id=>document.getElementById(id);
const games=[['generic','Game tùy chỉnh'],['forza','Forza Horizon'],['beamng','BeamNG.drive'],['ets2','Euro Truck Simulator 2'],['ats','American Truck Simulator'],['assetto','Assetto Corsa'],['dirt','DiRT / EA WRC']];
for(const [id,name]of games)$('game').add(new Option(name,id));

const AUX_ACTIONS=[
  {id:'horn',name:'Còi (Horn)',index:25},
  {id:'starter',name:'Đề máy',index:27},
  {id:'ignition',name:'Khóa điện',index:26},
  {id:'parkingBrake',name:'Phanh đỗ',index:34},
  {id:'lowBeam',name:'Đèn cos',index:11},
  {id:'highBeam',name:'Đèn pha',index:12},
  {id:'flash',name:'Đá pha',index:13},
  {id:'indicatorLeft',name:'Xi-nhan trái',index:16},
  {id:'indicatorRight',name:'Xi-nhan phải',index:17},
  {id:'hazards',name:'Đèn khẩn cấp',index:18},
  {id:'wiperCycle',name:'Gạt mưa',index:20},
  {id:'washer',name:'Rửa kính',index:21},
  {id:'windowDown',name:'Hạ kính',index:30},
  {id:'windowUp',name:'Nâng kính',index:31},
  {id:'cruise',name:'Cruise Control',index:35},
  {id:'traction',name:'TCS / ESC',index:43},
  {id:'abs',name:'ABS',index:44},
  {id:'diffLock',name:'Khóa vi sai',index:46},
  {id:'range',name:'Hộp số Range',index:48},
  {id:'splitter',name:'Hộp số Splitter',index:49},
  {id:'retarderUp',name:'Retarder +',index:50},
  {id:'retarderDown',name:'Retarder −',index:51},
  {id:'engineBrake',name:'Phanh động cơ',index:52},
  {id:'trailerCouple',name:'Móc rơ-moóc',index:54},
  {id:'beacon',name:'Đèn ưu tiên',index:57},
  {id:'camera',name:'Đổi camera',index:58},
  {id:'lookBack',name:'Nhìn sau',index:59},
  {id:'lookLeft',name:'Nhìn trái',index:60},
  {id:'lookRight',name:'Nhìn phải',index:61},
  {id:'pause',name:'Menu / Pause',index:62},
  {id:'resetVehicle',name:'Đặt lại xe',index:63}
];

const PRIMARY_BUTTONS=[
  {mask:0x1000,id:'tbtn-a',name:'Phanh tay (A)'},
  {mask:0x2000,id:'tbtn-b',name:'Lên số (B / Paddle R)'},
  {mask:0x4000,id:'tbtn-x',name:'Xuống số (X / Paddle L)'},
  {mask:0x8000,id:'tbtn-y',name:'Nitro / Boost (Y)'},
  {mask:0x0100,id:'tbtn-lb',name:'Côn nhanh (LB)'},
  {mask:0x0200,id:'tbtn-rb',name:'Đổi camera (RB)'},
  {mask:0x0001,id:'tdpad-up',name:'D-Pad Lên'},
  {mask:0x0002,id:'tdpad-down',name:'D-Pad Xuống'},
  {mask:0x0004,id:'tdpad-left',name:'D-Pad Trái'},
  {mask:0x0008,id:'tdpad-right',name:'D-Pad Phải'}
];

const auxContainer=$('aux-chips-container');
const auxElements=new Map();
if(auxContainer){
  for(const act of AUX_ACTIONS){
    const chip=document.createElement('div');
    chip.className='aux-chip';
    chip.id='aux-act-'+act.id;
    chip.textContent=act.name;
    auxContainer.appendChild(chip);
    auxElements.set(act.index,{element:chip,name:act.name});
  }
}

let current=null,revision=0,netSignature='',deviceSignature='';
let lastButtons=0,lastExtended=0n,inputActiveTimer=null;

function renderInputTest(input){
  if(!input)return;
  const sig=$('test-signal-status');
  if(sig){
    sig.textContent=`Tín hiệu: Frame #${input.sequence??0}`;
    sig.className='test-badge badge-live';
    clearTimeout(inputActiveTimer);
    inputActiveTimer=setTimeout(()=>{
      if(sig){sig.textContent='Chờ tín hiệu';sig.className='test-badge badge-idle';}
    },1500);
  }

  const profileRange=current?.runtime?.profile?.range||900;
  const steer=Number.isFinite(input.steering)?input.steering:0;
  const steerDegrees=((steer/32768)*(profileRange/2)).toFixed(1);
  const steerPct=Math.max(-100,Math.min(100,(steer/32768)*100));

  const valSteer=$('val-steer');
  if(valSteer)valSteer.textContent=`${steer} (${steerDegrees>0?'+':''}${steerDegrees}°)`;
  const barSteer=$('bar-steer');
  if(barSteer){
    if(steerPct<0){
      barSteer.style.left=(50+steerPct/2)+'%';
      barSteer.style.width=(-steerPct/2)+'%';
    }else{
      barSteer.style.left='50%';
      barSteer.style.width=(steerPct/2)+'%';
    }
  }

  const throttle=Number.isFinite(input.throttle)?input.throttle:0;
  const brake=Number.isFinite(input.brake)?input.brake:0;
  const clutch=Number.isFinite(input.clutch)?input.clutch:0;

  const throttlePct=Math.round((throttle/255)*100);
  const brakePct=Math.round((brake/255)*100);
  const clutchPct=Math.round((clutch/255)*100);

  const valThrottle=$('val-throttle');
  if(valThrottle)valThrottle.textContent=`${throttlePct}% (${throttle})`;
  const barThrottle=$('bar-throttle');
  if(barThrottle)barThrottle.style.width=throttlePct+'%';

  const valBrake=$('val-brake');
  if(valBrake)valBrake.textContent=`${brakePct}% (${brake})`;
  const barBrake=$('bar-brake');
  if(barBrake)barBrake.style.width=brakePct+'%';

  const valClutch=$('val-clutch');
  if(valClutch)valClutch.textContent=`${clutchPct}% (${clutch})`;
  const barClutch=$('bar-clutch');
  if(barClutch)barClutch.style.width=clutchPct+'%';

  const buttons=input.buttons||0;
  let newlyPressed=null;
  for(const b of PRIMARY_BUTTONS){
    const isPressed=(buttons&b.mask)!==0;
    const wasPressed=(lastButtons&b.mask)!==0;
    const el=$(b.id);
    if(el)el.classList.toggle('active',isPressed);
    if(isPressed&&!wasPressed)newlyPressed=b.name;
  }
  lastButtons=buttons;

  let ext=0n;
  try{ext=BigInt(input.extended||'0');}catch{}

  const newlyPressedExt=ext&~lastExtended;
  if(newlyPressedExt!==0n){
    for(const [idx,item] of auxElements.entries()){
      if((newlyPressedExt&(1n<<BigInt(idx)))!==0n){
        newlyPressed=item.name;
        break;
      }
    }
  }

  for(const [idx,item] of auxElements.entries()){
    const active=(ext&(1n<<BigInt(idx)))!==0n;
    item.element.classList.toggle('active',active);
  }

  const gearMode=input.gearMode||0;
  const modeNames={1:'AT (Tự động)',2:'MT (Tuần tự)',3:'MTC (Số tay + Côn)',4:'H-Pattern'};
  const modeBadge=$('test-mode-badge');
  const currentProfileMode=current?.runtime?.profile?.mode||'AT';
  if(modeBadge){
    modeBadge.textContent=modeNames[gearMode]||('Chế độ: '+currentProfileMode);
  }

  let activeGear='N';
  if((ext&(1n<<7n))!==0n)activeGear='P';
  else if((ext&(1n<<6n))!==0n)activeGear='R';
  else if((ext&(1n<<8n))!==0n)activeGear='D';
  else if((ext&(1n<<0n))!==0n)activeGear='1';
  else if((ext&(1n<<1n))!==0n)activeGear='2';
  else if((ext&(1n<<2n))!==0n)activeGear='3';
  else if((ext&(1n<<3n))!==0n)activeGear='4';
  else if((ext&(1n<<4n))!==0n)activeGear='5';
  else if((ext&(1n<<5n))!==0n)activeGear='6';
  else activeGear='N';

  const gearBadge=$('test-gear-badge');
  if(gearBadge)gearBadge.textContent=activeGear;

  const isH=gearMode===4||currentProfileMode==='H';
  const hRow=$('h-gates-row'),atRow=$('at-gates-row');
  if(hRow&&atRow){
    hRow.style.display=isH?'flex':'none';
    atRow.style.display=isH?'none':'flex';
  }

  const gatePills=[
    {id:'tgate-r',active:activeGear==='R'},
    {id:'tgate-1',active:activeGear==='1'},
    {id:'tgate-2',active:activeGear==='2'},
    {id:'tgate-3',active:activeGear==='3'},
    {id:'tgate-4',active:activeGear==='4'},
    {id:'tgate-5',active:activeGear==='5'},
    {id:'tgate-6',active:activeGear==='6'},
    {id:'tgate-n',active:activeGear==='N'},
    {id:'tat-p',active:activeGear==='P'},
    {id:'tat-r',active:activeGear==='R'},
    {id:'tat-n',active:activeGear==='N'},
    {id:'tat-d',active:activeGear==='D'}
  ];
  for(const g of gatePills){
    const el=$(g.id);
    if(el)el.classList.toggle('active',g.active);
  }

  lastExtended=ext;

  if(newlyPressed){
    const timeStr=new Date().toLocaleTimeString('vi-VN');
    const lastEl=$('test-last-action');
    if(lastEl)lastEl.textContent=`Thao tác gần nhất: ${newlyPressed} (${timeStr})`;
  }
}

function update(state){
  if(!state)return;
  current={...(current||{}),...state};
  const r=state.runtime||current.runtime;
  if(state.qrDataUrl!==undefined){
    $('qr').hidden=!state.qrDataUrl;
    if(state.qrDataUrl&&$('qr').src!==state.qrDataUrl)$('qr').src=state.qrDataUrl;
  }
  if(state.nonce!==undefined)$('pin').textContent=state.nonce;
  const url=state.url??current.url??'';
  $('url').textContent=url||'Chưa có địa chỉ dùng được';
  $('url').disabled=!url;
  $('open-controller').disabled=!url;
  const net=state.network??current.network;
  $('network-status').textContent=net?'QR đang dùng '+(net.usbVerified?'USB':'mạng '+net.kind.toUpperCase())+' · '+net.name+' · '+net.address:'Không có IPv4 nội bộ khả dụng. Kiểm tra Wi‑Fi hoặc bật USB tethering.';
  $('usb-status').textContent=(state.usbStatus??current.usbStatus)||'Đang kiểm tra adapter USB…';
  const expiresAt=state.expiresAt??current.expiresAt??0;
  $('expiry').textContent='PIN còn '+Math.max(0,Math.ceil((expiresAt-Date.now())/1000))+' giây';
  if(!r)return;
  $('status').textContent=(r.bridge.backend||'none').toUpperCase()+' · '+(r.armed?'Đang điều khiển':r.bridge.ready?'Sẵn sàng / tạm ngưng':'Đầu ra chưa sẵn sàng')+(r.bridge.backend==='mock'?' · MOCK':'');
  $('game-detected').textContent=r.error||r.matches.map(m=>m.name+(m.foreground?' • cửa sổ chính':'')).join(', ')||'Chưa nhận diện game';
  $('transport').textContent=r.connectionTransport||'Chưa có phiên kết nối';
  if(revision!==r.revision){revision=r.revision;$('selection').value=r.selection;$('game').value=r.profile.gameId;$('mode').value=r.profile.mode;$('backend').value=r.profile.backend;}
  $('profile-info').textContent=r.profile.modeSource+' · '+r.profile.verification+(r.bridge.backend==='vjoy'?' · vJoy '+r.bridge.buttons+'/70 nút'+(r.bridge.buttons<70?' — cần cấu hình ≥70':''):'')+(r.bridge.error?' · '+r.bridge.error:'');
  $('pending').hidden=!r.profilePending;$('apply').disabled=r.armed;
  const input=r.input||{};$('input').textContent='Vô-lăng '+(input.steering||0)+' · Ga '+Math.round((input.throttle||0)/255*100)+'% · Phanh '+Math.round((input.brake||0)/255*100)+'%';
  renderInputTest(input);
  const signature=JSON.stringify(r.networks);if(signature!==netSignature){netSignature=signature;$('network').replaceChildren();for(const n of r.networks){const option=new Option((n.usbVerified?'USB':n.kind.toUpperCase())+' · '+n.name+' · '+n.address+(n.usable?'':' · CHƯA CÓ IP'),n.address);option.disabled=!n.usable;$('network').add(option);}$('network').value=state.ip||'';}
  const devices=JSON.stringify(state.devices);if(devices!==deviceSignature){deviceSignature=devices;$('devices').replaceChildren();for(const d of state.devices||[]){const row=document.createElement('div');row.className='device';const label=document.createElement('span');label.textContent=d.name+' · '+new Date(d.createdAt).toLocaleDateString('vi-VN');const button=document.createElement('button');button.textContent='Thu hồi';button.onclick=()=>api.revokeDevice(d.id).catch(showError);row.append(label,button);$('devices').append(row);}}
}
function showError(e){$('message').textContent=e.message||String(e);}
$('pause').onclick=()=>api.pause().catch(showError);
$('apply').onclick=()=>api.setProfile({selection:$('selection').value,gameId:$('game').value,profile:{...(current?.runtime?.profile||{}),mode:$('mode').value,backend:$('backend').value}}).catch(showError);
$('pending').onclick=()=>api.applyProfile().catch(showError);
$('game').onchange=()=>{$('backend').value=['beamng','ets2','ats','assetto'].includes($('game').value)?'vjoy':'xinput';};
$('refresh').onclick=()=>api.refreshPin().then(update).catch(showError);
$('refresh-network').onclick=()=>api.refreshNetworks().then(update).catch(showError);
$('open-controller').onclick=()=>api.openController().catch(showError);
$('network').onchange=()=>api.selectNetwork($('network').value).then(update).catch(showError);
$('restart').onclick=()=>api.restartBridge().catch(showError);
$('firewall').onclick=()=>api.firewallHelp().then(message=>$('message').textContent=message).catch(showError);
$('url').onclick=()=>navigator.clipboard.writeText(current.url).then(()=>$('message').textContent='Đã sao chép địa chỉ.').catch(showError);
api.onState(update);
if(api.onInputState)api.onInputState(renderInputTest);
api.onServerReady(update);api.onServerError(showError);
api.onBridgeLog(line=>{const text=($('logs').textContent+'\n'+line).split('\n').slice(-100).join('\n');$('logs').textContent=text;});
api.getServerInfo().then(update).catch(showError);

