import{chromium,expect}from'@playwright/test';
import{readFileSync}from'node:fs';
const runtime=JSON.parse(readFileSync('/tmp/memestone-account-test/runtime.json','utf8')),origin=process.env.ACCOUNT_TEST_URL||'http://127.0.0.1:5180';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),context=await browser.newContext(),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));let dropAll=true;
await context.route('**/account-config.json',r=>r.fulfill({json:{apiUrl:runtime.url}}));
await context.route('**/api/index.php*',r=>{const headers={...r.request().headers()};delete headers.authorization;if(dropAll)delete headers['x-memestone-session'];return r.continue({headers});});
try{
 await page.goto(origin);await page.getByRole('button',{name:'Профиль',exact:true}).click();await page.getByRole('tab',{name:'Аккаунт',exact:true}).click();await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByLabel('Почта',{exact:true}).fill(runtime.adminEmail);await page.getByLabel('Пароль',{exact:true}).fill(runtime.adminPassword);await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page.locator('.account-form [role=alert]')).toContainText('хостинг не принимает сессию');expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('memestone.auth.v1.')))).toBe(false);
 dropAll=false;await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByRole('button',{name:'Профиль',exact:true}).waitFor();await page.getByRole('button',{name:'Профиль',exact:true}).click();await page.getByRole('tab',{name:'Аккаунт',exact:true}).click();await expect(page.locator('.account-sync')).toContainText('Прогресс сохранён в аккаунте.');
 await page.getByRole('button',{name:'Имя игрока',exact:true}).click();await page.getByLabel('Имя в игре',{exact:true}).fill('Администратор FastCGI');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByRole('tab',{name:'Аккаунт',exact:true}).click();await expect(page.locator('.account-identity h3')).toHaveText('Администратор FastCGI');
 await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('memestone.auth.v1.')))).toBe(false);
 expect(errors).toEqual([]);console.log('Fresh-login failure is explained without activating a broken session; alternative header restores login, sync, rename and logout when Authorization is stripped.');
}finally{await context.close();await browser.close();}
