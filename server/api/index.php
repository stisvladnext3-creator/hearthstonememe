<?php
declare(strict_types=1);
require __DIR__.'/lib/core.php';
require __DIR__.'/lib/auth.php';
require __DIR__.'/lib/state.php';
require __DIR__.'/lib/data.php';
try{
 $action=$_GET['action']??'health';$c=configuration();safe_headers($c);
 if($action==='health'){method('GET');respond(['service'=>'memestone-accounts','version'=>1,'configured'=>true,'mailEnabled'=>mail_enabled($c),'sessionHeader'=>'X-Memestone-Session']);}
 $db=db($c);
 if(in_array($action,['register','login','me','logout','profile','password-change','password-forgot','password-reset','email-verify','verify-resend'],true))auth_route($action,$db,$c);
 $a=current_account($db);
 if($action==='state')state_route($db,$c,$a);
 if($action==='art'){rate_limit($db,$c,'art:'.$a['id'],120,60);art_route($c,$a);}
 if($action==='history'){rate_limit($db,$c,'history:'.$a['id'],120,60);history_route($db,$a);}
 throw new ApiError(404,'not_found','Запрос не найден.');
}catch(ApiError $e){respond(['error'=>['code'=>$e->apiCode,'message'=>$e->getMessage()]],$e->status);}
catch(Throwable $e){error_log('Memestone accounts failure: '.get_class($e));respond(['error'=>['code'=>'server_error','message'=>'Сервер временно недоступен. Прогресс сохранён на устройстве.']],500);}
