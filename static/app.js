const state = { records: [], months: new Map(), currentMonth: '' };
const $ = (id) => document.getElementById(id);

function normalize(value) { return (value || '').normalize('NFKC').replace(/\s+/g, ''); }
function keyOf(headers, words) {
  const header = headers.find((h) => words.every((w) => normalize(h).includes(normalize(w))));
  if (!header) throw new Error(`必要な列が見つかりません: ${words.join('・')}`);
  return header;
}
function parseCSV(text) {
  const rows = [], row = []; let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && next === '\n') i++; row.push(cell); if (row.some(v => v !== '')) rows.push(row.splice(0)); else row.length = 0; cell = ''; }
    else cell += ch;
  }
  row.push(cell); if (row.some(v => v !== '')) rows.push(row);
  const headers = rows.shift().map(v => v.replace(/^\ufeff/, ''));
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] || ''])));
}
function parseDate(value) { const m = value.trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/); if (!m) throw new Error(`日付を解釈できません: ${value}`); return { year: +m[1], month: +m[2], day: +m[3] }; }
function minutes(value) { if (!value.trim()) return 0; const p = value.trim().split(':').map(Number); if (p.some(Number.isNaN)) throw new Error(`時間を解釈できません: ${value}`); return p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60 + p[1] + p[2] / 60; }
function recordMinutes(start, end, rest) { let m = minutes(end) - minutes(start) - minutes(rest); if (m < 0) m += 24 * 60; return m; }
function money(value) { return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(Math.round(value)); }
function hours(value) { return `${(value / 60).toFixed(2)} h`; }
function shortTime(value) { return (value || '').trim().replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1'); }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function loadText(name) { const response = await fetch(name); if (!response.ok) throw new Error(`${name}を読み込めません`); return response.text(); }
async function loadData(files) {
  const texts = files ? await Promise.all(files.map(file => file.text())) : await Promise.all(['/static/data/timecard.csv', '/static/data/member.csv', '/static/data/fee.csv'].map(loadText));
  const [timeText, memberText, feeText] = texts;
  const timeRows = parseCSV(timeText), memberRows = parseCSV(memberText), feeRows = parseCSV(feeText);
  const timeHeaders = Object.keys(timeRows[0] || {}), memberHeaders = Object.keys(memberRows[0] || {}), feeHeaders = Object.keys(feeRows[0] || {});
  const time = { name: keyOf(timeHeaders, ['名前']), date: keyOf(timeHeaders, ['出勤日']), start: keyOf(timeHeaders, ['開始時間']), end: keyOf(timeHeaders, ['終了時間']), rest: keyOf(timeHeaders, ['休憩時間']) };
  const memberName = keyOf(memberHeaders, ['名前']), memberRole = keyOf(memberHeaders, ['職種']);
  const feeRole = keyOf(feeHeaders, ['職種']), feeValue = keyOf(feeHeaders, ['時給']);
  const fees = Object.fromEntries(feeRows.map(r => [r[feeRole].trim(), Number((r[feeValue] || '').replace(/,/g, ''))]));
  const members = Object.fromEntries(memberRows.map(r => [normalize(r[memberName]), { displayName: r[memberName].trim(), role: r[memberRole].trim(), fee: fees[r[memberRole].trim()] || 0 }]));
  const records = timeRows.map((r, index) => { const d = parseDate(r[time.date]); const month = `${d.year}-${String(d.month).padStart(2, '0')}`; const name = r[time.name].trim(); const member = members[normalize(name)] || { displayName: name, role: '要確認', fee: 0 }; const restMins = r[time.rest].trim() ? minutes(r[time.rest]) : 0; const mins = recordMinutes(r[time.start], r[time.end], r[time.rest]); return { ...d, month, name, role: member.role, fee: member.fee, mins, restMins, pay: mins * member.fee / 60, start: r[time.start], end: r[time.end], place: r['出勤場所'] || '', row: index + 2 }; });
  state.records = records; state.months = new Map();
  records.forEach(r => { if (!state.months.has(r.month)) state.months.set(r.month, []); state.months.get(r.month).push(r); });
  const months = [...state.months.keys()].sort(); $('month-select').innerHTML = months.map(m => `<option value="${m}">${m.replace('-', '年')}月</option>`).join(''); $('month-select').disabled = false; state.currentMonth = months.at(-1) || ''; $('month-select').value = state.currentMonth; render(); renderMonthlyPayChart();
  const unmatched = records.filter(r => r.role === '要確認').map(r => r.name); const unique = [...new Set(unmatched)];
  $('status').textContent = `${records.length.toLocaleString()}件の勤務記録を読み込みました。${unique.length ? ` 要確認: ${unique.join('、')}` : ' 職種・時給の照合も完了しています。'}`; $('status').classList.toggle('error', unique.length > 0);
}
function renderMonthlyPayChart() {
  const monthly = [...state.months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, records]) => ({ month, pay: records.reduce((sum, record) => sum + record.pay, 0) }));
  const max = Math.max(...monthly.map(item => item.pay), 1);
  $('monthly-pay-chart').innerHTML = monthly.map(item => { const [year, month] = item.month.split('-'); const selected = item.month === state.currentMonth ? ' selected' : ''; return `<button class="pay-bar-item${selected}" data-month="${item.month}" title="${item.month}: ${money(item.pay)}"><span class="pay-bar-value">${money(item.pay)}</span><span class="pay-bar" style="height:${Math.max(item.pay / max * 125, 4)}px"></span><span class="pay-bar-label">${year}/${month}</span></button>`; }).join('') || '<span class="empty">データがありません</span>';
  document.querySelectorAll('.pay-bar-item').forEach(button => button.addEventListener('click', () => { state.currentMonth = button.dataset.month; $('month-select').value = state.currentMonth; render(); renderMonthlyPayChart(); }));
}
function render() {
  const month = state.currentMonth, records = state.months.get(month) || []; const [year, mon] = month.split('-').map(Number); const days = new Date(year, mon, 0).getDate();
  const dayMap = new Map(); records.forEach(r => { const key = r.day; if (!dayMap.has(key)) dayMap.set(key, []); dayMap.get(key).push(r); });
  const totalMins = records.reduce((s, r) => s + r.mins, 0), totalPay = records.reduce((s, r) => s + r.pay, 0), workDays = dayMap.size, names = new Set(records.map(r => normalize(r.name)));
  $('month-hours').textContent = hours(totalMins); $('month-pay').textContent = money(totalPay); $('work-days').textContent = `${workDays}日`; $('member-count').textContent = `${names.size}人`; $('record-count').textContent = `${records.length}件の記録`;
  const memberMapForDaily = new Map(); records.forEach(r => { const key = normalize(r.name); if (!memberMapForDaily.has(key)) memberMapForDaily.set(key, { key, name: r.name, role: r.role, records: new Map() }); const member = memberMapForDaily.get(key); if (!member.records.has(r.day)) member.records.set(r.day, []); member.records.get(r.day).push(r); });
  const dailyMembers = [...memberMapForDaily.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja')); const colors = ['#3478f6', '#ef8b3a', '#18a673', '#8062d6', '#df5d7d', '#159aa8', '#a27428', '#5d6bdc']; const colorByMember = Object.fromEntries(dailyMembers.map((m, i) => [m.key, colors[i % colors.length]]));
  $('member-legend').innerHTML = dailyMembers.map(m => `<span class="member-tag"><i style="background:${colorByMember[m.key]}"></i>${escapeHTML(m.name)} <small>${escapeHTML(m.role)}</small></span>`).join('') || '<span class="empty">この月の記録はありません</span>';
  $('daily-table').querySelector('thead').innerHTML = `<tr><th>日付</th><th>曜日</th>${dailyMembers.map(m => `<th style="border-top:3px solid ${colorByMember[m.key]}">${escapeHTML(m.name)}</th>`).join('')}<th>日合計</th><th>支給額</th></tr>`;
  const daily = []; for (let day = 1; day <= days; day++) { const list = dayMap.get(day) || []; const dt = new Date(year, mon - 1, day); const memberCells = dailyMembers.map(m => { const shifts = m.records.get(day) || []; return `<td class="daily-member-cell">${shifts.length ? shifts.map(r => `<span class="daily-shift"><span class="shift-time">${shortTime(r.start)}–${shortTime(r.end)}</span><small class="shift-hours">${hours(r.mins)}${r.restMins ? `<span class="rest-hours"> (${(r.restMins / 60).toFixed(1)}h)</span>` : ''}</small></span>`).join('') : '<span class="empty">—</span>'}</td>`; }).join(''); daily.push(`<tr><td class="date">${mon}/${day}</td><td class="weekday">${'日月火水木金土'[dt.getDay()]}</td>${memberCells}<td class="hours">${list.length ? hours(list.reduce((s, r) => s + r.mins, 0)) : '—'}</td><td class="amount">${list.length ? money(list.reduce((s, r) => s + r.pay, 0)) : '—'}</td></tr>`); } $('daily-table').querySelector('tbody').innerHTML = daily.join('');
  const memberMap = new Map(); records.forEach(r => { const k = normalize(r.name); if (!memberMap.has(k)) memberMap.set(k, { name: r.name, days: {}, total: 0 }); const item = memberMap.get(k); item.days[r.day] = (item.days[r.day] || 0) + r.mins; item.total += r.mins; });
  const dayHeaders = Array.from({ length: days }, (_, i) => `<th>${i + 1}</th>`).join(''); $('member-table').querySelector('thead').innerHTML = `<tr><th>メンバー</th>${dayHeaders}<th>合計</th></tr>`; const rows = [...memberMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(item => `<tr><td><strong>${escapeHTML(item.name)}</strong></td>${Array.from({ length: days }, (_, i) => { const value = item.days[i + 1] || 0; return `<td class="matrix-cell ${value ? '' : 'zero'}">${value ? (value / 60).toFixed(2) : '·'}</td>`; }).join('')}<td>${(item.total / 60).toFixed(2)}</td></tr>`); $('member-table').querySelector('tbody').innerHTML = rows.join('');
}
$('month-select').addEventListener('change', (event) => { state.currentMonth = event.target.value; render(); renderMonthlyPayChart(); });
$('csv-input').addEventListener('change', async (event) => { try { const files = [...event.target.files]; if (files.length !== 3 || !files.some(f => f.name === 'timecard.csv') || !files.some(f => f.name === 'member.csv') || !files.some(f => f.name === 'fee.csv')) throw new Error('timecard.csv、member.csv、fee.csvの3ファイルを選択してください'); await loadData(files.sort((a, b) => ['timecard.csv', 'member.csv', 'fee.csv'].indexOf(a.name) - ['timecard.csv', 'member.csv', 'fee.csv'].indexOf(b.name))); } catch (error) { $('status').textContent = `読み込みエラー: ${error.message}`; $('status').classList.add('error'); } });
async function initAuth() { const response = await fetch('/api/me'); if (!response.ok) { location.href = '/auth.html'; return; } const user = await response.json(); if (user.admin) $('admin-link').classList.remove('hidden'); loadData().catch(error => { $('status').textContent = `CSVを読み込めません。 (${error.message})`; $('status').classList.add('error'); }); }
initAuth().catch(() => { location.href = '/auth.html'; });
