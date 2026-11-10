// Halaman scan tenant. Tanpa framework. Kamera + pembaca QR bawaan browser
// (BarcodeDetector); jika tidak ada, jsQR dimuat hanya di halaman ini.
// Scan TIDAK PERNAH disimpan offline, supaya voucher tidak bisa dipakai dua kali.
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var video = $('video'), hint = $('hint'), totalEl = $('total');
  var result = $('result'), nextBtn = $('res-next');
  var manualBtn = $('manual-btn'), manualForm = $('manual'), codeInput = $('code');

  var menuBtn = $('menu-btn'), menuSheet = $('menu-sheet'), menuList = $('menu-list'), menuMsg = $('menu-msg');
  var menuCount = $('menu-count'), menuTotal = $('menu-total'), cartSum = $('cart-sum');
  var menu = [];      // [{id, name, price}] dari /api/menu
  var cart = {};      // id -> qty

  var stream = null, detector = null, canvas = null, ctx2d = null;
  var busy = false, lastValue = '', lastAt = 0, timer = null;

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function rupiah(n) { return 'Rp' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  // "2026-11-04T12:14:03+07:00" -> {date: "4 Nov 2026", time: "12.14"} (server sudah mengirim WIB)
  function parseAt(iso) {
    if (!iso || iso.length < 16) return { date: '', time: '' };
    return {
      date: parseInt(iso.slice(8, 10), 10) + ' ' + MONTHS[parseInt(iso.slice(5, 7), 10) - 1] + ' ' + iso.slice(0, 4),
      time: iso.slice(11, 13) + '.' + iso.slice(14, 16)
    };
  }

  function setHint(t) { hint.textContent = t; }

  // ---------- kamera dan pembaca ----------
  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHint('Kamera tidak tersedia di browser ini. Ketik kode cadangan.');
      return Promise.resolve(false);
    }
    return navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        return video.play();
      })
      .then(function () { return true; })
      .catch(function () {
        setHint('Kamera tidak bisa dibuka. Izinkan akses kamera, atau ketik kode cadangan.');
        return false;
      });
  }

  function loadDecoder() {
    if ('BarcodeDetector' in window) {
      return BarcodeDetector.getSupportedFormats().then(function (f) {
        if (f.indexOf('qr_code') !== -1) { detector = new BarcodeDetector({ formats: ['qr_code'] }); return; }
        return loadJsQR();
      }).catch(loadJsQR);
    }
    return loadJsQR();
  }

  function loadJsQR() {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = '/static/jsqr.min.js';
      s.onload = ok;
      s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  function readFrame() {
    if (detector) {
      return detector.detect(video).then(function (codes) { return codes.length ? codes[0].rawValue : null; });
    }
    var w = video.videoWidth, h = video.videoHeight;
    if (!w || !window.jsQR) return Promise.resolve(null);
    var scale = Math.min(1, 480 / w); // perkecil agar ringan di HP lama
    canvas = canvas || document.createElement('canvas');
    ctx2d = ctx2d || canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    var img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
    var r = window.jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
    return Promise.resolve(r ? r.data : null);
  }

  function loop() {
    timer = setTimeout(function () {
      if (busy || document.hidden || video.readyState < 2) { loop(); return; }
      readFrame().then(function (value) {
        if (value && !(value === lastValue && Date.now() - lastAt < 4000)) {
          lastValue = value; lastAt = Date.now();
          submit('/api/scan', { qr: value });
        }
      }).catch(function () {}).then(loop);
    }, 200);
  }

  // ---------- kirim ke server ----------
  function submit(url, body) {
    busy = true;
    setHint('Memeriksa voucher…');
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 8000);
    body.items = cartItems();
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store'
    }).then(function (r) {
      clearTimeout(t);
      return r.json().then(function (data) { return { status: r.status, data: data }; });
    }).then(function (r) {
      if (r.status === 401) { location.href = '/masuk'; return; }
      if (r.status >= 500 || !r.data || !r.data.result) { show('error', {}); return; }
      show(r.data.result, r.data);
      if (r.data.result === 'ok') { refreshTotal(); clearCart(); }
    }).catch(function () {
      clearTimeout(t);
      show('offline', {});
    });
  }

  function refreshTotal() {
    fetch('/api/today', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (typeof d.count === 'number') totalEl.textContent = d.count + ' · ' + rupiah(d.total);
    }).catch(function () {});
  }

  // ---------- layar hasil ----------
  function show(kind, d) {
    var tone = 'bad', title, sub = '', note = '', card = null;
    var at = parseAt(d.at), used = parseAt(d.usedAt);

    if (kind === 'ok') {
      tone = 'ok'; title = 'BERHASIL'; sub = 'Potong ' + rupiah(d.amount || 5000);
      card = { label: 'Voucher milik', main: d.staff || '', detail: (d.unit || '') + (at.date ? ' · ' + at.date + ', ' + at.time : '') };
    } else if (kind === 'used') {
      title = 'DITOLAK'; sub = 'Voucher sudah dipakai'; note = 'Jangan beri potongan.';
      card = { label: 'Sudah dipakai di', main: (d.tenant || 'tenant lain') + (used.time ? ' · ' + used.time : ''), detail: d.staff ? 'Voucher milik ' + d.staff : '' };
    } else if (kind === 'expired') {
      title = 'KEDALUWARSA'; sub = 'Voucher di luar jam 10.00–16.00'; note = 'Jangan beri potongan.';
    } else if (kind === 'void') {
      title = 'TIDAK VALID'; sub = 'Voucher ini dibatalkan'; note = 'Jangan beri potongan.';
    } else if (kind === 'offline') {
      tone = 'warn'; title = 'TIDAK ADA KONEKSI'; sub = 'Coba lagi'; note = 'Voucher belum diperiksa. Jangan beri potongan dulu.';
    } else if (kind === 'error') {
      tone = 'warn'; title = 'GAGAL MEMERIKSA'; sub = 'Terjadi gangguan di server'; note = 'Coba lagi. Jika terus terjadi, hubungi IT.';
    } else {
      title = 'TIDAK VALID'; sub = 'Kode tidak dikenal'; note = 'Jangan beri potongan.';
    }

    result.className = 'res res-' + tone;
    $('icon-ok').hidden = tone !== 'ok';
    $('icon-bad').hidden = tone === 'ok';
    $('res-time').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
    $('res-title').textContent = title;
    $('res-sub').textContent = sub;
    $('res-note').textContent = note;
    $('res-card').hidden = !card;
    if (card) {
      $('res-label').textContent = card.label;
      $('res-main').textContent = card.main;
      $('res-detail').textContent = card.detail;
    }
    showOrder(kind === 'ok' ? d.order : null);
    result.hidden = false;
    nextBtn.focus();

    if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : [120, 60, 120]);
    setHint('Arahkan kamera ke QR voucher');
  }

  function dismiss() {
    result.hidden = true;
    lastAt = Date.now(); // QR yang sama dianggap baru lagi setelah 4 detik
    busy = false;
  }

  // ---------- menu kantin ----------
  function cartItems() {
    return Object.keys(cart).map(function (id) { return { id: Number(id), qty: cart[id] }; });
  }

  function cartTotals() {
    var n = 0, total = 0;
    menu.forEach(function (m) {
      var q = cart[m.id] || 0;
      n += q; total += q * m.price;
    });
    return { n: n, total: total };
  }

  function clearCart() { cart = {}; renderMenu(); updateCart(); }

  function updateCart() {
    var t = cartTotals();
    menuCount.hidden = t.n === 0;
    menuCount.textContent = t.n;
    cartSum.hidden = t.n === 0;
    cartSum.textContent = t.n + ' item · ' + rupiah(t.total) + ' · akan dicatat bersama voucher berikutnya';
    menuTotal.textContent = rupiah(t.total);
  }

  function renderMenu() {
    menuList.textContent = '';
    menu.forEach(function (m) {
      var li = document.createElement('li');
      var info = document.createElement('span');
      info.className = 'mi';
      var nm = document.createElement('strong'); nm.textContent = m.name;
      var pr = document.createElement('span'); pr.className = 'muted small'; pr.textContent = rupiah(m.price);
      info.appendChild(nm); info.appendChild(pr);

      var step = document.createElement('span');
      step.className = 'stepper';
      var minus = document.createElement('button');
      minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Kurangi ' + m.name);
      var qty = document.createElement('output');
      qty.textContent = String(cart[m.id] || 0);
      var plus = document.createElement('button');
      plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Tambah ' + m.name);
      function set(q) {
        q = Math.max(0, Math.min(20, q));
        if (q) cart[m.id] = q; else delete cart[m.id];
        qty.textContent = String(q);
        updateCart();
      }
      minus.addEventListener('click', function () { set((cart[m.id] || 0) - 1); });
      plus.addEventListener('click', function () { set((cart[m.id] || 0) + 1); });
      step.appendChild(minus); step.appendChild(qty); step.appendChild(plus);

      li.appendChild(info); li.appendChild(step);
      menuList.appendChild(li);
    });
  }

  function loadMenu() {
    menuMsg.textContent = 'Memuat menu…';
    return fetch('/api/menu', { cache: 'no-store' }).then(function (r) {
      if (r.status === 401) { location.href = '/masuk'; return null; }
      return r.json();
    }).then(function (d) {
      if (!d) return;
      menu = d.items || [];
      // buang pilihan yang menunya sudah dihapus/disembunyikan admin
      var ids = {}; menu.forEach(function (m) { ids[m.id] = true; });
      Object.keys(cart).forEach(function (id) { if (!ids[id]) delete cart[id]; });
      menuMsg.textContent = menu.length ? '' : 'Belum ada menu. Admin bisa menambahkannya di dashboard. Scan tetap bisa dilakukan.';
      renderMenu(); updateCart();
    }).catch(function () {
      menuMsg.textContent = menu.length ? 'Menu mungkin belum terbaru (tidak ada koneksi).' : 'Menu gagal dimuat. Scan tetap bisa dilakukan.';
    });
  }

  function openMenu() {
    menuSheet.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    loadMenu();
    $('menu-done').focus();
  }
  function closeMenu() {
    menuSheet.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.focus();
  }
  menuBtn.addEventListener('click', openMenu);
  $('menu-done').addEventListener('click', closeMenu);
  $('menu-clear').addEventListener('click', clearCart);

  function showOrder(o) {
    var box = $('res-order');
    if (!o || !o.items || !o.items.length) { box.hidden = true; return; }
    var ul = $('res-lines');
    ul.textContent = '';
    o.items.forEach(function (it) {
      var li = document.createElement('li');
      li.textContent = it.qty + '× ' + it.name + ' · ' + rupiah(it.subtotal);
      ul.appendChild(li);
    });
    $('res-pay').textContent = 'Total ' + rupiah(o.total) + ' · Sisa bayar ' + rupiah(o.pay);
    box.hidden = false;
  }

  // ---------- kode cadangan ----------
  manualBtn.addEventListener('click', function () {
    var open = manualForm.hidden;
    manualForm.hidden = !open;
    manualBtn.setAttribute('aria-expanded', String(open));
    if (open) codeInput.focus();
  });
  manualForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = codeInput.value.trim();
    if (!code) return;
    submit('/api/scan/code', { code: code });
    codeInput.value = '';
  });
  nextBtn.addEventListener('click', dismiss);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!result.hidden) dismiss(); else if (!menuSheet.hidden) closeMenu();
  });

  window.addEventListener('pagehide', function () {
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  });

  // ---------- mulai ----------
  loadMenu().then(function () { menuMsg.textContent = ''; });
  startCamera().then(function (ok) {
    if (!ok) return;
    return loadDecoder().then(function () {
      setHint('Arahkan kamera ke QR voucher');
      loop();
    }).catch(function () {
      setHint('Pembaca QR gagal dimuat. Ketik kode cadangan.');
    });
  });
})();
