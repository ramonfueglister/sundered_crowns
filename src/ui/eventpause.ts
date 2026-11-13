// fix-people: when an event or offer window stops the clock. Kept free of the UI framework so that the rule can be
// tested on its own (tests/fix_people.test.ts); the event window (panels/overlay.tsx) applies it.

/** An offer of another realm (alliance, marriage, passage, trade...), as opposed to an event of the realm itself. */
export const isOffer = (e: { event: string }) => e.event.startsWith('diplo_');

/** Whether a window of this kind stops the clock, by the player's settings: events by default, offers only when asked. */
export const pausesWith = (o: { pauseOnEvents: boolean; pauseOnOffers: boolean }) => (e: { event: string }) => (isOffer(e) ? o.pauseOnOffers : o.pauseOnEvents);

/** The windows that arrived since `known` (the ids seen before; null at the first look) and stop the clock. Every new
 *  entry of the queue counts, not only the one in front: an event that arrives while an offer window is open waits
 *  behind it, and the game must not run on while it does (it would expire and be answered by itself). */
export function arrivedPausing<T extends { id: number; event: string }>(known: ReadonlySet<number> | null, pending: readonly T[], pauses: (e: T) => boolean): T[] {
  return pending.filter((p) => !known?.has(p.id) && pauses(p));
}

/** After answering window `answered`: whether the pause the windows made may end, which is only when no window that
 *  stops the clock is left in the queue. */
export function mayResume<T extends { id: number; event: string }>(pending: readonly T[], answered: number, pauses: (e: T) => boolean): boolean {
  return !pending.some((p) => p.id !== answered && pauses(p));
}
