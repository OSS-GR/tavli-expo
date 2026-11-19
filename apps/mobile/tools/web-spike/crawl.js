const {chromium}=require('playwright');
const routes=process.argv.slice(3);
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});const pg=await ctx.newPage();
let errs=[];pg.on('pageerror',e=>errs.push('PAGEERROR '+String(e).slice(0,260)));pg.on('console',m=>{if(m.type()==='error')errs.push('error '+m.text().slice(0,260))});
pg.on('request',r=>{const h=new URL(r.url()).host;if(!h.includes('localhost')&&!h.includes('127.0.0.1'))errs.push('REQ '+r.method()+' '+h+new URL(r.url()).pathname.slice(0,30))});
const tid=(t)=>pg.locator(`[data-testid="${t}"]`).first();
await pg.goto('http://localhost:8099/');await tid('welcome-language-continue').waitFor();await tid('welcome-language-continue').click();await pg.waitForTimeout(800);
await pg.getByText(process.env.ALLOW?'Allow usage data':"Don't allow",{exact:true}).first().click();await pg.waitForTimeout(1000);await tid('welcome-board-continue').click();await pg.waitForTimeout(2000);await tid('tour-not-now').click();await pg.waitForTimeout(1200);
console.log('welcome errs:',[...new Set(errs)].join(' ; '));
for(const r of routes){errs=[];await pg.goto('http://localhost:8099'+r);await pg.waitForTimeout(2600);
 const t=(await pg.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ').slice(0,110);
 console.log(r.padEnd(22),(t.includes('Something went wrong')?'CRASH ':'ok    '),t.slice(0,90),[...new Set(errs)].length?'\n     ↳ '+[...new Set(errs)].slice(0,3).join('\n     ↳ '):'');
 if(process.argv[2]!=='-')await pg.screenshot({path:process.argv[2]+r.replace(/\//g,'_')+'.png'});}
await b.close();})();
