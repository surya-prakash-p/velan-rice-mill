'use client';

import React, { useState, useEffect } from 'react';
import { useSync } from '@/context/SyncContext';
import { 
  getSettings, 
  fetchItems, 
  fetchWarehouses, 
  getBins, 
  updateStockQty, 
  addWarehouseLocal,
  queueStockAdjustment,
  Item, 
  Warehouse,
  formatIndianNumber
} from '@/services/api';
import { Boxes, RefreshCw, Save, Search, AlertCircle, CheckCircle, PlusCircle, X } from 'lucide-react';

export default function StockPage() {
  const { isOnline, addLogMessage } = useSync();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Warehouse Modal State
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [parentWarehouse, setParentWarehouse] = useState('');

  const loadData = async (forceRemote = false) => {
    setIsRefreshing(true);
    try {
      const settings = getSettings();
      const whs = await fetchWarehouses(forceRemote ? settings : null);
      const itms = await fetchItems(forceRemote ? settings : null);
      setWarehouses(whs);
      setItems(itms);

      if (whs.length > 0 && !selectedWarehouse) {
        if (settings && settings.defaultWarehouse) {
          setSelectedWarehouse(settings.defaultWarehouse);
        } else {
          setSelectedWarehouse(whs[0].name);
        }
      }
      setStatusMessage({ 
        type: 'success', 
        text: forceRemote ? 'Inventory data fetched from ERPNext.' : 'Inventory data loaded from cache.' 
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: 'Failed to load stock data: ' + (err.message || err) });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getStockForWarehouse = (itemCode: string) => {
    const bins = getBins();
    const matched = bins.find(b => b.item_code === itemCode && b.warehouse === selectedWarehouse);
    return matched ? matched.actual_qty : 0;
  };

  const handleAdjustQtyChange = (itemCode: string, val: string) => {
    const parsed = parseFloat(val);
    setAdjustments(prev => ({
      ...prev,
      [itemCode]: isNaN(parsed) ? 0 : parsed
    }));
  };

  const handleSaveAdjustment = (itemCode: string, valuationRate: number) => {
    const newQty = adjustments[itemCode];
    if (newQty === undefined || newQty < 0) {
      alert('Please enter a valid stock level (greater than or equal to 0).');
      return;
    }

    const currentQty = getStockForWarehouse(itemCode);
    const diff = newQty - currentQty;

    if (diff === 0) {
      alert('No change in stock level.');
      return;
    }

    // 1. Queue backend Stock Entry sync (Material Receipt or Material Issue)
    queueStockAdjustment(itemCode, selectedWarehouse, diff, valuationRate);
    
    // 2. Update local stock bins count in cache for instant UI feedback
    updateStockQty(itemCode, selectedWarehouse, newQty);
    
    addLogMessage(`[Inventory] Adjusted '${itemCode}' in '${selectedWarehouse}' by ${diff > 0 ? '+' : ''}${diff} units (Stock Entry queued).`);
    
    // Clear adjustment input
    setAdjustments(prev => {
      const copy = { ...prev };
      delete copy[itemCode];
      return copy;
    });
    
    setStatusMessage({ 
      type: 'success', 
      text: `Stock adjusted by ${diff > 0 ? '+' : ''}${diff}. Synchronization scheduled with ERPNext.` 
    });
    
    // Quick reload
    loadData();
  };

  const handleCreateWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName) return;

    try {
      const newWh = addWarehouseLocal(newWarehouseName, parentWarehouse || undefined);
      addLogMessage(`[Warehouse] Created warehouse '${newWh.name}' locally. Sync scheduled.`);
      
      // Auto select new warehouse
      setSelectedWarehouse(newWh.name);
      
      // Close modal and reset fields
      setIsWarehouseModalOpen(false);
      setNewWarehouseName('');
      setParentWarehouse('');
      
      setStatusMessage({ type: 'success', text: `Warehouse '${newWh.name}' created locally and queued for sync.` });
      
      // Reload lists
      loadData();
    } catch (err: any) {
      alert('Failed to create warehouse: ' + err.message);
    }
  };

  const handleRefreshFromRemote = async () => {
    if (!isOnline) {
      alert('You are offline. Cannot fetch latest levels from ERPNext.');
      return;
    }
    const settings = getSettings();
    if (!settings) {
      alert('ERPNext server settings are not configured. Go to Settings first.');
      return;
    }
    await loadData(true);
  };

  // Filter items by search query
  const filteredItems = items.filter(item => 
    item.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.item_group.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {/* Top Banner */}
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Warehouse Stock Ledger</h1>
          <p style={{ color: 'var(--text-secondary)' }}>View and adjust physical stock levels across local warehouses</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setIsWarehouseModalOpen(true)}
            className="btn btn-primary"
          >
            <PlusCircle size={16} />
            <span>+ Add Warehouse</span>
          </button>
          
          <button
            onClick={handleRefreshFromRemote}
            disabled={isRefreshing || !isOnline}
            className="btn btn-secondary"
          >
            <RefreshCw className={isRefreshing ? 'status-dot syncing' : ''} size={16} />
            <span>Fetch ERPNext Stock</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
            border: `1px solid ${statusMessage.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
            fontSize: '14px',
            color: statusMessage.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Select Controls & Search */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div className="grid-2">
          {/* Warehouse Dropdown */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Active Warehouse</label>
            <select
              className="form-control"
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
            >
              {warehouses.length === 0 ? (
                <option value="">-- No Warehouses Cached --</option>
              ) : (
                warehouses.map((w, i) => (
                  <option key={i} value={w.name}>{w.name} ({w.warehouse_name})</option>
                ))
              )}
            </select>
          </div>

          {/* Search Bar */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Search Items</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '36px' }}
                placeholder="Search by code, name, or group..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Stock Levels Table */}
      <div className="glass-panel">
        <h2 style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Boxes size={18} style={{ color: 'var(--accent-cyan)' }} />
          <span>Stock Balances in: <strong style={{ color: 'var(--accent-emerald)' }}>{selectedWarehouse || 'None'}</strong></span>
        </h2>

        {!selectedWarehouse ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            Please select or configure a warehouse.
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No items found matching the filter criteria.
          </div>
        ) : (
          <div className="custom-table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Item Details</th>
                  <th>Item Group</th>
                  <th>UOM</th>
                  <th style={{ textAlign: 'right' }}>Current Cache Qty</th>
                  <th style={{ textAlign: 'center', width: '250px' }}>Adjust Stock Count</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const currentQty = getStockForWarehouse(item.item_code);
                  const adjustVal = adjustments[item.item_code] !== undefined ? adjustments[item.item_code] : '';
                  
                  return (
                    <tr key={item.item_code}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{item.item_name}</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Code: {item.item_code}</div>
                      </td>
                      <td>
                        <span className="badge badge-pending">{item.item_group}</span>
                      </td>
                      <td>{item.stock_uom}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '15px' }}>
                        {formatIndianNumber(currentQty, 0)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                          <input
                            type="number"
                            className="form-control"
                            style={{ width: '100px', textAlign: 'right', padding: '6px 8px', height: '34px' }}
                            placeholder={currentQty.toString()}
                            value={adjustVal}
                            min="0"
                            onChange={(e) => handleAdjustQtyChange(item.item_code, e.target.value)}
                          />
                          <button
                            onClick={() => handleSaveAdjustment(item.item_code, item.valuation_rate)}
                            className="btn btn-primary"
                            style={{ padding: '6px 12px', height: '34px', fontSize: '12px' }}
                            disabled={adjustments[item.item_code] === undefined}
                          >
                            <Save size={12} />
                            <span>Save</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Warehouse Modal Dialog */}
      {isWarehouseModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="flex-between" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 750, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Boxes size={20} className="balance-positive" />
                <span>Create New Warehouse</span>
              </h2>
              <button 
                onClick={() => setIsWarehouseModalOpen(false)} 
                className="btn btn-secondary" 
                style={{ padding: '6px', borderRadius: '50%' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateWarehouse}>
              <div className="form-group">
                <label className="form-label">Warehouse Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Godown C, Raw Materials"
                  value={newWarehouseName}
                  onChange={(e) => setNewWarehouseName(e.target.value)}
                  required
                  autoFocus
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  ERPNext will automatically append Company suffix (e.g. <strong>- PPRM</strong>).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Parent Warehouse (Optional)</label>
                <select
                  className="form-control"
                  value={parentWarehouse}
                  onChange={(e) => setParentWarehouse(e.target.value)}
                >
                  <option value="">-- Auto Resolve Parent --</option>
                  {warehouses.map((w, i) => (
                    <option key={i} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button 
                  type="button" 
                  onClick={() => setIsWarehouseModalOpen(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Warehouse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
