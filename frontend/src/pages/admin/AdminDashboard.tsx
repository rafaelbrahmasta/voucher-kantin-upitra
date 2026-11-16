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
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <LayoutDashboard className="w-6 h-6 text-sky-600" />
            Ringkasan Operasional Voucher
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pantau realisasi penerbitan dan penggunaan voucher makan kampus UPITRA secara realtime.
          </p>
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-xs">
            <Calendar className="w-4 h-4 text-sky-600" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-xs text-slate-800 font-semibold focus:outline-none cursor-pointer"
            />
          </div>
          <button
            onClick={() => loadSummary(date)}
            className="p-2.5 bg-white hover:bg-sky-50 text-slate-600 hover:text-sky-600 rounded-xl border border-slate-200 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Terbit */}
        <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs hover:border-sky-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Voucher Terbit</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3">
            {data?.sum.Issued || 0} <span className="text-xs font-medium text-slate-400">lembar</span>
          </div>
          <div className="text-xs text-sky-700 font-semibold mt-1 font-mono">
            {formatRupiah((data?.sum.Issued || 0) * 5000)} kuota
          </div>
        </div>

        {/* Card 2: Sudah Digunakan */}
        <div className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Sudah Terpakai</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-3">
            {data?.sum.Used || 0} <span className="text-xs font-medium text-slate-400">lembar</span>
          </div>
          <div className="text-xs text-emerald-700 font-bold mt-1 font-mono">
            {formatRupiah(data?.sum.Nominal || 0)}
          </div>
        </div>

        {/* Card 3: Belum Digunakan */}
        <div className="bg-white border border-amber-100 rounded-2xl p-5 shadow-xs hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Sisa Belum Dipakai</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 mt-3">
            {data?.unused || 0} <span className="text-xs font-medium text-slate-400">lembar</span>
          </div>
          <div className="text-xs text-amber-800 font-medium mt-1">
            Realisasi: <span className="font-bold">{data?.pct || 0}%</span>
          </div>
        </div>

        {/* Card 4: Dosen & Stan */}
        <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs hover:border-sky-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ekosistem Kampus</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3">
            {data?.totalTenants || 0} <span className="text-xs font-medium text-slate-400">stan kantin</span>
          </div>
          <div className="text-xs text-sky-700 font-semibold mt-1">
            {data?.activeStaff || 0} staf aktif terdaftar
          </div>
        </div>
      </div>

      {/* Two Column Layout: Tenant Usage & Recent Scans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Pemakaian per Stan Kantin */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Store className="w-4 h-4 text-sky-600" />
                Klaim per Stan Kantin
              </h3>
              <Link
                to="/admin/tenant"
                className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1 font-bold"
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
                        <span className="font-bold text-slate-800">{t.Name}</span>
                        <div className="text-right">
                          <span className="font-mono text-emerald-600 font-bold">
                            {formatRupiah(t.Amount)}
                          </span>{' '}
                          <span className="text-slate-400">({t.Count} voucher)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-sky-500 to-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                Belum ada transaksi penukaran voucher di stan kantin pada tanggal ini.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Nominal Subsidi per Lembar:</span>
            <span className="font-bold text-sky-700 font-mono">Rp 5.000 / hari kerja</span>
          </div>
        </div>

        {/* Right: Transaksi Terkini */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-sky-600" />
                Transaksi Terkini
              </h3>
              <Link
                to="/admin/transaksi"
                className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1 font-bold"
              >
                Lihat Semua <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.recent && data.recent.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.recent.slice(0, 5).map((tx, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{tx.Staff}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="font-medium text-slate-500">{tx.Unit}</span>
                        <span>•</span>
                        <span className="text-sky-700 font-semibold">{tx.Tenant}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-emerald-600 font-bold">
                        {formatRupiah(tx.Amount)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(tx.At).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                Belum ada transaksi pada tanggal ini.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              to="/admin/staf"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100/80 border border-sky-200 text-xs font-bold text-sky-800 transition-colors"
            >
              <Users className="w-4 h-4 text-sky-600" />
              Kelola Master Penerima Voucher
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
