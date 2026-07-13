import type { KbBlock } from '../kb/content.js';

/**
 * Минимальный публичный рендер страницы БЗ (§5.4): лёгкий «гостевой» лейаут без
 * админки. HTML текстовых блоков уже санитизирован при записи (normalizeContent).
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderBlock(b: KbBlock, i: number): string {
  switch (b.type) {
    case 'heading':
      // Якоря заголовков (§3.3): те же id h-<index>, что в админке
      return b.level === 2 ? `<h2 id="h-${i}">${esc(b.text)}</h2>` : `<h3 id="h-${i}">${esc(b.text)}</h3>`;
    case 'text':
    case 'raw':
      // Внутренние ссылки kb:<shortId> наружу не ведут — гасим в неактивный текст
      return `<div class="t">${b.html.replace(/href="kb:[a-z0-9]+"/gi, 'class="internal"')}</div>`;
    case 'image':
      return `<img src="${esc(b.src)}" alt="${esc(b.alt ?? '')}" loading="lazy">`;
    case 'video':
      return `<div class="video"><iframe src="${esc(b.src)}" allowfullscreen></iframe></div>`;
    case 'button': {
      if (/^kb:/i.test(b.href)) return `<span class="btn internal">${esc(b.text)}</span>`;
      return `<a class="btn" href="${esc(b.href)}" target="_blank" rel="noreferrer">${esc(b.text)}</a>`;
    }
    case 'divider':
      return '<hr>';
    case 'mindmap':
      // Интерактивная карта требует авторизации — наружу отдаём заглушку
      return `<p class="internal">🗺 Ментальная карта «${esc(b.name ?? '')}» — доступна сотрудникам во внутренней системе</p>`;
    default:
      return '';
  }
}

export function renderPublicKbPage(title: string, blocks: KbBlock[]): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} — D Hotels &amp; Apartments</title>
<style>
  body{margin:0;font:16px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif;color:#1d1d2b;background:#f6f6f8}
  .wrap{max-width:760px;margin:0 auto;padding:32px 20px 64px}
  .card{background:#fff;border:1px solid #e6e6ee;border-radius:14px;padding:32px 36px}
  h1{font-weight:500;font-size:28px;margin:0 0 18px}
  h2{font-weight:500;font-size:21px;margin:26px 0 8px}
  h3{font-weight:500;font-size:18px;margin:20px 0 6px}
  img{max-width:100%;border-radius:10px;margin:10px 0}
  hr{border:none;border-top:1px solid #e6e6ee;margin:22px 0}
  .video{aspect-ratio:16/9;margin:12px 0}.video iframe{width:100%;height:100%;border:0;border-radius:10px}
  .btn{display:inline-block;margin:6px 0;padding:9px 16px;border:1px solid #c6c9f0;border-radius:9px;
       background:#eef0fc;color:#3b3f8f;text-decoration:none;font-size:14px}
  .internal{opacity:.55;cursor:default;text-decoration:none;color:inherit}
  table{border-collapse:collapse}td,th{border:1px solid #e0e0ea;padding:4px 8px}
  .foot{margin-top:18px;text-align:center;color:#9a9ab0;font-size:13px}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>${esc(title)}</h1>
    ${blocks.map((b, i) => renderBlock(b, i)).join('\n')}
  </div>
  <p class="foot">D Hotels &amp; Apartments · База знаний</p>
</div>
</body>
</html>`;
}

export function renderPublicError(message: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Ссылка недоступна</title>
<style>body{font:16px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif;color:#1d1d2b;background:#f6f6f8;
display:grid;place-items:center;height:100vh;margin:0}div{text-align:center}</style></head>
<body><div><h1>Ссылка недоступна</h1><p>${message}</p></div></body></html>`;
}
