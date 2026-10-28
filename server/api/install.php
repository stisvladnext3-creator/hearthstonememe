<?php
declare(strict_types=1);
require __DIR__.'/lib/core.php';
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');
$setupFile=__DIR__.'/setup-key.php';
if(is_file(config_path())||!is_file($setupFile)){http_response_code(404);exit;}
$setup=require $setupFile;
if(!is_array($setup)||strlen((string)($setup['token']??''))<32){http_response_code(404);exit;}
if($_SERVER['REQUEST_METHOD']==='POST'){
 try{
  $v=json_body(16384);$token=$v['setupKey']??'';if(!is_string($token)||!hash_equals($setup['token'],$token))throw new ApiError(403,'setup_forbidden','Неверный ключ установки.');
  $development=getenv('MEMESTONE_ALLOW_LOCAL_SETUP')==='1';
  if(!$development&&!in_array(strtolower((string)($_SERVER['HTTPS']??'')),['on','1'],true)&&(int)($_SERVER['SERVER_PORT']??0)!==443)throw new ApiError(400,'https_required','Сначала включи HTTPS у хостинга.');
  $frontend=trim((string)($v['frontendUrl']??''));$url=parse_url($frontend);
  if(!$url||!isset($url['host'])||!in_array($url['scheme']??'', $development?['http','https']:['https'],true)||isset($url['user'])||isset($url['pass'])||isset($url['query'])||isset($url['fragment']))throw new ApiError(400,'invalid_site','Укажи полный HTTPS-адрес сайта.');
  $origin=$url['scheme'].'://'.$url['host'].(isset($url['port'])?':'.$url['port']:'');
  $host=(string)($_SERVER['HTTP_HOST']??'');$ownOrigin=preg_match('/^[a-zA-Z0-9.\-]+(?::[0-9]+)?$/D',$host)?($development?'http':'https').'://'.$host:$origin;
  foreach(['dbHost','dbName','dbUser']as $key)if(!is_string($v[$key]??null)||trim($v[$key])===''||strlen($v[$key])>128||preg_match('/[;\x00-\x1F]/',$v[$key]))throw new ApiError(400,'invalid_database','Проверь параметры базы данных.');
  $email=email_value($setup['admin_email']??$v['adminEmail']??null);$hash=$setup['admin_hash']??null;$password='';
  if(!is_string($hash)||!preg_match('/^(\$argon2id\$|\$2y\$|ms-sha256:\$2y\$)/',$hash)){$password=password_value($v['adminPassword']??null);$hash=password_digest($password);}
  $config=['db_host'=>trim($v['dbHost']),'db_port'=>max(1,min(65535,(int)($v['dbPort']??3306))),'db_name'=>trim($v['dbName']),'db_user'=>trim($v['dbUser']),'db_password'=>is_string($v['dbPassword']??null)?$v['dbPassword']:'','allowed_origins'=>array_values(array_unique([$origin,$ownOrigin,'https://stisvladnext3-creator.github.io'])),'frontend_url'=>rtrim($frontend,'/').'/','secret'=>bin2hex(random_bytes(32)),'storage_dir'=>dirname(config_path()).'/files','environment'=>$development?'development':'production','require_email_verification'=>false,'mail_mode'=>'none','mail_from'=>''];
  $pdo=db($config);$schema=file_get_contents(__DIR__.'/schema.sql');foreach(explode(';',$schema)as $sql)if(trim($sql)!=='')$pdo->exec($sql);
  $existing=query($pdo,'SELECT * FROM accounts WHERE email=?',[$email])->fetch();
  if($existing){if($existing['role']!=='admin'||!hash_equals($hash,$existing['password_hash'])&&($password===''||!password_matches($password,$existing['password_hash'])))throw new ApiError(409,'account_exists','В базе уже есть аккаунт с этой почтой. Используй новую базу или проверь прежнюю установку.');}
  else query($pdo,'INSERT INTO accounts(id,email,display_name,password_hash,role,verified,created_at) VALUES(?,?,?,?,?,?,?)',[uuid(),$email,'Администратор',$hash,'admin',1,time()]);
  $dir=dirname(config_path());if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new RuntimeException('Private directory unavailable');
  $temp=tempnam($dir,'config-');try{if(file_put_contents($temp,"<?php\nreturn ".var_export($config,true).";\n",LOCK_EX)===false)throw new RuntimeException('Private config unavailable');chmod($temp,0600);if(!rename($temp,config_path()))throw new RuntimeException('Private config unavailable');}finally{if(is_file($temp))unlink($temp);}
  @unlink($setupFile);respond(['ok'=>true,'message'=>'База подключена. Администратор создан. Страница установки закрыта.']);
 }catch(ApiError $e){respond(['error'=>['code'=>$e->apiCode,'message'=>$e->getMessage()]],$e->status);}
 catch(Throwable $e){error_log('Memestone installation failure: '.get_class($e));respond(['error'=>['code'=>'installation_failed','message'=>'Не удалось подключить базу или сохранить настройки. Проверь параметры и права папки сайта.']],500);}
}
$adminEmail=htmlspecialchars((string)($setup['admin_email']??''),ENT_QUOTES,'UTF-8');$dbNameHint=htmlspecialchars((string)($setup['db_name_hint']??''),ENT_QUOTES,'UTF-8');$seeded=isset($setup['admin_hash']);
?>
<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Установка Memestone</title>
<style>body{margin:0;background:#24170f;color:#392a1a;font:16px/1.5 system-ui,sans-serif}main{max-width:640px;margin:24px auto;padding:24px;background:#ebd6a8;border:6px ridge #af8449;border-radius:8px}h1{margin:0 0 12px}label{display:block;margin:12px 0}input{display:block;box-sizing:border-box;width:100%;padding:10px;border:2px solid #967348;border-radius:4px;background:#fff2d2;font:inherit}button{width:100%;padding:12px;background:linear-gradient(#f5dfa3,#c9a367);color:#342516;border:3px ridge #d4ae68;border-radius:5px;font:700 17px system-ui;cursor:pointer}button:disabled{opacity:.6}#status{white-space:pre-wrap}small{display:block}@media(max-width:700px){main{margin:8px;padding:16px}}</style>
<main><h1>Установка Memestone</h1><p>Введи параметры созданной базы MySQL из панели хостинга. Они останутся на сервере вне папки сайта.</p><form id="setup">
<label>Ключ установки<input name="setupKey" type="password" required autocomplete="off"></label><label>Адрес сайта<input name="frontendUrl" type="url" required placeholder="https://example.ru/"></label>
<label>Сервер базы<input name="dbHost" required value="localhost"></label><label>Порт базы<input name="dbPort" type="number" required value="3306" min="1" max="65535"></label><label>Название базы<input name="dbName" required autocomplete="off" value="<?=$dbNameHint?>"></label><label>Пользователь базы<input name="dbUser" required autocomplete="off"></label><label>Пароль базы<input name="dbPassword" type="password" autocomplete="new-password"></label>
<?php if($seeded):?><p>Тестовый администратор: <strong><?=$adminEmail?></strong>. Пароль уже подготовлен в закрытом пакете установки.</p><?php else:?><label>Почта администратора<input name="adminEmail" type="email" required value="<?=$adminEmail?>"></label><label>Пароль администратора<input name="adminPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><?php endif;?>
<button type="submit">Подключить базу и создать администратора</button></form><p id="status" role="status"></p><small>После успешной установки повторный запуск будет закрыт.</small></main>
<script>const form=document.getElementById('setup'),status=document.getElementById('status');form.frontendUrl.value=location.origin+location.pathname.replace(/api\/install\.php$/,'');form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Подключаем базу…';try{const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))}),data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Не удалось завершить установку.');status.textContent=data.message;form.hidden=true;}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});</script></html>
