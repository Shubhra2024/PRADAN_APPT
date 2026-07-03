// ---------------------------------------------------------------- state --
let META = { districts: [], blocks: {}, indicators: [], themes: [], workflow: null };
let ENTRY_ROWS = [];        // current entry table rows from API
let FIELD_PERMS = {};       // per-quarter plan/achv editability for the fy being viewed
let DIRTY = {};             // code -> { field: value }

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) {
    window.location = '/login';
    throw new Error('Not authenticated');
  }
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

// ------------------------------------------------------------------ tabs --
function initTabs() {
  $$('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'district') loadDistrictReport();
      if (btn.dataset.tab === 'state') loadStateReport();
      if (btn.dataset.tab === 'dashboard') loadDashboard();
    });
  });
}

// ---------------------------------------------------------------- boot --
async function boot() {
  META = await api('/api/meta');
  populateDistrictSelects();
  populateThemeSelects();
  populateFYSelects();
  initTabs();
  initEntryTab();
  await loadEntryTable();

  $('#reportDistrict').addEventListener('change', loadDistrictReport);
  $('#reportFY').addEventListener('change', loadDistrictReport);
  $('#districtSearch').addEventListener('input', () => filterTable('districtTbody', $('#districtSearch').value));
  $('#stateSearch').addEventListener('input', () => filterTable('stateTbody', $('#stateSearch').value));
  $('#stateTheme').addEventListener('change', loadStateReport);
  $('#stateFY').addEventListener('change', loadStateReport);
  $('#dashFY').addEventListener('change', loadDashboard);
  $('#exportDistrictBtn').addEventListener('click', () => {
    const d = $('#reportDistrict').value;
    const fy = $('#reportFY').value;
    window.location = `/api/export/district/${encodeURIComponent(d)}?fy=${encodeURIComponent(fy)}`;
  });
  $('#exportStateBtn').addEventListener('click', () => {
    const fy = $('#stateFY').value;
    window.location = `/api/export/state?fy=${encodeURIComponent(fy)}`;
  });
  $('#heatDistrictSelect').addEventListener('change', renderHeatmap);
  $('#logoutBtn').addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' });
    window.location = '/login';
  });
}

function populateDistrictSelects() {
  ['entryDistrict', 'reportDistrict', 'heatDistrictSelect'].forEach(id => {
    const sel = $(`#${id}`);
    sel.innerHTML = META.districts.map(d => `<option value="${d}">${d}</option>`).join('');
  });
}

function populateThemeSelects() {
  ['entryTheme', 'stateTheme'].forEach(id => {
    const sel = $(`#${id}`);
    sel.innerHTML = '<option value="">All themes</option>' +
      META.themes.map(t => `<option value="${t}">${t}</option>`).join('');
  });
}

function populateFYSelects() {
  const fys = META.workflow.financial_years.map(f => f.fy);
  const current = META.workflow.current_fy;
  ['entryFY', 'reportFY', 'stateFY', 'dashFY'].forEach(id => {
    const sel = $(`#${id}`);
    sel.innerHTML = fys.map(fy => `<option value="${fy}" ${fy === current ? 'selected' : ''}>${fy}${fy === current ? ' (current)' : ''}</option>`).join('');
  });
}

// ============================================================ DATA ENTRY ==
function initEntryTab() {
  $('#entryCategoryFilter').addEventListener('change', () => {
    populateBlockSelect();
    loadEntryTable();
  });
  $('#entryDistrict').addEventListener('change', () => {
    populateBlockSelect();
    loadEntryTable();
  });
  $('#entryBlock').addEventListener('change', loadEntryTable);
  $('#entryFY').addEventListener('change', loadEntryTable);
  $('#entryQuarter').addEventListener('change', renderEntryTable);
  $('#entryTheme').addEventListener('change', renderEntryTable);
  $('#entrySearch').addEventListener('input', renderEntryTable);
  $('#saveBtn').addEventListener('click', saveEntries);
  $('#freezeBtn').addEventListener('click', freezeCurrentQuarter);
  $('#unfreezeBtn').addEventListener('click', unfreezeLastQuarter);
  populateBlockSelect();
}

function populateBlockSelect() {
  const d = $('#entryDistrict').value;
  const categoryFilter = $('#entryCategoryFilter').value;
  let blocks = META.blocks[d] || [];
  if (categoryFilter) blocks = blocks.filter(b => b.category === categoryFilter);
  const prevValue = $('#entryBlock').value;
  $('#entryBlock').innerHTML = blocks.map(b =>
    `<option value="${b.id}" data-category="${b.category}">${b.name} — ${b.category}</option>`
  ).join('');
  // keep the previous selection if it's still in the filtered list, else default to first
  if (blocks.some(b => String(b.id) === prevValue)) $('#entryBlock').value = prevValue;
}

async function loadEntryTable() {
  const district = $('#entryDistrict').value;
  const block_id = $('#entryBlock').value;
  const fy = $('#entryFY').value;

  if (!block_id) {
    ENTRY_ROWS = [];
    FIELD_PERMS = {};
    $('#entryTbody').innerHTML = '';
    $('#saveStatus').textContent = 'No blocks match this filter';
    return;
  }

  const url = `/api/entries?district=${encodeURIComponent(district)}&block_id=${block_id}&fy=${encodeURIComponent(fy)}`;

  const resp = await api(url);
  ENTRY_ROWS = resp.entries;
  FIELD_PERMS = resp.field_permissions;
  DIRTY = {};
  renderWorkflowBar(fy);

  const badge = $('#blockCategoryBadge');
  badge.textContent = resp.block_category;
  badge.className = 'category-badge ' + resp.block_category.toLowerCase();

  renderEntryTable();
}

function renderWorkflowBar(viewingFy) {
  const wf = META.workflow;
  const isCurrent = viewingFy === wf.current_fy;
  $('#wfStatus').innerHTML = `Currently open for entry: <span class="badge">FY ${wf.current_fy} — ${wf.current_quarter}</span>`;

  const freezeBtn = $('#freezeBtn');
  freezeBtn.style.display = isCurrent ? '' : 'none';
  freezeBtn.textContent = `🔒 Freeze ${wf.current_quarter} (FY ${wf.current_fy}) & open next`;

  const anyFrozen = Object.values(wf.frozen || {}).some(list => list.length > 0);
  const unfreezeBtn = $('#unfreezeBtn');
  unfreezeBtn.style.display = anyFrozen ? '' : 'none';

  const frozenSet = new Set(wf.frozen[viewingFy] || []);
  const banner = $('#frozenBanner');
  if (!isCurrent) {
    banner.style.display = '';
    $('#frozenBannerText').textContent = `FY ${viewingFy} (fully closed)`;
  } else if (frozenSet.size === 4) {
    banner.style.display = '';
    $('#frozenBannerText').textContent = `FY ${viewingFy} (all quarters frozen)`;
  } else {
    banner.style.display = 'none';
  }
}

function askAdminPassword(actionLabel) {
  return window.prompt(`Admin password required to ${actionLabel}:`);
}

async function freezeCurrentQuarter() {
  const wf = META.workflow;
  if (!confirm(`Freeze ${wf.current_quarter} of FY ${wf.current_fy}?\n\nThis locks that quarter's data permanently and opens the next period for entry. This cannot be undone without an admin unfreeze.`)) return;

  const admin_password = askAdminPassword('freeze this quarter');
  if (admin_password === null) return;

  try {
    const res = await fetch('/api/workflow/freeze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fy: wf.current_fy, quarter: wf.current_quarter, admin_password })
    });
    const resp = await res.json();
    if (!res.ok) { alert('Could not freeze: ' + (resp.error || 'unknown error')); return; }
    META.workflow = resp.workflow;
    populateFYSelects();
    $('#entryFY').value = META.workflow.current_fy;
    $('#reportFY').value = META.workflow.current_fy;
    $('#stateFY').value = META.workflow.current_fy;
    $('#dashFY').value = META.workflow.current_fy;
    await loadEntryTable();
    alert(`Done! Now open: FY ${META.workflow.current_fy} — ${META.workflow.current_quarter}`);
  } catch (e) {
    alert('Could not freeze: ' + e.message);
  }
}

async function unfreezeLastQuarter() {
  if (!confirm(`Unfreeze the most recently closed quarter and reopen it for editing?`)) return;

  const admin_password = askAdminPassword('unfreeze the last quarter');
  if (admin_password === null) return;

  try {
    const res = await fetch('/api/workflow/unfreeze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_password })
    });
    const resp = await res.json();
    if (!res.ok) { alert('Could not unfreeze: ' + (resp.error || 'unknown error')); return; }
    META.workflow = resp.workflow;
    populateFYSelects();
    $('#entryFY').value = META.workflow.current_fy;
    $('#reportFY').value = META.workflow.current_fy;
    $('#stateFY').value = META.workflow.current_fy;
    $('#dashFY').value = META.workflow.current_fy;
    await loadEntryTable();
    alert(`Reopened: FY ${META.workflow.current_fy} — ${META.workflow.current_quarter}`);
  } catch (e) {
    alert('Could not unfreeze: ' + e.message);
  }
}

function renderEntryTable() {
  const theme = $('#entryTheme').value;
  const search = $('#entrySearch').value.trim().toLowerCase();
  const quarterFilter = $('#entryQuarter').value; // '' = all quarters
  const quarters = quarterFilter ? [quarterFilter] : ['Q1', 'Q2', 'Q3', 'Q4'];

  // ---- header ----
  const head = $('#entryHeadRow');
  let headHtml = `<th class="code-col">Code</th><th>Theme / Indicator</th><th>Cumulative /<br>Period</th><th>Opening<br>Balance</th>`;
  quarters.forEach(q => {
    headHtml += `<th class="q-plan-col">${q}<br>Plan</th><th class="q-achv-col">${q}<br>Achv.</th>`;
  });
  headHtml += `<th>Total<br>Achieved</th>`;
  head.innerHTML = headHtml;

  const ncols = 4 + quarters.length * 2 + 1;

  // ---- body ----
  const tbody = $('#entryTbody');
  tbody.innerHTML = '';
  let lastTheme = null;
  let count = 0;

  ENTRY_ROWS.forEach(row => {
    if (theme && row.theme !== theme) return;
    if (search) {
      const hay = `${row.indicator_code} ${row.text} ${row.subtheme || ''}`.toLowerCase();
      if (!hay.includes(search)) return;
    }
    if (row.theme !== lastTheme) {
      lastTheme = row.theme;
      const tr = document.createElement('tr');
      tr.className = 'theme-row';
      tr.innerHTML = `<td colspan="${ncols}">${row.theme}</td>`;
      tbody.appendChild(tr);
    }

    const tr = document.createElement('tr');
    tr.dataset.code = row.indicator_code;
    let openingCell;
    if (row.period === 'Cumulative' && row.opening_editable) {
      openingCell = `<td class="opening-col num-col"><input type="number" step="any" data-field="manual_opening" value="${row.manual_opening ?? 0}" title="Seed the baseline total from before this app was used"></td>`;
    } else if (row.period === 'Cumulative') {
      openingCell = `<td class="opening-col num-col">${fmt(row.opening_balance)}</td>`;
    } else {
      openingCell = `<td class="opening-col num-col">—</td>`;
    }
    let html = `
      <td class="code-col">${row.indicator_code}</td>
      <td><div class="ind-text">${row.text}</div>${row.subtheme ? `<div class="ind-sub">${row.subtheme}</div>` : ''}</td>
      <td>${row.period}</td>
      ${openingCell}
    `;
    quarters.forEach(q => {
      const qn = q.toLowerCase();
      const perm = FIELD_PERMS[q] || { plan: false, achv: false };
      const planVal = row[`${qn}_plan`] ?? '';
      const achvVal = row[qn] ?? '';
      html += `<td class="q-plan-col"><input type="number" step="any" data-quarter="${qn}" data-field="${qn}_plan" value="${planVal}" ${perm.plan ? '' : 'disabled'}></td>`;
      html += `<td class="q-achv-col"><input type="number" step="any" data-quarter="${qn}" data-field="${qn}" value="${achvVal}" ${perm.achv ? '' : 'disabled'}></td>`;
    });
    html += `<td class="total-achv-col num-col row-total">${fmt(row.total_achieved)}</td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
    count++;
  });

  tbody.querySelectorAll('input:not(:disabled)').forEach(inp => {
    inp.addEventListener('input', onCellEdit);
  });
  $('#saveStatus').textContent = `${count} indicators shown`;
  $('#saveStatus').style.color = '#6B7686';
}

function onCellEdit(e) {
  const tr = e.target.closest('tr');
  const code = tr.dataset.code;
  const field = e.target.dataset.field;
  e.target.classList.add('dirty');

  if (!DIRTY[code]) DIRTY[code] = {};
  DIRTY[code][field] = e.target.value === '' ? 0 : Number(e.target.value);

  // live-update total achieved (sum of q1..q4 achieved inputs currently in the DOM, disabled or not)
  let total = 0;
  ['q1', 'q2', 'q3', 'q4'].forEach(q => {
    const inp = tr.querySelector(`[data-field="${q}"]`);
    if (inp) total += Number(inp.value) || 0;
    else {
      const row = ENTRY_ROWS.find(r => r.indicator_code === code);
      if (row) total += Number(row[q]) || 0;
    }
  });
  // add opening balance back in if this indicator is cumulative (use the live input if editable, else the computed value)
  const row = ENTRY_ROWS.find(r => r.indicator_code === code);
  if (row && row.period === 'Cumulative') {
    const openingInp = tr.querySelector('[data-field="manual_opening"]');
    if (openingInp) total += Number(openingInp.value) || 0;
    else total += Number(row.opening_balance) || 0;
  }
  const totalCell = tr.querySelector('.row-total');
  if (totalCell) totalCell.textContent = fmt(total);

  $('#saveStatus').textContent = `${Object.keys(DIRTY).length} unsaved change(s)`;
  $('#saveStatus').style.color = '#E0A429';
}

async function saveEntries() {
  const district = $('#entryDistrict').value;
  const block_id = Number($('#entryBlock').value);
  const fy = $('#entryFY').value;

  const entries = Object.keys(DIRTY).map(code => ({
    indicator_code: code,
    ...DIRTY[code]
  }));

  if (entries.length === 0) {
    $('#saveStatus').textContent = 'Nothing to save';
    $('#saveStatus').style.color = '#6B7686';
    return;
  }

  $('#saveStatus').textContent = 'Saving...';
  await api('/api/entries/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ district, block_id, fy, entries })
  });

  $('#saveStatus').textContent = `✓ Saved ${entries.length} indicator(s)`;
  $('#saveStatus').style.color = '#2E9E6B';
  DIRTY = {};
  await loadEntryTable();
}

// ========================================================= DISTRICT REPORT ==
async function loadDistrictReport() {
  const district = $('#reportDistrict').value;
  const fy = $('#reportFY').value;
  if (!district) return;
  const data = await api(`/api/consolidation/district/${encodeURIComponent(district)}?fy=${encodeURIComponent(fy)}`);

  const headRow = $('#districtHeadRow');
  headRow.innerHTML = `<th>Code</th><th>Theme / Indicator</th><th>Cum/Period</th>` +
    data.blocks.map(b => `<th class="col-${b.category.toLowerCase()}">${b.name}<span class="category-tag ${b.category.toLowerCase()}">${b.category[0]}</span></th>`).join('') +
    `<th>Grassroot<br>Total</th><th>Ecosystem<br>Total</th><th>District Total</th><th>Plan</th><th>% Achv</th>`;

  const tbody = $('#districtTbody');
  tbody.innerHTML = '';
  let lastTheme = null;
  data.indicators.forEach(ind => {
    if (ind.theme !== lastTheme) {
      lastTheme = ind.theme;
      const tr = document.createElement('tr');
      tr.className = 'theme-row';
      tr.innerHTML = `<td colspan="${6 + data.blocks.length}">${ind.theme}</td>`;
      tbody.appendChild(tr);
    }
    const pct = ind.district_plan ? Math.round((ind.district_achieved / ind.district_plan) * 1000) / 10 : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="code-col">${ind.code}</td>
      <td><div class="ind-text">${ind.text}</div></td>
      <td>${ind.period}</td>
      ${ind.blocks.map(b => `<td class="num-col col-${b.category.toLowerCase()}">${fmt(b.achieved)}</td>`).join('')}
      <td class="num-col">${fmt(ind.grassroot_achieved)}</td>
      <td class="num-col">${fmt(ind.ecosystem_achieved)}</td>
      <td class="num-col total-col">${fmt(ind.district_achieved)}</td>
      <td class="num-col">${fmt(ind.district_plan)}</td>
      <td class="num-col">${pctBadge(pct)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ========================================================= STATE REPORT ==
async function loadStateReport() {
  const theme = $('#stateTheme').value;
  const fy = $('#stateFY').value;
  const data = await api(`/api/consolidation/state?fy=${encodeURIComponent(fy)}`);

  const headRow = $('#stateHeadRow');
  headRow.innerHTML = `<th>Code</th><th>Theme / Indicator</th><th>Cum/Period</th>` +
    data.districts.map(d => `<th>${d}</th>`).join('') +
    `<th>State<br>Grassroot</th><th>State<br>Ecosystem</th><th>State Plan</th><th>State Achieved</th><th>% Achv</th>`;

  const tbody = $('#stateTbody');
  tbody.innerHTML = '';
  let lastTheme = null;
  data.indicators.forEach(ind => {
    if (theme && ind.theme !== theme) return;
    if (ind.theme !== lastTheme) {
      lastTheme = ind.theme;
      const tr = document.createElement('tr');
      tr.className = 'theme-row';
      tr.innerHTML = `<td colspan="${8 + data.districts.length}">${ind.theme}</td>`;
      tbody.appendChild(tr);
    }
    const pct = ind.state_plan ? Math.round((ind.state_achieved / ind.state_plan) * 1000) / 10 : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="code-col">${ind.code}</td>
      <td><div class="ind-text">${ind.text}</div></td>
      <td>${ind.period}</td>
      ${ind.by_district.map(d => `<td class="num-col">${fmt(d.achieved)}</td>`).join('')}
      <td class="num-col">${fmt(ind.state_grassroot_achieved)}</td>
      <td class="num-col">${fmt(ind.state_ecosystem_achieved)}</td>
      <td class="num-col">${fmt(ind.state_plan)}</td>
      <td class="num-col total-col">${fmt(ind.state_achieved)}</td>
      <td class="num-col">${pctBadge(pct)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filterTable(tbodyId, term) {
  term = term.trim().toLowerCase();
  const tbody = $(`#${tbodyId}`);
  let visibleThemeGroup = null;
  Array.from(tbody.children).forEach(tr => {
    if (tr.classList.contains('theme-row')) {
      tr.style.display = term ? 'none' : '';
      visibleThemeGroup = tr;
      return;
    }
    const match = !term || tr.textContent.toLowerCase().includes(term);
    tr.style.display = match ? '' : 'none';
    if (match && visibleThemeGroup) visibleThemeGroup.style.display = '';
  });
}

function fmt(n) {
  n = Number(n) || 0;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}
function pctBadge(pct) {
  let color = '#C0392B';
  if (pct >= 90) color = '#2E9E6B';
  else if (pct >= 50) color = '#E0A429';
  return `<span style="color:${color};font-weight:700">${pct}%</span>`;
}

// ============================================================ DASHBOARD ==
let charts = {};
async function loadDashboard() {
  const fy = $('#dashFY').value;
  const data = await api(`/api/dashboard?fy=${encodeURIComponent(fy)}`);
  const ge = data.grassroot_vs_ecosystem;

  $('#kpiRow').innerHTML = `
    <div class="kpi-card">
      <div class="label">Data Points Entered (FY ${fy})</div>
      <div class="value">${data.overall.entries_count.toLocaleString('en-IN')}</div>
      <div class="sub">across ${META.districts.length} districts</div>
    </div>
    <div class="kpi-card accent">
      <div class="label">State Achievement</div>
      <div class="value">${data.overall.pct}%</div>
      <div class="sub">${fmt(data.overall.achieved)} of ${fmt(data.overall.plan)} planned</div>
    </div>
    <div class="kpi-card">
      <div class="label">Grassroot Achievement</div>
      <div class="value" style="color:#2E9E6B">${ge.grassroot.pct}%</div>
      <div class="sub">${fmt(ge.grassroot.achieved)} of ${fmt(ge.grassroot.plan)} planned</div>
    </div>
    <div class="kpi-card">
      <div class="label">Ecosystem Achievement</div>
      <div class="value" style="color:#2456C4">${ge.ecosystem.pct}%</div>
      <div class="sub">${fmt(ge.ecosystem.achieved)} of ${fmt(ge.ecosystem.plan)} planned</div>
    </div>
    <div class="kpi-card amber">
      <div class="label">Top District</div>
      <div class="value" style="font-size:20px">${data.by_district[0]?.district || '—'}</div>
      <div class="sub">${data.by_district[0]?.pct ?? 0}% achieved</div>
    </div>
  `;

  renderChart('chartTheme', 'bar', {
    labels: data.by_theme.map(t => t.theme),
    datasets: [{ label: '% Achieved', data: data.by_theme.map(t => t.pct), backgroundColor: '#1F4E78' }]
  }, { indexAxis: 'y' });

  const topDist = data.by_district.slice(0, 15);
  renderChart('chartDistrict', 'bar', {
    labels: topDist.map(d => d.district),
    datasets: [{ label: '% Achieved', data: topDist.map(d => d.pct), backgroundColor: topDist.map(d => d.pct >= 90 ? '#2E9E6B' : d.pct >= 50 ? '#E0A429' : '#C0392B') }]
  });

  renderChart('chartQuarter', 'line', {
    labels: ['Q1 (Apr-Jun)', 'Q2 (Jul-Sep)', 'Q3 (Oct-Dec)', 'Q4 (Jan-Mar)'],
    datasets: [{
      label: `FY ${fy} progress`,
      data: [data.quarterly.q1, data.quarterly.q2, data.quarterly.q3, data.quarterly.q4],
      borderColor: '#2E9E6B', backgroundColor: 'rgba(46,158,107,0.15)', fill: true, tension: 0.35
    }]
  });

  const topPlan = [...data.by_district].sort((a, b) => b.plan - a.plan).slice(0, 10);
  renderChart('chartPlanAchv', 'bar', {
    labels: topPlan.map(d => d.district),
    datasets: [
      { label: 'Plan', data: topPlan.map(d => d.plan), backgroundColor: '#CBD5E1' },
      { label: 'Achieved', data: topPlan.map(d => d.achieved), backgroundColor: '#1F4E78' }
    ]
  });

  renderChart('chartCategory', 'bar', {
    labels: ['Grassroot', 'Ecosystem'],
    datasets: [{ label: '% Achieved', data: [ge.grassroot.pct, ge.ecosystem.pct], backgroundColor: ['#2E9E6B', '#2456C4'] }]
  });

  renderChart('chartCategoryPlanAchv', 'bar', {
    labels: ['Grassroot', 'Ecosystem'],
    datasets: [
      { label: 'Plan', data: [ge.grassroot.plan, ge.ecosystem.plan], backgroundColor: '#CBD5E1' },
      { label: 'Achieved', data: [ge.grassroot.achieved, ge.ecosystem.achieved], backgroundColor: ['#2E9E6B', '#2456C4'] }
    ]
  });

  window.DASHBOARD_DATA = data;
  renderHeatmap();
}

function renderChart(canvasId, type, data, extraOpts) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const ctx = document.getElementById(canvasId).getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type, data,
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: data.datasets.length > 1 } },
      scales: type !== 'pie' ? { y: { beginAtZero: true } } : undefined,
      ...extraOpts
    }
  });
}

function renderHeatmap() {
  const data = window.DASHBOARD_DATA;
  if (!data) return;
  const district = $('#heatDistrictSelect').value || META.districts[0];
  const blocks = META.blocks[district] || [];
  const heat = (data.block_heat && data.block_heat[district]) || {};
  const grid = $('#heatmapGrid');
  grid.innerHTML = '';
  blocks.forEach(b => {
    const v = heat[String(b.id)] || { plan: 0, achv: 0 };
    const pct = v.plan ? Math.round((v.achv / v.plan) * 100) : 0;
    let color = '#C0392B';
    if (pct >= 90) color = '#2E9E6B'; else if (pct >= 50) color = '#E0A429';
    const cell = document.createElement('div');
    cell.className = 'heat-cell';
    cell.style.background = color;
    cell.innerHTML = `<div class="pct">${pct}%</div><div class="name">${b.name}<span class="category-tag ${b.category.toLowerCase()}" style="background:rgba(255,255,255,0.85)">${b.category[0]}</span></div>`;
    grid.appendChild(cell);
  });
}

boot();
