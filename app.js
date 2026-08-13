'use strict';

/* =========================================================
   ARMÁRIOS — Controle de armários, alojamentos e cadeados
   Vanilla JS + localStorage. Sem dependências externas.
   ========================================================= */

const STORAGE_KEY = 'armctl_v1';

const STATUS = {
  livre:   { label: 'Livre',              color: 'livre',   tag: 'tag-livre' },
  ocupado: { label: 'Ocupado',            color: 'ocupado', tag: 'tag-ocupado' },
  sem_id:  { label: 'Sem identificação',  color: 'sem-id',  tag: 'tag-sem-id' }
};

/* ---------------- Data layer ---------------- */

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Garante que cada cadeado tenha um "mode" ('armario' ou 'local') e os
// campos correspondentes, migrando registros salvos antes dessa versão.
function normalizeCadeados(arr) {
  return (arr || []).map((c) => {
    const mode = c.mode || (c.armarioId ? 'armario' : 'local');
    return Object.assign({ local: '', alojamentoId: null, armarioId: null }, c, { mode });
  });
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { alojamentos: [], armarios: [], cadeados: [] };
    const parsed = JSON.parse(raw);
    parsed.alojamentos = parsed.alojamentos || [];
    parsed.armarios = parsed.armarios || [];
    parsed.cadeados = normalizeCadeados(parsed.cadeados);
    return parsed;
  } catch (e) {
    console.error('Falha ao ler dados salvos', e);
    return { alojamentos: [], armarios: [], cadeados: [] };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

const state = {
  data: loadData(),
  stack: [{ view: 'dashboard' }],
  ui: { lockerFilter: 'todos', lockerQuery: '' }
};

/* ---------------- Helpers ---------------- */

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizeName(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getAlojamento(id) {
  return state.data.alojamentos.find((a) => a.id === id);
}

function getArmario(id) {
  return state.data.armarios.find((a) => a.id === id);
}

function armariosDe(alojamentoId) {
  return state.data.armarios.filter((a) => a.alojamentoId === alojamentoId)
    .sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
}

function cadeadosDe(alojamentoId) {
  return state.data.cadeados.filter((c) => c.mode === 'armario' && c.alojamentoId === alojamentoId);
}

function cadeadoDoArmario(armarioId) {
  return state.data.cadeados.find((c) => c.armarioId === armarioId);
}

function computeStats(list) {
  const total = list.length;
  const ocupados = list.filter((a) => a.status === 'ocupado').length;
  const livres = list.filter((a) => a.status === 'livre').length;
  const semId = list.filter((a) => a.status === 'sem_id').length;
  return { total, ocupados, livres, semId };
}

// map normalized name -> array of armarios (only status ocupado)
function buildOccupantIndex() {
  const idx = {};
  state.data.armarios.forEach((a) => {
    if (a.status === 'ocupado' && a.usuario && a.usuario.trim()) {
      const key = normalizeName(a.usuario);
      if (!idx[key]) idx[key] = [];
      idx[key].push(a);
    }
  });
  return idx;
}

function duplicateLockersForName(name, excludeArmarioId) {
  const key = normalizeName(name);
  if (!key) return [];
  return state.data.armarios.filter(
    (a) => a.status === 'ocupado' && a.id !== excludeArmarioId && normalizeName(a.usuario) === key
  );
}

// Monta o texto padrão para compartilhar o cadastro de um armário ocupado
// (ex.: "SD CAETANO ALOJAMENTO A, ARMARIO 30 E CADEADO 07" + data).
function shareMessageFor(armarioId) {
  const arm = getArmario(armarioId);
  if (!arm) return '';
  const al = getAlojamento(arm.alojamentoId);
  const lock = cadeadoDoArmario(arm.id);
  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  let linha = `${arm.usuario || ''} ${al ? al.nome.toUpperCase() : ''}, ARMARIO ${arm.numero}`;
  if (lock) linha += ` E CADEADO ${lock.numero}`;
  return `${linha}\nData: ${dataStr}`;
}

function openWhatsApp(text) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/* ---------------- Toast ---------------- */

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------------- Navigation ---------------- */

function navigateTo(view, params) {
  state.stack.push({ view, params: params || {} });
  state.ui = { lockerFilter: 'todos', lockerQuery: '' };
  render();
  window.scrollTo(0, 0);
}

function switchTab(view) {
  state.stack = [{ view }];
  state.ui = { lockerFilter: 'todos', lockerQuery: '' };
  render();
  window.scrollTo(0, 0);
}

function goBack() {
  if (state.stack.length > 1) {
    state.stack.pop();
    render();
    window.scrollTo(0, 0);
  }
}

function current() {
  return state.stack[state.stack.length - 1];
}

/* ---------------- Sheets (bottom modals) ---------------- */

function openSheet({ title, sub, bodyHtml, footerHtml, onMount }) {
  closeSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.id = 'active-sheet';
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      <div class="sheet-title">${title}</div>
      ${sub ? `<div class="sheet-sub">${sub}</div>` : ''}
      <div class="sheet-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="sheet-actions">${footerHtml}</div>` : ''}
    </div>
  `;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSheet();
  });
  document.body.appendChild(backdrop);
  if (onMount) onMount(backdrop);
}

function closeSheet() {
  const el = document.getElementById('active-sheet');
  if (el) el.remove();
}

function openConfirm(title, message, confirmLabel, onConfirm) {
  openSheet({
    title,
    bodyHtml: `<p style="font-size:13.5px; color:var(--text-muted); line-height:1.5; margin:0 0 4px;">${message}</p>`,
    footerHtml: `
      <button class="btn" id="confirm-cancel">Cancelar</button>
      <button class="btn btn-danger" id="confirm-ok">${confirmLabel}</button>
    `,
    onMount: (root) => {
      root.querySelector('#confirm-cancel').addEventListener('click', closeSheet);
      root.querySelector('#confirm-ok').addEventListener('click', () => {
        closeSheet();
        onConfirm();
      });
    }
  });
}

/* ---------------- Header / Nav chrome ---------------- */

function updateChrome() {
  const cur = current();
  const backBtn = document.getElementById('btn-back');
  const headerTitle = document.getElementById('header-title');
  const headerEyebrow = document.getElementById('header-eyebrow');
  const fab = document.getElementById('fab');
  const headerAction = document.getElementById('btn-header-action');
  headerAction.classList.add('hidden');

  backBtn.classList.toggle('hidden', state.stack.length <= 1);
  fab.classList.add('hidden');

  const titles = {
    dashboard: 'Controle de Armários',
    'alojamento-detail': (cur.params && getAlojamento(cur.params.id)) ? getAlojamento(cur.params.id).nome : 'Alojamento',
    cadeados: 'Cadeados',
    pessoas: 'Pessoas com 2+ armários',
    ajustes: 'Ajustes'
  };
  const eyebrows = {
    'alojamento-detail': 'ALOJAMENTO'
  };

  headerTitle.textContent = titles[cur.view] || 'Controle de Armários';
  if (eyebrows[cur.view]) {
    headerEyebrow.textContent = eyebrows[cur.view];
    headerEyebrow.classList.remove('hidden');
  } else {
    headerEyebrow.classList.add('hidden');
  }

  if (cur.view === 'dashboard') fab.classList.remove('hidden');
  if (cur.view === 'alojamento-detail') fab.classList.remove('hidden');
  if (cur.view === 'cadeados') fab.classList.remove('hidden');

  // bottom nav active state
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isActive = (state.stack[0].view === btn.dataset.view);
    btn.classList.toggle('active', isActive);
  });
}

/* ---------------- Render root ---------------- */

function render() {
  updateChrome();
  const main = document.getElementById('main-view');
  const cur = current();
  switch (cur.view) {
    case 'dashboard': main.innerHTML = renderDashboard(); break;
    case 'alojamento-detail': main.innerHTML = renderAlojamentoDetail(cur.params.id); break;
    case 'cadeados': main.innerHTML = renderCadeados(); break;
    case 'pessoas': main.innerHTML = renderPessoas(); break;
    case 'ajustes': main.innerHTML = renderAjustes(); break;
    default: main.innerHTML = renderDashboard();
  }
  bindViewEvents(cur.view);
}

/* ---------------- Dashboard ---------------- */

function renderDashboard() {
  const all = state.data.armarios;
  const stats = computeStats(all);
  const alojamentos = state.data.alojamentos;

  const ledger = `
    <div class="ledger">
      <div class="ledger-total">
        <div>
          <div class="ledger-total-num">${stats.total}</div>
        </div>
        <div class="ledger-total-label">total de<br>armários</div>
      </div>
      ${stats.total > 0 ? `
      <div class="stack-bar">
        <span class="seg-livre" style="width:${pct(stats.livres, stats.total)}%"></span>
        <span class="seg-ocupado" style="width:${pct(stats.ocupados, stats.total)}%"></span>
        <span class="seg-sem-id" style="width:${pct(stats.semId, stats.total)}%"></span>
      </div>` : ''}
      <div class="ledger-legend">
        <div class="legend-item"><span class="dot dot-livre"></span> <span class="legend-num legend-text-livre">${stats.livres}</span> livres</div>
        <div class="legend-item"><span class="dot dot-ocupado"></span> <span class="legend-num legend-text-ocupado">${stats.ocupados}</span> ocupados</div>
        <div class="legend-item"><span class="dot dot-sem-id"></span> <span class="legend-num legend-text-sem-id">${stats.semId}</span> sem id.</div>
      </div>
    </div>
  `;

  let list;
  if (alojamentos.length === 0) {
    list = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="18" rx="1.5"/><rect x="13" y="3" width="8" height="18" rx="1.5"/><circle cx="8" cy="12" r=".6" fill="currentColor"/><circle cx="18" cy="12" r=".6" fill="currentColor"/></svg>
        <h3>Nenhum alojamento cadastrado</h3>
        <p>Crie um alojamento para começar a controlar os armários dele.</p>
        <button class="btn btn-primary" data-action="open-add-alojamento">+ Adicionar alojamento</button>
      </div>
    `;
  } else {
    list = `<div class="alojamento-list">` + alojamentos.map((al) => {
      const arms = armariosDe(al.id);
      const s = computeStats(arms);
      return `
        <button class="alojamento-card" data-action="open-alojamento" data-id="${al.id}">
          <div class="alojamento-card-top">
            <div>
              <div class="alojamento-name">${escapeHtml(al.nome)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="alojamento-total">${s.total} armário${s.total === 1 ? '' : 's'}</div>
              <span class="chevron">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </span>
            </div>
          </div>
          ${s.total > 0 ? `
          <div class="stack-bar">
            <span class="seg-livre" style="width:${pct(s.livres, s.total)}%"></span>
            <span class="seg-ocupado" style="width:${pct(s.ocupados, s.total)}%"></span>
            <span class="seg-sem-id" style="width:${pct(s.semId, s.total)}%"></span>
          </div>
          <div class="mini-counts">
            <span><b style="color:var(--livre)">${s.livres}</b> livres</span>
            <span><b style="color:var(--ocupado)">${s.ocupados}</b> ocupados</span>
            <span><b style="color:var(--sem-id)">${s.semId}</b> sem id.</span>
          </div>` : `<div class="mini-counts">Nenhum armário cadastrado ainda.</div>`}
        </button>
      `;
    }).join('') + `</div>`;
  }

  return `
    <div class="section-label">Resumo geral</div>
    ${ledger}
    <div class="section-label">Alojamentos <span>${alojamentos.length}</span></div>
    ${list}
  `;
}

function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

/* ---------------- Alojamento detail ---------------- */

function renderAlojamentoDetail(alojamentoId) {
  const al = getAlojamento(alojamentoId);
  if (!al) {
    return `<div class="empty-state"><h3>Alojamento não encontrado</h3></div>`;
  }
  const all = armariosDe(al.id);
  const stats = computeStats(all);
  const occIdx = buildOccupantIndex();

  const filter = state.ui.lockerFilter;
  const query = normalizeName(state.ui.lockerQuery);

  let visible = all;
  if (filter !== 'todos') visible = visible.filter((a) => a.status === filter);
  if (query) {
    visible = visible.filter((a) =>
      a.numero.toLowerCase().includes(query) ||
      (a.usuario && normalizeName(a.usuario).includes(query))
    );
  }

  const chips = `
    <div class="chip-row">
      <button class="chip ${filter === 'todos' ? 'active' : ''}" data-action="filter-locker" data-filter="todos">Todos <span style="color:var(--text-faint)">· ${stats.total}</span></button>
      <button class="chip ${filter === 'livre' ? 'active' : ''}" data-action="filter-locker" data-filter="livre"><span class="dot dot-livre"></span> Livre · ${stats.livres}</button>
      <button class="chip ${filter === 'ocupado' ? 'active' : ''}" data-action="filter-locker" data-filter="ocupado"><span class="dot dot-ocupado"></span> Ocupado · ${stats.ocupados}</button>
      <button class="chip ${filter === 'sem_id' ? 'active' : ''}" data-action="filter-locker" data-filter="sem_id"><span class="dot dot-sem-id"></span> Sem id. · ${stats.semId}</button>
    </div>
  `;

  const ledger = `
    <div class="ledger" style="padding:14px 14px 12px; margin-top:0;">
      ${stats.total > 0 ? `<div class="stack-bar" style="margin-bottom:10px;">
        <span class="seg-livre" style="width:${pct(stats.livres, stats.total)}%"></span>
        <span class="seg-ocupado" style="width:${pct(stats.ocupados, stats.total)}%"></span>
        <span class="seg-sem-id" style="width:${pct(stats.semId, stats.total)}%"></span>
      </div>` : ''}
      <div class="ledger-legend">
        <div class="legend-item"><b class="legend-num">${stats.total}</b>&nbsp;total</div>
        <div class="legend-item"><span class="dot dot-livre"></span> <span class="legend-num legend-text-livre">${stats.livres}</span></div>
        <div class="legend-item"><span class="dot dot-ocupado"></span> <span class="legend-num legend-text-ocupado">${stats.ocupados}</span></div>
        <div class="legend-item"><span class="dot dot-sem-id"></span> <span class="legend-num legend-text-sem-id">${stats.semId}</span></div>
        <button class="btn-ghost" style="margin-left:auto; font-size:12px;" data-action="open-edit-alojamento" data-id="${al.id}">Editar alojamento</button>
      </div>
    </div>
  `;

  let grid;
  if (all.length === 0) {
    grid = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg>
        <h3>Nenhum armário neste alojamento</h3>
        <p>Adicione armários individualmente ou em lote pelo botão +.</p>
        <button class="btn btn-primary" data-action="open-add-armario" data-alojamento="${al.id}">+ Adicionar armários</button>
      </div>
    `;
  } else if (visible.length === 0) {
    grid = `<div class="empty-state"><p>Nenhum armário corresponde ao filtro/busca.</p></div>`;
  } else {
    grid = `<div class="locker-grid">` + visible.map((a) => {
      const meta = STATUS[a.status];
      const isDup = a.status === 'ocupado' && a.usuario && occIdx[normalizeName(a.usuario)] && occIdx[normalizeName(a.usuario)].length > 1;
      const hasLock = !!cadeadoDoArmario(a.id);
      return `
        <button class="locker-tile st-${meta.color}" data-action="open-armario" data-id="${a.id}">
          ${isDup ? `<span class="dup-badge" title="Pessoa com 2+ armários">2×</span>` : ''}
          ${hasLock ? `<span class="lock-badge" title="Cadeado registrado"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>` : ''}
          <div class="locker-num">${escapeHtml(a.numero)}</div>
          ${a.status === 'ocupado' ? `<div class="locker-user">${escapeHtml(a.usuario)}</div>` : `<div class="locker-user" style="color:var(--text-faint)">${meta.label}</div>`}
        </button>
      `;
    }).join('') + `</div>`;
  }

  return `
    ${ledger}
    ${all.length > 0 ? `
    <div class="section-label" style="margin-top:18px;">Armários</div>
    <input class="search-input" id="locker-search" placeholder="Buscar por número ou pessoa…" value="${escapeHtml(state.ui.lockerQuery)}">
    ${chips}
    ` : ''}
    ${grid}
  `;
}

/* ---------------- Cadeados ---------------- */

function renderCadeados() {
  const cadeados = state.data.cadeados.slice().sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));

  // detect duplicate lock numbers
  const numCount = {};
  cadeados.forEach((c) => { numCount[c.numero] = (numCount[c.numero] || 0) + 1; });

  let body;
  if (state.data.alojamentos.length === 0) {
    body = `
      <div class="empty-state">
        <h3>Cadastre um alojamento primeiro</h3>
        <p>Os cadeados são vinculados a um alojamento e a um armário.</p>
      </div>
    `;
  } else if (cadeados.length === 0) {
    body = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        <h3>Nenhum cadeado registrado</h3>
        <p>Registre cada cadeado informando o número, o alojamento e o armário.</p>
        <button class="btn btn-primary" data-action="open-add-cadeado">+ Registrar cadeado</button>
      </div>
    `;
  } else {
    const rows = cadeados.map((c) => {
      const dup = numCount[c.numero] > 1;
      if (c.mode === 'local') {
        return `
          <tr data-action="open-edit-cadeado" data-id="${c.id}" style="cursor:pointer;">
            <td class="mono">${escapeHtml(c.numero)} ${dup ? '<span class="tag tag-warn" style="margin-left:6px;">duplicado</span>' : ''}</td>
            <td colspan="2" style="font-style:italic; color:var(--text-muted);">📍 ${escapeHtml(c.local || '—')}</td>
            <td><span class="tag tag-avulso">Avulso</span></td>
          </tr>
        `;
      }
      const al = getAlojamento(c.alojamentoId);
      const arm = getArmario(c.armarioId);
      return `
        <tr data-action="open-edit-cadeado" data-id="${c.id}" style="cursor:pointer;">
          <td class="mono">${escapeHtml(c.numero)} ${dup ? '<span class="tag tag-warn" style="margin-left:6px;">duplicado</span>' : ''}</td>
          <td>${al ? escapeHtml(al.nome) : '<span style="color:var(--text-faint)">—</span>'}</td>
          <td class="mono">${arm ? escapeHtml(arm.numero) : '<span style="color:var(--text-faint)">—</span>'}</td>
          <td>${arm ? `<span class="tag ${STATUS[arm.status].tag}">${STATUS[arm.status].label}</span>` : ''}</td>
        </tr>
      `;
    }).join('');
    body = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Cadeado</th><th>Alojamento</th><th>Armário</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:11.5px; color:var(--text-faint); margin-top:10px;">Toque em um cadeado para editar ou remover.</p>
    `;
  }

  const toolbar = state.data.alojamentos.length > 0 ? `
    <div class="locate-toolbar">
      <button class="btn btn-sm" data-action="open-localizar-cadeado">🔍 Localizar cadeado</button>
      <button class="btn btn-sm" data-action="open-localizar-armario-vazio">🔓 Localizar armário vazio</button>
    </div>
  ` : '';

  return `
    <div class="section-label">Controle de cadeados <span>${cadeados.length}</span></div>
    ${toolbar}
    ${body}
  `;
}

/* ---------------- Localizar cadeado / armário vazio ---------------- */

function openLocalizarCadeadoSheet() {
  openSheet({
    title: 'Localizar cadeado',
    sub: 'Digite o número do cadeado para ver onde ele está.',
    bodyHtml: `
      <div class="field">
        <label for="loc-cd-numero">Número do cadeado</label>
        <input type="text" id="loc-cd-numero" placeholder="Ex.: 07" inputmode="numeric">
      </div>
      <div id="loc-cd-results"></div>
    `,
    footerHtml: `<button class="btn btn-block" id="close-loc-cd">Fechar</button>`,
    onMount: (root) => {
      const input = root.querySelector('#loc-cd-numero');
      const results = root.querySelector('#loc-cd-results');
      function refresh() {
        const q = input.value.trim().toLowerCase();
        if (!q) { results.innerHTML = ''; return; }
        const matches = state.data.cadeados.filter((c) => c.numero.toLowerCase().includes(q));
        if (matches.length === 0) {
          results.innerHTML = `<p style="font-size:13px; color:var(--text-faint);">Nenhum cadeado encontrado com esse número.</p>`;
          return;
        }
        results.innerHTML = matches.map((c) => {
          if (c.mode === 'local') {
            return `<div class="locate-result"><b>Cadeado ${escapeHtml(c.numero)}</b><br>📍 ${escapeHtml(c.local || '—')}</div>`;
          }
          const al = getAlojamento(c.alojamentoId);
          const arm = getArmario(c.armarioId);
          return `<div class="locate-result"><b>Cadeado ${escapeHtml(c.numero)}</b><br>${al ? escapeHtml(al.nome) : '—'} · Armário ${arm ? escapeHtml(arm.numero) : '—'} ${arm ? `<span class="tag ${STATUS[arm.status].tag}">${STATUS[arm.status].label}</span>` : ''}</div>`;
        }).join('');
      }
      input.addEventListener('input', refresh);
      input.focus();
      root.querySelector('#close-loc-cd').addEventListener('click', closeSheet);
    }
  });
}

function openLocalizarArmarioVazioSheet() {
  const alojamentos = state.data.alojamentos;
  openSheet({
    title: 'Localizar armário vazio',
    sub: 'Escolha um alojamento para ver os armários livres e o cadeado de cada um.',
    bodyHtml: `
      <div class="field">
        <label for="loc-ar-alojamento">Alojamento</label>
        <select id="loc-ar-alojamento">
          <option value="">Selecione…</option>
          ${alojamentos.map((al) => `<option value="${al.id}">${escapeHtml(al.nome)}</option>`).join('')}
        </select>
      </div>
      <div id="loc-ar-results"></div>
    `,
    footerHtml: `<button class="btn btn-block" id="close-loc-ar">Fechar</button>`,
    onMount: (root) => {
      const select = root.querySelector('#loc-ar-alojamento');
      const results = root.querySelector('#loc-ar-results');
      function refresh() {
        const id = select.value;
        if (!id) { results.innerHTML = ''; return; }
        const livres = armariosDe(id).filter((a) => a.status === 'livre');
        if (livres.length === 0) {
          results.innerHTML = `<p style="font-size:13px; color:var(--text-faint);">Nenhum armário livre neste alojamento.</p>`;
          return;
        }
        results.innerHTML = `<div class="section-label" style="margin-top:2px;">${livres.length} armário(s) livre(s)</div>` +
          livres.map((a) => {
            const lock = cadeadoDoArmario(a.id);
            return `<div class="locate-result"><b>Armário ${escapeHtml(a.numero)}</b> — ${lock ? `Cadeado ${escapeHtml(lock.numero)}` : 'sem cadeado registrado'}</div>`;
          }).join('');
      }
      select.addEventListener('change', refresh);
      root.querySelector('#close-loc-ar').addEventListener('click', closeSheet);
    }
  });
}

/* ---------------- Pessoas com 2+ armários ---------------- */

function renderPessoas() {
  const idx = buildOccupantIndex();
  const names = Object.keys(idx).filter((k) => idx[k].length > 1);

  if (names.length === 0) {
    return `
      <div class="section-label">Pessoas com mais de um armário</div>
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/></svg>
        <h3>Nenhuma duplicidade encontrada</h3>
        <p>Quando uma mesma pessoa estiver associada a dois ou mais armários, ela aparece aqui.</p>
      </div>
    `;
  }

  const cards = names.map((key) => {
    const lockers = idx[key];
    const displayName = lockers[0].usuario;
    const rows = lockers.map((a) => {
      const al = getAlojamento(a.alojamentoId);
      return `
        <div class="person-locker-row">
          <span>${al ? escapeHtml(al.nome) : '—'}</span>
          <span class="mono">nº ${escapeHtml(a.numero)}</span>
        </div>
      `;
    }).join('');
    return `
      <div class="person-card">
        <div class="person-name"><span class="tag tag-warn">${lockers.length}×</span> ${escapeHtml(displayName)}</div>
        ${rows}
      </div>
    `;
  }).join('');

  return `
    <div class="section-label">Pessoas com mais de um armário <span>${names.length}</span></div>
    ${cards}
  `;
}

/* ---------------- Ajustes ---------------- */

function renderAjustes() {
  const alojamentos = state.data.alojamentos;
  const rows = alojamentos.map((al) => {
    const s = computeStats(armariosDe(al.id));
    return `
      <div class="alojamento-card" style="cursor:default;">
        <div class="alojamento-card-top">
          <div class="alojamento-name">${escapeHtml(al.nome)}</div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm" data-action="open-edit-alojamento" data-id="${al.id}">Editar</button>
          </div>
        </div>
        <div class="mini-counts">${s.total} armário${s.total === 1 ? '' : 's'} · ${s.livres} livres · ${s.ocupados} ocupados · ${s.semId} sem id.</div>
      </div>
    `;
  }).join('');

  return `
    <div class="section-label">Alojamentos</div>
    <div class="alojamento-list">${rows || '<p style="color:var(--text-muted); font-size:13px;">Nenhum alojamento cadastrado.</p>'}</div>
    <button class="btn btn-block" style="margin-top:12px;" data-action="open-add-alojamento">+ Novo alojamento</button>

    <div class="divider"></div>

    <div class="section-label">Dados</div>
    <button class="btn btn-block" style="margin-bottom:10px;" data-action="export-data">Exportar dados (.json)</button>
    <label class="btn btn-block" style="margin-bottom:10px; display:flex;">
      Importar dados (.json)
      <input type="file" id="import-file" accept="application/json" class="hidden">
    </label>

    <div class="divider"></div>

    <div class="section-label">Zona de risco</div>
    <button class="btn btn-danger btn-block" data-action="clear-all">Limpar todos os dados</button>

    <p style="font-size:11.5px; color:var(--text-faint); margin-top:22px; line-height:1.6;">
      Os dados ficam salvos apenas neste dispositivo (armazenamento local). Use "Exportar dados" para fazer backup antes de trocar de aparelho ou reinstalar o app.
    </p>
  `;
}

/* ---------------- Sheet builders ---------------- */

function statusRadioHtml(name, selected, opts) {
  opts = opts || {};
  return ['livre', 'ocupado', 'sem_id'].map((key) => {
    const meta = STATUS[key];
    const checked = selected === key ? 'checked' : '';
    const isChecked = selected === key ? 'is-checked' : '';
    return `
      <label class="status-radio sel-${meta.color} ${isChecked}">
        <input type="radio" name="${name}" value="${key}" ${checked}>
        <span class="dot dot-${meta.color}"></span>
        <span>${meta.label}</span>
      </label>
    `;
  }).join('');
}

function openAddAlojamentoSheet() {
  openSheet({
    title: 'Novo alojamento',
    sub: 'Dê um nome ao alojamento e, se quiser, já crie os armários iniciais.',
    bodyHtml: `
      <div class="field">
        <label for="al-nome">Nome do alojamento</label>
        <input type="text" id="al-nome" placeholder="Ex.: Alojamento A">
      </div>
      <div class="field">
        <label for="al-qtd">Criar armários automaticamente (opcional)</label>
        <div class="stepper-row">
          <input type="number" id="al-qtd" min="0" max="500" value="0" style="flex:1; background:var(--surface-2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:11px 12px; font-size:14.5px;">
        </div>
        <div class="field-hint">Serão numerados sequencialmente a partir do número inicial abaixo, todos como "livre".</div>
      </div>
      <div class="field">
        <label for="al-inicio">Número inicial</label>
        <input type="text" id="al-inicio" value="01">
      </div>
    `,
    footerHtml: `
      <button class="btn" id="cancel-add-al">Cancelar</button>
      <button class="btn btn-primary" id="save-add-al">Criar</button>
    `,
    onMount: (root) => {
      root.querySelector('#al-nome').focus();
      root.querySelector('#cancel-add-al').addEventListener('click', closeSheet);
      root.querySelector('#save-add-al').addEventListener('click', () => {
        const nome = root.querySelector('#al-nome').value.trim();
        const qtd = parseInt(root.querySelector('#al-qtd').value, 10) || 0;
        const inicio = root.querySelector('#al-inicio').value.trim() || '1';
        if (!nome) { toast('Informe o nome do alojamento.'); return; }
        const al = { id: uid('al'), nome };
        state.data.alojamentos.push(al);
        if (qtd > 0) {
          const created = generateArmarios(al.id, qtd, inicio);
          if (!created.ok) { toast(created.msg); }
        }
        saveData();
        closeSheet();
        toast('Alojamento criado.');
        render();
      });
    }
  });
}

function openEditAlojamentoSheet(id) {
  const al = getAlojamento(id);
  if (!al) return;
  openSheet({
    title: 'Editar alojamento',
    bodyHtml: `
      <div class="field">
        <label for="al-nome-edit">Nome do alojamento</label>
        <input type="text" id="al-nome-edit" value="${escapeHtml(al.nome)}">
      </div>
      <button class="btn btn-block" style="margin-bottom:10px;" data-action="open-add-armario" data-alojamento="${al.id}" id="quick-add-armario">+ Adicionar armários a este alojamento</button>
    `,
    footerHtml: `
      <button class="btn btn-danger" id="delete-al">Excluir</button>
      <button class="btn btn-primary" id="save-al">Salvar</button>
    `,
    onMount: (root) => {
      root.querySelector('#quick-add-armario').addEventListener('click', () => {
        closeSheet();
        setTimeout(() => openAddArmarioSheet(al.id), 180);
      });
      root.querySelector('#save-al').addEventListener('click', () => {
        const nome = root.querySelector('#al-nome-edit').value.trim();
        if (!nome) { toast('Informe o nome do alojamento.'); return; }
        al.nome = nome;
        saveData();
        closeSheet();
        toast('Alojamento atualizado.');
        render();
      });
      root.querySelector('#delete-al').addEventListener('click', () => {
        const armCount = armariosDe(al.id).length;
        openConfirm(
          'Excluir alojamento?',
          `Isso removerá "${escapeHtml(al.nome)}" e ${armCount} armário(s) associado(s), além de cadeados vinculados. Essa ação não pode ser desfeita.`,
          'Excluir',
          () => {
            state.data.armarios = state.data.armarios.filter((a) => a.alojamentoId !== al.id);
            state.data.cadeados = state.data.cadeados.filter((c) => c.alojamentoId !== al.id);
            state.data.alojamentos = state.data.alojamentos.filter((a) => a.id !== al.id);
            saveData();
            // pop back to dashboard if we were inside this alojamento
            state.stack = [{ view: 'dashboard' }];
            toast('Alojamento excluído.');
            render();
          }
        );
      });
    }
  });
}

function generateArmarios(alojamentoId, qtd, inicioStr) {
  const existing = new Set(armariosDe(alojamentoId).map((a) => a.numero));
  const match = inicioStr.match(/^(\D*)(\d+)(\D*)$/);
  let prefix = '', start = 1, suffix = '', pad = 2;
  if (match) {
    prefix = match[1]; start = parseInt(match[2], 10); suffix = match[3];
    pad = match[2].length;
  } else {
    prefix = inicioStr;
  }
  const toCreate = [];
  for (let i = 0; i < qtd; i++) {
    const n = start + i;
    const numero = match ? (prefix + String(n).padStart(pad, '0') + suffix) : (prefix + (i + 1));
    if (existing.has(numero)) {
      return { ok: false, msg: `O número "${numero}" já existe neste alojamento. Ajuste o início.` };
    }
    existing.add(numero);
    toCreate.push(numero);
  }
  toCreate.forEach((numero) => {
    state.data.armarios.push({ id: uid('ar'), alojamentoId, numero, status: 'livre', usuario: '' });
  });
  return { ok: true };
}

function openAddArmarioSheet(alojamentoId) {
  openSheet({
    title: 'Adicionar armários',
    sub: 'Adicione um único armário ou vários de uma vez.',
    bodyHtml: `
      <div class="chip-row" style="padding-bottom:14px;">
        <button class="chip active" id="mode-single" data-mode="single">Único</button>
        <button class="chip" id="mode-batch" data-mode="batch">Em lote</button>
      </div>
      <div id="mode-single-fields">
        <div class="field">
          <label for="ar-numero">Número do armário</label>
          <input type="text" id="ar-numero" placeholder="Ex.: 07">
        </div>
      </div>
      <div id="mode-batch-fields" class="hidden">
        <div class="field">
          <label for="ar-qtd">Quantidade</label>
          <input type="number" id="ar-qtd" min="1" max="500" value="10">
        </div>
        <div class="field">
          <label for="ar-inicio">Número inicial</label>
          <input type="text" id="ar-inicio" value="01">
          <div class="field-hint">Ex.: início "01" com quantidade 10 cria de 01 a 10.</div>
        </div>
      </div>
    `,
    footerHtml: `
      <button class="btn" id="cancel-add-ar">Cancelar</button>
      <button class="btn btn-primary" id="save-add-ar">Adicionar</button>
    `,
    onMount: (root) => {
      let mode = 'single';
      root.querySelector('#mode-single').addEventListener('click', () => {
        mode = 'single';
        root.querySelector('#mode-single').classList.add('active');
        root.querySelector('#mode-batch').classList.remove('active');
        root.querySelector('#mode-single-fields').classList.remove('hidden');
        root.querySelector('#mode-batch-fields').classList.add('hidden');
      });
      root.querySelector('#mode-batch').addEventListener('click', () => {
        mode = 'batch';
        root.querySelector('#mode-batch').classList.add('active');
        root.querySelector('#mode-single').classList.remove('active');
        root.querySelector('#mode-batch-fields').classList.remove('hidden');
        root.querySelector('#mode-single-fields').classList.add('hidden');
      });
      root.querySelector('#ar-numero').focus();
      root.querySelector('#cancel-add-ar').addEventListener('click', closeSheet);
      root.querySelector('#save-add-ar').addEventListener('click', () => {
        if (mode === 'single') {
          const numero = root.querySelector('#ar-numero').value.trim();
          if (!numero) { toast('Informe o número do armário.'); return; }
          const existing = new Set(armariosDe(alojamentoId).map((a) => a.numero));
          if (existing.has(numero)) { toast('Já existe um armário com esse número neste alojamento.'); return; }
          state.data.armarios.push({ id: uid('ar'), alojamentoId, numero, status: 'livre', usuario: '' });
          saveData();
          closeSheet();
          toast('Armário adicionado.');
          render();
        } else {
          const qtd = parseInt(root.querySelector('#ar-qtd').value, 10) || 0;
          const inicio = root.querySelector('#ar-inicio').value.trim() || '1';
          if (qtd <= 0) { toast('Informe uma quantidade válida.'); return; }
          const result = generateArmarios(alojamentoId, qtd, inicio);
          if (!result.ok) { toast(result.msg); return; }
          saveData();
          closeSheet();
          toast(`${qtd} armário(s) adicionado(s).`);
          render();
        }
      });
    }
  });
}

function openArmarioSheet(armarioId) {
  const arm = getArmario(armarioId);
  if (!arm) return;
  const al = getAlojamento(arm.alojamentoId);
  const lock = cadeadoDoArmario(arm.id);

  openSheet({
    title: `Armário ${escapeHtml(arm.numero)}`,
    sub: al ? escapeHtml(al.nome) : '',
    bodyHtml: `
      <div class="field">
        <label>Status</label>
        <div class="status-radios" id="status-radios">
          ${statusRadioHtml('status', arm.status)}
        </div>
      </div>
      <div class="field" id="usuario-field" style="${arm.status === 'ocupado' ? '' : 'display:none;'}">
        <label for="ar-usuario">Nome da pessoa</label>
        <input type="text" id="ar-usuario" placeholder="Nome completo" value="${escapeHtml(arm.usuario || '')}">
      </div>
      <div id="dup-warning"></div>
      ${lock ? `<div class="field-hint" style="margin-bottom:10px;">🔒 Cadeado nº ${escapeHtml(lock.numero)} registrado nesta unidade.</div>` : ''}
      ${arm.status === 'ocupado' ? `<button type="button" class="btn-ghost" id="share-wa" style="padding:0; font-size:12.5px;">📲 Enviar cadastro por WhatsApp</button>` : ''}
    `,
    footerHtml: `
      <button class="btn btn-danger" id="remove-ar">Remover</button>
      <button class="btn btn-primary" id="save-ar">Salvar</button>
    `,
    onMount: (root) => {
      const usuarioField = root.querySelector('#usuario-field');
      const usuarioInput = root.querySelector('#ar-usuario');
      const dupBox = root.querySelector('#dup-warning');

      function refreshDupWarning() {
        const name = usuarioInput.value;
        const dups = duplicateLockersForName(name, arm.id);
        if (dups.length > 0) {
          const list = dups.map((d) => {
            const dal = getAlojamento(d.alojamentoId);
            return `${dal ? escapeHtml(dal.nome) : '—'} · nº ${escapeHtml(d.numero)}`;
          }).join('; ');
          dupBox.innerHTML = `
            <div class="warn-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
              <span>Esta pessoa já possui armário em: ${list}. Ela ficará com 2+ armários.</span>
            </div>
          `;
        } else {
          dupBox.innerHTML = '';
        }
      }

      root.querySelectorAll('input[name="status"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          root.querySelectorAll('.status-radio').forEach((l) => l.classList.remove('is-checked'));
          radio.closest('.status-radio').classList.add('is-checked');
          if (radio.value === 'ocupado') {
            usuarioField.style.display = '';
            usuarioInput.focus();
            refreshDupWarning();
          } else {
            usuarioField.style.display = 'none';
            dupBox.innerHTML = '';
          }
        });
      });

      usuarioInput.addEventListener('input', refreshDupWarning);
      if (arm.status === 'ocupado') refreshDupWarning();

      const shareBtn = root.querySelector('#share-wa');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => openWhatsApp(shareMessageFor(arm.id)));
      }

      root.querySelector('#save-ar').addEventListener('click', () => {
        const status = root.querySelector('input[name="status"]:checked').value;
        const wasOcupado = arm.status === 'ocupado';
        if (status === 'ocupado') {
          const nome = usuarioInput.value.trim();
          if (!nome) { toast('Informe o nome da pessoa.'); return; }
          arm.status = 'ocupado';
          arm.usuario = nome;
          saveData();
          closeSheet();
          toast('Armário atualizado.');
          render();
          if (!wasOcupado) openShareSheet(arm.id);
        } else {
          arm.status = status;
          arm.usuario = '';
          saveData();
          closeSheet();
          toast('Armário atualizado.');
          render();
        }
      });

      root.querySelector('#remove-ar').addEventListener('click', () => {
        openConfirm(
          'Remover armário?',
          `O armário ${escapeHtml(arm.numero)} será removido${lock ? ', e o cadeado vinculado a ele ficará sem armário associado' : ''}. Essa ação não pode ser desfeita.`,
          'Remover',
          () => {
            state.data.armarios = state.data.armarios.filter((a) => a.id !== arm.id);
            state.data.cadeados.forEach((c) => { if (c.armarioId === arm.id) c.armarioId = null; });
            saveData();
            toast('Armário removido.');
            render();
          }
        );
      });
    }
  });
}

function openShareSheet(armarioId) {
  const msg = shareMessageFor(armarioId);
  if (!msg) return;
  openSheet({
    title: 'Enviar cadastro por WhatsApp?',
    bodyHtml: `<div class="share-preview">${escapeHtml(msg).replace(/\n/g, '<br>')}</div>`,
    footerHtml: `
      <button class="btn" id="skip-share">Agora não</button>
      <button class="btn btn-primary" id="do-share">Enviar</button>
    `,
    onMount: (root) => {
      root.querySelector('#skip-share').addEventListener('click', closeSheet);
      root.querySelector('#do-share').addEventListener('click', () => {
        openWhatsApp(msg);
        closeSheet();
      });
    }
  });
}

function openAddCadeadoSheet(prefillId) {
  const editing = prefillId ? state.data.cadeados.find((c) => c.id === prefillId) : null;
  const alojamentos = state.data.alojamentos;

  function armarioOptions(alojamentoId, selectedId) {
    return armariosDe(alojamentoId).map((a) => {
      const sel = a.id === selectedId ? 'selected' : '';
      return `<option value="${a.id}" ${sel}>${escapeHtml(a.numero)} — ${STATUS[a.status].label}</option>`;
    }).join('');
  }

  const defaultAlojamentoId = editing ? editing.alojamentoId : (alojamentos[0] && alojamentos[0].id);
  const initialMode = editing ? editing.mode : 'armario';

  openSheet({
    title: editing ? 'Editar cadeado' : 'Registrar cadeado',
    bodyHtml: `
      <div class="field">
        <label for="cd-numero">Número do cadeado</label>
        <input type="text" id="cd-numero" placeholder="Ex.: 01" value="${editing ? escapeHtml(editing.numero) : ''}">
      </div>
      <div class="field">
        <label>Onde está o cadeado?</label>
        <div class="mode-toggle" id="cd-mode-toggle">
          <button type="button" class="mode-btn ${initialMode === 'armario' ? 'active' : ''}" data-mode="armario">Em um armário</button>
          <button type="button" class="mode-btn ${initialMode === 'local' ? 'active' : ''}" data-mode="local">Avulso (local)</button>
        </div>
      </div>
      <div id="cd-armario-fields" class="${initialMode === 'local' ? 'hidden' : ''}">
        <div class="field">
          <label for="cd-alojamento">Alojamento</label>
          <select id="cd-alojamento">
            ${alojamentos.map((al) => `<option value="${al.id}" ${al.id === defaultAlojamentoId ? 'selected' : ''}>${escapeHtml(al.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="cd-armario">Armário</label>
          <select id="cd-armario">
            ${defaultAlojamentoId ? armarioOptions(defaultAlojamentoId, editing ? editing.armarioId : null) : ''}
          </select>
        </div>
      </div>
      <div id="cd-local-fields" class="field ${initialMode === 'armario' ? 'hidden' : ''}">
        <label for="cd-local">Local do cadeado</label>
        <input type="text" id="cd-local" placeholder="Ex.: Almoxarifado, Portão próx. SJD…" value="${editing && editing.mode === 'local' ? escapeHtml(editing.local || '') : ''}">
      </div>
    `,
    footerHtml: `
      ${editing ? '<button class="btn btn-danger" id="delete-cd">Excluir</button>' : '<button class="btn" id="cancel-cd">Cancelar</button>'}
      <button class="btn btn-primary" id="save-cd">${editing ? 'Salvar' : 'Registrar'}</button>
    `,
    onMount: (root) => {
      let mode = initialMode;
      const alSelect = root.querySelector('#cd-alojamento');
      const arSelect = root.querySelector('#cd-armario');
      const armarioFields = root.querySelector('#cd-armario-fields');
      const localFields = root.querySelector('#cd-local-fields');

      alSelect.addEventListener('change', () => {
        arSelect.innerHTML = armarioOptions(alSelect.value, null);
      });

      root.querySelectorAll('.mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          mode = btn.dataset.mode;
          root.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
          armarioFields.classList.toggle('hidden', mode !== 'armario');
          localFields.classList.toggle('hidden', mode !== 'local');
        });
      });

      if (!editing) root.querySelector('#cancel-cd').addEventListener('click', closeSheet);
      if (editing) {
        root.querySelector('#delete-cd').addEventListener('click', () => {
          state.data.cadeados = state.data.cadeados.filter((c) => c.id !== editing.id);
          saveData();
          closeSheet();
          toast('Cadeado removido.');
          render();
        });
      }
      root.querySelector('#save-cd').addEventListener('click', () => {
        const numero = root.querySelector('#cd-numero').value.trim();
        if (!numero) { toast('Informe o número do cadeado.'); return; }

        let payload;
        if (mode === 'armario') {
          const alojamentoId = alSelect.value;
          const armarioId = arSelect.value;
          if (!alojamentoId) { toast('Cadastre um alojamento primeiro.'); return; }
          if (!armarioId) { toast('Este alojamento não possui armários. Adicione um armário primeiro.'); return; }
          payload = { mode: 'armario', alojamentoId, armarioId, local: '' };
        } else {
          const local = root.querySelector('#cd-local').value.trim();
          if (!local) { toast('Informe o local do cadeado.'); return; }
          payload = { mode: 'local', alojamentoId: null, armarioId: null, local };
        }

        if (editing) {
          editing.numero = numero;
          Object.assign(editing, payload);
        } else {
          state.data.cadeados.push(Object.assign({ id: uid('cd'), numero }, payload));
        }
        saveData();
        closeSheet();
        toast(editing ? 'Cadeado atualizado.' : 'Cadeado registrado.');
        render();
      });
    }
  });
}

/* ---------------- Event binding ---------------- */

function bindViewEvents(view) {
  if (view === 'alojamento-detail') {
    const search = document.getElementById('locker-search');
    if (search) {
      search.addEventListener('input', (e) => {
        state.ui.lockerQuery = e.target.value;
        const cur = current();
        // re-render just this view, preserving scroll-ish
        document.getElementById('main-view').innerHTML = renderAlojamentoDetail(cur.params.id);
        bindViewEvents('alojamento-detail');
        document.getElementById('locker-search').focus();
        const val = document.getElementById('locker-search').value;
        document.getElementById('locker-search').setSelectionRange(val.length, val.length);
      });
    }
  }

  if (view === 'ajustes') {
    const importInput = document.getElementById('import-file');
    if (importInput) {
      importInput.addEventListener('change', handleImportFile);
    }
  }
}

function mainClickHandler(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  switch (action) {
    case 'open-add-alojamento':
      openAddAlojamentoSheet();
      break;
    case 'open-edit-alojamento':
      openEditAlojamentoSheet(target.dataset.id);
      break;
    case 'open-alojamento':
      navigateTo('alojamento-detail', { id: target.dataset.id });
      break;
    case 'open-add-armario':
      openAddArmarioSheet(target.dataset.alojamento);
      break;
    case 'open-armario':
      openArmarioSheet(target.dataset.id);
      break;
    case 'filter-locker':
      state.ui.lockerFilter = target.dataset.filter;
      render();
      break;
    case 'open-add-cadeado':
      openAddCadeadoSheet();
      break;
    case 'open-edit-cadeado':
      openAddCadeadoSheet(target.dataset.id);
      break;
    case 'open-localizar-cadeado':
      openLocalizarCadeadoSheet();
      break;
    case 'open-localizar-armario-vazio':
      openLocalizarArmarioVazioSheet();
      break;
    case 'export-data':
      exportData();
      break;
    case 'clear-all':
      openConfirm(
        'Limpar todos os dados?',
        'Todos os alojamentos, armários e cadeados serão apagados deste dispositivo. Considere exportar um backup antes.',
        'Limpar tudo',
        () => {
          state.data = { alojamentos: [], armarios: [], cadeados: [] };
          saveData();
          state.stack = [{ view: 'dashboard' }];
          toast('Dados apagados.');
          render();
        }
      );
      break;
  }
  // clean up listener duplication guard is unnecessary since main.innerHTML
  // replacement removes old listeners automatically on re-render.
}

/* ---------------- Import / Export ---------------- */

function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `armarios-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup exportado.');
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.alojamentos) || !Array.isArray(parsed.armarios)) {
        toast('Arquivo inválido.');
        return;
      }
      openConfirm(
        'Importar dados?',
        'Isso substituirá todos os dados atuais deste dispositivo pelos dados do arquivo importado.',
        'Importar',
        () => {
          state.data = {
            alojamentos: parsed.alojamentos || [],
            armarios: parsed.armarios || [],
            cadeados: normalizeCadeados(parsed.cadeados)
          };
          saveData();
          toast('Dados importados.');
          render();
        }
      );
    } catch (err) {
      toast('Não foi possível ler o arquivo.');
    }
  };
  reader.readAsText(file);
}

/* ---------------- Boot ---------------- */

function initChromeEvents() {
  document.getElementById('btn-back').addEventListener('click', goBack);
  document.getElementById('main-view').addEventListener('click', mainClickHandler);
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.view));
  });
  document.getElementById('fab').addEventListener('click', () => {
    const cur = current();
    if (cur.view === 'dashboard') openAddAlojamentoSheet();
    else if (cur.view === 'alojamento-detail') openAddArmarioSheet(cur.params.id);
    else if (cur.view === 'cadeados') openAddCadeadoSheet();
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

initChromeEvents();
render();
registerServiceWorker();
