import {EventEmitter} from 'node:events';
import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {createProfile,detectGame,GAMES} from '../../../packages/profiles/src/index.js';

export function privateAddress(address=''){
  const a=address.replace(/^::ffff:/,'');
  return a==='::1'||/^127\./.test(a)||/^10\./.test(a)||/^192\.168\./.test(a)||/^172\.(1[6-9]|2\d|3[01])\./.test(a)||/^169\.254\./.test(a);
}
export function networkChoices(interfaces=os.networkInterfaces(),adapters=[]){
  const normalized=value=>String(value||'').trim().toLowerCase();
  return Object.entries(interfaces).flatMap(([name,entries])=>entries.filter(i=>i.family==='IPv4'&&!i.internal&&privateAddress(i.address)).map(i=>{
    const adapter=adapters.find(a=>normalized(a.name)===normalized(name)||Number(a.interfaceIndex)===Number(i.scopeid));
    const description=adapter?.description||name;
    const evidence=[name,description,adapter?.pnpDeviceId].filter(Boolean).join(' ');
    if(/vmware|virtualbox|hyper-v|wi-?fi direct|wan miniport|loopback|kernel debug/i.test(evidence))return null;
    const usb=/remote\s*ndis|rndis|\bncm\b|\becm\b|apple mobile|iphone|android|pixel|samsung|xiaomi|huawei|oneplus|usb.{0,24}(ethernet|network|tether)|tether.{0,16}usb/i.test(evidence)||/^usb\\/i.test(adapter?.pnpDeviceId||'');
    const linkLocal=/^169\.254\./.test(i.address);
    return {name,address:i.address,description,kind:usb?'usb-network':/wi-?fi|wireless|wlan/i.test(evidence)?'wifi':'lan',usbVerified:usb&&!!adapter,linkLocal,usable:!linkLocal};
  }).filter(Boolean));
}

const BLOCKED_SYSTEM_EXES=new Set([
  'cmd.exe','powershell.exe','pwsh.exe','explorer.exe','rundll32.exe',
  'svchost.exe','taskmgr.exe','conhost.exe','mshta.exe','cscript.exe',
  'wscript.exe','regedit.exe','bash.exe','sh.exe','wt.exe'
]);

export class RuntimeManager extends EventEmitter{
  constructor(options={}){
    super();this.discoverScript=options.discoverScript;this.file=options.file;this.settings={selection:'auto',manualGame:'generic',profiles:{},custom:{}};
    try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(saved.version===1)this.settings={...this.settings,...saved.settings};}catch{}
    if(!['auto','manual'].includes(this.settings.selection))this.settings.selection='auto';
    if(!this.settings.profiles||typeof this.settings.profiles!=='object')this.settings.profiles={};
    this.snapshot={processes:[],foregroundPid:0};this.matches=[];this.candidate=null;this.stable=0;
    this.profile=createProfile(this.settings.manualGame,this.settings.profiles[this.settings.manualGame]);
    this.revision=1;this.targetPid=0;this.focused=false;this.detectError=null;this.adapters=[];
    if(options.detect!==false&&process.platform==='win32')this.start();
  }
  persist(){if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify({version:1,settings:this.settings}));fs.renameSync(temp,this.file);}
  start(){
    // Bundled desktop supplies this script path; ESM gateway resolves its sibling.
    const dir=typeof __dirname!=='undefined'?path.resolve(__dirname,'../gateway/src'):path.dirname(fileURLToPath(import.meta.url));
    this.worker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',this.discoverScript||path.join(dir,'discover.ps1')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let pending='';this.worker.stdout.on('data',chunk=>{pending+=chunk;let n;while((n=pending.indexOf('\n'))>=0){const line=pending.slice(0,n);pending=pending.slice(n+1);try{this.observe(JSON.parse(line));}catch{}}});
    this.worker.on('error',e=>{this.detectError=e.message;this.emit('status');});
    this.worker.stderr.on('data',()=>{this.detectError='Không đọc được tiến trình; có thể chọn profile thủ công.';});
    this.worker.on('exit',()=>{this.focused=false;this.detectError='Nhận diện game đã dừng; chọn thủ công hoặc khởi động lại Receiver.';this.emit('focus',false);this.emit('status');});
    this.refreshNetworks();this.networkTimer=setInterval(()=>this.refreshNetworks(),5000);this.networkTimer.unref();
  }
  refreshNetworks(){
    if(process.platform!=='win32')return Promise.resolve(this.status().networks);
    if(this._refreshingNetworks)return this._refreshingNetworks;
    const command='Get-CimInstance Win32_NetworkAdapter | Where-Object { $_.NetConnectionID } | Select-Object @{n="name";e={$_.NetConnectionID}},@{n="description";e={$_.Name}},@{n="pnpDeviceId";e={$_.PNPDeviceID}},@{n="interfaceIndex";e={$_.InterfaceIndex}},@{n="enabled";e={$_.NetEnabled}} | ConvertTo-Json -Compress';
    this._refreshingNetworks=new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:8000},(err,stdout)=>{
      this._refreshingNetworks=null;
      if(!err){try{const value=JSON.parse(stdout);this.adapters=(Array.isArray(value)?value:[value]).filter(Boolean);this.emit('status');}catch{}}
      resolve(this.status().networks);
    }));
    return this._refreshingNetworks;
  }
  observe(snapshot){
    if(snapshot.error){this.detectError=snapshot.error;this.emit('status');return;}
    this.detectError=null;this.snapshot=snapshot;
    const result=detectGame(snapshot.processes,snapshot.foregroundPid,this.settings.custom);this.matches=result.matches;
    const selected=this.settings.selection==='manual'?result.matches.find(m=>m.gameId===this.settings.manualGame&&m.foreground):result.selected;
    const candidate=selected?.gameId||null;
    this.stable=candidate===this.candidate?this.stable+1:1;this.candidate=candidate;
    const focused=!!selected&&selected.gameId===this.profile.gameId;
    if(this.focused!==focused){this.focused=focused;this.emit('focus',focused);}
    if(this.targetPid!==0&&!snapshot.processes.some(p=>p.pid===this.targetPid)){
      this.targetPid=0;this.focused=false;
    }
    if(selected&&this.stable>=2&&(selected.gameId!==this.profile.gameId||selected.pid!==this.targetPid)){
      this.targetPid=selected.pid;this.profile=createProfile(selected.gameId,this.settings.profiles[selected.gameId]);this.focused=true;this.revision++;this.emit('profile');
    }
    this.emit('status');
  }
  choose({selection,gameId,profile,executable,reset}={}){
    if(selection && !['auto','manual'].includes(selection))throw new Error('Chế độ profile không hợp lệ');
    if(gameId&&!GAMES.some(g=>g.id===gameId))throw new Error('Profile không hợp lệ');
    if(selection)this.settings.selection=selection;
    if(gameId)this.settings.manualGame=gameId;
    const id=gameId||this.profile.gameId;
    if(reset){
      delete this.settings.profiles[id];
      for(const [k, v] of Object.entries(this.settings.custom)){
        if(v === id) delete this.settings.custom[k];
      }
    }
    if(executable !== undefined){
      let exeName=typeof executable==='string'?executable.trim().replace(/^["']|["']$/g,''):'';
      if(exeName.includes('/')||exeName.includes('\\')){
        exeName=path.basename(exeName.replace(/\\/g, '/'));
      }
      if(exeName){
        if(!/^[\w. -]+\.exe$/i.test(exeName))throw new Error('Tên tiến trình phải kết thúc bằng .exe');
        const exeLower=exeName.toLowerCase();
        if(BLOCKED_SYSTEM_EXES.has(exeLower))throw new Error('Không thể gán tiến trình hệ thống làm game');
        for(const [k, v] of Object.entries(this.settings.custom)){
          if(v === id) delete this.settings.custom[k];
        }
        this.settings.custom[exeLower]=id;
      } else {
        for(const [k, v] of Object.entries(this.settings.custom)){
          if(v === id) delete this.settings.custom[k];
        }
      }
    }
    if(!reset && profile)this.settings.profiles[id]=createProfile(id,profile);
    this.profile=createProfile(id,this.settings.profiles[id]);
    const match=this.matches.find(m=>m.gameId===id&&m.foreground);this.targetPid=match?.pid||0;this.focused=!!match;
    this.revision++;this.persist();this.emit('profile');this.emit('status');
  }
  status(){return {selection:this.settings.selection,profile:this.profile,profiles:this.settings.profiles,custom:this.settings.custom,revision:this.revision,targetPid:this.targetPid,
    focused:this.focused,matches:this.matches,error:this.detectError,networks:networkChoices(undefined,this.adapters)};}
  close(){clearInterval(this.networkTimer);this.worker?.removeAllListeners('exit');this.worker?.kill();}
}
