const CACHE='wheel-controller-v47';
const ASSETS=['./','./index.html','./style.css','./manifest.json','./icon.png','./icon.svg','./src/app.js','./src/viewport-lock.js','./src/layout-editor.js','./src/h-shifter.js','./src/settings.js','./src/protocol.js','./src/control-math.js','./src/wheel.js','./src/pedals.js','/packages/protocol/src/index.js','/packages/control-math/src/index.js','/packages/profiles/src/index.js','/packages/profiles/src/input-state.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wheel-controller-')||k.startsWith('lan-racing-wheel-')).filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/')||url.pathname==='/ws')return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response&&response.status===200&&response.type==='basic'){
      const clone=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,clone));
    }
    return response;
  }).catch(()=>caches.match(event.request)));
});
