import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
      // Pairing berhasil jika result bukan 'invalid' (atau jika ada field stall)
      // Server set cookie sesi kasir, kita redirect ke scanner
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex flex-col items-center justify-center p-4 font-sans">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center mx-auto mb-4">
          <QrCode className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Kasir Stan Kantin</h1>
        <p className="text-sm text-emerald-200/60 mt-1">Voucher Kantin UPITRA</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Hubungkan Perangkat</h2>
            <p className="text-xs text-slate-400">Masukkan kode pairing dari Admin IT</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Kode Pairing (8 karakter)
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="xxxx-xxxx"
              maxLength={9}
              className="w-full bg-slate-800/80 border border-white/10 text-white text-center text-xl font-mono tracking-widest rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-400/50 placeholder:text-slate-600 uppercase"
              autoComplete="off"
              autoFocus
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.replace('-', '').length !== 8}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-4 py-3 transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {loading ? 'Menghubungkan...' : 'Hubungkan & Buka Scanner'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-white/5 text-center">
          <p className="text-xs text-slate-500">
            Kode pairing dibuat oleh Admin Super IT di portal manajemen stan kantin.<br />
            Satu kode hanya berlaku untuk satu perangkat.
          </p>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-600">© 2026 Universitas Pignatelli Triputra</p>
    </div>
  )
}
