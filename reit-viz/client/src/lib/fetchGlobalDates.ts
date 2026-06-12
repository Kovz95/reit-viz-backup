// Hand-written from call-site inference
// fetchGlobalDates and fetchGlobalDatesList are used across multiple pages;
// both return sorted string arrays of available trading dates.

let _cachedDates: string[] | null = null;

export async function fetchGlobalDates(): Promise<string[]> {
  if (_cachedDates) return _cachedDates;
  const res = await fetch("/api/dates");
  if (!res.ok) throw new Error(`fetchGlobalDates: HTTP ${res.status}`);
  const data = await res.json();
  const dates: string[] = Array.isArray(data) ? data : (data.dates ?? []);
  _cachedDates = dates;
  return dates;
}

/** Alias for fetchGlobalDates — same endpoint, same cache. */
export async function fetchGlobalDatesList(): Promise<string[]> {
  return fetchGlobalDates();
}
