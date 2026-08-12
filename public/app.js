const app = document.getElementById('app');
let state = {
  invoices: [], settings: { customers: [] }, filters: { q: '', status: '', customer: '' },
  me: null, view: 'invoices', users: []
};

/* ---------- Icon set (inline SVG, konsisten dgn palet UI) ---------- */
const ICONS = {
  invoice: `<svg viewBox="0 0 24 24" class="icon"><path d="M6 3h12v16.5l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V3z"/><line x1="8.5" y1="8" x2="15.5" y2="8"/><line x1="8.5" y1="11.5" x2="15.5" y2="11.5"/><line x1="8.5" y1="15" x2="12.5" y2="15"/></svg>`,
  users: `<svg viewBox="0 0 24 24" class="icon"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.3c2.4.3 4 2.1 4 4.7"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" class="icon"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" class="icon"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>`,
  download: `<svg viewBox="0 0 24 24" class="icon"><path d="M12 4v11M8 11l4 4 4-4"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" class="icon"><path d="M12 5v14M5 12h14"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" class="icon"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  check: `<svg viewBox="0 0 24 24" class="icon"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  x: `<svg viewBox="0 0 24 24" class="icon"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" class="icon"><path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4"/><path d="M13 8l5 4-5 4M18 12H8"/></svg>`,
  print: `<svg viewBox="0 0 24 24" class="icon"><path d="M6.5 8.7V3.8h11v4.9"/><rect x="4" y="8.7" width="16" height="6.6" rx="1.2"/><path d="M7 15.3V20h10v-4.7"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" class="icon"><path d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25z"/><path d="M14.5 4.94l2.75 2.75"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" class="icon"><path d="M4 6.5h16M9 6.5V4.3a1 1 0 011-1h4a1 1 0 011 1v2.2M6.5 6.5l.9 12.3a1.4 1.4 0 001.4 1.3h6.4a1.4 1.4 0 001.4-1.3l.9-12.3"/><path d="M10 10.5v6M14 10.5v6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" class="icon"><circle cx="10.5" cy="10.5" r="6"/><path d="M19 19l-4.3-4.3"/></svg>`
};
function icon(name, extraClass) {
  const svg = ICONS[name] || '';
  return extraClass ? svg.replace('class="icon"', `class="icon ${extraClass}"`) : svg;
}
function spinner(extraClass) { return `<span class="spinner${extraClass ? ' ' + extraClass : ''}"></span>`; }

/* ---------- Loading indicators (splash + top progress bar) ---------- */
let activeRequests = 0;
function showTopLoader() {
  const el = document.getElementById('topLoader');
  if (!el) return;
  activeRequests++;
  el.classList.add('is-active');
  el.style.width = '65%';
}
function hideTopLoader() {
  const el = document.getElementById('topLoader');
  if (!el) return;
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests > 0) return;
  el.style.width = '100%';
  setTimeout(() => {
    if (activeRequests === 0) { el.classList.remove('is-active'); el.style.width = '0%'; }
  }, 250);
}
function hideAppLoader() {
  const el = document.getElementById('appLoader');
  if (!el) return;
  el.classList.add('loader-hidden');
  setTimeout(() => el.remove(), 400);
}

async function api(path, opts) {
  showTopLoader();
  try {
    const res = await fetch(path, opts);
    if (res.status === 401) { window.location.href = 'login.html'; throw new Error('Belum login'); }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Terjadi kesalahan' }));
      throw new Error(err.error || 'Terjadi kesalahan');
    }
    return res.json();
  } finally {
    hideTopLoader();
  }
}

async function checkAuth() {
  const me = await fetch('/api/me').then(r => r.json());
  if (!me) { window.location.href = 'login.html'; return false; }
  state.me = me;
  return true;
}

async function loadAll() {
  const [invoices, settings] = await Promise.all([
    api('/api/invoices' + buildQuery()),
    api('/api/settings')
  ]);
  state.invoices = invoices;
  state.settings = settings;
  renderShell();
  hideAppLoader();
}

function buildQuery() {
  const p = new URLSearchParams();
  if (state.filters.q) p.set('q', state.filters.q);
  if (state.filters.status) p.set('status', state.filters.status);
  if (state.filters.customer) p.set('customer', state.filters.customer);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function fmt(n, cur) {
  if (n === null || n === undefined) return '';
  return `${cur} ${Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function initials(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

const VIEW_TITLES = {
  invoices: { title: 'Daftar Invoice', icon: icon('invoice', 'icon-lg') },
  users: { title: 'Kelola User', icon: icon('users', 'icon-lg') },
  settings: { title: 'Pengaturan Perusahaan', icon: icon('settings', 'icon-lg') }
};

/* ---------- Shell: sidebar + main-content container (rendered once per login/reload) ---------- */
function renderShell() {
  const me = state.me;
  const isManager = me.role === 'manager';

  app.innerHTML = `
    <div class="layout" id="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-logo">FS</div>
          <div class="brand-text">
            <div class="brand-title">Invoice App</div>
            <div class="brand-sub">Fuji Seat Indonesia</div>
          </div>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-item ${state.view === 'invoices' ? 'active' : ''}" data-view="invoices" type="button" style="animation-delay:.02s">
            <span class="nav-icon">${icon('invoice')}</span> Invoice
          </button>
          ${isManager ? `<button class="nav-item ${state.view === 'users' ? 'active' : ''}" data-view="users" type="button" style="animation-delay:.06s">
            <span class="nav-icon">${icon('users')}</span> Kelola User
          </button>` : ''}
          <button class="nav-item ${state.view === 'settings' ? 'active' : ''}" data-view="settings" type="button" style="animation-delay:.10s">
            <span class="nav-icon">${icon('settings')}</span> Pengaturan Perusahaan
          </button>
        </nav>
        <div class="sidebar-footer">
          <div class="user-chip">
            <div class="avatar">${initials(me.name)}</div>
            <div class="user-meta">
              <div class="user-name">${me.name}</div>
              <div class="user-role">${isManager ? 'Manager' : 'Staff'}</div>
            </div>
          </div>
          <button class="btn-logout" id="btnLogout" type="button">${icon('logout')} Keluar</button>
        </div>
      </aside>
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>

      <main class="main-content" id="mainContent"></main>

      <button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Buka menu">${icon('menu')}</button>
    </div>
  `;

  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });
  document.getElementById('btnLogout').onclick = async () => {
    const btn = document.getElementById('btnLogout');
    btn.disabled = true;
    btn.innerHTML = spinner() + ' Keluar...';
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
  };

  const layoutEl = document.getElementById('layout');
  document.getElementById('sidebarToggle').onclick = () => layoutEl.classList.toggle('sidebar-open');
  document.getElementById('sidebarBackdrop').onclick = () => layoutEl.classList.remove('sidebar-open');

  renderMain();
}

function switchView(view) {
  if (view === 'users' && state.me.role !== 'manager') return;
  state.view = view;
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.getElementById('layout').classList.remove('sidebar-open');
  renderMain();
}

/* ---------- Main content: swapped per tab, without re-rendering the sidebar ---------- */
async function renderMain() {
  const main = document.getElementById('mainContent');
  if (state.view === 'users') {
    main.innerHTML = `<div class="loading-state">${spinner('spinner-lg')}<span>Memuat data user...</span></div>`;
    try {
      state.users = await api('/api/users');
    } catch (e) {
      main.innerHTML = `<div class="empty-state">${e.message}</div>`;
      return;
    }
  }
  main.innerHTML = state.view === 'invoices' ? invoicesViewHtml()
    : state.view === 'users' ? usersViewHtml()
    : settingsViewHtml();

  if (state.view === 'invoices') wireInvoicesView();
  else if (state.view === 'users') wireUsersView();
  else wireSettingsView();
}

/* ---------- Invoice tab ---------- */
function invoicesViewHtml() {
  const t = VIEW_TITLES.invoices;
  return `
    <header class="page-header">
      <div>
        <h1>${t.icon} ${t.title}</h1>
        <div class="sub">${state.invoices.length} invoice ditemukan</div>
      </div>
      <div class="header-actions">
        <input type="file" id="importFile" accept=".xls,.xlsx" style="display:none">
        <button class="btn-secondary" id="btnImport">${icon('upload')} Import Excel</button>
        <button class="btn-secondary" id="btnExport">${icon('download')} Export Excel</button>
        <button class="btn-primary" id="btnNew">${icon('plus')} Invoice Baru</button>
      </div>
    </header>

    <div class="toolbar">
      <div class="search-wrap">${icon('search', 'icon-sm')}<input id="q" placeholder="Cari no. invoice / remark..." value="${state.filters.q}"></div>
      <select id="filterCustomer">
        <option value="">Semua Customer</option>
        ${state.settings.customers.map(c => `<option value="${c.name}" ${state.filters.customer === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
      <select id="filterStatus">
        <option value="">Semua Status</option>
        <option value="Belum Dibayar" ${state.filters.status === 'Belum Dibayar' ? 'selected' : ''}>Belum Dibayar</option>
        <option value="Sudah Dibayar" ${state.filters.status === 'Sudah Dibayar' ? 'selected' : ''}>Sudah Dibayar</option>
      </select>
      <div class="spacer"></div>
    </div>

    ${state.invoices.length === 0 ? `<div class="empty-state">Belum ada invoice. Klik "+ Invoice Baru" untuk mulai.</div>` : `
    <table class="list">
      <thead><tr><th>No. Invoice</th><th>Tanggal</th><th>Customer</th><th>Remark</th><th>Total</th><th>Status</th><th>Approval</th><th></th></tr></thead>
      <tbody>
        ${state.invoices.map((inv, i) => `
          <tr style="animation-delay:${Math.min(i * 0.03, 0.5)}s">
            <td>${inv.invoice_no}</td>
            <td>${inv.invoice_date}</td>
            <td>${inv.customer_name}</td>
            <td>${inv.remark || ''}</td>
            <td class="total-badge">${fmt(inv.total, inv.currency)}</td>
            <td><span class="badge ${inv.status === 'Sudah Dibayar' ? 'badge-paid' : 'badge-unpaid'}">${inv.status}</span></td>
            <td>
              <span class="badge ${inv.approval_status === 'approved' ? 'badge-paid' : 'badge-unpaid'}">
                ${inv.approval_status === 'approved' ? 'Disetujui' : 'Menunggu Approval'}
              </span>
              ${inv.approval_status !== 'approved' && state.me.role === 'manager' ? `<button class="btn-primary btn-icon" style="margin-left:6px" onclick="approveInvoice(${inv.id})">${icon('check', 'icon-sm')} Approve</button>` : ''}
            </td>
            <td>
              <button class="btn-secondary btn-icon" onclick="printInvoice(${inv.id})">${icon('print', 'icon-sm')} Print</button>
              <button class="btn-secondary btn-icon" onclick="editInvoice(${inv.id})">${icon('edit', 'icon-sm')} Edit</button>
              <button class="btn-danger btn-icon" onclick="deleteInvoice(${inv.id})">${icon('trash', 'icon-sm')} Hapus</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`}
  `;
}

function wireInvoicesView() {
  document.getElementById('btnNew').onclick = () => openForm();
  document.getElementById('btnExport').onclick = () => window.open('/api/export', '_blank');
  document.getElementById('btnImport').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = handleImportFile;
  document.getElementById('q').oninput = debounce(e => { state.filters.q = e.target.value; refreshInvoices(); }, 350);
  document.getElementById('filterCustomer').onchange = e => { state.filters.customer = e.target.value; refreshInvoices(); };
  document.getElementById('filterStatus').onchange = e => { state.filters.status = e.target.value; refreshInvoices(); };
}

async function refreshInvoices() {
  state.invoices = await api('/api/invoices' + buildQuery());
  if (state.view === 'invoices') renderMain();
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const btn = document.getElementById('btnImport');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = spinner() + ' Mengimpor...'; }
  showTopLoader();
  try {
    const res = await fetch('/api/import-xls', { method: 'POST', body: formData });
    const result = await res.json();
    if (!res.ok) { alert('Import gagal: ' + (result.error || 'terjadi kesalahan')); return; }
    alert(`Import selesai.\nBerhasil: ${result.imported}\nDilewati (sudah ada / tidak terbaca): ${result.skipped}${result.errors && result.errors.length ? '\nError: ' + result.errors.length : ''}`);
    refreshInvoices();
  } catch (err) {
    alert('Import gagal: ' + err.message);
  } finally {
    hideTopLoader();
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
  }
  e.target.value = '';
}

window.approveInvoice = async (id) => {
  await api(`/api/invoices/${id}/approve`, { method: 'POST' });
  refreshInvoices();
};

window.printInvoice = (id) => window.open(`/api/invoices/${id}/print`, '_blank');

window.deleteInvoice = async (id) => {
  if (!confirm('Hapus invoice ini?')) return;
  await api(`/api/invoices/${id}`, { method: 'DELETE' });
  refreshInvoices();
};

window.editInvoice = async (id) => {
  const inv = await api(`/api/invoices/${id}`);
  openForm(inv);
};

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- Kelola User tab ---------- */
function usersViewHtml() {
  const t = VIEW_TITLES.users;
  const users = state.users;
  return `
    <header class="page-header">
      <div>
        <h1>${t.icon} ${t.title}</h1>
        <div class="sub">${users.length} akun terdaftar</div>
      </div>
    </header>

    <div class="panel" style="margin-bottom:20px">
      ${users.length === 0 ? `<div class="empty-state">Belum ada user lain.</div>` : `
      <table class="items-table">
        <thead><tr><th>Nama</th><th>Username</th><th>Role</th><th></th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${u.name}</td>
              <td>${u.username}</td>
              <td><span class="badge ${u.role === 'manager' ? 'badge-paid' : 'badge-unpaid'}">${u.role === 'manager' ? 'Manager' : 'Staff'}</span></td>
              <td style="text-align:right"><button class="btn-danger btn-icon" data-del="${u.id}" type="button">${icon('trash', 'icon-sm')} Hapus</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`}
    </div>

    <div class="panel">
      <h2>Tambah User Baru</h2>
      <div class="form-row">
        <div class="form-group"><label>Nama Lengkap</label><input id="u_name"></div>
        <div class="form-group"><label>Username</label><input id="u_username"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Password (min. 6 karakter)</label><input id="u_password" type="password"></div>
        <div class="form-group"><label>Role</label>
          <select id="u_role"><option value="staff">Staff</option><option value="manager">Manager</option></select>
        </div>
      </div>
      <div id="usersError" class="error-msg"></div>
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn-primary" id="btnAddUser">${icon('plus')} Tambah User</button>
      </div>
    </div>
  `;
}

function wireUsersView() {
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Hapus user ini?')) return;
      const original = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = spinner();
      try {
        await api(`/api/users/${btn.dataset.del}`, { method: 'DELETE' });
        renderMain();
      } catch (e) {
        alert(e.message);
        btn.disabled = false; btn.innerHTML = original;
      }
    };
  });

  const addBtn = document.getElementById('btnAddUser');
  const addBtnOriginal = addBtn.innerHTML;
  addBtn.onclick = async () => {
    addBtn.disabled = true; addBtn.innerHTML = spinner() + ' Menambahkan...';
    try {
      await api('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('u_name').value,
          username: document.getElementById('u_username').value,
          password: document.getElementById('u_password').value,
          role: document.getElementById('u_role').value
        })
      });
      renderMain();
    } catch (e) {
      document.getElementById('usersError').textContent = e.message;
      addBtn.disabled = false; addBtn.innerHTML = addBtnOriginal;
    }
  };
}

/* ---------- Pengaturan Perusahaan tab ---------- */
function settingsViewHtml() {
  const t = VIEW_TITLES.settings;
  const co = state.settings.company || {
    name: 'PT. FUJI SEAT INDONESIA', subtitle: '', address_line1: '', address_line2: '', phone: '',
    bank_name: '', bank_branch: '', swift_code: '', account_number: '', signer_name: '', signer_title: ''
  };
  return `
    <header class="page-header">
      <div>
        <h1>${t.icon} ${t.title}</h1>
        <div class="sub">Data ini dipakai untuk kop &amp; tanda tangan di hasil cetak invoice</div>
      </div>
    </header>

    <div class="panel">
      <div class="form-row"><div class="form-group"><label>Nama Perusahaan</label><input id="s_name" value="${co.name}"></div></div>
      <div class="form-row"><div class="form-group"><label>Subtitle</label><input id="s_subtitle" value="${co.subtitle}"></div></div>
      <div class="form-row"><div class="form-group"><label>Alamat Baris 1</label><input id="s_addr1" value="${co.address_line1}"></div></div>
      <div class="form-row"><div class="form-group"><label>Alamat Baris 2</label><input id="s_addr2" value="${co.address_line2}"></div></div>
      <div class="form-row"><div class="form-group"><label>Telepon/Fax</label><input id="s_phone" value="${co.phone}"></div></div>
      <div class="form-row">
        <div class="form-group"><label>Nama Bank</label><input id="s_bank" value="${co.bank_name}"></div>
        <div class="form-group"><label>Cabang</label><input id="s_branch" value="${co.bank_branch}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Swift Code</label><input id="s_swift" value="${co.swift_code}"></div>
        <div class="form-group"><label>No. Rekening</label><input id="s_acc" value="${co.account_number}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Nama Penandatangan</label><input id="s_signer" value="${co.signer_name}"></div>
        <div class="form-group"><label>Jabatan</label><input id="s_title" value="${co.signer_title}"></div>
      </div>
      <div id="settingsSaved" class="saved-msg"></div>
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn-primary" id="btnSaveS">${icon('check')} Simpan Perubahan</button>
      </div>
    </div>
  `;
}

function wireSettingsView() {
  const saveBtn = document.getElementById('btnSaveS');
  const saveBtnOriginal = saveBtn.innerHTML;
  saveBtn.onclick = async () => {
    saveBtn.disabled = true; saveBtn.innerHTML = spinner() + ' Menyimpan...';
    const company = {
      name: document.getElementById('s_name').value,
      subtitle: document.getElementById('s_subtitle').value,
      address_line1: document.getElementById('s_addr1').value,
      address_line2: document.getElementById('s_addr2').value,
      phone: document.getElementById('s_phone').value,
      bank_name: document.getElementById('s_bank').value,
      bank_branch: document.getElementById('s_branch').value,
      swift_code: document.getElementById('s_swift').value,
      account_number: document.getElementById('s_acc').value,
      signer_name: document.getElementById('s_signer').value,
      signer_title: document.getElementById('s_title').value
    };
    const saved = document.getElementById('settingsSaved');
    try {
      await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company }) });
      state.settings.company = company;
      saved.classList.remove('is-error');
      saved.innerHTML = `${icon('check', 'icon-sm')} Perubahan tersimpan`;
      setTimeout(() => { saved.textContent = ''; }, 2500);
    } catch (e) {
      saved.classList.add('is-error');
      saved.textContent = e.message;
    } finally {
      saveBtn.disabled = false; saveBtn.innerHTML = saveBtnOriginal;
    }
  };
}

/* ---------- Invoice form (tetap modal, form-nya panjang & kontekstual per baris) ---------- */
async function openForm(existing) {
  const isEdit = !!existing;
  const customers = state.settings.customers;
  let items = existing ? existing.items.map(it => ({ ...it })) : [{ item_name: '', qty: 1, amount: 0 }];
  let invoiceNo = existing ? existing.invoice_no : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? 'Edit Invoice' : 'Invoice Baru'}</h2>
      <div class="form-row">
        <div class="form-group">
          <label>Customer</label>
          <select id="f_customer">
            ${customers.map(c => `<option value="${c.name}" data-currency="${c.currency}" data-address="${c.address}" ${existing && existing.customer_name === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Currency</label>
          <select id="f_currency">
            <option value="IDR" ${existing && existing.currency === 'IDR' ? 'selected' : ''}>IDR</option>
            <option value="USD" ${existing && existing.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="JPY" ${existing && existing.currency === 'JPY' ? 'selected' : ''}>JPY</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>No. Invoice ${isEdit ? '' : '(auto, bisa diubah)'}</label>
          <input id="f_no" value="${invoiceNo}">
        </div>
        <div class="form-group">
          <label>Tanggal Invoice</label>
          <input type="date" id="f_date" value="${existing ? existing.invoice_date : new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" id="f_due" value="${existing && existing.due_date ? existing.due_date : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>ATTN</label>
          <input id="f_attn" value="${existing ? (existing.attn || '') : ''}">
        </div>
        <div class="form-group">
          <label>Batch</label>
          <input id="f_batch" value="${existing ? (existing.batch || '') : ''}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="f_status">
            <option value="Belum Dibayar" ${existing && existing.status === 'Belum Dibayar' ? 'selected' : ''}>Belum Dibayar</option>
            <option value="Sudah Dibayar" ${existing && existing.status === 'Sudah Dibayar' ? 'selected' : ''}>Sudah Dibayar</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Exchange Rate (opsional, tampil di print jika bukan IDR)</label>
          <input type="number" step="any" id="f_exrate" value="${existing && existing.exchange_rate ? existing.exchange_rate : ''}" placeholder="mis. 17502">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>Remark</label>
        <textarea id="f_remark" rows="2">${existing ? (existing.remark || '') : ''}</textarea>
      </div>

      <label style="font-size:12px;color:var(--muted);font-weight:600">Item</label>
      <table class="items-table" id="itemsTable">
        <thead><tr><th style="width:50%">Nama Item</th><th style="width:15%">Qty</th><th style="width:25%">Jumlah</th><th></th></tr></thead>
        <tbody id="itemsBody"></tbody>
      </table>
      <button class="btn-secondary btn-icon" id="btnAddItem" type="button">${icon('plus', 'icon-sm')} Tambah Item</button>

      <div id="formError" class="error-msg"></div>
      <div class="modal-actions">
        <button class="btn-secondary" id="btnCancel">${icon('x', 'icon-sm')} Batal</button>
        <button class="btn-primary" id="btnSave">${icon('check', 'icon-sm')} Simpan</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderItems() {
    const body = overlay.querySelector('#itemsBody');
    body.innerHTML = items.map((it, i) => `
      <tr>
        <td><input value="${it.item_name}" data-i="${i}" data-field="item_name"></td>
        <td><input type="number" step="any" value="${it.qty}" data-i="${i}" data-field="qty"></td>
        <td><input type="number" step="any" value="${it.amount}" data-i="${i}" data-field="amount"></td>
        <td><button class="btn-danger btn-icon" data-remove="${i}" type="button">${icon('x', 'icon-sm')}</button></td>
      </tr>
    `).join('');
    body.querySelectorAll('input').forEach(inp => {
      inp.oninput = e => {
        const i = +e.target.dataset.i;
        const field = e.target.dataset.field;
        items[i][field] = field === 'item_name' ? e.target.value : Number(e.target.value);
      };
    });
    body.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => { items.splice(+btn.dataset.remove, 1); renderItems(); };
    });
  }
  renderItems();

  overlay.querySelector('#btnAddItem').onclick = () => { items.push({ item_name: '', qty: 1, amount: 0 }); renderItems(); };

  const customerSel = overlay.querySelector('#f_customer');
  const currencySel = overlay.querySelector('#f_currency');
  customerSel.onchange = () => {
    const opt = customerSel.selectedOptions[0];
    if (opt.dataset.currency) currencySel.value = opt.dataset.currency;
  };

  const dateInput = overlay.querySelector('#f_date');
  if (!isEdit) {
    const fillNextNumber = async () => {
      const r = await api(`/api/next-number?date=${dateInput.value}`);
      overlay.querySelector('#f_no').value = r.invoice_no;
    };
    dateInput.onchange = fillNextNumber;
    fillNextNumber();
    customerSel.dispatchEvent(new Event('change'));
  }

  overlay.querySelector('#btnCancel').onclick = () => overlay.remove();

  const saveBtn = overlay.querySelector('#btnSave');
  const saveBtnOriginal = saveBtn.innerHTML;
  saveBtn.onclick = async () => {
    const opt = customerSel.selectedOptions[0];
    const payload = {
      invoice_no: overlay.querySelector('#f_no').value.trim(),
      invoice_date: dateInput.value,
      due_date: overlay.querySelector('#f_due').value || null,
      customer_name: customerSel.value,
      customer_address: opt.dataset.address || '',
      attn: overlay.querySelector('#f_attn').value,
      currency: currencySel.value,
      batch: overlay.querySelector('#f_batch').value,
      remark: overlay.querySelector('#f_remark').value,
      status: overlay.querySelector('#f_status').value,
      exchange_rate: overlay.querySelector('#f_exrate').value ? Number(overlay.querySelector('#f_exrate').value) : null,
      items: items.filter(it => it.item_name.trim() !== '')
    };
    if (!payload.invoice_no || !payload.invoice_date || payload.items.length === 0) {
      overlay.querySelector('#formError').textContent = 'No. invoice, tanggal, dan minimal 1 item wajib diisi.';
      return;
    }
    saveBtn.disabled = true; saveBtn.innerHTML = spinner() + ' Menyimpan...';
    try {
      if (isEdit) {
        await api(`/api/invoices/${existing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await api('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      overlay.remove();
      refreshInvoices();
    } catch (e) {
      overlay.querySelector('#formError').textContent = e.message;
      saveBtn.disabled = false; saveBtn.innerHTML = saveBtnOriginal;
    }
  };
}

(async () => {
  try {
    const ok = await checkAuth();
    if (ok) await loadAll();
    else hideAppLoader();
  } catch (e) {
    hideAppLoader();
  }
})();
