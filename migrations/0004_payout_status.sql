-- 0004_payout_status.sql
-- Menambahkan 'transferred' ke tipe enum payout_status
-- untuk mendukung pencairan dana langsung / transfer bank oleh Biro Keuangan.

ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'transferred';
