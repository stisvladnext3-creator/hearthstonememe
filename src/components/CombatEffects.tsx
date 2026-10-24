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
        const sourceKey = event.kind === 'draw' ? `${event.side}:deck` : `${event.side}:${event.source ?? 'hero'}`;
        const to = (event.kind === 'summon' || event.kind === 'draw' ? current.get(targetKey) : before.get(targetKey)) ?? current.get(targetKey);
        const from = before.get(sourceKey) ?? current.get(sourceKey) ?? to;
        if (!from || !to) continue;
        batch.push({ event, from, to, delay: event.kind === 'draw' ? batch.filter(f => f.event.kind === 'draw').length * 90 : 0 });
        if (['damage', 'power', 'transform'].includes(event.kind)) {
          const el = document.querySelector<HTMLElement>(`[data-combat-anchor="${targetKey}"]`);
          const cls = event.kind === 'damage' ? 'combat-hit' : 'combat-magic';
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
    if (e.kind === 'draw') return <div key={e.id} data-fx="draw" className="fx-drawn-card" style={{ ...style, animationDelay: `${delay}ms` }}><span className="card-back-design">✦</span></div>;
    if ((e.kind === 'attack' || e.kind === 'summon') && e.cardId) return <div key={e.id} data-fx={e.kind} className={`fx-flying-unit ${e.kind}`} style={style}><Art index={CARD[e.cardId].art} cardId={e.cardId} /><span>{CARD[e.cardId].name}</span></div>;
    if (e.kind === 'damage' || e.kind === 'death') return <div key={e.id} data-fx={e.kind} className={`fx-impact ${e.kind}`} style={{ left: to.x + to.width / 2, top: to.y + to.height / 2 }}><span>{e.kind === 'damage' ? `−${e.amount}` : '✦'}</span></div>;
    return <div key={e.id} data-fx={e.kind} className={`fx-magic ${e.kind}`}><svg><line x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} /></svg><span className="fx-rune" style={{ left: to.x + to.width / 2, top: to.y + to.height / 2 }}>✦</span>{e.kind === 'power' && <span className="fx-power-name" style={{ left: from.x + from.width / 2, top: from.y - 16 }}>{e.cardId === 'bolt' ? 'Искра' : e.cardId ? CARD[e.cardId].name : ''}</span>}</div>;
  })}</div>, document.body);
}
