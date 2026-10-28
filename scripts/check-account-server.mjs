import { execFileSync } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { randomBytes,createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];env.BUILDX_CONFIG='/tmp/memestone-buildx';
const dir='/tmp/memestone-account-test',api='memestone-account-api',db='memestone-account-db',net='memestone-account-net',url='http://127.0.0.1:8081/api/index.php';
mkdirSync(dir,{recursive:true,mode:0o700});
const docker=(...args)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:20*1024*1024});
const cleanup=()=>{for(const name of [api,db])try{docker('rm','-f',name);}catch{}try{docker('network','rm',net);}catch{}};
const password=randomBytes(24).toString('hex'),adminPassword=randomBytes(20).toString('hex'),setupKey=randomBytes(32).toString('hex');
let checks=0;
async function request(action,{token,method='GET',body,status=200,headers={},query={}}={}){
 const endpoint=new URL(url);endpoint.searchParams.set('action',action);for(const[k,v]of Object.entries(query))endpoint.searchParams.set(k,v);
 const response=await fetch(endpoint,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>null);assert.equal(response.status,status,`${action}: expected ${status}, got ${response.status}; code=${data?.error?.code}`);checks++;return {data,response};
}
try{
 cleanup();console.log('Building PHP account API and starting isolated database…');
 writeFileSync(dir+'/build.log',docker('build','-q','-t','memestone-accounts-test','server'));
 docker('network','create',net);
 writeFileSync(dir+'/database.env',`MARIADB_ROOT_PASSWORD=${randomBytes(24).toString('hex')}\nMARIADB_DATABASE=memestone\nMARIADB_USER=memestone\nMARIADB_PASSWORD=${password}\n`,{mode:0o600});
 docker('run','-d','--name',db,'--network',net,'--env-file',dir+'/database.env','--health-cmd','healthcheck.sh --connect --innodb_initialized','--health-interval','1s','--health-timeout','2s','--health-retries','60','mariadb:10.11');
 let healthy=false;for(let i=0;i<120;i++){if(docker('inspect','--format','{{.State.Health.Status}}',db).trim()==='healthy'){healthy=true;break;}await new Promise(r=>setTimeout(r,500));}assert.ok(healthy,'Database did not start');
 docker('run','-d','--name',api,'--network',net,'-p','127.0.0.1:8081:80','-e','MEMESTONE_CONFIG=/var/lib/memestone/config.php','-e','MEMESTONE_ALLOW_LOCAL_SETUP=1','memestone-accounts-test');
 const adminHash=docker('exec',api,'php','-r',`require '/var/www/html/api/lib/core.php';echo password_digest('${adminPassword}');`).trim();
 writeFileSync(dir+'/setup-key.php',`<?php return ['token'=>'${setupKey}','admin_email'=>'admin@example.test','admin_hash'=>'${adminHash}','db_name_hint'=>'memestone'];\n`,{mode:0o600});docker('cp',dir+'/setup-key.php',api+':/var/www/html/api/setup-key.php');docker('exec',api,'chmod','644','/var/www/html/api/setup-key.php');
 for(let i=0;i<50;i++){try{await fetch(url);break;}catch{await new Promise(r=>setTimeout(r,200));}}
 const installBody={setupKey,frontendUrl:'http://127.0.0.1:5176/',dbHost:db,dbName:'memestone',dbUser:'memestone',dbPassword:password};
 let r=await fetch(url.replace('index.php','install.php'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...installBody,setupKey:'incorrect'})});assert.equal(r.status,403);checks++;
 r=await fetch(url.replace('index.php','install.php'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(installBody)});assert.equal(r.status,200,JSON.stringify(await r.json()));checks++;
 assert.equal((await fetch(url.replace('index.php','install.php'))).status,404);checks++;
 docker('exec',api,'php','-r',"$p='/var/lib/memestone/config.php';$c=require $p;$c['allowed_origins'][]='http://127.0.0.1:4174';file_put_contents($p,'<?php return '.var_export($c,true).';');");
 await request('health');await request('health',{headers:{Origin:'https://evil.example'},status:403});
 const cors=await request('health',{headers:{Origin:'http://127.0.0.1:5176'}});assert.equal(cors.response.headers.get('access-control-allow-origin'),'http://127.0.0.1:5176');checks++;
 await request('me',{status:401});
 const a=(await request('register',{method:'POST',body:{email:'a@example.test',password,name:'Игрок А',role:'admin',capabilities:{unlimitedResources:true}},status:201})).data;
 const b=(await request('register',{method:'POST',body:{email:'b@example.test',password,name:'Игрок Б'},status:201})).data;
 assert.equal(a.user.role,'player');assert.equal(a.user.capabilities.unlimitedResources,false);checks++;
 await request('register',{method:'POST',body:{email:'A@example.test',password},status:409});
 await request('login',{method:'POST',body:{email:a.user.email,password:'incorrect'},status:401});
 const a2=(await request('login',{method:'POST',body:{email:'A@example.test',password}})).data;
 const admin=(await request('login',{method:'POST',body:{email:'admin@example.test',password:adminPassword}})).data;assert.equal(admin.user.role,'admin');assert.equal(admin.user.capabilities.unlimitedResources,true);checks++;
 const profile=(await request('profile',{token:a.token,method:'POST',body:{name:'Новое имя',role:'admin'}})).data;assert.equal(profile.user.name,'Новое имя');assert.equal(profile.user.role,'player');checks++;
 const deck={id:'test-deck',name:'Синергия',heroClass:'mage',cards:['regular','regular'],order:0},metrics={cardsPlayed:4,heroDamage:8,minionDamage:3,manaSpent:10};
 await request('state',{token:a.token,method:'PUT',body:{expectedRevision:0,changes:{'deck:test-deck':deck,'selected:deck':'test-deck','stat:match-one':{...metrics,finished:true,won:true},'legacy:old':{cardsPlayed:0,heroDamage:0,minionDamage:0,manaSpent:0,wins:2,games:0}}}});
 const shared=(await request('state',{token:a2.token})).data;assert.deepEqual(shared.records['deck:test-deck'],deck);assert.equal(shared.revision,1);checks++;
 assert.deepEqual((await request('state',{token:b.token})).data.records,{});checks++;
 await request('state',{token:a.token,method:'PUT',body:{expectedRevision:0,changes:{'deck:test-deck':null}},status:409});
 await request('state',{token:a.token,method:'PUT',body:{expectedRevision:1,changes:{'role:admin':true}},status:400});
 const canonical=(await request('state',{token:a.token,method:'PUT',body:{expectedRevision:1,changes:{'stat:match-one':{cardsPlayed:1,heroDamage:0,minionDamage:0,manaSpent:0,finished:false,won:false}}}})).data;assert.deepEqual(canonical.applied['stat:match-one'],{...metrics,finished:true,won:true});checks++;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6OQAAAABJRU5ErkJggg==','base64'),hash=createHash('sha256').update(png).digest('hex');
 const imageUrl=new URL(url);imageUrl.searchParams.set('action','art');imageUrl.searchParams.set('hash',hash);
 r=await fetch(imageUrl,{method:'PUT',headers:{Authorization:'Bearer '+a.token,'Content-Type':'image/png'},body:png});assert.equal(r.status,200);checks++;
 await request('art',{token:b.token,query:{hash},status:404});
 await request('state',{token:b.token,method:'PUT',body:{expectedRevision:0,changes:{'art:test':{hash,format:'portrait',mime:'image/png',size:png.length}}},status:409});
 await request('state',{token:a.token,method:'PUT',body:{expectedRevision:2,changes:{'art:test':{hash,format:'portrait',mime:'image/png',size:png.length},'deck:test-deck':null}}});
 r=await fetch(imageUrl,{headers:{Authorization:'Bearer '+a2.token}});assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);checks++;
 const history={id:'match-one',endedAt:Date.now(),turns:4,outcome:'win',opponent:'Борис',playerHero:'mage',opponentHero:'cat',mode:'training',metrics,log:[{id:1,text:'Победа!',side:'system',kind:'finish'}],cards:[]};
 await request('history',{token:a.token,method:'POST',body:history});await request('history',{token:a.token,method:'POST',body:{...history,outcome:'loss'}});
 assert.equal((await request('history',{token:a2.token})).data.total,1);assert.equal((await request('history',{token:a2.token,query:{id:'match-one'}})).data.outcome,'win');checks++;
 await request('history',{token:b.token,query:{id:'match-one'},status:404});assert.equal((await request('history',{token:b.token})).data.total,0);checks++;
 await request('logout',{token:b.token,method:'POST',body:{}});await request('me',{token:b.token,status:401});
 const changed=(await request('password-change',{token:a.token,method:'POST',body:{currentPassword:password,password:password+'new'}})).data;await request('me',{token:a.token,status:401});await request('me',{token:a2.token,status:401});await request('me',{token:changed.token});
 await request('login',{method:'POST',body:{email:a.user.email,password},status:401});await request('login',{method:'POST',body:{email:a.user.email,password:password+'new'}});
 await request('password-forgot',{method:'POST',body:{email:a.user.email},status:503});
 const resetToken=randomBytes(32).toString('hex'),verifyToken=randomBytes(32).toString('hex');
 docker('exec',api,'php','-r',`require '/var/www/html/api/lib/core.php';$d=db(configuration());query($d,'INSERT INTO account_email_tokens(token_hash,account_id,purpose,expires_at) VALUES(?,?,?,?)',['${createHash('sha256').update(resetToken).digest('hex')}','${a.user.id}','reset',time()+1800]);query($d,'INSERT INTO account_email_tokens(token_hash,account_id,purpose,expires_at) VALUES(?,?,?,?)',['${createHash('sha256').update(verifyToken).digest('hex')}','${a.user.id}','verify',time()+1800]);`);
 await request('email-verify',{method:'POST',body:{token:verifyToken}});await request('email-verify',{method:'POST',body:{token:verifyToken},status:400});
 await request('password-reset',{method:'POST',body:{token:resetToken,password:password+'reset'}});await request('password-reset',{method:'POST',body:{token:resetToken,password:password+'again'},status:400});await request('me',{token:changed.token,status:401});
 await request('login',{method:'POST',body:{email:a.user.email,password:password+'reset'}});
 assert.equal(docker('exec',api,'php','-r',"require '/var/www/html/api/lib/core.php';$p=str_repeat('a',73).'b';$h='ms-sha256:'.password_hash(base64_encode(hash('sha256',$p,true)),PASSWORD_BCRYPT);echo password_matches($p,$h)&&!password_matches(str_repeat('a',73).'c',$h)?'ok':'failed';").trim(),'ok');checks++;
 for(const path of ['schema.sql','lib/core.php']){r=await fetch(url.replace('index.php',path));assert.equal(r.status,403,path);checks++;}
 const persisted=docker('exec',api,'php','-r',"require '/var/www/html/api/lib/core.php';$d=db(configuration());echo json_encode(['password'=>query($d,'SELECT password_hash FROM accounts WHERE email=?',['a@example.test'])->fetchColumn(),'tokens'=>query($d,'SELECT token_hash FROM account_sessions')->fetchAll(PDO::FETCH_COLUMN)]);");const stored=JSON.parse(persisted);assert.ok(!stored.password.includes(password));assert.ok(stored.tokens.every(t=>t.length===64&&t!==changed.token&&t!==admin.token));checks++;
 // Keep only dummy test credentials locally for the browser integration check.
 writeFileSync(dir+'/runtime.json',JSON.stringify({url,adminEmail:'admin@example.test',adminPassword,password}),{mode:0o600});
 console.log(`Account API: ${checks} checks passed (auth, role protection, isolation, CAS, artwork, history, session revocation).`);
}catch(error){try{writeFileSync(dir+'/api.log',docker('logs',api));}catch{}throw error;}
finally{if(process.env.KEEP_ACCOUNT_SERVER!=='1')cleanup();}
