import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { QrCode, ArrowRight, Loader2, KeyRound } from 'lucide-react'
import { api } from '../../services/api'

export default function KasirLoginPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Format input: kode pairing 10 karakter dengan strip setelah 5 karakter (contoh: 7M4QX-P8RTK)
  const handleCodeChange = (val: string) => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
    if (clean.length <= 5) {
      setCode(clean)
    } else {
      setCode(clean.slice(0, 5) + '-' + clean.slice(5))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = code.replace(/[^a-zA-Z0-9]/g, '')
    if (normalized.length !== 10) {
      setError('Kode pairing harus 10 karakter (format: XXXXX-XXXXX)')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.kasir.pair({ code: normalized })
      if (res.ok) {
        localStorage.setItem('upitra_kasir_session', JSON.stringify({
          authenticated: true,
          role: 'tenant',
          tenantId: res.tenant_id,
          stall: res.stall || 'Stan Kantin',
        }))
        navigate('/scan')
      } else {
        setError(res.error || 'Kode pairing tidak valid atau sudah kedaluwarsa. Minta kode baru dari Admin IT.')
      }
    } catch (err: any) {
      setError(err.message || 'Gagal terhubung ke server. Pastikan HP terhubung ke jaringan kampus.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100/70 flex flex-col justify-between p-4 font-sans text-slate-800">
      {/* Top Bar */}
      <div className="max-w-md w-full mx-auto pt-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors">
          ← Beranda UPITRA
        </Link>
        <span className="text-[11px] bg-sky-100 text-sky-800 border border-sky-200 px-2.5 py-0.5 rounded-full font-bold">
          Portal Kasir Kantin
        </span>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-sm mx-auto my-auto bg-white border border-sky-100 rounded-3xl p-7 shadow-xl shadow-sky-900/5">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-sky-500/25">
            <QrCode className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-black text-slate-900">Hubungkan Kasir Stan</h1>
          <p className="text-xs text-slate-500 mt-1">Sistem Voucher Kantin UPITRA</p>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        {/* Form Input Kode Pairing */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Masukkan Kode Pairing dari Admin IT
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="XXXXX-XXXXX"
              maxLength={11}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-center text-2xl font-mono tracking-widest rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder:text-slate-300 uppercase font-black"
              autoComplete="off"
              autoFocus
              spellCheck={false}
            />
            <div className="mt-3 p-3 bg-sky-50/80 rounded-xl border border-sky-100 text-[11px] text-slate-600 leading-relaxed text-left">
              <div className="flex items-center gap-1.5 font-bold text-sky-800 mb-1">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Petunjuk Kasir:</span>
              </div>
              Buka menu <strong>Admin IT &gt; Stan Kantin</strong> lalu klik tombol <strong>"Kode Pairing"</strong> pada stan yang bersangkutan untuk mendapatkan 10 karakter kode aktivasi.
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || code.replace(/[^a-zA-Z0-9]/g, '').length !== 10}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/25 transition-all disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memverifikasi Kode...</span>
              </>
            ) : (
              <>
                <span>Aktifkan Scanner</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      <div className="text-center text-xs text-slate-500 pb-4 font-medium">
        © 2026 Universitas Pignatelli Triputra
      </div>
    </div>
  )
}
