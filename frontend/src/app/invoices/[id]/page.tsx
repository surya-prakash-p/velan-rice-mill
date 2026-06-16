'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getInvoices, formatIndianNumber, SalesInvoice } from '@/services/api';
import { ArrowLeft, Printer, AlertTriangle, CheckCircle, Clock, Edit } from 'lucide-react';
import MarkPaidModal from '@/app/components/MarkPaidModal';

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);

  const loadInvoice = () => {
    const invoices = getInvoices();
    const inv = invoices.find((i) => i.id === params.id);
    if (inv) {
      setInvoice(inv);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [params.id]);

  if (!invoice) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <AlertTriangle size={48} className="balance-negative" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Invoice Not Found</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          The requested invoice transaction ID does not exist in local cache.
        </p>
        <button onClick={() => router.push('/')} className="btn btn-secondary">
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Top Header */}
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => router.push('/')} className="btn btn-secondary" style={{ padding: '8px' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Invoice Details</h1>
            <p style={{ color: 'var(--text-secondary)' }}>ID: {invoice.id}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!invoice.is_settled && (
            <>
              <Link href={`/invoices/${invoice.id}/edit`} className="btn btn-secondary">
                <Edit size={16} />
                <span>Edit Invoice</span>
              </Link>
              <button
                onClick={() => setIsMarkPaidOpen(true)}
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--accent-emerald)', borderColor: 'var(--accent-emerald)' }}
              >
                <CheckCircle size={16} />
                <span>Mark as Paid</span>
              </button>
            </>
          )}
          <Link href={`/invoices/${invoice.id}/print`} className="btn btn-secondary">
            <Printer size={16} />
            <span>Print Invoice</span>
          </Link>
        </div>
      </div>

      <div className="invoice-details-grid">
        {/* Invoice Summary Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Main Info */}
          <div className="glass-panel">
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Transaction Overview</h2>
            
            <div className="grid-2" style={{ marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Customer Name</span>
                <p style={{ fontSize: '16px', fontWeight: 700, marginTop: '4px' }}>{invoice.customer_name}</p>
              </div>
              <div>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Posting Date</span>
                <p style={{ fontSize: '16px', fontWeight: 700, marginTop: '4px' }}>{invoice.posting_date}</p>
              </div>
            </div>

            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Items Details</h3>
            <div className="custom-table-wrapper" style={{ border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'right' }}>Bags</th>
                    <th style={{ textAlign: 'right' }}>Bag Wt (Kg)</th>
                    <th style={{ textAlign: 'right' }}>Qty (Kg)</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{item.item_code}</span>
                        {item.description && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{item.custom_bags}</td>
                      <td style={{ textAlign: 'right' }}>{formatIndianNumber(item.custom_bag_weight, 1)}</td>
                      <td style={{ textAlign: 'right' }}>{formatIndianNumber(item.qty, 0)}</td>
                      <td style={{ textAlign: 'right' }}>₹{formatIndianNumber(item.rate)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{formatIndianNumber(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Amount In Words */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Amount in Words</h3>
            <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{invoice.in_words}</p>
          </div>
        </div>

        {/* Sync Status Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Sync Status Card */}
          <div className="glass-panel">
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>ERPNext Sync</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="flex-between">
                <span style={{ color: 'var(--text-secondary)' }}>Sync Status:</span>
                {invoice.sync_status === 'synced' ? (
                  <span className="badge badge-completed">
                    <CheckCircle size={12} /> Synced
                  </span>
                ) : invoice.sync_status === 'error' ? (
                  <span className="badge badge-error">
                    <AlertTriangle size={12} /> Sync Error
                  </span>
                ) : (
                  <span className="badge badge-pending">
                    <Clock size={12} /> YTS (Queue)
                  </span>
                )}
              </div>

              {invoice.name && (
                <div className="flex-between" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>ERPNext Name:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent-cyan)' }}>
                    {invoice.name}
                  </span>
                </div>
              )}

              {invoice.sync_error && (
                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '12px', color: 'var(--accent-rose)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Error Diagnostics:
                  </span>
                  <div style={{ fontSize: '12px', backgroundColor: 'rgba(244, 63, 94, 0.05)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(244, 63, 94, 0.15)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {invoice.sync_error}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pricing Calculations Breakdown */}
          <div className="glass-panel">
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Ledger Totals</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="flex-between">
                <span style={{ color: 'var(--text-secondary)' }}>Items Amount:</span>
                <span>₹{formatIndianNumber(invoice.items.reduce((s, r) => s + r.amount, 0))}</span>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex-between" style={{ color: 'var(--accent-rose)' }}>
                  <span>Discount:</span>
                  <span>-₹{formatIndianNumber(invoice.discount_amount)}</span>
                </div>
              )}
              <div className="flex-between" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Taxable Subtotal:</span>
                <span>₹{formatIndianNumber(invoice.subtotal)}</span>
              </div>
              <div className="flex-between">
                <span style={{ color: 'var(--text-secondary)' }}>GST Tax ({invoice.tax_rate}%):</span>
                <span>₹{formatIndianNumber(invoice.taxes_and_charges)}</span>
              </div>
              <div className="flex-between" style={{ borderTop: '1.5px solid var(--border-glass)', paddingTop: '8px', fontSize: '16px', fontWeight: 800 }}>
                <span>Grand Total:</span>
                <span className="balance-positive">₹{formatIndianNumber(invoice.grand_total)}</span>
              </div>
              <div className="flex-between" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '8px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fully Settled:</span>
                <span style={{ fontWeight: 600, color: invoice.is_settled ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                  {invoice.is_settled ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {invoice && (
        <MarkPaidModal
          isOpen={isMarkPaidOpen}
          onClose={() => setIsMarkPaidOpen(false)}
          invoiceId={invoice.id}
          customerName={invoice.customer_name}
          grandTotal={invoice.grand_total}
          onSuccess={loadInvoice}
        />
      )}
    </div>
  );
}
