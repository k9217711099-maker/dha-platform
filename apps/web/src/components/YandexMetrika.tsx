'use client';

import Script from 'next/script';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { YM_ID, ymHit } from '../lib/metrika';

function RouteTracker() {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    ymHit(pathname + (params.toString() ? `?${params.toString()}` : ''));
  }, [pathname, params]);
  return null;
}

/** Счётчик Яндекс.Метрики + отслеживание SPA-переходов. No-op без NEXT_PUBLIC_YANDEX_METRIKA_ID. */
export function YandexMetrika() {
  if (!YM_ID) return null;
  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
          ym(${YM_ID}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:false });
        `}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://mc.yandex.ru/watch/${YM_ID}`} style={{ position: 'absolute', left: '-9999px' }} alt="" />
        </div>
      </noscript>
      <Suspense fallback={null}>
        <RouteTracker />
      </Suspense>
    </>
  );
}
