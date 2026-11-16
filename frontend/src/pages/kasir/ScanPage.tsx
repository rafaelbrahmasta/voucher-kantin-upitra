import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  QrCode, CheckCircle2, XCircle, AlertCircle, Clock, LogOut,
  Plus, Minus, ShoppingCart, ChevronRight, Loader2, RotateCcw,
  Keyboard, Camera, List, Banknote
} from 'lucide-react'
import { api } from '../../services/api'
import { MenuItemScan, ScanResult, TodayData } from '../../types'

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
    ok:      { icon: <CheckCircle2 className="w-10 h-10" />, color: 'text-emerald-400', bg: 'border-emerald-400/40 bg-emerald-500/10', label: 'Voucher Diterima!', desc: `Rp${(result.amount ?? 0).toLocaleString('id')} berhasil diklaim` },
    invalid: { icon: <XCircle className="w-10 h-10" />,      color: 'text-rose-400',    bg: 'border-rose-400/40 bg-rose-500/10',       label: 'QR Tidak Valid',   desc: 'Kode voucher tidak dikenali atau rusak' },
    used:    { icon: <AlertCircle className="w-10 h-10" />,   color: 'text-amber-400',   bg: 'border-amber-400/40 bg-amber-500/10',     label: 'Sudah Digunakan',  desc: 'Voucher ini sudah diklaim sebelumnya' },
    expired: { icon: <Clock className="w-10 h-10" />,         color: 'text-slate-400',   bg: 'border-slate-400/40 bg-slate-500/10',     label: 'Kedaluwarsa',      desc: 'Voucher hari ini sudah tidak berlaku' },
    void:    { icon: <XCircle className="w-10 h-10" />,       color: 'text-rose-400',    bg: 'border-rose-400/40 bg-rose-500/10',       label: 'Dibatalkan',       desc: 'Voucher ini sudah dibatalkan' },
  }
  const cfg = configs[result.result] ?? configs.invalid

  return (
    <div className={`rounded-2xl border p-6 ${cfg.bg} flex flex-col gap-4`}>
      {/* Status */}
      <div className="flex items-center gap-4">
        <div className={cfg.color}>{cfg.icon}</div>
        <div>
          <div className={`text-lg font-bold ${cfg.color}`}>{cfg.label}</div>
          <div className="text-sm text-slate-300">{cfg.desc}</div>
        </div>
      </div>

      {/* Detail staf */}
      {result.staff && (
        <div className="bg-black/20 rounded-xl px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Pemilik Voucher</span>
            <span className="font-semibold text-white">{result.staff}</span>
          </div>
          {result.unit && (
            <div className="flex justify-between">
              <span className="text-slate-400">Unit / Fakultas</span>
              <span className="text-slate-200">{result.unit}</span>
            </div>
          )}
          {isOk && result.amount && (
            <div className="flex justify-between">
              <span className="text-slate-400">Nilai Voucher</span>
              <span className="font-bold text-emerald-300">Rp{result.amount.toLocaleString('id')}</span>
            </div>
          )}
        </div>
      )}

      {/* Rincian pesanan */}
      {isOk && result.order && result.order.items.length > 0 && (
        <div className="bg-black/20 rounded-xl px-4 py-3 text-sm space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Rincian Pesanan</div>
          {result.order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-slate-200">
              <span>{item.name} ×{item.qty}</span>
              <span>Rp{item.subtotal.toLocaleString('id')}</span>
            </div>
          ))}
          <div className="border-t border-white/10 pt-2 mt-2 flex justify-between font-semibold">
            <span className="text-slate-300">Total Pesanan</span>
            <span className="text-white">Rp{result.order.total.toLocaleString('id')}</span>
          </div>
          {result.order.pay > 0 && (
            <div className="flex justify-between text-amber-300">
              <span>Bayar Tunai (selisih)</span>
              <span className="font-bold">Rp{result.order.pay.toLocaleString('id')}</span>
            </div>
          )}
          {result.order.pay <= 0 && (
            <div className="flex justify-between text-emerald-300">
              <span>Voucher cukup menutup pesanan</span>
              <span className="font-bold">✓</span>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl py-3 text-sm font-semibold text-white transition-all"
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
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Pilih Menu (Opsional)
      </div>
      {items.map((item) => {
        const qty = cart[item.id] ?? 0
        return (
          <div
            key={item.id}
            className="flex items-center justify-between bg-slate-800/60 border border-white/5 rounded-xl px-4 py-3"
          >
            <div>
              <div className="text-sm font-medium text-white">{item.name}</div>
              <div className="text-xs text-slate-400">Rp{item.price.toLocaleString('id')}</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onChange(item.id, Math.max(0, qty - 1))}
                disabled={qty === 0}
                className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 flex items-center justify-center transition-all"
              >
                <Minus className="w-3.5 h-3.5 text-white" />
              </button>
              <span className="w-5 text-center text-sm font-bold text-white">{qty}</span>
              <button
                onClick={() => onChange(item.id, qty + 1)}
                className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-all"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
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
      if (!session.authenticated || session.role !== 'tenant') {
        navigate('/scan/masuk')
        return
      }
      setStallName(session.stall ?? 'Stan Kantin')
      loadMenu()
      loadToday()
    } catch {
      navigate('/scan/masuk')
    } finally {
      setAuthLoading(false)
    }
  }

  // ── Load data ───────────────────────────────────────────────────────
  const loadMenu = async () => {
    setMenuLoading(true)
    try {
      const data = await api.kasir.menu()
      setMenuItems(data.items ?? [])
    } catch {
      setMenuItems([])
    } finally {
      setMenuLoading(false)
    }
  }

  const loadToday = async () => {
    try {
      const data = await api.kasir.today()
      setTodayData(data)
    } catch {}
  }

  // ── Kamera QR ──────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (streamRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        scannerRef.current = true
        scanLoop()
      }
    } catch (err) {
      console.error('Kamera tidak tersedia:', err)
      setInputMode('manual')
    }
  }, [])

  const stopCamera = () => {
    scannerRef.current = false
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // Loop scan menggunakan BarcodeDetector API (didukung browser modern) atau canvas fallback
  const scanLoop = useCallback(() => {
    if (!scannerRef.current || !videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop)
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    // Gunakan BarcodeDetector jika tersedia (Chrome 83+, Safari 17+)
    if ('BarcodeDetector' in window) {
      const detector = new (window as unknown as { BarcodeDetector: new (opts: object) => { detect(src: HTMLCanvasElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({ formats: ['qr_code'] })
      detector
        .detect(canvas)
        .then((barcodes: Array<{ rawValue: string }>) => {
          if (barcodes.length > 0 && scannerRef.current) {
            const qr = barcodes[0].rawValue
            handleScan(qr)
          } else {
            rafRef.current = requestAnimationFrame(scanLoop)
          }
        })
        .catch(() => {
          rafRef.current = requestAnimationFrame(scanLoop)
        })
    } else {
      // Fallback: tampilkan pesan minta manual
      rafRef.current = requestAnimationFrame(scanLoop)
    }
  }, [])

  useEffect(() => {
    if (view === 'scan' && inputMode === 'camera' && !authLoading) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [view, inputMode, authLoading, startCamera])

  // ── Handler scan & kode manual ─────────────────────────────────────
  const getCartItems = () =>
    Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id: Number(id), qty }))

  const handleScan = useCallback(
    async (qr: string) => {
      if (scanning || !scannerRef.current) return
      scannerRef.current = false
      stopCamera()
      setScanning(true)
      try {
        const res = await api.kasir.scan(qr, getCartItems())
        setResult(res)
        setView('result')
        loadToday()
      } catch (err) {
        setResult({ result: 'invalid' })
        setView('result')
      } finally {
        setScanning(false)
      }
    },
    [scanning, cart]
  )

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim() || scanning) return
    setScanning(true)
    try {
      // Coba sebagai kode pendek dulu (8 char), lalu sebagai QR penuh
      const clean = manualCode.trim()
      let res: ScanResult
      if (clean.replace('-', '').length === 8) {
        res = await api.kasir.scanCode(clean, getCartItems())
      } else {
        res = await api.kasir.scan(clean, getCartItems())
      }
      setResult(res)
      setView('result')
      loadToday()
    } catch {
      setResult({ result: 'invalid' })
      setView('result')
    } finally {
      setScanning(false)
      setManualCode('')
    }
  }

  const resetScan = () => {
    setResult(null)
    setCart({})
    setView('scan')
    if (inputMode === 'camera') {
      startCamera()
    }
  }

  const handleLogout = async () => {
    try {
      await api.kasir.logout()
    } finally {
      navigate('/scan/masuk')
    }
  }

  const cartTotal = getCartItems().reduce((sum, { id, qty }) => {
    const item = menuItems.find((m) => m.id === id)
    return sum + (item?.price ?? 0) * qty
  }, 0)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <span className="text-sm">Memuat portal kasir...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col max-w-md mx-auto">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <QrCode className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">{stallName}</div>
              <div className="text-[10px] text-emerald-300/60">Portal Kasir</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Badge hari ini */}
            {todayData && (
              <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-400/20 rounded-full px-3 py-1 text-xs text-emerald-300">
                <Banknote className="w-3.5 h-3.5" />
                {todayData.count} scan · Rp{todayData.total.toLocaleString('id')}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600/80 border border-rose-500/20 px-3 py-1.5 rounded-lg transition-all"
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
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                view === id
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
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

        {/* ======= VIEW: SCAN ======= */}
        {(view === 'scan' || view === 'result') && (
          <>
            {view === 'scan' && (
              <>
                {/* Mode toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setInputMode('camera')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                      inputMode === 'camera'
                        ? 'bg-emerald-600 border-emerald-400/50 text-white'
                        : 'bg-transparent border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-4 h-4" /> Kamera
                  </button>
                  <button
                    onClick={() => setInputMode('manual')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                      inputMode === 'manual'
                        ? 'bg-slate-700 border-white/20 text-white'
                        : 'bg-transparent border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Keyboard className="w-4 h-4" /> Ketik Kode
                  </button>
                </div>

                {/* Kamera viewfinder */}
                {inputMode === 'camera' && (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-square border border-emerald-400/20 shadow-xl shadow-emerald-500/10">
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
                        <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                        {/* Top-right */}
                        <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                        {/* Bottom-left */}
                        <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                        {/* Bottom-right */}
                        <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                        {/* Laser scan line */}
                        <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-emerald-400/70 animate-laser shadow-lg shadow-emerald-400/50" />
                      </div>
                    </div>

                    {/* Status label */}
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                      {scanning ? (
                        <div className="flex items-center gap-2 bg-black/70 rounded-full px-4 py-1.5 text-xs text-emerald-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Memproses...
                        </div>
                      ) : (
                        <div className="bg-black/50 rounded-full px-4 py-1.5 text-xs text-emerald-300/70">
                          Arahkan kamera ke QR code voucher
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Input kode manual */}
                {inputMode === 'manual' && (
                  <form onSubmit={handleManualSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-2">
                        Kode pendek (xxxx-xxxx) atau teks QR lengkap
                      </label>
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="Contoh: k7m4-qxp8"
                        className="w-full bg-slate-800 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-400/50 font-mono"
                        autoComplete="off"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!manualCode.trim() || scanning}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-xl py-3 text-sm transition-all"
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
                      className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 bg-slate-800/50 border border-white/5 rounded-xl px-4 py-3 hover:bg-slate-800 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-emerald-400" />
                        Tambah Pesanan Menu
                        {cartTotal > 0 && (
                          <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
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
              <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-4 text-center">
                <div className="text-3xl font-black text-emerald-400">{todayData?.count ?? 0}</div>
                <div className="text-xs text-slate-400 mt-1">Voucher Diklaim</div>
              </div>
              <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-4 text-center">
                <div className="text-2xl font-black text-emerald-400">
                  Rp{(todayData?.total ?? 0).toLocaleString('id')}
                </div>
                <div className="text-xs text-slate-400 mt-1">Total Kas Hari Ini</div>
              </div>
            </div>

            <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-4 text-center text-sm text-slate-400">
              Rincian transaksi per voucher dapat dilihat di portal Admin IT (Ringkasan &gt; Transaksi).
            </div>

            <button
              onClick={loadToday}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-xl py-2.5 text-xs font-semibold text-slate-300 transition-all"
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
