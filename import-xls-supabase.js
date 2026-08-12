// Import invoice lama dari file .xls ke Supabase.
// Cara pakai: pastikan .env berisi SUPABASE_URL & SUPABASE_SERVICE_KEY, lalu:
//   node import-xls-supabase.js "/path/ke/Invoice_Manual_2026.xls"
require('dotenv').config();
const XLSX = require('xlsx');
const { getSupabase } = require('./lib/supabaseClient');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Cara pakai: node import-xls-supabase.js "/path/ke/file.xls"');
  process.exit(1);
}

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  return new Date(utcMs).toISOString().slice(0, 10);
}

async function main() {
  const supabase = getSupabase();
  const wb = XLSX.readFile(filePath, { cellDates: false });

  const { data: existingInvoices } = await supabase.from('invoices').select('invoice_no');
  const existingNos = new Set((existingInvoices || []).map(r => r.invoice_no));

  let imported = 0, skipped = 0, errors = [];

  for (const sheetName of wb.SheetNames) {
    if (['summary', 'gl'].includes(sheetName.toLowerCase())) continue;
    const sh = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, raw: true, defval: null });

    try {
      let toIdx = rows.findIndex(r => r[0] && String(r[0]).trim().startsWith('TO'));
      if (toIdx === -1) { skipped++; continue; }

      let customerName = rows[toIdx + 1] ? String(rows[toIdx + 1][0] || '').trim() : '';
      let addressLines = [];
      let i = toIdx + 2;
      while (i < rows.length && rows[i][0] && !String(rows[i][0]).trim().startsWith('ATTN')) {
        addressLines.push(String(rows[i][0]).trim());
        i++;
      }
      let attn = '';
      if (rows[i] && String(rows[i][0]).trim().startsWith('ATTN')) attn = String(rows[i][1] || '').trim();

      let invoiceDate = null, dueDate = null, invoiceNo = null, headerRowIdx = -1;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (typeof cell !== 'string') continue;
          const label = cell.trim().toUpperCase();
          if (label.startsWith('INVOICE DATE')) invoiceDate = excelDateToISO(row[c + 1]);
          else if (label.startsWith('DUE DATE')) dueDate = excelDateToISO(row[c + 1]);
          else if (label.startsWith('INVOICE NO')) invoiceNo = String(row[c + 1] || '').trim();
        }
        if (row[0] === 'NO.' && String(row[1] || '').toUpperCase().startsWith('ITEM')) { headerRowIdx = r; break; }
      }
      if (!invoiceNo || headerRowIdx === -1) { skipped++; console.log(`[skip] ${sheetName}: header/invoice no tidak ditemukan`); continue; }
      if (existingNos.has(invoiceNo)) { skipped++; console.log(`[skip] ${invoiceNo}: sudah ada di database`); continue; }

      const headerRow = rows[headerRowIdx];
      let secondCurrencyCol = -1, secondCurrencyLabel = 'USD', personsCol = 3;
      for (let c = 0; c < headerRow.length; c++) {
        const v = String(headerRow[c] || '').toUpperCase();
        if (v.startsWith('AMOUNT') && !v.includes('IDR')) {
          secondCurrencyCol = c;
          const m = v.match(/\(([A-Z]+)\)/);
          if (m) secondCurrencyLabel = m[1];
        }
        if (v.includes('NUMBER OF PERSONS')) personsCol = c;
      }
      const idrCol = headerRow.findIndex(v => String(v || '').toUpperCase().includes('AMOUNT (IDR)'));

      let remark = '';
      let itemStart = headerRowIdx + 1;
      if (rows[itemStart] && rows[itemStart][0] && typeof rows[itemStart][0] !== 'number') {
        remark = String(rows[itemStart][1] || rows[itemStart][0] || '').trim();
        itemStart++;
      }

      const items = [];
      let r = itemStart;
      while (r < rows.length) {
        const row = rows[r];
        if (!row || row.every(v => v === null || v === '')) { r++; continue; }
        if (String(row[2] || '').toUpperCase().includes('TOTAL') || String(row[3] || '').toUpperCase().includes('TOTAL')) break;
        if (typeof row[0] === 'number') {
          let itemName = String(row[1] || '').trim();
          if (!itemName) itemName = remark || `Item ${row[0]}`;
          let amount = null, currency = 'IDR';
          if (idrCol !== -1 && typeof row[idrCol] === 'number' && row[idrCol] !== 0) {
            amount = row[idrCol]; currency = 'IDR';
          } else if (secondCurrencyCol !== -1 && typeof row[secondCurrencyCol] === 'number') {
            amount = row[secondCurrencyCol]; currency = secondCurrencyLabel;
          }
          let persons = (typeof row[personsCol] === 'number' && row[personsCol] > 0) ? row[personsCol] : 1;
          if (itemName && amount !== null) items.push({ item_name: itemName, qty: persons, amount: amount / persons, currency });
        }
        r++;
      }
      if (items.length === 0) { skipped++; console.log(`[skip] ${sheetName}: tidak ada item terbaca`); continue; }
      const currency = items[0].currency;

      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        invoice_no: invoiceNo,
        invoice_date: invoiceDate || '2026-01-01',
        due_date: dueDate,
        customer_name: customerName || 'Unknown',
        customer_address: addressLines.join(', '),
        attn, currency, batch: '', remark, status: 'Belum Dibayar'
      }).select().single();

      if (invErr) { errors.push(`${sheetName}: ${invErr.message}`); continue; }

      const itemRows = items.map(it => ({ invoice_id: inv.id, item_name: it.item_name, qty: it.qty, amount: it.amount }));
      const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows);
      if (itemErr) { errors.push(`${sheetName} (items): ${itemErr.message}`); continue; }

      existingNos.add(invoiceNo);
      imported++;
      console.log(`[ok] ${invoiceNo} — ${customerName} — ${items.length} item`);
    } catch (e) {
      errors.push(`${sheetName}: ${e.message}`);
    }
  }

  console.log(`\nSelesai. Berhasil import: ${imported}, dilewati: ${skipped}, error: ${errors.length}`);
  if (errors.length) {
    console.log('\nDetail error:');
    errors.forEach(e => console.log(' -', e));
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
