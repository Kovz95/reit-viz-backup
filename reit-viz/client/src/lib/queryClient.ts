import { QueryClient, QueryFunction } from "@tanstack/react-query";

function resolveApiBase(): string {
  const raw = "__PORT_5000__";
  if (raw.startsWith("__")) return ""; // local dev — use relative URLs
  // Deployed: raw is "port/5000". Resolve against proxy base.
  // Page URL looks like: https://host/sites/proxy/JWT/web/direct-files/.../index.html
  // We need: https://host/sites/proxy/JWT/port/5000
  const path = window.location.pathname;
  const webIdx = path.indexOf("/web/");
  if (webIdx > -1) {
    return path.substring(0, webIdx) + "/" + raw;
  }
  // Fallback: just use relative (shouldn't happen)
  return raw;
}

const API_BASE = resolveApiBase();
export { API_BASE };

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Re-export fetchMetricSeries so pages that import from "@/lib/queryClient" work.
// The canonical implementation lives in fetchMetricSeries.ts.
export { fetchMetricSeries } from "./fetchMetricSeries";

// Re-export fetchWorkbookTickers and TickerMeta for pages importing from queryClient
export { fetchWorkbookTickers, TickerMeta } from "./fetchWorkbookTickers";
