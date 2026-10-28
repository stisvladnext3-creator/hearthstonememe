import { useState } from 'react';
import { Cloud,CloudOff,Crown,LogIn,RefreshCw } from 'lucide-react';
import { useAccount } from '../account/AccountProvider';
import type { AuthMode } from './AuthDialog';
import Modal from './Modal';
import { captureRecords,totals } from '../account/model';
export default function AccountPanel({auth}:{auth:(mode:AuthMode)=>void}){
 const account=useAccount(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmImport,setConfirmImport]=useState(false);
 const run=(action:()=>Promise<void>)=>{setBusy(true);setError('');void action().catch(e=>setError(e instanceof Error?e.message:'Не удалось выполнить запрос.')).finally(()=>setBusy(false));};
 const guest=confirmImport?captureRecords('guest'):{},stats=totals(guest);
 if(!account.user)return <div className="account-panel guest"><LogIn size={30}/><h3>Гостевой режим</h3><p>Войди, чтобы сохранить коллекцию, колоды, статистику и историю матчей в аккаунте.</p><div className="account-actions"><button className="button primary" onClick={()=>auth('login')}>Войти</button><button className="button secondary" onClick={()=>auth('register')}>Создать аккаунт</button></div><p className="account-caption">Текущий прогресс останется на устройстве. После входа его можно перенести.</p></div>;
 return <div className="account-panel"><header className="account-identity"><div><h3>{account.user.name}</h3><span title={account.user.email}>{account.user.email}</span></div>{account.user.role==='admin'&&<strong className="admin-emblem"><Crown size={17}/>Администратор · ∞</strong>}</header>
  {account.user.role==='admin'&&<p className="admin-note">Тестовый аккаунт: все карты и неограниченные ресурсы.</p>}
  <div className={`account-sync ${account.notice.status}`} role="status">{account.notice.status==='saved'?<Cloud size={18}/>:<CloudOff size={18}/>}<span>{account.notice.message}</span></div>
  <div className="account-actions"><button className="button secondary" disabled={busy} onClick={()=>run(account.sync)}><RefreshCw size={15}/>Сохранить сейчас</button><button className="button secondary" onClick={()=>auth('name')}>Имя игрока</button><button className="button secondary" onClick={()=>auth('change')}>Сменить пароль</button><button className="button danger" disabled={busy} onClick={()=>run(account.logout)}>Выйти</button></div>
  {account.canImport&&<button className="button primary account-import" disabled={busy} onClick={()=>setConfirmImport(true)}>Перенести гостевой прогресс</button>}
  {error&&<p className="account-message error" role="alert">{error}</p>}
  {confirmImport&&<Modal title="Перенести гостевой прогресс" close={()=>setConfirmImport(false)} className="account-modal small-modal"><h2>Данные этого устройства</h2><p>Колоды: {Object.keys(guest).filter(k=>k.startsWith('deck:')&&guest[k]).length}. Пользовательские карты: {Object.keys(guest).filter(k=>k.startsWith('card:')&&guest[k]).length}. Завершено партий: {stats.games}.</p><p>Они добавятся в твой аккаунт. Повторяющиеся карты и матчи будут объединены.</p><button className="button primary" disabled={busy} onClick={()=>run(async()=>{await account.importGuest();setConfirmImport(false);})}>Перенести в аккаунт</button><button className="button secondary" disabled={busy} onClick={()=>setConfirmImport(false)}>Отмена</button></Modal>}
 </div>;
}
