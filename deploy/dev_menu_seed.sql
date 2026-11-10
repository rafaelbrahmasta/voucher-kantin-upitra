-- Menu contoh untuk tenant dev (id = DEV_TENANT_ID, bawaan 1). Jalankan setelah migrasi 0002.
INSERT INTO menu_items (tenant_id, name, price, sort_order)
SELECT t.id, m.name, m.price, m.sort
  FROM tenants t,
       (VALUES ($$Nasi goreng$$, 15000, 1), ($$Mie ayam$$, 13000, 2), ($$Soto ayam$$, 14000, 3), ($$Es teh$$, 4000, 4), ($$Kopi susu$$, 8000, 5)) AS m(name, price, sort)
 WHERE t.id = 1
   AND NOT EXISTS (SELECT 1 FROM menu_items WHERE tenant_id = t.id);
