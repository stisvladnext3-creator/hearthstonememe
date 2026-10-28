export const PROFILE_CHANGED = 'memestone:profile-changed';
export const PROFILE_REFRESHED = 'memestone:profile-refreshed';
let active = 'guest';
export const profileScope = () => active;
export function setProfileScope(id: string) {
  if (id !== 'guest' && !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Некорректный аккаунт.');
  active = id;
}
export const profileKey = (key: string, scope = active) => scope === 'guest' ? 'memestone.v1.' + key : `memestone.account.${scope}.v1.${key}`;
export const profileDatabase = (name: string, scope = active) => scope === 'guest' ? name : `${name}-${scope}`;
export const roomSaveKey = (scope = active) => scope === 'guest' ? 'memestone.room.v1' : `memestone.room.v1.${scope}`;
export function profileChanged(keys: string[], scope = active) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROFILE_CHANGED, { detail: { keys, scope } }));
}
export function profileRefreshed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_REFRESHED));
}
