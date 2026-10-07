import {encodeSnapshot,BUTTONS} from './protocol.js';
import {normalizeSteering,normalizePedal} from './control-math.js';
import {settingsMgr} from './settings.js';
import {SteeringWheel} from './wheel.js';
import {PedalControl} from './pedals.js';
import {LayoutEditor} from './layout-editor.js';
import {HPatternShifter,H_SLOTS} from './h-shifter.js';
import {installViewportLock} from './viewport-lock.js';
import {ACTIONS,GAMES,GROUPS,MODES,DEFAULT_KEYS,createProfile,supportsAction} from '../../../../packages/profiles/src/index.js';
import {InputState} from '../../../../packages/profiles/src/input-state.js';
const $=id=>document.getElementById(id);
const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5c5 0 7 3 7 7s-2 7-7 7V5ZM3 7h6M2 12h7M3 17h6"/></svg>';
class ControllerApp{
  constructor(){
    this.ws=null;this.armed=false;this.authenticated=false;this.sequence=0;this.pending=new Map();this.input=new InputState();this.sessionEpoch=1;this.input.requireTransmittedGap=true;
    this.profile=createProfile();this.input.setMode(this.profile.mode);this.capabilities={};this.revision=0;this.stats={count:0,start:performance.now(),hz:0};
    this.angleOutput=$('wheel-angle');this.diagnosticsOutput=$('diagnostics');this.lastAngle=null;
    this.wheel=new SteeringWheel($('wheel-canvas'),{steeringRangeDeg:settingsMgr.settings.steeringRangeDeg,autoCenterMs:settingsMgr.settings.autoCenterMs});
    this.pedals={};this.travel={throttle:0,brake:0,clutch:0};
    for(const key of ['throttle','brake','clutch'])this.pedals[key]=new PedalControl($(key+'-col'),$(key+'-fill'),$(key+'-val'),v=>this.travel[key]=v);
    this.hShifter=new HPatternShifter($('h-shifter'),gear=>{if(!this.armed)return;this.input.gear=gear;$('gear-display').textContent=this.hShifter.getGearLabel(gear);});
    this.layoutEditor=new LayoutEditor({
      stage:$('cockpit-main'),layer:$('quick-controls'),palette:$('layout-palette'),
      onCreate:id=>{
        const primaryMap = {
          handbrake: { id: 'handbrake', label: 'PHANH TAY (A)', group: 'cabin', kind: 'hold' },
          shiftUp: { id: 'shiftUp', label: 'LÊN SỐ (+)', group: 'cabin', kind: 'pulse' },
          shiftDown: { id: 'shiftDown', label: 'XUỐNG SỐ (-)', group: 'cabin', kind: 'pulse' },
          clutchTap: { id: 'clutchTap', label: 'CÔN NHANH (LB)', group: 'cabin', kind: 'hold' },
          camera: { id: 'camera', label: 'CAMERA (RB)', group: 'game', kind: 'pulse' },
          nitro: { id: 'nitro', label: 'NITRO (Y)', group: 'game', kind: 'hold' },
          dpadUp: { id: 'dpadUp', label: 'D-PAD LÊN', group: 'game', kind: 'hold' },
          dpadDown: { id: 'dpadDown', label: 'D-PAD XUỐNG', group: 'game', kind: 'hold' },
          dpadLeft: { id: 'dpadLeft', label: 'D-PAD TRÁI', group: 'game', kind: 'hold' },
          dpadRight: { id: 'dpadRight', label: 'D-PAD PHẢI', group: 'game', kind: 'hold' }
        };
        const action = ACTIONS.find(item => item.id === id) || primaryMap[id];
        if (!action) return null;
        if (primaryMap[id]) {
          const btn = document.createElement('button');
          btn.className = 'action-button';
          btn.dataset.primary = id;
          btn.innerHTML = icon + `<span>${action.label}</span>`;
          this.bindButton(btn, id);
          return btn;
        }
        return this.actionButton(action);
      },
      onEditingChange:editing=>{
        if(editing)this.pause();
        else this.notify('Bố cục đã lưu thành công!');
        $('layout-editor').hidden=!editing;
        $('layout-edit').classList.toggle('active',editing);
      },
      onStatus:text=>$('layout-status').textContent=text
    });
    this.layoutEditor.useProfile(this.profile.gameId);
    const qrNonce=this.initUI();this.renderControls();this.syncSettings();this.setArmed(false);
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)this.pause();
      else this.wake();
    });
    window.addEventListener('pagehide',()=>this.pause());
    const onGeometryChange=()=>{
      if(this.wheel.isDragging)this.wheel.cancelDrag();
      for(const p of Object.values(this.pedals)){
        if(p.pointerId!==null)p.reset();
      }
      if(this.hShifter.pointer!==null)this.hShifter.cancelDrag();
      if(this.layoutEditor.drag)this.layoutEditor.cancelDrag();
    };
    window.addEventListener('resize',onGeometryChange,{passive:true});
    window.addEventListener('orientationchange',onGeometryChange,{passive:true});
    this.connect(qrNonce);this.loop(performance.now());
    this.lastServerMessage=Date.now();
    this.pingTimer=setInterval(()=>{
      if(this.ws?.readyState===1){
        this.send({type:'ping',clientTime:performance.now()});
        if(Date.now()-this.lastServerMessage>6000){
          try{this.ws.close();}catch{}
        }
      }
    },2000);
    if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
    this.wake();
  }
  wake(){if('wakeLock'in navigator&&!document.hidden)navigator.wakeLock.request('screen').catch(()=>{});}
  notify(text){clearTimeout(this.noticeTimer);$('notice').textContent=text;$('notice').classList.remove('quiet');this.noticeTimer=setTimeout(()=>$('notice').classList.add('quiet'),4500);}
  send(msg){if(this.ws?.readyState===1)this.ws.send(JSON.stringify(msg));}
  host(){return (settingsMgr.settings.receiverHost||location.host).replace(/^(https?|wss?):\/\//i,'').replace(/\/$/,'');}
  connect(nonce){
    clearTimeout(this.reconnect);this.authenticated=false;this.pending.clear();
    if(this.ws){this.ws.onclose=null;this.ws.close();}
    const host=this.host();if(!/^[\w.[\]:-]+$/.test(host)){this.notify('Địa chỉ Receiver không hợp lệ.');return;}
    this.activeHost=host;$('connection-label').textContent='Đang kết nối…';$('connection-dot').classList.remove('connected');
    try{
      const socket=this.ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+host+'/ws');socket.binaryType='arraybuffer';
      socket.onopen=()=>{
        const token=settingsMgr.getPairingToken(host);
        if(nonce)this.send({type:'pair',nonce,name:navigator.platform||'Điện thoại'});
        else if(token)this.send({type:'auth',token});
        else {this.notify('Kết nối mạng đã sẵn sàng. Nhập PIN từ Receiver.');$('connection-label').textContent='Cần ghép đôi';}
      };
      socket.onmessage=e=>{if(socket!==this.ws)return;this.lastServerMessage=Date.now();try{this.message(JSON.parse(e.data));}catch(error){console.error(error);}};
      socket.onerror=()=>{this.notify('Không kết nối được Receiver. Kiểm tra địa chỉ, cáp/Wi‑Fi và firewall.');};
      socket.onclose=()=>{this.authenticated=false;this.setArmed(false);$('connection-label').textContent='Mất kết nối · Đang thử lại…';$('connection-dot').classList.remove('connected');clearTimeout(this.reconnect);this.reconnect=setTimeout(()=>this.connect(),800);};
    }catch(error){this.notify(error.message);}
  }
  message(msg){
    if(msg.type==='paired'||msg.type==='auth_ok'){
      if(msg.token)settingsMgr.setPairingToken(msg.token,this.activeHost);
      this.authenticated=true;this.sequence=0;this.reset();$('connect-dialog').close();
      this.setArmed(false);
      $('connection-label').textContent='Đã kết nối · Chờ Bắt đầu';$('connection-dot').classList.add('connected');
      this.renderControls();
      this.notify('Đã kết nối! Nhấn Bắt đầu để lái.');
    }else if(msg.type==='error'){this.notify(msg.message);$('pair-feedback').textContent=msg.message;}
    else if(msg.type==='status'){
      this.receiveStatus(msg);
    }
    else if(msg.type==='paused'){
      this.setArmed(false);
      $('connection-label').textContent='Đã tạm ngưng';
      $('connection-dot').classList.remove('connected');
      this.notify(msg.reason||'Đã tạm ngưng điều khiển');
    }
    else if(msg.type==='resumed'){
      this.revision=msg.revision;this.setArmed(true);this.sendStateFrame(true);
      $('connection-label').textContent='Đang điều khiển';$('connection-dot').classList.add('connected');
      this.notify('Đang điều khiển · sẵn sàng.');
    }
    else if(msg.type==='resume_rejected'){
      this.setArmed(false);
      this.notify('Chưa thể lái: '+(msg.message||msg.reason));
      this.updateArmButton();
    }
    else if(msg.type==='ack'){
      const snapshot=this.pending.get(msg.sequence);
      if(snapshot&&snapshot.sessionEpoch===this.sessionEpoch&&msg.revision===this.revision){this.input.acknowledge(snapshot);this.pending.delete(msg.sequence);this.stats.count++;}
    }else if(msg.type==='require_neutral'){
      this.reset();
      this.notify('Đưa vô-lăng và bàn đạp về tâm để mở khóa điều khiển');
    }else if(msg.type==='pong')$('rtt').textContent=Math.round(performance.now()-msg.clientTime)+' ms RTT';
  }
  receiveStatus(msg){
    this.serverStatus=msg;this.capabilities=msg.bridge||{};this.revision=msg.appliedRevision;
    const changed=this.profileRevision!==msg.revision||this.lastBackend!==JSON.stringify(this.capabilities);
    if(changed){
      this.reset();
      this.profileRevision=msg.revision;this.lastBackend=JSON.stringify(this.capabilities);this.profile=createProfile(msg.profile.gameId,msg.profile);this.input.setMode(this.profile.mode);
      this.wheel.setRange(this.profile.range);this.layoutEditor.useProfile(this.profile.gameId);this.renderControls();this.fillProfileForm(msg);
    }
    $('profile-name').textContent=this.profile.name;
    $('profile-detail').textContent=MODES[this.profile.mode]+' · '+(msg.focused?'Game ở cửa sổ chính':'Sẵn sàng điều khiển');
    $('selection-badge').textContent=msg.selection==='auto'?'AUTO':'THỦ CÔNG';
    $('mode-badge').textContent=this.profile.mode;$('wheel-range').textContent=this.profile.range+'° lock-to-lock';
    this.updateArmButton();
    $('apply-pending').hidden=!msg.profilePending;
    $('output-state').textContent='OUTPUT · '+(msg.bridge.backend||'none').toUpperCase()+(msg.bridge.backend==='mock'?' · CHỈ KIỂM THỬ':'')+(msg.bridge.error?' · '+msg.bridge.error:'');
    $('capabilities').textContent=msg.bridge.backend==='vjoy'?msg.bridge.buttons+'/70 nút vJoy khả dụng. '+(msg.bridge.buttons<70?'Cấu hình ít nhất 70 nút để dùng đủ chức năng.':'Đủ đầu ra cho toàn bộ chức năng; hãy gán trong game.'):'XInput hỗ trợ điều khiển chính; nút phụ cần ánh xạ phím.';
    $('detected').textContent=msg.error||('Game nhận diện: '+(msg.matches.map(m=>m.name+(m.foreground?' • đang chọn':'')).join(', ')||'Sẵn sàng (Generic)'));
    const list=$('networks');list.replaceChildren();
    for(const n of msg.networks||[]){
      const a=document.createElement('a');a.href=location.protocol+'//'+n.address+':'+(new URL(location.protocol+'//'+this.activeHost).port||'32178');
      a.textContent=(n.kind==='usb-network'?'USB · ':n.kind==='wifi'?'Wi‑Fi · ':'LAN · ')+n.name+' — '+a.href;list.append(a);
    }
    const transport=msg.connectionTransport;
    $('transport').textContent=transport?transport:'Chỉ ghi nhận adapter khả dụng; chưa xác minh đường truyền USB cho phiên này.';
  }
  setArmed(value){
    this.armed=Boolean(value);if(!this.armed)this.reset();
    this.wheel.setEnabled?.(this.armed);for(const p of Object.values(this.pedals))p.setEnabled?.(this.armed);
    this.hShifter.setEnabled(this.armed&&this.profile.mode==='H');
    $('stop').disabled=!this.armed;
    this.updateArmButton();
    if(this.armed){
      this.layoutEditor.setEditing(false);
      if(!this.isSettingsOpen)$('setup-panel').hidden=true;
    }
  }
  reset(){
    this.input.reset();
    this.sessionEpoch=this.input.sessionEpoch;
    this.pending.clear();
    this.travel={throttle:0,brake:0,clutch:0};
    this.wheel.resetToCenter();
    for(const p of Object.values(this.pedals))p.reset();
    this.hShifter.reset(false);
    this.layoutEditor.cancelDrag?.();
    document.querySelectorAll('.action-button').forEach(el=>{
      el._resetPointer?.();
    });
    $('gear-display').textContent=this.profile.mode==='H'?'N':'—';
    this.updateArmButton();
  }
  updateArmButton(){
    const armBtn=$('arm');
    if(!armBtn)return;
    if(this.armed){
      armBtn.disabled=true;
      armBtn.title='Đang trong phiên lái (Driving)';
      return;
    }
    if(!this.authenticated){
      armBtn.disabled=true;
      armBtn.title='Chưa kết nối hoặc chưa xác thực controller';
      return;
    }
    if(!this.capabilities?.connected){
      armBtn.disabled=true;
      armBtn.title='Bridge chưa kết nối với Gateway';
      return;
    }
    if(!this.capabilities?.ready){
      armBtn.disabled=true;
      armBtn.title='Bridge chưa sẵn sàng';
      return;
    }
    const bridgeOk=this.serverStatus?.configured&&!this.serverStatus?.profilePending&&(this.serverStatus?.appliedRevision===this.serverStatus?.revision);
    if(!bridgeOk){
      armBtn.disabled=true;
      armBtn.title='Đang cấu hình profile...';
      return;
    }
    armBtn.disabled=false;
    armBtn.title='Bắt đầu điều khiển (Driving)';
  }
  neutralizeAll(){this.pause();}
  pause(){if(this.authenticated)this.send({type:'pause'});this.setArmed(false);}
  openPanel(id){
    if(id==='setup-panel'){
      this.isSettingsOpen=true;
      this.pause();
      this.layoutEditor.setEditing(false);
      $('setup-panel').hidden=false;
    } else {
      this.isSettingsOpen=false;
      $('setup-panel').hidden=true;
    }
  }
  bindButton(button,id){
    let pointer=null;
    if(!button._btnSourceId){
      button._btnSourceId='btn:'+id+':'+Math.random().toString(36).slice(2,7);
    }
    const touchSourceId=button._btnSourceId;
    if(!button._heldKeys){
      button._heldKeys=new Set();
    }
    const updateVisual=()=>{
      const isPressed=(pointer!==null)||(button._heldKeys&&button._heldKeys.size>0);
      button.classList.toggle('active',isPressed);
    };
    const downTouch=()=>{
      if(!this.armed||this.layoutEditor?.editing||button.disabled)return;
      this.input.press(id,touchSourceId);
      updateVisual();
    };
    const upTouch=()=>{
      this.input.release(id,touchSourceId);
      updateVisual();
    };
    const downKey=(code)=>{
      if(!this.armed||this.layoutEditor?.editing||button.disabled)return;
      if(button._heldKeys.has(code))return;
      button._heldKeys.add(code);
      const kbdSourceId='kbd:'+button._btnSourceId+':'+code;
      this.input.press(id,kbdSourceId);
      updateVisual();
    };
    const upKey=(code)=>{
      if(!button._heldKeys.has(code))return;
      button._heldKeys.delete(code);
      const kbdSourceId='kbd:'+button._btnSourceId+':'+code;
      this.input.release(id,kbdSourceId);
      updateVisual();
    };
    button._resetPointer=()=>{
      if(pointer!==null){
        const idToRelease=pointer;
        pointer=null;
        if(idToRelease!==null&&button.hasPointerCapture?.(idToRelease)){
          try{button.releasePointerCapture(idToRelease);}catch{}
        }
        this.input.release(id,touchSourceId);
      }
      if(button._heldKeys&&button._heldKeys.size>0){
        for(const code of button._heldKeys){
          const kbdSourceId='kbd:'+button._btnSourceId+':'+code;
          this.input.release(id,kbdSourceId);
        }
        button._heldKeys.clear();
      }
      updateVisual();
    };
    button._cleanup=button._resetPointer;
    button.addEventListener('pointerdown',e=>{
      if(pointer!==null)return;
      if(!this.armed||this.layoutEditor?.editing||button.disabled)return;
      e.preventDefault();
      pointer=e.pointerId;
      try{button.setPointerCapture(pointer);}catch{}
      downTouch();
    });
    const releasePointer=e=>{
      if(e.pointerId!==pointer)return;
      const idToRelease=pointer;
      pointer=null;
      if(idToRelease!==null&&button.hasPointerCapture?.(idToRelease)){
        try{button.releasePointerCapture(idToRelease);}catch{}
      }
      upTouch();
    };
    for(const type of ['pointerup','pointercancel','lostpointercapture']){
      button.addEventListener(type,releasePointer);
    }
    button.addEventListener('keydown',e=>{
      if(e.repeat)return;
      if([' ','Enter'].includes(e.key)){
        e.preventDefault();
        downKey(e.code);
      }
    });
    button.addEventListener('keyup',e=>{
      if([' ','Enter'].includes(e.key)){
        e.preventDefault();
        upKey(e.code);
      }
    });
    button.addEventListener('blur',()=>{
      if(button._heldKeys&&button._heldKeys.size>0){
        for(const code of Array.from(button._heldKeys)){
          upKey(code);
        }
      }
    });
  }
  actionButton(action){
    const button=document.createElement('button');button.className='action-button';button.dataset.action=action.id;
    const supported=supportsAction(action,this.profile,this.capabilities);
    button.innerHTML=icon;
    const label=document.createElement('span');label.textContent=action.label;button.append(label);
    const hint=document.createElement('small');
    const isGear=action.index<10;
    const defaultKey=(isGear&&this.profile.backend==='vjoy')?0:(DEFAULT_KEYS[action.index]||0);
    const key=this.profile.keys[action.index]||defaultKey;
    hint.textContent=supported?(key?'Phím '+this.keyName(key):'vJoy #'+action.vjoy)+(action.kind==='hold'?' · giữ':' · nhấn'):'Chưa có ánh xạ / đầu ra';
    button.append(hint);button.disabled=!supported;button.title=hint.textContent;this.bindButton(button,action.id);return button;
  }
  renderControls(){
    const availableGroups=Object.fromEntries(Object.entries(GROUPS).filter(([group])=>this.profile.groups.includes(group)));
    this.layoutEditor.setPalette(ACTIONS.filter(action=>action.group!=='transmission'&&this.profile.groups.includes(action.group)),availableGroups);
    this.layoutEditor.render();
    $('gear-buttons').replaceChildren();
    const gears=this.profile.mode==='AT'?['park','reverse','neutral','drive']:[];
    for(const id of gears){
      const a=ACTIONS.find(a=>a.id===id),b=document.createElement('button');b.textContent=a.label.replace(' · ',' ').replace('Số ','');b.disabled=!supportsAction(a,this.profile,this.capabilities);
      b.onclick=()=>{
        if(!this.armed)return;
        this.input.gear=id;
        $('gear-display').textContent=id.startsWith('gear')?id.slice(4):id[0].toUpperCase();
        for(const c of $('gear-buttons').children)c.classList.toggle('active',c===b);
      };
      $('gear-buttons').append(b);
    }
    const mode=this.profile.mode;
    const isH=mode==='H',isAT=mode==='AT',isMT=['MT','MTC'].includes(mode);
    const transCard=$('hud-transmission');
    if(transCard){transCard.classList.toggle('mode-h',isH);transCard.classList.toggle('mode-at',isAT);transCard.classList.toggle('mode-mt',isMT);}
    const hb=document.querySelector('.handbrake');if(hb)hb.hidden=isH||isAT;
    $('h-shifter').hidden=!isH;$('gear-buttons').hidden=!isAT;$('gear-display').classList.toggle('h-mode',isH);
    const shiftBtns=document.querySelector('.shift-buttons');if(shiftBtns)shiftBtns.hidden=!isMT;
    if(isH)$('gear-display').textContent=this.hShifter.getGearLabel(this.input.gear);
    this.hShifter.setAvailability(H_SLOTS.filter(slot=>supportsAction(ACTIONS.find(action=>action.id===slot.id),this.profile,this.capabilities)).map(slot=>slot.id));this.hShifter.setEnabled(this.armed&&isH);if(isH)this.hShifter.reset(false);
    $('clutch-col').hidden=!['MTC','H'].includes(mode);
  }
  fillProfileForm(status){
    $('selection').value=status.selection;$('game').value=this.profile.gameId;this.populateModes();
    $('mode').value=this.profile.mode;$('backend').value=this.profile.backend;$('range').value=this.profile.range;$('range-label').textContent=this.profile.range+'°';this.updateBinding();
  }
  populateModes(){const g=GAMES.find(g=>g.id===$('game').value)||GAMES[0];$('mode').replaceChildren();for(const mode of g.modes){const o=new Option(MODES[mode],mode);$('mode').add(o);}}
  keyName(code){
    if(code>=112&&code<=123)return 'F'+(code-111);
    if(code===32)return 'Space';
    if(code===13)return 'Enter';
    if(code===27)return 'Esc';
    if(code===219)return '[';
    if(code===221)return ']';
    if(code===186)return ';';
    if(code===222)return "'";
    if(code===188)return ',';
    if(code===190)return '.';
    if(code===191)return '/';
    return String.fromCharCode(code);
  }
  updateBinding(){const index=$('binding-action').value;$('binding-key').value=String(this.profile.keys[index]||0);}
  saveProfile(){
    if(this.armed){this.notify('Tạm ngưng trước khi đổi profile.');return;}
    this.reset();
    const id=$('game').value;
    const profile=createProfile(id,{...this.profile,mode:$('mode').value,backend:$('backend').value,range:Number($('range').value)});
    this.profile=profile;this.input.setMode(profile.mode);
    this.send({type:'profile',selection:$('selection').value,gameId:id,profile,executable:$('executable').value.trim()||undefined});
    this.notify('Đang áp dụng profile ở trạng thái neutral…');
  }
  syncSettings(){
    const s=settingsMgr.settings;
    $('deadzone').value=Math.round(s.steeringDeadzone*100);$('curve').value=s.steeringCurve;$('spring').value=s.autoCenterMs;
    $('clutch-threshold').value=Math.round(s.clutchThreshold*100);$('layout').value=s.wheelLayout;$('rate').value=s.sendRateHz;
    $('deadzone-label').textContent=$('deadzone').value+'%';$('curve-label').textContent=s.steeringCurve.toFixed(1);$('spring-label').textContent=s.autoCenterMs+' ms';$('clutch-threshold-label').textContent=$('clutch-threshold').value+'%';
    $('cockpit-main').classList.toggle('right',s.wheelLayout==='right');this.wheel.setAutoCenterDuration(s.autoCenterMs);
  }
  initUI(){
    for(const game of GAMES)$('game').add(new Option(game.name,game.id));
    for(const a of ACTIONS)$('binding-action').add(new Option(a.label,a.index));
    $('binding-key').add(new Option('vJoy / không gán phím',0));
    for(const code of [13,27,32,186,188,190,191,219,221,222,...Array.from({length:10},(_,i)=>48+i),...Array.from({length:26},(_,i)=>65+i),...Array.from({length:12},(_,i)=>112+i)])$('binding-key').add(new Option(this.keyName(code),code));
    $('binding-action').onchange=()=>this.updateBinding();
    $('game').onchange=()=>{this.populateModes();const p=createProfile($('game').value);$('backend').value=p.backend;$('range').value=p.range;$('range-label').textContent=p.range+'°';};
    $('apply-profile').onclick=()=>this.saveProfile();$('apply-pending').onclick=()=>{this.pause();this.send({type:'apply-profile'});};
    $('save-binding').onclick=()=>{this.pause();this.profile.keys[$('binding-action').value]=Number($('binding-key').value);this.saveProfile();$('binding-status').textContent='Đã yêu cầu lưu binding; gán chức năng tương ứng trong game.';};
    $('arm').onclick=()=>{if($('arm').disabled)return;this.isSettingsOpen=false;this.openPanel('drive-panel');this.reset();this.send({type:'resume',revision:this.serverStatus?.appliedRevision??this.revision});this.wake();};
    $('stop').onclick=()=>this.pause();$('setup-open').onclick=()=>this.openPanel('setup-panel');$('setup-close').onclick=()=>{this.isSettingsOpen=false;this.openPanel('drive-panel');};
    $('layout-edit').onclick=()=>{this.isSettingsOpen=false;this.openPanel('drive-panel');this.layoutEditor.setEditing(!this.layoutEditor.editing);};
    $('layout-done').onclick=()=>this.layoutEditor.setEditing(false);
    $('layout-smaller').onclick=()=>this.layoutEditor.resizeSelected(-5);
    $('layout-larger').onclick=()=>this.layoutEditor.resizeSelected(5);
    $('layout-remove').onclick=()=>this.layoutEditor.removeSelected();
    $('layout-clear').onclick=()=>this.layoutEditor.clear();
    const fsBtn = $('fullscreen-btn');
    if (fsBtn) {
      fsBtn.onclick = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      };
    }
    for(const b of document.querySelectorAll('[data-primary]'))this.bindButton(b,b.dataset.primary);
    $('connect-open').onclick=()=>{this.pause();$('receiver-host').value=this.host();$('connect-dialog').showModal();};
    $('connect-close').onclick=()=>$('connect-dialog').close();
    $('connect-form').onsubmit=e=>{e.preventDefault();const pin=$('pair-pin').value.trim();if(!/^\d{6}$/.test(pin))return;settingsMgr.saveSettings({receiverHost:$('receiver-host').value.trim()});$('pair-feedback').textContent='Đang ghép đôi…';this.connect(pin);};
    $('center').onclick=()=>{
      this.pause();
      const current=this.wheel.currentAngle||0;
      settingsMgr.saveCalibration({centerOffsetDeg:current,isCalibrated:true});
      this.wheel.resetToCenter();
      this.notify(`Đã đặt tâm vô-lăng (${current.toFixed(1)}°). Nhấn Bắt đầu để tiếp tục.`);
    };
    const fields={deadzone:['steeringDeadzone',.01],curve:['steeringCurve',1],spring:['autoCenterMs',1],'clutch-threshold':['clutchThreshold',.01]};
    for(const [id,[key,scale]]of Object.entries(fields))$(id).oninput=()=>{this.pause();settingsMgr.saveSettings({[key]:Number($(id).value)*scale});this.syncSettings();};
    $('range').oninput=()=>{
      const val=Number($('range').value);
      $('range-label').textContent=val+'°';
      const lbl=$('wheel-range');if(lbl)lbl.textContent=val+'°';
      this.profile.range=val;
      this.wheel.setRange(val);
      settingsMgr.saveSettings({steeringRangeDeg:val});
    };
    const rBtn=$('wheel-range-btn')||$('wheel-range');
    if(rBtn){
      const ranges=[360,540,720,900,1080];
      rBtn.onclick=()=>{
        const cur=this.profile.range||900;
        let idx=ranges.indexOf(cur);
        if(idx===-1)idx=ranges.indexOf(900);
        const next=ranges[(idx+1)%ranges.length];
        this.profile.range=next;
        this.wheel.setRange(next);
        const lbl=$('wheel-range');if(lbl)lbl.textContent=next+'°';
        if($('range'))$('range').value=next;
        if($('range-label'))$('range-label').textContent=next+'°';
        settingsMgr.saveSettings({steeringRangeDeg:next});
        this.notify(`Đã đổi góc quay vô-lăng: ${next}° (${(next/360).toFixed(1)} vòng)`);
      };
    }
    $('layout').onchange=()=>{settingsMgr.saveSettings({wheelLayout:$('layout').value});this.syncSettings();};
    $('rate').onchange=()=>settingsMgr.saveSettings({sendRateHz:Number($('rate').value)});
    $('reset-settings').onclick=()=>{
      const host=settingsMgr.settings.receiverHost;
      settingsMgr.resetSettings();
      settingsMgr.saveSettings({receiverHost:host});
      this.syncSettings();
      this.wheel.setRange(settingsMgr.settings.steeringRangeDeg);
      settingsMgr.saveCalibration({centerOffsetDeg:0,isCalibrated:false});
      const lbl=$('wheel-range');if(lbl)lbl.textContent=settingsMgr.settings.steeringRangeDeg+'°';
    };
    $('export-profile').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,profile:this.profile},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wheel-'+this.profile.gameId+'.json';a.click();URL.revokeObjectURL(url);};
    $('import-profile').onchange=async e=>{try{const file=e.target.files[0];if(!file||file.size>32768)throw new Error('Profile quá lớn');const data=JSON.parse(await file.text());if(data.version!==1||!GAMES.some(g=>g.id===data.profile?.gameId))throw new Error('Định dạng profile không hợp lệ');this.pause();this.send({type:'profile',selection:'manual',gameId:data.profile.gameId,profile:createProfile(data.profile.gameId,data.profile)});}catch(error){this.notify(error.message);}e.target.value='';};
    const params=new URLSearchParams(location.hash.slice(1)),pin=params.get('pin');
    if(pin&&/^\d{6}$/.test(pin)){$('pair-pin').value=pin;$('receiver-host').value=location.host;$('pair-feedback').textContent='Đang ghép đôi tự động…';history.replaceState(null,'',location.pathname);$('connect-dialog').showModal();return pin;}
    return undefined;
  }
  sendStateFrame(neutral=false){
    if(!this.armed||this.ws?.readyState!==1||(typeof document!=='undefined'&&document.hidden))return;
    if(this.ws.bufferedAmount>4096){return;} // backoff silently instead of pausing
    while(this.pending.size>=64){const oldestKey=this.pending.keys().next().value;this.pending.delete(oldestKey);} // clear stale acks without dropping frame
    const s=settingsMgr.settings,mode=this.profile.mode,snapshot=this.input.snapshot(performance.now(),mode);
    const hasClutch=['MTC','H'].includes(mode);
    const clutch=hasClutch?this.travel.clutch:0;
    let buttons=snapshot.buttons;
    let extended=snapshot.extended;
    // Gear mode byte for bridge (AT=1, MT=2, MTC=3, H=4)
    const gearModes={AT:1,MT:2,MTC:3,H:4};
    const gearMode=gearModes[mode]||0;
    // Clutch from pedal threshold
    if(clutch>=s.clutchThreshold)buttons|=BUTTONS.CLUTCH;
    // --- Mode-specific button/extended handling ---
    // Transmission action indices in extended bits
    const TRANSMISSION_MASK=0x3FFn; // bits 0-9 (gear1-6, reverse, park, drive, neutral)
    if(mode==='AT'){
      // AT: no clutch; manual gears 1-6 (bits 0-5) are cleared, but AT gears (P, R, N, D = bits 6,7,8,9) are preserved!
      buttons&=~(BUTTONS.CLUTCH|BUTTONS.SHIFT_UP|BUTTONS.SHIFT_DOWN);
      extended&=~0x3Fn;
    }else if(mode==='MT'){
      // MT: shift up/down in primary buttons only, no clutch, no gear in extended
      buttons&=~BUTTONS.CLUTCH;
      extended&=~TRANSMISSION_MASK;
    }else if(mode==='MTC'){
      // MTC: shift up/down + clutch, no H-pattern gear extended bits
      extended&=~TRANSMISSION_MASK;
    }else if(mode==='H'){
      // H-pattern: gear1-6 + reverse go via extended bits, clutch pedal active
      // Clear non-H transmission bits (park, drive, neutral = indices 7,8,9)
      buttons&=~(BUTTONS.SHIFT_UP|BUTTONS.SHIFT_DOWN);
      extended&=~((1n<<7n)|(1n<<8n)|(1n<<9n));
    }
    const cal=settingsMgr.calibration||{centerOffsetDeg:0};
    const correctedAngle=this.wheel.currentAngle-(cal.centerOffsetDeg||0);
    const state=neutral?{}:{buttons,extended,clutch:Math.round(clutch*255),gearMode,
      steering:normalizeSteering(correctedAngle,{maxAngleDeg:this.profile.range/2,deadzone:s.steeringDeadzone,curveExponent:s.steeringCurve}),
      brake:normalizePedal(this.travel.brake,{lowerDeadzone:s.pedalDeadzone,upperSaturation:1-s.pedalDeadzone}),
      throttle:normalizePedal(this.travel.throttle,{lowerDeadzone:s.pedalDeadzone,upperSaturation:1-s.pedalDeadzone})};
    this.sequence=(this.sequence+1)&255;state.sequence=this.sequence;
    for(const frame of encodeSnapshot(state))this.ws.send(frame);
    this.input.notifyTransmitted?.(snapshot,performance.now());
    this.pending.set(this.sequence,neutral?{active:new Set(),sessionEpoch:this.sessionEpoch}:{...snapshot,sessionEpoch:this.sessionEpoch});
  }
  loop(now){
    requestAnimationFrame(t=>this.loop(t));
    this.wheel.update(now);
    this.wheel.draw();
    const rounded=Math.round(this.wheel.currentAngle);
    if(rounded!==this.lastAngle){
      this.lastAngle=rounded;
      if(this.angleOutput)this.angleOutput.textContent=rounded+'°';
    }
    const interval=1000/settingsMgr.settings.sendRateHz;
    if(!this.nextSend||now>=this.nextSend){this.nextSend=now+interval;this.sendStateFrame();}
    if(now-this.stats.start>=1000){
      this.stats.hz=Math.round(this.stats.count*1000/(now-this.stats.start));
      if(this.diagnosticsOutput)this.diagnosticsOutput.textContent=this.stats.hz+' Hz · '+this.stats.count+' gói được nhận / chu kỳ';
      this.stats.count=0;
      this.stats.start=now;
    }
  }
}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  installViewportLock();
  window.app=new ControllerApp();
}
export {ControllerApp};
