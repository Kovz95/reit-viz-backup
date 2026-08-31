// Bounded insertion for module-level Map caches. These caches previously grew
// without limit — a long session touching many tickers (especially Global
// mode's 9.4k names) accumulated hundreds of full-history payloads and drove
// multi-second GC pauses. Eviction only forces a later refetch, so correctness
// is unaffected.
//
// Re-setting an existing key refreshes its recency (delete + set), so the
// oldest-first eviction approximates LRU for actively re-written entries.
// `pinned` keys are never evicted — use for entries with no refetch source
// (e.g. client-side uploaded data).
export function boundedSet<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  cap: number,
  pinned?: Set<K>,
): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size <= cap) return;
  for (const k of map.keys()) {
    if (k === key || pinned?.has(k)) continue;
    map.delete(k);
    if (map.size <= cap) break;
  }
}
