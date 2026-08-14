const app = document.getElementById('app');
let state = {
  invoices: [], settings: { customers: [] }, filters: { q: '', stage: '', customer: '' },
  me: null, view: 'invoices', users: [], selectedIds: new Set(),
  approvalTab: 'pending', approvalList: []
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
  search: `<svg viewBox="0 0 24 24" class="icon"><circle cx="10.5" cy="10.5" r="6"/><path d="M19 19l-4.3-4.3"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" class="icon"><path d="M7 10l5 5 5-5"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" class="icon"><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="2.6"/></svg>`
};
function icon(name, extraClass) {
  const svg = ICONS[name] || '';
  return extraClass ? svg.replace('class="icon"', `class="icon ${extraClass}"`) : svg;
}
function spinner(extraClass) { return `<span class="spinner${extraClass ? ' ' + extraClass : ''}"></span>`; }

// Format angka jadi "4.000.000" (pemisah ribuan gaya Indonesia), khusus bilangan bulat.
function formatRibuan(n) {
  const num = Math.round(Number(n) || 0);
  return num.toLocaleString('id-ID');
}

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
  if (state.filters.customer) p.set('customer', state.filters.customer);
  if (state.filters.stage === 'Draft') p.set('status', 'Draft');
  else if (state.filters.stage === 'Pending') { p.set('status', 'Diajukan'); p.set('approval_status', 'pending'); }
  else if (state.filters.stage === 'Approved') { p.set('status', 'Diajukan'); p.set('approval_status', 'approved'); }
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
  approval: { title: 'Approval Invoice', icon: icon('check', 'icon-lg') },
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
          <div class="brand-logo">${state.settings.company && state.settings.company.logo ? `<img src="${state.settings.company.logo}" alt="Logo">` : 'FS'}</div>
          <div class="brand-text">
            <div class="brand-title">Invoice App</div>
            <div class="brand-sub">${(state.settings.company && state.settings.company.name) || 'Fuji Seat Indonesia'}</div>
          </div>
          <button class="sidebar-close" id="sidebarClose" type="button" aria-label="Tutup menu">${icon('x')}</button>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-group ${(state.view === 'invoices' || state.view === 'invoice_new') ? 'nav-group-open' : ''}">
            <button class="nav-item nav-parent" id="navInvoiceToggle" type="button">
              <span class="nav-icon">${icon('invoice')}</span> Invoice
              <span class="nav-caret">${icon('chevron', 'icon-sm')}</span>
            </button>
            <div class="nav-submenu" id="navInvoiceSubmenu">
              <div class="nav-submenu-inner">
                <button class="nav-item nav-subitem ${state.view === 'invoice_new' ? 'active' : ''}" data-view="invoice_new" type="button">
                  ${icon('plus', 'icon-sm')} Tambah Invoice Baru
                </button>
                <button class="nav-item nav-subitem ${state.view === 'invoices' ? 'active' : ''}" data-view="invoices" type="button">
                  ${icon('invoice', 'icon-sm')} Daftar Invoice
                </button>
              </div>
            </div>
          </div>
          ${isManager ? `<button class="nav-item ${state.view === 'approval' ? 'active' : ''}" data-view="approval" type="button">
            <span class="nav-icon">${icon('check')}</span> Approval
            <span class="nav-badge" id="approvalBadge" style="display:none"></span>
          </button>` : ''}
          ${isManager ? `<button class="nav-item ${state.view === 'users' ? 'active' : ''}" data-view="users" type="button">
            <span class="nav-icon">${icon('users')}</span> Kelola User
          </button>` : ''}
          <button class="nav-item ${state.view === 'settings' ? 'active' : ''}" data-view="settings" type="button">
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
  document.getElementById('navInvoiceToggle').onclick = () => {
    document.querySelector('.nav-group').classList.toggle('nav-group-open');
  };
  document.getElementById('btnLogout').onclick = async () => {
    const btn = document.getElementById('btnLogout');
    btn.disabled = true;
    btn.innerHTML = spinner() + ' Keluar...';
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
  };

  const layoutEl = document.getElementById('layout');
  document.getElementById('sidebarToggle').onclick = () => layoutEl.classList.toggle('sidebar-open');
  document.getElementById('sidebarClose').onclick = () => layoutEl.classList.remove('sidebar-open');
  document.getElementById('sidebarBackdrop').onclick = () => layoutEl.classList.remove('sidebar-open');

  renderMain();
  updateApprovalBadge();
}

function switchView(view) {
  if ((view === 'users' || view === 'approval') && state.me.role !== 'manager') return;
  state.view = view;
  state.selectedIds.clear();
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  if (view === 'invoices' || view === 'invoice_new') {
    const group = document.querySelector('.nav-group');
    if (group) group.classList.add('nav-group-open');
  }
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
  if (state.view === 'approval') {
    main.innerHTML = `<div class="loading-state">${spinner('spinner-lg')}<span>Memuat data approval...</span></div>`;
    try {
      await refreshApprovalList();
    } catch (e) {
      main.innerHTML = `<div class="empty-state">${e.message}</div>`;
      return;
    }
  }
  if (state.view === 'settings' && state.me.role === 'manager') {
    try {
      state.mySignature = await api('/api/me/signature');
    } catch (e) {
      state.mySignature = { title: '', signature: null };
    }
  }
  main.innerHTML = state.view === 'invoices' ? invoicesViewHtml()
    : state.view === 'invoice_new' ? invoiceNewPageHtml()
    : state.view === 'approval' ? approvalViewHtml()
    : state.view === 'users' ? usersViewHtml()
    : settingsViewHtml();

  if (state.view === 'invoices') wireInvoicesView();
  else if (state.view === 'invoice_new') wireInvoiceNewPage();
  else if (state.view === 'approval') wireApprovalView();
  else if (state.view === 'users') wireUsersView();
  else wireSettingsView();
}

/* ---------- Invoice tab ---------- */
function invoicesViewHtml() {
  const t = VIEW_TITLES.invoices;
  const allChecked = state.invoices.length > 0 && state.invoices.every(inv => state.selectedIds.has(inv.id));
  return `
    <div class="content-split">
    <div class="content-main">
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
        <option value="Draft" ${state.filters.stage === 'Draft' ? 'selected' : ''}>Draft</option>
        <option value="Pending" ${state.filters.stage === 'Pending' ? 'selected' : ''}>Menunggu Approval</option>
        <option value="Approved" ${state.filters.stage === 'Approved' ? 'selected' : ''}>Disetujui</option>
      </select>
      <div class="spacer"></div>
    </div>

    <div class="bulk-bar" id="bulkBar">
      <span class="bulk-count" id="bulkCount">0 dipilih</span>
      <div class="bulk-actions">
        <button class="btn-secondary btn-icon" id="bulkPrint" type="button">${icon('print', 'icon-sm')} Print</button>
        <button class="btn-danger btn-icon" id="bulkDelete" type="button">${icon('trash', 'icon-sm')} Hapus</button>
        <button class="btn-secondary btn-icon" id="bulkClear" type="button">${icon('x', 'icon-sm')} Batalkan</button>
      </div>
    </div>

    ${state.invoices.length === 0 ? `<div class="empty-state">Belum ada invoice. Klik "+ Invoice Baru" untuk mulai.</div>` : `
    <div class="table-wrap">
    <table class="list">
      <thead><tr>
        <th class="th-check"><input type="checkbox" id="checkAll" ${allChecked ? 'checked' : ''}></th>
        <th>No. Invoice</th><th>Tanggal</th><th>Customer</th><th>Total</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>
        ${state.invoices.map((inv, i) => {
          const isDraft = inv.status === 'Draft';
          const isApproved = !isDraft && inv.approval_status === 'approved';
          const hasValuta = inv.currency && inv.currency !== 'IDR' && inv.exchange_rate;
          return `
          <tr style="animation-delay:${Math.min(i * 0.03, 0.5)}s" class="${state.selectedIds.has(inv.id) ? 'row-selected' : ''}">
            <td class="td-check"><input type="checkbox" class="row-check" data-id="${inv.id}" ${state.selectedIds.has(inv.id) ? 'checked' : ''}></td>
            <td>${inv.invoice_no || '<span class="muted-cell">(belum diisi)</span>'}</td>
            <td>${inv.invoice_date || '-'}</td>
            <td>${inv.customer_name || '<span class="muted-cell">(belum diisi)</span>'}</td>
            <td class="total-badge">
              ${hasValuta ? `<div class="total-valuta">${fmt(inv.total / inv.exchange_rate, inv.currency)}</div>` : ''}
              <div class="total-idr">${fmt(inv.total, 'IDR')}</div>
            </td>
            <td>
              <span class="badge ${isApproved ? 'badge-paid' : isDraft ? 'badge-draft' : 'badge-unpaid'}">
                ${isDraft ? 'Draft' : isApproved ? 'Disetujui' : 'Menunggu Approval'}
              </span>
            </td>
            <td>
              <button class="btn-secondary btn-icon" onclick="previewInvoiceRow(${inv.id})">${icon('eye', 'icon-sm')} Preview</button>
              ${!isApproved ? `<button class="btn-secondary btn-icon" onclick="editInvoice(${inv.id})">${icon('edit', 'icon-sm')} ${isDraft ? 'Lanjutkan' : 'Edit'}</button>` : ''}
              ${!isApproved ? `<button class="btn-danger btn-icon" onclick="deleteInvoice(${inv.id})">${icon('trash', 'icon-sm')} Hapus</button>` : ''}
            </td>
          </tr>
        `; }).join('')}
      </tbody>
    </table>
    </div>`}
    </div>
    ${previewPanelHtml('list', { showPrint: true })}
    </div>
  `;
}

function wireInvoicesView() {
  document.getElementById('btnNew').onclick = () => switchView('invoice_new');
  document.getElementById('btnExport').onclick = () => window.open('/api/export', '_blank');
  document.getElementById('btnImport').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = handleImportFile;
  document.getElementById('q').oninput = debounce(e => { state.filters.q = e.target.value; refreshInvoices(); }, 350);
  document.getElementById('filterCustomer').onchange = e => { state.filters.customer = e.target.value; refreshInvoices(); };
  document.getElementById('filterStatus').onchange = e => { state.filters.stage = e.target.value; refreshInvoices(); };
  wireBulkActions();
  wirePreviewPanelClose('list');
}

/* ---------- Bulk actions (invoice list) ---------- */
function wireBulkActions() {
  const checkAll = document.getElementById('checkAll');
  const rowChecks = () => Array.from(document.querySelectorAll('.row-check'));

  updateBulkBar();

  if (checkAll) {
    checkAll.onchange = () => {
      state.invoices.forEach(inv => {
        if (checkAll.checked) state.selectedIds.add(inv.id);
        else state.selectedIds.delete(inv.id);
      });
      rowChecks().forEach(cb => {
        cb.checked = checkAll.checked;
        cb.closest('tr').classList.toggle('row-selected', checkAll.checked);
      });
      updateBulkBar();
    };
  }

  rowChecks().forEach(cb => {
    cb.onchange = () => {
      const id = Number(cb.dataset.id);
      if (cb.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      cb.closest('tr').classList.toggle('row-selected', cb.checked);
      if (checkAll) checkAll.checked = state.invoices.length > 0 && state.invoices.every(inv => state.selectedIds.has(inv.id));
      updateBulkBar();
    };
  });

  const bulkClear = document.getElementById('bulkClear');
  if (bulkClear) bulkClear.onclick = () => {
    state.selectedIds.clear();
    renderMain();
  };

  const bulkPrint = document.getElementById('bulkPrint');
  if (bulkPrint) bulkPrint.onclick = () => {
    // Draft belum resmi, tidak ikut dicetak lewat aksi massal ini.
    const draftCount = Array.from(state.selectedIds).filter(id => {
      const inv = state.invoices.find(i => i.id === id);
      return inv && inv.status === 'Draft';
    }).length;
    const ids = Array.from(state.selectedIds).filter(id => {
      const inv = state.invoices.find(i => i.id === id);
      return inv && inv.status !== 'Draft';
    });
    if (draftCount > 0) alert(`${draftCount} invoice berstatus Draft dilewati — belum bisa dicetak.`);
    if (ids.length === 0) return;
    window.open(`/api/invoices/print-batch?ids=${ids.join(',')}`, '_blank');
  };

  const bulkDelete = document.getElementById('bulkDelete');
  if (bulkDelete) bulkDelete.onclick = async () => {
    // Invoice yang sudah disetujui terkunci — tidak ikut dihapus lewat aksi massal ini.
    const lockedCount = Array.from(state.selectedIds).filter(id => {
      const inv = state.invoices.find(i => i.id === id);
      return inv && inv.approval_status === 'approved';
    }).length;
    const ids = Array.from(state.selectedIds).filter(id => {
      const inv = state.invoices.find(i => i.id === id);
      return inv && inv.approval_status !== 'approved';
    });
    if (lockedCount > 0) alert(`${lockedCount} invoice yang sudah disetujui dilewati — tidak bisa dihapus.`);
    if (ids.length === 0) return;
    if (!confirm(`Hapus ${ids.length} invoice terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    const original = bulkDelete.innerHTML;
    setBulkButtonsDisabled(true);
    bulkDelete.innerHTML = spinner() + ' Menghapus...';
    try {
      await Promise.all(ids.map(id => api(`/api/invoices/${id}`, { method: 'DELETE' })));
      state.selectedIds.clear();
      await refreshInvoices();
    } catch (e) {
      alert(e.message);
      setBulkButtonsDisabled(false);
      bulkDelete.innerHTML = original;
    }
  };
}

function setBulkButtonsDisabled(disabled) {
  ['bulkDelete', 'bulkClear'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const countEl = document.getElementById('bulkCount');
  if (!bar || !countEl) return;
  const n = state.selectedIds.size;
  countEl.textContent = `${n} dipilih`;
  bar.classList.toggle('is-visible', n > 0);
}

async function refreshInvoices() {
  state.invoices = await api('/api/invoices' + buildQuery());
  state.selectedIds.clear();
  if (state.view === 'invoices') renderMain();
  updateApprovalBadge();
}

/* ---------- Panel Preview (di sisi kanan, dipakai di Daftar Invoice & Tambah Invoice Baru) ---------- */
function previewPlaceholderHtml() {
  return `<div class="preview-panel-placeholder">${icon('eye', 'icon-lg')}<p>Klik tombol Preview untuk melihat pratinjau invoice di sini.</p></div>`;
}
function previewPanelHtml(suffix, opts) {
  opts = opts || {};
  return `
    <div class="preview-panel" id="previewPanel_${suffix}">
      <div class="preview-panel-header">
        <h3>${icon('eye', 'icon-sm')} Preview Invoice</h3>
        <div class="preview-panel-header-actions">
          ${opts.showPrint ? `<button class="btn-secondary btn-icon" id="previewPrint_${suffix}" type="button" style="display:none">${icon('print', 'icon-sm')} Print</button>` : ''}
          <button class="preview-close" id="previewClose_${suffix}" type="button" aria-label="Tutup preview">${icon('x', 'icon-sm')}</button>
        </div>
      </div>
      <div class="preview-panel-body" id="previewBody_${suffix}">${previewPlaceholderHtml()}</div>
    </div>
  `;
}
function wirePreviewPanelClose(suffix) {
  const btn = document.getElementById(`previewClose_${suffix}`);
  if (btn) btn.onclick = () => closePreviewPanel(suffix);
}
function openPreviewPanel(suffix) {
  const panel = document.getElementById(`previewPanel_${suffix}`);
  if (panel) panel.classList.add('is-open');
}
function closePreviewPanel(suffix) {
  const panel = document.getElementById(`previewPanel_${suffix}`);
  if (!panel) return;
  panel.classList.remove('is-open');
  const body = document.getElementById(`previewBody_${suffix}`);
  if (body) body.innerHTML = previewPlaceholderHtml();
  const printBtn = document.getElementById(`previewPrint_${suffix}`);
  if (printBtn) printBtn.style.display = 'none';
}
// Preview invoice yang sudah tersimpan (dipakai dari tabel Daftar Invoice & Approval) — langsung load via iframe.
window.previewInvoiceRow = (id, suffix) => {
  suffix = suffix || 'list';
  openPreviewPanel(suffix);
  const body = document.getElementById(`previewBody_${suffix}`);
  if (!body) return;
  body.innerHTML = `<div class="preview-loading">${spinner('spinner-lg')}</div><iframe title="Preview Invoice" src="/api/invoices/${id}/print" onload="this.previousElementSibling && this.previousElementSibling.remove()"></iframe>`;
  const printBtn = document.getElementById(`previewPrint_${suffix}`);
  if (printBtn) {
    printBtn.style.display = '';
    printBtn.onclick = () => printInvoice(id);
  }
};

async function updateApprovalBadge() {
  if (!state.me || state.me.role !== 'manager') return;
  try {
    const pending = await api('/api/invoices?status=Diajukan&approval_status=pending');
    const el = document.getElementById('approvalBadge');
    if (el) {
      if (pending.length > 0) { el.textContent = pending.length; el.style.display = ''; }
      else { el.style.display = 'none'; }
    }
  } catch (e) { /* abaikan, badge cuma penanda visual */ }
}

/* ---------- Approval tab (khusus manager) ---------- */
async function refreshApprovalList() {
  const p = state.approvalTab === 'approved'
    ? '?status=Diajukan&approval_status=approved'
    : '?status=Diajukan&approval_status=pending';
  state.approvalList = await api('/api/invoices' + p);
}

function approvalViewHtml() {
  const t = VIEW_TITLES.approval;
  return `
    <div class="content-split">
    <div class="content-main">
    <header class="page-header">
      <div>
        <h1>${t.icon} ${t.title}</h1>
        <div class="sub">Invoice buatan staff perlu disetujui di sini dulu sebelum resmi terbit &amp; tertanda tangan</div>
      </div>
    </header>

    <div class="settings-tabs" role="tablist">
      <button type="button" class="settings-tab-btn ${state.approvalTab === 'pending' ? 'active' : ''}" data-atab="pending">${icon('invoice', 'icon-sm')} Menunggu Approval</button>
      <button type="button" class="settings-tab-btn ${state.approvalTab === 'approved' ? 'active' : ''}" data-atab="approved">${icon('check', 'icon-sm')} Sudah Disetujui</button>
    </div>

    ${state.approvalList.length === 0 ? `<div class="empty-state">${state.approvalTab === 'pending' ? 'Tidak ada invoice yang menunggu approval.' : 'Belum ada invoice yang disetujui.'}</div>` : `
    <div class="table-wrap">
    <table class="list">
      <thead><tr>
        <th>No. Invoice</th><th>Tanggal</th><th>Customer</th><th>Total</th><th>Dibuat oleh</th><th></th>
      </tr></thead>
      <tbody>
        ${state.approvalList.map((inv, i) => {
          const hasValuta = inv.currency && inv.currency !== 'IDR' && inv.exchange_rate;
          return `
          <tr style="animation-delay:${Math.min(i * 0.03, 0.5)}s">
            <td>${inv.invoice_no || '-'}</td>
            <td>${inv.invoice_date || '-'}</td>
            <td>${inv.customer_name || '-'}</td>
            <td class="total-badge">
              ${hasValuta ? `<div class="total-valuta">${fmt(inv.total / inv.exchange_rate, inv.currency)}</div>` : ''}
              <div class="total-idr">${fmt(inv.total, 'IDR')}</div>
            </td>
            <td>${inv.created_by || '-'}</td>
            <td>
              <button class="btn-secondary btn-icon" onclick="previewInvoiceRow(${inv.id}, 'approval')">${icon('eye', 'icon-sm')} Preview</button>
              ${state.approvalTab === 'pending'
                ? `<button class="btn-primary btn-icon" onclick="approveInvoice(${inv.id})">${icon('check', 'icon-sm')} Approve</button>`
                : `<button class="btn-secondary btn-icon" onclick="unapproveInvoice(${inv.id})">${icon('x', 'icon-sm')} Batalkan Approval</button>`}
            </td>
          </tr>
        `; }).join('')}
      </tbody>
    </table>
    </div>`}
    </div>
    ${previewPanelHtml('approval', { showPrint: true })}
    </div>
  `;
}

function wireApprovalView() {
  document.querySelectorAll('[data-atab]').forEach(btn => {
    btn.onclick = async () => {
      state.approvalTab = btn.dataset.atab;
      await refreshApprovalList();
      renderMain();
    };
  });
  wirePreviewPanelClose('approval');
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
  try {
    await api(`/api/invoices/${id}/approve`, { method: 'POST' });
    if (state.view === 'approval') { await refreshApprovalList(); renderMain(); }
    else await refreshInvoices();
    updateApprovalBadge();
  } catch (e) {
    alert(e.message);
  }
};

window.unapproveInvoice = async (id) => {
  if (!confirm('Batalkan approval invoice ini? Statusnya akan kembali ke "Menunggu Approval" dan bisa diedit lagi.')) return;
  try {
    await api(`/api/invoices/${id}/unapprove`, { method: 'POST' });
    if (state.view === 'approval') { await refreshApprovalList(); renderMain(); }
    else await refreshInvoices();
    updateApprovalBadge();
  } catch (e) {
    alert(e.message);
  }
};

window.printInvoice = (id) => window.open(`/api/invoices/${id}/print`, '_blank');

window.deleteInvoice = async (id) => {
  if (!confirm('Hapus invoice ini?')) return;
  try {
    await api(`/api/invoices/${id}`, { method: 'DELETE' });
    refreshInvoices();
  } catch (e) {
    alert(e.message);
  }
};

window.editInvoice = async (id) => {
  const inv = await api(`/api/invoices/${id}`);
  if (inv.approval_status === 'approved') {
    alert('Invoice ini sudah disetujui Manager dan terkunci — tidak bisa diedit. Batalkan approval-nya dulu kalau perlu revisi.');
    return;
  }
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
let settingsActiveTab = 'company'; // 'company' | 'customers' | 'signature'
let pendingLogoDataUrl = null;
let pendingSignatureDataUrl = null;

function settingsViewHtml() {
  const t = VIEW_TITLES.settings;
  const isManager = state.me.role === 'manager';
  const co = state.settings.company || {
    name: 'PT. FUJI SEAT INDONESIA', subtitle: '', address_line1: '', address_line2: '', phone: '',
    bank_name: '', bank_branch: '', swift_code: '', account_number: '', signer_name: '', signer_title: ''
  };
  const mySig = state.mySignature || { title: '', signature: null };
  return `
    <header class="page-header">
      <div>
        <h1>${t.icon} ${t.title}</h1>
        <div class="sub">Data perusahaan sendiri untuk kop &amp; tanda tangan, dan data perusahaan customer</div>
      </div>
    </header>

    <div class="settings-tabs" role="tablist">
      <button type="button" class="settings-tab-btn ${settingsActiveTab === 'company' ? 'active' : ''}" data-tab="company">${icon('settings', 'icon-sm')} Data Perusahaan Saya</button>
      <button type="button" class="settings-tab-btn ${settingsActiveTab === 'customers' ? 'active' : ''}" data-tab="customers">${icon('plus', 'icon-sm')} Data Customer</button>
      ${isManager ? `<button type="button" class="settings-tab-btn ${settingsActiveTab === 'signature' ? 'active' : ''}" data-tab="signature">${icon('check', 'icon-sm')} Tanda Tangan Saya</button>` : ''}
    </div>

    <div id="tabPanelCompany" class="settings-tab-panel ${settingsActiveTab === 'company' ? 'active' : ''}">
      <div class="panel">
        <div class="sub" style="margin:-4px 0 16px;color:var(--muted);font-size:12.5px">Data ini dipakai untuk kop &amp; tanda tangan di hasil cetak invoice</div>

        <div class="logo-uploader">
          <div class="logo-preview" id="logoPreview">${co.logo ? `<img src="${co.logo}" alt="Logo">` : `<span>Belum ada logo</span>`}</div>
          <div class="logo-uploader-actions">
            <label>Logo Perusahaan</label>
            <div class="sub" style="color:var(--muted);font-size:12px;margin-bottom:8px">Dipakai untuk favicon/icon website dan kop invoice. Format PNG/JPG, disarankan persegi, maksimal ±1MB.</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn-secondary btn-icon" id="btnPickLogo" type="button">${icon('plus', 'icon-sm')} ${co.logo ? 'Ganti Logo' : 'Pilih Logo'}</button>
              ${co.logo ? `<button class="btn-danger btn-icon" id="btnRemoveLogo" type="button">${icon('trash', 'icon-sm')} Hapus Logo</button>` : ''}
            </div>
            <input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none">
            <div id="logoError" class="error-msg"></div>
          </div>
        </div>

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
          <div class="form-group"><label>Nama Penandatangan (cadangan)</label><input id="s_signer" value="${co.signer_name}"></div>
          <div class="form-group"><label>Jabatan (cadangan)</label><input id="s_title" value="${co.signer_title}"></div>
        </div>
        <div class="sub" style="margin:-8px 0 16px;color:var(--muted);font-size:12px">Nama &amp; jabatan di atas cuma dipakai sebagai cadangan kalau manager yang approve belum mengisi tanda tangan pribadinya di tab "Tanda Tangan Saya".</div>
        <div id="settingsSaved" class="saved-msg"></div>
        <div class="modal-actions" style="justify-content:flex-start">
          <button class="btn-primary" id="btnSaveS">${icon('check')} Simpan Perubahan</button>
        </div>
      </div>
    </div>

    <div id="tabPanelCustomers" class="settings-tab-panel ${settingsActiveTab === 'customers' ? 'active' : ''}">
      <div class="panel">
        <h2>Data Customer</h2>
        <div class="sub" style="margin:-8px 0 16px;color:var(--muted);font-size:12.5px">Dipakai untuk mengisi ATTN, alamat, dan currency default secara otomatis saat membuat invoice baru. Ketik <code>//</code> di kolom Alamat untuk ganti baris saat dicetak, mis. <code>Jl. Contoh No.1//Jakarta Selatan</code>.</div>
        <table class="items-table" id="customersTable">
          <thead><tr>
            <th style="width:22%">Nama Customer</th>
            <th style="width:10%">Kode</th>
            <th style="width:9%">Currency</th>
            <th style="width:27%">Alamat</th>
            <th style="width:20%">Default ATTN</th>
            <th></th>
          </tr></thead>
          <tbody id="customersBody"></tbody>
        </table>
        <button class="btn-secondary btn-icon" id="btnAddCustomer" type="button">${icon('plus', 'icon-sm')} Tambah Customer</button>
        <div id="customersError" class="error-msg"></div>
        <div id="customersSaved" class="saved-msg"></div>
        <div class="modal-actions" style="justify-content:flex-start">
          <button class="btn-primary" id="btnSaveCustomers">${icon('check')} Simpan Data Customer</button>
        </div>
      </div>
    </div>

    ${isManager ? `
    <div id="tabPanelSignature" class="settings-tab-panel ${settingsActiveTab === 'signature' ? 'active' : ''}">
      <div class="panel">
        <h2>Tanda Tangan Saya</h2>
        <div class="sub" style="margin:-8px 0 16px;color:var(--muted);font-size:12.5px">Gambar tanda tangan ini otomatis dipasang di invoice begitu Anda meng-approve-nya lewat menu Approval.</div>

        <div class="logo-uploader">
          <div class="logo-preview" id="signaturePreview">${mySig.signature ? `<img src="${mySig.signature}" alt="Tanda tangan">` : `<span>Belum ada tanda tangan</span>`}</div>
          <div class="logo-uploader-actions">
            <label>Gambar Tanda Tangan</label>
            <div class="sub" style="color:var(--muted);font-size:12px;margin-bottom:8px">Foto/scan tanda tangan dengan latar transparan atau putih. Format PNG/JPG, maksimal ±1MB.</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn-secondary btn-icon" id="btnPickSignature" type="button">${icon('plus', 'icon-sm')} ${mySig.signature ? 'Ganti Tanda Tangan' : 'Upload Tanda Tangan'}</button>
              ${mySig.signature ? `<button class="btn-danger btn-icon" id="btnRemoveSignature" type="button">${icon('trash', 'icon-sm')} Hapus</button>` : ''}
            </div>
            <input type="file" id="signatureFileInput" accept="image/png,image/jpeg,image/webp" style="display:none">
            <div id="signatureError" class="error-msg"></div>
          </div>
        </div>

        <div class="form-row"><div class="form-group"><label>Jabatan</label><input id="s_my_title" value="${mySig.title || ''}" placeholder="mis. Finance Manager"></div></div>
        <div id="signatureSaved" class="saved-msg"></div>
        <div class="modal-actions" style="justify-content:flex-start">
          <button class="btn-primary" id="btnSaveSignature">${icon('check')} Simpan Tanda Tangan</button>
        </div>
      </div>
    </div>` : ''}
  `;
}

let editableCustomers = [];


function renderCustomersBody() {
  const body = document.getElementById('customersBody');
  if (!body) return;
  body.innerHTML = editableCustomers.length === 0
    ? `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px 4px">Belum ada customer. Klik "Tambah Customer" untuk mulai.</td></tr>`
    : editableCustomers.map((c, i) => `
    <tr>
      <td><input value="${c.name || ''}" data-i="${i}" data-field="name" placeholder="Nama customer"></td>
      <td><input value="${c.code || ''}" data-i="${i}" data-field="code" placeholder="Kode"></td>
      <td>
        <select data-i="${i}" data-field="currency">
          <option value="IDR" ${c.currency === 'IDR' ? 'selected' : ''}>IDR</option>
          <option value="USD" ${c.currency === 'USD' ? 'selected' : ''}>USD</option>
          <option value="JPY" ${c.currency === 'JPY' ? 'selected' : ''}>JPY</option>
        </select>
      </td>
      <td><input value="${c.address || ''}" data-i="${i}" data-field="address" placeholder="Jl. Contoh No.1//Jakarta Selatan"></td>
      <td><input value="${c.attn || ''}" data-i="${i}" data-field="attn" placeholder="mis. Bpk. Andi"></td>
      <td><button class="btn-danger btn-icon" data-remove-c="${i}" type="button">${icon('trash', 'icon-sm')}</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('input, select').forEach(inp => {
    inp.oninput = inp.onchange = e => {
      const i = +e.target.dataset.i;
      editableCustomers[i][e.target.dataset.field] = e.target.value;
    };
  });
  body.querySelectorAll('[data-remove-c]').forEach(btn => {
    btn.onclick = () => { editableCustomers.splice(+btn.dataset.removeC, 1); renderCustomersBody(); };
  });
}

function wireSettingsView() {
  const isManager = state.me.role === 'manager';
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.onclick = () => {
      settingsActiveTab = btn.dataset.tab;
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === settingsActiveTab));
      document.getElementById('tabPanelCompany').classList.toggle('active', settingsActiveTab === 'company');
      document.getElementById('tabPanelCustomers').classList.toggle('active', settingsActiveTab === 'customers');
      const sigPanel = document.getElementById('tabPanelSignature');
      if (sigPanel) sigPanel.classList.toggle('active', settingsActiveTab === 'signature');
    };
  });

  pendingLogoDataUrl = (state.settings.company && state.settings.company.logo) || null;
  const logoInput = document.getElementById('logoFileInput');
  const logoErr = document.getElementById('logoError');
  document.getElementById('btnPickLogo').onclick = () => logoInput.click();
  logoInput.onchange = () => {
    logoErr.textContent = '';
    const file = logoInput.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      logoErr.textContent = 'Ukuran file terlalu besar, maksimal ±1.5MB.';
      logoInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingLogoDataUrl = reader.result;
      document.getElementById('logoPreview').innerHTML = `<img src="${pendingLogoDataUrl}" alt="Logo">`;
    };
    reader.onerror = () => { logoErr.textContent = 'Gagal membaca file gambar.'; };
    reader.readAsDataURL(file);
  };
  const removeBtn = document.getElementById('btnRemoveLogo');
  if (removeBtn) {
    removeBtn.onclick = () => {
      pendingLogoDataUrl = null;
      logoInput.value = '';
      document.getElementById('logoPreview').innerHTML = `<span>Belum ada logo</span>`;
    };
  }

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
      signer_title: document.getElementById('s_title').value,
      logo: pendingLogoDataUrl
    };
    const saved = document.getElementById('settingsSaved');
    try {
      await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company }) });
      state.settings.company = company;
      const brandLogo = document.querySelector('.brand-logo');
      if (brandLogo) brandLogo.innerHTML = company.logo ? `<img src="${company.logo}" alt="Logo">` : 'FS';
      const favicon = document.getElementById('faviconLink');
      if (favicon && company.logo) favicon.href = company.logo;
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

  editableCustomers = (state.settings.customers || []).map(c => ({ ...c }));
  renderCustomersBody();

  document.getElementById('btnAddCustomer').onclick = () => {
    editableCustomers.push({ name: '', code: '', currency: 'IDR', address: '', attn: '' });
    renderCustomersBody();
  };

  const saveCBtn = document.getElementById('btnSaveCustomers');
  const saveCBtnOriginal = saveCBtn.innerHTML;
  saveCBtn.onclick = async () => {
    const err = document.getElementById('customersError');
    const savedC = document.getElementById('customersSaved');
    err.textContent = '';
    const cleaned = editableCustomers
      .filter(c => (c.name || '').trim() !== '')
      .map(c => ({
        name: c.name.trim(),
        code: (c.code || '').trim(),
        currency: c.currency || 'IDR',
        address: (c.address || '').trim(),
        attn: (c.attn || '').trim()
      }));
    saveCBtn.disabled = true; saveCBtn.innerHTML = spinner() + ' Menyimpan...';
    try {
      await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customers: cleaned }) });
      state.settings.customers = cleaned;
      editableCustomers = cleaned.map(c => ({ ...c }));
      renderCustomersBody();
      savedC.classList.remove('is-error');
      savedC.innerHTML = `${icon('check', 'icon-sm')} Data customer tersimpan`;
      setTimeout(() => { savedC.textContent = ''; }, 2500);
    } catch (e) {
      err.textContent = e.message;
    } finally {
      saveCBtn.disabled = false; saveCBtn.innerHTML = saveCBtnOriginal;
    }
  };

  if (!isManager) return;

  // ---- Tab "Tanda Tangan Saya" (khusus manager) ----
  const mySig = state.mySignature || { title: '', signature: null };
  pendingSignatureDataUrl = mySig.signature || null;
  const sigInput = document.getElementById('signatureFileInput');
  const sigErr = document.getElementById('signatureError');
  const sigPickBtn = document.getElementById('btnPickSignature');
  if (sigPickBtn) sigPickBtn.onclick = () => sigInput.click();
  if (sigInput) sigInput.onchange = () => {
    sigErr.textContent = '';
    const file = sigInput.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      sigErr.textContent = 'Ukuran file terlalu besar, maksimal ±1.5MB.';
      sigInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingSignatureDataUrl = reader.result;
      document.getElementById('signaturePreview').innerHTML = `<img src="${pendingSignatureDataUrl}" alt="Tanda tangan">`;
    };
    reader.onerror = () => { sigErr.textContent = 'Gagal membaca file gambar.'; };
    reader.readAsDataURL(file);
  };
  const removeSigBtn = document.getElementById('btnRemoveSignature');
  if (removeSigBtn) {
    removeSigBtn.onclick = () => {
      pendingSignatureDataUrl = null;
      sigInput.value = '';
      document.getElementById('signaturePreview').innerHTML = `<span>Belum ada tanda tangan</span>`;
    };
  }

  const saveSigBtn = document.getElementById('btnSaveSignature');
  if (saveSigBtn) {
    const saveSigBtnOriginal = saveSigBtn.innerHTML;
    saveSigBtn.onclick = async () => {
      saveSigBtn.disabled = true; saveSigBtn.innerHTML = spinner() + ' Menyimpan...';
      const savedSig = document.getElementById('signatureSaved');
      const payload = {
        title: document.getElementById('s_my_title').value,
        signature: pendingSignatureDataUrl
      };
      try {
        await api('/api/me/signature', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        state.mySignature = payload;
        savedSig.classList.remove('is-error');
        savedSig.innerHTML = `${icon('check', 'icon-sm')} Tanda tangan tersimpan`;
        setTimeout(() => { savedSig.textContent = ''; }, 2500);
      } catch (e) {
        savedSig.classList.add('is-error');
        savedSig.textContent = e.message;
      } finally {
        saveSigBtn.disabled = false; saveSigBtn.innerHTML = saveSigBtnOriginal;
      }
    };
  }
}

/* ---------- Invoice form (tetap modal, form-nya panjang & kontekstual per baris) ---------- */
function invoiceFormFieldsHtml(existing) {
  const isEdit = !!existing;
  const customers = state.settings.customers;
  const invoiceNo = existing ? existing.invoice_no : '';
  return `
      <div class="form-row">
        <div class="form-group">
          <label>Customer</label>
          <select id="f_customer">
            ${customers.map(c => `<option value="${c.name}" data-currency="${c.currency}" data-address="${c.address}" data-attn="${c.attn || ''}" ${existing && existing.customer_name === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
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
      </div>
      ${isEdit ? `<div class="sub" style="margin:-4px 0 14px;font-size:12px">Status saat ini: <strong>${existing.status === 'Draft' ? 'Draft' : (existing.approval_status === 'approved' ? 'Disetujui' : 'Menunggu Approval')}</strong> — klik "Simpan" untuk mengajukan/menyimpan perubahan, atau "Simpan sebagai Draft" untuk tetap jadi draft.</div>` : ''}
      <div class="form-row">
        <div class="form-group">
          <label>Exchange Rate <span id="exRateHint">(opsional, tampil di print jika bukan IDR)</span></label>
          <input type="number" step="any" id="f_exrate" value="${existing && existing.exchange_rate ? existing.exchange_rate : ''}" placeholder="mis. 109.77">
        </div>
      </div>
      <div class="sub" id="valutaHint" style="display:none;margin:-8px 0 14px;color:var(--muted);font-size:12px">Kolom "Jumlah" pada Item selalu diisi dalam IDR. Amount dalam mata uang asing akan dihitung otomatis saat dicetak: <strong>IDR ÷ Exchange Rate</strong>.</div>
      <div class="form-group" style="margin-bottom:12px">
        <label>Remark</label>
        <textarea id="f_remark" rows="2">${existing ? (existing.remark || '') : ''}</textarea>
      </div>

      <label style="font-size:12px;color:var(--muted);font-weight:600">Item</label>
      <table class="items-table" id="itemsTable">
        <thead><tr><th style="width:50%">Nama Item</th><th style="width:15%">Qty</th><th style="width:25%">Jumlah (IDR)</th><th></th></tr></thead>
        <tbody id="itemsBody"></tbody>
      </table>
      <button class="btn-secondary btn-icon" id="btnAddItem" type="button">${icon('plus', 'icon-sm')} Tambah Item</button>
      <div id="totalsPreview" class="sub" style="margin-top:10px;font-size:12.5px;color:var(--navy);font-weight:600"></div>

      <div id="formError" class="error-msg"></div>
      <div class="modal-actions">
        ${!isEdit ? `<button class="btn-secondary" id="btnPreview" type="button">${icon('eye', 'icon-sm')} Preview</button>` : ''}
        <button class="btn-secondary" id="btnCancel">${icon('x', 'icon-sm')} Batal</button>
        <button class="btn-secondary" id="btnSaveDraft" type="button">${icon('check', 'icon-sm')} Simpan sebagai Draft</button>
        <button class="btn-primary" id="btnSave">${icon('check', 'icon-sm')} Simpan</button>
      </div>
  `;
}

// Menghubungkan semua interaksi form invoice (Item, currency, exchange rate, simpan, batal).
// `root` bisa berupa modal overlay (Edit) ataupun elemen halaman penuh (Tambah Invoice Baru).
function wireInvoiceForm(root, existing, { onCancel, onSaved }) {
  const isEdit = !!existing;
  let items = existing ? existing.items.map(it => ({ ...it })) : [{ item_name: '', qty: 1, amount: 0 }];

  const customerSel = root.querySelector('#f_customer');
  const currencySel = root.querySelector('#f_currency');
  const attnInput = root.querySelector('#f_attn');
  const exRateInput = root.querySelector('#f_exrate');

  function renderItems() {
    const body = root.querySelector('#itemsBody');
    body.innerHTML = items.map((it, i) => `
      <tr>
        <td><input value="${it.item_name}" data-i="${i}" data-field="item_name"></td>
        <td><input type="number" step="any" value="${it.qty}" data-i="${i}" data-field="qty"></td>
        <td><input type="text" inputmode="numeric" value="${it.amount ? formatRibuan(it.amount) : ''}" placeholder="0" data-i="${i}" data-field="amount"></td>
        <td><button class="btn-danger btn-icon" data-remove="${i}" type="button">${icon('x', 'icon-sm')}</button></td>
      </tr>
    `).join('');
    body.querySelectorAll('input').forEach(inp => {
      inp.oninput = e => {
        const i = +e.target.dataset.i;
        const field = e.target.dataset.field;
        if (field === 'amount') {
          const digits = e.target.value.replace(/[^\d]/g, '');
          const num = digits ? parseInt(digits, 10) : 0;
          items[i].amount = num;
          e.target.value = digits ? formatRibuan(num) : '';
          const pos = e.target.value.length;
          e.target.setSelectionRange(pos, pos);
        } else {
          items[i][field] = field === 'item_name' ? e.target.value : Number(e.target.value);
        }
        updateTotalsPreview();
      };
    });
    body.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => { items.splice(+btn.dataset.remove, 1); renderItems(); };
    });
    updateTotalsPreview();
  }

  // Untuk mata uang asing (reimbursement ke perusahaan luar negeri): Jumlah item selalu
  // diisi dalam IDR, Exchange Rate wajib diisi, dan amount valuta dihitung otomatis.
  function updateCurrencyUI() {
    const isIDR = currencySel.value === 'IDR';
    root.querySelector('#exRateHint').textContent = isIDR ? '(opsional)' : '(wajib diisi untuk mata uang selain IDR)';
    root.querySelector('#valutaHint').style.display = isIDR ? 'none' : 'block';
    updateTotalsPreview();
  }

  function updateTotalsPreview() {
    const preview = root.querySelector('#totalsPreview');
    if (!preview) return;
    const totalIdr = items.reduce((s, it) => s + ((Number(it.amount) || 0) * (Number(it.qty) || 1)), 0);
    const isIDR = currencySel.value === 'IDR';
    const rate = Number(exRateInput.value) || 0;
    if (isIDR) {
      preview.textContent = `Total: IDR ${totalIdr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (rate > 0) {
      const valuta = totalIdr / rate;
      const digits = currencySel.value === 'JPY' ? 0 : 2;
      preview.textContent = `Total: IDR ${totalIdr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ≈ ${currencySel.value} ${valuta.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
    } else {
      preview.textContent = `Total: IDR ${totalIdr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — isi Exchange Rate untuk melihat nominal ${currencySel.value}`;
    }
  }

  renderItems();

  root.querySelector('#btnAddItem').onclick = () => { items.push({ item_name: '', qty: 1, amount: 0 }); renderItems(); };

  customerSel.onchange = () => {
    const opt = customerSel.selectedOptions[0];
    if (opt.dataset.currency) currencySel.value = opt.dataset.currency;
    if (opt.dataset.attn) attnInput.value = opt.dataset.attn;
    updateCurrencyUI();
  };
  currencySel.onchange = updateCurrencyUI;
  exRateInput.oninput = updateTotalsPreview;
  updateCurrencyUI();

  const dateInput = root.querySelector('#f_date');
  const dueInput = root.querySelector('#f_due');

  // Due Date default = akhir bulan dari bulan BERIKUTNYA tanggal invoice.
  // Contoh: tanggal invoice 12 Agustus 2026 -> due date 30 September 2026.
  function computeDueDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const endOfNextMonth = new Date(y, m + 1, 0); // tanggal 0 dari (bulan+2) = tanggal terakhir bulan berikutnya
    const yyyy = endOfNextMonth.getFullYear();
    const mm = String(endOfNextMonth.getMonth() + 1).padStart(2, '0');
    const dd = String(endOfNextMonth.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  function autoFillDueDate() {
    dueInput.value = computeDueDate(dateInput.value);
  }
  dateInput.addEventListener('change', autoFillDueDate);
  if (!isEdit) autoFillDueDate(); // invoice baru: langsung isi otomatis dari tanggal default (hari ini)

  if (!isEdit) {
    const fillNextNumber = async () => {
      const r = await api(`/api/next-number?date=${dateInput.value}`);
      root.querySelector('#f_no').value = r.invoice_no;
    };
    dateInput.addEventListener('change', fillNextNumber);
    fillNextNumber();
    customerSel.dispatchEvent(new Event('change'));
  }

  root.querySelector('#btnCancel').onclick = () => onCancel();

  const previewBtn = root.querySelector('#btnPreview');
  if (previewBtn) {
    previewBtn.onclick = async () => {
      const opt = customerSel.selectedOptions[0];
      const payload = {
        invoice_no: root.querySelector('#f_no').value.trim() || '(Belum diisi)',
        invoice_date: dateInput.value,
        due_date: root.querySelector('#f_due').value || null,
        customer_name: customerSel.value,
        customer_address: opt ? (opt.dataset.address || '') : '',
        attn: root.querySelector('#f_attn').value,
        currency: currencySel.value,
        batch: root.querySelector('#f_batch').value,
        remark: root.querySelector('#f_remark').value,
        exchange_rate: root.querySelector('#f_exrate').value ? Number(root.querySelector('#f_exrate').value) : null,
        items: items.filter(it => it.item_name.trim() !== '')
      };
      const original = previewBtn.innerHTML;
      previewBtn.disabled = true;
      previewBtn.innerHTML = spinner() + ' Memuat...';
      try {
        const res = await fetch('/api/invoices/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const html = await res.text();
        openPreviewPanel('new');
        const body = document.getElementById('previewBody_new');
        if (body) {
          body.innerHTML = '<iframe title="Preview Invoice"></iframe>';
          body.querySelector('iframe').srcdoc = html;
        }
      } catch (e) {
        alert('Gagal memuat preview: ' + e.message);
      } finally {
        previewBtn.disabled = false;
        previewBtn.innerHTML = original;
      }
    };
  }

  function buildPayload(statusOverride) {
    const opt = customerSel.selectedOptions[0];
    return {
      invoice_no: root.querySelector('#f_no').value.trim(),
      invoice_date: dateInput.value,
      due_date: root.querySelector('#f_due').value || null,
      customer_name: customerSel.value,
      customer_address: opt ? (opt.dataset.address || '') : '',
      attn: root.querySelector('#f_attn').value,
      currency: currencySel.value,
      batch: root.querySelector('#f_batch').value,
      remark: root.querySelector('#f_remark').value,
      status: statusOverride || 'Diajukan',
      exchange_rate: root.querySelector('#f_exrate').value ? Number(root.querySelector('#f_exrate').value) : null,
      items: items.filter(it => it.item_name.trim() !== '')
    };
  }

  async function doSave(payload, btn) {
    const isDraft = payload.status === 'Draft';
    // Draft boleh disimpan belum lengkap: validasi ketat (no. invoice, tanggal, minimal
    // 1 item, exchange rate) hanya berlaku untuk invoice yang bukan Draft.
    if (!isDraft) {
      if (!payload.invoice_no || !payload.invoice_date || payload.items.length === 0) {
        root.querySelector('#formError').textContent = 'No. invoice, tanggal, dan minimal 1 item wajib diisi.';
        return;
      }
      if (payload.currency !== 'IDR' && !payload.exchange_rate) {
        root.querySelector('#formError').textContent = 'Exchange Rate wajib diisi untuk invoice dengan mata uang selain IDR, supaya amount valuta bisa dihitung otomatis.';
        return;
      }
    }
    root.querySelector('#formError').textContent = '';
    const original = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = spinner() + ' Menyimpan...';
    try {
      if (isEdit) {
        await api(`/api/invoices/${existing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await api('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (e) {
      root.querySelector('#formError').textContent = e.message;
      btn.disabled = false; btn.innerHTML = original;
    }
  }

  const saveBtn = root.querySelector('#btnSave');
  saveBtn.onclick = () => doSave(buildPayload(), saveBtn);

  const saveDraftBtn = root.querySelector('#btnSaveDraft');
  if (saveDraftBtn) {
    saveDraftBtn.onclick = () => doSave(buildPayload('Draft'), saveDraftBtn);
  }
}

// Modal Edit Invoice (dipakai dari tabel Daftar Invoice)
function openForm(existing) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Edit Invoice</h2>
      ${invoiceFormFieldsHtml(existing)}
    </div>
  `;
  document.body.appendChild(overlay);
  wireInvoiceForm(overlay, existing, {
    onCancel: () => overlay.remove(),
    onSaved: () => { overlay.remove(); refreshInvoices(); }
  });
}

// Halaman penuh Tambah Invoice Baru (sub-menu sidebar terpisah dari Daftar Invoice)
function invoiceNewPageHtml() {
  return `
    <div class="content-split">
    <div class="content-main">
    <header class="page-header">
      <div>
        <h1>${icon('plus', 'icon-lg')} Tambah Invoice Baru</h1>
        <div class="sub">Isi detail invoice di bawah ini</div>
      </div>
    </header>
    <div class="panel" id="invoiceNewPanel">
      ${invoiceFormFieldsHtml(null)}
    </div>
    </div>
    ${previewPanelHtml('new')}
    </div>
  `;
}

function wireInvoiceNewPage() {
  const root = document.getElementById('invoiceNewPanel');
  wireInvoiceForm(root, null, {
    onCancel: () => switchView('invoices'),
    onSaved: async () => { await refreshInvoices(); switchView('invoices'); }
  });
  wirePreviewPanelClose('new');
}

/* ---------- Efek klik tombol dijaga tetap ringan lewat CSS :active (lihat style.css) ---------- */

(async () => {
  try {
    const ok = await checkAuth();
    if (ok) await loadAll();
    else hideAppLoader();
  } catch (e) {
    hideAppLoader();
  }
})();
