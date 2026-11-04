-- Data contoh HANYA untuk pengembangan. Jangan dijalankan di produksi.
INSERT INTO tenants (name, stall_location, owner_name)
VALUES ('Kantin Dev', 'Stan 1', 'Bu Dev'),
       ('Warung Dev 2', 'Stan 2', 'Pak Dev');

INSERT INTO users (role, tenant_id, username, password_hash, display_name)
VALUES ('tenant', 1, 'kantin-dev', 'DEV-ONLY-PLACEHOLDER', 'Kantin Dev'),
       ('tenant', 2, 'warung-dev', 'DEV-ONLY-PLACEHOLDER', 'Warung Dev 2');

INSERT INTO staff (nip, name, email, unit) VALUES
  ('1001', 'Dr. Rina Kusuma',        'rina.dev@example.com',  'Fakultas Teknik'),
  ('1002', 'Agus Santoso, M.Kom.',   'agus.dev@example.com',  'Fakultas Teknik'),
  ('1003', 'Dewi Lestari, M.M.',     'dewi.dev@example.com',  'Fakultas Ekonomi');
