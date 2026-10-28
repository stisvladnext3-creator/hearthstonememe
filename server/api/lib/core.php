<?php
declare(strict_types=1);
function config_path(): string {
 if($path=getenv('MEMESTONE_CONFIG'))return $path;
 $root=realpath($_SERVER['DOCUMENT_ROOT']??'')?:dirname(__DIR__,2);
 return dirname($root).'/.memestone-'.substr(hash('sha256',dirname(__DIR__)),0,12).'/config.php';
}
function configuration(): array {
 $path=config_path();if(!is_file($path))throw new ApiError(503,'not_configured','Аккаунты ещё настраиваются.');
 $c=require $path;if(!is_array($c)||strlen((string)($c['secret']??''))<32)throw new ApiError(503,'not_configured','Аккаунты ещё настраиваются.');return $c;
}
final class ApiError extends RuntimeException {public function __construct(public int $status,public string $apiCode,string $message){parent::__construct($message);}}
function respond(array $value,int $status=200): never {http_response_code($status);header('Content-Type: application/json; charset=utf-8');echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;}
function safe_headers(array $c): void {
 header('Cache-Control: no-store, private');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');
 $origin=$_SERVER['HTTP_ORIGIN']??'';
 if($origin!==''){
  if(!in_array($origin,$c['allowed_origins']??[],true))throw new ApiError(403,'origin_forbidden','Этот сайт не подключён к аккаунтам.');
  header('Access-Control-Allow-Origin: '.$origin);header('Vary: Origin');
 }
 header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');header('Access-Control-Allow-Headers: Authorization, Content-Type');header('Access-Control-Max-Age: 600');
 if($_SERVER['REQUEST_METHOD']==='OPTIONS'){http_response_code(204);exit;}
 if(($c['environment']??'production')!=='development'&&!in_array(strtolower((string)($_SERVER['HTTPS']??'')),['on','1'],true)&&(int)($_SERVER['SERVER_PORT']??0)!==443)throw new ApiError(400,'https_required','Для аккаунтов требуется защищённое соединение HTTPS.');
}
function db(array $c): PDO {
 $pdo=new PDO('mysql:host='.$c['db_host'].';port='.(int)($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);return $pdo;
}
function query(PDO $db,string $sql,array $args=[]):PDOStatement{$s=$db->prepare($sql);$s->execute($args);return $s;}
function json_body(int $limit=12582912):array{
 if(!str_starts_with(strtolower($_SERVER['CONTENT_TYPE']??''),'application/json'))throw new ApiError(415,'json_required','Не удалось прочитать запрос.');
 if((int)($_SERVER['CONTENT_LENGTH']??0)>$limit)throw new ApiError(413,'too_large','Слишком большой объём данных.');
 $raw=file_get_contents('php://input',false,null,0,$limit+1);if($raw===false||strlen($raw)>$limit)throw new ApiError(413,'too_large','Слишком большой объём данных.');
 try{$v=json_decode($raw,true,64,JSON_THROW_ON_ERROR);}catch(JsonException){throw new ApiError(400,'invalid_json','Не удалось прочитать запрос.');}
 if(!is_array($v)||!str_starts_with(ltrim($raw),'{'))throw new ApiError(400,'invalid_json','Не удалось прочитать запрос.');return $v;
}
function method(string $expected):void{if($_SERVER['REQUEST_METHOD']!==$expected)throw new ApiError(405,'method','Недопустимый запрос.');}
function uuid():string{$b=random_bytes(16);$b[6]=chr((ord($b[6])&15)|64);$b[8]=chr((ord($b[8])&63)|128);$h=bin2hex($b);return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20);}
function email_value(mixed $v):string{$s=is_string($v)?strtolower(trim($v)):'';if(strlen($s)>254||!filter_var($s,FILTER_VALIDATE_EMAIL))throw new ApiError(400,'invalid_email','Укажи корректную почту.');return $s;}
function password_value(mixed $v):string{if(!is_string($v)||strlen($v)<8||strlen($v)>128||str_contains($v,"\0"))throw new ApiError(400,'invalid_password','Пароль должен содержать от 8 до 128 символов.');return $v;}
function password_digest(string $password):string{
 if(defined('PASSWORD_ARGON2ID'))return password_hash($password,PASSWORD_ARGON2ID,['memory_cost'=>65536,'time_cost'=>3,'threads'=>1]);
 // A versioned SHA-256 prehash prevents bcrypt truncation after 72 bytes.
 return 'ms-sha256:'.password_hash(base64_encode(hash('sha256',$password,true)),PASSWORD_BCRYPT,['cost'=>12]);
}
function password_matches(string $password,string $hash):bool{return str_starts_with($hash,'ms-sha256:')?password_verify(base64_encode(hash('sha256',$password,true)),substr($hash,10)):password_verify($password,$hash);}
function password_rehash(string $hash):bool{return defined('PASSWORD_ARGON2ID')?password_needs_rehash($hash,PASSWORD_ARGON2ID,['memory_cost'=>65536,'time_cost'=>3,'threads'=>1]):!str_starts_with($hash,'ms-sha256:')||password_needs_rehash(substr($hash,10),PASSWORD_BCRYPT,['cost'=>12]);}
function display_name(mixed $v,string $fallback='Игрок'):string{$s=is_string($v)?trim(preg_replace('/[\x00-\x1F\x7F]/u','',$v)??''):'';return $s===''?$fallback:implode('',array_slice(preg_split('//u',$s,-1,PREG_SPLIT_NO_EMPTY)?:[],0,32));}
function public_account(array $row):array{return ['id'=>$row['id'],'email'=>$row['email'],'name'=>$row['display_name'],'role'=>$row['role'],'verified'=>(bool)$row['verified'],'capabilities'=>['allCards'=>$row['role']==='admin','unlimitedResources'=>$row['role']==='admin']];}
function current_account(PDO $db):array{
 $header=$_SERVER['HTTP_AUTHORIZATION']??'';if(!preg_match('/^Bearer ([a-f0-9]{64})$/D',$header,$m))throw new ApiError(401,'unauthorized','Войди в аккаунт ещё раз.');
 $row=query($db,'SELECT a.* FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?',[hash('sha256',$m[1]),time()])->fetch();if(!$row)throw new ApiError(401,'unauthorized','Войди в аккаунт ещё раз.');return $row;
}
function session(PDO $db,array $account):array{$token=bin2hex(random_bytes(32));$expires=time()+30*86400;query($db,'INSERT INTO account_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)',[hash('sha256',$token),$account['id'],$expires,time()]);return ['token'=>$token,'expiresAt'=>$expires*1000,'user'=>public_account($account)];}
function rate_limit(PDO $db,array $c,string $bucket,int $limit,int $window):void{
 $key=hash_hmac('sha256',$bucket,(string)$c['secret']);$now=time();
 $db->beginTransaction();try{query($db,'INSERT IGNORE INTO account_rate_limits(bucket_key,attempts,window_start) VALUES(?,0,?)',[$key,$now]);$row=query($db,'SELECT attempts,window_start FROM account_rate_limits WHERE bucket_key=? FOR UPDATE',[$key])->fetch();
  if((int)$row['window_start']+$window<=$now)query($db,'UPDATE account_rate_limits SET attempts=1,window_start=? WHERE bucket_key=?',[$now,$key]);
  elseif((int)$row['attempts']>=$limit){$db->commit();throw new ApiError(429,'rate_limited','Слишком много попыток. Попробуй позже.');}
  else query($db,'UPDATE account_rate_limits SET attempts=attempts+1 WHERE bucket_key=?',[$key]);
  if($db->inTransaction())$db->commit();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 if(random_int(1,100)===1){query($db,'DELETE FROM account_rate_limits WHERE window_start<?',[$now-86400]);query($db,'DELETE FROM account_sessions WHERE expires_at<?',[$now]);query($db,'DELETE FROM account_email_tokens WHERE expires_at<?',[$now]);}
}
function mail_enabled(array $c):bool{return ($c['mail_mode']??'none')==='mail'&&filter_var($c['mail_from']??'',FILTER_VALIDATE_EMAIL)!==false;}
function send_account_mail(array $c,string $to,string $subject,string $body):void{
 if(!mail_enabled($c))throw new ApiError(503,'mail_unavailable','Отправка писем ещё не подключена. Обратись к администратору.');
 $headers=['From: '.$c['mail_from'],'Content-Type: text/plain; charset=UTF-8','MIME-Version: 1.0'];
 if(!mail($to,'=?UTF-8?B?'.base64_encode($subject).'?=',$body,implode("\r\n",$headers)))throw new ApiError(503,'mail_unavailable','Не удалось отправить письмо. Попробуй позже.');
}
function email_token(PDO $db,array $c,array $a,string $purpose):void{
 $token=bin2hex(random_bytes(32));$hash=hash('sha256',$token);query($db,'INSERT INTO account_email_tokens(token_hash,account_id,purpose,expires_at) VALUES(?,?,?,?)',[$hash,$a['id'],$purpose,time()+($purpose==='verify'?86400:1800)]);
 $link=rtrim((string)$c['frontend_url'],'/').'/' . '#account='.$purpose.'&token='.$token;
 try{send_account_mail($c,$a['email'],$purpose==='verify'?'Подтверди почту Memestone':'Новый пароль Memestone',($purpose==='verify'?'Подтверди почту по ссылке:':'Чтобы задать новый пароль, открой ссылку:')."\n\n".$link."\n\nЕсли ты не отправлял запрос, просто проигнорируй письмо.");}
 catch(Throwable $e){query($db,'DELETE FROM account_email_tokens WHERE token_hash=?',[$hash]);throw $e;}
}
