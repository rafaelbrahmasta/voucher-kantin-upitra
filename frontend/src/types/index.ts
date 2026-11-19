export interface Staff {
  id: number
  nip: string
  name: string
  email: string
  unit: string
  is_active: boolean
  today_voucher_status?: string
}

export interface Tenant {
  id: number
  name: string
  stall: string
  owner: string
  bank_name: string
  bank_account: string
  active: boolean
  has_device: boolean
  device_time?: string
}

export interface MenuItem {
  id: number
  tenant_id: number
  name: string
  price: number
  available: boolean
}

export interface Transaction {
  At: string
  Staff: string
  Unit: string
  Tenant: string
  Amount: number
  Voided: boolean
  Items: string
}

export interface AdminSummaryData {
  date: string
  sum: {
    Issued: number
    Used: number
    Nominal: number
  }
  unused: number
  pct: number
  tenantsUsage: Array<{
    Name: string
    Count: number
    Amount: number
  }>
  recent: Transaction[]
  totalStaff: number
  activeStaff: number
  totalTenants: number
}

export interface AuthSession {
  authenticated: boolean
  role: 'admin' | 'finance' | 'tenant' | ''
  displayName?: string
  userId?: number
  tenantId?: number
  stall?: string
}

// Kasir / Scan types
export interface MenuItemScan {
  id: number
  name: string
  price: number
}

export interface ScanResult {
  result: 'ok' | 'invalid' | 'used' | 'expired' | 'void'
  amount?: number
  staff?: string
  unit?: string
  at?: string
  usedAt?: string
  voucherId?: number
  message?: string
  order?: {
    items: Array<{ name: string; qty: number; price: number; subtotal: number }>
    total: number
    pay: number
  }
}

export interface TodayData {
  count: number
  total: number
}
