export const METRIC_KEYS = ['cardsPlayed', 'heroDamage', 'minionDamage', 'manaSpent'] as const;
export type MatchMetrics = Record<typeof METRIC_KEYS[number], number>;
export const emptyMetrics = (): MatchMetrics => ({ cardsPlayed: 0, heroDamage: 0, minionDamage: 0, manaSpent: 0 });
export function validMetrics(value: unknown): value is MatchMetrics {
  return !!value && typeof value === 'object' && METRIC_KEYS.every(key => Number.isSafeInteger((value as MatchMetrics)[key]) && (value as MatchMetrics)[key] >= 0);
}
export function addMetric(player: { metrics?: MatchMetrics }, key: keyof MatchMetrics, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  player.metrics ??= emptyMetrics();
  player.metrics[key] = Math.min(Number.MAX_SAFE_INTEGER, player.metrics[key] + Math.floor(amount));
}
