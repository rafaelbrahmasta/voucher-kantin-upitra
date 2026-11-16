import React, { useEffect, useState } from 'react'
import {
  ReceiptText,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  Building2,
  Store,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { api } from '../../services/api'
import { Transaction } from '../../types'

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)

  // Filter options
  const [units, setUnits] = useState<string[]>([])
  const [tenants, setTenants] = useState<Array<{ ID: number; Name: string }>>([])

  const todayStr = () => new Date().toISOString().split('T')[0]
  const [dari, setDari] = useState(todayStr)
  const [sampai, setSampai] = useState(todayStr)
  const [selectedTenant, setSelectedTenant] = useState<number>(0)
  const [selectedUnit, setSelectedUnit] = useState<string>('')

  useEffect(() => {
    loadTransactions(1)
  }, [dari, sampai, selectedTenant, selectedUnit])

  const loadTransactions = async (pageTarget = 1) => {
    try {
      setLoading(true)
      const res = await api.admin.getTransactions({
        dari,
        sampai,
        tenant: selectedTenant || undefined,
        unit: selectedUnit || undefined,
        halaman: pageTarget,
      })
      setTransactions(res.transactions || [])
      setTotal(res.total || 0)
      setPage(res.page || 1)
      setPages(res.pages || 1)
      if (res.units) setUnits(res.units)
      if (res.tenants) setTenants(res.tenants)
    } catch (err) {
      console.error('Failed to load transactions', err)
    } finally {
      setLoading(false)
    }
  }

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ReceiptText className="w-6 h-6 text-blue-400" />
            Audit Transaksi Voucher
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Riwayat lengkap penukaran voucher makan dosen & staf di seluruh stan kantin kampus.
          </p>
        </div>

        <button
          onClick={() => loadTransactions(page)}
          className="self-start sm:self-auto p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-white/10 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter Control Box */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 backdrop-blur-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="block text-slate-400 font-semibold mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={dari}
            onChange={(e) => setDari(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-slate-400 font-semibold mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={sampai}
            onChange={(e) => setSampai(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-slate-400 font-semibold mb-1">Stan Kantin</label>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(Number(e.target.value))}
            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value={0}>Semua Stan Kantin</option>
            {tenants.map((t) => (
              <option key={t.ID} value={t.ID}>
                {t.Name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 font-semibold mb-1">Unit / Fakultas</label>
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Semua Unit / Fakultas</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800/80 border-b border-white/10 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Waktu</th>
                <th className="py-3.5 px-4">Penerima (Dosen / Staf)</th>
                <th className="py-3.5 px-4">Stan Kantin</th>
                <th className="py-3.5 px-4">Menu Pesanan</th>
                <th className="py-3.5 px-4 text-right">Nominal Voucher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p>Memuat riwayat transaksi...</p>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <ReceiptText className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <p className="font-medium text-slate-300">Tidak ada transaksi ditemukan pada rentang ini.</p>
                  </td>
                </tr>
              ) : (
                transactions.map((tx, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    {/* Time */}
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      <div>{new Date(tx.At).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(tx.At).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                      </div>
                    </td>

                    {/* Staff */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">{tx.Staff}</div>
                      <div className="text-[11px] text-slate-400">{tx.Unit}</div>
                    </td>

                    {/* Tenant */}
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="font-semibold text-slate-200">{tx.Tenant}</span>
                    </td>

                    {/* Items */}
                    <td className="py-3.5 px-4 text-slate-300">
                      {tx.Items ? (
                        <span className="text-slate-300">{tx.Items}</span>
                      ) : (
                        <span className="italic text-slate-500">Klaim voucher makan harian</span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 text-right">
                      {tx.Voided ? (
                        <span className="text-rose-400 line-through font-mono">
                          {formatRupiah(tx.Amount)} (Batal)
                        </span>
                      ) : (
                        <span className="font-mono text-emerald-400 font-bold text-sm">
                          {formatRupiah(tx.Amount)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pages > 1 && (
          <div className="px-6 py-3.5 bg-slate-800/40 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>
              Menampilkan total <strong className="text-white">{total}</strong> transaksi
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => loadTransactions(page - 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium text-slate-300">
                Halaman {page} dari {pages}
              </span>
              <button
                disabled={page >= pages}
                onClick={() => loadTransactions(page + 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
