export function viewportBox(win){
  const viewport=win.visualViewport;
  const width=viewport?.width||win.innerWidth||win.document?.documentElement?.clientWidth||1;
  const height=viewport?.height||win.innerHeight||win.document?.documentElement?.clientHeight||1;
  return {
    width:Math.max(1,Math.round(width)),
    height:Math.max(1,Math.round(height)),
    left:Math.max(0,Math.round(viewport?.offsetLeft||0)),
    top:Math.max(0,Math.round(viewport?.offsetTop||0))
  };
}

export function applyViewportBox(root,box){
  root.style.setProperty('--app-width',box.width+'px');
  root.style.setProperty('--app-height',box.height+'px');
  root.style.setProperty('--app-left',box.left+'px');
  root.style.setProperty('--app-top',box.top+'px');
}

export function installViewportLock(win=window,doc=document){
  let frame=0;
  const update=()=>{
    frame=0;
    applyViewportBox(doc.documentElement,viewportBox(win));
    if(win.scrollX||win.scrollY)win.scrollTo(0,0);
  };
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(update);};
  const preventGesture=event=>event.preventDefault();
  const preventMultiTouch=event=>{if(event.touches&&event.touches.length>1)event.preventDefault();};
  
  let lastTouchEnd=0;
  const preventDoubleTap=event=>{
    const now=Date.now();
    if(now-lastTouchEnd<=300){
      event.preventDefault();
    }
    lastTouchEnd=now;
  };

  const preventCtrlWheel=event=>{
    if(event.ctrlKey)event.preventDefault();
  };

  update();
  const onViewportResize=()=>{
    if(win.visualViewport.scale>1||win.scrollX||win.scrollY){
      win.scrollTo(0,0);
    }
    schedule();
  };
  const onViewportScroll=()=>{win.scrollTo(0,0);schedule();};
  win.addEventListener('resize',schedule,{passive:true});
  win.addEventListener('orientationchange',schedule,{passive:true});
  win.visualViewport?.addEventListener('resize',onViewportResize,{passive:true});
  win.visualViewport?.addEventListener('scroll',onViewportScroll,{passive:true});
  doc.addEventListener('gesturestart',preventGesture,{passive:false});
  doc.addEventListener('gesturechange',preventGesture,{passive:false});
  doc.addEventListener('gestureend',preventGesture,{passive:false});
  doc.addEventListener('touchstart',preventMultiTouch,{passive:false});
  doc.addEventListener('touchmove',preventMultiTouch,{passive:false});
  doc.addEventListener('touchend',preventDoubleTap,{passive:false});
  doc.addEventListener('dblclick',preventGesture,{passive:false});
  doc.addEventListener('wheel',preventCtrlWheel,{passive:false});

  return ()=>{
    if(frame)win.cancelAnimationFrame(frame);
    win.removeEventListener('resize',schedule);
    win.removeEventListener('orientationchange',schedule);
    win.visualViewport?.removeEventListener('resize',onViewportResize);
    win.visualViewport?.removeEventListener('scroll',onViewportScroll);
    doc.removeEventListener('gesturestart',preventGesture);
    doc.removeEventListener('gesturechange',preventGesture);
    doc.removeEventListener('gestureend',preventGesture);
    doc.removeEventListener('touchstart',preventMultiTouch);
    doc.removeEventListener('touchmove',preventMultiTouch);
    doc.removeEventListener('touchend',preventDoubleTap);
    doc.removeEventListener('dblclick',preventGesture);
    doc.removeEventListener('wheel',preventCtrlWheel);
  };
}
