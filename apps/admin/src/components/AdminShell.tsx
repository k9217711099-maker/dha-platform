'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AdminSidebar } from './AdminSidebar';

/** Каркас админки: боковое меню слева + контент на всю ширину. На /login — только контент. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login' || pathname === '/design' || pathname === '/palette') return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-canvas">
      <AdminSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
