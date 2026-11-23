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
  FileDown,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'

const getWibDateStr = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
}

const isWibAfter16 = () => {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
    10
  )
  return hour >= 16
}

export default function FinanceDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => getWibDateStr())
  const [exporting, setExporting] = useState(false)

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

  const handleExport = async () => {
    try {
      setExporting(true)
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
      const url = `${apiBase}/api/finance/export?dari=${date}&sampai=${date}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('Gagal mengunduh rekap')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `rekap-voucher-${date}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      console.error('Export error', err)
      alert('Gagal mengunduh file rekap. Silakan coba lagi.')
    } finally {
      setExporting(false)
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
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-amber-600" />
            Ringkasan Anggaran Kas Subsidi Voucher
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Audit penyerapan dana subsidi makan dosen & staf dan kewajiban pencairan stan kantin UPITRA.
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
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Unduh Rekap Excel (CSV)"
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">{exporting ? 'Mengunduh...' : 'Export Excel'}</span>
          </button>
        </div>
      </div>

      {/* Live Operational & Cut-Off Notice */}
      {date === getWibDateStr() && (
        <div
          className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs ${
            isWibAfter16()
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/80 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isWibAfter16() ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <div>
              <span className="font-bold">
                {isWibAfter16()
                  ? 'Cut-Off Operasional Selesai (16:00 WIB)'
                  : 'Jam Operasional Voucher Masih Berlangsung (10:00 – 16:00 WIB)'}
              </span>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {isWibAfter16()
                  ? 'Seluruh voucher hari ini telah dikunci. Stan kantin siap mencairkan klaim subsidinya.'
                  : 'Klaim pencairan kas kasir hari ini baru dapat diproses setelah penutupan pukul 16:00 WIB.'}
              </p>
            </div>
          </div>
          <Link
            to="/finance/payouts"
            className={`shrink-0 px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1 ${
              isWibAfter16()
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                : 'bg-white hover:bg-amber-100 text-amber-800 border border-amber-300'
            }`}
          >
            <span>Buka Pencairan Kas</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Anggaran Diterbitkan */}
        <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs hover:border-sky-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Plafon Anggaran Harian</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3 font-mono">
            {formatRupiah(data?.budgetIssued || 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {data?.sum?.Issued || 0} kuota voucher terbit
          </div>
        </div>

        {/* Card 2: Terserap / Digunakan */}
        <div className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Realisasi Kas Terserap</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-3 font-mono">
            {formatRupiah(data?.budgetUsed || 0)}
          </div>
          <div className="text-xs text-emerald-700 font-bold mt-1">
            {data?.pctUsed || 0}% dari plafon anggaran
          </div>
        </div>

        {/* Card 3: Efisiensi / Hangus */}
        <div className="bg-white border border-amber-100 rounded-2xl p-5 shadow-xs hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Sisa Anggaran Kembali</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 mt-3 font-mono">
            {formatRupiah(data?.budgetExpired || 0)}
          </div>
          <div className="text-xs text-amber-800 font-medium mt-1">
            {data?.unused || 0} voucher tidak digunakan
          </div>
        </div>

        {/* Card 4: Klaim Pencairan */}
        <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs hover:border-sky-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kewajiban Stan Kantin</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <HandCoins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3 font-mono">
            {formatRupiah(data?.budgetUsed || 0)}
          </div>
          <div className="text-xs text-sky-700 font-semibold mt-1">
            Siap dicairkan ke rekening mitra
          </div>
        </div>
      </div>

      {/* Budget Absorption Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-900">Komposisi Penyerapan Subsidi Kampus</span>
          <span className="text-slate-500 font-mono">
            Total Kuota: {data?.sum?.Issued || 0} lembar ({formatRupiah(data?.budgetIssued || 0)})
          </span>
        </div>

        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
          <div
            title={`Terserap: ${data?.pctUsed || 0}%`}
            style={{ width: `${data?.pctUsed || 0}%` }}
            className="bg-emerald-500 h-full transition-all duration-500"
          ></div>
          <div
            title={`Hangus: ${data?.pctExpired || 0}%`}
            style={{ width: `${data?.pctExpired || 0}%` }}
            className="bg-amber-400 h-full transition-all duration-500"
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
            <span className="text-slate-600">
              Terserap: <strong className="text-slate-900">{data?.pctUsed || 0}%</strong> ({formatRupiah(data?.budgetUsed || 0)})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-400"></div>
            <span className="text-slate-600">
              Kembali ke Kas: <strong className="text-slate-900">{data?.pctExpired || 0}%</strong> ({formatRupiah(data?.budgetExpired || 0)})
            </span>
          </div>
          {data?.budgetVoid > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-rose-500"></div>
              <span className="text-slate-600">
                Dibatalkan: <strong className="text-slate-900">{data?.pctVoid || 0}%</strong> ({formatRupiah(data?.budgetVoid || 0)})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout: Stalls Reimbursement & Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Kewajiban Pencairan per Stan */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-amber-600" />
                Klaim Kas per Stan Kantin
              </h3>
              <Link
                to="/finance/pencairan"
                className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1 font-bold"
              >
                Lihat Rekap Pencairan <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.tenants && data.tenants.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.tenants.map((t: any, idx: number) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{t.Name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t.Count} transaksi voucher</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-emerald-600 font-bold text-sm">
                        {formatRupiah(t.Amount)}
                      </div>
                      <span className="inline-block text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 mt-1">
                        Menunggu Pencairan
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                Tidak ada klaim pencairan voucher pada tanggal ini.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Metode Pencairan:</span>
            <span className="font-bold text-slate-800">Transfer Bank Mitra (BCA / Mandiri / BRI)</span>
          </div>
        </div>

        {/* Right: Transaksi Kas Terkini */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-sky-600" />
                Audit Transaksi Terkini
              </h3>
              <Link
                to="/finance/transaksi"
                className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1 font-bold"
              >
                Buka Semua <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.recent && data.recent.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.recent.slice(0, 5).map((tx: any, idx: number) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{tx.Staff}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{tx.Unit}</span>
                        <span>•</span>
                        <span className="text-slate-600 font-medium">{tx.Tenant}</span>
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
                Belum ada transaksi tercatat pada tanggal ini.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              to="/finance/pencairan"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-bold text-amber-800 transition-colors"
            >
              <HandCoins className="w-4 h-4 text-amber-600" />
              Proses Rekap Pencairan Kas Stan Kantin
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
