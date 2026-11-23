import React, { useEffect, useState } from 'react'
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Mail,
  Building2,
  IdCard,
  AlertCircle,
  X,
  Power,
  RefreshCw,
  Ticket,
  Copy,
  QrCode,
  Loader2,
  Printer,
  FileDown,
} from 'lucide-react'
import { api } from '../../services/api'
import { Staff, StaffVoucherData } from '../../types'

export default function AdminStaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [voucherFilter, setVoucherFilter] = useState<'all' | 'issued' | 'used' | 'unissued'>('all')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [formData, setFormData] = useState({
    nip: '',
    name: '',
    email: '',
    unit: '',
    is_active: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successToast, setSuccessToast] = useState('')

  // Voucher Card Popup State
  const [selectedStaffVoucher, setSelectedStaffVoucher] = useState<StaffVoucherData | null>(null)
  const [voucherModalOpen, setVoucherModalOpen] = useState(false)
  const [loadingVoucherModal, setLoadingVoucherModal] = useState(false)
  const [voucherCopied, setVoucherCopied] = useState(false)

  const handleViewVoucherCard = async (staff: Staff) => {
    try {
      setLoadingVoucherModal(true)
      setVoucherModalOpen(true)
      const data = await api.admin.getStaffVoucher(staff.id)
      setSelectedStaffVoucher(data)
    } catch (err: any) {
      alert(err.message || 'Gagal memuat kartu voucher')
      setVoucherModalOpen(false)
    } finally {
      setLoadingVoucherModal(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVoucherModalOpen(false)
    }
    if (voucherModalOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [voucherModalOpen])

  useEffect(() => {
    loadStaff()
  }, [])

  const loadStaff = async (query = '') => {
    try {
      setLoading(true)
      const data = await api.admin.getStaff(query)
      setStaffList(data.staff || [])
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memuat daftar dosen & staf')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadStaff(search)
  }

  const handleOpenModal = (staff?: Staff) => {
    setErrorMessage('')
    if (staff) {
      setEditingStaff(staff)
      setFormData({
        nip: staff.nip || '',
        name: staff.name,
        email: staff.email,
        unit: staff.unit || '',
        is_active: staff.is_active,
      })
    } else {
      setEditingStaff(null)
      setFormData({
        nip: '',
        name: '',
        email: '',
        unit: '',
        is_active: true,
      })
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingStaff(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMessage('')

    try {
      if (editingStaff) {
        await api.admin.updateStaff(editingStaff.id, formData)
        showToast('Data dosen / staf berhasil diperbarui')
      } else {
        await api.admin.createStaff(formData)
        showToast('Dosen / staf baru berhasil ditambahkan')
      }
      handleCloseModal()
      loadStaff(search)
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan data')
    } finally {
      setSubmitting(false)
    }
  }

  const [resendingId, setResendingId] = useState<number | null>(null)

  const handleResend = async (id: number, name: string, emailSent?: boolean) => {
    if (emailSent) {
      if (!window.confirm('QR lama akan tidak berlaku. Lanjutkan?')) {
        return
      }
    }

    try {
      setResendingId(id)
      const res = await api.admin.resendVoucher(id)
      showToast(res.message || `Voucher baru (QR Code & Nomor Kode) untuk ${name} berhasil dibuat ulang dan dikirimkan`)
      loadStaff(search)
    } catch (err: any) {
      alert(err.message || 'Gagal mengirim ulang voucher')
    } finally {
      setResendingId(null)
    }
  }

  const handleToggle = async (id: number) => {
    try {
      await api.admin.toggleStaff(id)
      setStaffList((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !s.is_active } : s))
      )
      showToast('Status keaktifan staf berhasil diperbarui')
    } catch (err: any) {
      alert(err.message || 'Gagal mengubah status staf')
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Hapus permanen dosen/staf "${name}"?`)) return

    try {
      await api.admin.deleteStaff(id)
      setStaffList((prev) => prev.filter((s) => s.id !== id))
      showToast('Data dosen / staf berhasil dihapus')
    } catch (err: any) {
      setInfoModal({
        title: 'Tidak Dapat Menghapus Staf',
        message: err.message || 'Gagal menghapus data',
      })
    }
  }

  const showToast = (msg: string) => {
    setSuccessToast(msg)
    setTimeout(() => setSuccessToast(''), 3500)
  }

  const handleExportTodayVouchers = () => {
    const headers = [
      'No',
      'Nama Dosen/Staf',
      'NIP',
      'Email Kampus',
      'Unit/Fakultas',
      'Status Keaktifan',
      'Status Voucher Hari Ini',
      'Nomor Kode Voucher',
      'Status Email',
      'Waktu Ditukar',
      'Stan Kantin',
    ]
    const rows = staffList.map((s, idx) => [
      idx + 1,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.nip || '-'}"`,
      `"${s.email}"`,
      `"${s.unit || '-'}"`,
      s.is_active ? 'Aktif' : 'Nonaktif',
      s.today_voucher_status === 'used'
        ? 'Sudah Ditukar'
        : s.today_voucher_status === 'issued'
        ? 'Siap Pakai'
        : 'Belum Terbit',
      `"${s.today_voucher_code || '-'}"`,
      s.today_voucher_email_sent ? 'Terkirim' : 'Belum Terkirim',
      s.today_voucher_used_at
        ? new Date(s.today_voucher_used_at).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jakarta',
          }) + ' WIB'
        : '-',
      `"${s.today_tenant_name || '-'}"`,
    ])
    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `rekap-voucher-upitra-${new Date().toISOString().split('T')[0]}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Rekapan voucher hari ini berhasil diexport ke CSV!')
  }

  const filteredStaff = staffList.filter((s) => {
    if (statusFilter === 'active' && !s.is_active) return false
    if (statusFilter === 'inactive' && s.is_active) return false
    if (voucherFilter === 'issued' && s.today_voucher_status !== 'issued') return false
    if (voucherFilter === 'used' && s.today_voucher_status !== 'used') return false
    if (voucherFilter === 'unissued' && (s.today_voucher_id || !s.is_active)) return false
    return true
  })

  const totalCount = staffList.length
  const activeCount = staffList.filter((s) => s.is_active).length
  const issuedCount = staffList.filter((s) => s.today_voucher_status === 'issued').length
  const usedCount = staffList.filter((s) => s.today_voucher_status === 'used').length
  const unissuedCount = staffList.filter((s) => s.is_active && !s.today_voucher_id).length

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-500/90 border border-emerald-400 text-white px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-sky-600" />
            Manajemen Dosen & Staf
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Kelola daftar penerima voucher makan harian Rp5.000 Universitas Pignatelli Triputra.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportTodayVouchers}
            title="Download file CSV rekap data staf penerima voucher hari ini beserta nomor kode & statusnya"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-emerald-700" />
            <span>Export CSV Hari Ini</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-sky-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Dosen / Staf
          </button>
        </div>
      </div>

      {/* Metric Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-sky-100 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">Total Dosen & Staf</span>
          <div className="text-xl font-black text-slate-900 mt-1">{totalCount} <span className="text-xs font-normal text-slate-400">orang</span></div>
          <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">{activeCount} staf aktif</span>
        </div>
        <div className="bg-white border border-sky-200 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] text-sky-700 font-semibold uppercase tracking-wider block">Siap Digunakan</span>
          <div className="text-xl font-black text-sky-600 mt-1">{issuedCount} <span className="text-xs font-normal text-slate-400">voucher</span></div>
          <span className="text-[10px] text-sky-600 font-bold block mt-0.5">Sudah terbit & siap scan</span>
        </div>
        <div className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wider block">Sudah Ditukar</span>
          <div className="text-xl font-black text-emerald-600 mt-1">{usedCount} <span className="text-xs font-normal text-slate-400">voucher</span></div>
          <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">Terklaim di stan kantin</span>
        </div>
        <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] text-amber-700 font-semibold uppercase tracking-wider block">Belum Terbit</span>
          <div className="text-xl font-black text-amber-600 mt-1">{unissuedCount} <span className="text-xs font-normal text-slate-400">staf</span></div>
          <span className="text-[10px] text-amber-700 font-bold block mt-0.5">Auto-terbit saat jam 10:00</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-2 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <form onSubmit={handleSearch} className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, NIP, email, atau unit..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
            />
          </form>

          <div className="flex items-center gap-2">
            {/* Status Tabs */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  statusFilter === 'all' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({totalCount})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aktif ({activeCount})
              </button>
              <button
                onClick={() => setStatusFilter('inactive')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  statusFilter === 'inactive' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Nonaktif ({totalCount - activeCount})
              </button>
            </div>

            <button
              onClick={() => loadStaff(search)}
              title="Refresh data"
              className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Filter Status Voucher Hari Ini */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-[11px]">
          <span className="text-slate-400 font-bold mr-1">Filter Voucher Hari Ini:</span>
          <button
            onClick={() => setVoucherFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              voucherFilter === 'all'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Semua Voucher
          </button>
          <button
            onClick={() => setVoucherFilter('issued')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              voucherFilter === 'issued'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200'
            }`}
          >
            Siap Pakai ({issuedCount})
          </button>
          <button
            onClick={() => setVoucherFilter('used')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              voucherFilter === 'used'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Sudah Ditukar ({usedCount})
          </button>
          <button
            onClick={() => setVoucherFilter('unissued')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              voucherFilter === 'unissued'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            Belum Terbit ({unissuedCount})
          </button>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-sky-50/70 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Nama Lengkap & NIP</th>
                <th className="py-3.5 px-4">Email Kampus (Outlook)</th>
                <th className="py-3.5 px-4">Unit / Fakultas</th>
                <th className="py-3.5 px-4 text-center">Status Master</th>
                <th className="py-3.5 px-4 text-center">Voucher Hari Ini</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p>Memuat data dosen dan staf...</p>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">Tidak ada data dosen atau staf ditemukan.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau tambah staf baru.</p>
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => (
                  <tr
                    key={staff.id}
                    className="hover:bg-sky-50/30 transition-colors group"
                  >
                    {/* Name & NIP */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm group-hover:text-sky-600 transition-colors">
                        {staff.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] mt-0.5">
                        <IdCard className="w-3.5 h-3.5 text-slate-400" />
                        {staff.nip ? staff.nip : <span className="italic text-slate-400">Tanpa NIP</span>}
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Mail className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        <span className="truncate max-w-[220px]" title={staff.email}>
                          {staff.email}
                        </span>
                      </div>
                    </td>

                    {/* Unit / Faculty */}
                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>{staff.unit || <span className="italic text-slate-400">Umum</span>}</span>
                      </div>
                    </td>

                    {/* Status Master */}
                    <td className="py-3.5 px-4 text-center">
                      {staff.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Aktif (Dapat Voucher)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          <XCircle className="w-3 h-3" />
                          Nonaktif
                        </span>
                      )}
                    </td>

                    {/* Status Voucher Hari Ini, Serial Number & Tombol Lihat QR */}
                    <td className="py-3.5 px-4 text-center">
                      {staff.today_voucher_status === 'used' ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Terpakai di Stan
                          </span>
                          {staff.today_tenant_name && (
                            <span className="text-[10px] text-slate-600 font-medium truncate max-w-[140px]" title={staff.today_tenant_name}>
                              {staff.today_tenant_name}
                            </span>
                          )}
                          {staff.today_voucher_used_at && (
                            <span className="text-[9px] text-slate-400 font-mono">
                              {new Date(staff.today_voucher_used_at).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Jakarta',
                              })} WIB
                            </span>
                          )}
                          <div className="flex items-center justify-center gap-1.5 mt-0.5">
                            <span className="font-mono text-xs font-black text-slate-600 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-lg tracking-wider">
                              {staff.today_voucher_code || 'VOUCHER'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleViewVoucherCard(staff)}
                              title="Lihat detail kartu voucher & QR Code"
                              className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-slate-300 transition-colors cursor-pointer"
                            >
                              <QrCode className="w-3 h-3" />
                              Lihat QR
                            </button>
                          </div>
                        </div>
                      ) : staff.today_voucher_status === 'issued' ? (
                        <div className="flex flex-col items-center gap-1.5">
                          {/* Serial Number & Tombol Buka QR Code */}
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="font-mono text-xs font-black text-sky-900 bg-sky-100/90 border border-sky-300 px-2 py-0.5 rounded-lg tracking-wider shadow-2xs">
                              {staff.today_voucher_code || 'VOUCHER'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(staff.today_voucher_code || '')
                                showToast(`Kode ${staff.today_voucher_code} disalin!`)
                              }}
                              title="Salin Nomor Kode"
                              className="p-1 hover:bg-sky-100 rounded text-sky-700 transition-colors cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewVoucherCard(staff)}
                              title="Lihat QR Code & Kartu Voucher Dosen/Staf ini"
                              className="inline-flex items-center gap-1 bg-sky-600 hover:bg-sky-700 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-xs transition-colors cursor-pointer"
                            >
                              <QrCode className="w-3 h-3" />
                              Lihat QR
                            </button>
                          </div>

                          {/* Status Pengiriman Email & Tombol Kirim Ulang */}
                          <div className="flex items-center justify-center gap-1 text-[10px]">
                            {staff.today_voucher_email_sent ? (
                              <span className="inline-flex items-center gap-1 text-sky-700 font-semibold" title="Voucher aktif & sudah terkirim ke email dosen/staf">
                                <Ticket className="w-3 h-3 text-sky-600" />
                                Terkirim ke Email
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Email belum terkirim. Klik tombol refresh untuk kirim ulang">
                                <AlertCircle className="w-3 h-3 text-amber-600" />
                                Email Tertunda
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleResend(staff.id, staff.name, staff.today_voucher_email_sent)}
                              disabled={resendingId === staff.id}
                              title="Buat ulang token & kirim ulang email voucher"
                              className="p-0.5 hover:bg-slate-100 rounded text-slate-500 hover:text-sky-600 transition-colors cursor-pointer disabled:opacity-50 ml-1"
                            >
                              <RefreshCw className={`w-3 h-3 ${resendingId === staff.id ? 'animate-spin text-sky-600' : ''}`} />
                            </button>
                          </div>
                        </div>
                      ) : staff.is_active ? (
                        <span className="text-slate-400 text-xs italic font-medium">Belum Terbit</span>
                      ) : (
                        <span className="text-slate-300 text-xs">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Toggle Active Button */}
                        <button
                          onClick={() => handleToggle(staff.id)}
                          title={staff.is_active ? 'Nonaktifkan voucher' : 'Aktifkan voucher'}
                          className={`p-1.5 rounded-lg border transition-all ${
                            staff.is_active
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenModal(staff)}
                          title="Ubah data"
                          className="p-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(staff.id, staff.name)}
                          title="Hapus data"
                          className="p-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-sky-50/60">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-600" />
                {editingStaff ? `Ubah Data: ${editingStaff.name}` : 'Tambah Dosen & Staf Baru'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap & Gelar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Dr. Rina Kusuma, M.Kom."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Kampus (Akun Microsoft 365) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="nama@upitra.ac.id atau nama@student.upitra.ac.id"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Email ini yang menerima voucher QR code otomatis setiap pagi pukul 09.55 WIB.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    NIP / Nomor Pegawai
                  </label>
                  <input
                    type="text"
                    value={formData.nip}
                    onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                    placeholder="UPITRA-001"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Unit / Fakultas
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="FTI / Rektorat"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-3 p-3 rounded-xl bg-sky-50/60 border border-sky-100 cursor-pointer hover:bg-sky-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Aktif Menerima Voucher
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Jika dicentang, staf ini otomatis mendapatkan voucher Rp5.000 setiap hari kerja.
                    </span>
                  </div>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm shadow-sky-500/25 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : editingStaff ? 'Simpan Perubahan' : 'Tambahkan Staf'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info / Restriction Modal */}
      {infoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-amber-200/60 overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 mb-4 mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>

              <h3 className="text-base font-bold text-slate-900 text-center mb-2">
                {infoModal.title}
              </h3>

              <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3.5 mb-4">
                <p className="text-xs text-amber-900 leading-relaxed text-left whitespace-pre-line">
                  {infoModal.message}
                </p>
              </div>

              <div className="text-[11px] text-slate-500 space-y-1.5 mb-5 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <p className="font-semibold text-slate-700">💡 Mengapa ini terjadi?</p>
                <p>
                  Sistem menjaga <b>integritas audit laporan keuangan</b>. Jika staf yang pernah memiliki riwayat voucher dihapus permanen, rekapitulasi dana dan kuitansi masa lalu akan kehilangan data pemilik transaksi.
                </p>
                <p className="pt-1">
                  <b>Solusi:</b> Cukup klik tombol <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-[10px]">Power (Nonaktifkan)</span> agar staf tidak menerima voucher baru lagi.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInfoModal(null)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-sm"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kartu Voucher Dosen & Tendik (QR Code & Serial Number) */}
      {voucherModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto"
          onClick={() => setVoucherModalOpen(false)}
        >
          {/* Print Styles */}
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #printable-voucher-card, #printable-voucher-card * { visibility: visible !important; }
              #printable-voucher-card {
                position: fixed !important;
                left: 50% !important;
                top: 50% !important;
                transform: translate(-50%, -50%) !important;
                width: 340px !important;
                border: 2px dashed #0284c7 !important;
                padding: 16px !important;
                background: white !important;
                box-shadow: none !important;
              }
            }
          `}</style>

          <div
            className="relative bg-white rounded-3xl max-w-sm w-full my-auto shadow-2xl border border-sky-200 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Visible Floating Close Button X - Menjamin selalu ada tombol X yang jelas */}
            <button
              type="button"
              onClick={() => setVoucherModalOpen(false)}
              className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg transition-all z-50 cursor-pointer"
              title="Tutup (Esc)"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Modal Header with Title & Big Visible Close Button X */}
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-3.5 pr-12 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center font-black text-xs">
                  UP
                </div>
                <div>
                  <h3 className="font-extrabold text-xs leading-tight">Voucher Dosen & Tendik</h3>
                  <p className="text-[10px] text-sky-100">Universitas Pignatelli Triputra</p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-3 bg-slate-50/50">
              {loadingVoucherModal ? (
                <div className="py-12 text-center text-slate-500">
                  <Loader2 className="w-7 h-7 animate-spin mx-auto text-sky-600 mb-2" />
                  <p className="text-xs font-semibold">Memuat kartu voucher & QR Code...</p>
                </div>
              ) : selectedStaffVoucher ? (
                <div className="space-y-3">
                  {/* Kartu Voucher Digital (Bisa dicetak langsung) */}
                  <div id="printable-voucher-card" className="bg-white border-2 border-dashed border-sky-400 rounded-2xl p-3.5 text-center shadow-xs">
                    {/* Badge Nilai & Jam */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 text-xs">
                      <div className="text-left">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Subsidi Kampus</span>
                        <span className="font-black text-sky-600 text-sm">Rp {selectedStaffVoucher.amount.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Jam Berlaku</span>
                        <span className="font-bold text-slate-700 text-xs">{selectedStaffVoucher.valid_hours}</span>
                      </div>
                    </div>

                    {/* Gambar QR Code */}
                    <div className="bg-white p-2 rounded-xl inline-block shadow-sm border border-sky-100 mb-1">
                      {selectedStaffVoucher.qr_png_base64 ? (
                        <img
                          src={`data:image/png;base64,${selectedStaffVoucher.qr_png_base64}`}
                          alt="QR Code Voucher"
                          className="w-36 h-36 mx-auto rounded-lg"
                        />
                      ) : (
                        <div className="w-36 h-36 flex items-center justify-center bg-slate-100 text-slate-400 text-xs rounded-lg">
                          QR Code
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-sky-700 flex items-center justify-center gap-1 mb-2">
                      <span>📷</span> Tunjukkan QR Code ke kamera kasir stan
                    </p>

                    {/* Serial Number / Nomor Kode Cadangan */}
                    <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 text-center">
                      <span className="text-[9px] text-emerald-800 font-bold block uppercase tracking-wider mb-0.5">
                        NOMOR KODE VOUCHER (PILIHAN MANUAL):
                      </span>
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-mono text-lg font-black text-emerald-700 tracking-wider">
                          {selectedStaffVoucher.short_code}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedStaffVoucher.short_code)
                            setVoucherCopied(true)
                            setTimeout(() => setVoucherCopied(false), 2000)
                          }}
                          className="p-1 hover:bg-emerald-100 rounded text-emerald-700 transition-colors cursor-pointer"
                          title="Salin Nomor Kode"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {voucherCopied && (
                        <span className="text-[9px] text-emerald-600 font-bold block">
                          ✓ Berhasil disalin!
                        </span>
                      )}
                      <span className="text-[9px] text-emerald-700/80 block mt-0.5">
                        Kasir dapat menginput kode di atas jika kamera bermasalah
                      </span>
                    </div>

                    {/* Dosen Info di dalam cetakan */}
                    <div className="mt-2 text-[10px] text-slate-600 border-t border-slate-100 pt-1.5 flex justify-between">
                      <span className="font-bold text-slate-800">{selectedStaffVoucher.staff_name}</span>
                      <span className="text-slate-500">{selectedStaffVoucher.unit || 'UPITRA'}</span>
                    </div>
                  </div>

                  {/* Informasi Pemilik Voucher & Status Realtime */}
                  <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-2.5 text-[11px] space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Nama Penerima:</span>
                      <span className="font-bold text-slate-800">{selectedStaffVoucher.staff_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Email:</span>
                      <span className="font-mono text-slate-700 text-[10px]">{selectedStaffVoucher.staff_email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Unit / Fakultas:</span>
                      <span className="font-medium text-slate-700">{selectedStaffVoucher.unit || 'Umum'}</span>
                    </div>
                    <div className="flex justify-between border-t border-sky-200/50 pt-1 mt-1">
                      <span className="text-slate-400">Status Voucher:</span>
                      <span className="font-bold text-emerald-700">
                        {selectedStaffVoucher.status === 'used'
                          ? `Sudah Terpakai ${selectedStaffVoucher.tenant_name ? `di ${selectedStaffVoucher.tenant_name}` : 'di Stan'}`
                          : 'Aktif / Siap Pakai'}
                      </span>
                    </div>
                    {selectedStaffVoucher.status === 'used' && selectedStaffVoucher.used_at && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Waktu Scan:</span>
                        <span className="font-mono text-slate-600">
                          {new Date(selectedStaffVoucher.used_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Jakarta',
                          })} WIB
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Anti-Manipulasi Badge */}
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-2 text-[10px] text-emerald-800 text-center flex items-center justify-center gap-1.5">
                    <span className="font-bold">🔒 Keamanan Kriptografis:</span>
                    <span>Kode & QR berbeda setiap hari & diverifikasi real-time server.</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer with Print and Close Buttons */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                title="Cetak kartu voucher fisik untuk staf"
              >
                <Printer className="w-4 h-4 text-sky-600" />
                <span>Cetak / Print Kartu</span>
              </button>
              <button
                type="button"
                onClick={() => setVoucherModalOpen(false)}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 transition-colors shadow-sm cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
