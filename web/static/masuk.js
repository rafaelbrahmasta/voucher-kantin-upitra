// Halaman koneksi HP: bila dibuka dari QR admin (/masuk#KODE), isi kolom kode otomatis.
// Kode di fragmen (#) tidak ikut terkirim ke server dan tidak masuk log.
(function () {
  'use strict';
  var input = document.getElementById('kode');
  if (!input) return;
  var h = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
  if (h) {
    input.value = h;
    history.replaceState(null, '', location.pathname); // hapus kode dari address bar
  }
  input.focus();
})();
