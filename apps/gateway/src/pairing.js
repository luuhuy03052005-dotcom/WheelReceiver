import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
export class PairingManager extends EventEmitter{
  constructor(file){
    super();this.file=file;this.currentNonce=null;this.nonceExpiresAt=0;this.devices=new Map();
    try{const data=JSON.parse(fs.readFileSync(file,'utf8'));for(const d of data)if(typeof d.hash==='string'&&d.hash.length===64)this.devices.set(d.hash,d);}catch{}
  }
  hash(token){return crypto.createHash('sha256').update(token).digest('hex');}
  persist(){if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify([...this.devices.values()]),{mode:0o600});fs.renameSync(temp,this.file);}
  generateNonce(){
    this.currentNonce=crypto.randomInt(100000,1000000).toString();this.nonceExpiresAt=Date.now()+120000;
    return {nonce:this.currentNonce,expiresAt:this.nonceExpiresAt,expiresInSec:120};
  }
  exchangeNonce(nonce,name='Điện thoại'){
    if(!this.currentNonce||Date.now()>=this.nonceExpiresAt){this.currentNonce=null;return {success:false,reason:'Nonce expired or not found'};}
    if(typeof nonce!=='string'||nonce.trim()!==this.currentNonce)return {success:false,reason:'Invalid nonce'};
    this.currentNonce=null;this.nonceExpiresAt=0;
    const token=crypto.randomBytes(32).toString('hex'),hash=this.hash(token);
    this.devices.set(hash,{hash,id:crypto.randomUUID(),name:String(name).slice(0,60),createdAt:Date.now()});this.persist();
    return {success:true,token};
  }
  validateToken(token){return typeof token==='string'&&token.length===64&&this.devices.has(this.hash(token));}
  list(){return [...this.devices.values()].map(({hash,...device})=>device);}
  revokeToken(token){if(typeof token==='string')this.devices.delete(this.hash(token));this.persist();this.emit('revoked');}
  revokeDevice(id){for(const [hash,d]of this.devices)if(d.id===id)this.devices.delete(hash);this.persist();this.emit('revoked');}
  revokeAll(){this.devices.clear();this.persist();this.emit('revoked');}
}
