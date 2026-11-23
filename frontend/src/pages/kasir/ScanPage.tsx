import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  QrCode, CheckCircle2, XCircle, AlertCircle, Clock, LogOut,
  Plus, Minus, ShoppingCart, ChevronRight, Loader2, RotateCcw,
  Keyboard, Camera, List, Banknote
} from 'lucide-react'
import { api } from '../../services/api'
import { MenuItemScan, ScanResult, TodayData } from '../../types'
import jsQR from 'jsqr'

// ─── Tipe tampilan utama ───────────────────────────────────────────────
type View = 'scan' | 'result' | 'today'

// ─── Komponen kartu hasil scan ─────────────────────────────────────────
function ResultCard({
  result,
  onReset,
}: {
  result: ScanResult
  onReset: () => void
}) {
  const isOk = result.result === 'ok'
  const configs: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string; desc: string }> = {
    ok:      { icon: <CheckCircle2 className="w-10 h-10" />, color: 'text-emerald-600', bg: 'border-emerald-200 bg-emerald-50/80', label: 'Voucher Diterima!', desc: `Rp${(result.amount ?? 0).toLocaleString('id')} berhasil diklaim` },
    invalid: { icon: <XCircle className="w-10 h-10" />,      color: 'text-rose-600',    bg: 'border-rose-200 bg-rose-50/80',       label: 'QR Tidak Valid',   desc: 'Kode voucher tidak dikenali atau rusak' },
    used:    { icon: <AlertCircle className="w-10 h-10" />,   color: 'text-amber-600',   bg: 'border-amber-200 bg-amber-50/80',     label: 'Sudah Digunakan',  desc: 'Voucher ini sudah diklaim sebelumnya' },
    expired: { icon: <Clock className="w-10 h-10" />,         color: 'text-slate-600',   bg: 'border-slate-200 bg-slate-50',     label: 'Kedaluwarsa',      desc: 'Voucher hari ini sudah tidak berlaku' },
    void:    { icon: <XCircle className="w-10 h-10" />,       color: 'text-rose-600',    bg: 'border-rose-200 bg-rose-50/80',       label: 'Dibatalkan',       desc: 'Voucher ini sudah dibatalkan' },
  }
  const cfg = configs[result.result] ?? configs.invalid

  return (
    <div className={`rounded-2xl border p-6 ${cfg.bg} flex flex-col gap-4 shadow-sm`}>
      {/* Status */}
      <div className="flex items-center gap-4">
        <div className={cfg.color}>{cfg.icon}</div>
        <div>
          <div className={`text-lg font-bold ${cfg.color}`}>{cfg.label}</div>
          <div className="text-xs text-slate-600">{cfg.desc}</div>
        </div>
      </div>

      {/* Detail staf */}
      {result.staff && (
        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 text-xs space-y-1.5 shadow-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Pemilik Voucher</span>
            <span className="font-bold text-slate-800">{result.staff}</span>
          </div>
          {result.unit && (
            <div className="flex justify-between">
              <span className="text-slate-500">Unit / Fakultas</span>
              <span className="text-slate-700 font-medium">{result.unit}</span>
            </div>
          )}
          {isOk && result.amount && (
            <div className="flex justify-between border-t border-slate-100 pt-1.5 mt-1.5">
              <span className="text-slate-500 font-medium">Nilai Voucher</span>
              <span className="font-bold text-emerald-600">Rp{result.amount.toLocaleString('id')}</span>
            </div>
          )}
        </div>
      )}

      {/* Rincian pesanan */}
      {isOk && result.order && result.order.items.length > 0 && (
        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 text-xs space-y-2 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Rincian Pesanan</div>
          {result.order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-slate-700">
              <span>{item.name} ×{item.qty}</span>
              <span className="font-medium">Rp{item.subtotal.toLocaleString('id')}</span>
            </div>
          ))}
          <div className="border-t border-slate-100 pt-2 mt-2 flex justify-between font-bold">
            <span className="text-slate-600">Total Pesanan</span>
            <span className="text-slate-900">Rp{result.order.total.toLocaleString('id')}</span>
          </div>
          {result.order.pay > 0 && (
            <div className="flex justify-between text-amber-700 font-bold bg-amber-50 p-2 rounded-lg border border-amber-200">
              <span>Bayar Tunai (selisih)</span>
              <span>Rp{result.order.pay.toLocaleString('id')}</span>
            </div>
          )}
          {result.order.pay <= 0 && (
            <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 p-2 rounded-lg border border-emerald-200">
              <span>Voucher menutup seluruh pesanan</span>
              <span>✓</span>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl py-3 text-xs font-bold shadow-md shadow-sky-600/20 transition-all"
      >
        <RotateCcw className="w-4 h-4" />
        Scan Berikutnya
      </button>
    </div>
  )
}

// ─── Komponen pilih menu ───────────────────────────────────────────────
function MenuPicker({
  items,
  cart,
  onChange,
}: {
  items: MenuItemScan[]
  cart: Record<number, number>
  onChange: (id: number, qty: number) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        Pilih Menu (Opsional)
      </div>
      {items.map((item) => {
        const qty = cart[item.id] ?? 0
        return (
          <div
            key={item.id}
            className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xs"
          >
            <div>
              <div className="text-xs font-bold text-slate-800">{item.name}</div>
              <div className="text-[11px] text-slate-500 font-medium">Rp{item.price.toLocaleString('id')}</div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => onChange(item.id, Math.max(0, qty - 1))}
                disabled={qty === 0}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 flex items-center justify-center transition-all text-slate-700"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-5 text-center text-xs font-bold text-slate-800">{qty}</span>
              <button
                onClick={() => onChange(item.id, qty + 1)}
                className="w-7 h-7 rounded-lg bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center transition-all shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Halaman utama Scanner ─────────────────────────────────────────────
export default function ScanPage() {
  const navigate = useNavigate()

  // State autentikasi
  const [stallName, setStallName] = useState('')
  const [authLoading, setAuthLoading] = useState(true)

  // State view & scan
  const [view, setView] = useState<View>('scan')
  const [manualCode, setManualCode] = useState('')
  const [inputMode, setInputMode] = useState<'camera' | 'manual'>('camera')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)

  // State menu & keranjang
  const [menuItems, setMenuItems] = useState<MenuItemScan[]>([])
  const [cart, setCart] = useState<Record<number, number>>({})
  const [menuLoading, setMenuLoading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  // State hari ini
  const [todayData, setTodayData] = useState<TodayData | null>(null)

  // QR Scanner refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const scannerRef = useRef<boolean>(false)

  // ── Cek autentikasi kasir ───────────────────────────────────────────
  useEffect(() => {
    checkAuth()
    return () => stopCamera()
  }, [])

  const checkAuth = async () => {
    try {
      const session = await api.kasir.me()
      if (session.authenticated) {
        const name = session.stall || session.displayName || 'Stan Kantin'
        setStallName(name)
        localStorage.setItem('upitra_kasir_session', JSON.stringify({
          authenticated: true,
          role: 'tenant',
          tenantId: session.tenantId,
          stall: name,
        }))
        loadMenu()
        loadToday()
        return
      }
      navigate('/scan/masuk')
    } catch {
      navigate('/scan/masuk')
    } finally {
      setAuthLoading(false)
    }
  }

  // ── Muat menu stan ──────────────────────────────────────────────────
  const loadMenu = async () => {
    try {
      setMenuLoading(true)
      const res = await api.kasir.getMenu()
      setMenuItems(res.items ?? [])
    } catch {
      // Menu opsional, biarkan kosong jika error
    } finally {
      setMenuLoading(false)
    }
  }

  // ── Muat rekap hari ini ─────────────────────────────────────────────
  const loadToday = async () => {
    try {
      const res = await api.kasir.getToday()
      setTodayData(res)
    } catch {
      // Abaikan jika gagal
    }
  }

  // ── Inisialisasi Kamera & QR Scanner ────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', 'true')
        await videoRef.current.play()
        scannerRef.current = true
        tick()
      }
    } catch {
      // Gagal akses kamera (mungkin desktop atau izin ditolak), alihkan ke manual
      setInputMode('manual')
    }
  }, [])

  const stopCamera = () => {
    scannerRef.current = false
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  // Loop pemindaian QR menggunakan Canvas + jsQR
  const tick = () => {
    if (!scannerRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const qr = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'dontInvert',
        })
        if (qr && qr.data) {
          handleScanPayload(qr.data)
          return
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // Aktifkan / matikan kamera saat tab/mode berubah
  useEffect(() => {
    if (view === 'scan' && inputMode === 'camera' && !authLoading) {
      startCamera()
    } else {
      stopCamera()
    }
  }, [view, inputMode, authLoading, startCamera])

  // ── Kirim payload scan ke server ────────────────────────────────────
  const handleScanPayload = async (payload: string) => {
    if (scanning) return
    setScanning(true)
    stopCamera()

    // Susun pesanan dari keranjang
    const items = Object.entries(cart)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => ({ id: Number(id), qty }))

    try {
      const res = await api.kasir.scanVoucher(payload, items.length > 0 ? items : undefined)
      setResult(res)
      setView('result')
      loadToday()
    } catch (err: any) {
      setResult({
        result: 'invalid',
        message: err.message || 'Gagal memproses voucher',
      })
      setView('result')
    } finally {
      setScanning(false)
    }
  }

  // ── Submit input kode manual ────────────────────────────────────────
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim()) return
    handleScanPayload(manualCode.trim())
  }

  // ── Reset scanner untuk scan berikutnya ─────────────────────────────
  const resetScan = () => {
    setResult(null)
    setManualCode('')
    setCart({})
    setView('scan')
    if (inputMode === 'camera') {
      startCamera()
    }
  }

  // ── Logout kasir ────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      localStorage.removeItem('upitra_kasir_session')
      await fetch('/keluar', { method: 'POST' })
    } finally {
      navigate('/scan/masuk')
    }
  }

  // Hitung total keranjang sementara
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = menuItems.find((m) => m.id === Number(id))
    return sum + (item ? item.price * qty : 0)
  }, 0)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-600">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-sky-600" />
          <span className="text-xs font-semibold">Memuat portal kasir UPITRA...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col max-w-md mx-auto border-x border-slate-200">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-sky-100 px-4 py-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center border border-sky-200">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-900 leading-tight">{stallName}</div>
              <div className="text-[10px] text-sky-700 font-bold uppercase tracking-wider">Kasir UPITRA</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Badge hari ini */}
            {todayData && (
              <div className="hidden sm:flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-full px-3 py-1 text-xs text-sky-800 font-semibold">
                <Banknote className="w-3.5 h-3.5 text-sky-600" />
                {todayData.count} scan · Rp{todayData.total.toLocaleString('id')}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 px-2.5 py-1.5 rounded-lg transition-all font-semibold"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 mt-3">
          {[
            { id: 'scan', label: 'Scanner', icon: Camera },
            { id: 'today', label: 'Hari Ini', icon: List },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id as View)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                view === id
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-sky-700 hover:bg-sky-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Anti-manipulasi Security & Operating Hours Banner */}
        <div className="bg-gradient-to-r from-emerald-50 via-sky-50 to-white border border-emerald-200 rounded-xl p-2.5 shadow-xs flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-extrabold text-slate-800">10:00 – 16:00 WIB</span>
            <span className="text-slate-400">|</span>
            <span className="text-emerald-800 font-medium">Proteksi Kriptografis Aktif</span>
          </div>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-300">
            HMAC-SHA256
          </span>
        </div>

        {/* ======= VIEW: SCAN ======= */}
        {(view === 'scan' || view === 'result') && (
          <>
            {view === 'scan' && (
              <>
                {/* Mode toggle */}
                {window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] p-2.5 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Akses HTTP: Browser HP membatasi kamera di HTTP. Buka via HTTPS atau gunakan tab <b>Ketik Kode</b> di bawah.</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setInputMode('camera')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border transition-all ${
                      inputMode === 'camera'
                        ? 'bg-sky-600 border-sky-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Camera className="w-4 h-4" /> Kamera
                  </button>
                  <button
                    onClick={() => setInputMode('manual')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border transition-all ${
                      inputMode === 'manual'
                        ? 'bg-sky-600 border-sky-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Keyboard className="w-4 h-4" /> Ketik Kode
                  </button>
                </div>

                {/* Kamera viewfinder */}
                {inputMode === 'camera' && (
                  <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-square border-2 border-sky-300 shadow-lg shadow-sky-900/10">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                    {/* Canvas tersembunyi untuk proses frame */}
                    <canvas ref={canvasRef} className="hidden" />

                    {/* HUD overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {/* Corner reticles */}
                      <div className="relative w-52 h-52">
                        {/* Top-left */}
                        <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-sky-400 rounded-tl-lg" />
                        {/* Top-right */}
                        <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-sky-400 rounded-tr-lg" />
                        {/* Bottom-left */}
                        <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-sky-400 rounded-bl-lg" />
                        {/* Bottom-right */}
                        <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-sky-400 rounded-br-lg" />
                        {/* Laser scan line */}
                        <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-sky-400 animate-laser shadow-[0_0_12px_#38bdf8]" />
                      </div>
                    </div>

                    {/* Status label */}
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                      {scanning ? (
                        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur rounded-full px-4 py-1.5 text-xs text-sky-300 font-semibold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Memproses voucher...
                        </div>
                      ) : (
                        <div className="bg-slate-900/80 backdrop-blur rounded-full px-4 py-1.5 text-xs text-sky-200/90 font-medium">
                          Arahkan kamera ke QR code voucher
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Input kode manual */}
                {inputMode === 'manual' && (
                  <form onSubmit={handleManualSubmit} className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nomor Kode Voucher atau Teks QR
                      </label>
                      <p className="text-[11px] text-slate-500 mb-2">
                        Masukkan Nomor Kode yang tertera di bawah gambar QR Code pada email staf penerima.
                      </p>
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="Contoh: UP-2026-X89K2P atau kode dari email"
                        className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-mono font-bold"
                        autoComplete="off"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!manualCode.trim() || scanning}
                      className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-xs shadow-md shadow-sky-600/20 transition-all cursor-pointer"
                    >
                      {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                      {scanning ? 'Memproses...' : 'Proses Voucher'}
                    </button>
                  </form>
                )}

                {/* Pemilih menu */}
                {!menuLoading && menuItems.length > 0 && (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowMenu(!showMenu)}
                      className="w-full flex items-center justify-between text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 transition-all shadow-xs"
                    >
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-sky-600" />
                        Tambah Pesanan Menu
                        {cartTotal > 0 && (
                          <span className="bg-sky-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            Rp{cartTotal.toLocaleString('id')}
                          </span>
                        )}
                      </div>
                      <ChevronRight className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-90' : ''}`} />
                    </button>

                    {showMenu && (
                      <MenuPicker items={menuItems} cart={cart} onChange={(id, qty) => setCart((c) => ({ ...c, [id]: qty }))} />
                    )}
                  </div>
                )}
              </>
            )}

            {/* Hasil scan */}
            {view === 'result' && result && (
              <ResultCard result={result} onReset={resetScan} />
            )}
          </>
        )}

        {/* ======= VIEW: HARI INI ======= */}
        {view === 'today' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-sky-100 rounded-2xl p-4 text-center shadow-xs">
                <div className="text-3xl font-black text-sky-600">{todayData?.count ?? 0}</div>
                <div className="text-xs text-slate-500 font-medium mt-1">Voucher Diklaim</div>
              </div>
              <div className="bg-white border border-emerald-100 rounded-2xl p-4 text-center shadow-xs">
                <div className="text-2xl font-black text-emerald-600">
                  Rp{(todayData?.total ?? 0).toLocaleString('id')}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">Total Kas Hari Ini</div>
              </div>
            </div>

            {/* Riwayat Scan Terakhir Stan Ini */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800">Riwayat Scan Terakhir Stan Ini</span>
                <span className="text-[10px] text-slate-400">Hari ini</span>
              </div>

              {todayData?.recent && todayData.recent.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {todayData.recent.map((tx, idx) => (
                    <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{tx.staff_name}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                          <span>{tx.unit || 'UPITRA'}</span>
                          {tx.short_code && (
                            <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-slate-600">
                              {tx.short_code}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-600">+Rp{tx.amount.toLocaleString('id')}</div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {new Date(tx.used_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Jakarta',
                          })} WIB
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 italic">
                  Belum ada voucher yang di-scan di stan ini hari ini.
                </div>
              )}
            </div>

            <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 text-center text-[11px] text-sky-800 font-medium">
              ℹ️ Seluruh voucher yang berhasil di-scan akan otomatis masuk ke daftar pencairan kas kasir setelah cut-off pukul 16:00 WIB.
            </div>

            <button
              onClick={loadToday}
              className="w-full flex items-center justify-center gap-2 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl py-2.5 text-xs font-bold text-sky-800 transition-all shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Refresh Data
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
