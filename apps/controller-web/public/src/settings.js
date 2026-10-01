export const DEFAULT_SETTINGS={receiverHost:'',steeringRangeDeg:900,steeringDeadzone:.03,steeringCurve:1,pedalDeadzone:.02,clutchThreshold:.5,sendRateHz:60,autoCenterMs:400,wheelLayout:'left'};
export const DEFAULT_CALIB={centerOffsetDeg:0,isCalibrated:false};
const finite=(v,f,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):f;
export function validateSettings(s={}){
  return {...DEFAULT_SETTINGS,receiverHost:typeof s.receiverHost==='string'?s.receiverHost.slice(0,200):'',
    steeringRangeDeg:finite(s.steeringRangeDeg,900,90,1080),steeringDeadzone:finite(s.steeringDeadzone,.03,0,.2),
    steeringCurve:finite(s.steeringCurve,1,.5,2.5),pedalDeadzone:finite(s.pedalDeadzone,.02,0,.2),
    clutchThreshold:finite(s.clutchThreshold,.5,.1,.9),sendRateHz:s.sendRateHz===120?120:60,
    autoCenterMs:finite(s.autoCenterMs,400,100,1200),wheelLayout:s.wheelLayout==='right'?'right':'left'};
}
class SettingsManager{
  constructor(){this.settings={...DEFAULT_SETTINGS};this.calibration={...DEFAULT_CALIB};this.load();}
  load(){try{
    this.settings=validateSettings(JSON.parse(localStorage.getItem('lan_wheel_settings_v3')||localStorage.getItem('lan_wheel_settings_v2')||'{}'));
    const c=JSON.parse(localStorage.getItem('lan_wheel_calib_v3')||'{}');
    this.calibration={centerOffsetDeg:finite(c.centerOffsetDeg,0,-540,540),isCalibrated:c.isCalibrated===true};
  }catch{}}
  saveSettings(s){this.settings=validateSettings({...this.settings,...s});localStorage.setItem('lan_wheel_settings_v3',JSON.stringify(this.settings));}
  saveCalibration(c){this.calibration={centerOffsetDeg:finite(c.centerOffsetDeg,0,-540,540),isCalibrated:c.isCalibrated===true};localStorage.setItem('lan_wheel_calib_v3',JSON.stringify(this.calibration));}
  getPairingToken(host=location.host){try{return JSON.parse(localStorage.getItem('lan_wheel_tokens_v3')||'{}')[host]||null;}catch{return null;}}
  setPairingToken(token,host=location.host){let data={};try{data=JSON.parse(localStorage.getItem('lan_wheel_tokens_v3')||'{}');}catch{} if(token)data[host]=token;else delete data[host];localStorage.setItem('lan_wheel_tokens_v3',JSON.stringify(data));}
  resetSettings(){this.saveSettings(DEFAULT_SETTINGS);}
  resetCalibration(){this.saveCalibration(DEFAULT_CALIB);}
  factoryReset(){for(const key of Object.keys(localStorage))if(key.startsWith('lan_wheel_'))localStorage.removeItem(key);this.settings={...DEFAULT_SETTINGS};this.calibration={...DEFAULT_CALIB};}
}
export const settingsMgr=new SettingsManager();
