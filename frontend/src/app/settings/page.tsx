'use client';

import React, { useState, useEffect } from 'react';
import { useSync } from '@/context/SyncContext';
import { getSettings, saveSettings, testConnectionAndFetchDefaults, FrappeSettings, fetchWarehouses, fetchAccounts, Warehouse } from '@/services/api';
import { Save, RefreshCw, Trash2, Database, AlertCircle, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const { triggerSync, loadMockDemoData, clearAllCache, isOnline, syncState, addLogMessage } = useSync();

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [companyName, setCompanyName] = useState('P.K. Palayam Rice Mill');
  
  const [defaultWarehouse, setDefaultWarehouse] = useState('');
  const [defaultCashAccount, setDefaultCashAccount] = useState('');
  const [defaultBankAccount, setDefaultBankAccount] = useState('');
  const [resolvedCashAc, setResolvedCashAc] = useState('');
  const [resolvedBankAc, setResolvedBankAc] = useState('');
  const [resolvedReceivableAc, setResolvedReceivableAc] = useState('');
  const [resolvedPayableAc, setResolvedPayableAc] = useState('');
  const [resolvedWarehouse, setResolvedWarehouse] = useState('');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);

  // Load current settings on mount
  useEffect(() => {
    const current = getSettings();
    if (current) {
      setBaseUrl(current.baseUrl);
      setApiKey(current.apiKey);
      setApiSecret(current.apiSecret);
      setCompanyName(current.companyName || 'P.K. Palayam Rice Mill');
      setDefaultWarehouse(current.defaultWarehouse || '');
      setDefaultCashAccount(current.defaultCashAccount || '');
      setDefaultBankAccount(current.defaultBankAccount || '');
      setResolvedCashAc(current.defaultCashAccount || '');
      setResolvedBankAc(current.defaultBankAccount || '');
      setResolvedReceivableAc(current.defaultReceivableAccount || '');
      setResolvedPayableAc(current.defaultPayableAccount || '');
      setResolvedWarehouse(current.defaultWarehouse || '');

      // Fetch warehouses and accounts using current saved settings
      fetchWarehouses(current).then(whs => setWarehouses(whs));
      fetchAccounts(current).then(acs => setAccounts(acs));
    }
  }, []);

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseUrl || !apiKey || !apiSecret) {
      setStatusMessage({ type: 'error', text: 'Base URL, API Key, and API Secret are required.' });
      return;
    }

    setIsTesting(true);
    setStatusMessage({ type: 'info', text: 'Testing connection to ERPNext and resolving accounts...' });

    const rawSettings: FrappeSettings = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      companyName: companyName.trim(),
      defaultWarehouse: defaultWarehouse.trim(),
      defaultCashAccount: defaultCashAccount.trim(),
      defaultBankAccount: defaultBankAccount.trim(),
    };

    try {
      const fullSettings = await testConnectionAndFetchDefaults(rawSettings);
      
      // Save settings to LocalStorage
      saveSettings(fullSettings);
      
      // Update state
      setResolvedCashAc(fullSettings.defaultCashAccount || '');
      setResolvedBankAc(fullSettings.defaultBankAccount || '');
      setResolvedReceivableAc(fullSettings.defaultReceivableAccount || '');
      setResolvedPayableAc(fullSettings.defaultPayableAccount || '');
      setResolvedWarehouse(fullSettings.defaultWarehouse || '');
      setDefaultWarehouse(fullSettings.defaultWarehouse || '');
      setDefaultCashAccount(fullSettings.defaultCashAccount || '');
      setDefaultBankAccount(fullSettings.defaultBankAccount || '');

      // Load warehouses and accounts dynamically for dropdowns
      const whs = await fetchWarehouses(fullSettings);
      setWarehouses(whs);
      const acs = await fetchAccounts(fullSettings);
      setAccounts(acs);

      setStatusMessage({
        type: 'success',
        text: 'Successfully connected! Saved configuration & mapped company defaults.',
      });
      addLogMessage('SUCCESS: Settings updated. Connection to ERPNext verified.');
      
      // Trigger a sync automatically
      triggerSync();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Please check URL and credentials.';
      console.error('Settings test failed:', err);
      setStatusMessage({
        type: 'error',
        text: `Connection failed: ${errMsg}`,
      });
      addLogMessage(`ERROR verifying settings: ${errMsg}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleLoadDemo = () => {
    if (confirm('Load demo transactions? This will overwrite or append local demo values.')) {
      loadMockDemoData();
      // Reload warehouses and accounts from cache
      fetchWarehouses(null).then(whs => setWarehouses(whs));
      fetchAccounts(null).then(acs => setAccounts(acs));
      setStatusMessage({ type: 'success', text: 'Sample customers, items, invoices, and cash ledger payments loaded.' });
    }
  };

  const handleClearCache = () => {
    if (confirm('Are you sure you want to clear all data and settings? This resets the application.')) {
      clearAllCache();
      setBaseUrl('');
      setApiKey('');
      setApiSecret('');
      setCompanyName('P.K. Palayam Rice Mill');
      setDefaultWarehouse('');
      setDefaultCashAccount('');
      setDefaultBankAccount('');
      setResolvedCashAc('');
      setResolvedBankAc('');
      setResolvedReceivableAc('');
      setResolvedPayableAc('');
      setResolvedWarehouse('');
      setWarehouses([]); // Clear warehouses dropdown list
      setAccounts([]); // Clear accounts dropdown list
      setStatusMessage({ type: 'success', text: 'All credentials, queued offline transactions, and logs cleared.' });
    }
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Connection Settings</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage your connection parameters and data syncing</p>
        </div>
      </div>

      <div className="grid-2">
        {/* Connection Form */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={20} className="balance-positive" />
            ERPNext Server Link
          </h2>

          <form onSubmit={handleTestAndSave}>
            <div className="form-group">
              <label className="form-label">ERPNext Base URL</label>
              <input
                type="url"
                className="form-control"
                placeholder="https://your-erpnext-domain.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">API Key</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 5d5a23f9b2d8e4c"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">API Secret</label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••••••••••"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Company Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="P.K. Palayam Rice Mill"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Default Warehouse</label>
              <select
                className="form-control"
                value={defaultWarehouse}
                onChange={(e) => setDefaultWarehouse(e.target.value)}
              >
                <option value="">-- Select Default Warehouse --</option>
                {warehouses.map((wh, idx) => (
                  <option key={idx} value={wh.name}>{wh.name} ({wh.warehouse_name})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Default Cash Account (Ledger)</label>
              <select
                className="form-control"
                value={defaultCashAccount}
                onChange={(e) => setDefaultCashAccount(e.target.value)}
              >
                <option value="">-- Select Cash Account --</option>
                {accounts.map((ac, idx) => (
                  <option key={idx} value={ac}>{ac}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Default Bank Account (Ledger)</label>
              <select
                className="form-control"
                value={defaultBankAccount}
                onChange={(e) => setDefaultBankAccount(e.target.value)}
              >
                <option value="">-- Select Bank Account --</option>
                {accounts.map((ac, idx) => (
                  <option key={idx} value={ac}>{ac}</option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isTesting}>
              {isTesting ? (
                <>
                  <RefreshCw className="status-dot syncing" size={16} />
                  <span>Verifying connection...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save & Test Connection</span>
                </>
              )}
            </button>
          </form>

          {statusMessage && (
            <div
              className="flex-gap"
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor:
                  statusMessage.type === 'success'
                    ? 'rgba(16, 185, 129, 0.1)'
                    : statusMessage.type === 'error'
                    ? 'rgba(244, 63, 94, 0.1)'
                    : 'rgba(59, 130, 246, 0.1)',
                border: `1px solid ${
                  statusMessage.type === 'success'
                    ? 'var(--accent-emerald)'
                    : statusMessage.type === 'error'
                    ? 'var(--accent-rose)'
                    : 'var(--accent-blue)'
                }`,
                fontSize: '14px',
              }}
            >
              {statusMessage.type === 'success' && <CheckCircle size={18} className="balance-positive" />}
              {statusMessage.type === 'error' && <AlertCircle size={18} className="balance-negative" />}
              {statusMessage.type === 'info' && <RefreshCw size={18} className="status-dot syncing" />}
              <span
                style={{
                  color:
                    statusMessage.type === 'success'
                      ? 'var(--accent-emerald)'
                      : statusMessage.type === 'error'
                      ? 'var(--accent-rose)'
                      : 'var(--accent-blue)',
                }}
              >
                {statusMessage.text}
              </span>
            </div>
          )}
        </div>

        {/* Sync Controls & Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Company Mappings */}
          <div className="glass-panel">
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Resolved Account Heads</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
              These chart of accounts mappings were fetched automatically from ERPNext.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="flex-between" style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Cash Account:</span>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{resolvedCashAc || 'Not Mapped'}</span>
              </div>
              <div className="flex-between" style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Bank Account:</span>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{resolvedBankAc || 'Not Mapped'}</span>
              </div>
              <div className="flex-between" style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Receivables (Debtors):</span>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{resolvedReceivableAc || 'Not Mapped'}</span>
              </div>
              <div className="flex-between" style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Payables (Creditors):</span>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{resolvedPayableAc || 'Not Mapped'}</span>
              </div>
              <div className="flex-between" style={{ paddingBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Default Warehouse:</span>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{resolvedWarehouse || 'Not Mapped'}</span>
              </div>
            </div>
          </div>

          {/* Quick Operations */}
          <div className="glass-panel">
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Maintenance & Demo</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              Run setup actions to clean database or test features using dummy transactions.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={handleLoadDemo} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                <Database size={16} />
                <span>Load Offline Demo Database</span>
              </button>

              <button
                onClick={async () => {
                  await triggerSync();
                  alert('Sync cycle completed! Check console logs below.');
                }}
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start' }}
                disabled={syncState === 'syncing' || !isOnline}
              >
                <RefreshCw size={16} />
                <span>Trigger Manual Sync</span>
              </button>

              <button onClick={handleClearCache} className="btn btn-danger" style={{ justifyContent: 'flex-start' }}>
                <Trash2 size={16} />
                <span>Clear All Cache & Logs</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
