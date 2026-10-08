const CACHE='wheel-controller-v48';
const ASSETS=[
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.png',
  './icon.svg',
  './src/app.js',
  './src/viewport-lock.js',
  './src/layout-editor.js',
  './src/h-shifter.js',
  './src/settings.js',
  './src/protocol.js',
  './src/control-math.js',
  './src/wheel.js',
  './src/pedals.js',
  './src/assets.js',
  './images/Wheel.png',
  './images/Si_nhan_trai.png',
  './images/Si_nhan_phai.png',
  './images/horn.png',
  './images/light_short.png',
  './images/light_far.png',
  './images/Start_Stop_engine.png',
  './images/hop_so_tuan_tu.png',
  '/packages/protocol/src/index.js',
  '/packages/control-math/src/index.js',
  '/packages/profiles/src/index.js',
  '/packages/profiles/src/input-state.js'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wheel-controller-')||k.startsWith('lan-racing-wheel-')).filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/')||url.pathname==='/ws')return;
  event.respondWith(caches.match(event.request).then(cached=>{
    if(cached)return cached;
    return fetch(event.request).then(response=>{
      if(response&&response.status===200&&response.type==='basic'){
        const clone=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,clone));
      }
      return response;
    });
  }).catch(()=>caches.match(event.request)));
});
