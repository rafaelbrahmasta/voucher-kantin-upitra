import React, { useEffect, useState } from 'react'
import {
  HandCoins,
  Calendar,
  CreditCard,
  User,
  CheckCircle2,
  RefreshCw,
  Printer,
  DollarSign,
  Building,
} from 'lucide-react'
import { api } from '../../services/api'

export default function FinancePayoutsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [transferredSet, setTransferredSet] = useState<Set<number>>(new Set())
  const [successToast, setSuccessToast] = useState('')

  useEffect(() => {
    loadPayouts(date)
  }, [date])

  const loadPayouts = async (selectedDate: string) => {
    try {
      setLoading(true)
      const res = await api.finance.getPayouts(selectedDate)
      setData(res)
    } catch (err) {
      console.error('Failed to load payouts', err)
    } finally {
      setLoading(false)
    }
  }

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0)
  }

  const handleMarkTransferred = (id: number, name: string, amount: number) => {
    if (!window.confirm(`Konfirmasi pencairan kas sebesar ${formatRupiah(amount)} untuk "${name}"?`)) return

    setTransferredSet((prev) => new Set(prev).add(id))
    setSuccessToast(`Pencairan untuk ${name} berhasil diverifikasi`)
    setTimeout(() => setSuccessToast(''), 3500)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-500/90 border border-emerald-400 text-white px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <HandCoins className="w-6 h-6 text-amber-400" />
            Rekap Pencairan Kas Stan Kantin
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Validasi klaim voucher makan harian untuk pencairan dana subsidi ke rekening bank mitra kantin.
          </p>
        </div>

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
            onClick={handlePrint}
            title="Cetak invoice rekapitulasi"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-white/10 text-xs font-semibold transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / PDF</span>
          </button>

          <button
            onClick={() => loadPayouts(date)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
          <span className="text-xs text-slate-400 font-medium">Total Voucher Diklaim</span>
          <div className="text-2xl font-extrabold text-white mt-1">
            {data?.totalCount || 0} <span className="text-xs font-normal text-slate-400">lembar</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
          <span className="text-xs text-amber-400 font-medium">Total Dana Subsidi Dibayarkan</span>
          <div className="text-2xl font-extrabold text-amber-400 mt-1 font-mono">
            {formatRupiah(data?.totalAmount || 0)}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
          <span className="text-xs text-slate-400 font-medium">Tanggal Operasional</span>
          <div className="text-lg font-bold text-slate-200 mt-1">
            {data?.dateLabel || date}
          </div>
        </div>
      </div>

      {/* Payouts Table */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800/80 border-b border-white/10 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Stan & Lokasi</th>
                <th className="py-3.5 px-4">Pemilik Stan</th>
                <th className="py-3.5 px-4">Rekening Tujuan Pencairan</th>
                <th className="py-3.5 px-4 text-center">Voucher Sah</th>
                <th className="py-3.5 px-4 text-right">Nominal Pencairan</th>
                <th className="py-3.5 px-4 text-right">Status Kas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p>Memuat rekapitulasi pencairan kas...</p>
                  </td>
                </tr>
              ) : !data?.payouts || data.payouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <HandCoins className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <p className="font-medium text-slate-300">Belum ada klaim stan kantin pada tanggal ini.</p>
                  </td>
                </tr>
              ) : (
                data.payouts.map((item: any) => {
                  const isDone = transferredSet.has(item.id)
                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Stall */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">{item.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{item.stall || 'Pujasera'}</div>
                      </td>

                      {/* Owner */}
                      <td className="py-3.5 px-4 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{item.owner || '-'}</span>
                        </div>
                      </td>

                      {/* Bank Account */}
                      <td className="py-3.5 px-4 text-slate-300">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <CreditCard className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            <strong className="text-white">{item.bankName}</strong> {item.bankAccount || '-'}
                          </span>
                        </div>
                      </td>

                      {/* Voucher Count */}
                      <td className="py-3.5 px-4 text-center font-bold text-white">
                        {item.count > 0 ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[11px]">
                            {item.count} voucher
                          </span>
                        ) : (
                          <span className="text-slate-500 font-normal">0</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono text-emerald-400 font-extrabold text-sm">
                          {formatRupiah(item.amount)}
                        </div>
                      </td>

                      {/* Status / Action */}
                      <td className="py-3.5 px-4 text-right">
                        {item.amount === 0 ? (
                          <span className="text-slate-500 italic text-[11px]">Nihil</span>
                        ) : isDone ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Kas Dicairkan
                          </span>
                        ) : (
                          <button
                            onClick={() => handleMarkTransferred(item.id, item.name, item.amount)}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                          >
                            Cairkan Kas
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
