'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  getSettings,
  getInvoices,
  saveInvoices,
  getPayments,
  savePayments,
  syncInvoiceToRemote,
  syncPaymentToRemote,
  loadDemoData,
  getQueuedWarehouses,
  saveQueuedWarehouses,
  getQueuedStockEntries,
  saveQueuedStockEntries,
  syncWarehouseToRemote,
  syncStockEntryToRemote,
} from '../services/api';

type SyncState = 'synced' | 'syncing' | 'offline' | 'error';

interface SyncContextType {
  isOnline: boolean;
  syncState: SyncState;
  pendingCount: number;
  lastSyncedAt: Date | null;
  syncLogs: string[];
  triggerSync: () => Promise<void>;
  loadMockDemoData: () => void;
  clearAllCache: () => void;
  addLogMessage: (msg: string) => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};

export const SyncProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncState, setSyncState] = useState<SyncState>('synced');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  
  const isSyncingRef = useRef<boolean>(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to add logs with timestamp
  const addLogMessage = (msg: string) => {
    const timeStr = new Date().toLocaleTimeString();
    const formattedMsg = `[${timeStr}] ${msg}`;
    setSyncLogs((prev) => [formattedMsg, ...prev].slice(0, 15));
  };

  // Validate and clean up localStorage from corrupted/undefined entries
  const cleanSyncQueues = () => {
    const invoices = getInvoices();
    const payments = getPayments();

    const validInvoices = invoices.filter(inv => {
      const isCorrupted = 
        !inv.id || 
        inv.id === 'undefined' || 
        !inv.customer_name || 
        inv.customer_name === 'undefined' ||
        !inv.posting_date ||
        inv.posting_date === 'undefined';
      if (isCorrupted) {
        console.warn(`[Sync] Removing corrupted invoice from queue:`, inv);
      }
      return !isCorrupted;
    });

    const validPayments = payments.filter(pmt => {
      const isCorrupted = 
        !pmt.id || 
        pmt.id === 'undefined' || 
        !pmt.party_name || 
        pmt.party_name === 'undefined' ||
        !pmt.posting_date ||
        pmt.posting_date === 'undefined';
      if (isCorrupted) {
        console.warn(`[Sync] Removing corrupted payment from queue:`, pmt);
      }
      return !isCorrupted;
    });

    if (validInvoices.length !== invoices.length) {
      saveInvoices(validInvoices);
      addLogMessage(`Auto-cleaned ${invoices.length - validInvoices.length} corrupted invoices from queue.`);
    }
    if (validPayments.length !== payments.length) {
      savePayments(validPayments);
      addLogMessage(`Auto-cleaned ${payments.length - validPayments.length} corrupted payments from queue.`);
    }

    // Clean queued warehouses
    const queuedWHs = getQueuedWarehouses();
    const validWHs = queuedWHs.filter(w => w.name && w.name !== 'undefined' && w.warehouse_name && w.warehouse_name !== 'undefined');
    if (validWHs.length !== queuedWHs.length) {
      saveQueuedWarehouses(validWHs);
      addLogMessage(`Auto-cleaned ${queuedWHs.length - validWHs.length} corrupted warehouses from queue.`);
    }

    // Clean queued stock entries
    const queuedSEs = getQueuedStockEntries();
    const validSEs = queuedSEs.filter(se => se.id && se.id !== 'undefined' && se.item_code && se.item_code !== 'undefined' && se.warehouse && se.warehouse !== 'undefined');
    if (validSEs.length !== queuedSEs.length) {
      saveQueuedStockEntries(validSEs);
      addLogMessage(`Auto-cleaned ${queuedSEs.length - validSEs.length} corrupted stock adjustments from queue.`);
    }
  };

  // Recalculate how many items are waiting to sync
  const updatePendingCount = () => {
    const invoices = getInvoices();
    const payments = getPayments();
    const unsyncedInvoices = invoices.filter(inv => inv.sync_status !== 'synced').length;
    const unsyncedPayments = payments.filter(pmt => pmt.sync_status !== 'synced').length;

    const warehouses = getQueuedWarehouses();
    const stockEntries = getQueuedStockEntries();
    const unsyncedWarehouses = warehouses.filter(w => w.sync_status !== 'synced').length;
    const unsyncedStockEntries = stockEntries.filter(se => se.sync_status !== 'synced').length;

    setPendingCount(unsyncedInvoices + unsyncedPayments + unsyncedWarehouses + unsyncedStockEntries);
  };

  // Sync Cycle Logic
  const performSync = async () => {
    // 0. Clean corrupted queue items
    cleanSyncQueues();

    // 1. Prevent concurrent runs
    if (isSyncingRef.current) return;
    
    // 2. Check network status
    if (!navigator.onLine) {
      setIsOnline(false);
      setSyncState('offline');
      return;
    }
    
    setIsOnline(true);

    // 3. Get connection settings
    const settings = getSettings();
    if (!settings) {
      // In Demo Mode (no remote settings saved)
      setSyncState('synced');
      updatePendingCount();
      return;
    }

    // Check if we have anything to sync
    const invoices = getInvoices();
    const payments = getPayments();
    const queuedWarehouses = getQueuedWarehouses();
    const queuedStockEntries = getQueuedStockEntries();

    const pendingInvoices = invoices.filter(inv => inv.sync_status !== 'synced');
    const pendingPayments = payments.filter(pmt => pmt.sync_status !== 'synced');
    const pendingWarehouses = queuedWarehouses.filter(w => w.sync_status !== 'synced');
    const pendingStockEntries = queuedStockEntries.filter(se => se.sync_status !== 'synced');

    if (pendingInvoices.length === 0 && 
        pendingPayments.length === 0 && 
        pendingWarehouses.length === 0 && 
        pendingStockEntries.length === 0) {
      setSyncState('synced');
      updatePendingCount();
      return;
    }

    // Start sync process
    isSyncingRef.current = true;
    setSyncState('syncing');
    addLogMessage(`Starting sync cycle: ${pendingWarehouses.length} warehouses, ${pendingInvoices.length} invoices, ${pendingPayments.length} payments, ${pendingStockEntries.length} stock entries pending...`);

    let hasError = false;

    // A. Sync Warehouses First (since other entries might rely on new warehouses)
    const updatedWarehouses = [...queuedWarehouses];
    for (let i = 0; i < updatedWarehouses.length; i++) {
      const wh = updatedWarehouses[i];
      if (wh.sync_status === 'synced') continue;

      try {
        addLogMessage(`Syncing Warehouse '${wh.name}'...`);
        const remoteName = await syncWarehouseToRemote(wh, settings);
        wh.sync_status = 'synced';
        wh.sync_error = undefined;
        addLogMessage(`SUCCESS: Warehouse '${wh.name}' synced.`);
      } catch (err: unknown) {
        hasError = true;
        wh.sync_status = 'error';
        wh.sync_error = err instanceof Error ? err.message : 'Unknown sync error';
        addLogMessage(`ERROR syncing Warehouse '${wh.name}': ${wh.sync_error}`);
        break; // Stop warehouse batch on error to keep sequencing
      }
    }
    saveQueuedWarehouses(updatedWarehouses);

    // B. Sync Invoices Second
    const updatedInvoices = [...invoices];
    // We map local invoice IDs to their new remote names to assist payment mapping
    const localToRemoteInvoiceMap: Record<string, string> = {};

    for (let i = 0; i < updatedInvoices.length; i++) {
      const inv = updatedInvoices[i];
      if (inv.sync_status === 'synced') {
        if (inv.name) localToRemoteInvoiceMap[inv.id] = inv.name;
        continue;
      }

      try {
        addLogMessage(`Syncing Invoice ${inv.id} for ${inv.customer_name}...`);
        const remoteName = await syncInvoiceToRemote(inv, settings);
        
        inv.sync_status = 'synced';
        inv.name = remoteName;
        inv.sync_error = undefined;
        localToRemoteInvoiceMap[inv.id] = remoteName;
        
        addLogMessage(`SUCCESS: Invoice ${inv.id} synced as '${remoteName}'`);
      } catch (err: unknown) {
        hasError = true;
        inv.sync_status = 'error';
        inv.sync_error = err instanceof Error ? err.message : 'Unknown sync error';
        addLogMessage(`ERROR syncing Invoice ${inv.id}: ${inv.sync_error}`);
        break;
      }
    }
    saveInvoices(updatedInvoices);

    // C. Sync Payments Third
    const updatedPayments = [...payments];
    for (let i = 0; i < updatedPayments.length; i++) {
      const pmt = updatedPayments[i];
      if (pmt.sync_status === 'synced') continue;

      // If this payment is linked to a local invoice
      let linkedRemoteName: string | undefined;
      if (pmt.linked_invoice_id) {
        linkedRemoteName = localToRemoteInvoiceMap[pmt.linked_invoice_id];
        // If the invoice exists locally but isn't synced yet, skip this payment for now
        const linkedInv = updatedInvoices.find(inv => inv.id === pmt.linked_invoice_id);
        if (linkedInv && linkedInv.sync_status !== 'synced') {
          addLogMessage(`Skipping payment ${pmt.id} (waiting for invoice ${pmt.linked_invoice_id} to sync)`);
          continue;
        }
      }

      try {
        addLogMessage(`Syncing Payment Entry ${pmt.id} (${pmt.custom_category}) for ${pmt.party_name}...`);
        const remoteName = await syncPaymentToRemote(pmt, settings, linkedRemoteName);
        
        pmt.sync_status = 'synced';
        pmt.name = remoteName;
        pmt.sync_error = undefined;
        
        addLogMessage(`SUCCESS: Payment Entry ${pmt.id} synced as '${remoteName}'`);
      } catch (err: unknown) {
        hasError = true;
        pmt.sync_status = 'error';
        pmt.sync_error = err instanceof Error ? err.message : 'Unknown sync error';
        addLogMessage(`ERROR syncing Payment Entry ${pmt.id}: ${pmt.sync_error}`);
      }
    }
    savePayments(updatedPayments);

    // D. Sync Stock Entries Fourth
    const updatedStockEntries = [...queuedStockEntries];
    for (let i = 0; i < updatedStockEntries.length; i++) {
      const se = updatedStockEntries[i];
      if (se.sync_status === 'synced') continue;

      try {
        addLogMessage(`Syncing Stock Entry ${se.id} (${se.purpose}) for ${se.item_code} in ${se.warehouse}...`);
        const remoteName = await syncStockEntryToRemote(se, settings);
        
        se.sync_status = 'synced';
        se.name = remoteName;
        se.sync_error = undefined;
        
        addLogMessage(`SUCCESS: Stock Entry synced as '${remoteName}'`);
      } catch (err: unknown) {
        hasError = true;
        se.sync_status = 'error';
        se.sync_error = err instanceof Error ? err.message : 'Unknown sync error';
        addLogMessage(`ERROR syncing Stock Entry ${se.id}: ${se.sync_error}`);
      }
    }
    saveQueuedStockEntries(updatedStockEntries);

    // End sync process
    setLastSyncedAt(new Date());
    setSyncState(hasError ? 'error' : 'synced');
    isSyncingRef.current = false;
    updatePendingCount();
    
    if (!hasError) {
      addLogMessage('Sync cycle completed successfully.');
    } else {
      addLogMessage('Sync cycle completed with errors.');
    }
  };

  const triggerSync = async () => {
    addLogMessage('Manual sync triggered.');
    await performSync();
  };

  const loadMockDemoData = () => {
    loadDemoData();
    updatePendingCount();
    addLogMessage('Demo data loaded successfully (Offline Mode).');
  };

  const clearAllCache = () => {
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
    setPendingCount(0);
    setLastSyncedAt(null);
    setSyncLogs([]);
    addLogMessage('Application cache cleared.');
  };

  // Event Listeners for Online Status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addLogMessage('Network is back online. Syncing triggered.');
      performSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('offline');
      addLogMessage('Network is offline. Switching to local-only mode.');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      setIsOnline(navigator.onLine);
      if (!navigator.onLine) {
        setSyncState('offline');
      }
    }

    // Initialize counts and trigger initial sync
    cleanSyncQueues();
    updatePendingCount();
    performSync();

    // Setup background interval (every 5 seconds)
    syncTimerRef.current = setInterval(() => {
      performSync();
    }, 5000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        syncState,
        pendingCount,
        lastSyncedAt,
        syncLogs,
        triggerSync,
        loadMockDemoData,
        clearAllCache,
        addLogMessage,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};
