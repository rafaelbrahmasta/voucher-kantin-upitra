import { Staff, Tenant, Transaction, AdminSummaryData, AuthSession, MenuItemScan, ScanResult, TodayData } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '') + '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const cleanPath = path.startsWith('/api/') || path === '/api'
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`

  const res = await fetch(cleanPath, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    const message = errorData?.error || errorData?.message || `Terjadi kesalahan (HTTP ${res.status})`
    throw new Error(message)
  }

  return res.json()
}

export const api = {
  // Auth
  auth: {
    me: () => request<AuthSession>('/auth/me'),
    login: (role: 'admin' | 'finance', email?: string, password?: string) =>
      request<{ ok: boolean; role: string; displayName: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ role, email, password }),
      }),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  },

  // Admin IT
  admin: {
    getSummary: (tanggal?: string) =>
      request<AdminSummaryData>(`/admin/summary${tanggal ? `?tanggal=${tanggal}` : ''}`),

    // Staf
    getStaff: (q?: string) =>
      request<{ staff: Staff[]; total: number; totalActive: number; q: string }>(
        `/admin/staff${q ? `?q=${encodeURIComponent(q)}` : ''}`
      ),
    getStaffById: (id: number) => request<{ staff: Staff }>(`/admin/staff/${id}`),
    createStaff: (data: Omit<Staff, 'id'>) =>
      request<{ ok: boolean; id: number }>('/admin/staff', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateStaff: (id: number, data: Omit<Staff, 'id'>) =>
      request<{ ok: boolean }>(`/admin/staff/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    toggleStaff: (id: number) =>
      request<{ ok: boolean }>(`/admin/staff/${id}/toggle`, { method: 'POST' }),
    deleteStaff: (id: number) =>
      request<{ ok: boolean }>(`/admin/staff/${id}`, { method: 'DELETE' }),
    issueVouchers: (date?: string, force?: boolean) =>
      request<{
        date: string
        total_staff: number
        issued_count: number
        skipped_count: number
        skipped_holiday_or_weekend: boolean
        message: string
        details: string[]
      }>('/admin/issue-vouchers', {
        method: 'POST',
        body: JSON.stringify({ date, force }),
      }),

    // Tenants
    getTenants: () => request<{ tenants: Tenant[] }>('/admin/tenants'),
    createTenant: (data: { name: string; stall: string; owner: string; bank_name: string; bank_account: string; active: boolean }) =>
      request<{ ok: boolean; id: number }>('/admin/tenants', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateTenant: (id: number, data: { name: string; stall: string; owner: string; bank_name: string; bank_account: string; active: boolean }) =>
      request<{ ok: boolean }>(`/admin/tenants/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteTenant: (id: number) =>
      request<{ ok: boolean }>(`/admin/tenants/${id}`, { method: 'DELETE' }),
    issueCode: (id: number) =>
      request<{ ok: boolean; code: string }>(`/admin/tenants/${id}/code`, { method: 'POST' }),
    revokeDevices: (id: number) =>
      request<{ ok: boolean }>(`/admin/tenants/${id}/revoke`, { method: 'POST' }),

    // Transaksi
    getTransactions: (params?: { dari?: string; sampai?: string; tenant?: number; unit?: string; halaman?: number }) => {
      const search = new URLSearchParams()
      if (params?.dari) search.set('dari', params.dari)
      if (params?.sampai) search.set('sampai', params.sampai)
      if (params?.tenant) search.set('tenant', params.tenant.toString())
      if (params?.unit) search.set('unit', params.unit)
      if (params?.halaman) search.set('halaman', params.halaman.toString())
      return request<{
        transactions: Transaction[]
        total: number
        page: number
        pages: number
        perPage: number
        dari: string
        sampai: string
        units: string[]
        tenants: Array<{ ID: number; Name: string }>
      }>(`/admin/transactions?${search.toString()}`)
    },
  },

  // Finance
  finance: {
    getSummary: (tanggal?: string) =>
      request<{
        date: string
        dateLabel: string
        isToday: boolean
        sum: { Issued: number; Used: number; Nominal: number; Void: number }
        unused: number
        pctUsed: number
        pctExpired: number
        pctVoid: number
        budgetIssued: number
        budgetUsed: number
        budgetExpired: number
        budgetVoid: number
        tenants: Array<{ Name: string; Count: number; Amount: number }>
        recent: Transaction[]
      }>(`/finance/summary${tanggal ? `?tanggal=${tanggal}` : ''}`),

    getPayouts: (tanggal?: string) =>
      request<{
        date: string
        dateLabel: string
        payouts: Array<{
          id: number
          name: string
          stall: string
          owner: string
          bankName: string
          bankAccount: string
          count: number
          amount: number
          active: boolean
        }>
        totalCount: number
        totalAmount: number
      }>(`/finance/payouts${tanggal ? `?tanggal=${tanggal}` : ''}`),

    getTransactions: (params?: { dari?: string; sampai?: string; tenant?: number; unit?: string; halaman?: number }) => {
      const search = new URLSearchParams()
      if (params?.dari) search.set('dari', params.dari)
      if (params?.sampai) search.set('sampai', params.sampai)
      if (params?.tenant) search.set('tenant', params.tenant.toString())
      if (params?.unit) search.set('unit', params.unit)
      if (params?.halaman) search.set('halaman', params.halaman.toString())
      return request<{
        transactions: Transaction[]
        total: number
        page: number
        pages: number
        perPage: number
        dari: string
        sampai: string
        units: string[]
        tenants: Array<{ ID: number; Name: string }>
      }>(`/finance/transactions?${search.toString()}`)
    },
  },

  // Kasir / Tenant (pakai cookie sesi kasir)
  kasir: {
    me: () => request<AuthSession>('/scan/me'),
    scan: (qr: string, items?: Array<{ id: number; qty: number }>) =>
      request<ScanResult>('/scan', {
        method: 'POST',
        body: JSON.stringify({ qr, items: items || [] }),
      }),
    scanCode: (code: string, items?: Array<{ id: number; qty: number }>) =>
      request<ScanResult>('/scan/code', {
        method: 'POST',
        body: JSON.stringify({ code, items: items || [] }),
      }),
    scanVoucher: (payload: string, items?: Array<{ id: number; qty: number }>) => {
      // Jika format kode pendek 8-9 karakter (xxxx-xxxx atau xxxxxxxx), gunakan endpoint kode
      const clean = payload.trim().replace('-', '')
      if (clean.length === 8 && /^[a-zA-Z0-9]+$/.test(clean)) {
        return request<ScanResult>('/scan/code', {
          method: 'POST',
          body: JSON.stringify({ code: payload.trim(), items: items || [] }),
        })
      }
      return request<ScanResult>('/scan', {
        method: 'POST',
        body: JSON.stringify({ qr: payload.trim(), items: items || [] }),
      })
    },
    today: () => request<TodayData>('/today'),
    getToday: () => request<TodayData>('/today'),
    menu: () => request<{ items: MenuItemScan[] }>('/menu'),
    getMenu: () => request<{ items: MenuItemScan[] }>('/menu'),
    pair: (codeOrTenant: { code?: string; tenant_id?: number }) =>
      request<{ ok: boolean; tenant_id?: number; stall?: string; error?: string }>('/scan/pair', {
        method: 'POST',
        body: JSON.stringify(codeOrTenant),
      }),
    getTenants: () =>
      request<{ tenants: Array<{ id: number; name: string; stall: string }> }>('/scan/tenants'),
    logout: () => fetch('/keluar', { method: 'POST' }).then(() => ({ ok: true })),
  },
}
