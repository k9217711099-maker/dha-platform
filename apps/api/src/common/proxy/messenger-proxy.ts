import { ProxyAgent } from 'undici';

/**
 * Прокси для исходящих запросов к мессенджерам, заблокированным с РФ-сервера
 * (Telegram, WhatsApp). Node-fetch (undici) не читает HTTP_PROXY автоматически —
 * нужно передать `dispatcher`. Здесь — ленивый синглтон ProxyAgent по URL из
 * MESSENGER_PROXY_URL; при пустом URL возвращаем undefined (идём напрямую).
 *
 * Использование: `fetch(url, withProxy(init, proxyUrl))`.
 */
let cached: { url: string; agent: ProxyAgent } | null = null;

function agentFor(proxyUrl: string): ProxyAgent {
  if (!cached || cached.url !== proxyUrl) {
    cached = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) };
  }
  return cached.agent;
}

/** Добавляет к RequestInit диспетчер прокси, если он задан. Иначе — init как есть. */
export function withProxy(init: RequestInit, proxyUrl?: string): RequestInit {
  if (!proxyUrl) return init;
  // `dispatcher` — опция undici-fetch, отсутствует в DOM-типах RequestInit.
  return { ...init, dispatcher: agentFor(proxyUrl) } as RequestInit & { dispatcher: ProxyAgent };
}
