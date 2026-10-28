<?php
declare(strict_types=1);
function auth_route(string $action,PDO $db,array $c):never {
 if($action==='register'){
  method('POST');$v=json_body(4096);$email=email_value($v['email']??null);$password=password_value($v['password']??null);
  rate_limit($db,$c,'register:'.($_SERVER['REMOTE_ADDR']??''),10,3600);
  if(query($db,'SELECT id FROM accounts WHERE email=?',[$email])->fetch())throw new ApiError(409,'email_unavailable','Этот адрес уже используется. Войди или восстанови пароль.');
  $verify=(bool)($c['require_email_verification']??false);if($verify&&!mail_enabled($c))throw new ApiError(503,'mail_unavailable','Регистрация ещё настраивается. Попробуй позже.');
  $a=['id'=>uuid(),'email'=>$email,'display_name'=>display_name($v['name']??null),'password_hash'=>password_digest($password),'role'=>'player','verified'=>!$verify,'created_at'=>time()];
  try{query($db,'INSERT INTO accounts(id,email,display_name,password_hash,role,verified,created_at) VALUES(?,?,?,?,?,?,?)',[$a['id'],$email,$a['display_name'],$a['password_hash'],'player',(int)$a['verified'],$a['created_at']]);}
  catch(PDOException $e){if($e->getCode()==='23000')throw new ApiError(409,'email_unavailable','Этот адрес уже используется. Войди или восстанови пароль.');throw $e;}
  if($verify){email_token($db,$c,$a,'verify');respond(['requiresVerification'=>true],201);}respond(session($db,$a),201);
 }
 if($action==='login'){
  method('POST');$v=json_body(4096);$email=email_value($v['email']??null);$password=is_string($v['password']??null)?$v['password']:'';
  if(strlen($password)>128)throw new ApiError(401,'invalid_credentials','Неверная почта или пароль.');
  $ip=$_SERVER['REMOTE_ADDR']??'';rate_limit($db,$c,'login-ip:'.$ip,100,900);rate_limit($db,$c,'login:'.$ip.':'.$email,10,900);
  $a=query($db,'SELECT * FROM accounts WHERE email=?',[$email])->fetch();
  // This is a public dummy bcrypt value, unrelated to any real account.
  $hash=$a['password_hash']??'$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
  if(!password_matches($password,$hash)||!$a)throw new ApiError(401,'invalid_credentials','Неверная почта или пароль.');
  if(($c['require_email_verification']??false)&&!$a['verified'])throw new ApiError(403,'email_unverified','Подтверди почту по ссылке из письма.');
  if(password_rehash($hash))query($db,'UPDATE accounts SET password_hash=? WHERE id=?',[password_digest($password),$a['id']]);
  respond(session($db,$a));
 }
 if($action==='me'){method('GET');respond(['user'=>public_account(current_account($db)),'mailEnabled'=>mail_enabled($c)]);}
 if($action==='logout'){method('POST');current_account($db);$token=substr($_SERVER['HTTP_AUTHORIZATION'],7);query($db,'DELETE FROM account_sessions WHERE token_hash=?',[hash('sha256',$token)]);respond(['ok'=>true]);}
 if($action==='profile'){
  method('POST');$a=current_account($db);$v=json_body(4096);$name=display_name($v['name']??null);query($db,'UPDATE accounts SET display_name=? WHERE id=?',[$name,$a['id']]);$a['display_name']=$name;respond(['user'=>public_account($a)]);
 }
 if($action==='password-change'){
  method('POST');$a=current_account($db);$v=json_body(4096);$old=is_string($v['currentPassword']??null)?$v['currentPassword']:'';$new=password_value($v['password']??null);rate_limit($db,$c,'change-password:'.$a['id'],10,900);
  if(strlen($old)>128||!password_matches($old,$a['password_hash']))throw new ApiError(401,'wrong_password','Текущий пароль указан неверно.');
  $db->beginTransaction();try{query($db,'UPDATE accounts SET password_hash=? WHERE id=?',[password_digest($new),$a['id']]);query($db,'DELETE FROM account_sessions WHERE account_id=?',[$a['id']]);$result=session($db,$a);$db->commit();respond($result);}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }
 if($action==='password-forgot'||$action==='verify-resend'){
  method('POST');$v=json_body(4096);$email=email_value($v['email']??null);rate_limit($db,$c,'email:'.($_SERVER['REMOTE_ADDR']??''),5,3600);if(!mail_enabled($c))throw new ApiError(503,'mail_unavailable','Отправка писем пока не подключена. Обратись к администратору.');
  $a=query($db,'SELECT * FROM accounts WHERE email=?',[$email])->fetch();if($a&&($action==='password-forgot'||!$a['verified']))email_token($db,$c,$a,$action==='password-forgot'?'reset':'verify');respond(['ok'=>true]);
 }
 if($action==='email-verify'||$action==='password-reset'){
  method('POST');$v=json_body(4096);$token=$v['token']??'';if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))throw new ApiError(400,'invalid_link','Ссылка недействительна или устарела.');
  $purpose=$action==='email-verify'?'verify':'reset';$new=$purpose==='reset'?password_value($v['password']??null):'';
  rate_limit($db,$c,'token:'.($_SERVER['REMOTE_ADDR']??''),30,900);$db->beginTransaction();try{
   $row=query($db,'SELECT * FROM account_email_tokens WHERE token_hash=? AND purpose=? AND expires_at>? FOR UPDATE',[hash('sha256',$token),$purpose,time()])->fetch();if(!$row)throw new ApiError(400,'invalid_link','Ссылка недействительна или устарела.');
   if($purpose==='verify')query($db,'UPDATE accounts SET verified=1 WHERE id=?',[$row['account_id']]);else{query($db,'UPDATE accounts SET password_hash=? WHERE id=?',[password_digest($new),$row['account_id']]);query($db,'DELETE FROM account_sessions WHERE account_id=?',[$row['account_id']]);}
   query($db,'DELETE FROM account_email_tokens WHERE account_id=? AND purpose=?',[$row['account_id'],$purpose]);$db->commit();respond(['ok'=>true]);
  }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }
 throw new ApiError(404,'not_found','Запрос не найден.');
}
