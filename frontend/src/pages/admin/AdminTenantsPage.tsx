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
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Store className="w-6 h-6 text-sky-600" />
            Manajemen Stan Kantin
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Kelola stan makanan & minuman mitra UPITRA, koneksi scanner HP kasir, dan rekening pencairan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-sky-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Tambah Stan Kantin
          </button>
          <button
            onClick={loadTenants}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tenant Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            <div className="inline-block w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs">Memuat daftar stan kantin...</p>
          </div>
        ) : tenants.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
            <Store className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Belum ada stan kantin terdaftar</p>
            <p className="text-xs text-slate-400 mt-1">Klik tombol "+ Tambah Stan Kantin" untuk mendaftarkan stan baru.</p>
          </div>
        ) : (
          tenants.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-sky-400 hover:shadow-md transition-all duration-300 group"
            >
              <div>
                {/* Top Badge & Title */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-100">
                      {t.stall || 'Stan Umum'}
                    </span>
                    <h3 className="font-black text-base text-slate-900 mt-1.5 group-hover:text-sky-600 transition-colors">
                      {t.name}
                    </h3>
                  </div>
                  {t.active ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      Aktif
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                      Tutup
                    </span>
                  )}
                </div>

                {/* Info Fields */}
                <div className="space-y-2 text-xs text-slate-600 py-3 border-y border-slate-100 my-3">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Pemilik: <strong className="text-slate-900">{t.owner || '-'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Rekening: <strong className="font-mono text-slate-900">{t.bank_name} {t.bank_account}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      Perangkat Kasir:{' '}
                      {t.has_device ? (
                        <span className="text-emerald-600 font-bold">● Terhubung</span>
                      ) : (
                        <span className="text-slate-400 italic">Belum terhubung</span>
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
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Kode Pairing
                  </button>

                  <button
                    onClick={() => handleRevokeDevice(t.id, t.name)}
                    disabled={!t.has_device}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition-colors disabled:opacity-40"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    Putus HP
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => handleOpenModal(t)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition-colors"
                    title="Ubah stan"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id, t.name)}
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-sky-100 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-sky-50/60">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Store className="w-4 h-4 text-sky-600" />
                {editingTenant ? `Ubah Stan: ${editingTenant.name}` : 'Tambah Stan Kantin Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Tips Info Kode Pairing */}
              <div className="p-3 bg-sky-50 border border-sky-200/80 rounded-xl text-[11px] text-sky-900 leading-relaxed">
                💡 <strong>Catatan Kode Pairing:</strong> Anda tidak perlu mengetik kode di form ini. Setelah stan ditambahkan, cukup klik tombol <strong>"Kode Pairing"</strong> pada kartu stan untuk menghasilkan kode 8 digit kasir secara otomatis.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Stan / Warung <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Kantin Mbak Siti / Soto Ayam Barokah"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor / Lokasi Stan
                  </label>
                  <input
                    type="text"
                    value={formData.stall}
                    onChange={(e) => setFormData({ ...formData, stall: e.target.value })}
                    placeholder="Stan 01 / Pujasera"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Pemilik / Pengelola
                  </label>
                  <input
                    type="text"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    placeholder="Siti Rahayu"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bank
                  </label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    placeholder="BCA / Mandiri / BRI"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor Rekening
                  </label>
                  <input
                    type="text"
                    value={formData.bank_account}
                    onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                    placeholder="1234567890"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-sky-50/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    Stan Beroperasi Aktif
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 shadow-md shadow-sky-600/20 transition-all disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-sky-100 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-600 mx-auto flex items-center justify-center mb-4 border border-sky-200 shadow-xs">
              <KeyRound className="w-7 h-7" />
            </div>

            <h3 className="font-black text-lg text-slate-900">Kode Pairing HP Kasir</h3>
            <p className="text-xs text-sky-700 font-bold mt-1">{pairingModal.tenantName}</p>

            <div className="my-5 p-5 rounded-2xl bg-sky-50 border-2 border-sky-200">
              <div className="font-mono text-3xl font-black text-sky-700 tracking-widest select-all">
                {pairingModal.code}
              </div>
              <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                Buka <strong>localhost:8080/scan/masuk</strong> di HP kasir, lalu masukkan 8 karakter kode di atas.
              </p>
            </div>

            <button
              onClick={() => setPairingModal({ open: false, tenantName: '', code: '' })}
              className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-colors"
            >
              Selesai & Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
