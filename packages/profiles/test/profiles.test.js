import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,createProfile,detectGame,supportsAction,DEFAULT_KEYS} from '../src/index.js';
import {InputState} from '../src/input-state.js';
import {RuntimeManager,networkChoices} from '../../../apps/gateway/src/runtime.js';
test('vehicle catalogue has stable unique controls including every lighting group',()=>{
 assert.equal(ACTIONS.length,64);assert.equal(new Set(ACTIONS.map(a=>a.id)).size,64);
 for(const id of ['lowBeam','highBeam','flash','fogFront','fogRear','indicatorLeft','indicatorRight','hazards','rearWiper','washer','range','splitter'])assert.ok(ACTIONS.some(a=>a.id===id));
});
test('profile validation and actual output capabilities gate auxiliary actions',()=>{
 const p=createProfile('forza',{range:Infinity,mode:'INVALID',keys:{25:72,90:33,1:NaN},backend:'invalid'});
 assert.equal(p.mode,'AT');assert.equal(p.backend,'xinput');assert.equal(p.range,360);assert.deepEqual(p.keys,{25:72});
 assert.equal(supportsAction(ACTIONS[25],p,{keyboard:false}),false);
 assert.equal(supportsAction(ACTIONS[25],p,{keyboard:true}),true);
 assert.equal(supportsAction(ACTIONS[10],createProfile('beamng'),{buttons:16}),false);
});
test('short taps survive until acknowledged; mode changes and reset clear held input',()=>{
 const input=new InputState();input.press('shiftUp',0);input.release('shiftUp');
 const pending=input.snapshot(200);assert.ok(pending.buttons);input.acknowledge(pending);assert.equal(input.snapshot(201).buttons,0);
 input.press('clutchQuick',300);input.setMode('AT');assert.equal(input.snapshot(301).buttons,0);
 input.press('lowBeam',400);assert.ok(input.snapshot(401).extended);input.reset();assert.equal(input.snapshot(402).extended,0n);
});
test('detection uses foreground executable; manual choice survives other games',()=>{
 const processes=[{name:'ForzaHorizon5.exe',pid:10},{name:'eurotrucks2.exe',pid:20}];
 assert.equal(detectGame(processes,20).selected.gameId,'ets2');assert.equal(detectGame(processes,99).selected,null);
 const runtime=new RuntimeManager({detect:false});let changes=0;runtime.on('profile',()=>changes++);
 runtime.observe({processes,foregroundPid:20});assert.equal(changes,0);
 runtime.observe({processes,foregroundPid:20});assert.equal(runtime.profile.gameId,'ets2');assert.equal(changes,1);
 runtime.observe({processes,foregroundPid:99});assert.equal(runtime.focused,false);assert.equal(runtime.profile.gameId,'ets2');
 runtime.choose({selection:'manual',gameId:'forza'});runtime.observe({processes,foregroundPid:20});runtime.observe({processes,foregroundPid:20});assert.equal(runtime.profile.gameId,'forza');runtime.close();
});
test('USB label requires adapter evidence; public addresses are excluded',()=>{
 const interfaces={'Ethernet 3':[{family:'IPv4',address:'172.20.10.2',internal:false}],Public:[{family:'IPv4',address:'8.8.8.8',internal:false}]};
 assert.equal(networkChoices(interfaces).length,1);assert.equal(networkChoices(interfaces)[0].usbVerified,false);
 assert.equal(networkChoices(interfaces,[{name:'Ethernet 3',description:'Apple Mobile Device Ethernet'}])[0].usbVerified,true);
});
test('USB discovery recognizes NCM/RNDIS phones and excludes virtual adapters',()=>{
 const interfaces={
  'Ethernet 4':[{family:'IPv4',address:'192.168.137.2',internal:false}],
  'VMware Network Adapter VMnet8':[{family:'IPv4',address:'169.254.246.1',internal:false}]
 };
 const adapters=[
  {name:'Ethernet 4',description:'Remote NDIS Compatible Device',pnpDeviceId:'USB\\VID_18D1&PID_4EE3'},
  {name:'VMware Network Adapter VMnet8',description:'VMware Virtual Ethernet Adapter'}
 ];
 const choices=networkChoices(interfaces,adapters);
 assert.equal(choices.length,1);assert.equal(choices[0].kind,'usb-network');assert.equal(choices[0].usable,true);
});
test('InputState: AT gear sets extended bit and snapshot contains it',()=>{
 const input=new InputState();
 // Set gear to 'drive' (index 8 in ACTIONS)
 input.gear='drive';
 const snap=input.snapshot();
 // Bit 8 should be set in extended
 assert.ok(snap.extended & (1n<<8n),'drive gear should set bit 8 in extended');
 // Set gear to 'park' (index 7)
 input.gear='park';
 const snap2=input.snapshot();
 assert.ok(snap2.extended & (1n<<7n),'park should set bit 7');
 assert.ok(!(snap2.extended & (1n<<8n)),'previous drive bit should be cleared when gear changes');
 // Set gear to null (neutral)
 input.gear=null;
 const snap3=input.snapshot();
 assert.equal(snap3.extended & 0x3FFn,0n,'no transmission bits when gear is null');
});
test('InputState: H-pattern gears set correct extended bits',()=>{
 const input=new InputState();
 const gears=['gear1','gear2','gear3','gear4','gear5','gear6','reverse'];
 for(let i=0;i<gears.length;i++){
   input.gear=gears[i];
   const snap=input.snapshot();
   assert.ok(snap.extended & (1n<<BigInt(i)),`${gears[i]} should set bit ${i}`);
   // Only ONE gear bit should be set
   for(let j=0;j<gears.length;j++){
     if(j!==i)assert.ok(!(snap.extended & (1n<<BigInt(j))),`${gears[j]} bit should NOT be set when gear is ${gears[i]}`);
   }
 }
});
test('InputState: auxiliary buttons (horn, wipers, lights) set correct extended bits',()=>{
 const input=new InputState();
 // horn is index 25
 input.press('horn',0);
 const s1=input.snapshot(0);
 assert.ok(s1.extended & (1n<<25n),'horn should set bit 25');
 input.acknowledge(s1);
 input.release('horn');
 // lowBeam is index 11
 input.press('lowBeam',100);
 const s2=input.snapshot(100);
 assert.ok(s2.extended & (1n<<11n),'lowBeam should set bit 11');
 assert.ok(!(s2.extended & (1n<<25n)),'horn should not be set after release');
 input.acknowledge(s2);
 input.release('lowBeam');
 // hazards is index 18
 input.press('hazards',200);
 const s3=input.snapshot(200);
 assert.ok(s3.extended & (1n<<18n),'hazards should set bit 18');
 input.release('hazards');
});
test('InputState: handbrake and camera produce correct primary button masks',()=>{
 const input=new InputState();
 input.press('handbrake',0);
 const s1=input.snapshot();
 assert.equal(s1.buttons & 0x1000,0x1000,'handbrake should set HANDBRAKE mask');
 input.release('handbrake');
 input.press('camera',100);
 const s2=input.snapshot(100);
 assert.equal(s2.buttons & 0x0200,0x0200,'camera should set CAMERA mask');
 input.release('camera');
 input.press('nitro',200);
 const s3=input.snapshot(200);
 assert.equal(s3.buttons & 0x8000,0x8000,'nitro should set NITRO mask');
 input.release('nitro');
});
test('InputState: shiftUp/shiftDown produce correct primary button masks',()=>{
 const input=new InputState();
 input.press('shiftUp',0);
 const s1=input.snapshot();
 assert.equal(s1.buttons & 0x2000,0x2000,'shiftUp should set SHIFT_UP mask');
 input.release('shiftUp');
 input.press('shiftDown',100);
 const s2=input.snapshot(100);
 assert.equal(s2.buttons & 0x4000,0x4000,'shiftDown should set SHIFT_DOWN mask');
 input.release('shiftDown');
});
test('DEFAULT_KEYS has no duplicate key codes within the same active mode context',()=>{
 const seen=new Map();
 for(const [idx,key] of Object.entries(DEFAULT_KEYS)){
   assert.ok(!seen.has(key),`Duplicate key code ${key} found at index ${idx} and index ${seen.get(key)}`);
   seen.set(key,idx);
 }
 assert.equal(DEFAULT_KEYS[62],27,'pause (index 62) must be Escape (27)');
 assert.equal(DEFAULT_KEYS[58],57,'camera (index 58) must be 9 (57)');
 assert.equal(DEFAULT_KEYS[46],86,'diffLock (index 46) must be V (86)');
 assert.equal(DEFAULT_KEYS[35],67,'cruise (index 35) must be C (67)');
});

test('InputState: parkingBrake does not duplicate HANDBRAKE button mask and D-pad sets DPAD masks',()=>{
 const input=new InputState();
 input.press('parkingBrake',0);
 const s1=input.snapshot(0);
 assert.ok(s1.extended & (1n<<34n),'parkingBrake should set bit 34');
 assert.equal(s1.buttons & 0x1000,0,'parkingBrake should NOT set HANDBRAKE mask');
 input.release('parkingBrake');

 input.press('dpadUp',100);
 const s2=input.snapshot(100);
 assert.equal(s2.buttons & 0x0001,0x0001,'dpadUp should set DPAD_UP mask');
 input.release('dpadUp');

 input.press('dpadDown',200);
 const s3=input.snapshot(200);
 assert.equal(s3.buttons & 0x0002,0x0002,'dpadDown should set DPAD_DOWN mask');
 input.release('dpadDown');
});

