const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),zlib=require('zlib');
const root=process.argv[2];
const size=(u)=>{let p=path.join(root,decodeURIComponent(new URL(u).pathname));if(!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');const b=fs.readFileSync(p);
 const comp=/\.(js|html|json|wasm)$/.test(p);return {raw:b.length,gz:comp?zlib.gzipSync(b,{level:6}).length:b.length,br:comp?zlib.brotliCompressSync(b,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:9}}).length:b.length,ext:path.extname(p)};};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});const pg=await ctx.newPage();
let reqs=[];pg.on('requestfinished',r=>reqs.push(r.url()));
const sum=(label)=>{const by={};let raw=0,gz=0,br=0;for(const u of new Set(reqs)){const s=size(u);raw+=s.raw;gz+=s.gz;br+=s.br;by[s.ext]=(by[s.ext]||0)+s.br;}
 console.log(label,'files',new Set(reqs).size,'raw',(raw/1e6).toFixed(2)+'MB','gzip',(gz/1e6).toFixed(2)+'MB','brotli',(br/1e6).toFixed(2)+'MB','brotli by type',JSON.stringify(Object.fromEntries(Object.entries(by).map(([k,v])=>[k,+(v/1e6).toFixed(2)]))));};
const tid=(t)=>pg.locator(`[data-testid="${t}"]`).first();
const t0=Date.now();await pg.goto('http://localhost:8099/');await tid('welcome-language-continue').waitFor();
console.log('first screen after',Date.now()-t0,'ms (local disk, no network delay); CanvasKit init',Math.round(await pg.evaluate(()=>globalThis.__skiaLoadMs)),'ms');
await pg.waitForTimeout(1500);sum('FIRST SCREEN:');
await tid('welcome-language-continue').click();await pg.waitForTimeout(800);await pg.getByText("Don't allow",{exact:true}).first().click();await pg.waitForTimeout(1000);
await tid('welcome-board-continue').click();await pg.waitForTimeout(2000);await tid('tour-not-now').click();await pg.waitForTimeout(1500);sum('UP TO HOME:');
await tid('home-vs-bot').click();await pg.waitForTimeout(1000);await tid('new-game-start').click();await pg.waitForTimeout(3000);await tid('roll-button').click();await pg.waitForTimeout(4000);sum('UP TO A GAME:');
// storage: reload keeps the welcome answers and the saved game?
await pg.reload();await pg.waitForTimeout(4000);const t=(await pg.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ').slice(0,160);console.log('AFTER RELOAD:',t);
console.log('localStorage keys:',await pg.evaluate(()=>Object.keys(localStorage).slice(0,12)));
await pg.screenshot({path:process.argv[3]+'-reload.png'});
// desktop
const d=await b.newContext({viewport:{width:1440,height:900},storageState:await ctx.storageState()});const p2=await d.newPage();await p2.goto('http://localhost:8099/');await p2.waitForTimeout(4000);await p2.screenshot({path:process.argv[3]+'-desktop-home.png'});
const c=p2.locator('[data-testid="home-continue"],[data-testid="home-saved"],[data-testid="home-hero-action"]').first();
console.log('desktop tids:',(await p2.evaluate(()=>[...document.querySelectorAll('[data-testid^="home-"]')].map(e=>e.getAttribute('data-testid')))).join(' ').slice(0,300));
await b.close();})();
