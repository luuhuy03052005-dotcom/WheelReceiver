// Stable action IDs are part of the 8-byte extension contract. Do not reorder.
const definitions = [
  ['gear1','Số 1','transmission','hold'],['gear2','Số 2','transmission','hold'],
  ['gear3','Số 3','transmission','hold'],['gear4','Số 4','transmission','hold'],
  ['gear5','Số 5','transmission','hold'],['gear6','Số 6','transmission','hold'],
  ['reverse','R · Lùi','transmission','hold'],['park','P · Đỗ','transmission','hold'],
  ['drive','D · Tiến','transmission','hold'],['neutral','N · Mo','transmission','hold'],
  ['positionLights','Đèn định vị','lighting'],['lowBeam','Đèn cos','lighting'],
  ['highBeam','Đèn pha','lighting'],['flash','Đá pha','lighting','hold'],
  ['fogFront','Sương mù trước','lighting'],['fogRear','Sương mù sau','lighting'],
  ['indicatorLeft','Xi-nhan trái','lighting'],['indicatorRight','Xi-nhan phải','lighting'],
  ['hazards','Đèn khẩn cấp','lighting'],['cabinLight','Đèn cabin','lighting'],
  ['wiperCycle','Gạt mưa · đổi nấc','visibility'],['washer','Rửa kính','visibility','hold'],
  ['rearWiper','Gạt kính sau','visibility'],['mirrorLeft','Gương trái','visibility'],
  ['mirrorRight','Gương phải','visibility'],['horn','Còi','cabin','hold'],
  ['ignition','Khóa điện','cabin'],['starter','Đề máy','cabin','hold'],
  ['seatbelt','Dây an toàn','cabin'],['door','Cửa xe','cabin'],
  ['windowDown','Hạ kính','cabin','hold'],['windowUp','Nâng kính','cabin','hold'],
  ['climate','Điều hòa','cabin'],['radio','Radio','cabin'],
  ['parkingBrake','Phanh đỗ','cabin'],['cruise','Cruise · bật/tắt','assistance'],
  ['cruiseSet','Cruise · SET','assistance'],['cruiseResume','Cruise · RES','assistance'],
  ['cruiseCancel','Cruise · CANCEL','assistance'],['cruiseUp','Cruise · tăng','assistance'],
  ['cruiseDown','Cruise · giảm','assistance'],['limiter','Giới hạn tốc độ','assistance'],
  ['driveMode','Chế độ lái','assistance'],['traction','TCS / ESC','assistance'],
  ['abs','ABS','assistance'],['fourWheel','2WD / 4WD','assistance'],
  ['diffLock','Khóa vi sai','truck'],['lowRange','Cầu chậm','truck'],
  ['range','Hộp số · RANGE','truck'],['splitter','Hộp số · SPLIT','truck'],
  ['retarderUp','Retarder +','truck'],['retarderDown','Retarder −','truck'],
  ['engineBrake','Phanh động cơ','truck','hold'],['trailerBrake','Phanh rơ-moóc','truck','hold'],
  ['trailerCouple','Móc / tháo rơ-moóc','truck'],['landingGear','Chân chống','truck'],
  ['pto','PTO','truck'],['beacon','Đèn ưu tiên','truck'],
  ['camera','Đổi camera','game'],['lookBack','Nhìn sau','game','hold'],
  ['lookLeft','Nhìn trái','game','hold'],['lookRight','Nhìn phải','game','hold'],
  ['pause','Menu / tạm dừng','game'],['resetVehicle','Đặt lại xe','game']
];
export const ACTIONS=Object.freeze(definitions.map(([id,label,group,kind='pulse'],index)=>{
  let vjoy;
  if(id==='parkingBrake') vjoy=11;
  else if(id==='camera') vjoy=15;
  else if(index<10) vjoy=index+1;
  else vjoy=index+7;
  return Object.freeze({id,label,group,kind,index,vjoy});
}));
export const GROUPS={lighting:'Đèn & tín hiệu',visibility:'Tầm nhìn',cabin:'Vận hành & cabin',assistance:'Hỗ trợ lái',truck:'Xe tải',game:'Tiện ích game'};
export const GAMES=[
  {id:'generic',name:'Game tùy chỉnh',executables:[],backend:'xinput',range:900,modes:['AT','MT','MTC','H'],groups:Object.keys(GROUPS)},
  {id:'forza',name:'Forza Horizon',executables:['forzahorizon4.exe','forzahorizon5.exe'],backend:'xinput',range:360,modes:['AT','MT','MTC','H'],groups:['cabin','game']},
  {id:'beamng',name:'BeamNG.drive',executables:['beamng.drive.x64.exe','beamng.drive.x86.exe','beamng.drive.exe'],backend:'vjoy',range:900,modes:['AT','MT','MTC','H'],groups:Object.keys(GROUPS)},
  {id:'ets2',name:'Euro Truck Simulator 2',executables:['eurotrucks2.exe','eurotrucks2_x64.exe','eurotrucks.exe','truckersmp-launcher.exe'],backend:'vjoy',range:900,modes:['AT','MT','MTC','H'],groups:Object.keys(GROUPS)},
  {id:'ats',name:'American Truck Simulator',executables:['amtrucks.exe','amtrucks64.exe','amtrucks_x64.exe'],backend:'vjoy',range:900,modes:['AT','MT','MTC','H'],groups:Object.keys(GROUPS)},
  {id:'assetto',name:'Assetto Corsa',executables:['acs.exe','acs_x86.exe','acc.exe'],backend:'vjoy',range:900,modes:['AT','MT','MTC','H'],groups:['lighting','cabin','assistance','game']},
  {id:'dirt',name:'DiRT Rally / EA WRC',executables:['dirtrally2.exe','wrc.exe','wrc-win64-shipping.exe'],backend:'xinput',range:540,modes:['AT','MT','MTC','H'],groups:['cabin','game']}
];
export const MODES={AT:'Số tự động',MT:'Số tay tuần tự',MTC:'Số tay + côn',H:'H-pattern + côn'};
export function createProfile(gameId='generic',saved={}) {
  const game=GAMES.find(g=>g.id===gameId)||GAMES[0];
  const keys={};for(const [index,value] of Object.entries(saved.keys||{}))
    if(Number.isInteger(+index)&&+index>=0&&+index<64&&Number.isInteger(value)&&value>=0&&value<=255)keys[index]=value;
  const range=Number(saved.range);
  return {gameId:game.id,name:game.name,backend:['xinput','vjoy'].includes(saved.backend)?saved.backend:game.backend,
    mode:game.modes.includes(saved.mode)?saved.mode:'AT',range:Number.isFinite(range)?Math.max(90,Math.min(1080,range)):game.range,
    keys,groups:game.groups,verification:'Chưa kiểm chứng trong game',modeSource:'Cấu hình đã lưu; chưa đồng bộ telemetry'};
}
export function detectGame(processes=[],foregroundPid=0,custom={}) {
  const matches=processes.flatMap(p=>{
    const name=String(p.name||'').toLowerCase();
    const game=GAMES.find(g=>g.executables.includes(name))||GAMES.find(g=>g.id===custom[name]);
    return game?[{gameId:game.id,name:game.name,pid:p.pid,foreground:p.pid===foregroundPid}]:[];
  });
  return {matches,selected:matches.find(p=>p.foreground)||null};
}
export const DEFAULT_KEYS = Object.freeze({
  0: 49,   // gear1: 1 (49)
  1: 50,   // gear2: 2 (50)
  2: 51,   // gear3: 3 (51)
  3: 52,   // gear4: 4 (52)
  4: 53,   // gear5: 5 (53)
  5: 54,   // gear6: 6 (54)
  6: 55,   // reverse: 7 (55)
  7: 48,   // park: 0 (48)
  8: 68,   // drive: D (68)
  9: 78,   // neutral: N (78)
  11: 76,  // lowBeam: L (76)
  12: 75,  // highBeam: K (75)
  13: 74,  // flash: J (74)
  16: 219, // indicatorLeft: [ (219)
  17: 221, // indicatorRight: ] (221)
  18: 70,  // hazards: F (70)
  20: 80,  // wiperCycle: P (80)
  21: 88,  // washer: X (88)
  25: 72,  // horn: H (72)
  26: 69,  // ignition: E (69)
  27: 83,  // starter: S (83)
  34: 32,  // parkingBrake: Space (32)
  35: 67,  // cruise: C (67)
  46: 86,  // diffLock: V (86)
  48: 188, // range: , (188)
  49: 190, // splitter: . (190)
  50: 222, // retarderUp: ' (222)
  51: 186, // retarderDown: ; (186)
  52: 66,  // engineBrake: B (66)
  54: 84,  // trailerCouple: T (84)
  57: 79,  // beacon: O (79)
  58: 57,  // camera: 9 (57) - distinct from diffLock V (86)
  59: 112, // lookBack: F1 (112)
  60: 113, // lookLeft: F2 (113)
  61: 114, // lookRight: F3 (114)
  62: 27,  // pause: Escape (27) - index 62 in ACTIONS
  63: 82   // resetVehicle: R (82)
});

export function resolveVJoyButton(actionId,mode='AT',maxButtons=70){
  const normId=actionId==='handbrake'?'parkingBrake':(actionId==='cameraPrimary'?'camera':actionId);
  if(maxButtons<16){
    if(maxButtons<8)return null;
    if(mode==='H'){
      const hMap={gear1:1,gear2:2,gear3:3,gear4:4,gear5:5,gear6:6,reverse:7,parkingBrake:8};
      return hMap[normId]||null;
    }
    if(mode==='AT'){
      const atMap={parkingBrake:1,camera:2,nitro:3,park:5,reverse:6,neutral:7,drive:8};
      return atMap[normId]||null;
    }
    if(mode==='MT'){
      const mtMap={parkingBrake:1,shiftUp:2,shiftDown:3,nitro:4,camera:5};
      return mtMap[normId]||null;
    }
    if(mode==='MTC'){
      const mtcMap={parkingBrake:1,shiftUp:2,shiftDown:3,nitro:4,camera:5,clutchTap:6,clutchQuick:6};
      return mtcMap[normId]||null;
    }
    return null;
  }
  const gearMap={gear1:1,gear2:2,gear3:3,gear4:4,gear5:5,gear6:6,reverse:7,park:8,drive:9,neutral:10};
  if(gearMap[normId]){
    return gearMap[normId]<=maxButtons?gearMap[normId]:null;
  }
  const primaryMap={
    parkingBrake:11,shiftUp:12,shiftDown:13,nitro:14,camera:15,clutchTap:16,clutchQuick:16
  };
  if(primaryMap[normId]){
    return primaryMap[normId]<=maxButtons?primaryMap[normId]:null;
  }
  const act=ACTIONS.find(a=>a.id===normId);
  if(act&&act.index>=10){
    const btn=act.index+7;
    return btn<=maxButtons?btn:null;
  }
  return null;
}

export function resolveActionRoute(action,profile,capabilities={}) {
  let canonical=action;
  if(typeof action==='string'){
    canonical=ACTIONS.find(a=>a.id===action);
    if(!canonical){
      if(action==='handbrake')canonical=ACTIONS.find(a=>a.id==='parkingBrake');
      else if(action==='cameraPrimary')canonical=ACTIONS.find(a=>a.id==='camera');
      else if(['shiftUp','shiftDown','nitro','clutchTap','clutchQuick'].includes(action)){
        canonical={id:action,group:'transmission',kind:'pulse'};
      }
    }
  }else if(action&&typeof action==='object'){
    if(action.id==='handbrake')canonical=ACTIONS.find(a=>a.id==='parkingBrake');
    else if(action.id==='cameraPrimary')canonical=ACTIONS.find(a=>a.id==='camera');
    else if(!canonical.index&&canonical.index!==0&&action.id)canonical=ACTIONS.find(a=>a.id===action.id)||action;
  }
  if(!canonical)return {type:'none',reason:'Action không tồn tại'};

  const mode=capabilities?.mode||profile?.mode||'AT';
  const backend=profile?.backend||'xinput';
  const maxButtons=capabilities?.buttons!==undefined?capabilities.buttons:(backend==='vjoy'?70:0);

  if(canonical.group&&canonical.group!=='transmission'&&profile?.groups&&!profile.groups.includes(canonical.group)){
    return {type:'none',reason:'Không thuộc nhóm profile hỗ trợ'};
  }

  const primaryOnly=['shiftUp','shiftDown','nitro','clutchTap','clutchQuick'];
  if(primaryOnly.includes(canonical.id)){
    if(backend==='vjoy'){
      const vjoyBtn=resolveVJoyButton(canonical.id,mode,maxButtons);
      if(vjoyBtn){
        return {type:'vjoy',button:vjoyBtn,isPrimary:true};
      }
      return {type:'none',key:0,reason:`vJoy không có nút cho ${canonical.id} trong chế độ ${mode} (${maxButtons} nút)`};
    }
    return {type:'xinput',isPrimary:true};
  }

  const isGear=canonical.index<10;
  const isAtGear=(mode==='AT'&&canonical.index===6)||(canonical.index>=7&&canonical.index<=9);
  const defaultKey=((isGear&&backend==='vjoy')||isAtGear)?0:(DEFAULT_KEYS[canonical.index]||0);
  const isExplicit=profile?.keys&&(canonical.index in profile.keys||String(canonical.index) in profile.keys);
  const key=isExplicit?Number(profile.keys[canonical.index]):defaultKey;

  if(key!==0){
    if(capabilities.keyboard===false){
      return {type:'none',key,reason:'Keyboard sender bị vô hiệu hóa'};
    }
    return {type:'keyboard',key,isExplicit};
  }

  if(backend==='vjoy'){
    const vjoyButton=resolveVJoyButton(canonical.id,mode,maxButtons);
    if(vjoyButton){
      return {type:'vjoy',button:vjoyButton,isExplicit};
    }
    return {type:'none',key:0,reason:`vJoy không đủ nút hoặc không hỗ trợ trong chế độ ${mode} (hiện có ${maxButtons} nút)`};
  }

  if(backend==='xinput'){
    const xinputSupported=[
      'parkingBrake','handbrake','camera','cameraPrimary',
      'shiftUp','shiftDown','clutchTap','clutchQuick','nitro',
      'park','reverse','neutral','drive'
    ];
    if(xinputSupported.includes(canonical.id)){
      return {type:'xinput',isExplicit};
    }
    return {type:'none',key:0,reason:'XInput không hỗ trợ action phụ trợ này khi tắt phím'};
  }

  return {type:'none',key:0,reason:'Không có route khả dụng'};
}

export function supportsAction(action,profile,capabilities={}) {
  const route=resolveActionRoute(action,profile,capabilities);
  return route.type!=='none';
}
