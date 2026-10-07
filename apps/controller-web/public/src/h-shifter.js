export const H_SLOTS=Object.freeze([
  {id:'gear1',label:'1',x:13,y:20},{id:'gear2',label:'2',x:13,y:80},
  {id:'gear3',label:'3',x:41,y:20},{id:'gear4',label:'4',x:41,y:80},
  {id:'gear5',label:'5',x:69,y:20},{id:'gear6',label:'6',x:69,y:80},
  {id:'reverse',label:'R',x:90,y:80}
]);

export function nearestHSlot(x,y,available=new Set(H_SLOTS.map(slot=>slot.id)),threshold=26){
  let selected=null,distance=threshold;
  for(const slot of H_SLOTS){
    if(!available.has(slot.id))continue;
    const next=Math.hypot(x-slot.x,y-slot.y);
    if(next<distance){selected=slot;distance=next;}
  }
  return selected;
}

export class HPatternShifter{
  constructor(stage,onChange){
    this.stage=stage;this.knob=stage.querySelector('#h-knob');this.onChange=onChange;this.knob.setAttribute('aria-valuemin','0');this.knob.setAttribute('aria-valuemax','7');
    this.buttons=[...stage.querySelectorAll('[data-h-gear]')];this.enabled=false;this.pointer=null;this.stageRect=null;
    this.rangeHigh=false;this.splitHigh=false;
    this.togglesContainer=document.getElementById('h-shifter-truck-toggles');
    this.rangeBtn=document.getElementById('h-range-toggle');
    this.splitBtn=document.getElementById('h-split-toggle');
    this.available=new Set(H_SLOTS.map(slot=>slot.id));this.bind();this.reset(false);
  }
  bind(){
    if(this.rangeBtn){
      this.rangeBtn.addEventListener('click',()=>{
        if(window.app?.layoutEditor?.editing||!this.enabled||!window.app?.armed)return;
        this.rangeHigh=!this.rangeHigh;
        this.updateRangeUI();
        if(window.app?.input){
          window.app.input.press('range',performance.now());
          setTimeout(()=>window.app?.input?.release('range'),60);
        }
      });
    }
    if(this.splitBtn){
      this.splitBtn.addEventListener('click',()=>{
        if(window.app?.layoutEditor?.editing||!this.enabled||!window.app?.armed)return;
        this.splitHigh=!this.splitHigh;
        this.updateSplitUI();
        if(window.app?.input){
          window.app.input.press('splitter',performance.now());
          setTimeout(()=>window.app?.input?.release('splitter'),60);
        }
      });
    }
    for(const button of this.buttons)button.addEventListener('click',()=>{
      if(window.app?.layoutEditor?.editing||!this.enabled||!window.app?.armed)return;
      if(!button.disabled)this.select(button.dataset.hGear);
    });
    this.knob.addEventListener('pointerdown',event=>{
      if(window.app?.layoutEditor?.editing||!this.enabled||!window.app?.armed)return;
      const cockpitMain=document.getElementById('cockpit-main');
      if(cockpitMain&&(cockpitMain.classList.contains('hud-edit-mode')||cockpitMain.classList.contains('layout-editing')))return;
      if(this.pointer!==null)return;
      event.preventDefault();this.pointer=event.pointerId;this.previousGear=this.gear;this.stageRect=this.stage.getBoundingClientRect();
      try{this.knob.setPointerCapture(event.pointerId);}catch{}
      this.knob.classList.add('dragging');
    });
    this.knob.addEventListener('pointermove',event=>{
      if(event.pointerId!==this.pointer)return;event.preventDefault();
      const point=this.point(event.clientX,event.clientY);this.place(point.x,point.y,false);
      const slot=nearestHSlot(point.x,point.y,this.available);this.apply(slot?.id||null,true);
    });
    const onUp=event=>{
      if(event.pointerId!==this.pointer)return;event.preventDefault();
      const id=this.pointer;this.pointer=null;this.stageRect=null;this.knob.classList.remove('dragging');
      if(id!==null&&this.knob.hasPointerCapture?.(id)){try{this.knob.releasePointerCapture(id);}catch{}}
      const point=this.point(event.clientX,event.clientY),slot=nearestHSlot(point.x,point.y,this.available);
      this.select(slot?.id||null);
    };
    const onCancel=event=>{
      if(event.pointerId!==this.pointer)return;event.preventDefault();
      const id=this.pointer;this.pointer=null;this.stageRect=null;this.knob.classList.remove('dragging');
      if(id!==null&&this.knob.hasPointerCapture?.(id)){try{this.knob.releasePointerCapture(id);}catch{}}
      this.select(this.previousGear!==undefined?this.previousGear:this.gear);
    };
    this.knob.addEventListener('pointerup',onUp);
    this.knob.addEventListener('pointercancel',onCancel);
    this.knob.addEventListener('lostpointercapture',event=>{
      if(event.pointerId!==this.pointer)return;
      onCancel(event);
    });
  }
  point(clientX,clientY){
    const rect=this.stageRect||this.stage.getBoundingClientRect();
    return {x:Math.max(6,Math.min(94,(clientX-rect.left)/rect.width*100)),y:Math.max(10,Math.min(90,(clientY-rect.top)/rect.height*100))};
  }
  place(x,y,animate=true){this.knob.classList.toggle('snap',animate);this.knob.style.left=x+'%';this.knob.style.top=y+'%';}
  getGearLabel(id){
    if(!id)return 'N';
    if(id==='reverse')return 'R';
    const num=parseInt(id.replace('gear',''),10);
    return isNaN(num)?id:String(this.rangeHigh?num+6:num);
  }
  updateRangeUI(){
    for(const button of this.buttons){
      const g=button.dataset.hGear;
      if(g&&g.startsWith('gear')){
        const num=parseInt(g.replace('gear',''),10);
        button.textContent=String(this.rangeHigh?num+6:num);
      }
    }
    if(this.rangeBtn){
      this.rangeBtn.classList.toggle('active',this.rangeHigh);
      const txt=this.rangeBtn.querySelector('.toggle-txt');
      if(txt)txt.textContent=this.rangeHigh?'RANGE · 7-12':'RANGE · 1-6';
    }
    if(this.gear){
      this.knob.textContent=this.getGearLabel(this.gear);
      const display=document.getElementById('gear-display');
      if(display)display.textContent=this.getGearLabel(this.gear);
    }
  }
  updateSplitUI(){
    if(this.splitBtn){
      this.splitBtn.classList.toggle('active',this.splitHigh);
      const txt=this.splitBtn.querySelector('.toggle-txt');
      if(txt)txt.textContent=this.splitHigh?'SPLIT · H':'SPLIT · L';
    }
  }
  apply(id,notify=true){
    if(this.gear===id)return;this.gear=id;
    if(navigator.vibrate)try{navigator.vibrate(22);}catch{}
    for(const button of this.buttons)button.classList.toggle('active',button.dataset.hGear===id);
    const label=this.getGearLabel(id);
    this.knob.textContent=label;
    const slot=H_SLOTS.find(value=>value.id===id);
    this.knob.setAttribute('aria-valuenow',String(slot?H_SLOTS.indexOf(slot)+1:0));
    this.knob.setAttribute('aria-valuetext',label==='N'?'Mo':label);
    if(notify)this.onChange?.(id);
  }
  select(id,notify=true){
    const slot=H_SLOTS.find(value=>value.id===id&&this.available.has(value.id));
    if(slot){this.place(slot.x,slot.y);this.apply(slot.id,notify);}
    else{this.place(41,50);this.apply(null,notify);}
  }
  setEnabled(value){
    this.enabled=!!value;
    this.stage.classList.toggle('disabled',!this.enabled);
    if(this.togglesContainer)this.togglesContainer.hidden=!this.enabled;
    if(!this.enabled&&this.pointer!==null){
      this.cancelDrag();
    }
  }
  cancelDrag(){
    const id=this.pointer;
    this.pointer=null;
    this.stageRect=null;
    this.knob.classList.remove('dragging');
    if(id!==null&&this.knob.hasPointerCapture?.(id)){
      try{this.knob.releasePointerCapture(id);}catch{}
    }
    this.select(this.gear,false);
  }
  reset(notify=true){
    const id=this.pointer;
    this.pointer=null;
    this.stageRect=null;
    this.previousGear=null;
    this.knob.classList.remove('dragging');
    if(id!==null&&this.knob.hasPointerCapture?.(id)){
      try{this.knob.releasePointerCapture(id);}catch{}
    }
    this.select(null,notify);
  }
}
