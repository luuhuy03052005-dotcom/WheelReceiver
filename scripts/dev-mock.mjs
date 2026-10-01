import {spawn} from 'node:child_process';
import path from 'node:path';
import {createGatewayServer} from '../apps/gateway/src/index.js';
const pipe='wheel_preview_'+process.pid;
const bridge=spawn('dotnet',[path.resolve('apps/bridge/Bridge/bin/Debug/net9.0/Bridge.dll'),'--mock','--pipe',pipe],{windowsHide:true,stdio:['ignore','pipe','pipe']});
bridge.on('error',console.error);bridge.stderr.on('data',data=>console.error(data.toString()));
const instance=createGatewayServer({pipePath:'\\\\.\\pipe\\'+pipe,detect:false});
const port=Number(process.env.PORT)||4310;
instance.server.listen(port,'127.0.0.1',()=>console.log('Mock preview http://127.0.0.1:'+port+' (pair through local PIN endpoint)'));
async function stop(){await instance.close();bridge.kill();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
