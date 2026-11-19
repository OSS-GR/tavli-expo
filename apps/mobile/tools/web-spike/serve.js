// Static server with SPA fallback for the web export.
const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2],port=+process.argv[3]||8099;
const types={'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.webp':'image/webp','.m4a':'audio/mp4','.css':'text/css','.ttf':'font/ttf'};
http.createServer((q,s)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));
 if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');
 s.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(s);}).listen(port,()=>console.log('up',port));
