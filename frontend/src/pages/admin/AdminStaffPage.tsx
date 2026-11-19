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
} from 'lucide-react'
import { api } from '../../services/api'
import { Staff } from '../../types'

export default function AdminStaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

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

  const handleResend = async (id: number, name: string) => {
    try {
      setResendingId(id)
      const res = await api.admin.resendVoucher(id)
      showToast(res.message || `Voucher untuk ${name} berhasil dibuat ulang dan dikirimkan`)
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

  const filteredStaff = staffList.filter((s) => {
    if (statusFilter === 'active') return s.is_active
    if (statusFilter === 'inactive') return !s.is_active
    return true
  })

  const totalCount = staffList.length
  const activeCount = staffList.filter((s) => s.is_active).length

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

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-sky-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Tambah Dosen / Staf
        </button>
      </div>

      {/* Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-sky-100 rounded-2xl p-4 shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Dosen & Staf</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalCount} orang</div>
        </div>
        <div className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-xs">
          <span className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Penerima Aktif</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{activeCount} orang</div>
        </div>
        <div className="bg-white border border-rose-100 rounded-2xl p-4 shadow-xs">
          <span className="text-xs text-rose-700 font-semibold uppercase tracking-wider">Status Non-Aktif</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{totalCount - activeCount} orang</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
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
              className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                statusFilter === 'all' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aktif ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                statusFilter === 'inactive' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nonaktif ({totalCount - activeCount})
            </button>
          </div>

          <button
            onClick={() => loadStaff(search)}
            title="Refresh data"
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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

                    {/* Status Voucher Hari Ini & Tombol Kirim Ulang (Anti-Hilang) */}
                    <td className="py-3.5 px-4 text-center">
                      {staff.today_voucher_status === 'used' ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Terpakai di Stan
                        </span>
                      ) : staff.today_voucher_status === 'issued' ? (
                        <div className="inline-flex items-center gap-1.5">
                          {staff.today_voucher_email_sent ? (
                            <span className="inline-flex items-center gap-1 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full text-[11px] font-bold text-sky-700" title="Voucher aktif dan telah dikirimkan ke email Outlook penerima">
                              <Ticket className="w-3.5 h-3.5 text-sky-600" />
                              Terkirim ke Email
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-700" title="Email belum terkirim. Klik tombol di samping untuk kirim ulang.">
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              Email Tertunda
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleResend(staff.id, staff.name)}
                            disabled={resendingId === staff.id}
                            title="Buat ulang token & kirim ulang email voucher"
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-sky-600 border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${resendingId === staff.id ? 'animate-spin text-sky-600' : ''}`} />
                          </button>
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
    </div>
  )
}
