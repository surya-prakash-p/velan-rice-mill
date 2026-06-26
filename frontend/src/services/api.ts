export interface FrappeSettings {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  companyName: string;
  defaultCashAccount?: string;
  defaultBankAccount?: string;
  defaultReceivableAccount?: string;
  defaultPayableAccount?: string;
  defaultWarehouse?: string;
}

export interface InvoiceItem {
  item_code: string;
  custom_bags: number;
  custom_bag_weight: number;
  qty: number;
  rate: number;
  amount: number;
  description: string;
}

export interface SalesInvoice {
  id: string; // local generated unique ID (e.g. SI-162382...)
  name?: string; // remote ERPNext doc name after sync (e.g. ACC-SINV-2026-00001)
  posting_date: string;
  customer_name: string;
  items: InvoiceItem[];
  discount_amount: number;
  tax_rate: number; // e.g. 5 for 5%
  subtotal: number;
  taxes_and_charges: number;
  grand_total: number;
  in_words: string;
  is_settled: boolean;
  warehouse?: string;
  payment_mode?: string;
  upi_id?: string;
  ref_no?: string;
  cheque_no?: string;
  bank_name?: string;
  sync_status: 'pending' | 'synced' | 'error';
  sync_error?: string;
}

export interface PaymentEntry {
  id: string; // local ID
  name?: string; // remote name
  posting_date: string;
  payment_type: 'Receive' | 'Pay';
  party_name: string;
  amount: number;
  reference_no: string;
  custom_category: string;
  linked_invoice_id?: string;
  sync_status: 'pending' | 'synced' | 'error';
  sync_error?: string;
}

export interface Customer {
  customer_name: string;
  customer_type: 'Company' | 'Individual';
  mobile_no?: string;
  email_id?: string;
  city?: string;
}

export interface Item {
  item_code: string;
  item_name: string;
  item_group: string;
  stock_uom: string;
  valuation_rate: number;
  actual_qty?: number;
}

export interface Warehouse {
  name: string;
  warehouse_name: string;
  parent_warehouse?: string;
  sync_status?: 'pending' | 'synced' | 'error';
  sync_error?: string;
}

export interface StockAdjustmentEntry {
  id: string; // local ID
  name?: string; // remote name
  posting_date: string;
  purpose: 'Material Receipt' | 'Material Issue';
  item_code: string;
  qty: number;
  warehouse: string;
  valuation_rate: number;
  sync_status: 'pending' | 'synced' | 'error';
  sync_error?: string;
}

// ----------------------------------------------------
// LocalStorage Keys
// ----------------------------------------------------
const SETTINGS_KEY = 'frappe_settings';
const INVOICES_KEY = 'offline_invoices';
const PAYMENTS_KEY = 'offline_payments';
const CUSTOMERS_CACHE_KEY = 'cached_customers';
const ITEMS_CACHE_KEY = 'cached_items';
const QUEUED_WAREHOUSES_KEY = 'offline_warehouses';
const QUEUED_STOCK_ENTRIES_KEY = 'offline_stock_entries';
const ACCOUNTS_CACHE_KEY = 'cached_accounts';

// ----------------------------------------------------
// Settings Management
// ----------------------------------------------------
export function getSettings(): FrappeSettings | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed.baseUrl && parsed.apiKey && parsed.apiSecret) {
      return parsed;
    }
  } catch {
    // Ignore invalid JSON
  }
  return null;
}

export function saveSettings(settings: FrappeSettings): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}

export function clearSettings(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SETTINGS_KEY);
  }
}

// ----------------------------------------------------
// Base Helpers
// ----------------------------------------------------
function getHeaders(settings: FrappeSettings): HeadersInit {
  return {
    'X-Frappe-Base-Url': settings.baseUrl,
    'X-Frappe-Api-Key': settings.apiKey,
    'X-Frappe-Api-Secret': settings.apiSecret,
    'Content-Type': 'application/json',
  };
}

// Check remote connection & resolve company defaults
export async function testConnectionAndFetchDefaults(settings: FrappeSettings): Promise<FrappeSettings> {
  const companyEnc = encodeURIComponent(settings.companyName || 'P.K. Palayam Rice Mill');
  const url = `/api/proxy/api/resource/Company/${companyEnc}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(settings),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || errData.message || `Connection failed with status ${response.status}`);
  }

  const { data } = await response.json();
  if (!data) {
    throw new Error('Failed to resolve company data from ERPNext.');
  }

  // Resolve standard/custom fields for cash/bank accounts, prioritizing backend defaults
  const resolvedSettings: FrappeSettings = {
    ...settings,
    defaultCashAccount: data.default_cash_account || data.default_cash_ac || data.default_cash_account_head || settings.defaultCashAccount || '',
    defaultBankAccount: data.default_bank_account || data.default_bank_ac || data.default_bank_account_head || settings.defaultBankAccount || '',
    defaultReceivableAccount: data.default_receivable_account || data.default_receivable_ac || '',
    defaultPayableAccount: data.default_payable_account || data.default_payable_ac || '',
    defaultWarehouse: data.default_warehouse || settings.defaultWarehouse || '',
  };

  return resolvedSettings;
}

// ----------------------------------------------------
// Master Data Fetching (with caching fallback)
// ----------------------------------------------------
export async function fetchCustomers(settings: FrappeSettings | null): Promise<Customer[]> {
  if (!settings) {
    // Return cached / demo customers
    const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  }

  try {
    const url = `/api/proxy/api/resource/Customer?fields=["customer_name","customer_type","mobile_no","email_id","city"]&limit=1000`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(settings),
    });
    if (!response.ok) throw new Error('Failed to fetch customers');
    const { data } = await response.json();
    if (data) {
      localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(data));
      return data;
    }
  } catch (err) {
    console.error('Error fetching remote customers, returning cache:', err);
  }
  const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
  return cached ? JSON.parse(cached) : [];
}

export interface Warehouse {
  name: string;
  warehouse_name: string;
}

export interface Bin {
  item_code: string;
  warehouse: string;
  actual_qty: number;
}

const WAREHOUSES_CACHE_KEY = 'cached_warehouses';
const BINS_CACHE_KEY = 'cached_bins';

export async function fetchWarehouses(settings: FrappeSettings | null): Promise<Warehouse[]> {
  if (!settings) {
    const cached = localStorage.getItem(WAREHOUSES_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  }

  try {
    const url = `/api/proxy/api/resource/Warehouse?fields=["name","warehouse_name"]&filters=[["is_group","=",0],["company","=","${settings.companyName}"]]&limit=100`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(settings),
    });
    if (!response.ok) throw new Error('Failed to fetch warehouses');
    const { data } = await response.json();
    if (data) {
      localStorage.setItem(WAREHOUSES_CACHE_KEY, JSON.stringify(data));
      return data;
    }
  } catch (err) {
    console.error('Error fetching remote warehouses, returning cache:', err);
  }
  const cached = localStorage.getItem(WAREHOUSES_CACHE_KEY);
  return cached ? JSON.parse(cached) : [];
}

export function getStockQty(itemCode: string, warehouse: string): number {
  if (typeof window === 'undefined') return 0;
  const storedBins = localStorage.getItem(BINS_CACHE_KEY);
  if (!storedBins) return 0;
  try {
    const bins: Bin[] = JSON.parse(storedBins);
    const matched = bins.find((b) => b.item_code === itemCode && b.warehouse === warehouse);
    return matched ? matched.actual_qty : 0;
  } catch {
    return 0;
  }
}

export function getBins(): Bin[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(BINS_CACHE_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveBins(bins: Bin[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(BINS_CACHE_KEY, JSON.stringify(bins));
  }
}

export function updateStockQty(itemCode: string, warehouse: string, qty: number): void {
  const bins = getBins();
  const matched = bins.find(b => b.item_code === itemCode && b.warehouse === warehouse);
  if (matched) {
    matched.actual_qty = qty;
  } else {
    bins.push({ item_code: itemCode, warehouse, actual_qty: qty });
  }
  saveBins(bins);
}

export async function fetchItems(settings: FrappeSettings | null): Promise<Item[]> {
  const isRiceItem = (item: Item) => {
    const name = (item.item_name || '').toLowerCase();
    const code = (item.item_code || '').toLowerCase();
    const group = (item.item_group || '').toLowerCase();
    const keywords = ['rice', 'husk', 'bran', 'paddy', 'ponni', 'm.64', 'ir20', 'ir 64', 'ir64', 'kuruva', 'raw', 'broken', 'grain', 'flour'];
    return keywords.some(kw => name.includes(kw) || code.includes(kw) || group.includes(kw));
  };

  if (!settings) {
    const cached = localStorage.getItem(ITEMS_CACHE_KEY);
    const parsed: Item[] = cached ? JSON.parse(cached) : [];
    return parsed.filter(isRiceItem);
  }

  try {
    // 1. Fetch Item master details
    const url = `/api/proxy/api/resource/Item?fields=["item_code","item_name","item_group","stock_uom","valuation_rate"]&filters=[["disabled","=",0]]&limit=1000`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(settings),
    });
    if (!response.ok) throw new Error('Failed to fetch items');
    const { data } = await response.json();
    let items: Item[] = (data || []).filter(isRiceItem);

    // 2. Fetch all Bin levels for the company
    try {
      const binUrl = `/api/proxy/api/resource/Bin?fields=["item_code","warehouse","actual_qty"]&limit=10000`;
      const binResponse = await fetch(binUrl, {
        method: 'GET',
        headers: getHeaders(settings),
      });
      if (binResponse.ok) {
        const { data: binData } = await binResponse.json();
        if (Array.isArray(binData)) {
          localStorage.setItem(BINS_CACHE_KEY, JSON.stringify(binData));
          
          // Fallback map for backward compatibility or simple listings
          const defaultWarehouse = settings.defaultWarehouse;
          if (defaultWarehouse) {
            const binMap: Record<string, number> = {};
            binData
              .filter((b: any) => b.warehouse === defaultWarehouse)
              .forEach((b: any) => {
                binMap[b.item_code] = b.actual_qty || 0;
              });
            items.forEach((item) => {
              item.actual_qty = binMap[item.item_code] !== undefined ? binMap[item.item_code] : 0;
            });
          }
        }
      }
    } catch (binErr) {
      console.warn('[Sync] Failed to fetch bin levels:', binErr);
    }

    if (items.length > 0) {
      localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify(items));
      return items;
    }
  } catch (err) {
    console.error('Error fetching remote items, returning cache:', err);
  }
  const cached = localStorage.getItem(ITEMS_CACHE_KEY);
  return cached ? JSON.parse(cached) : [];
}

// ----------------------------------------------------
// Warehouse Local Storage & Queue Operations
// ----------------------------------------------------
export function getQueuedWarehouses(): Warehouse[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(QUEUED_WAREHOUSES_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveQueuedWarehouses(warehouses: Warehouse[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(QUEUED_WAREHOUSES_KEY, JSON.stringify(warehouses));
  }
}

export function addWarehouseLocal(warehouseName: string, parentWarehouse?: string): Warehouse {
  const settings = getSettings();
  const companyAbbr = settings ? settings.companyName.split(' ').map(w => w[0]).join('').toUpperCase() : 'PPRM';
  
  // Format warehouse name to match ERPNext naming: "Warehouse Name - Company Abbr"
  const formattedName = `${warehouseName.trim()} - ${companyAbbr}`;
  
  const newWarehouse: Warehouse = {
    name: formattedName,
    warehouse_name: warehouseName.trim(),
    parent_warehouse: parentWarehouse || `All Warehouses - ${companyAbbr}`,
    sync_status: 'pending'
  };

  // 1. Add to active cached warehouses list so it appears in dropdowns immediately
  const cached = localStorage.getItem(WAREHOUSES_CACHE_KEY);
  const warehousesList: Warehouse[] = cached ? JSON.parse(cached) : [];
  // Prevent duplicate cached entries
  if (!warehousesList.some(w => w.name === formattedName)) {
    warehousesList.push(newWarehouse);
    localStorage.setItem(WAREHOUSES_CACHE_KEY, JSON.stringify(warehousesList));
  }

  // 2. Add to offline sync queue
  const queue = getQueuedWarehouses();
  if (!queue.some(w => w.name === formattedName)) {
    queue.push(newWarehouse);
    saveQueuedWarehouses(queue);
  }

  return newWarehouse;
}

// ----------------------------------------------------
// Stock Entry Local Storage & Queue Operations
// ----------------------------------------------------
export function getQueuedStockEntries(): StockAdjustmentEntry[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(QUEUED_STOCK_ENTRIES_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveQueuedStockEntries(entries: StockAdjustmentEntry[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(QUEUED_STOCK_ENTRIES_KEY, JSON.stringify(entries));
  }
}

export function queueStockAdjustment(itemCode: string, warehouse: string, diffQty: number, valuationRate: number): void {
  if (diffQty === 0) return;

  const localId = `L-SE-${Date.now()}`;
  const newEntry: StockAdjustmentEntry = {
    id: localId,
    posting_date: new Date().toISOString().split('T')[0],
    purpose: diffQty > 0 ? 'Material Receipt' : 'Material Issue',
    item_code: itemCode,
    qty: Math.abs(diffQty),
    warehouse,
    valuation_rate: valuationRate || 20,
    sync_status: 'pending'
  };

  // 1. Queue it in offline list
  const queue = getQueuedStockEntries();
  queue.push(newEntry);
  saveQueuedStockEntries(queue);
}

// ----------------------------------------------------
// Offline Storage Operations
// ----------------------------------------------------
export function getInvoices(): SalesInvoice[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(INVOICES_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveInvoices(invoices: SalesInvoice[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
  }
}

export function addInvoice(invoice: SalesInvoice): void {
  const invoices = getInvoices();
  invoices.unshift(invoice); // Add to beginning of the list
  saveInvoices(invoices);

  // Deduct stock locally from bins cache
  if (typeof window !== 'undefined') {
    const storedBins = localStorage.getItem(BINS_CACHE_KEY);
    if (storedBins && invoice.items.length > 0) {
      try {
        const bins: Bin[] = JSON.parse(storedBins);
        invoice.items.forEach((invItem) => {
          const warehouse = invoice.warehouse || '';
          if (warehouse) {
            const matched = bins.find((b) => b.item_code === invItem.item_code && b.warehouse === warehouse);
            if (matched) {
              matched.actual_qty = Math.max(0, matched.actual_qty - invItem.qty);
            } else {
              bins.push({
                item_code: invItem.item_code,
                warehouse,
                actual_qty: 0,
              });
            }
          }
        });
        localStorage.setItem(BINS_CACHE_KEY, JSON.stringify(bins));
      } catch (err) {
        console.error('[Cache] Failed to deduct stock locally in bins:', err);
      }
    }
  }
}

export function updateInvoice(updatedInvoice: SalesInvoice): void {
  const invoices = getInvoices();
  const index = invoices.findIndex((inv) => inv.id === updatedInvoice.id);
  if (index === -1) return;

  const oldInvoice = invoices[index];

  // Adjust stock locally in bins if warehouse or items changed
  if (typeof window !== 'undefined') {
    const storedBins = localStorage.getItem('cached_bins');
    if (storedBins) {
      try {
        const bins: Bin[] = JSON.parse(storedBins);

        // 1. Revert old invoice stock (add it back)
        if (oldInvoice.warehouse && oldInvoice.items.length > 0) {
          oldInvoice.items.forEach((item) => {
            const matched = bins.find((b) => b.item_code === item.item_code && b.warehouse === oldInvoice.warehouse);
            if (matched) {
              matched.actual_qty = matched.actual_qty + item.qty;
            } else {
              bins.push({ item_code: item.item_code, warehouse: oldInvoice.warehouse || '', actual_qty: item.qty });
            }
          });
        }

        // 2. Deduct new invoice stock (subtract it)
        if (updatedInvoice.warehouse && updatedInvoice.items.length > 0) {
          updatedInvoice.items.forEach((item) => {
            const matched = bins.find((b) => b.item_code === item.item_code && b.warehouse === updatedInvoice.warehouse);
            if (matched) {
              matched.actual_qty = Math.max(0, matched.actual_qty - item.qty);
            } else {
              bins.push({ item_code: item.item_code, warehouse: updatedInvoice.warehouse || '', actual_qty: 0 });
            }
          });
        }

        localStorage.setItem('cached_bins', JSON.stringify(bins));
      } catch (err) {
        console.error('[Cache] Failed to adjust stock locally during edit:', err);
      }
    }
  }

  // Update the array
  invoices[index] = updatedInvoice;
  saveInvoices(invoices);
}

export function markInvoiceAsPaid(
  invoiceId: string,
  payment: {
    posting_date: string;
    payment_mode: string;
    upi_id?: string;
    ref_no?: string;
    cheque_no?: string;
    bank_name?: string;
  }
): void {
  const invoices = getInvoices();
  const index = invoices.findIndex((inv) => inv.id === invoiceId);
  if (index === -1) return;

  const invoice = invoices[index];
  invoice.is_settled = true;
  invoice.payment_mode = payment.payment_mode;
  invoice.upi_id = payment.upi_id;
  invoice.ref_no = payment.ref_no;
  invoice.cheque_no = payment.cheque_no;
  invoice.bank_name = payment.bank_name;

  // Save updated invoice
  saveInvoices(invoices);

  // Generate reference string for Payment Entry
  let paymentRef = `cash-${invoiceId}`;
  if (payment.payment_mode === 'GPay / UPI') {
    paymentRef = `online-upi-${payment.upi_id || 'unspecified'}`;
  } else if (payment.payment_mode === 'Bank Transfer / RTGS') {
    paymentRef = `rtgs-${payment.ref_no || 'unspecified'}`;
  } else if (payment.payment_mode === 'Cheque') {
    paymentRef = `cheque-${payment.cheque_no || 'unspecified'}${payment.bank_name ? ` (${payment.bank_name})` : ''}`;
  }

  // Create payment entry
  const localPmtId = `L-PMT-${Date.now()}`;
  const newPayment: PaymentEntry = {
    id: localPmtId,
    posting_date: payment.posting_date,
    payment_type: 'Receive',
    party_name: invoice.customer_name,
    amount: invoice.grand_total,
    reference_no: paymentRef,
    custom_category: 'Rice Sales',
    linked_invoice_id: invoice.id,
    sync_status: 'pending',
  };

  addPayment(newPayment);
}


export function getPayments(): PaymentEntry[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(PAYMENTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function savePayments(payments: PaymentEntry[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
  }
}

export function addPayment(payment: PaymentEntry): void {
  const payments = getPayments();
  payments.unshift(payment);
  savePayments(payments);
}

// ----------------------------------------------------
// Demo Data Loader (Migration Hook helper)
// ----------------------------------------------------
export function loadDemoData(): void {
  if (typeof window === 'undefined') return;

  // Initialize or update settings with Velan defaults
  const currentSettings = getSettings();
  if (currentSettings) {
    const updated = {
      ...currentSettings,
      defaultCashAccount: currentSettings.defaultCashAccount || 'Velan Cash - PPRM',
      defaultBankAccount: currentSettings.defaultBankAccount || 'Velan Cash - PPRM',
      defaultWarehouse: currentSettings.defaultWarehouse || 'Velan Warehouse - PPRM',
    };
    saveSettings(updated);
  } else {
    saveSettings({
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'demo',
      apiSecret: 'demo',
      companyName: 'P.K. Palayam Rice Mill',
      defaultCashAccount: 'Velan Cash - PPRM',
      defaultBankAccount: 'Velan Cash - PPRM',
      defaultWarehouse: 'Velan Warehouse - PPRM',
    });
  }

  // Setup sample accounts
  const sampleAccounts = [
    'Velan Cash - PPRM',
    'Debtors - PPRM',
    'Creditors - PPRM',
    'Electricity Expense - PPRM',
    'Wages Expense - PPRM',
  ];
  localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify(sampleAccounts));

  // Setup sample customers
  const sampleCustomers: Customer[] = [
    { customer_name: 'Sri Balaji Traders', customer_type: 'Company', mobile_no: '9876543210', email_id: 'balaji@example.com', city: 'Coimbatore' },
    { customer_name: 'Murugan Agencies', customer_type: 'Individual', mobile_no: '9876543211', email_id: 'murugan@example.com', city: 'Erode' },
    { customer_name: 'Annamalai Corporation', customer_type: 'Company', mobile_no: '9876543212', email_id: 'annamalai@example.com', city: 'Salem' },
    { customer_name: 'Venkateshwara Stores', customer_type: 'Individual', mobile_no: '9876543213', email_id: 'venkat@example.com', city: 'Palakkad' },
  ];
  localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(sampleCustomers));

  // Setup sample items
  const sampleItems: Item[] = [
    { item_code: 'IR 64', item_name: 'IR 64 Rice', item_group: 'Products', stock_uom: 'Kg', valuation_rate: 25.0, actual_qty: 15500 },
  ];
  localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify(sampleItems));

  // Setup sample warehouses
  const sampleWarehouses = [
    { name: 'Velan Warehouse - PPRM', warehouse_name: 'Velan Warehouse' },
    { name: 'Stores - PPRM', warehouse_name: 'Stores' },
    { name: 'Finished Goods - PPRM', warehouse_name: 'Finished Goods' },
    { name: 'Work In Progress - PPRM', warehouse_name: 'Work In Progress' },
  ];
  localStorage.setItem(WAREHOUSES_CACHE_KEY, JSON.stringify(sampleWarehouses));

  // Setup sample bins
  const sampleBins = [
    { item_code: 'IR 64', warehouse: 'Velan Warehouse - PPRM', actual_qty: 12000 },
    { item_code: 'IR 64', warehouse: 'Finished Goods - PPRM', actual_qty: 3500 },
  ];
  localStorage.setItem(BINS_CACHE_KEY, JSON.stringify(sampleBins));

  // Setup invoices
  const sampleInvoices: SalesInvoice[] = [
    {
      id: 'L-INV-1001',
      posting_date: '2026-06-10',
      customer_name: 'Sri Balaji Traders',
      items: [{ item_code: 'IR 64', custom_bags: 150, custom_bag_weight: 75, qty: 11250, rate: 25.00, amount: 281250, description: 'IR 64 = 11,250 x 25.00' }],
      discount_amount: 500,
      tax_rate: 5,
      subtotal: 280750,
      taxes_and_charges: 14037.5,
      grand_total: 294787.5,
      in_words: 'Rupees Two Lakh Ninety Four Thousand Seven Hundred and Eighty Seven and Fifty Paise Only',
      is_settled: true,
      sync_status: 'pending',
    },
    {
      id: 'L-INV-1002',
      posting_date: '2026-06-12',
      customer_name: 'Murugan Agencies',
      items: [{ item_code: 'IR 64', custom_bags: 200, custom_bag_weight: 75, qty: 15000, rate: 25.00, amount: 375000, description: 'IR 64 = 15,000 x 25.00' }],
      discount_amount: 1000,
      tax_rate: 5,
      subtotal: 374000,
      taxes_and_charges: 18700,
      grand_total: 392700,
      in_words: 'Rupees Three Lakh Ninety Two Thousand Seven Hundred Only',
      is_settled: false,
      sync_status: 'pending',
    },
    {
      id: 'L-INV-1003',
      posting_date: '2026-06-13',
      customer_name: 'Annamalai Corporation',
      items: [{ item_code: 'IR 64', custom_bags: 80, custom_bag_weight: 50, qty: 4000, rate: 25.00, amount: 100000, description: 'IR 64 = 4,000 x 25.00' }],
      discount_amount: 0,
      tax_rate: 0,
      subtotal: 100000,
      taxes_and_charges: 0,
      grand_total: 100000,
      in_words: 'Rupees One Lakh Only',
      is_settled: true,
      sync_status: 'pending',
    },
    {
      id: 'L-INV-1004',
      posting_date: '2026-06-14',
      customer_name: 'Venkateshwara Stores',
      items: [{ item_code: 'IR 64', custom_bags: 120, custom_bag_weight: 75, qty: 9000, rate: 25.00, amount: 225000, description: 'IR 64 = 9,000 x 25.00' }],
      discount_amount: 1500,
      tax_rate: 5,
      subtotal: 223500,
      taxes_and_charges: 11175,
      grand_total: 234675,
      in_words: 'Rupees Two Lakh Thirty Four Thousand Six Hundred and Seventy Five Only',
      is_settled: false,
      sync_status: 'pending',
    },
  ];
  saveInvoices(sampleInvoices);

  // Setup payments
  const samplePayments: PaymentEntry[] = [
    {
      id: 'L-PMT-2001',
      posting_date: '2026-06-10',
      payment_type: 'Receive',
      party_name: 'Sri Balaji Traders',
      amount: 294787.50,
      reference_no: 'rtgs-778392',
      custom_category: 'Rice Sales',
      linked_invoice_id: 'L-INV-1001',
      sync_status: 'pending',
    },
    {
      id: 'L-PMT-2002',
      posting_date: '2026-06-11',
      payment_type: 'Pay',
      party_name: 'Paddy Supplier',
      amount: 15000.00,
      reference_no: 'cash-paddy',
      custom_category: '🌾 Paddy Purchase (நெல் வாங்குதல்)',
      sync_status: 'pending',
    },
    {
      id: 'L-PMT-2003',
      posting_date: '2026-06-13',
      payment_type: 'Receive',
      party_name: 'Annamalai Corporation',
      amount: 100000.00,
      reference_no: 'rtgs-987261',
      custom_category: 'Rice Sales',
      linked_invoice_id: 'L-INV-1003',
      sync_status: 'pending',
    },
    {
      id: 'L-PMT-2004',
      posting_date: '2026-06-14',
      payment_type: 'Pay',
      party_name: 'Fuel Station',
      amount: 8500.00,
      reference_no: 'diesel-generator',
      custom_category: '⛽ Diesel Fuel (டீசல்)',
      sync_status: 'pending',
    },
  ];
  savePayments(samplePayments);
}

// ----------------------------------------------------
// Remote Synchronization Logic
// ----------------------------------------------------

export function parseFrappeError(errData: any, status: number): string {
  // If it's a raw HTML traceback (like Werkzeug debugger)
  if (errData.rawResponse && typeof errData.rawResponse === 'string') {
    const raw = errData.rawResponse;
    if (raw.includes('traceback') || raw.includes('Debugger') || raw.includes('Error')) {
      const matchTextarea = raw.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
      if (matchTextarea && matchTextarea[1]) {
        const traceback = matchTextarea[1];
        const parts = traceback.split(/During handling of the above exception|The above exception was the direct cause/i);
        const lines = parts[0].split('\n').map((l: string) => l.trim()).filter(Boolean);
        const lastLine = lines.pop();
        if (lastLine) return `ERPNext Error: ${lastLine}`;
      }
      const matchTitle = raw.match(/<title>([\s\S]*?)<\/title>/);
      if (matchTitle && matchTitle[1]) {
        return `ERPNext Error: ${matchTitle[1].replace('// Werkzeug Debugger', '').trim()}`;
      }
      const matchH1 = raw.match(/<h1>([\s\S]*?)<\/h1>/);
      if (matchH1 && matchH1[1]) {
        return `ERPNext Error: ${matchH1[1].trim()}`;
      }
    }
    return `Server Error ${status}: ${raw.slice(0, 150)}...`;
  }

  if (errData._server_messages) {
    try {
      const msgs = JSON.parse(errData._server_messages);
      const parsedMsgs = msgs.map((m: string) => {
        try {
          const item = JSON.parse(m);
          return item.message || item;
        } catch {
          return m;
        }
      });
      const joined = parsedMsgs.filter(Boolean).join(' | ');
      if (joined) return joined;
    } catch {
      // ignore
    }
  }
  if (errData.exc) {
    try {
      const excs = JSON.parse(errData.exc);
      if (Array.isArray(excs) && excs.length > 0) {
        const lastLine = excs[0].split('\n').map((l: string) => l.trim()).filter(Boolean).pop();
        if (lastLine) return lastLine;
      }
    } catch {
      // ignore
    }
  }
  return errData.error || errData.message || `Request returned status ${status}`;
}

// Ensure party exists in ERPNext before processing payments/invoices
async function verifyOrCreateParty(partyName: string, partyType: 'Customer' | 'Supplier', settings: FrappeSettings): Promise<void> {
  if (!partyName || partyName === 'undefined' || partyName.trim() === '') {
    throw new Error(`Cannot verify or create party: party name is missing or invalid.`);
  }

  const encName = encodeURIComponent(partyName);
  const resource = partyType === 'Customer' ? 'Customer' : 'Supplier';
  const checkUrl = `/api/proxy/api/resource/${resource}/${encName}`;

  const checkRes = await fetch(checkUrl, {
    method: 'GET',
    headers: getHeaders(settings),
  });

  if (checkRes.ok) {
    // Party exists, carry on
    return;
  }

  // Create party dynamically if it's missing
  console.log(`[Sync] Party ${partyName} missing in ERPNext. Auto-creating customer...`);
  const createUrl = `/api/proxy/api/resource/${resource}`;
  const body = partyType === 'Customer'
    ? { customer_name: partyName, customer_type: 'Individual', territory: 'All Territories' }
    : { supplier_name: partyName, supplier_type: 'Individual', supplier_group: 'All Supplier Groups' };

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: getHeaders(settings),
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to auto-create ${partyType} '${partyName}': ${errText}`);
  }
}

// Ensure stock item exists in ERPNext before posting entries referencing it
async function verifyOrCreateItem(itemCode: string, settings: FrappeSettings): Promise<void> {
  if (!itemCode || itemCode.trim() === '') {
    throw new Error(`Cannot verify or create item: item_code is missing.`);
  }

  const encCode = encodeURIComponent(itemCode);
  const checkUrl = `/api/proxy/api/resource/Item/${encCode}`;

  const checkRes = await fetch(checkUrl, {
    method: 'GET',
    headers: getHeaders(settings),
  });

  if (checkRes.ok) {
    // Item exists, carry on
    return;
  }

  // Create item dynamically if missing
  console.log(`[Sync] Item ${itemCode} missing in ERPNext. Auto-creating stock item...`);
  const createUrl = `/api/proxy/api/resource/Item`;
  
  let itemName = itemCode;
  let itemGroup = 'Products';
  
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem('cached_items');
    if (cached) {
      try {
        const itemsList = JSON.parse(cached);
        if (Array.isArray(itemsList)) {
          const matched = itemsList.find(i => i.item_code === itemCode);
          if (matched) {
            itemName = matched.item_name || itemCode;
            itemGroup = matched.item_group || 'Products';
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const body = {
    item_code: itemCode,
    item_name: itemName,
    item_group: itemGroup,
    stock_uom: 'Kg',
    is_stock_item: 1,
    valuation_rate: 20.0,
  };

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: getHeaders(settings),
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to auto-create stock Item '${itemCode}': ${errText}`);
  }
}

// Sync single Invoice to remote
export async function syncInvoiceToRemote(invoice: SalesInvoice, settings: FrappeSettings): Promise<string> {
  if (!invoice.customer_name || invoice.customer_name === 'undefined' || invoice.customer_name.trim() === '') {
    throw new Error(`Cannot sync invoice ${invoice.id || 'unknown'}: customer_name is missing or invalid.`);
  }

  // Ensure customer exists
  await verifyOrCreateParty(invoice.customer_name, 'Customer', settings);

  // Ensure all items exist in ERPNext
  for (const item of invoice.items) {
    await verifyOrCreateItem(item.item_code, settings);
  }

  const url = `/api/proxy/api/resource/Sales Invoice`;
  
  // Format details for ERPNext insert payload
  const invoicePayload = {
    company: settings.companyName,
    customer: invoice.customer_name,
    posting_date: invoice.posting_date,
    discount_amount: invoice.discount_amount,
    currency: 'INR',
    selling_price_list: 'Standard Selling',
    price_list_currency: 'INR',
    plc_conversion_rate: 1.0,
    update_stock: 1, // Auto-reduce inventory
    items: invoice.items.map((item) => ({
      item_code: item.item_code,
      qty: item.qty,
      rate: item.rate,
      custom_bags: item.custom_bags,
      custom_bag_weight: item.custom_bag_weight,
      description: item.description,
      warehouse: invoice.warehouse || settings.defaultWarehouse || undefined,
    })),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(settings),
    body: JSON.stringify(invoicePayload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(parseFrappeError(errData, response.status));
  }

  const { data } = await response.json();
  if (!data || !data.name) {
    throw new Error('ERPNext saved the invoice, but did not return a valid document name.');
  }

  // Submit the invoice to make it final
  const submitUrl = `/api/proxy/api/resource/Sales Invoice/${data.name}`;
  const submitRes = await fetch(submitUrl, {
    method: 'PUT',
    headers: getHeaders(settings),
    body: JSON.stringify({ docstatus: 1 }), // DocStatus 1 = Submitted
  });

  if (!submitRes.ok) {
    const errData = await submitRes.json().catch(() => ({}));
    throw new Error(`Invoice created (${data.name}) but submission failed: ${parseFrappeError(errData, submitRes.status)}`);
  }

  return data.name;
}

// Sync single Payment to remote
export async function syncPaymentToRemote(payment: PaymentEntry, settings: FrappeSettings, linkedInvoiceName?: string): Promise<string> {
  if (!payment.party_name || payment.party_name === 'undefined' || payment.party_name.trim() === '') {
    throw new Error(`Cannot sync payment entry ${payment.id || 'unknown'}: party_name is missing or invalid.`);
  }

  const isReceive = payment.payment_type === 'Receive';
  const partyType = isReceive ? 'Customer' : 'Supplier';

  // Ensure Customer/Supplier exists
  await verifyOrCreateParty(payment.party_name, partyType, settings);

  // Automatic account mapping:
  // Check if reference number contains bank keywords
  const refLower = (payment.reference_no || '').toLowerCase();
  const isBank = refLower.includes('rtgs') || refLower.includes('cheque') || refLower.includes('online') || refLower.includes('வரவு');
  
  const companyAbbr = settings.companyName.split(' ').map(w => w[0]).join('').toUpperCase() || 'PPRM';

  const cashOrBank = isBank
    ? (settings.defaultBankAccount || `Velan Cash - ${companyAbbr}`)
    : (settings.defaultCashAccount || `Velan Cash - ${companyAbbr}`);

  const defaultReceivable = settings.defaultReceivableAccount || `Debtors - ${companyAbbr}`;
  const defaultPayable = settings.defaultPayableAccount || `Creditors - ${companyAbbr}`;

  let paid_from = '';
  let paid_to = '';

  if (isReceive) {
    // Customer paying company
    paid_from = defaultReceivable;
    paid_to = cashOrBank;
  } else {
    // Company paying supplier/expense
    paid_from = cashOrBank;
    paid_to = defaultPayable;
  }

  const url = `/api/proxy/api/resource/Payment Entry`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentPayload: any = {
    payment_type: payment.payment_type,
    posting_date: payment.posting_date,
    company: settings.companyName,
    party_type: partyType,
    party: payment.party_name,
    paid_amount: payment.amount,
    received_amount: payment.amount,
    reference_no: payment.reference_no,
    reference_date: payment.posting_date,
    custom_category: payment.custom_category,
    paid_from,
    paid_to,
  };

  // If this payment is linked to a sales invoice and we have the remote name
  if (linkedInvoiceName) {
    let allocatedAmount = payment.amount;
    try {
      const invUrl = `/api/proxy/api/resource/Sales Invoice/${encodeURIComponent(linkedInvoiceName)}`;
      const invRes = await fetch(invUrl, {
        method: 'GET',
        headers: getHeaders(settings),
      });
      if (invRes.ok) {
        const { data: invData } = await invRes.json();
        if (invData && typeof invData.outstanding_amount === 'number') {
          // Cap allocated amount to the invoice's actual outstanding amount to prevent validation failure
          allocatedAmount = Math.min(payment.amount, invData.outstanding_amount);
          console.log(`[Sync] Mapped allocation for invoice ${linkedInvoiceName}: Capped allocation at ₹${allocatedAmount} (Invoice outstanding is ₹${invData.outstanding_amount})`);
        }
      }
    } catch (err) {
      console.warn('[Sync] Failed to fetch outstanding amount for allocation calculation, defaulting to payment amount.', err);
    }

    if (allocatedAmount > 0) {
      paymentPayload.references = [
        {
          reference_doctype: 'Sales Invoice',
          reference_name: linkedInvoiceName,
          allocated_amount: allocatedAmount,
        },
      ];
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(settings),
    body: JSON.stringify(paymentPayload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(parseFrappeError(errData, response.status));
  }

  const { data } = await response.json();
  if (!data || !data.name) {
    throw new Error('ERPNext saved the payment, but did not return a valid document name.');
  }

  // Submit the payment entry
  const submitUrl = `/api/proxy/api/resource/Payment Entry/${data.name}`;
  const submitRes = await fetch(submitUrl, {
    method: 'PUT',
    headers: getHeaders(settings),
    body: JSON.stringify({ docstatus: 1 }),
  });

  if (!submitRes.ok) {
    const errData = await submitRes.json().catch(() => ({}));
    throw new Error(`Payment Entry created (${data.name}) but submission failed: ${parseFrappeError(errData, submitRes.status)}`);
  }

  return data.name;
}

// ----------------------------------------------------
// Number to Indian Currency Words Conversion
// ----------------------------------------------------
export function numberToIndianWords(num: number): string {
  if (num === 0) return 'Rupees Zero Only';
  if (isNaN(num) || num < 0) return '';

  const str = num.toFixed(2);
  const [rupeesStr, paiseStr] = str.split('.');
  
  const rupees = parseInt(rupeesStr, 10);
  const paise = parseInt(paiseStr, 10);
  
  const convertAmount = (val: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
                   'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (val < 20) return ones[val];
    if (val < 100) return tens[Math.floor(val / 10)] + (val % 10 !== 0 ? ' ' + ones[val % 10] : '');
    
    if (val < 1000) {
      return ones[Math.floor(val / 100)] + ' Hundred' + (val % 100 !== 0 ? ' and ' + convertAmount(val % 100) : '');
    }
    
    if (val < 100000) {
      return convertAmount(Math.floor(val / 1000)) + ' Thousand' + (val % 1000 !== 0 ? ' ' + convertAmount(val % 1000) : '');
    }
    
    if (val < 10000000) {
      return convertAmount(Math.floor(val / 100000)) + ' Lakh' + (val % 100000 !== 0 ? ' ' + convertAmount(val % 100000) : '');
    }
    
    return convertAmount(Math.floor(val / 10000000)) + ' Crore' + (val % 10000000 !== 0 ? ' ' + convertAmount(val % 10000000) : '');
  };
  
  let result = 'Rupees ';
  if (rupees > 0) {
    result += convertAmount(rupees);
  } else {
    result += 'Zero';
  }
  
  if (paise > 0) {
    result += ' and ' + convertAmount(paise) + ' Paise';
  }
  
  result += ' Only';
  return result;
}

// Formats a number to Indian system with commas: e.g. 1234567.89 -> 12,34,567.89
export function formatIndianNumber(num: number, decimals: number = 2): string {
  if (isNaN(num)) return '0.00';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

// Sync a single warehouse to ERPNext
export async function syncWarehouseToRemote(warehouse: Warehouse, settings: FrappeSettings): Promise<string> {
  const url = `/api/proxy/api/resource/Warehouse`;
  
  const payload = {
    warehouse_name: warehouse.warehouse_name,
    parent_warehouse: warehouse.parent_warehouse,
    company: settings.companyName,
    is_group: 0
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(settings),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = parseFrappeError(errData, response.status);
    if (errMsg.includes('already exists') || response.status === 409) {
      console.log(`[Sync] Warehouse ${warehouse.name} already exists in ERPNext, marking synced.`);
      return warehouse.name;
    }
    throw new Error(errMsg);
  }

  const { data } = await response.json();
  if (!data || !data.name) {
    throw new Error('ERPNext saved the Warehouse, but did not return a valid name.');
  }
  return data.name;
}

export async function syncStockEntryToRemote(entry: StockAdjustmentEntry, settings: FrappeSettings): Promise<string> {
  // Ensure the stock item exists in ERPNext before posting entries referencing it
  await verifyOrCreateItem(entry.item_code, settings);

  const url = `/api/proxy/api/resource/Stock Entry`;
  
  const isReceipt = entry.purpose === 'Material Receipt';
  
  // Resolve UOM from cached items
  let uom = 'Kg';
  try {
    const cached = localStorage.getItem(ITEMS_CACHE_KEY);
    if (cached) {
      const itemsList: Item[] = JSON.parse(cached);
      const matched = itemsList.find(i => i.item_code === entry.item_code);
      if (matched && matched.stock_uom) {
        uom = matched.stock_uom;
      }
    }
  } catch (err) {
    console.warn('[Sync] Failed to resolve stock item UOM:', err);
  }

  const stockItemPayload = {
    item_code: entry.item_code,
    qty: entry.qty,
    uom: uom,
    use_multi_level_bom: 0,
    s_warehouse: isReceipt ? undefined : entry.warehouse,
    t_warehouse: isReceipt ? entry.warehouse : undefined,
    basic_rate: isReceipt ? entry.valuation_rate : undefined,
  };

  const payload = {
    company: settings.companyName,
    purpose: entry.purpose,
    stock_entry_type: entry.purpose,
    posting_date: entry.posting_date,
    items: [stockItemPayload]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(settings),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errData;
    try {
      errData = JSON.parse(errText);
    } catch {
      errData = { rawResponse: errText };
    }
    throw new Error(parseFrappeError(errData, response.status));
  }

  const { data } = await response.json();
  if (!data || !data.name) {
    throw new Error('ERPNext saved the Stock Entry, but did not return a valid name.');
  }

  // Submit the Stock Entry
  const submitUrl = `/api/proxy/api/resource/Stock Entry/${data.name}`;
  const submitRes = await fetch(submitUrl, {
    method: 'PUT',
    headers: getHeaders(settings),
    body: JSON.stringify({ docstatus: 1 }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    let errData;
    try {
      errData = JSON.parse(errText);
    } catch {
      errData = { rawResponse: errText };
    }
    throw new Error(`Stock Entry created (${data.name}) but submission failed: ${parseFrappeError(errData, submitRes.status)}`);
  }

  return data.name;
}

// Fetch list of Accounts from ERPNext with local cache fallback
export async function fetchAccounts(settings: FrappeSettings | null): Promise<string[]> {
  if (!settings) {
    if (typeof window === 'undefined') return [];
    const cached = localStorage.getItem(ACCOUNTS_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  }

  try {
    const url = `/api/proxy/api/resource/Account?fields=["name"]&filters=[["company","=","${settings.companyName}"],["is_group","=",0]]&limit=1000`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(settings),
    });
    if (response.ok) {
      const { data } = await response.json();
      if (Array.isArray(data)) {
        const names = data.map((ac: any) => ac.name);
        localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify(names));
        return names;
      }
    }
  } catch (err) {
    console.error('Error fetching remote accounts, returning cache:', err);
  }
  
  if (typeof window === 'undefined') return [];
  const cached = localStorage.getItem(ACCOUNTS_CACHE_KEY);
  return cached ? JSON.parse(cached) : [];
}
