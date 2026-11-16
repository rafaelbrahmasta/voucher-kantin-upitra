import React, { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Ticket,
  CheckCircle2,
  Clock,
  Store,
  Users,
  TrendingUp,
  Receipt,
  Calendar,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import { AdminSummaryData } from '../../types'

export default function AdminDashboard() {
  const [data, setData] = useState<AdminSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    loadSummary(date)
  }, [date])

  const loadSummary = async (selectedDate: string) => {
    try {
      setLoading(true)
      const res = await api.admin.getSummary(selectedDate)
      setData(res)
    } catch (err) {
      console.error('Failed to load summary', err)
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
            <LayoutDashboard className="w-6 h-6 text-blue-400" />
            Ringkasan Operasional Voucher
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Pantau realisasi penerbitan dan penggunaan voucher makan kampus secara realtime.
          </p>
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900/60 border border-white/10 px-3 py-1.5 rounded-xl">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
            />
          </div>
          <button
            onClick={() => loadSummary(date)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Terbit */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/90 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Voucher Terbit</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-3">
            {data?.sum.Issued || 0} <span className="text-xs font-normal text-slate-400">lembar</span>
          </div>
          <div className="text-xs text-blue-300/80 mt-1 font-mono">
            {formatRupiah((data?.sum.Issued || 0) * 5000)} kuota
          </div>
        </div>

        {/* Card 2: Sudah Digunakan */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/90 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400">Sudah Terpakai</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-3">
            {data?.sum.Used || 0} <span className="text-xs font-normal text-slate-400">lembar</span>
          </div>
          <div className="text-xs text-emerald-300/80 mt-1 font-mono font-bold">
            {formatRupiah(data?.sum.Nominal || 0)}
          </div>
        </div>

        {/* Card 3: Belum Digunakan */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/90 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400">Sisa Belum Dipakai</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-400 mt-3">
            {data?.unused || 0} <span className="text-xs font-normal text-slate-400">lembar</span>
          </div>
          <div className="text-xs text-amber-300/80 mt-1">
            Realisasi hari ini: <span className="font-bold">{data?.pct || 0}%</span>
          </div>
        </div>

        {/* Card 4: Dosen & Stan */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/90 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-400">Ekosistem Kampus</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-3">
            {data?.totalTenants || 0} <span className="text-xs font-normal text-slate-400">stan kantin</span>
          </div>
          <div className="text-xs text-indigo-300/80 mt-1">
            {data?.activeStaff || 0} staf aktif terdaftar
          </div>
        </div>
      </div>

      {/* Two Column Layout: Tenant Usage & Recent Scans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Pemakaian per Stan Kantin */}
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-400" />
                Klaim per Stan Kantin
              </h3>
              <Link
                to="/admin/tenant"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
              >
                Kelola Stan <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.tenantsUsage && data.tenantsUsage.length > 0 ? (
              <div className="space-y-4">
                {data.tenantsUsage.map((t, idx) => {
                  const maxUsage = Math.max(...data.tenantsUsage.map((x) => x.Count), 1)
                  const percentage = Math.round((t.Count / maxUsage) * 100)
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">{t.Name}</span>
                        <div className="text-right">
                          <span className="font-mono text-emerald-400 font-bold">
                            {formatRupiah(t.Amount)}
                          </span>{' '}
                          <span className="text-slate-500">({t.Count} voucher)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Belum ada transaksi penukaran voucher di stan kantin pada tanggal ini.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>Nominal Voucher per Lembar:</span>
            <span className="font-bold text-white font-mono">Rp 5.000 / hari</span>
          </div>
        </div>

        {/* Right: Transaksi Terkini */}
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-blue-400" />
                Transaksi Terkini
              </h3>
              <Link
                to="/admin/transaksi"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
              >
                Lihat Semua <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.recent && data.recent.length > 0 ? (
              <div className="divide-y divide-white/5">
                {data.recent.slice(0, 5).map((tx, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white">{tx.Staff}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{tx.Unit}</span>
                        <span>•</span>
                        <span className="text-slate-300">{tx.Tenant}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-emerald-400 font-bold">
                        {formatRupiah(tx.Amount)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(tx.At).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Belum ada transaksi pada tanggal ini.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/5">
            <Link
              to="/admin/staf"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
            >
              <Users className="w-4 h-4 text-blue-400" />
              Kelola Master Penerima Voucher
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
