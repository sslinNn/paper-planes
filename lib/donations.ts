import { pool } from './db.ts'
import { paidInvoices } from './patrons.ts'

// сверка с lava.top без вебхука: берём оплаченные счета и засчитываем донатеров.
// вебхук остаётся — что сработает первым, то и засчитает, contract_id не даст задвоить
export async function syncDonations(): Promise<number> {
  const key = process.env.LAVA_API_KEY
  if (!key) return 0
  const r = await fetch('https://gate.lava.top/api/v2/invoices?invoiceStatuses=COMPLETED&size=50', {
    headers: { 'X-Api-Key': key },
  }).catch(() => null)
  if (!r?.ok) {
    console.error('lava sync', r?.status)
    return 0
  }
  const paid = paidInvoices((await r.json())?.items)
  if (!paid.length) return 0
  const res = await pool.query(
    `insert into patrons (contract_id, user_id, amount, currency)
     select p.contract_id, u.id, p.amount, p.currency
     from json_to_recordset($1::json) as p(contract_id text, user_id text, amount numeric, currency text)
     join "user" u on u.id = p.user_id
     on conflict (contract_id) do nothing`,
    [JSON.stringify(paid.map((p) => ({ contract_id: p.contractId, user_id: p.userId, amount: p.amount, currency: p.currency })))],
  )
  return res.rowCount ?? 0
}
