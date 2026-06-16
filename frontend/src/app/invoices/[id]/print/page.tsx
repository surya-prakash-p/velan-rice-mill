'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getInvoices, formatIndianNumber, SalesInvoice } from '@/services/api';
import { ArrowLeft, Printer } from 'lucide-react';

export default function PrintInvoicePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);

  useEffect(() => {
    const invoices = getInvoices();
    const inv = invoices.find((i) => i.id === params.id);
    if (inv) {
      setInvoice(inv);
    }
  }, [params.id]);

  // Auto trigger browser print dialogue on load after data is loaded
  useEffect(() => {
    if (invoice) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [invoice]);

  if (!invoice) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading invoice...</div>;
  }

  return (
    <div style={{ backgroundColor: '#fff', color: '#000', minHeight: '100vh', padding: '20px' }}>
      {/* Back & Print Controls (Hidden on actual print) */}
      <div className="no-print" style={{ display: 'flex', gap: '16px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #ddd' }}>
        <button
          onClick={() => router.push(`/invoices/${invoice.id}`)}
          className="btn btn-secondary"
          style={{ backgroundColor: '#f3f4f6', color: '#1f2937', borderColor: '#d1d5db' }}
        >
          <ArrowLeft size={16} /> Back to Details
        </button>
        <button
          onClick={() => window.print()}
          className="btn btn-primary"
          style={{ backgroundColor: '#2563eb', color: '#fff' }}
        >
          <Printer size={16} /> Print Document
        </button>
      </div>

      {/* Actual Printable Area */}
      <div style={{ maxWidth: '800px', margin: '0 auto', fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: 1.5 }}>
        
        {/* Invoice Header */}
        <table style={{ width: '100%', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '20px' }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: 'top' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, textTransform: 'uppercase', color: '#000' }}>
                  P.K. Palayam Rice Mill
                </h1>
                <p style={{ margin: '4px 0 0 0', color: '#444', fontSize: '11px' }}>
                  P.K. Palayam, Tamil Nadu, India<br />
                  Phone: +91 98765 43210 | Email: contact@pkprmill.com
                </p>
              </td>
              <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#000' }}>
                  SALES INVOICE
                </h2>
                <div style={{ marginTop: '8px', fontSize: '12px' }}>
                  <strong>Invoice No:</strong> {invoice.name || invoice.id}<br />
                  <strong>Date:</strong> {invoice.posting_date}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Customer & Payment Meta */}
        <table style={{ width: '100%', marginBottom: '25px', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', padding: '8px', border: '1px solid #ddd', verticalAlign: 'top' }}>
                <div style={{ textTransform: 'uppercase', fontSize: '10px', color: '#666', fontWeight: 700, marginBottom: '4px' }}>
                  Billed To
                </div>
                <strong>{invoice.customer_name}</strong>
                <p style={{ margin: '4px 0 0 0', color: '#555' }}>
                  Tamil Nadu, India
                </p>
              </td>
              <td style={{ width: '50%', padding: '8px', border: '1px solid #ddd', verticalAlign: 'top' }}>
                <div style={{ textTransform: 'uppercase', fontSize: '10px', color: '#666', fontWeight: 700, marginBottom: '4px' }}>
                  Reference Details
                </div>
                <table style={{ width: '100%', fontSize: '12px' }}>
                  <tbody>
                    <tr>
                      <td style={{ color: '#666', width: '40%' }}>Due Date:</td>
                      <td>{invoice.posting_date}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#666' }}>Settlement:</td>
                      <td>{invoice.is_settled ? 'Cash / Fully Settled' : 'Credit / Pending'}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #000', width: '5%' }}>#</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #000', width: '40%' }}>Item & Calculation</th>
              <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #000', width: '10%' }}>Bags</th>
              <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #000', width: '15%' }}>Bag Wt (Kg)</th>
              <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #000', width: '15%' }}>Qty (Kg)</th>
              <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #000', width: '15%' }}>Rate (₹)</th>
              <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #000', width: '15%' }}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px' }}>{index + 1}</td>
                <td style={{ padding: '8px' }}>
                  <strong>{item.item_code}</strong>
                  {item.description && (
                    <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                      {item.description}
                    </div>
                  )}
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{item.custom_bags}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatIndianNumber(item.custom_bag_weight, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatIndianNumber(item.qty, 0)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatIndianNumber(item.rate, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{formatIndianNumber(item.amount, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pricing Summary */}
        <table style={{ width: '100%', marginTop: '20px' }}>
          <tbody>
            <tr>
              <td style={{ width: '55%', verticalAlign: 'top', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Amount in Words
                </div>
                <div style={{ fontStyle: 'italic', fontSize: '12px', color: '#222' }}>
                  {invoice.in_words}
                </div>
              </td>
              <td style={{ width: '45%', verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '4px 8px', color: '#555' }}>Subtotal:</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>₹{formatIndianNumber(invoice.items.reduce((s, r) => s + r.amount, 0), 2)}</td>
                    </tr>
                    {invoice.discount_amount > 0 && (
                      <tr>
                        <td style={{ padding: '4px 8px', color: '#c2410c' }}>Discount:</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#c2410c' }}>-₹{formatIndianNumber(invoice.discount_amount, 2)}</td>
                      </tr>
                    )}
                    {invoice.tax_rate > 0 && (
                      <tr>
                        <td style={{ padding: '4px 8px', color: '#555' }}>GST Tax ({invoice.tax_rate}%):</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>₹{formatIndianNumber(invoice.taxes_and_charges, 2)}</td>
                      </tr>
                    )}
                    <tr style={{ borderTop: '1px solid #000', fontWeight: 700 }}>
                      <td style={{ padding: '8px', fontSize: '14px' }}>Grand Total:</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '14px' }}>₹{formatIndianNumber(invoice.grand_total, 2)}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Print Terms & Signatures */}
        <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ width: '50%', fontSize: '10px', color: '#555' }}>
            <strong>Terms & Conditions:</strong><br />
            1. Goods once sold will not be taken back.<br />
            2. Any disputes are subject to local jurisdiction.<br />
            3. This is a computer generated invoice.
          </div>
          <div style={{ width: '200px', borderTop: '1px solid #000', textAlign: 'center', paddingTop: '6px', fontSize: '11px' }}>
            For P.K. Palayam Rice Mill<br /><br /><br /><br />
            Authorized Signatory
          </div>
        </div>

      </div>
    </div>
  );
}
