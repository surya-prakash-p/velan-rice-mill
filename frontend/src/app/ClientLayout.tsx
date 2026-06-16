'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSync } from '@/context/SyncContext';
import { LayoutDashboard, PlusCircle, Receipt, Settings, Boxes } from 'lucide-react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isOnline, syncState, pendingCount } = useSync();

  const isPrintPage = pathname.includes('/print');

  // If it's a print-optimized page, don't show the sidebar or navigation wrapper
  if (isPrintPage) {
    return <main>{children}</main>;
  }

  return (
    <div className="app-wrapper">
      {/* Sidebar Navigation */}
      <aside className="sidebar no-print">
        <div className="logo-area">
          <div>
            <div className="logo-text">Velan Rice Mill</div>
            <div className="logo-sub">Billing & Cash Book</div>
          </div>
        </div>

        <nav>
          <ul className="nav-list">
            <li>
              <Link
                href="/"
                className={`nav-link ${pathname === '/' ? 'active' : ''}`}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </Link>
            </li>
            <li>
              <Link
                href="/invoices/new"
                className={`nav-link ${pathname === '/invoices/new' ? 'active' : ''}`}
              >
                <PlusCircle size={18} />
                <span>New Invoice</span>
              </Link>
            </li>
            <li>
              <Link
                href="/ledger"
                className={`nav-link ${pathname === '/ledger' ? 'active' : ''}`}
              >
                <Receipt size={18} />
                <span>Cash Book Ledger</span>
              </Link>
            </li>
            <li>
              <Link
                href="/stock"
                className={`nav-link ${pathname === '/stock' ? 'active' : ''}`}
              >
                <Boxes size={18} />
                <span>Inventory</span>
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                className={`nav-link ${pathname === '/settings' ? 'active' : ''}`}
              >
                <Settings size={18} />
                <span>Settings</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* Network & Sync Status Widget */}
        <div className="network-indicator">
          {syncState === 'syncing' ? (
            <>
              <div className="status-dot syncing"></div>
              <div>
                <span style={{ fontWeight: 600 }}>Syncing...</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Updating ERPNext
                </div>
              </div>
            </>
          ) : !isOnline ? (
            <>
              <div className="status-dot offline"></div>
              <div>
                <span style={{ fontWeight: 600 }}>Offline Mode</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Queued: {pendingCount} entries
                </div>
              </div>
            </>
          ) : syncState === 'error' ? (
            <>
              <div className="status-dot offline"></div>
              <div>
                <span style={{ fontWeight: 600, color: 'var(--accent-rose)' }}>Sync Error</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {pendingCount} items retrying
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="status-dot online"></div>
              <div>
                <span style={{ fontWeight: 600 }}>Connected</span>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {pendingCount > 0 ? `${pendingCount} items pending` : 'All data synced'}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
