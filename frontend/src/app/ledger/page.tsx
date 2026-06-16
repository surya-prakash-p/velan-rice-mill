'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getInvoices, getPayments, fetchCustomers, formatIndianNumber, Customer, addPayment, SalesInvoice, PaymentEntry } from '@/services/api';
import { Receipt, Filter, Eye, Edit, CheckCircle, Save, X } from 'lucide-react';
import { useSync } from '@/context/SyncContext';
import MarkPaidModal from '@/app/components/MarkPaidModal';

type LedgerTab = 'cash_book' | 'sales_register' | 'customer_ledger';

interface LedgerRow {
  date: string;
  id: string;
  name?: string;
  type: string;
  party: string;
  reference: string;
  category: string;
  inflow: number;  // Cash In / Debit
  outflow: number; // Cash Out / Credit
  balance: number;
  is_settled?: boolean;
}

export default function LedgerPage() {
  const { addLogMessage, triggerSync } = useSync();
  const [activeTab, setActiveTab] = useState<LedgerTab>('cash_book');
  
  // Filters state
  const [selectedParty, setSelectedParty] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Master lists
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);

  // Modal states
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Expense Form states
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseCategory, setExpenseCategory] = useState('Labor Wages');
  const [expenseParty, setExpenseParty] = useState('');
  const [expensePaymentMode, setExpensePaymentMode] = useState<'Cash' | 'GPay / UPI' | 'Bank Transfer / RTGS' | 'Cheque'>('Cash');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseRef, setExpenseRef] = useState('');

  // Categories list
  const categoriesList = ['Rice Sales', 'Labor Wages', 'Husk Sales', 'Electricity', 'Fuel', 'Other'];

  const loadMasterData = async () => {
    const custs = await fetchCustomers(null);
    setCustomersList(custs);
  };

  const handleRecordExpense = (e: React.FormEvent) => {
    e.preventDefault();

    if (expenseAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    if (!expenseParty.trim()) {
      alert('Please enter a supplier or recipient party.');
      return;
    }

    let refStr = expenseRef.trim();
    if (!refStr) {
      refStr = `${expensePaymentMode.toLowerCase()}-payment`;
    }

    const localPmtId = `L-PMT-${Date.now()}`;
    const newExpensePayment: PaymentEntry = {
      id: localPmtId,
      posting_date: expenseDate,
      payment_type: 'Pay',
      party_name: expenseParty.trim(),
      amount: expenseAmount,
      reference_no: refStr,
      custom_category: expenseCategory,
      sync_status: 'pending',
    };

    addPayment(newExpensePayment);
    addLogMessage(`Recorded Expense of ₹${formatIndianNumber(expenseAmount)} for ${expenseCategory} to ${expenseParty}.`);

    // Reset states and close modal
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setExpenseCategory('Labor Wages');
    setExpenseParty('');
    setExpensePaymentMode('Cash');
    setExpenseAmount(0);
    setExpenseRef('');
    setIsExpenseModalOpen(false);

    // Reload ledger
    computeLedger();

    // Trigger background sync
    triggerSync();
  };

  const computeLedger = () => {
    const invoices = getInvoices();
    const payments = getPayments();

    let rawRows: {
      date: string;
      id: string;
      name?: string;
      type: string;
      party: string;
      reference: string;
      category: string;
      inflow: number;
      outflow: number;
      is_settled?: boolean;
    }[] = [];

    if (activeTab === 'cash_book') {
      // Cash Book lists cash movements (Payment Entries)
      rawRows = payments.map((pmt) => ({
        date: pmt.posting_date,
        id: pmt.id,
        name: pmt.name,
        type: pmt.payment_type === 'Receive' ? 'Receipt' : 'Payment',
        party: pmt.party_name,
        reference: pmt.reference_no,
        category: pmt.custom_category,
        inflow: pmt.payment_type === 'Receive' ? pmt.amount : 0,
        outflow: pmt.payment_type === 'Pay' ? pmt.amount : 0,
        is_settled: true,
      }));
    } else if (activeTab === 'sales_register') {
      // Sales Register lists bills generated
      rawRows = invoices.map((inv) => ({
        date: inv.posting_date,
        id: inv.id,
        name: inv.name,
        type: 'Invoice',
        party: inv.customer_name,
        reference: inv.is_settled ? 'Settled (Cash)' : 'Credit',
        category: 'Rice Sales',
        inflow: inv.grand_total,
        outflow: 0,
        is_settled: inv.is_settled,
      }));
    } else if (activeTab === 'customer_ledger') {
      // Customer Ledger lists Invoices (Debits) vs Payments (Credits)
      const invRows = invoices.map((inv) => ({
        date: inv.posting_date,
        id: inv.id,
        name: inv.name,
        type: 'Invoice',
        party: inv.customer_name,
        reference: inv.is_settled ? 'Auto-Settled' : 'Credit Bill',
        category: 'Rice Sales',
        inflow: inv.grand_total, // Sales Invoice increases customer debt
        outflow: 0,
        is_settled: inv.is_settled,
      }));

      // Payments from customers decrease customer debt
      const pmtRows = payments
        .filter((p) => p.payment_type === 'Receive')
        .map((pmt) => ({
          date: pmt.posting_date,
          id: pmt.id,
          name: pmt.name,
          type: 'Receipt',
          party: pmt.party_name,
          reference: pmt.reference_no,
          category: pmt.custom_category,
          inflow: 0,
          outflow: pmt.amount, // Payments received decrease outstanding debt
          is_settled: true,
        }));

      rawRows = [...invRows, ...pmtRows];
    }

    // Apply Filter Criteria
    const filtered = rawRows.filter((row) => {
      // Party filter
      if (selectedParty && row.party !== selectedParty) return false;

      // Category filter
      if (selectedCategory && row.category !== selectedCategory) return false;

      // Date range filter
      if (startDate && row.date < startDate) return false;
      if (endDate && row.date > endDate) return false;

      return true;
    });

    // Sort chronologically ascending to compute correct running balance
    filtered.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.id.localeCompare(b.id);
    });

    // Compute Running Balance
    let currentBalance = 0;
    const computed = filtered.map((row) => {
      currentBalance = currentBalance + row.inflow - row.outflow;
      return {
        ...row,
        balance: currentBalance,
      };
    });

    // Reverse list so that the most recent entries are displayed first
    setLedgerRows(computed.reverse());
  };

  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    computeLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedParty, selectedCategory, startDate, endDate]);

  const clearFilters = () => {
    setSelectedParty('');
    setSelectedCategory('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div>
      {/* Top Banner */}
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Combined Accounting Ledger</h1>
          <p style={{ color: 'var(--text-secondary)' }}>View cash transactions, outstanding debts, and sales logs</p>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => { setActiveTab('cash_book'); clearFilters(); }}
            className={`btn ${activeTab === 'cash_book' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Receipt size={16} />
            <span>Cash Book Ledger</span>
          </button>

          <button
            onClick={() => { setActiveTab('sales_register'); clearFilters(); }}
            className={`btn ${activeTab === 'sales_register' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Receipt size={16} />
            <span>Sales Register</span>
          </button>

          <button
            onClick={() => { setActiveTab('customer_ledger'); clearFilters(); }}
            className={`btn ${activeTab === 'customer_ledger' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Receipt size={16} />
            <span>Customer Outstanding Ledger</span>
          </button>
        </div>

        {activeTab === 'cash_book' && (
          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="btn btn-primary"
            style={{ backgroundColor: 'var(--accent-rose)', borderColor: 'var(--accent-rose)' }}
          >
            <span>+ Record Expense</span>
          </button>
        )}
      </div>

      {/* Filters Form Panel */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          <Filter size={16} />
          Filter Parameters
        </div>

        <div className="grid-4">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '11px' }}>Party Name</label>
            <select
              className="form-control"
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
            >
              <option value="">-- All Parties --</option>
              {customersList.map((c, i) => (
                <option key={i} value={c.customer_name}>{c.customer_name}</option>
              ))}
            </select>
          </div>

          {activeTab === 'cash_book' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '11px' }}>Category</label>
              <select
                className="form-control"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">-- All Categories --</option>
                {categoriesList.map((c, i) => (
                  <option key={i} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '11px' }}>Start Date</label>
            <input
              type="date"
              className="form-control"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '11px' }}>End Date</label>
            <input
              type="date"
              className="form-control"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {(selectedParty || selectedCategory || startDate || endDate) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button onClick={clearFilters} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Ledger Table Panel */}
      <div className="glass-panel">
        <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>
          {activeTab === 'cash_book' && 'Cash & Bank Book'}
          {activeTab === 'sales_register' && 'Sales Register Book'}
          {activeTab === 'customer_ledger' && 'Customer Receivables Statement'}
        </h2>

        {ledgerRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No matching ledger transactions found for the selected filter criteria.
          </div>
        ) : (
          <div className="custom-table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>ID / Reference</th>
                  <th>Type</th>
                  <th>Party Name</th>
                  {activeTab === 'cash_book' && <th>Category</th>}
                  <th style={{ textAlign: 'right' }}>
                    {activeTab === 'customer_ledger' ? 'Debit (₹)' : 'Inflow (₹)'}
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    {activeTab === 'customer_ledger' ? 'Credit (₹)' : 'Outflow (₹)'}
                  </th>
                  <th style={{ textAlign: 'right' }}>Running Balance (₹)</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{row.name || row.id}</span>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ref: {row.reference}</div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          row.type === 'Invoice'
                            ? (row.is_settled ? 'badge-completed' : 'badge-unpaid')
                            : row.type === 'Receipt' || row.type === 'Payment'
                            ? 'badge-completed'
                            : 'badge-error'
                        }`}
                      >
                        {row.type}
                        {row.type === 'Invoice' && (row.is_settled ? ' (Paid)' : ' (Credit)')}
                      </span>
                    </td>
                    <td>{row.party}</td>
                    {activeTab === 'cash_book' && <td>{row.category}</td>}
                    <td style={{ textAlign: 'right', fontWeight: 600 }} className={row.inflow > 0 ? 'balance-positive' : ''}>
                      {row.inflow > 0 ? `+₹${formatIndianNumber(row.inflow)}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }} className={row.outflow > 0 ? 'balance-negative' : ''}>
                      {row.outflow > 0 ? `-₹${formatIndianNumber(row.outflow)}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      ₹{formatIndianNumber(row.balance)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.type === 'Invoice' ? (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <Link href={`/invoices/${row.id}`} className="btn btn-secondary" style={{ padding: '6px 10px' }} title="View Details">
                            <Eye size={14} />
                          </Link>
                          {!row.is_settled && (
                            <>
                              <Link href={`/invoices/${row.id}/edit`} className="btn btn-secondary" style={{ padding: '6px 10px' }} title="Edit Invoice">
                                <Edit size={14} />
                              </Link>
                              <button
                                onClick={() => {
                                  setSelectedInvoice({
                                    id: row.id,
                                    customer_name: row.party,
                                    grand_total: row.inflow,
                                  } as any);
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
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* --- RECORD EXPENSE MODAL --- */}
      {isExpenseModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-container" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Record Expense</h3>
              <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="modal-close">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleRecordExpense}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Posting Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Expense Category</label>
                  <select
                    className="form-control"
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    required
                  >
                    <option value="Labor Wages">Labor Wages</option>
                    <option value="Electricity">Electricity</option>
                    <option value="Fuel">Fuel</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Party / Paid To</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Wages Account, TNEB Power, Fuel Station"
                  value={expenseParty}
                  onChange={(e) => setExpenseParty(e.target.value)}
                  required
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select
                    className="form-control"
                    value={expensePaymentMode}
                    onChange={(e) => setExpensePaymentMode(e.target.value as any)}
                    required
                  >
                    <option value="Cash">Cash</option>
                    <option value="GPay / UPI">GPay / UPI</option>
                    <option value="Bank Transfer / RTGS">Bank Transfer / RTGS</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    className="form-control"
                    placeholder="0.00"
                    value={expenseAmount || ''}
                    onChange={(e) => setExpenseAmount(parseFloat(e.target.value) || 0)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Reference No / Notes</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. txn ref, cheque no, labor name"
                  value={expenseRef}
                  onChange={(e) => setExpenseRef(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setIsExpenseModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, backgroundColor: 'var(--accent-rose)', borderColor: 'var(--accent-rose)' }}
                >
                  <Save size={16} /> Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          onSuccess={computeLedger}
        />
      )}
    </div>
  );
}
