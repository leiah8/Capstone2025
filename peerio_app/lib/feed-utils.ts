/**
 * feed-utils.ts
 *
 * Pure helper functions shared by the Projects and Candidates feed screens.
 * Keep this file free of React / RN imports so it stays unit-testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single slot in a filtered feed list. */
export type FeedItem<T> = {
  /** The underlying data object. */
  item: T;
  /**
   * Whether this item passes the current filter settings.
   * Items with included=false are skipped by getNextIndex.
   */
  included: boolean;
  /**
   * Whether the user has already swiped on this item in the current session.
   * Swiped items are skipped by getNextIndex and hidden from the deck.
   */
  swiped: boolean;
};

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

/**
 * Return the index of the next item that is both included AND not yet swiped,
 * starting the search at `fromIndex` (inclusive).
 *
 * Returns `list.length` (i.e. "end of deck") when no such item exists.
 */
export function getNextIndex<T>(list: FeedItem<T>[], fromIndex: number): number {
  for (let i = fromIndex; i < list.length; i++) {
    if (list[i].included && !list[i].swiped) return i;
  }
  return list.length; // sentinel: deck exhausted
}

/**
 * Starting from the current index, return the index of the *second* visible
 * card (the one peeking behind the top card).  Returns `list.length` when
 * there is no such card.
 */
export function getPeekIndex<T>(list: FeedItem<T>[], currentIndex: number): number {
  // currentIndex is already the first visible card; find the next one after it
  for (let i = currentIndex + 1; i < list.length; i++) {
    if (list[i].included && !list[i].swiped) return i;
  }
  return list.length;
}

// ---------------------------------------------------------------------------
// Mutation helpers (return new arrays — never mutate in place)
// ---------------------------------------------------------------------------

/**
 * Mark the item at `index` as swiped.  Returns a new array reference so
 * React state updates fire correctly.
 */
export function markSwiped<T>(list: FeedItem<T>[], index: number): FeedItem<T>[] {
  if (index < 0 || index >= list.length) return list;
  const next = [...list];
  next[index] = { ...next[index], swiped: true };
  return next;
}

/**
 * Reset all `swiped` flags to false (used by Start Over).
 */
export function resetSwiped<T>(list: FeedItem<T>[]): FeedItem<T>[] {
  return list.map((item) => (item.swiped ? { ...item, swiped: false } : item));
}

/**
 * Re-stamp `included` on every item using the provided predicate.
 * `swiped` flags are preserved.
 */
export function applyIncluded<T>(
  list: FeedItem<T>[],
  predicate: (item: T) => boolean,
): FeedItem<T>[] {
  return list.map((slot) => {
    const included = predicate(slot.item);
    return included === slot.included ? slot : { ...slot, included };
  });
}

/**
 * Wrap a plain array of items into FeedItem slots.
 * All items start as included=true and swiped=false.
 */
export function toFeedItems<T>(items: T[]): FeedItem<T>[] {
  return items.map((item) => ({ item, included: true, swiped: false }));
}

// ---------------------------------------------------------------------------
// Distance helper (duplicated here so feed-utils has no external deps)
// ---------------------------------------------------------------------------

export function calcDistKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
