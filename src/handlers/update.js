import { saveMetricsHistory } from '../database/schema.js';

const serverExistenceCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function checkServerExists(db, id) {
  const now = Date.now();
  const cached = serverExistenceCache.get(id);

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.exists;
  }

  const result = await db.prepare(
    'SELECT 1 FROM servers WHERE id = ?'
  ).bind(id).first();

  const exists = !!result;
  serverExistenceCache.set(id, { exists, timestamp: now });

  return exists;
}

export async function handleUpdate(request, env, ctx) {
  try {
    const data = await request.json();
    const { id, secret, metrics } = data;

    if (secret !== env.API_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    let countryCode = request.cf?.country || '';
    if (countryCode.toUpperCase() === 'TW') countryCode = 'CN';

    const serverExists = await checkServerExists(env.DB, id);
    
    if (!serverExists) {
      return new Response('Server not found', { status: 404 });
    }

    await saveMetricsHistory(env.DB, id, metrics, countryCode);

    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error('更新数据失败:', e);
    return new Response(`Error: ${e.message}`, { status: 400 });
  }
}