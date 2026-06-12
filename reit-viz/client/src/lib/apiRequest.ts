// Hand-written from call-site inference (Alerts.tsx)
// Thin fetch wrapper that serializes body to JSON and throws on !ok responses.

export async function apiRequest(
  method: string,
  url: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {};
  let serializedBody: string | undefined;

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    serializedBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: serializedBody,
  });

  if (!response.ok) {
    let message: string;
    try {
      const json = await response.json();
      message = json.message ?? json.error ?? `HTTP ${response.status}`;
    } catch {
      message = `HTTP ${response.status} ${response.statusText}`;
    }
    throw new Error(message);
  }

  return response;
}
