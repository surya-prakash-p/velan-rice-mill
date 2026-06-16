'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSync } from '@/context/SyncContext';
import {
  getSettings,
  getInvoices,
  updateInvoice,
  fetchCustomers,
  fetchItems,
  numberToIndianWords,
  formatIndianNumber,
  Customer,
  Item,
  SalesInvoice,
  InvoiceItem,
  fetchWarehouses,
  getStockQty,
  Warehouse,
} from '@/services/api';
import { Trash2, Plus, Save, ArrowLeft, AlertTriangle } from 'lucide-react';

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { addLogMessage } = useSync();

  // Invoice State
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);

  // Master Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [itemsList, setItemsList] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Form Fields
  const [postingDate, setPostingDate] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(5);

  // Loading indicator
  const [loading, setLoading] = useState(true);

  // Load Invoice and Master Data
  useEffect(() => {
    const loadData = async () => {
      try {
        const settings = getSettings();
        const custs = await fetchCustomers(settings);
        const itms = await fetchItems(settings);
        const whs = await fetchWarehouses(settings);

        setCustomers(custs);
        setItemsList(itms);
        setWarehouses(whs);

        const invoices = getInvoices();
        const inv = invoices.find((i) => i.id === params.id);
        if (inv) {
          setInvoice(inv);
          setPostingDate(inv.posting_date);
          setSelectedCustomer(inv.customer_name);
          setSelectedWarehouse(inv.warehouse || '');
          setInvoiceItems(inv.items);
          setDiscountAmount(inv.discount_amount);
          setTaxRate(inv.tax_rate);
        }
      } catch (err) {
        console.error('Error loading edit data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [params.id]);

  // Handle Item Row Changes
  const handleItemRowChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const updatedRows = [...invoiceItems];
    const row = updatedRows[index];

    if (field === 'item_code') {
      row.item_code = value as string;
      const matched = itemsList.find(i => i.item_code === (value as string));
      if (matched) {
        row.rate = matched.valuation_rate || 0;
      }
    } else if (field === 'custom_bags') {
      row.custom_bags = parseInt(value.toString(), 10) || 0;
    } else if (field === 'custom_bag_weight') {
      row.custom_bag_weight = parseFloat(value.toString()) || 0;
    } else if (field === 'rate') {
      row.rate = parseFloat(value.toString()) || 0;
    }

    row.qty = row.custom_bags * row.custom_bag_weight;
    row.amount = row.qty * row.rate;

    if (row.item_code && row.qty) {
      row.description = `${row.item_code} = ${formatIndianNumber(row.qty, 0)} x ${formatIndianNumber(row.rate, 2)}`;
    } else {
      row.description = '';
    }

    setInvoiceItems(updatedRows);
  };

  const addItemRow = () => {
    setInvoiceItems([
      ...invoiceItems,
      { item_code: '', custom_bags: 0, custom_bag_weight: 75, qty: 0, rate: 0, amount: 0, description: '' }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (invoiceItems.length === 1) return;
    setInvoiceItems(invoiceItems.filter((_, idx) => idx !== index));
  };

  // Calculations
  const subtotalBeforeDiscount = invoiceItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const subtotal = Math.max(0, subtotalBeforeDiscount - discountAmount);
  const taxesAndCharges = subtotal * (taxRate / 100);
  const grandTotal = subtotal + taxesAndCharges;
  const inWords = numberToIndianWords(grandTotal);

  // Save changes handler
  const handleUpdateInvoice = (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoice) return;

    if (!selectedCustomer) {
      alert('Please select a customer.');
      return;
    }

    const invalidRow = invoiceItems.some(item => !item.item_code || item.qty <= 0 || item.rate <= 0);
    if (invalidRow) {
      alert('Please check item selections. Quantities (Bags * Weight) and Rate must be greater than zero.');
      return;
    }

    // Prepare updated invoice
    const isSynced = invoice.sync_status === 'synced';
    const updatedInvoice: SalesInvoice = {
      ...invoice,
      posting_date: postingDate,
      customer_name: selectedCustomer,
      warehouse: selectedWarehouse || undefined,
      items: invoiceItems,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      subtotal,
      taxes_and_charges: taxesAndCharges,
      grand_total: grandTotal,
      in_words: inWords,
      // If previously failed or pending, keep/set as pending. 
      // If previously synced, we shouldn't modify synced invoices remotely, but if they forced save, we reset to pending to retry.
      sync_status: isSynced ? 'synced' : 'pending', 
      sync_error: isSynced ? invoice.sync_error : undefined,
    };

    updateInvoice(updatedInvoice);
    addLogMessage(`Invoice ${invoice.id} updated locally.`);

    router.push(`/invoices/${invoice.id}`);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}>Loading ledger details...</div>;
  }

  if (!invoice) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <AlertTriangle size={48} className="balance-negative" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Invoice Not Found</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
          The requested invoice to edit does not exist in local cache.
        </p>
        <button onClick={() => router.push('/')} className="btn btn-secondary">
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );
  }

  const isSynced = invoice.sync_status === 'synced';
  const isPaid = invoice.is_settled;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button type="button" onClick={() => router.push(`/invoices/${invoice.id}`)} className="btn btn-secondary" style={{ padding: '8px' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Edit Sales Invoice</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Modify ledger entry for ID: {invoice.id}</p>
          </div>
        </div>
      </div>

      {isSynced && (
        <div style={{ display: 'flex', gap: '12px', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)', marginBottom: '24px' }}>
          <AlertTriangle size={20} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 700, color: 'var(--accent-amber)' }}>Invoice Sync Locked</span>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              This invoice has already been synced to ERPNext as <strong>{invoice.name}</strong>. 
              Items, quantities, and pricing details are locked from editing to prevent remote account mismatch.
            </p>
          </div>
        </div>
      )}

      {isPaid && (
        <div style={{ display: 'flex', gap: '12px', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '24px' }}>
          <AlertTriangle size={20} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>Settled Invoice</span>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              This invoice has already been paid and settled. Editing is allowed but please exercise caution to avoid cash ledger mismatch.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleUpdateInvoice}>
        {/* Billing Metadata */}
        <div className="glass-panel">
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Posting Date</label>
              <input
                type="date"
                className="form-control"
                value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
                required
                disabled={isSynced}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Customer Name</label>
              <select
                className="form-control"
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                required
                disabled={isSynced}
              >
                <option value="">-- Choose Customer --</option>
                {customers.map((c, i) => (
                  <option key={i} value={c.customer_name}>
                    {c.customer_name} {c.city ? `(${c.city})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Deduct Warehouse</label>
              <select
                className="form-control"
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                required
                disabled={isSynced}
              >
                <option value="">-- Choose Warehouse --</option>
                {warehouses.map((w, i) => (
                  <option key={i} value={w.name}>
                    {w.warehouse_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Line Items Ledger</h2>

          <div className="custom-table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Item Code</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Bags</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Bag Wt (Kg)</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Qty (Kg)</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Rate (₹/Kg)</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Amount</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoiceItems.map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        className="form-control"
                        value={row.item_code}
                        onChange={(e) => handleItemRowChange(idx, 'item_code', e.target.value)}
                        required
                        disabled={isSynced}
                      >
                        <option value="">-- Choose Item --</option>
                        {itemsList.map((item, i) => (
                          <option key={i} value={item.item_code}>
                            {item.item_code} - {item.item_name}
                          </option>
                        ))}
                      </select>
                      {row.description && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                          {row.description}
                        </div>
                      )}
                      {row.item_code && selectedWarehouse && (() => {
                        const stockVal = getStockQty(row.item_code, selectedWarehouse);
                        return (
                          <div style={{ fontSize: '11px', color: 'var(--accent-emerald)', marginTop: '2px', fontWeight: 600 }}>
                            Stock ({selectedWarehouse.split(' - ')[0]}): {formatIndianNumber(stockVal, 0)} Kg
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        className="form-control text-right"
                        value={row.custom_bags || ''}
                        onChange={(e) => handleItemRowChange(idx, 'custom_bags', e.target.value)}
                        placeholder="0"
                        required
                        disabled={isSynced}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        className="form-control text-right"
                        value={row.custom_bag_weight || ''}
                        onChange={(e) => handleItemRowChange(idx, 'custom_bag_weight', e.target.value)}
                        placeholder="75.00"
                        required
                        disabled={isSynced}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatIndianNumber(row.qty, 0)}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="form-control text-right"
                        value={row.rate || ''}
                        onChange={(e) => handleItemRowChange(idx, 'rate', e.target.value)}
                        placeholder="0.00"
                        required
                        disabled={isSynced}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      ₹{formatIndianNumber(row.amount)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        disabled={invoiceItems.length === 1 || isSynced}
                        className="btn btn-danger"
                        style={{ padding: '8px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isSynced && (
            <button
              type="button"
              onClick={addItemRow}
              className="btn btn-secondary"
              style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> Add Another Row
            </button>
          )}
        </div>

        {/* Footer Pricing Breakdown */}
        <div className="glass-panel">
          <div className="grid-2">
            <div>
              <div className="form-group">
                <label className="form-label">Amount in words (INR)</label>
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed var(--border-glass)',
                    fontStyle: 'italic',
                    color: 'var(--text-secondary)',
                    minHeight: '80px',
                  }}
                >
                  {inWords}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Discount Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={discountAmount || ''}
                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    disabled={isSynced}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tax Rate (GST %)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={taxRate || ''}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    placeholder="5"
                    disabled={isSynced}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
                <div className="flex-between" style={{ fontSize: '14px' }}>
                  <span>Gross Subtotal:</span>
                  <span>₹{formatIndianNumber(subtotalBeforeDiscount)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex-between" style={{ fontSize: '14px', color: 'var(--accent-rose)' }}>
                    <span>Less Discount:</span>
                    <span>-₹{formatIndianNumber(discountAmount)}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex-between" style={{ fontSize: '14px' }}>
                    <span>GST Tax ({taxRate}%):</span>
                    <span>₹{formatIndianNumber(taxesAndCharges)}</span>
                  </div>
                )}
                <div className="flex-between" style={{ fontSize: '18px', fontWeight: 800, borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                  <span>Grand Total:</span>
                  <span className="balance-positive">₹{formatIndianNumber(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={() => router.push(`/invoices/${invoice.id}`)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSynced}>
              <Save size={16} />
              Save Invoice Ledger
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
