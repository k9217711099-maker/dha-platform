/** Уровни программы лояльности «баллы D» (см. CLAUDE.md). */
export const LOYALTY_TIER: Record<string, { label: string; badge: string; earn: string }> = {
  MEMBER: { label: 'Member', badge: 'bg-ink/10 text-ink', earn: '3%' },
  SILVER: { label: 'Silver', badge: 'bg-slate-200 text-slate-700', earn: '5%' },
  GOLD: { label: 'Gold', badge: 'bg-amber-200 text-amber-900', earn: '7%' },
  PLATINUM: { label: 'Platinum', badge: 'bg-indigo-200 text-indigo-900', earn: '10%' },
};
export const tierMeta = (t: string | null | undefined) => LOYALTY_TIER[t ?? 'MEMBER'] ?? LOYALTY_TIER.MEMBER!;
