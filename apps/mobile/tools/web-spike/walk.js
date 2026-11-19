// usage: node walk.js WxH outPrefix step1 step2 ... ; step = "click:Text" | "tid:testID" | "wait:ms" | "shot:name" | "goto:/path" | "text"
const {chromium}=require('playwright');
(async()=>{const [w,h]=process.argv[2].split('x').map(Number);const pre=process.argv[3];
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:process.env.TOUCH==='1'});const pg=await ctx.newPage();
const errs=[];pg.on('console',m=>{if(m.type()==='error'||(m.type()==='warning'&&!m.text().includes('expo-notifications')&&!m.text().includes('GPU stall')))errs.push(m.type()+': '+m.text().slice(0,300))});
pg.on('pageerror',e=>errs.push('PAGEERROR: '+String(e.stack||e).slice(0,700)));
await pg.goto('http://localhost:8099/',{waitUntil:'load'});await pg.waitForTimeout(4000);
for(const s of process.argv.slice(4)){const i=s.indexOf(':');const k=i<0?s:s.slice(0,i),v=i<0?'':s.slice(i+1);
 try{
 if(k==='click')await pg.getByText(v,{exact:true}).first().click({timeout:5000});
 else if(k==='tid')await pg.locator(`[data-testid="${v}"]`).first().click({timeout:5000});
 else if(k==='wait')await pg.waitForTimeout(+v);
 else if(k==='shot')await pg.screenshot({path:`${pre}-${v}.png`});
 else if(k==='goto'){await pg.goto('http://localhost:8099'+v);await pg.waitForTimeout(3000);}
 else if(k==='text')console.log('TEXT:',(await pg.evaluate(()=>document.body.innerText)).slice(0,+v||700).replace(/\n+/g,' | '));
 else if(k==='drag'){const [a,b2,c,d]=v.split(',').map(Number);await pg.mouse.move(a,b2);await pg.mouse.down();for(let i=1;i<=12;i++){await pg.mouse.move(a+(c-a)*i/12,b2+(d-b2)*i/12);await pg.waitForTimeout(16);}await pg.mouse.up();}
 else if(k==='tap'){const [a,b2]=v.split(',').map(Number);if(process.env.TOUCH==='1')await pg.touchscreen.tap(a,b2);else await pg.mouse.click(a,b2);}
 else if(k==='tdrag'){const [a,b2,c,d]=v.split(',').map(Number);const cdp=await ctx.newCDPSession(pg);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a,y:b2}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a+(c-a)*i/12,y:b2+(d-b2)*i/12}]});await pg.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else if(k==='tids')console.log('TIDS:',(await pg.evaluate(()=>[...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid')))).join(' '));
 else if(k==='eval')console.log('EVAL:',JSON.stringify(await pg.evaluate(v)));
 }catch(e){console.log('STEP FAIL',s,String(e).slice(0,200));}
 await pg.waitForTimeout(600);}
console.log([...new Set(errs)].slice(0,15).join('\n'));await b.close();})();
