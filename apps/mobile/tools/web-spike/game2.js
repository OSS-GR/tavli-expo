const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});const pg=await ctx.newPage();
const errs=[];pg.on('pageerror',e=>errs.push('PAGEERROR '+String(e).slice(0,300)));pg.on('console',m=>{if(m.type()==='error')errs.push('error '+m.text().slice(0,200))});
const tid=(t)=>pg.locator(`[data-testid="${t}"]`).first();const tids=()=>pg.evaluate(()=>[...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid')));
const txt=async()=>(await pg.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ');
await pg.goto('http://localhost:8099/');await tid('welcome-language-continue').waitFor();await tid('welcome-language-continue').click();await pg.waitForTimeout(800);
await pg.getByText("Don't allow",{exact:true}).first().click();await pg.waitForTimeout(1000);await tid('welcome-board-continue').click();await pg.waitForTimeout(2000);await tid('tour-not-now').click();await pg.waitForTimeout(1200);
await tid('home-vs-bot').click();await pg.waitForTimeout(1000);await tid('new-game-level-hard').click().catch(()=>{});await tid('new-game-start').click();await pg.waitForTimeout(3000);
for(let i=0;i<8;i++){const t=await txt();if(t.includes('Your turn')&&t.includes('→'))break;if(await tid('roll-button').isVisible().catch(()=>false))await tid('roll-button').click().catch(()=>{});await pg.waitForTimeout(3500);}
const before=new Set(await tids());const t0=Date.now();await tid('hint-button').click();
let dt=null;for(let i=0;i<200;i++){const now=await tids();if(now.some(x=>!before.has(x))){dt=Date.now()-t0;console.log('new tids after hint:',now.filter(x=>!before.has(x)).slice(0,6).join(' '));break;}await pg.waitForTimeout(25);}
console.log('HINT shown after',dt,'ms');await pg.waitForTimeout(800);await pg.screenshot({path:process.argv[2]+'-hint.png'});
const canvasBefore=await pg.evaluate(()=>{const c=document.querySelector('[data-testid="game-board"] canvas')||document.querySelector('canvas');c.__mark=1;return document.querySelectorAll('canvas').length});
await pg.setViewportSize({width:1440,height:900});await pg.waitForTimeout(2500);
console.log('canvases',canvasBefore,'same canvas after resize:',await pg.evaluate(()=>[...document.querySelectorAll('canvas')].some(c=>c.__mark===1)));
await pg.screenshot({path:process.argv[2]+'-desktop-game.png'});
await pg.setViewportSize({width:844,height:390});await pg.waitForTimeout(2500);await pg.screenshot({path:process.argv[2]+'-phone-landscape.png'});
console.log(errs.join('\n'));await b.close();})();
