'use client';

import React, { useState } from 'react';
import { markInvoiceAsPaid, formatIndianNumber } from '@/services/api';
import { useSync } from '@/context/SyncContext';
import { X, Save } from 'lucide-react';

interface MarkPaidModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  customerName: string;
  grandTotal: number;
  onSuccess: () => void;
}

export default function MarkPaidModal({
  isOpen,
  onClose,
  invoiceId,
  customerName,
  grandTotal,
  onSuccess,
}: MarkPaidModalProps) {
  const { addLogMessage, triggerSync } = useSync();
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'GPay / UPI' | 'Bank Transfer / RTGS' | 'Cheque'>('Cash');
  const [upiId, setUpiId] = useState('');
  const [refNo, setRefNo] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    markInvoiceAsPaid(invoiceId, {
      posting_date: postingDate,
      payment_mode: paymentMode,
      upi_id: paymentMode === 'GPay / UPI' ? upiId : undefined,
      ref_no: paymentMode === 'Bank Transfer / RTGS' ? refNo : undefined,
      cheque_no: paymentMode === 'Cheque' ? chequeNo : undefined,
      bank_name: paymentMode === 'Cheque' ? bankName : undefined,
    });

    addLogMessage(`Invoice ${invoiceId} marked as PAID. Auto-generated payment receipt.`);
    triggerSync(); // Trigger background sync immediately
    onSuccess();
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-container" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Mark Invoice as Paid</h3>
          <button type="button" onClick={onClose} className="modal-close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Specify the payment details to settle this invoice in the ledger.
            </p>

            <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px dashed var(--border-glass)', marginBottom: '20px' }}>
              <div className="flex-between" style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Invoice ID:</span>
                <span style={{ fontWeight: 600 }}>{invoiceId}</span>
              </div>
              <div className="flex-between" style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Customer:</span>
                <span style={{ fontWeight: 700 }}>{customerName}</span>
              </div>
              <div className="flex-between">
                <span style={{ color: 'var(--text-secondary)' }}>Grand Total:</span>
                <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--accent-emerald)' }}>
                  ₹{formatIndianNumber(grandTotal)}
                </span>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Payment Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={postingDate}
                  onChange={(e) => setPostingDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select
                  className="form-control"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as any)}
                  required
                >
                  <option value="Cash">Cash</option>
                  <option value="GPay / UPI">GPay / UPI</option>
                  <option value="Bank Transfer / RTGS">Bank Transfer / RTGS</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>

            {paymentMode === 'GPay / UPI' && (
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">UPI ID / Mobile Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. 9876543210@paytm"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  required
                />
              </div>
            )}

            {paymentMode === 'Bank Transfer / RTGS' && (
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">RTGS / Bank Transaction Ref</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. UTIB000192837..."
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  required
                />
              </div>
            )}

            {paymentMode === 'Cheque' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Cheque Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 123456"
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Drawn Bank Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. HDFC Bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              <Save size={16} /> Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
