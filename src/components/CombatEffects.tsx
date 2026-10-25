import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Art } from './Card';
import { CARD } from '../game/cards';
import type { Game, GameEvent } from '../game/engine';

interface Box { x: number; y: number; width: number; height: number }
interface Effect { event: GameEvent; from: Box; to: Box; delay: number }
export default function CombatEffects({ game, enabled }: { game: Game; enabled: boolean }) {
  const previous = useRef(new Map<string, Box>());
  const seen = useRef(game.events.at(-1)?.id ?? 0);
  const gameId = useRef(game.id);
  const timers = useRef<number[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);
  useLayoutEffect(() => {
    const refresh = () => {
      const positions = new Map<string, Box>();
      document.querySelectorAll<HTMLElement>('[data-combat-anchor]').forEach(el => {
        const b = el.getBoundingClientRect();
        positions.set(el.dataset.combatAnchor!, { x: b.x, y: b.y, width: b.width, height: b.height });
      });
      previous.current = positions;
    };
    window.addEventListener('scroll', refresh, { capture: true, passive: true });
    window.addEventListener('resize', refresh);
    return () => { window.removeEventListener('scroll', refresh, true); window.removeEventListener('resize', refresh); };
  }, []);
  useLayoutEffect(() => {
    const current = new Map<string, Box>();
    document.querySelectorAll<HTMLElement>('[data-combat-anchor]').forEach(el => {
      const b = el.getBoundingClientRect();
      current.set(el.dataset.combatAnchor!, { x: b.x, y: b.y, width: b.width, height: b.height });
    });
    if (gameId.current !== game.id) { seen.current = 0; gameId.current = game.id; }
    const incoming = game.events.filter(e => e.id > seen.current);
    seen.current = game.events.at(-1)?.id ?? 0;
    if (enabled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && incoming.length) {
      const batch: Effect[] = [];
      const before = previous.current;
      for (const event of incoming) {
        const targetKey = event.kind === 'draw' && event.side === 'bot' ? 'bot:hand' : event.target ? `${event.target.side}:${event.target.uid}` : `${event.side}:hero`;
        const sourceKey = event.kind === 'draw' ? `${event.side}:deck` : event.kind === 'power' ? `${event.side}:power` : `${event.side}:${event.source ?? 'hero'}`;
        const to = (event.kind === 'summon' || event.kind === 'draw' ? current.get(targetKey) : before.get(targetKey)) ?? current.get(targetKey);
        const from = before.get(sourceKey) ?? current.get(sourceKey) ?? to;
        if (!from || !to) continue;
        batch.push({ event, from, to, delay: event.kind === 'draw' ? batch.filter(f => f.event.kind === 'draw').length * 90 : 0 });
        if (event.kind === 'power' && event.cardId === 'armor-power') {
          const orb = document.querySelector<HTMLElement>(`[data-combat-anchor="${sourceKey}"]`);
          orb?.classList.add('combat-forge');
          timers.current.push(window.setTimeout(() => orb?.classList.remove('combat-forge'), 1000));
        }
        if (['damage', 'power', 'transform'].includes(event.kind)) {
          const el = document.querySelector<HTMLElement>(`[data-combat-anchor="${targetKey}"]`);
          const cls = event.kind === 'damage' ? 'combat-hit' : event.kind === 'power' && event.cardId === 'armor-power' ? 'combat-armor' : event.kind === 'power' && event.cardId === 'spark-power' ? 'combat-arcane' : 'combat-magic';
          el?.classList.add(cls);
          timers.current.push(window.setTimeout(() => el?.classList.remove(cls), 800));
        }
        if (event.kind === 'attack') {
          const el = document.querySelector<HTMLElement>(`[data-combat-anchor="${sourceKey}"]`);
          if (el) { el.classList.add('combat-source-hidden'); timers.current.push(window.setTimeout(() => el.classList.remove('combat-source-hidden'), 650)); }
        }
        if (event.kind === 'summon') {
          const el = document.querySelector<HTMLElement>(`[data-combat-anchor="${targetKey}"]`);
          if (el) { el.classList.add('combat-source-hidden'); timers.current.push(window.setTimeout(() => el.classList.remove('combat-source-hidden'), 620)); }
        }
      }
      setEffects(old => [...old, ...batch]);
      timers.current.push(window.setTimeout(() => setEffects(old => old.filter(f => !batch.includes(f))), 1000 + Math.max(0, ...batch.map(f => f.delay))));
    }
    previous.current = current;
  }, [game, enabled]);
  useLayoutEffect(() => () => timers.current.forEach(clearTimeout), []);
  return createPortal(<div className="combat-effects" aria-hidden="true">{effects.map(({ event: e, from, to, delay }) => {
    const dx = to.x + to.width / 2 - from.x - from.width / 2;
    const dy = to.y + to.height / 2 - from.y - from.height / 2;
    const width = e.kind === 'summon' ? to.width : from.width;
    const height = e.kind === 'summon' ? to.height : from.height;
    const style = { '--fx-dx': `${dx}px`, '--fx-dy': `${dy}px`, left: from.x + (from.width - width) / 2, top: from.y + (from.height - height) / 2, width, height } as CSSProperties;
    if (e.kind === 'power' && e.cardId === 'armor-power') return <div key={e.id} data-fx="warrior-hammer" className="fx-forge-power" style={{ left: from.x + from.width / 2, top: from.y + from.height / 2, '--forge-size': `${Math.max(42, from.width)}px` } as CSSProperties}>
      <div className="fx-forge-burst">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--ember-angle': `${i * 36}deg`, '--ember-distance': `${32 + i % 3 * 9}px` } as CSSProperties} />)}</div>
      <svg className="fx-warhammer" viewBox="0 0 120 150"><path d="m50 45 12-5 36 98-12 5Z" fill="#6e301c" stroke="#29130b" strokeWidth="4" /><path d="m76 98 13-5m-9 16 13-5m-9 16 13-5" stroke="#d99f4b" strokeWidth="5" /><path d="m8 26 13-16 58-5 20 17-2 38-17 15-58-4L9 56Z" fill="#252a35" stroke="#ecb95e" strokeWidth="4" /><path d="m22 18 54-5 14 13-53 8-18 26Z" fill="#74808c" /><path d="m37 34 53-8-1 31-13 10-40-2Z" fill="#4b5665" /><path d="m58 24-10 20 15-3-6 19 22-29-15 3 6-13Z" fill="#ffb444" stroke="#fff0a2" strokeWidth="2" /></svg>
      <span className="fx-armor-gain" style={{ '--armor-dx': `${dx}px`, '--armor-dy': `${dy}px` } as CSSProperties}>+2 <span>брони</span></span>
    </div>;
    if (e.kind === 'power' && e.cardId === 'spark-power') return <div key={e.id} data-fx="arcane-arrow" className="fx-arcane-power">
      <span className="fx-arcane-flight" style={{ left: from.x + from.width / 2, top: from.y + from.height / 2, '--fx-dx': `${dx}px`, '--fx-dy': `${dy}px`, '--arrow-angle': `${Math.atan2(dy, dx)}rad` } as CSSProperties}><svg className="fx-arcane-arrow" viewBox="0 0 120 38"><path d="M2 24Q32 0 78 18Q41 36 8 30Q35 19 76 19" fill="#9535ee" opacity=".8" /><path d="m69 10 42 9-42 10 12-10Z" fill="#f6d9ff" stroke="#b367ff" strokeWidth="3" /><path d="M19 23Q48 13 87 19" fill="none" stroke="#fff0ff" strokeWidth="3" /></svg></span>
      <span className="fx-arcane-impact" style={{ left: to.x + to.width / 2, top: to.y + to.height / 2 }}><i /><i /><i /></span>
    </div>;
    if (e.kind === 'draw') return <div key={e.id} data-fx="draw" className="fx-drawn-card" style={{ ...style, animationDelay: `${delay}ms` }}><span className="card-back-design">✦</span></div>;
    if ((e.kind === 'attack' || e.kind === 'summon') && e.cardId) return <div key={e.id} data-fx={e.kind} className={`fx-flying-unit ${e.kind}`} style={style}><Art index={CARD[e.cardId].art} cardId={e.cardId} /><span>{CARD[e.cardId].name}</span></div>;
    if (e.kind === 'damage' || e.kind === 'death') return <div key={e.id} data-fx={e.kind} className={`fx-impact ${e.kind}`} style={{ left: to.x + to.width / 2, top: to.y + to.height / 2 }}><span>{e.kind === 'damage' ? `−${e.amount}` : '✦'}</span></div>;
    return <div key={e.id} data-fx={e.kind} className={`fx-magic ${e.kind}`}><svg><line x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} /></svg><span className="fx-rune" style={{ left: to.x + to.width / 2, top: to.y + to.height / 2 }}>✦</span>{e.kind === 'power' && <span className="fx-power-name" style={{ left: from.x + from.width / 2, top: from.y - 16 }}>{e.cardId === 'bolt' ? 'Искра' : e.cardId ? CARD[e.cardId].name : ''}</span>}</div>;
  })}</div>, document.body);
}
