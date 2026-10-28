import { useEffect,useRef,useState } from 'react';
import { KeyRound,LoaderCircle,Mail,UserRound } from 'lucide-react';
import Modal from './Modal';
import { useAccount } from '../account/AccountProvider';
import { AccountApi,ApiError } from '../account/api';
export type AuthMode='login'|'register'|'forgot'|'change'|'name';
export default function AuthDialog({close,initial='login'}:{close:()=>void;initial?:AuthMode}){
 const account=useAccount(),[mode,setMode]=useState<AuthMode>(initial),[email,setEmail]=useState(account.user?.email??''),[name,setName]=useState(account.user?.name??''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[old,setOld]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[unverified,setUnverified]=useState(false),verified=useRef(false);
 const recovery=account.recovery;
 const api=()=>{if(!account.apiUrl)throw new Error('Вход сейчас недоступен. Попробуй позже.');return new AccountApi(account.apiUrl);};
 useEffect(()=>{if(recovery?.type!=='verify'||!account.configured||verified.current)return;verified.current=true;setBusy(true);void api().request('email-verify','POST',{token:recovery.token}).then(()=>{setMessage('Почта подтверждена. Теперь можно войти.');account.clearRecovery();setMode('login');}).catch(e=>setError(e instanceof Error?e.message:'Не удалось подтвердить почту.')).finally(()=>setBusy(false));},[recovery,account.configured]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');setMessage('');setUnverified(false);setBusy(true);try{
   if((mode==='register'||mode==='change'||recovery?.type==='reset')&&password!==confirm)throw new Error('Пароли не совпадают.');
   if(recovery?.type==='reset'){await api().request('password-reset','POST',{token:recovery.token,password});account.clearRecovery();setMode('login');setPassword('');setConfirm('');setMessage('Пароль обновлён. Войди с новым паролем.');}
   else if(mode==='login')await account.login(email,password);
   else if(mode==='register'){const verify=await account.register(email,password,name);if(verify){setMode('login');setPassword('');setConfirm('');setMessage('Открой письмо и подтверди почту. После этого можно войти.');}}
   else if(mode==='forgot'){await api().request('password-forgot','POST',{email:email.trim()});setMessage('Если аккаунт с такой почтой существует, на неё придёт ссылка для нового пароля.');}
   else if(mode==='change')await account.changePassword(old,password);
   else if(mode==='name'){await account.changeName(name);close();}
  }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить запрос.');if(e instanceof ApiError&&e.code==='email_unverified')setUnverified(true);if(e instanceof ApiError&&e.code==='session_transport'&&mode==='register')setMode('login');}finally{setBusy(false);}};
 const changeMode=(value:AuthMode)=>{setMode(value);setError('');setMessage('');setPassword('');setConfirm('');setOld('');};
 const reset=recovery?.type==='reset',register=mode==='register',passwordNeeded=reset||['login','register','change'].includes(mode),emailNeeded=['login','register','forgot'].includes(mode)&&!reset;
 const title=reset?'Новый пароль':mode==='change'?'Сменить пароль':mode==='name'?'Имя игрока':mode==='forgot'?'Восстановить пароль':'Аккаунт Memestone';
 return <Modal title={title} close={close} className="account-modal paged-modal"><header className="account-heading"><KeyRound size={25}/><h2>{title}</h2></header>
  {!reset&&['login','register'].includes(mode)&&<div className="account-tabs" role="tablist" aria-label="Вход и регистрация"><button role="tab" aria-selected={!register} onClick={()=>changeMode('login')}>Войти</button><button role="tab" aria-selected={register} onClick={()=>changeMode('register')}>Регистрация</button></div>}
  {!account.configured&&<div className="account-message" role="status"><p>Вход сейчас недоступен. Гостевой прогресс сохраняется на этом устройстве.</p><button className="button secondary" disabled={busy} onClick={()=>{setBusy(true);void account.retryServer().catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Проверить подключение</button></div>}
  <form className="account-form" onSubmit={submit}>
   <div className="account-fields">
    {(register||mode==='name')&&!reset&&<label><span><UserRound size={15}/>Имя в игре{register?' (необязательно)':''}</span><input autoComplete="nickname" maxLength={32} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>}
    {emailNeeded&&<label><span><Mail size={15}/>Почта</span><input type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>}
    {mode==='change'&&!reset&&<label><span>Текущий пароль</span><input type="password" autoComplete="current-password" required maxLength={128} value={old} onChange={e=>setOld(e.target.value)} disabled={busy}/></label>}
    {passwordNeeded&&<label><span>{mode==='change'||reset?'Новый пароль':'Пароль'}</span><input type="password" name="password" autoComplete={mode==='login'&&!reset?'current-password':'new-password'} required minLength={mode==='login'&&!reset?undefined:8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>}
    {(register||mode==='change'||reset)&&<label><span>Повтори пароль</span><input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy}/></label>}
   </div>
   {error&&<p className="account-message error" role="alert">{error}</p>}{message&&<p className="account-message success" role="status">{message}</p>}
   <button className="button primary" type="submit" disabled={busy||!account.configured}>{busy?<><LoaderCircle className="spinning" size={17}/>Подождите…</>:reset||mode==='change'||mode==='name'?'Сохранить':mode==='forgot'?'Отправить ссылку':register?'Создать аккаунт':'Войти'}</button>
  </form>
  {!reset&&mode==='login'&&<button className="account-link" onClick={()=>changeMode('forgot')}>Не помню пароль</button>}
  {!reset&&mode==='forgot'&&<button className="account-link" onClick={()=>changeMode('login')}>Назад ко входу</button>}
  {unverified&&<button className="account-link" disabled={busy} onClick={()=>{setBusy(true);void api().request('verify-resend','POST',{email}).then(()=>setMessage('Новое письмо отправлено.')).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Отправить письмо повторно</button>}
  {!account.user&&!reset&&<p className="account-caption">Коллекция, колоды, статистика и история матчей будут доступны на других устройствах после входа.</p>}
 </Modal>;
}
