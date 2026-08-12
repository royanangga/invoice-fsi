const express = require('express');
const XLSX = require('xlsx');
const { getSupabase } = require('../lib/supabaseClient');
const { nextInvoiceNumber, numFmt } = require('../lib/utils');

const app = express();
app.use(express.json());

// ---------- Settings ----------
app.get('/api/settings', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) throw error;
    const out = { customers: [], number_format: '{seq}/INV/FJI-FA/{roman}/{year}', company: null };
    (data || []).forEach(row => {
      if (row.key === 'customers') out.customers = row.value;
      else if (row.key === 'number_format') out.number_format = row.value;
      else if (row.key === 'company') out.company = row.value;
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { customers, number_format, company } = req.body;
    const rows = [];
    if (customers) rows.push({ key: 'customers', value: customers });
    if (number_format) rows.push({ key: 'number_format', value: number_format });
    if (company) rows.push({ key: 'company', value: company });
    if (rows.length) {
      const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Next invoice number preview ----------
app.get('/api/next-number', async (req, res) => {
  try {
    const supabase = getSupabase();
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const year = new Date(date).getFullYear();
    const { data: nfRow } = await supabase.from('settings').select('value').eq('key', 'number_format').single();
    const template = nfRow ? nfRow.value : '{seq}/INV/FJI-FA/{roman}/{year}';
    const { data: existing, error } = await supabase.from('invoices').select('invoice_no').like('invoice_no', `%/${year}`);
    if (error) throw error;
    const invoice_no = nextInvoiceNumber((existing || []).map(r => r.invoice_no), date, template);
    res.json({ invoice_no });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Invoices CRUD ----------
app.get('/api/invoices', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { q, status, customer } = req.query;
    let query = supabase.from('invoices').select('*, items:invoice_items(*)').order('invoice_date', { ascending: false }).order('id', { ascending: false });
    if (status) query = query.eq('status', status);
    if (customer) query = query.eq('customer_name', customer);
    if (q) query = query.or(`invoice_no.ilike.%${q}%,remark.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    (data || []).forEach(inv => {
      inv.total = (inv.items || []).reduce((s, it) => s + (it.amount * (it.qty || 1)), 0);
    });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/invoices/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('invoices').select('*, items:invoice_items(*)').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { invoice_no, invoice_date, due_date, customer_name, customer_address, attn, currency, batch, remark, items, status, exchange_rate } = req.body;
    if (!invoice_no || !invoice_date || !customer_name) {
      return res.status(400).json({ error: 'invoice_no, invoice_date, customer_name wajib diisi' });
    }
    const { data: inv, error: invErr } = await supabase.from('invoices').insert({
      invoice_no, invoice_date, due_date: due_date || null, customer_name,
      customer_address: customer_address || '', attn: attn || '', currency: currency || 'IDR',
      batch: batch || '', remark: remark || '', status: status || 'Belum Dibayar',
      exchange_rate: exchange_rate || null
    }).select().single();
    if (invErr) {
      if (invErr.code === '23505') return res.status(400).json({ error: 'Nomor invoice sudah digunakan' });
      throw invErr;
    }
    const itemRows = (items || []).map(it => ({ invoice_id: inv.id, item_name: it.item_name, qty: it.qty || 1, amount: it.amount || 0 }));
    if (itemRows.length) {
      const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows);
      if (itemErr) throw itemErr;
    }
    res.json({ id: inv.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/invoices/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { invoice_no, invoice_date, due_date, customer_name, customer_address, attn, currency, batch, remark, items, status, exchange_rate } = req.body;
    const { error: updErr } = await supabase.from('invoices').update({
      invoice_no, invoice_date, due_date: due_date || null, customer_name,
      customer_address: customer_address || '', attn: attn || '', currency: currency || 'IDR',
      batch: batch || '', remark: remark || '', status: status || 'Belum Dibayar',
      exchange_rate: exchange_rate || null
    }).eq('id', req.params.id);
    if (updErr) {
      if (updErr.code === '23505') return res.status(400).json({ error: 'Nomor invoice sudah digunakan' });
      throw updErr;
    }
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
    const itemRows = (items || []).map(it => ({ invoice_id: req.params.id, item_name: it.item_name, qty: it.qty || 1, amount: it.amount || 0 }));
    if (itemRows.length) {
      const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows);
      if (itemErr) throw itemErr;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Print view ----------
app.get('/api/invoices/:id/print', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: inv, error } = await supabase.from('invoices').select('*, items:invoice_items(*)').eq('id', req.params.id).single();
    if (error || !inv) return res.status(404).send('Invoice tidak ditemukan');
    const { data: companyRow } = await supabase.from('settings').select('value').eq('key', 'company').single();
    const co = companyRow ? companyRow.value : {
      name: 'PT. FUJI SEAT INDONESIA', subtitle: '', address_line1: '', address_line2: '', phone: '',
      bank_name: '', bank_branch: '', swift_code: '', account_number: '', signer_name: '', signer_title: ''
    };
    const items = inv.items || [];
    const total = items.reduce((s, it) => s + (it.amount * (it.qty || 1)), 0);
    const isIDR = inv.currency === 'IDR';

    const rows = items.map((it, i) => `
      <tr>
        <td class="c-no">${i + 1}</td>
        <td class="c-item">${it.item_name}</td>
        <td class="c-qty">${it.qty || ''}</td>
        <td class="c-amt">${numFmt(it.amount * (it.qty || 1))}</td>
      </tr>`).join('');

    const exRateLine = (!isIDR && inv.exchange_rate) ? `
      <div class="ex-rate"><span>Exchange Rate :</span><strong>${Number(inv.exchange_rate).toLocaleString('en-US')}</strong></div>` : '';

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${inv.invoice_no}</title>
    <style>
      @page { size: A4; margin: 18mm 15mm; }
      * { box-sizing: border-box; }
      body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; margin:0; padding: 0; }
      .co-name { font-size: 20pt; font-weight: bold; text-align:center; margin:0; }
      .co-line { font-size: 12pt; text-align:center; }
      .spacer-sm { height: 14px; }
      .spacer-md { height: 22px; }
      .to-label { font-weight:bold; }
      .customer-name { font-weight:bold; font-size:12pt; }
      .attn-row { font-weight:bold; }
      .invoice-head { display:flex; justify-content:space-between; align-items:flex-start; margin-top: 20px; }
      .invoice-title { font-size:20pt; font-weight:bold; }
      .meta-table td { padding: 2px 6px; font-weight:bold; font-size: 11pt; }
      .meta-table td.label { text-align:left; }
      .meta-table td.colon { text-align:center; width:10px; }
      .meta-table td.value { text-align:right; }
      table.items { width:100%; border-collapse: collapse; margin-top: 14px; }
      table.items th { border-top: 2px solid #000; border-bottom: 1px solid #000; padding: 5px 6px; font-weight:bold; font-size:11pt; }
      table.items td { padding: 4px 6px; font-size: 11pt; }
      .c-no { text-align:center; width: 5%; }
      .c-item { text-align:left; width: 55%; }
      .c-qty { text-align:center; width: 15%; }
      .c-amt { text-align:right; width: 25%; }
      tr.group-header td { font-weight:bold; text-align:center; padding-top:10px; }
      .ex-rate { text-align:right; margin-top: 10px; font-size:11pt; }
      .ex-rate span { margin-right: 10px; }
      tr.total-row td { font-weight:bold; border-top: 2px solid #000; padding-top:8px; }
      .footer { display:flex; justify-content:space-between; margin-top: 50px; }
      .footer .bank-block { font-size: 10pt; }
      .footer .bank-block .co-repeat { font-size: 11pt; font-weight:bold; margin-bottom:4px; }
      .footer .sig-block { text-align:center; font-size: 11pt; }
      .footer .sig-issuer { font-weight:bold; margin-bottom: 55px; }
      .footer .sig-name { font-weight:bold; border-top: 1px solid #000; padding-top:4px; display:inline-block; min-width:180px; }
      .footer .sig-title { font-weight:bold; }
      @media print { .no-print { display:none; } }
    </style></head><body>
      <p class="co-name">${co.name}</p>
      <p class="co-line">${co.subtitle}</p>
      <p class="co-line">${co.address_line1}</p>
      <p class="co-line">${co.address_line2}</p>
      <p class="co-line">${co.phone}</p>
      <div class="spacer-md"></div>
      <div class="to-label">TO :</div>
      <div class="customer-name">${inv.customer_name}</div>
      <div style="white-space:pre-line">${(inv.customer_address || '').split(',').map(s => s.trim()).filter(Boolean).join('\n')}</div>
      <div class="spacer-sm"></div>
      ${inv.attn ? `<div class="attn-row">ATTN : ${inv.attn}</div>` : ''}
      <div class="invoice-head">
        <div class="invoice-title">INVOICE</div>
        <table class="meta-table">
          <tr><td class="label">INVOICE DATE</td><td class="colon">:</td><td class="value">${inv.invoice_date}</td></tr>
          <tr><td class="label">DUE DATE</td><td class="colon">:</td><td class="value">${inv.due_date || '-'}</td></tr>
          <tr><td class="label">INVOICE NO.</td><td class="colon">:</td><td class="value">${inv.invoice_no}</td></tr>
        </table>
      </div>
      <table class="items">
        <thead><tr>
          <th class="c-no">NO.</th><th class="c-item">ITEM</th>
          <th class="c-qty">Number of Persons</th><th class="c-amt">AMOUNT (${inv.currency})</th>
        </tr></thead>
        <tbody>
          ${inv.remark ? `<tr class="group-header"><td colspan="4">${inv.remark}</td></tr>` : ''}
          ${rows}
          <tr class="total-row"><td colspan="3" style="text-align:right">TOTAL</td><td class="c-amt">${numFmt(total)}</td></tr>
        </tbody>
      </table>
      ${exRateLine}
      <div class="footer">
        <div class="bank-block">
          <div class="co-repeat">${co.name}</div>
          <div><strong>Bank :</strong> ${co.bank_name}</div>
          <div>${co.bank_branch}</div>
          <div>SWIFT CODE : ${co.swift_code}</div>
          <div>(${inv.currency}) ${co.account_number}</div>
        </div>
        <div class="sig-block">
          <div class="sig-issuer">${co.name}</div>
          <div class="sig-name">${co.signer_name}</div>
          <div class="sig-title">${co.signer_title}</div>
        </div>
      </div>
      <button class="no-print" onclick="window.print()" style="margin-top:30px;padding:8px 16px;">Print / Save as PDF</button>
    </body></html>`);
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// ---------- Excel export ----------
app.get('/api/export', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: invoices, error } = await supabase.from('invoices').select('*, items:invoice_items(*)').order('invoice_date');
    if (error) throw error;
    const summaryRows = (invoices || []).map(inv => {
      const total = (inv.items || []).reduce((s, it) => s + (it.amount * (it.qty || 1)), 0);
      return {
        'INVOICE NO.': inv.invoice_no, 'INVOICE DATE': inv.invoice_date, 'DUE DATE': inv.due_date,
        'CUSTOMER': inv.customer_name, 'REMARK': inv.remark, 'BATCH': inv.batch,
        'CURRENCY': inv.currency, 'TOTAL': total, 'STATUS': inv.status
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=invoice_export.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Untuk `vercel dev` / deploy: export app langsung sebagai handler.
module.exports = app;

// Untuk jalan lokal biasa (node api/index.js) saat development/testing.
if (require.main === module) {
  const PORT = process.env.PORT || 3210;
  app.listen(PORT, () => console.log(`Invoice app (Supabase) jalan di http://localhost:${PORT}`));
}
