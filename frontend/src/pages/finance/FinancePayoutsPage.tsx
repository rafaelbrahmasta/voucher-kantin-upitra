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
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../../services/api'

// Helper tanggal & jam zona waktu WIB (Asia/Jakarta, UTC+7) (B4)
const getWibDateStr = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const getWibHour = () => {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: 'numeric',
    hour12: false,
  }).format(new Date())
  return parseInt(hourStr, 10)
}

export default function FinancePayoutsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => getWibDateStr())
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
      // Baca status pencairan yang sudah tersimpan di database
      if (res?.payouts) {
        const transferred = new Set<number>(
          res.payouts.filter((p: any) => p.transferred).map((p: any) => p.id)
        )
        setTransferredSet(transferred)
      }
    } catch (err) {
      console.error('Failed to load payouts', err)
    } finally {
      setLoading(false)
    }
  }

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0)
  }

  const handleMarkTransferred = async (id: number, name: string, amount: number) => {
    if (!window.confirm(`Konfirmasi pencairan kas sebesar ${formatRupiah(amount)} untuk "${name}"?`)) return

    try {
      await api.finance.claimPayout(id, date)
      setTransferredSet((prev) => new Set(prev).add(id))
      setSuccessToast(`Pencairan untuk ${name} berhasil diverifikasi dan tersimpan ke database`)
      setTimeout(() => setSuccessToast(''), 3500)
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan pencairan kas ke database')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const todayStr = getWibDateStr()
  const isTodayBeforeClosing = date === todayStr && getWibHour() < 16

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-500/90 border border-emerald-400 text-white px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      {/* Warning Banner: Cut-off Waktu Pencairan Jam 16:00 */}
      {isTodayBeforeClosing && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-2xl flex items-start gap-3 text-xs shadow-xs">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-950">Pencairan Hari Ini Dibuka Pukul 16:00 WIB</span>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Untuk mencegah voucher kasir tertinggal atau terkunci sebelum operasional makan siang berakhir, pencairan kas transaksi hari ini baru dapat diproses setelah pukul 16:00 WIB. Transaksi tanggal kemarin atau sebelumnya dapat dicairkan kapan saja.
            </p>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <HandCoins className="w-6 h-6 text-amber-600" />
            Rekap Pencairan Kas Stan Kantin
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Validasi klaim voucher makan harian untuk pencairan dana subsidi ke rekening bank mitra kantin UPITRA.
          </p>
        </div>

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
            onClick={handlePrint}
            title="Cetak invoice rekapitulasi"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold shadow-xs transition-colors"
          >
            <Printer className="w-4 h-4 text-sky-600" />
            <span>Cetak / PDF</span>
          </button>

          <button
            onClick={() => loadPayouts(date)}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-sky-100 rounded-2xl p-5 shadow-xs">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Voucher Diklaim</span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {data?.totalCount || 0} <span className="text-xs font-medium text-slate-400">lembar</span>
          </div>
        </div>

        <div className="bg-white border border-amber-100 rounded-2xl p-5 shadow-xs">
          <span className="text-xs text-amber-700 font-bold uppercase tracking-wider">Total Dana Subsidi Dibayarkan</span>
          <div className="text-2xl font-black text-amber-600 mt-1 font-mono">
            {formatRupiah(data?.totalAmount || 0)}
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Tanggal Operasional</span>
          <div className="text-lg font-bold text-slate-800 mt-1">
            {data?.dateLabel || date}
          </div>
        </div>
      </div>

      {/* Payouts Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-sky-50/70 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Stan & Lokasi</th>
                <th className="py-3.5 px-4">Pemilik Stan</th>
                <th className="py-3.5 px-4">Rekening Tujuan Pencairan</th>
                <th className="py-3.5 px-4 text-center">Voucher Sah</th>
                <th className="py-3.5 px-4 text-right">Nominal Pencairan</th>
                <th className="py-3.5 px-4 text-right">Status Kas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p>Memuat rekapitulasi pencairan kas...</p>
                  </td>
                </tr>
              ) : !data?.payouts || data.payouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <HandCoins className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">Belum ada klaim stan kantin pada tanggal ini.</p>
                  </td>
                </tr>
              ) : (
                data.payouts.map((item: any) => {
                  const isDone = transferredSet.has(item.id)
                  return (
                    <tr key={item.id} className="hover:bg-sky-50/30 transition-colors">
                      {/* Stall */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">{item.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{item.stall || 'Pujasera'}</div>
                      </td>

                      {/* Owner */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.owner || '-'}</span>
                        </div>
                      </td>

                      {/* Bank Account */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <CreditCard className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>
                            <strong className="text-slate-900">{item.bankName}</strong> {item.bankAccount || '-'}
                          </span>
                        </div>
                      </td>

                      {/* Voucher Count */}
                      <td className="py-3.5 px-4 text-center font-bold text-slate-900">
                        {item.count > 0 ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[11px]">
                            {item.count} voucher
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">0</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono text-emerald-600 font-black text-sm">
                          {formatRupiah(item.amount)}
                        </div>
                      </td>

                      {/* Status / Action */}
                      <td className="py-3.5 px-4 text-right">
                        {item.amount === 0 ? (
                          <span className="text-slate-400 italic text-[11px]">Nihil</span>
                        ) : isDone ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Kas Dicairkan
                          </span>
                        ) : (
                          <button
                            onClick={() => handleMarkTransferred(item.id, item.name, item.amount)}
                            disabled={isTodayBeforeClosing}
                            title={
                              isTodayBeforeClosing
                                ? 'Pencairan hari ini baru dibuka setelah pukul 16:00 WIB'
                                : 'Cairkan kas stan'
                            }
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-sm shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            {isTodayBeforeClosing ? 'Tunggu 16:00 WIB' : 'Cairkan Kas'}
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
