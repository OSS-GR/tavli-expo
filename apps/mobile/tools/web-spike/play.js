// Start a game vs the bot and try one move by: mouse drag | mouse tap-tap | touch drag | touch tap-tap (argv[2]).
const {chromium}=require('playwright');
const mode=process.argv[2]||'drag';
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:mode.startsWith('t')});const pg=await ctx.newPage();
const errs=[];pg.on('pageerror',e=>errs.push('PAGEERROR '+String(e).slice(0,300)));
const tid=(t)=>pg.locator(`[data-testid="${t}"]`).first();
const txt=async()=>(await pg.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ');
await pg.goto('http://localhost:8099/');await pg.waitForTimeout(3500);
await pg.getByText('Continue',{exact:true}).first().click();await pg.waitForTimeout(1000);
await pg.getByText("Don't allow",{exact:true}).first().click();await pg.waitForTimeout(1200);
await tid('welcome-board-continue').click();await pg.waitForTimeout(2200);
await tid('tour-not-now').click();await pg.waitForTimeout(1200);
await tid('home-vs-bot').click();await pg.waitForTimeout(1200);await tid('new-game-start').click();await pg.waitForTimeout(3000);
for(let i=0;i<8;i++){const t=await txt();if(t.includes('Your turn')&&t.includes('→'))break;
  if(await tid('roll-button').isVisible().catch(()=>false))await tid('roll-button').click().catch(()=>{});await pg.waitForTimeout(3500);}
let t=await txt();const m=[...t.matchAll(/\| 24 → (\d+) \|/g)].map(x=>+x[1]).filter(n=>n>=19);
console.log('moves:',t.slice(t.indexOf('Moves'),t.indexOf('Undo')));
if(!t.includes('Your turn')||m.length===0){console.log('NO-TEST (bot started or no 24 move)');await b.close();return;}
const n=m[0];const from=[335,597],to=[300,597-(24-n)*42.3];
const cdp=await ctx.newCDPSession(pg);
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
if(mode==='drag'){await pg.mouse.move(...from);await pg.mouse.down();for(let i=1;i<=15;i++){await pg.mouse.move(from[0]+(to[0]-from[0])*i/15,from[1]+(to[1]-from[1])*i/15);await pg.waitForTimeout(16);}await pg.waitForTimeout(100);await pg.screenshot({path:process.argv[3]+'-mid.png'});await pg.mouse.up();}
if(mode==='tap'){await pg.mouse.click(...from);await pg.waitForTimeout(500);await pg.screenshot({path:process.argv[3]+'-mid.png'});await pg.mouse.click(...to);}
if(mode==='tdrag'){await touch('touchStart',[{x:from[0],y:from[1]}]);for(let i=1;i<=15;i++){await touch('touchMove',[{x:from[0]+(to[0]-from[0])*i/15,y:from[1]+(to[1]-from[1])*i/15}]);await pg.waitForTimeout(16);}await touch('touchEnd',[]);}
if(mode==='ttap'){await pg.touchscreen.tap(...from);await pg.waitForTimeout(500);await pg.touchscreen.tap(...to);}
await pg.waitForTimeout(1500);const t2=await txt();
console.log(mode,'24→'+n, t2.slice(t2.indexOf('Moves'),t2.indexOf('Undo'))!==t.slice(t.indexOf('Moves'),t.indexOf('Undo'))?'MOVED':'NOT MOVED');
await pg.screenshot({path:process.argv[3]+'-after.png'});
// confirm path: finish the turn through the move list, confirm, wait for bot
if(process.argv[4]==='full'){for(let i=0;i<4;i++){const btn=pg.locator('[data-testid^="move-list-"]:not([data-testid="move-list-hint"]):not([data-testid="move-list"])').first();if(await btn.isVisible().catch(()=>false)){await btn.click().catch(()=>{});await pg.waitForTimeout(700);}}
 await tid('confirm-button').click().catch(e=>console.log('confirm fail'));await pg.waitForTimeout(7000);console.log('after confirm:',(await txt()).slice(0,260));await pg.screenshot({path:process.argv[3]+'-bot.png'});}
console.log(errs.join('\n'));await b.close();})();
