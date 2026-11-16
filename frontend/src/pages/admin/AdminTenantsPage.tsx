import React, { useEffect, useState } from 'react'
import {
  Store,
  Plus,
  Smartphone,
  KeyRound,
  Unplug,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Building,
  CreditCard,
  User,
  X,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { api } from '../../services/api'
import { Tenant } from '../../types'

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    stall: '',
    owner: '',
    bank_name: '',
    bank_account: '',
    active: true,
  })

  // Pairing Code Modal
  const [pairingModal, setPairingModal] = useState<{ open: boolean; tenantName: string; code: string }>({
    open: false,
    tenantName: '',
    code: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  useEffect(() => {
    loadTenants()
  }, [])

  const loadTenants = async () => {
    try {
      setLoading(true)
      const res = await api.admin.getTenants()
      setTenants(res.tenants || [])
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memuat daftar stan kantin')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3500)
  }

  const handleOpenModal = (tenant?: Tenant) => {
    setErrorMessage('')
    if (tenant) {
      setEditingTenant(tenant)
      setFormData({
        name: tenant.name,
        stall: tenant.stall,
        owner: tenant.owner,
        bank_name: tenant.bank_name,
        bank_account: tenant.bank_account,
        active: tenant.active,
      })
    } else {
      setEditingTenant(null)
      setFormData({
        name: '',
        stall: '',
        owner: '',
        bank_name: 'BCA',
        bank_account: '',
        active: true,
      })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMessage('')

    try {
      if (editingTenant) {
        await api.admin.updateTenant(editingTenant.id, formData)
        showToast('Data stan kantin berhasil diperbarui')
      } else {
        await api.admin.createTenant(formData)
        showToast('Stan kantin baru berhasil ditambahkan')
      }
      setIsModalOpen(false)
      loadTenants()
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan stan kantin')
    } finally {
      setSubmitting(false)
    }
  }

  const handleIssueCode = async (id: number, name: string) => {
    try {
      const res = await api.admin.issueCode(id)
      setPairingModal({
        open: true,
        tenantName: name,
        code: res.code,
      })
    } catch (err: any) {
      alert(err.message || 'Gagal membuat kode pairing')
    }
  }

  const handleRevokeDevice = async (id: number, name: string) => {
    if (!window.confirm(`Putus semua koneksi HP kasir untuk stan "${name}"?`)) return
    try {
      await api.admin.revokeDevices(id)
      showToast('Koneksi HP stan berhasil diputus')
      loadTenants()
    } catch (err: any) {
      alert(err.message || 'Gagal memutuskan HP')
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Hapus permanen stan "${name}"? Pastikan tidak ada transaksi aktif.`)) return
    try {
      await api.admin.deleteTenant(id)
      showToast('Stan kantin berhasil dihapus')
      loadTenants()
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus stan kantin')
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-500/90 border border-emerald-400 text-white px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Store className="w-6 h-6 text-emerald-400" />
            Manajemen Stan Kantin
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Kelola stan makanan & minuman, koneksi scanner HP kasir, dan rekening pencairan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Tambah Stan Kantin
          </button>
          <button
            onClick={loadTenants}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tenant Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            <div className="inline-block w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs">Memuat daftar stan kantin...</p>
          </div>
        ) : tenants.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-white/5">
            <Store className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">Belum ada stan kantin terdaftar</p>
            <p className="text-xs text-slate-500 mt-1">Klik tombol "+ Tambah Stan Kantin" untuk mendaftarkan stan baru.</p>
          </div>
        ) : (
          tenants.map((t) => (
            <div
              key={t.id}
              className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 backdrop-blur-sm shadow-xl flex flex-col justify-between hover:border-emerald-500/30 transition-all duration-300 group"
            >
              <div>
                {/* Top Badge & Title */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-white/5">
                      {t.stall || 'Stan Umum'}
                    </span>
                    <h3 className="font-extrabold text-base text-white mt-1.5 group-hover:text-emerald-300 transition-colors">
                      {t.name}
                    </h3>
                  </div>
                  {t.active ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                      Aktif
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shrink-0">
                      Tutup
                    </span>
                  )}
                </div>

                {/* Info Fields */}
                <div className="space-y-2 text-xs text-slate-300 py-3 border-y border-white/5 my-3">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Pemilik: <strong className="text-white">{t.owner || '-'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Rekening: <strong className="font-mono text-white">{t.bank_name} {t.bank_account}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      Perangkat Kasir:{' '}
                      {t.has_device ? (
                        <span className="text-emerald-400 font-semibold">● Terhubung</span>
                      ) : (
                        <span className="text-slate-500 italic">Belum terhubung</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleIssueCode(t.id, t.name)}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Kode Pairing
                  </button>

                  <button
                    onClick={() => handleRevokeDevice(t.id, t.name)}
                    disabled={!t.has_device}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs font-semibold transition-colors disabled:opacity-40 disabled:hover:bg-slate-800"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    Putus HP
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => handleOpenModal(t)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Ubah stan"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id, t.name)}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-colors"
                    title="Hapus stan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Tambah / Edit Stan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-800/50">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-400" />
                {editingTenant ? `Ubah Stan: ${editingTenant.name}` : 'Tambah Stan Kantin Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Stan / Warung <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Kantin Mbak Siti / Soto Ayam Barokah"
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nomor / Lokasi Stan
                  </label>
                  <input
                    type="text"
                    value={formData.stall}
                    onChange={(e) => setFormData({ ...formData, stall: e.target.value })}
                    placeholder="Stan 01 / Pujasera"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Pemilik / Pengelola
                  </label>
                  <input
                    type="text"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    placeholder="Siti Rahayu"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Bank
                  </label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    placeholder="BCA / Mandiri / BRI"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nomor Rekening
                  </label>
                  <input
                    type="text"
                    value={formData.bank_account}
                    onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                    placeholder="1234567890"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-800/60 border border-white/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-white">
                    Stan Beroperasi Aktif
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-500/25 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : editingTenant ? 'Simpan Perubahan' : 'Tambahkan Stan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Kode Pairing HP Kasir */}
      {pairingModal.open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 mx-auto flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6" />
            </div>

            <h3 className="font-bold text-base text-white">Kode Pairing HP Kasir</h3>
            <p className="text-xs text-slate-400 mt-1">{pairingModal.tenantName}</p>

            <div className="my-6 p-4 rounded-xl bg-slate-800/80 border border-blue-500/30">
              <div className="font-mono text-2xl font-black text-blue-300 tracking-widest">
                {pairingModal.code}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Masukkan kode ini di HP kasir saat login perangkat stan kantin.
              </p>
            </div>

            <button
              onClick={() => setPairingModal({ open: false, tenantName: '', code: '' })}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
