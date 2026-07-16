/**
 * Минимальные декларации для https-proxy-agent / socks-proxy-agent: их типы
 * экспонируются только через "exports"-мапу и не резолвятся при
 * moduleResolution: node (наш tsconfig). Рантайм require() их находит нормально.
 * Экземпляры используются как http(s).Agent для WebSocket Baileys (см.
 * whatsapp.service.ts, где приводятся к Agent через `as unknown`).
 */
declare module 'https-proxy-agent' {
  export class HttpsProxyAgent {
    constructor(proxy: string, opts?: unknown);
  }
}

declare module 'socks-proxy-agent' {
  export class SocksProxyAgent {
    constructor(proxy: string, opts?: unknown);
  }
}
