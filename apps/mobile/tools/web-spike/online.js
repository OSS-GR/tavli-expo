const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});const pg=await ctx.newPage();
let log=[];pg.on('pageerror',e=>log.push('PAGEERROR '+String(e).slice(0,260)));pg.on('console',m=>{if(m.type()==='error')log.push('error '+m.text().slice(0,260))});
pg.on('response',async r=>{const u=r.url();if(u.includes(':3211'))log.push(r.request().method()+' '+new URL(u).pathname+' → '+r.status())});
const tid=(t)=>pg.locator(`[data-testid="${t}"]`).first();const txt=async(n=260)=>(await pg.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ').slice(0,n);
await pg.goto('http://localhost:8099/');await tid('welcome-language-continue').waitFor();await tid('welcome-language-continue').click();await pg.waitForTimeout(800);
await pg.getByText("Don't allow",{exact:true}).first().click();await pg.waitForTimeout(1000);await tid('welcome-board-continue').click();await pg.waitForTimeout(2000);await tid('tour-not-now').click();await pg.waitForTimeout(1200);
await tid('home-friend').click();await pg.waitForTimeout(1500);
for(const step of process.argv.slice(3)){try{if(step.startsWith('tid:'))await tid(step.slice(4)).click({timeout:4000});else if(step==='tids')console.log('TIDS',(await pg.evaluate(()=>[...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid')))).filter(x=>!x.startsWith('home-')).join(' ').slice(0,900));else if(step==='reload'){await pg.reload();}else await pg.getByText(step,{exact:true}).first().click({timeout:4000});}catch(e){console.log('FAIL',step)}
 await pg.waitForTimeout(2500);console.log('> after',step,':',await txt());}
await pg.screenshot({path:process.argv[2]});console.log([...new Set(log)].join('\n'));
console.log('LS',await pg.evaluate(()=>Object.keys(localStorage).filter(k=>!k.startsWith('tavlaki\\'))));
await b.close();})();
