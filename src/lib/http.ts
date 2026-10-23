import 'server-only';

export function json(data: unknown, init: number | ResponseInit = 200) {
  const ri = typeof init === 'number' ? { status: init } : init;
  return Response.json(data, { ...ri, headers: { 'cache-control': 'no-store', ...(ri.headers ?? {}) } });
}

export function bad(message: string, status = 400) {
  return json({ error: message }, status);
}
