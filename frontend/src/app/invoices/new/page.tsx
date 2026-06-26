'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSync } from '@/context/SyncContext';
import {
  getSettings,
  fetchCustomers,
  fetchItems,
  addInvoice,
  addPayment,
  numberToIndianWords,
  formatIndianNumber,
  Customer,
  Item,
  SalesInvoice,
  InvoiceItem,
  PaymentEntry,
  fetchWarehouses,
  getStockQty,
  Warehouse,
} from '@/services/api';
import { Trash2, Plus, UserPlus, Save, X, PlusCircle } from 'lucide-react';

export default function NewInvoicePage() {
  const router = useRouter();
  const { addLogMessage } = useSync();

  // Master Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [itemsList, setItemsList] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Form Fields
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { item_code: '', custom_bags: 0, custom_bag_weight: 75, qty: 0, rate: 0, amount: 0, description: '' }
  ]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(5); // default 5% GST
  const [isSettled, setIsSettled] = useState(true); // default marked settled

  // Payment Mode details states
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'GPay / UPI' | 'Bank Transfer / RTGS' | 'Cheque'>('Cash');
  const [upiId, setUpiId] = useState('');
  const [refNo, setRefNo] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');

  // Modals Visibility
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);

  // New Customer Fields
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<'Company' | 'Individual'>('Individual');
  const [newCustomerMobile, setNewCustomerMobile] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerCity, setNewCustomerCity] = useState('');

  // New Item Fields
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemGroup, setNewItemGroup] = useState('Products');
  const [newItemRate, setNewItemRate] = useState(0);

  // Load Customers & Items
  const loadMasterData = async () => {
    const settings = getSettings();
    const custs = await fetchCustomers(settings);
    const itms = await fetchItems(settings);
    const whs = await fetchWarehouses(settings);
    setCustomers(custs);
    setItemsList(itms);
    setWarehouses(whs);

    if (settings && settings.defaultWarehouse) {
      setSelectedWarehouse(settings.defaultWarehouse);
    } else if (whs.length > 0) {
      setSelectedWarehouse(whs[0].name);
    }
  };

  useEffect(() => {
    loadMasterData();
  }, []);

  // Handle Item Row Changes
  const handleItemRowChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const updatedRows = [...invoiceItems];
    const row = updatedRows[index];

    if (field === 'item_code') {
      row.item_code = value as string;
      // Auto-populate default rate from item master
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

    // Recalculate Qty = Bags * Weight
    row.qty = row.custom_bags * row.custom_bag_weight;
    
    // Recalculate Amount = Qty * Rate
    row.amount = row.qty * row.rate;

    // Compute description representation: "[Item Code] = [Qty formatted] x [Rate formatted]"
    if (row.item_code && row.qty) {
      const formattedQty = formatIndianNumber(row.qty, 0);
      const formattedRate = formatIndianNumber(row.rate, 2);
      row.description = `${row.item_code} = ${formattedQty} x ${formattedRate}`;
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
    if (invoiceItems.length === 1) return; // keep at least one row
    setInvoiceItems(invoiceItems.filter((_, idx) => idx !== index));
  };

  // Math Computations
  const subtotalBeforeDiscount = invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  const subtotal = Math.max(0, subtotalBeforeDiscount - discountAmount);
  const taxesAndCharges = subtotal * (taxRate / 100);
  const grandTotal = subtotal + taxesAndCharges;
  const inWords = numberToIndianWords(grandTotal);

  // Submit Invoice Handler
  const handleSaveInvoice = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      alert('Please select a customer.');
      return;
    }

    // Validate rows
    const invalidRow = invoiceItems.some(item => !item.item_code || item.qty <= 0 || item.rate <= 0);
    if (invalidRow) {
      alert('Please check item selections. Quantities (Bags * Weight) and Rate must be greater than zero.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  const handleFinalSave = () => {
    const localInvId = `L-INV-${Date.now()}`;
    
    // Create Invoice Doc
    const newInvoice: SalesInvoice = {
      id: localInvId,
      posting_date: postingDate,
      customer_name: selectedCustomer,
      items: invoiceItems,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      subtotal,
      taxes_and_charges: taxesAndCharges,
      grand_total: grandTotal,
      in_words: inWords,
      is_settled: isSettled,
      warehouse: selectedWarehouse || undefined,
      payment_mode: isSettled ? paymentMode : undefined,
      upi_id: isSettled && paymentMode === 'GPay / UPI' ? upiId : undefined,
      ref_no: isSettled && paymentMode === 'Bank Transfer / RTGS' ? refNo : undefined,
      cheque_no: isSettled && paymentMode === 'Cheque' ? chequeNo : undefined,
      bank_name: isSettled && paymentMode === 'Cheque' ? bankName : undefined,
      sync_status: 'pending',
    };

    // Add Invoice locally
    addInvoice(newInvoice);
    addLogMessage(`Invoice ${localInvId} created locally for ${selectedCustomer}.`);

    // If fully settled, generate corresponding Cash/Bank payment receipt
    if (isSettled) {
      let paymentRef = `cash-${localInvId}`;
      if (paymentMode === 'GPay / UPI') {
        paymentRef = `online-upi-${upiId || 'unspecified'}`;
      } else if (paymentMode === 'Bank Transfer / RTGS') {
        paymentRef = `rtgs-${refNo || 'unspecified'}`;
      } else if (paymentMode === 'Cheque') {
        paymentRef = `cheque-${chequeNo || 'unspecified'}${bankName ? ` (${bankName})` : ''}`;
      }

      const localPmtId = `L-PMT-${Date.now()}`;
      const newPayment: PaymentEntry = {
        id: localPmtId,
        posting_date: postingDate,
        payment_type: 'Receive',
        party_name: selectedCustomer,
        amount: grandTotal,
        reference_no: paymentRef,
        custom_category: 'Rice Sales',
        linked_invoice_id: localInvId,
        sync_status: 'pending',
      };
      
      addPayment(newPayment);
      addLogMessage(`Payment Entry ${localPmtId} (₹${formatIndianNumber(grandTotal)}) [Mode: ${paymentMode}] generated automatically for Invoice ${localInvId}.`);
    }

    setIsConfirmModalOpen(false);
    // Redirect to dashboard
    router.push('/');
  };

  // Add Customer Modal Handler
  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName) return;

    const newCust: Customer = {
      customer_name: newCustomerName,
      customer_type: newCustomerType,
      mobile_no: newCustomerMobile || undefined,
      email_id: newCustomerEmail || undefined,
      city: newCustomerCity || undefined,
    };

    // Read existing cache, append, and save
    const cached = localStorage.getItem('cached_customers');
    const custs = cached ? JSON.parse(cached) : [];
    custs.unshift(newCust);
    localStorage.setItem('cached_customers', JSON.stringify(custs));
    
    // Refresh select list & auto-select
    setCustomers(custs);
    setSelectedCustomer(newCustomerName);
    
    // Reset inputs & close modal
    setNewCustomerName('');
    setNewCustomerType('Individual');
    setNewCustomerMobile('');
    setNewCustomerEmail('');
    setNewCustomerCity('');
    setIsCustomerModalOpen(false);

    addLogMessage(`Added Customer '${newCustomerName}' locally to cache.`);
  };

  // Add Item Modal Handler
  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemCode || !newItemName || newItemRate <= 0) return;

    const newItem: Item = {
      item_code: newItemCode,
      item_name: newItemName,
      item_group: newItemGroup,
      stock_uom: 'Kg',
      valuation_rate: newItemRate,
    };

    // Save item cache
    const cached = localStorage.getItem('cached_items');
    const itms = cached ? JSON.parse(cached) : [];
    itms.unshift(newItem);
    localStorage.setItem('cached_items', JSON.stringify(itms));

    // Refresh items select options
    setItemsList(itms);

    // Reset inputs & close modal
    setNewItemCode('');
    setNewItemName('');
    setNewItemGroup('Products');
    setNewItemRate(0);
    setIsItemModalOpen(false);

    addLogMessage(`Added Item '${newItemCode}' locally to cache.`);
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Create Sales Invoice</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Record a physical rice mill sale ledger transaction</p>
        </div>
      </div>

      <form onSubmit={handleSaveInvoice}>
        {/* Billing Metadata */}
        <div className="glass-panel">
          <div className="grid-4">
            <div className="form-group">
              <label className="form-label">Posting Date</label>
              <input
                type="date"
                className="form-control"
                value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Select Customer
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '11px' }}
                >
                  <UserPlus size={12} /> New Customer
                </button>
              </label>
              <select
                className="form-control"
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                required
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

        {/* Dynamic Items Table */}
        <div className="glass-panel">
          <div className="flex-between" style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>Line Items Ledger</h2>
            <button
              type="button"
              onClick={() => setIsItemModalOpen(true)}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              <PlusCircle size={14} /> Add New Item Code
            </button>
          </div>

          <div className="custom-table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Item Code</th>
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
                        const isLow = row.qty > stockVal;
                        return (
                          <div style={{ fontSize: '11px', color: isLow ? 'var(--accent-rose)' : 'var(--accent-emerald)', marginTop: '2px', fontWeight: 600 }}>
                            Stock ({selectedWarehouse.split(' - ')[0]}): {formatIndianNumber(stockVal, 0)} Kg {isLow ? ' (Insufficient Stock!)' : ''}
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
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      ₹{formatIndianNumber(row.amount)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        disabled={invoiceItems.length === 1}
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

          <button
            type="button"
            onClick={addItemRow}
            className="btn btn-secondary"
            style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> Add Another Row
          </button>
        </div>

        {/* Calculation Summary Footer */}
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
              onClick={() => router.push('/')}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Save size={16} />
              Save Invoice Ledger
            </button>
          </div>
        </div>
      </form>

      {/* --- QUICK CUSTOMER ADD MODAL --- */}
      {isCustomerModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Create New Customer Account</h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="modal-close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateCustomer}>
              <div className="form-group">
                <label className="form-label">Customer Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Sri Venkateshwara Traders"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  required
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Customer Type</label>
                  <select
                    className="form-control"
                    value={newCustomerType}
                    onChange={(e) => setNewCustomerType(e.target.value as 'Company' | 'Individual')}
                  >
                    <option value="Individual">Individual</option>
                    <option value="Company">Company</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Coimbatore"
                    value={newCustomerCity}
                    onChange={(e) => setNewCustomerCity(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. 9876543210"
                  value={newCustomerMobile}
                  onChange={(e) => setNewCustomerMobile(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email ID</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="e.g. contact@domain.com"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                Create Customer Account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- QUICK ITEM ADD MODAL --- */}
      {isItemModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Create New Item Stock</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="modal-close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateItem}>
              <div className="form-group">
                <label className="form-label">Item Code (Short Code)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. IR 64"
                  value={newItemCode}
                  onChange={(e) => setNewItemCode(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Item Name (Full Description)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. IR 64 Rice"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  required
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Item Group</label>
                  <select
                    className="form-control"
                    value={newItemGroup}
                    onChange={(e) => setNewItemGroup(e.target.value)}
                  >
                    <option value="Products">Products</option>
                    <option value="Byproducts">Byproducts</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Valuation Rate (₹/Kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-control"
                    placeholder="e.g. 24.50"
                    value={newItemRate || ''}
                    onChange={(e) => setNewItemRate(parseFloat(e.target.value) || 0)}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                Create Item Stock
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- INVOICE SETTLEMENT CONFIRMATION MODAL --- */}
      {isConfirmModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Confirm Invoice Settlement</h3>
              <button type="button" onClick={() => setIsConfirmModalOpen(false)} className="modal-close">
                <X size={18} />
              </button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                Please confirm the payment status for this invoice before saving to the ledger.
              </p>
              
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px dashed var(--border-glass)', marginBottom: '20px' }}>
                <div className="flex-between" style={{ marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Customer:</span>
                  <span style={{ fontWeight: 700 }}>{selectedCustomer}</span>
                </div>
                <div className="flex-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Grand Total:</span>
                  <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--accent-emerald)' }}>
                    ₹{formatIndianNumber(grandTotal)}
                  </span>
                </div>
              </div>

              {/* Settlement Choice */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>Is this invoice paid?</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                  <button
                    type="button"
                    className={`btn ${!isSettled ? 'btn-danger' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '10px' }}
                    onClick={() => setIsSettled(false)}
                  >
                    No, Unpaid (Credit)
                  </button>
                  <button
                    type="button"
                    className={`btn ${isSettled ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '10px' }}
                    onClick={() => setIsSettled(true)}
                  >
                    Yes, Paid (Settled)
                  </button>
                </div>
              </div>

              {/* Conditional Payment Mode Details */}
              {isSettled && (
                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
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

                  {paymentMode === 'GPay / UPI' && (
                    <div className="form-group">
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
                    <div className="form-group">
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
                    <>
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
                      <div className="form-group" style={{ marginTop: '12px' }}>
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
                    </>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setIsConfirmModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleFinalSave}
              >
                <Save size={16} /> Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
