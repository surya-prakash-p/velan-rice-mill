'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSync } from '@/context/SyncContext';
import { getInvoices, getPayments, formatIndianNumber, SalesInvoice } from '@/services/api';
import { TrendingUp, Coins, AlertCircle, FileText, Terminal, ChevronDown, ChevronUp, RefreshCw, Eye, Edit, CheckCircle } from 'lucide-react';
import MarkPaidModal from '@/app/components/MarkPaidModal';

export default function Dashboard() {
  const { syncLogs, syncState, triggerSync, isOnline } = useSync();
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);

  // Mark as Paid modal states
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);

  // Stats Counters
  const [totalInvoiced, setTotalInvoiced] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [invoicesCount, setInvoicesCount] = useState(0);

  // Load invoices and calculate KPIs
  const loadData = () => {
    const invs = getInvoices();
    const pmts = getPayments();
    setInvoices(invs);

    // Sum all Invoices
    const invoicedSum = invs.reduce((sum, inv) => sum + inv.grand_total, 0);
    setTotalInvoiced(invoicedSum);

    // Sum all Payments received (Receive type only)
    const receivedSum = pmts.reduce((sum, pmt) => {
      if (pmt.payment_type === 'Receive') {
        return sum + pmt.amount;
      }
      return sum;
    }, 0);
    setTotalReceived(receivedSum);

    // Outstanding = Invoiced - Received
    // We cap outstanding at 0 if received > invoiced (due to advance payments)
    const outstanding = Math.max(0, invoicedSum - receivedSum);
    setOutstandingBalance(outstanding);

    setInvoicesCount(invs.length);
  };

  useEffect(() => {
    loadData();

    // Refresh data periodically (every 2.5 seconds to catch background sync changes)
    const interval = setInterval(loadData, 2500);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (invoice: SalesInvoice) => {
    if (invoice.sync_status === 'pending') {
      return <span className="badge badge-pending">YTS (Queue)</span>;
    }
    if (invoice.sync_status === 'error') {
      return <span className="badge badge-error">Sync Error</span>;
    }
    
    // If synced, check if invoice was fully settled
    if (invoice.is_settled) {
      return <span className="badge badge-completed">Paid</span>;
    } else {
      return <span className="badge badge-unpaid">Unpaid</span>;
    }
  };

  return (
    <div>
      {/* Top Welcome Bar */}
      <div className="flex-between" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, fontFamily: 'var(--font-display)' }}>
            Rice Mill Billing Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            P.K. Palayam Rice Mill - Ledger Operations Control Panel
          </p>
        </div>
        <div>
          <button
            onClick={triggerSync}
            disabled={syncState === 'syncing' || !isOnline}
            className="btn btn-primary"
          >
            <RefreshCw className={syncState === 'syncing' ? 'status-dot syncing' : ''} size={16} />
            <span>Sync ERPNext</span>
          </button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="kpi-container">
        {/* Total Invoiced */}
        <div className="kpi-card">
          <div className="flex-between" style={{ marginBottom: '12px' }}>
            <span className="kpi-label">Total Invoiced</span>
            <FileText size={20} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <span className="kpi-value">₹{formatIndianNumber(totalInvoiced)}</span>
          <span className="kpi-desc">Total sales bills generated</span>
        </div>

        {/* Total Received */}
        <div className="kpi-card">
          <div className="flex-between" style={{ marginBottom: '12px' }}>
            <span className="kpi-label">Total Cash In</span>
            <Coins size={20} style={{ color: 'var(--accent-emerald)' }} />
          </div>
          <span className="kpi-value">₹{formatIndianNumber(totalReceived)}</span>
          <span className="kpi-desc">Payments received in ledger</span>
        </div>

        {/* Outstanding Balance */}
        <div className={`kpi-card ${outstandingBalance > 0 ? 'outstanding-alert' : ''}`}>
          <div className="flex-between" style={{ marginBottom: '12px' }}>
            <span className="kpi-label">Outstanding Balance</span>
            <AlertCircle size={20} style={{ color: outstandingBalance > 0 ? 'var(--accent-rose)' : 'var(--text-muted)' }} />
          </div>
          <span className="kpi-value">₹{formatIndianNumber(outstandingBalance)}</span>
          <span className="kpi-desc">Unpaid receivables amount</span>
        </div>

        {/* Total Invoices Count */}
        <div className="kpi-card">
          <div className="flex-between" style={{ marginBottom: '12px' }}>
            <span className="kpi-label">Total Invoices</span>
            <TrendingUp size={20} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <span className="kpi-value">{invoicesCount}</span>
          <span className="kpi-desc">Bills recorded locally</span>
        </div>
      </div>

      {/* Invoices List Grid */}
      <div className="glass-panel">
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px' }}>Recent Sales Invoices</h2>
          <Link href="/invoices/new" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
            + Create Invoice
          </Link>
        </div>

        {invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No invoices created yet. Visit Settings to load demo data or create a new invoice.
          </div>
        ) : (
          <div className="custom-table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Invoice ID / Name</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th style={{ textAlign: 'right' }}>Grand Total</th>
                  <th style={{ textAlign: 'center' }}>Sync Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{inv.name || inv.id}</span>
                      {inv.name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Local ID: {inv.id}</div>}
                    </td>
                    <td>{inv.posting_date}</td>
                    <td>{inv.customer_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{formatIndianNumber(inv.grand_total)}</td>
                    <td style={{ textAlign: 'center' }}>{getStatusBadge(inv)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        <Link href={`/invoices/${inv.id}`} className="btn btn-secondary" style={{ padding: '6px 10px' }} title="View Details">
                          <Eye size={14} />
                        </Link>
                        {!inv.is_settled && (
                          <>
                            <Link href={`/invoices/${inv.id}/edit`} className="btn btn-secondary" style={{ padding: '6px 10px' }} title="Edit Invoice">
                              <Edit size={14} />
                            </Link>
                            <button
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setIsMarkPaidOpen(true);
                              }}
                              className="btn btn-primary"
                              style={{ padding: '6px 10px', backgroundColor: 'var(--accent-emerald)', borderColor: 'var(--accent-emerald)' }}
                              title="Mark as Paid"
                            >
                              <CheckCircle size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Terminal Sync Logger */}
      <div className="console-panel">
        <div className="console-header" onClick={() => setIsConsoleOpen(!isConsoleOpen)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <Terminal size={16} />
            Background Sync Logs Dashboard
          </span>
          {isConsoleOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        {isConsoleOpen && (
          <div className="console-body">
            {syncLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>[System Idle] Waiting for background sync operations...</div>
            ) : (
              syncLogs.map((log, index) => (
                <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
                  {log}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {selectedInvoice && (
        <MarkPaidModal
          isOpen={isMarkPaidOpen}
          onClose={() => {
            setIsMarkPaidOpen(false);
            setSelectedInvoice(null);
          }}
          invoiceId={selectedInvoice.id}
          customerName={selectedInvoice.customer_name}
          grandTotal={selectedInvoice.grand_total}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
