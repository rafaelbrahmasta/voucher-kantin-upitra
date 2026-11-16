import { Staff, Tenant, Transaction, AdminSummaryData, AuthSession, MenuItemScan, ScanResult, TodayData } from '../types'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Terjadi kesalahan sistem' }))
    throw new Error(errorData.error || `HTTP ${res.status}`)
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
    me: () => request<AuthSession>('/api/auth/me'),
    scan: (qr: string, items: Array<{ id: number; qty: number }>) =>
      request<ScanResult>('/api/scan', {
        method: 'POST',
        body: JSON.stringify({ qr, items }),
      }),
    scanCode: (code: string, items: Array<{ id: number; qty: number }>) =>
      request<ScanResult>('/api/scan/code', {
        method: 'POST',
        body: JSON.stringify({ code, items }),
      }),
    today: () => request<TodayData>('/api/today'),
    menu: () => request<{ items: MenuItemScan[] }>('/api/menu'),
    logout: () => request<{ ok: boolean }>('/keluar', { method: 'POST' }),
  },
}
