export interface Staff {
  id: number
  nip: string
  name: string
  email: string
  unit: string
  is_active: boolean
  today_voucher_id?: number
  today_voucher_code?: string
  today_qr_payload?: string
  today_voucher_status?: string
  today_voucher_email_sent?: boolean
  today_voucher_used_at?: string
  today_tenant_name?: string
}

export interface StaffVoucherData {
  staff_id: number
  staff_name: string
  staff_email: string
  unit: string
  voucher_id: number
  date_str: string
  amount: number
  status: string
  email_sent: boolean
  short_code: string
  qr_payload: string
  qr_png_base64: string
  valid_hours: string
  used_at?: string
  tenant_name?: string
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

export interface RecentScanItem {
  staff_name: string
  unit: string
  short_code?: string
  amount: number
  used_at: string
}

export interface TodayData {
  count: number
  total: number
  recent?: RecentScanItem[]
}
