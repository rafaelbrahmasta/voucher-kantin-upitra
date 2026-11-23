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
  Send,
  Loader2,
  QrCode,
  Eye,
  X,
  Copy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import { AdminSummaryData } from '../../types'

export default function AdminDashboard() {
  const [data, setData] = useState<AdminSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [issuing, setIssuing] = useState(false)
  const [issueResult, setIssueResult] = useState<{ message: string; details: string[]; failed_count?: number } | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewData, setPreviewData] = useState<{
    staff_name: string
    staff_email: string
    unit: string
    date_str: string
    amount: number
    short_code: string
    qr_payload: string
    qr_png_base64: string
    valid_hours: string
    auto_schedule: string
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleOpenPreview = async () => {
    try {
      setPreviewLoading(true)
      setPreviewModalOpen(true)
      const res = await api.admin.getVoucherPreview()
      setPreviewData(res)
    } catch (err) {
      console.error('Failed to load preview', err)
    } finally {
      setPreviewLoading(false)
    }
  }

  const copyShortCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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

  const handleIssueVouchers = async () => {
    if (!window.confirm(`Terbitkan jatah voucher kantin untuk tanggal ${date}?`)) return
    try {
      setIssuing(true)
      const res = await api.admin.issueVouchers(date, false)
      setIssueResult({ message: res.message, details: res.details, failed_count: res.failed_count })
      loadSummary(date)
    } catch (err: any) {
      alert(err.message || 'Gagal menerbitkan voucher')
    } finally {
      setIssuing(false)
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

        {/* Date Selector & Refresh & Issue */}
        <div className="flex flex-wrap items-center gap-2">
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
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenPreview}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-sky-50 text-sky-700 hover:text-sky-800 text-xs font-bold border border-sky-200 shadow-xs transition-colors cursor-pointer"
            title="Lihat Format Tampilan Voucher (QR & Kode)"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview Voucher (QR & Kode)</span>
          </button>
          <button
            onClick={handleIssueVouchers}
            disabled={issuing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-all disabled:opacity-50"
          >
            {issuing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Menerbitkan...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Terbitkan Voucher</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Auto-Scheduler Info Banner */}
      <div className="bg-gradient-to-r from-sky-50 via-sky-50/50 to-white border border-sky-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Jadwal Penerbitan Voucher Otomatis</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-300">
                AKTIF (10:00 WIB)
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Sistem backend otomatis menerbitkan voucher setiap hari kerja (Senin–Jumat) tepat pukul 10:00 WIB ke email dosen & staf aktif. Voucher menyertakan <strong>Gambar QR Code</strong> resmi beserta <strong>Nomor Kode Cadangan</strong>.
            </p>
          </div>
        </div>
        <button
          onClick={handleOpenPreview}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 text-xs font-bold shadow-xs transition-all cursor-pointer"
        >
          <QrCode className="w-3.5 h-3.5" />
          Lihat Contoh Voucher
        </button>
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

      {/* Modal Laporan Penerbitan Voucher */}
      {issueResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-sky-200 overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 mb-4 mx-auto">
                <Ticket className="w-6 h-6" />
              </div>

              <h3 className="text-base font-bold text-slate-900 text-center mb-1">
                Hasil Penerbitan Voucher
              </h3>
              <p className="text-xs text-slate-600 text-center mb-4 leading-relaxed font-medium">
                {issueResult.message}
              </p>

              {(issueResult.failed_count ?? 0) > 0 && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 flex items-center justify-center gap-1.5">
                  <span>⚠️ Ada {issueResult.failed_count} staf gagal diproses. Lihat rincian di bawah.</span>
                </div>
              )}

              <div className="max-h-48 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1 mb-5 font-mono text-slate-700">
                {issueResult.details.map((d, i) => (
                  <div key={i} className="py-0.5 border-b border-slate-200/50 last:border-0">
                    {d}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIssueResult(null)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition-colors shadow-sm"
              >
                Tutup & Perbarui Ringkasan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview Desain Voucher (QR & Nomor Kode) */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-sky-200 overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-black text-sm">
                  UP
                </div>
                <div>
                  <h3 className="font-extrabold text-sm leading-tight">Preview Voucher Dosen & Staf</h3>
                  <p className="text-[10px] text-sky-100">Desain resmi yang dikirim ke email penerima</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 bg-slate-50/50">
              {previewLoading ? (
                <div className="py-16 text-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-600 mb-2" />
                  <p className="text-xs font-semibold">Membuat preview voucher & QR Code...</p>
                </div>
              ) : previewData ? (
                <div className="space-y-4">
                  {/* Kartu Voucher Digital */}
                  <div className="bg-white border-2 border-dashed border-sky-400 rounded-2xl p-5 text-center shadow-sm">
                    {/* Badge Nilai & Jam */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-xs">
                      <div className="text-left">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Subsidi Kampus</span>
                        <span className="font-black text-sky-600 text-base">Rp 5.000</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Jam Berlaku</span>
                        <span className="font-bold text-slate-700">10.00 – 16.00 WIB</span>
                      </div>
                    </div>

                    {/* QR Code Container */}
                    <div className="bg-white p-3 rounded-2xl inline-block shadow-md border border-sky-100 mb-2">
                      {previewData.qr_png_base64 ? (
                        <img
                          src={`data:image/png;base64,${previewData.qr_png_base64}`}
                          alt="QR Code Voucher"
                          className="w-48 h-48 mx-auto rounded-lg"
                        />
                      ) : (
                        <div className="w-48 h-48 flex items-center justify-center bg-slate-100 text-slate-400 text-xs rounded-lg">
                          QR Code
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] font-bold text-sky-700 flex items-center justify-center gap-1">
                      <span>📷</span> Tunjukkan QR Code ini ke kamera kasir stan kantin
                    </p>

                    {/* Nomor Kode Cadangan (Berdampingan dengan QR) */}
                    <div className="mt-4 bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-emerald-800 font-bold block uppercase tracking-wider mb-1">
                        NOMOR KODE VOUCHER (PILIHAN MANUAL):
                      </span>
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-mono text-xl font-black text-emerald-700 tracking-wider">
                          {previewData.short_code}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyShortCode(previewData.short_code)}
                          className="p-1 hover:bg-emerald-100 rounded text-emerald-700 transition-colors cursor-pointer"
                          title="Salin Nomor Kode"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      {copied && (
                        <span className="text-[10px] text-emerald-600 font-bold block mt-1">
                          ✓ Berhasil disalin!
                        </span>
                      )}
                      <span className="text-[10px] text-emerald-700/80 block mt-1">
                        Kasir dapat menginput kode di atas jika kamera bermasalah
                      </span>
                    </div>
                  </div>

                  {/* Informasi Dosen & Jadwal */}
                  <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 text-[11px] space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Penerima Contoh:</span>
                      <span className="font-bold text-slate-800">{previewData.staff_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Unit:</span>
                      <span className="font-medium text-slate-700">{previewData.unit}</span>
                    </div>
                    <div className="flex justify-between border-t border-sky-200/50 pt-1 mt-1">
                      <span className="text-slate-400">Jadwal Auto-Terbit:</span>
                      <span className="font-bold text-sky-700">{previewData.auto_schedule}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="w-full mt-5 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 transition-colors shadow-sm cursor-pointer"
              >
                Tutup Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
