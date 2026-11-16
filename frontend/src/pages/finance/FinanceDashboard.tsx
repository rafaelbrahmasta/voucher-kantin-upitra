import React, { useEffect, useState } from 'react'
import {
  Coins,
  Wallet,
  TrendingUp,
  Clock,
  Ban,
  Calendar,
  RefreshCw,
  Store,
  Receipt,
  ArrowUpRight,
  HandCoins,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'

export default function FinanceDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    loadSummary(date)
  }, [date])

  const loadSummary = async (selectedDate: string) => {
    try {
      setLoading(true)
      const res = await api.finance.getSummary(selectedDate)
      setData(res)
    } catch (err) {
      console.error('Failed to load finance summary', err)
    } finally {
      setLoading(false)
    }
  }

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0)
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-amber-400" />
            Ringkasan Anggaran Kas Subsidi Voucher
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Audit penyerapan dana subsidi makan dosen & staf dan kewajiban pencairan stan kantin UPITRA.
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

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Anggaran Diterbitkan */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/90 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Plafon Anggaran Harian</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-3 font-mono">
            {formatRupiah(data?.budgetIssued || 0)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {data?.sum?.Issued || 0} kuota voucher terbit
          </div>
        </div>

        {/* Card 2: Terserap / Digunakan */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/90 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400">Realisasi Kas Terserap</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-3 font-mono">
            {formatRupiah(data?.budgetUsed || 0)}
          </div>
          <div className="text-xs text-emerald-300/80 mt-1 font-semibold">
            {data?.pctUsed || 0}% dari plafon anggaran
          </div>
        </div>

        {/* Card 3: Efisiensi / Hangus */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/90 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400">Sisa Anggaran Kembali</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-400 mt-3 font-mono">
            {formatRupiah(data?.budgetExpired || 0)}
          </div>
          <div className="text-xs text-amber-300/80 mt-1">
            {data?.unused || 0} voucher tidak digunakan
          </div>
        </div>

        {/* Card 4: Klaim Pencairan */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/90 border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-400">Kewajiban Stan Kantin</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <HandCoins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-3 font-mono">
            {formatRupiah(data?.budgetUsed || 0)}
          </div>
          <div className="text-xs text-purple-300/80 mt-1">
            Siap dicairkan ke rekening mitra
          </div>
        </div>
      </div>

      {/* Budget Absorption Bar */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white">Komposisi Penyerapan Subsidi Kampus</span>
          <span className="text-slate-400 font-mono">
            Total Kuota: {data?.sum?.Issued || 0} lembar ({formatRupiah(data?.budgetIssued || 0)})
          </span>
        </div>

        <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden flex">
          <div
            title={`Terserap: ${data?.pctUsed || 0}%`}
            style={{ width: `${data?.pctUsed || 0}%` }}
            className="bg-emerald-500 h-full transition-all duration-500"
          ></div>
          <div
            title={`Hangus: ${data?.pctExpired || 0}%`}
            style={{ width: `${data?.pctExpired || 0}%` }}
            className="bg-amber-500 h-full transition-all duration-500"
          ></div>
          <div
            title={`Batal: ${data?.pctVoid || 0}%`}
            style={{ width: `${data?.pctVoid || 0}%` }}
            className="bg-rose-500 h-full transition-all duration-500"
          ></div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-[11px] pt-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
            <span className="text-slate-300">
              Terserap: <strong className="text-white">{data?.pctUsed || 0}%</strong> ({formatRupiah(data?.budgetUsed || 0)})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-500"></div>
            <span className="text-slate-300">
              Hangus / Kembali ke Kas: <strong className="text-white">{data?.pctExpired || 0}%</strong> ({formatRupiah(data?.budgetExpired || 0)})
            </span>
          </div>
          {data?.budgetVoid > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-rose-500"></div>
              <span className="text-slate-300">
                Dibatalkan: <strong className="text-white">{data?.pctVoid || 0}%</strong> ({formatRupiah(data?.budgetVoid || 0)})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout: Stalls Reimbursement & Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Kewajiban Pencairan per Stan */}
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-amber-400" />
                Klaim Kas per Stan Kantin
              </h3>
              <Link
                to="/finance/pencairan"
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
              >
                Lihat Rekap Pencairan <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.tenants && data.tenants.length > 0 ? (
              <div className="divide-y divide-white/5">
                {data.tenants.map((t: any, idx: number) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white">{t.Name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t.Count} transaksi voucher</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-emerald-400 font-bold text-sm">
                        {formatRupiah(t.Amount)}
                      </div>
                      <span className="inline-block text-[10px] text-amber-300 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 mt-1">
                        Menunggu Pencairan
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Tidak ada klaim pencairan voucher pada tanggal ini.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>Metode Pencairan:</span>
            <span className="font-semibold text-slate-200">Transfer Bank Mitra (BCA / Mandiri / BRI)</span>
          </div>
        </div>

        {/* Right: Transaksi Kas Terkini */}
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-blue-400" />
                Audit Transaksi Terkini
              </h3>
              <Link
                to="/finance/transaksi"
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
              >
                Buka Semua <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.recent && data.recent.length > 0 ? (
              <div className="divide-y divide-white/5">
                {data.recent.slice(0, 5).map((tx: any, idx: number) => (
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
                Belum ada transaksi tercatat pada tanggal ini.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/5">
            <Link
              to="/finance/pencairan"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-xs font-semibold text-amber-300 hover:text-white transition-colors"
            >
              <HandCoins className="w-4 h-4" />
              Proses Rekap Pencairan Kas Stan Kantin
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
