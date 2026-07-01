export function ok<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data } satisfies { data: T }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function err(
  message: string,
  status = 400,
  code?: string
): Response {
  const body: { error: string; code?: string } = { error: message };
  if (code) body.code = code;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}