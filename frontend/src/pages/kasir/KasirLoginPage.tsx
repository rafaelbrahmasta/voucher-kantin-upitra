import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { QrCode, KeyRound, ArrowRight, Loader2 } from 'lucide-react'

export default function KasirLoginPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Format input: otomatis tambah strip setelah 4 karakter (k7m4-qxp8)
  const handleCodeChange = (val: string) => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 8)
    if (clean.length <= 4) {
      setCode(clean)
    } else {
      setCode(clean.slice(0, 4) + '-' + clean.slice(4))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = code.replace('-', '')
    if (normalized.length !== 8) {
      setError('Kode harus 8 karakter (format: xxxx-xxxx)')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/scan/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (res.ok && data.result !== 'invalid') {
        navigate('/scan')
      } else {
        setError('Kode pairing tidak valid atau sudah kedaluwarsa. Minta kode baru dari Admin IT.')
      }
    } catch {
      setError('Gagal terhubung ke server. Pastikan HP terhubung ke jaringan kampus.')
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Masukkan Kode Pairing dari Admin IT
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="xxxx-xxxx"
              maxLength={9}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-center text-xl font-mono tracking-widest rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder:text-slate-400 uppercase font-bold"
              autoComplete="off"
              autoFocus
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.replace('-', '').length !== 8}
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

        <div className="mt-6 pt-5 border-t border-slate-100 text-center text-[11px] text-slate-400">
          Kode pairing 8 digit didapatkan melalui dashboard Admin IT pada menu Kelola Stan Kantin.
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 pb-4 font-medium">
        © 2026 Universitas Pignatelli Triputra
      </div>
    </div>
  )
}
