-- 0003: izinkan login username+password untuk role admin dan finance
-- (sementara, sebelum Microsoft SSO aktif di milestone berikutnya).
-- Aman dijalankan ulang.

-- Lepas constraint lama yang mewajibkan microsoft_oid untuk non-tenant
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;

-- Pasang constraint baru yang lebih fleksibel:
--   • role='tenant'  : wajib tenant_id, username, password_hash; microsoft_oid NULL
--   • role<>'tenant' : boleh pakai password_hash (sementara) ATAU microsoft_oid (SSO nanti),
--                      tapi harus salah satu ada (tidak boleh keduanya NULL sekaligus)
ALTER TABLE users ADD CONSTRAINT users_check CHECK (
  (role = 'tenant'
     AND tenant_id    IS NOT NULL
     AND username     IS NOT NULL
     AND password_hash IS NOT NULL
     AND microsoft_oid IS NULL)
  OR
  (role <> 'tenant'
     AND tenant_id IS NULL
     AND (password_hash IS NOT NULL OR microsoft_oid IS NOT NULL))
);

-- Tambah kolom sub_role agar bisa bedakan 'it' vs 'finance' di dalam role 'admin'
-- (opsional, cukup gunakan role='admin' untuk IT dan role='finance' untuk keuangan)

