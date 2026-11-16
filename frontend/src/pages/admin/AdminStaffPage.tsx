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
      alert(err.message || 'Gagal menghapus data')
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
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-blue-400" />
            Manajemen Dosen & Staf
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Kelola daftar penerima voucher makan harian Rp5.000 Universitas Pignatelli Triputra.
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Tambah Dosen / Staf
        </button>
      </div>

      {/* Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
          <span className="text-xs text-slate-400 font-medium">Total Dosen & Staf</span>
          <div className="text-2xl font-extrabold text-white mt-1">{totalCount} orang</div>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
          <span className="text-xs text-emerald-400 font-medium">Penerima Aktif</span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">{activeCount} orang</div>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
          <span className="text-xs text-rose-400 font-medium">Status Non-Aktif</span>
          <div className="text-2xl font-extrabold text-rose-400 mt-1">{totalCount - activeCount} orang</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, NIP, email, atau unit..."
            className="w-full bg-slate-800/80 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </form>

        <div className="flex items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center bg-slate-800/60 p-1 rounded-xl border border-white/5 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Aktif ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === 'inactive' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Nonaktif ({totalCount - activeCount})
            </button>
          </div>

          <button
            onClick={() => loadStaff(search)}
            title="Refresh data"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800/80 border-b border-white/10 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Nama Lengkap & NIP</th>
                <th className="py-3.5 px-4">Email Kampus (Outlook)</th>
                <th className="py-3.5 px-4">Unit / Fakultas</th>
                <th className="py-3.5 px-4 text-center">Status Voucher</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p>Memuat data dosen dan staf...</p>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <p className="font-medium text-slate-300">Tidak ada data dosen atau staf ditemukan.</p>
                    <p className="text-[11px] text-slate-500 mt-1">Coba sesuaikan kata kunci pencarian atau tambah staf baru.</p>
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => (
                  <tr
                    key={staff.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Name & NIP */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">
                        {staff.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] mt-0.5">
                        <IdCard className="w-3.5 h-3.5 text-slate-500" />
                        {staff.nip ? staff.nip : <span className="italic text-slate-600">Tanpa NIP</span>}
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-3.5 px-4 text-slate-300">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate max-w-[220px]" title={staff.email}>
                          {staff.email}
                        </span>
                      </div>
                    </td>

                    {/* Unit / Faculty */}
                    <td className="py-3.5 px-4 text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>{staff.unit || <span className="italic text-slate-500">Umum</span>}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center">
                      {staff.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Aktif (Dapat Voucher)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          <XCircle className="w-3 h-3" />
                          Nonaktif
                        </span>
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
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenModal(staff)}
                          title="Ubah data"
                          className="p-1.5 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(staff.id, staff.name)}
                          title="Hapus data"
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-all"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-800/50">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                {editingStaff ? `Ubah Data: ${editingStaff.name}` : 'Tambah Dosen & Staf Baru'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Lengkap & Gelar <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Dr. Rina Kusuma, M.Kom."
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Kampus (Akun Microsoft 365) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="nama@upitra.ac.id atau nama@student.upitra.ac.id"
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Email ini yang menerima voucher QR code otomatis setiap pagi pukul 09.55 WIB.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    NIP / Nomor Pegawai
                  </label>
                  <input
                    type="text"
                    value={formData.nip}
                    onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                    placeholder="UPITRA-001"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Unit / Fakultas
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="FTI / Rektorat"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/60 border border-white/5 cursor-pointer hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Aktif Menerima Voucher
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Jika dicentang, staf ini otomatis mendapatkan voucher Rp5.000 setiap hari kerja.
                    </span>
                  </div>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-500/25 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : editingStaff ? 'Simpan Perubahan' : 'Tambahkan Staf'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
