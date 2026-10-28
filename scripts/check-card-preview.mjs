import {chromium,expect} from '@playwright/test';

const origin=process.env.MEDIA_TEST_URL||'http://127.0.0.1:5180';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
const play=page=>page.getByRole('button',{name:/^(Предпросмотр|Ещё раз)$/}).click();
async function visibleEntrance(page,variant){
 const visual=page.locator(`.play-preview-scene [data-entrance="${variant}"]`);
 await expect(visual).toBeAttached();
 const result=await visual.evaluate(el=>{
  const animations=el.getAnimations({subtree:true});
  // Inspect an actual rendered frame, rather than merely finding an SVG in the DOM.
  for(const animation of animations){animation.pause();animation.currentTime=600;}
  const svg=el.querySelector('.entrance-artwork'),css=getComputedStyle(svg),r=svg.getBoundingClientRect(),scene=el.closest('.play-preview-scene').getBoundingClientRect();
  return {animations:animations.length,display:css.display,opacity:Number(css.opacity),width:r.width,height:r.height,inside:r.right>scene.left&&r.left<scene.right&&r.bottom>scene.top&&r.top<scene.bottom};
 });
 expect(result.animations).toBeGreaterThan(3);expect(result.display).not.toBe('none');expect(result.opacity).toBeGreaterThan(.5);expect(result.width).toBeGreaterThan(40);expect(result.height).toBeGreaterThan(40);expect(result.inside).toBe(true);
}

try{
 for(const [reducedMotion,motion] of [['no-preference',true],['no-preference',false],['reduce',true],['reduce',false]]){
  const context=await browser.newContext({viewport:{width:1280,height:768},reducedMotion}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(motion=>localStorage.setItem('memestone.v1.settings',JSON.stringify({motion})),motion);
  await page.goto(origin);await page.getByRole('button',{name:'Редактор карт',exact:true}).click();await page.getByRole('button',{name:'Создать карту',exact:true}).click();
  await page.getByRole('tab',{name:'Ключевые слова',exact:true}).click();
  for(const keyword of ['Провокация','Божественный щит','Перерождение','Похищение жизни','Неистовство ветра','Яд','Неуязвимость в свой ход'])await page.getByLabel(keyword,{exact:true}).check();
  await page.getByRole('tab',{name:'Правила',exact:true}).click();await page.getByRole('button',{name:'Добавить первое правило',exact:true}).click();await page.getByLabel('Когда срабатывает',{exact:true}).selectOption('aura');
  await page.getByRole('button',{name:'Правило',exact:true}).click();await page.getByLabel('Когда срабатывает',{exact:true}).selectOption('death');
  await page.getByRole('tab',{name:'Розыгрыш',exact:true}).click();
  const variants=reducedMotion==='reduce'&&!motion?await page.getByLabel('Анимация розыгрыша',{exact:true}).locator('option').evaluateAll(items=>items.map(x=>x.value).filter(Boolean)):['celestial'];
  for(const variant of variants){await page.getByLabel('Анимация розыгрыша',{exact:true}).selectOption(variant);await play(page);await visibleEntrance(page,variant);}
  await expect(page.locator('.preview-landed')).toBeVisible();
  for(const selector of ['.unit-taunt-frame','.unit-divine-bubble','.unit-aura-fire','.unit-reborn-halo','.unit-lifesteal-wings','.unit-wind-veil','.unit-immunity-shell','.poison-badge','.deathrattle-badge'])await expect(page.locator('.preview-landed '+selector)).toBeVisible();
  expect(await page.locator('.unit-aura-fire').evaluate(el=>getComputedStyle(el).boxShadow)).not.toBe('none');
  await page.getByRole('button',{name:'Предсмертный хрип',exact:true}).click();
  const skull=page.locator('.play-preview-scene [data-fx="deathrattle"]');await expect(skull).toBeVisible();
  expect(await skull.evaluate(el=>getComputedStyle(el).animationName)).toBe('deathrattle-rise');
  await page.getByRole('button',{name:'Остановить предпросмотр',exact:true}).click();await expect(page.locator('.play-preview-scene [data-fx]')).toHaveCount(0);
  if(reducedMotion==='reduce'&&!motion){
   for(const viewport of [{width:1280,height:768},{width:390,height:844},{width:844,height:390},{width:320,height:568},{width:667,height:375}]){
    await page.setViewportSize(viewport);await page.getByLabel('Анимация розыгрыша',{exact:true}).selectOption('celestial');await play(page);await visibleEntrance(page,'celestial');await page.screenshot({path:`/tmp/card-preview-${viewport.width}.png`});
    await expect(page.locator('.preview-landed')).toBeVisible();await expect(page.locator('.preview-landed .unit-aura-fire')).toBeVisible();
    const overflow=await page.locator('.card-editor').evaluate(el=>[...el.querySelectorAll('.play-media-controls button,.play-media-controls select,.play-preview-death,.play-preview-scene,.editor-save button')].filter(e=>{const b=e.getBoundingClientRect();return b.left<-.5||b.right>innerWidth+.5||b.top<-.5||b.bottom>innerHeight+.5;}).map(e=>e.textContent));expect(overflow).toEqual([]);
    if(viewport.width===1280)await page.screenshot({path:'/tmp/card-preview-keywords.png'});
   }
   await page.setViewportSize({width:1280,height:768});
   // Native powers use their original effects, including when general motion is off.
   for(const [id,fx]of [['spark-power','arcane-arrow'],['armor-power','warrior-hammer'],['storm-power','storm-vortex'],['claw-fury','cat-venom']]){
    await page.getByRole('button',{name:'Мои карты',exact:true}).click();
    const select=page.getByLabel('Карта за основу',{exact:true});
    await select.selectOption(id);await page.getByRole('tab',{name:'Розыгрыш',exact:true}).click();await play(page);
    const effect=page.locator(`.play-preview-scene [data-fx="${fx}"]`);await expect(effect).toBeAttached();
    const rendered=await effect.evaluate(el=>{const animations=el.getAnimations({subtree:true});for(const animation of animations){animation.pause();animation.currentTime=350;}const svg=el.querySelector('svg'),r=svg.getBoundingClientRect();return {animations:animations.length,display:getComputedStyle(el.closest('.combat-effects')).display,visible:svg.checkVisibility({opacityProperty:true,visibilityProperty:true}),width:r.width,height:r.height};});
    expect(rendered.animations).toBeGreaterThan(0);expect(rendered.display).not.toBe('none');expect(rendered.visible).toBe(true);expect(rendered.width).toBeGreaterThan(20);expect(rendered.height).toBeGreaterThan(20);
   }
  }
  expect(await page.evaluate(()=>localStorage.getItem('memestone.v1.game'))).toBeNull();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('memestone.v1.settings')).motion)).toBe(motion);
  // The exception is scoped to an explicitly played preview, not to battle effects.
  const still=await page.evaluate(()=>{const host=document.createElement('div');host.className='card-play-effects';host.innerHTML='<div class="cast-light"></div>';document.body.append(host);const name=getComputedStyle(host.firstElementChild).animationName;host.remove();return name;});
  if(!motion||reducedMotion==='reduce')expect(still).toBe('none');
  await context.close();
 }
 expect(errors).toEqual([]);console.log('Card preview passed: rendered frames for all 12 entrances, both motion settings and OS preference, table enchantments/aura/skull, original powers, five sizes and isolated preview.');
}finally{await browser.close();}
