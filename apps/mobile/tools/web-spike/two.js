const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
const mk=async(name)=>{const ctx=await b.newContext({viewport:{width:390,height:844}});const pg=await ctx.newPage();const log=[];
 pg.on('pageerror',e=>log.push(name+' PAGEERROR '+String(e).slice(0,200)));pg.on('console',m=>{if(m.type()==='error')log.push(name+' error '+m.text().slice(0,200))});
 const tid=(t)=>pg.locator(`[data-testid="${t}"]`).first();const txt=async(n=200)=>(await pg.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ').slice(0,n);
 const tids=async()=>(await pg.evaluate(()=>[...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid'))));
 const welcome=async(path='/')=>{await pg.goto('http://localhost:8099'+path);await tid('welcome-language-continue').waitFor();await tid('welcome-language-continue').click();await pg.waitForTimeout(800);
  await pg.getByText("Don't allow",{exact:true}).first().click();await pg.waitForTimeout(1000);await tid('welcome-board-continue').click();await pg.waitForTimeout(2500);};
 return {pg,tid,txt,tids,welcome,log,name};};
const A=await mk('A'),B=await mk('B');
await A.welcome();await A.tid('tour-not-now').click();await A.pg.waitForTimeout(1000);await A.tid('home-friend').click();await A.pg.waitForTimeout(1200);
await A.tid('friend-make').click();await A.pg.waitForTimeout(1500);await A.pg.getByText('Continue as a guest',{exact:true}).first().click();await A.pg.waitForTimeout(3500);
const code=(await A.tid('invite-wait-code').innerText()).replace(/\s+/g,'');console.log('code',code,'url',A.pg.url());
await B.welcome('/invite/'+code);await B.pg.waitForTimeout(2500);console.log('B:',await B.txt(),'\nB tids',(await B.tids()).filter(x=>!x.startsWith('welcome')&&!x.startsWith('home-')).join(' ').slice(0,400));
for(const s of process.argv.slice(3)){const [who,what]=[s[0],s.slice(2)];const P=who==='A'?A:B;
 try{if(what.startsWith('tid:'))await P.tid(what.slice(4)).click({timeout:4000});else if(what==='move')await P.pg.locator('[data-testid^="move-list-"]').nth(1).click({timeout:4000});else if(what==='tids')console.log(who,'tids',(await P.tids()).filter(x=>!x.startsWith('welcome')&&!x.startsWith('home-')).join(' ').slice(0,500));else if(what.startsWith('wait:'))await P.pg.waitForTimeout(+what.slice(5));else await P.pg.getByText(what,{exact:true}).first().click({timeout:4000});}catch(e){console.log('FAIL',s)}
 await P.pg.waitForTimeout(2500);console.log('> '+s+' | A:',await A.txt(150),'\n      B:',await B.txt(150));}
await A.pg.screenshot({path:process.argv[2]+'-A.png'});await B.pg.screenshot({path:process.argv[2]+'-B.png'});
console.log([...new Set([...A.log,...B.log])].join('\n'));await b.close();})();
