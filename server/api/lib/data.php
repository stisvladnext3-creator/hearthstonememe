<?php
declare(strict_types=1);
function art_route(array $c,array $a):never{
 $hash=$_GET['hash']??'';if(!is_string($hash)||!preg_match('/^[a-f0-9]{64}$/D',$hash))throw new ApiError(400,'invalid_image','Некорректная картинка.');$dir=$c['storage_dir'].'/'.$a['id'];$path=$dir.'/'.$hash.'.bin';
 if($_SERVER['REQUEST_METHOD']==='GET'){
  if(!is_file($path)||!is_file($path.'.json'))throw new ApiError(404,'not_found','Картинка не найдена.');$meta=json_decode(file_get_contents($path.'.json'),true);header('Content-Type: '.$meta['mime']);header('Content-Length: '.filesize($path));readfile($path);exit;
 }
 method('PUT');if((int)($_SERVER['CONTENT_LENGTH']??0)>15728640)throw new ApiError(413,'image_too_large','Картинка должна быть не больше 15 МБ.');$body=file_get_contents('php://input',false,null,0,15728641);
 if($body===false||strlen($body)>15728640||!hash_equals($hash,hash('sha256',$body)))throw new ApiError(400,'invalid_image','Не удалось проверить картинку.');
 $mime=(new finfo(FILEINFO_MIME_TYPE))->buffer($body);$size=@getimagesizefromstring($body);
 if(!in_array($mime,['image/jpeg','image/png','image/webp'],true)||!$size||$size[0]*$size[1]>40000000)throw new ApiError(400,'invalid_image','Выбери JPG, PNG или WebP до 40 мегапикселей.');
 if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new RuntimeException('Private storage unavailable');
 $temp=tempnam($dir,'upload-');try{if(file_put_contents($temp,$body,LOCK_EX)===false||!rename($temp,$path))throw new RuntimeException('Private storage unavailable');chmod($path,0600);$meta=['hash'=>$hash,'mime'=>$mime,'size'=>strlen($body)];if(file_put_contents($path.'.json',json_encode($meta),LOCK_EX)===false)throw new RuntimeException('Private storage unavailable');chmod($path.'.json',0600);}finally{if(is_file($temp))unlink($temp);}
 respond($meta);
}
function history_route(PDO $db,array $a):never{
 if($_SERVER['REQUEST_METHOD']==='GET'){
  $id=$_GET['id']??null;if($id!==null){if(!is_string($id)||strlen($id)>100)throw new ApiError(400,'invalid_match','Матч не найден.');$raw=query($db,'SELECT detail FROM account_history WHERE account_id=? AND match_id=?',[$a['id'],$id])->fetchColumn();if(!$raw)throw new ApiError(404,'not_found','Матч не найден.');respond(json_decode($raw,true,64,JSON_THROW_ON_ERROR));}
  $offset=min(1000000,max(0,(int)($_GET['offset']??0)));$limit=min(20,max(1,(int)($_GET['limit']??10)));$rows=query($db,'SELECT summary FROM account_history WHERE account_id=? ORDER BY finished_at DESC,match_id DESC LIMIT '.(int)$limit.' OFFSET '.(int)$offset,[$a['id']])->fetchAll();$total=(int)query($db,'SELECT COUNT(*) FROM account_history WHERE account_id=?',[$a['id']])->fetchColumn();respond(['items'=>array_map(fn($r)=>json_decode($r['summary'],true),$rows),'total'=>$total]);
 }
 method('POST');$v=json_body(8388608);$id=$v['id']??null;
 if(!is_string($id)||!preg_match('/^[A-Za-z0-9_.:\-]{1,100}$/D',$id)||!in_array($v['outcome']??'', ['win','loss','draw'],true)||!safe_integer($v['endedAt']??null)||!safe_integer($v['turns']??null)||!is_array($v['log']??null)||count($v['log'])>1000||!is_array($v['cards']??null)||count($v['cards'])>120||!is_array($v['metrics']??null)||!valid_counter($v['metrics']))throw new ApiError(400,'invalid_match','Некорректная история матча.');
 foreach($v['log'] as $entry)if(!is_array($entry)||!is_string($entry['text']??null)||strlen($entry['text'])>16000||!in_array($entry['side']??'', ['player','bot','system'],true))throw new ApiError(400,'invalid_match','Некорректная история матча.');
 foreach($v['cards'] as $card)if(!is_array($card)||!is_string($card['id']??null))throw new ApiError(400,'invalid_match','Некорректные карты матча.');else validate_record('card:'.$card['id'],$card);
 foreach(['playerHero','opponentHero','opponent','mode'] as $key)if(!is_string($v[$key]??null)||strlen($v[$key])>200)throw new ApiError(400,'invalid_match','Некорректная история матча.');
 $summary=$v;unset($summary['log'],$summary['cards'],$summary['art']);query($db,'INSERT IGNORE INTO account_history(account_id,match_id,finished_at,summary,detail) VALUES(?,?,?,?,?)',[$a['id'],$id,$v['endedAt'],json_encode($summary,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),json_encode($v,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);respond(['ok'=>true]);
}
