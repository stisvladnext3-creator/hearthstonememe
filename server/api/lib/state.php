<?php
declare(strict_types=1);
function safe_integer(mixed $v):bool{return is_int($v)&&$v>=0&&$v<=9007199254740991;}
function valid_counter(array $v):bool{foreach(['cardsPlayed','heroDamage','minionDamage','manaSpent'] as $key)if(!safe_integer($v[$key]??null))return false;return true;}
function valid_card_sound(mixed $v):bool{
 if(!is_array($v)||!is_string($v['name']??null)||trim($v['name'])===''||strlen($v['name'])>320||preg_match('/[\x00-\x1f\x7f]/',$v['name'])||!safe_integer($v['duration']??null)||$v['duration']<1||$v['duration']>5000||!is_string($v['data']??null)||strlen($v['data'])>213414||!preg_match('/^data:audio\/wav;base64,[A-Za-z0-9+\/]+={0,2}$/D',$v['data']))return false;
 $bytes=base64_decode(substr($v['data'],22),true);if($bytes===false||strlen($bytes)<46||strlen($bytes)>160044)return false;
 $length=strlen($bytes)-44;$u16=fn($n)=>unpack('v',substr($bytes,$n,2))[1];$u32=fn($n)=>unpack('V',substr($bytes,$n,4))[1];
 return substr($bytes,0,4)==='RIFF'&&substr($bytes,8,4)==='WAVE'&&substr($bytes,12,4)==='fmt '&&substr($bytes,36,4)==='data'&&$u32(4)===strlen($bytes)-8&&$u32(16)===16&&$u16(20)===1&&$u16(22)===1&&$u32(24)===16000&&$u32(28)===32000&&$u16(32)===2&&$u16(34)===16&&$u32(40)===$length&&$length%2===0&&$v['duration']===(int)ceil($length/32);
}
function validate_record(string $key,mixed $value):void{
 if(strlen($key)>180||!preg_match('/^(deck|card|installation|pin|appearance|stat|legacy|art|preferences|selected):[A-Za-z0-9_.:@~\-]{1,150}$/D',$key))throw new ApiError(400,'invalid_record','Некорректные данные профиля.');
 if($value===null)return;
 if(strlen(json_encode($value,JSON_THROW_ON_ERROR))>524288)throw new ApiError(413,'record_too_large','Одна из карт или записей слишком большая.');
 [$kind,$id]=explode(':',$key,2);
 switch($kind){
  case 'deck':if(!is_array($value)||($value['id']??null)!==$id||!is_string($value['name']??null)||strlen($value['name'])>128||!in_array($value['heroClass']??'', ['mage','warrior','warlock','storm','cat'],true)||!is_array($value['cards']??null)||count($value['cards'])>30||array_filter($value['cards'],fn($v)=>!is_string($v)||strlen($v)>100))throw new ApiError(400,'invalid_deck','Некорректная колода.');break;
  case 'card':if(!is_array($value)||($value['id']??null)!==$id||!str_starts_with($id,'custom-')||!is_array($value['editor']??null)||($value['editor']['version']??null)!==1||!in_array($value['kind']??'', ['minion','spell','token','hero','power'],true))throw new ApiError(400,'invalid_card','Некорректная карта.');$image=$value['editor']['image']??null;if($image!==null&&(!is_string($image)||strlen($image)>48000||!preg_match('/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+\/=]+$/D',$image)))throw new ApiError(400,'invalid_image','Некорректная картинка карты.');break;
  case 'stat':if(!is_array($value)||!valid_counter($value)||!is_bool($value['finished']??null)||isset($value['won'])&&!is_bool($value['won']))throw new ApiError(400,'invalid_stats','Некорректная статистика.');break;
  case 'legacy':if(!is_array($value)||!valid_counter($value)||!safe_integer($value['wins']??null)||!safe_integer($value['games']??null))throw new ApiError(400,'invalid_stats','Некорректная статистика.');break;
  case 'installation':if(!is_array($value)||($value['id']??null)!==$id||!in_array($value['kind']??'', ['card','deck','expansion'],true)||!is_array($value['cardIds']??null)||count($value['cardIds'])>300)throw new ApiError(400,'invalid_installation','Некорректное дополнение.');break;
  case 'pin':if($value!==true)throw new ApiError(400,'invalid_record','Некорректная запись.');break;
  case 'appearance':if(!in_array($value,['signature','diamond'],true))throw new ApiError(400,'invalid_record','Некорректное оформление.');break;
  case 'art':if(!is_array($value)||!preg_match('/^[a-f0-9]{64}$/D',$value['hash']??'')||!in_array($value['format']??'', ['card','editor','portrait'],true)||!in_array($value['mime']??'', ['image/jpeg','image/png','image/webp'],true)||!safe_integer($value['size']??null)||$value['size']>15728640)throw new ApiError(400,'invalid_image','Некорректная картинка.');break;
  case 'preferences':if(!in_array($id,['settings','online-name','training-bot'],true)||strlen(json_encode($value))>4096)throw new ApiError(400,'invalid_record','Некорректные настройки.');break;
  case 'selected':if($id!=='deck'||!is_string($value)||strlen($value)>100)throw new ApiError(400,'invalid_record','Некорректная колода.');break;
 }
 if($kind==='card'){
  $editor=$value['editor'];if(isset($editor['animation'])&&!in_array($editor['animation'],['stone','portal','ember','nature','storm','shadow','celestial','arcane','flame','frost','venom','void'],true))throw new ApiError(400,'invalid_animation','Некорректная анимация карты.');
  if(isset($editor['sound'])&&!valid_card_sound($editor['sound']))throw new ApiError(400,'invalid_sound','Некорректный звук карты.');
 }
}
function state_route(PDO $db,array $c,array $a):never {
 if($_SERVER['REQUEST_METHOD']==='GET'){
  $db->beginTransaction();try{$revision=(int)query($db,'SELECT state_revision FROM accounts WHERE id=?',[$a['id']])->fetchColumn();$records=[];foreach(query($db,'SELECT record_key,record_value FROM account_records WHERE account_id=?',[$a['id']]) as $r)$records[$r['record_key']]=$r['record_value']===null?null:json_decode($r['record_value'],true,64,JSON_THROW_ON_ERROR);$db->commit();respond(['revision'=>$revision,'records'=>(object)$records]);}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }
 method('PUT');rate_limit($db,$c,'sync:'.$a['id'],120,60);$v=json_body();$expected=$v['expectedRevision']??null;$changes=$v['changes']??null;
 if(!safe_integer($expected)||!is_array($changes)||count($changes)>5000)throw new ApiError(400,'invalid_state','Некорректные данные профиля.');
 foreach($changes as $key=>$value)validate_record((string)$key,$value);
 $db->beginTransaction();try{
  $revision=(int)query($db,'SELECT state_revision FROM accounts WHERE id=? FOR UPDATE',[$a['id']])->fetchColumn();if($revision!==$expected)throw new ApiError(409,'sync_conflict','Профиль обновился на другом устройстве.');
  $applied=[];
  foreach($changes as $key=>$value){
   if(str_starts_with($key,'stat:')||str_starts_with($key,'legacy:')){
    $old=query($db,'SELECT record_value FROM account_records WHERE account_id=? AND record_key=?',[$a['id'],$key])->fetchColumn();$old=$old?json_decode($old,true):null;
    if(is_array($old)){if($value===null)$value=$old;else{foreach(['cardsPlayed','heroDamage','minionDamage','manaSpent','games','wins']as $k)if(isset($old[$k]))$value[$k]=max($old[$k],$value[$k]??0);if($old['finished']??false){$value['finished']=true;if(isset($old['won']))$value['won']=$old['won'];else unset($value['won']);}}}
   }
   if(str_starts_with($key,'art:')&&$value!==null&&!is_file($c['storage_dir'].'/'.$a['id'].'/'.$value['hash'].'.bin'))throw new ApiError(409,'image_missing','Картинка ещё не загружена.');
   query($db,'INSERT INTO account_records(account_id,record_key,record_value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE record_value=VALUES(record_value)',[$a['id'],$key,$value===null?null:json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);$applied[$key]=$value;
  }
  query($db,'UPDATE accounts SET state_revision=state_revision+1 WHERE id=?',[$a['id']]);$db->commit();respond(['revision'=>$revision+1,'applied'=>(object)$applied]);
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
