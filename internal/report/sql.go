package report

const qTenant = `SELECT name, COALESCE(stall_location, '') FROM tenants WHERE id = $1`

const qTenants = `SELECT id, name FROM tenants WHERE is_active ORDER BY name`

const qTenantDay = `
SELECT v.used_at, s.name, s.unit, v.amount, v.status = 'void'
  FROM vouchers v
  JOIN staff s ON s.id = v.staff_id
 WHERE v.used_by_tenant_id = $1
   AND v.used_at >= $2 AND v.used_at < $3
   AND v.status IN ('used', 'void')
 ORDER BY v.used_at DESC, v.id DESC`

const qSummary = `
SELECT count(*),
       count(*) FILTER (WHERE status = 'used'),
       count(*) FILTER (WHERE status = 'void'),
       COALESCE(sum(amount) FILTER (WHERE status = 'used'), 0)
  FROM vouchers
 WHERE voucher_date = $1`

const qInactive = `SELECT count(*) FROM staff WHERE NOT is_active`

const qPerTenant = `
SELECT t.name, count(v.id), COALESCE(sum(v.amount), 0)
  FROM tenants t
  LEFT JOIN vouchers v ON v.used_by_tenant_id = t.id
                      AND v.voucher_date = $1 AND v.status = 'used'
 WHERE t.is_active
 GROUP BY t.id, t.name
 ORDER BY count(v.id) DESC, t.name`

const qUnits = `SELECT DISTINCT unit FROM staff ORDER BY unit`

// Menu yang dicatat saat scan, digabung jadi satu teks per transaksi.
const qItems = `COALESCE((SELECT string_agg(vi.qty || '× ' || vi.name, ', ' ORDER BY vi.id)
                            FROM voucher_items vi WHERE vi.voucher_id = v.id), '')`
