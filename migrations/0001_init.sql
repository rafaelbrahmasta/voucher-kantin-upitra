-- Skema awal, berdasarkan DDL di Proposal Sistem Voucher Kantin UPITRA.
-- Perubahan dari proposal:
--   * CHECK email @upitra.ac.id pada staff dihapus agar bisa memakai email dummy
--     saat pengembangan. Validasi domain dilakukan di kode impor staf (produksi).

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role         AS ENUM ('tenant', 'finance', 'admin');
CREATE TYPE voucher_status    AS ENUM ('issued', 'used', 'expired', 'void');
CREATE TYPE settlement_status AS ENUM ('ready', 'paid');
CREATE TYPE payout_status     AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE staff (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nip        varchar(30) UNIQUE,
  name       varchar(150) NOT NULL,
  email      citext NOT NULL UNIQUE,
  unit       varchar(100) NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           varchar(100) NOT NULL UNIQUE,
  stall_location varchar(50),
  owner_name     varchar(150) NOT NULL,
  bank_name      varchar(50),
  bank_account   varchar(30),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role           user_role NOT NULL,
  tenant_id      bigint REFERENCES tenants(id),
  username       citext UNIQUE,
  password_hash  text,            -- argon2id, khusus tenant
  microsoft_oid  uuid UNIQUE,     -- object id Entra ID, khusus finance/admin
  display_name   varchar(150) NOT NULL,
  failed_logins  smallint NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (role = 'tenant' AND tenant_id IS NOT NULL AND username IS NOT NULL
       AND password_hash IS NOT NULL AND microsoft_oid IS NULL)
    OR
    (role <> 'tenant' AND tenant_id IS NULL AND microsoft_oid IS NOT NULL
       AND password_hash IS NULL)
  )
);

CREATE TABLE tenant_devices (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         bigint NOT NULL REFERENCES users(id),
  device_key_hash bytea NOT NULL UNIQUE,
  label           varchar(100) NOT NULL,
  approved_by     bigint NOT NULL REFERENCES users(id),
  approved_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz,
  revoked_at      timestamptz
);

CREATE TABLE sessions (
  id           bytea PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id),
  device_id    bigint REFERENCES tenant_devices(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  ip           inet,
  user_agent   text
);

-- Satu kali serah terima uang tunai, bisa mencakup beberapa hari
CREATE TABLE payouts (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_no          varchar(30) UNIQUE,
  tenant_id           bigint NOT NULL REFERENCES tenants(id),
  amount              integer NOT NULL CHECK (amount > 0),
  adjustment_amount   integer NOT NULL DEFAULT 0,
  adjustment_note     text,
  status              payout_status NOT NULL DEFAULT 'pending',
  created_by          bigint NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  tenant_confirmed_by bigint REFERENCES users(id),
  tenant_device_id    bigint REFERENCES tenant_devices(id),
  tenant_confirmed_at timestamptz,
  cancelled_reason    text,
  CHECK (adjustment_amount = 0 OR adjustment_note IS NOT NULL),
  CHECK (status <> 'confirmed' OR (tenant_confirmed_by IS NOT NULL
         AND tenant_device_id IS NOT NULL AND tenant_confirmed_at IS NOT NULL
         AND receipt_no IS NOT NULL))
);

-- Maksimal satu payout pending per tenant
CREATE UNIQUE INDEX payouts_one_pending_idx ON payouts (tenant_id) WHERE status = 'pending';
CREATE INDEX payouts_confirmed_day_idx ON payouts (created_by, tenant_confirmed_at)
  WHERE status = 'confirmed';

-- Rekap per tenant per hari, dibuat job close-day pukul 16.05
CREATE TABLE settlements (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id),
  business_date date NOT NULL,
  voucher_count integer NOT NULL CHECK (voucher_count > 0),
  total_amount  integer NOT NULL CHECK (total_amount > 0),
  status        settlement_status NOT NULL DEFAULT 'ready',
  payout_id     bigint REFERENCES payouts(id),
  closed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_date),
  CHECK (status <> 'paid' OR payout_id IS NOT NULL)
);
CREATE INDEX settlements_open_idx ON settlements (tenant_id) WHERE status = 'ready';

CREATE TABLE vouchers (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id           bigint NOT NULL REFERENCES staff(id),
  voucher_date       date NOT NULL,
  amount             integer NOT NULL DEFAULT 5000 CHECK (amount > 0),
  token_hash         bytea NOT NULL UNIQUE,
  short_code_hash    bytea NOT NULL,
  valid_from         timestamptz NOT NULL,
  valid_until        timestamptz NOT NULL CHECK (valid_until > valid_from),
  status             voucher_status NOT NULL DEFAULT 'issued',
  email_sent_at      timestamptz,
  email_message_id   text,
  used_at            timestamptz,
  used_by_tenant_id  bigint REFERENCES tenants(id),
  scanned_by_user_id bigint REFERENCES users(id),
  settlement_id      bigint REFERENCES settlements(id),
  void_reason        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, voucher_date),
  UNIQUE (voucher_date, short_code_hash),
  CHECK (status <> 'used' OR (used_at IS NOT NULL
         AND used_by_tenant_id IS NOT NULL AND scanned_by_user_id IS NOT NULL))
);
CREATE INDEX vouchers_tenant_used_idx ON vouchers (used_by_tenant_id, used_at) WHERE status = 'used';
CREATE INDEX vouchers_date_status_idx ON vouchers (voucher_date, status);

CREATE TABLE holidays (
  date        date PRIMARY KEY,
  description varchar(150) NOT NULL
);

CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id    bigint REFERENCES users(id),   -- NULL = job sistem
  action     varchar(50) NOT NULL,
  voucher_id bigint REFERENCES vouchers(id),
  detail     jsonb NOT NULL DEFAULT '{}',
  reason     text,
  ip         inet,
  prev_hash  bytea NOT NULL,
  row_hash   bytea NOT NULL UNIQUE
);
