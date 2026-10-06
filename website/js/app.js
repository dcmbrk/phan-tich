// ThesisHub – phần lõi: lưu trữ dữ liệu, phiên đăng nhập, điều hướng, khung giao diện.
const STORE_KEY = 'thesishub-db-v1';
const SESSION_KEY = 'thesishub-session';
const SESSION_TIMEOUT = 30 * 60 * 1000; // UC1.1 BR3
const LOCK_MINUTES = 15;                // UC1.1 E2
const EMAIL_RE = /^[a-z0-9._-]+@(st\.)?phenikaa-uni\.edu\.vn$/i; // UC1.1 BR1
const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;            // UC1.1 BR2

let DB;
let SESSION = null;
const VIEWS = {};   // các màn hình được đăng ký trong views-*.js
const A = {};       // các thao tác gọi từ giao diện (onclick)
const UI = {};      // trạng thái tạm của màn hình (lựa chọn, bộ lọc)

/* ================= Tiện ích ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
const pad = n => String(n).padStart(2, '0');
const nowISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const todayISO = () => nowISO().slice(0, 10);
const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const fmtDT = iso => iso ? `${fmtDate(iso)} ${iso.slice(11, 16)}` : '';
const fmtShort = iso => { if (!iso) return ''; const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}`; };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const round1 = x => Math.round(x * 10) / 10;
const fmtScore = x => x == null || isNaN(x) ? '–' : x.toFixed(1).replace('.', ',');
const initials = name => name.replace(/^(PGS\.TS\.|TS\.|ThS\.|GS\.)\s*/, '').split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
const badge = (text, cls) => `<span class="badge ${cls || ''}">${esc(text)}</span>`;
const STATUS_CLS = {
  'Đạt': 'green', 'Đã duyệt': 'green', 'Chấp nhận': 'green', 'Hoạt động': 'green', 'Đang diễn ra': 'blue', 'Đủ điều kiện': 'green', 'Đã công bố': 'green', 'Đã lưu trữ': 'green', 'Đã gửi': 'green',
  'Chờ duyệt': 'blue', 'Chờ xét': 'blue', 'Chờ đánh giá': 'blue', 'Chờ xác nhận': 'blue', 'Đang chấm': 'blue',
  'Cần bổ sung': 'orange', 'Yêu cầu sửa': 'orange', 'Tạm khóa': 'orange', 'Nộp muộn': 'orange',
  'Chậm tiến độ': 'red', 'Từ chối': 'red', 'Khóa': 'red', 'Không đạt': 'red', 'Không đủ điều kiện': 'red', 'Hết chỗ': 'grey',
};
const sbadge = s => badge(s, STATUS_CLS[s] || 'grey');

function similarity(a, b) { // độ tương đồng tên đề tài (hệ số Dice trên các cặp từ)
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const bigrams = w => { const out = []; for (let i = 0; i < w.length - 1; i++) out.push(w[i] + ' ' + w[i + 1]); return out.length ? out : w; };
  const x = bigrams(norm(a)), y = bigrams(norm(b));
  const ys = [...y]; let hit = 0;
  x.forEach(g => { const i = ys.indexOf(g); if (i >= 0) { hit++; ys.splice(i, 1); } });
  return (2 * hit) / (x.length + y.length || 1);
}

/* ================= Máy chủ (REST API) ================= */
async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* phản hồi rỗng */ }
  if (res.status === 401 && SESSION) {
    SESSION = null; DB = null; SNAP = null; closeModal();
    location.hash = '#/login'; render();
    toast(data.error || 'Phiên làm việc đã hết hạn.', 'warn');
  }
  if (!res.ok) throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
  return data;
}
const clone = o => JSON.parse(JSON.stringify(o));
const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
let SNAP = null; // bản dữ liệu nhận từ máy chủ lần gần nhất, dùng để tìm thay đổi

async function refresh() { // tải lại toàn bộ dữ liệu của đợt hiện hành từ máy chủ
  DB = await api('GET', '/api/state');
  SNAP = clone(DB);
  render();
}

// Các tập dữ liệu được đồng bộ và khóa nhận diện từng bản ghi (thứ tự: bảng cha trước bảng con)
const COLLECTIONS = {
  periods: x => x.id, lecturers: x => x.uid, topics: x => x.id, students: x => x.code, requests: x => x.id,
  plans: x => x.code, reports: x => x.id, theses: x => x.code, councils: x => x.id, defenses: x => x.code,
  reviews: x => x.code, scores: x => x.code + '|' + x.uid, archive: x => x.id, notifications: x => x.id,
};
const metaRows = d => [{ k: 'currentPeriod', v: d.currentPeriod }, { k: 'assignLocked', v: d.assignLocked },
  ...Object.entries(d.published).map(([c, v]) => ({ k: 'published:' + c, v }))];
function diffOps(before, after) {
  const puts = [], dels = [];
  for (const [c, key] of Object.entries({ ...COLLECTIONS, meta: x => x.k })) {
    const old = new Map((c === 'meta' ? metaRows(before) : before[c]).map(x => [key(x), x]));
    const seen = new Set();
    (c === 'meta' ? metaRows(after) : after[c]).forEach(x => {
      const k = key(x); seen.add(k);
      if (!old.has(k) || JSON.stringify(old.get(k)) !== JSON.stringify(x)) puts.push({ c, op: 'put', key: k, item: x });
    });
    old.forEach((x, k) => { if (!seen.has(k)) dels.unshift({ c, op: 'del', key: k }); }); // xóa bảng con trước
  }
  return [...dels, ...puts];
}
let syncQueue = Promise.resolve();
function save() { // gửi các thay đổi lên máy chủ (một giao dịch), sau đó tải lại dữ liệu mới nhất
  if (!SNAP) return;
  const ops = diffOps(SNAP, DB);
  if (!ops.length) return;
  SNAP = clone(DB);
  syncQueue = syncQueue
    .then(() => api('POST', '/api/sync', { ops }))
    .then(() => refresh())
    .catch(err => { toast('Không lưu được: ' + err.message, 'err'); return refresh().catch(() => {}); });
}

/* ================= Truy vấn dữ liệu ================= */
const user = id => DB.users.find(u => u.id === id);
const uname = id => (user(id) || {}).name || '–';
const student = code => DB.students.find(s => s.code === code);
const studentOfUser = uid => DB.students.find(s => s.uid === uid);
const topic = id => DB.topics.find(t => t.id === id);
const lecturer = uid => DB.lecturers.find(l => l.uid === uid);
const period = (id = DB.currentPeriod) => DB.periods.find(p => p.id === id);
const planOf = code => DB.plans.find(p => p.code === code);
const thesisOf = code => DB.theses.find(t => t.code === code);
const defenseOf = code => DB.defenses.find(d => d.code === code);
const council = id => DB.councils.find(c => c.id === id);
const reviewOf = code => DB.reviews.find(r => r.code === code);
const scoreOf = (code, uid) => DB.scores.find(s => s.code === code && s.uid === uid);
const scoreTotal = s => round1(s.c.reduce((a, b) => a + b, 0));
const supervisedCount = uid => DB.students.filter(s => s.gvhd === uid).length;
const topicTaken = t => DB.students.filter(s => s.topicId === t.id).length + (t.reserved || 0);
const quotaLeft = uid => { const l = lecturer(uid); return l ? l.quota - supervisedCount(uid) : 0; };
const isPublished = code => { const d = defenseOf(code); return !!(d && DB.published[d.council]); };

function notify(to, text) {
  DB.notifications.unshift({ id: newId(), to, text, time: nowISO(), read: false });
}

function latestReports(code) { // báo cáo mới nhất của từng mốc
  const map = {};
  DB.reports.filter(r => r.code === code).forEach(r => { if (!map[r.m] || map[r.m].date < r.date) map[r.m] = r; });
  return map;
}

function progressOf(code) { // UC3.4 BR2
  const s = student(code);
  const plan = planOf(code);
  const total = plan ? plan.milestones.length : MILESTONE_TITLES.length;
  if (!s || !s.gvhd) return { label: 'Chưa có GVHD', cls: 'grey', pct: 0, cur: 0, total };
  const latest = Object.values(latestReports(code));
  const dat = latest.filter(r => r.status === 'Đạt').length;
  const slow = latest.filter(r => r.status === 'Chậm tiến độ').length;
  const cur = latest.length ? Math.max(...latest.map(r => r.m)) + 1 : 0;
  const last = latest.sort((a, b) => a.m - b.m)[latest.length - 1];
  let label = 'Đạt', cls = 'green';
  if (slow >= 2) { label = 'Chậm tiến độ'; cls = 'red'; }
  else if (last && last.status === 'Cần bổ sung') { label = 'Cần bổ sung'; cls = 'orange'; }
  else if (!latest.length) { label = 'Chưa nộp'; cls = 'grey'; }
  else if (last.status === 'Chờ đánh giá') { label = 'Chờ đánh giá'; cls = 'blue'; }
  return { label, cls, pct: Math.round(dat / total * 100), cur, total };
}

function resultOf(code) { // UC5.2 BR1, BR2
  const d = defenseOf(code);
  if (!d) return null;
  const c = council(d.council);
  const th = thesisOf(code);
  const rv = reviewOf(code);
  const w = period().weights;
  const missing = [];
  const gv = th && th.confirm && th.confirm.ok ? th.confirm.score : null;
  if (gv == null) missing.push('GVHD');
  if (!rv) missing.push('Phản biện');
  const members = c.members.map(m => { const s = scoreOf(code, m.uid); if (!s) missing.push(uname(m.uid)); return { ...m, score: s ? scoreTotal(s) : null }; });
  const done = members.filter(m => m.score != null);
  const hd = done.length ? round1(done.reduce((a, m) => a + m.score, 0) / done.length) : null;
  let final = null, pass = null;
  if (!missing.length) {
    final = round1(gv * w.gv / 100 + rv.score * w.pb / 100 + hd * w.hd / 100);
    pass = final >= 5 && members.every(m => m.score >= 4);
  }
  return { council: c, gv, pb: rv ? rv.score : null, hd, members, missing, final, pass, published: !!DB.published[d.council] };
}

function currentPhase() {
  const t = todayISO();
  const ph = period().phases;
  let idx = ph.findIndex(p => t >= p[1] && t <= p[2]);
  if (idx < 0) idx = t < ph[0][1] ? 0 : ph.findIndex(p => t < p[1]);
  return idx < 0 ? ph.length - 1 : idx;
}

/* ================= Hộp thoại & thông báo ================= */
function toast(msg, type = '') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}
function openModal({ title, body, footer = '', wide = false }) {
  closeModal();
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mh"><h2>${esc(title)}</h2><button aria-label="Đóng" onclick="closeModal()">×</button></div>
    <div class="mb">${body}</div>${footer ? `<div class="mf">${footer}</div>` : ''}</div>`;
  bg.addEventListener('mousedown', e => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  const first = bg.querySelector('input:not([type=radio]):not([type=checkbox]), textarea, select');
  if (first) first.focus();
}
function closeModal() { $$('.modal-bg').forEach(m => m.remove()); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('.notif-pop')?.remove(); } });

function clearErrs(scope = document) {
  $$('.invalid', scope).forEach(e => e.classList.remove('invalid'));
  $$('.err', scope).forEach(e => e.remove());
}
function fieldErr(id, msg) {
  const el = document.getElementById(id); if (!el) return;
  el.classList.add('invalid');
  const box = el.closest('.field') || el.parentElement;
  const d = document.createElement('div'); d.className = 'err'; d.textContent = msg; box.appendChild(d);
}
const fileInfo = id => { const f = document.getElementById(id)?.files?.[0]; return f ? { name: f.name, size: round1(f.size / 1048576) } : null; };

/* ================= Phiên đăng nhập (UC1.1) ================= */
let BOOT = {};
function logout(silent) {
  api('POST', '/api/logout').catch(() => {});
  SESSION = null; DB = null; SNAP = null;
  location.hash = '#/login';
  render();
  if (!silent) toast('Đã đăng xuất.');
}
A.logout = () => logout();
setInterval(() => {
  if (SESSION && Date.now() - SESSION.last > SESSION_TIMEOUT) { logout(true); toast('Phiên làm việc đã hết hạn sau 30 phút không thao tác.', 'warn'); }
}, 30000);
['click', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (SESSION) SESSION.last = Date.now(); }));
window.addEventListener('focus', () => { if (SESSION && DB) refresh().catch(() => {}); });

const me = () => SESSION && user(SESSION.uid);
const role = () => SESSION && SESSION.role;

function renderLogin() {
  return `<div class="login-page">
    <form class="login-card" onsubmit="A.login(event)" novalidate>
      <div class="logo-box">TH</div>
      <div class="brand">ThesisHub</div>
      <div class="sub">Hệ thống quản lý đồ án tốt nghiệp – Trường CNTT Phenikaa</div>
      <div id="login-msg"></div>
      <div class="field"><label for="lg-email">Email trường *</label>
        <input id="lg-email" type="email" autocomplete="username" placeholder="ten@phenikaa-uni.edu.vn"></div>
      <div class="field"><label for="lg-pw">Mật khẩu *</label>
        <input id="lg-pw" type="password" autocomplete="current-password"></div>
      <div class="login-row">
        <label class="check"><input id="lg-remember" type="checkbox"> Ghi nhớ đăng nhập</label>
        <a href="#" onclick="A.forgot(event)">Quên mật khẩu?</a>
      </div>
      <button class="btn primary block" type="submit">Đăng nhập</button>
      <p class="center muted small"><i>Dùng tài khoản email do nhà trường cấp để đăng nhập.</i></p>
    </form>
    ${(BOOT.demo || []).length ? `<div class="demo-card">
      <h3>Đăng nhập nhanh</h3>
      <div class="small">Tài khoản dùng thử, mỗi vai trò một tài khoản. Bấm để đăng nhập ngay.</div>
      ${BOOT.demo.map((d, i) => `<button type="button" onclick="A.quickLogin(${i})"><b>${ROLE_NAMES[d.role]}</b> – ${esc(d.name)}<br><code>${esc(d.email)}</code></button>`).join('')}
      <div class="small muted" style="margin-top:6px">Mật khẩu chung: <code>${esc(BOOT.demo[0].password)}</code>.
        Giảng viên, TBM và sinh viên cần được giáo vụ thêm vào đợt thì mới dùng được các chức năng.</div>
    </div>` : ''}
    ${BOOT.fresh ? `<div class="demo-card">
      <h3>Khởi tạo hệ thống</h3>
      <div class="small">Cơ sở dữ liệu đang trống. Đăng nhập bằng tài khoản quản trị ban đầu (sẽ được yêu cầu đổi mật khẩu):</div>
      <button type="button" onclick="A.fillDemo()"><b>Quản trị viên</b><br><code>${esc(BOOT.adminEmail)}</code> / <code>${esc(BOOT.adminPassword)}</code></button>
      <div class="small" style="margin-top:8px"><b>Thứ tự nhập dữ liệu:</b><ol style="margin:4px 0;padding-left:18px">
        <li>Quản trị viên tạo tài khoản giáo vụ, trưởng bộ môn, giảng viên.</li>
        <li>Giáo vụ tạo đợt đồ án, thêm giảng viên và sinh viên vào đợt (tài khoản sinh viên được tạo tự động).</li>
        <li>Giảng viên đề xuất đề tài → TBM duyệt → sinh viên đăng ký…</li></ol>
        Mật khẩu tạm của tài khoản mới: <code>${DEFAULT_PASSWORD}</code></div>
    </div>` : ''}
  </div>`;
}
A.quickLogin = i => {
  const d = BOOT.demo[i];
  $('#lg-email').value = d.email; $('#lg-pw').value = d.password;
  QUICK_ROLE = d.role;
  A.login({ preventDefault() {} });
};
let QUICK_ROLE = null; // vai trò chọn sẵn khi đăng nhập nhanh tài khoản nhiều vai trò
A.fillDemo = () => { $('#lg-email').value = BOOT.adminEmail; $('#lg-pw').value = BOOT.adminPassword; $('#lg-pw').focus(); };

A.login = async e => {
  e.preventDefault();
  clearErrs();
  const quick = QUICK_ROLE; QUICK_ROLE = null;
  const email = val('lg-email').toLowerCase(), pw = $('#lg-pw').value;
  const msg = (t, cls = 'err') => { $('#login-msg').innerHTML = `<div class="alert ${cls}">${esc(t)}</div>`; };
  let bad = false;
  if (!email) { fieldErr('lg-email', 'Vui lòng nhập email.'); bad = true; }
  else if (!EMAIL_RE.test(email)) { fieldErr('lg-email', 'Email phải thuộc tên miền @phenikaa-uni.edu.vn hoặc @st.phenikaa-uni.edu.vn.'); bad = true; }
  if (!pw) { fieldErr('lg-pw', 'Vui lòng nhập mật khẩu.'); bad = true; }
  if (bad) return;
  let r;
  try { r = await api('POST', '/api/login', { email, password: pw, remember: val('lg-remember') }); }
  catch (err) { msg(err.message); return; }
  const u = r.user;
  const finish = async role => {
    try {
      await api('POST', '/api/role', { role });
      SESSION = { uid: u.id, role, last: Date.now() };
      BOOT.fresh = false;
      history.replaceState(null, '', '#/home');
      await refresh();
    } catch (err) { msg(err.message); }
  };
  const afterPw = () => (quick && u.roles.includes(quick) ? finish(quick) : u.roles.length > 1 ? chooseRole(u, finish) : finish(u.roles[0]));
  if (r.mustChangePw) changePwModal(u, true, afterPw); // UC1.1 A2
  else afterPw();
};

function chooseRole(u, cb) {
  openModal({
    title: 'Chọn vai trò làm việc',
    body: `<p>Tài khoản <b>${esc(u.name)}</b> có nhiều vai trò. Chọn vai trò cho phiên làm việc này:</p>
      ${u.roles.map((r, i) => `<label class="check" style="margin:8px 0"><input type="radio" name="pick-role" value="${r}" ${i === u.roles.length - 1 ? 'checked' : ''}> ${ROLE_NAMES[r]}</label>`).join('')}`,
    footer: `<button class="btn primary" id="role-ok">Tiếp tục</button>`,
  });
  $('#role-ok').onclick = () => { const r = $('input[name=pick-role]:checked').value; closeModal(); cb(r); };
}

function changePwModal(u, forced, cb) {
  openModal({
    title: forced ? 'Đổi mật khẩu lần đầu' : 'Đổi mật khẩu',
    body: `${forced ? '<div class="alert warn">Tài khoản đang dùng mật khẩu mặc định. Vui lòng đặt mật khẩu mới trước khi tiếp tục.</div>' : ''}
      ${forced ? '' : '<div class="field"><label for="pw-old">Mật khẩu hiện tại *</label><input id="pw-old" type="password"></div>'}
      <div class="field"><label for="pw-new">Mật khẩu mới *</label><input id="pw-new" type="password"><div class="hint">Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số.</div></div>
      <div class="field"><label for="pw-new2">Nhập lại mật khẩu mới *</label><input id="pw-new2" type="password"></div>`,
    footer: `<button class="btn primary" id="pw-ok">Lưu mật khẩu</button>`,
  });
  $('#pw-ok').onclick = async () => {
    clearErrs($('.modal'));
    const p1 = $('#pw-new').value, p2 = $('#pw-new2').value;
    if (!PW_RE.test(p1)) return fieldErr('pw-new', 'Mật khẩu chưa đủ mạnh.');
    if (p1 !== p2) return fieldErr('pw-new2', 'Hai mật khẩu không khớp.');
    try { await api('POST', '/api/change-password', { old: forced ? '' : $('#pw-old').value, new: p1 }); }
    catch (err) { return fieldErr(forced ? 'pw-new' : 'pw-old', err.message); }
    closeModal(); toast('Đã cập nhật mật khẩu.', 'ok');
    cb && cb();
  };
}
A.changePw = () => changePwModal(me(), false, () => refresh());

A.forgot = e => {
  e.preventDefault();
  openModal({
    title: 'Quên mật khẩu',
    body: `<p>Nhập email trường, hệ thống sẽ gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút).</p>
      <div class="field"><label for="fg-email">Email trường *</label><input id="fg-email" type="email" value="${esc(val('lg-email'))}"></div>
      <div id="fg-out"></div>`,
    footer: `<button class="btn primary" id="fg-send">Gửi liên kết</button><button class="btn" onclick="closeModal()">Đóng</button>`,
  });
  $('#fg-send').onclick = async () => {
    clearErrs($('.modal'));
    const email = val('fg-email').toLowerCase();
    if (!EMAIL_RE.test(email)) return fieldErr('fg-email', 'Email không hợp lệ hoặc không thuộc tên miền của trường.');
    try { await api('POST', '/api/forgot', { email }); }
    catch (err) { return fieldErr('fg-email', err.message); }
    $('#fg-send').disabled = true;
    $('#fg-out').innerHTML = `<div class="alert ok">Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.
      <br><span class="small">(Bản chạy cục bộ chưa nối dịch vụ email: liên kết được in ra cửa sổ đang chạy <code>server.py</code>.)</span></div>`;
  };
};

function renderReset(token) {
  return `<div class="login-page"><form class="login-card" onsubmit="A.doReset(event,'${esc(token)}')" novalidate>
    <div class="logo-box">TH</div><div class="brand">Đặt lại mật khẩu</div><div class="sub">Nhập mật khẩu mới cho tài khoản của bạn</div>
    <div id="login-msg"></div>
    <div class="field"><label for="pw-new">Mật khẩu mới *</label><input id="pw-new" type="password"><div class="hint">Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số.</div></div>
    <div class="field"><label for="pw-new2">Nhập lại mật khẩu *</label><input id="pw-new2" type="password"></div>
    <button class="btn primary block" type="submit">Đặt lại mật khẩu</button>
    <p class="center small"><a href="#/login">Quay lại đăng nhập</a></p></form></div>`;
}
A.doReset = async (e, token) => {
  e.preventDefault(); clearErrs();
  const p1 = $('#pw-new').value, p2 = $('#pw-new2').value;
  if (!PW_RE.test(p1)) return fieldErr('pw-new', 'Mật khẩu chưa đủ mạnh.');
  if (p1 !== p2) return fieldErr('pw-new2', 'Hai mật khẩu không khớp.');
  try { await api('POST', '/api/reset', { token, password: p1 }); }
  catch (err) { $('#login-msg').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; return; }
  location.hash = '#/login'; toast('Đặt lại mật khẩu thành công. Vui lòng đăng nhập.', 'ok');
};

/* ================= Điều hướng & khung giao diện ================= */
const MENUS = {
  QTV: [['home', 'Trang chủ'], ['accounts', 'Tài khoản người dùng'], ['loginlog', 'Nhật ký đăng nhập']],
  GVU: [['home', 'Trang chủ'], ['periods', 'Đợt đồ án'], ['students', 'Sinh viên'], ['lecturers', 'Giảng viên & hạn mức'], ['approve', 'Duyệt đề tài của TBM'],
    ['progress', 'Theo dõi tiến độ'], ['councils', 'Hội đồng bảo vệ'], ['schedule', 'Phản biện & lịch'], ['results', 'Tổng hợp kết quả'],
    ['archive', 'Lưu trữ đồ án'], ['stats', 'Thống kê']],
  TBM: [['home', 'Trang chủ'], ['approve', 'Duyệt đề tài'], ['assign', 'Phân công GVHD'], ['progress', 'Theo dõi tiến độ'], ['stats', 'Thống kê'],
    '|Chức năng giảng viên', ['my-topics', 'Đề tài của tôi'], ['requests', 'Yêu cầu hướng dẫn'], ['supervise', 'Sinh viên hướng dẫn'],
    ['review', 'Phản biện'], ['grading', 'Chấm điểm']],
  GV: [['home', 'Trang chủ'], ['my-topics', 'Đề tài của tôi'], ['requests', 'Yêu cầu hướng dẫn'], ['supervise', 'Sinh viên hướng dẫn'],
    ['review', 'Phản biện'], ['grading', 'Chấm điểm'], ['library', 'Kho đồ án']],
  SV: [['home', 'Trang chủ'], ['register', 'Đăng ký đề tài'], ['my-thesis', 'Đồ án của tôi'], ['plan', 'Kế hoạch'], ['reports', 'Báo cáo tiến độ'],
    ['submit', 'Nộp quyển'], ['defense', 'Lịch bảo vệ'], ['result', 'Kết quả'], ['library', 'Kho đồ án']],
};
const allowed = r => MENUS[role()].some(m => Array.isArray(m) && m[0] === r);

function go(route) { location.hash = '#/' + route; if (currentRoute() === route) render(); }
function currentRoute() { return (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0]; }
window.addEventListener('hashchange', () => { render(); if (SESSION && DB) refresh().catch(() => {}); }); // luôn lấy dữ liệu mới khi chuyển trang

function render() {
  const app = $('#app');
  if (location.protocol === 'file:') {
    app.innerHTML = `<div class="login-page"><div class="login-card"><div class="logo-box">TH</div><div class="brand">ThesisHub</div>
      <div class="alert warn" style="margin-top:16px">Trang web cần chạy qua máy chủ. Mở cửa sổ dòng lệnh tại thư mục <code>website</code>, chạy
      <code>python3 server.py</code> rồi truy cập <a href="http://localhost:8000">http://localhost:8000</a>.</div></div></div>`;
    return;
  }
  if (!SESSION) {
    const r0 = currentRoute();
    if (r0.startsWith('reset/')) { app.innerHTML = renderReset(r0.slice(6)); document.title = 'Đặt lại mật khẩu – ThesisHub'; return; }
    if (r0 !== 'login') history.replaceState(null, '', '#/login');
    app.innerHTML = renderLogin();
    document.title = 'Đăng nhập – ThesisHub';
    return;
  }
  if (!DB) { app.innerHTML = '<div class="login-page"><p class="muted">Đang tải dữ liệu…</p></div>'; return; }
  let route = currentRoute();
  if (route === 'login' || !VIEWS[route] || !allowed(route)) { route = 'home'; history.replaceState(null, '', '#/home'); }
  const u = me(), r = role();
  const view = VIEWS[route];
  const unread = DB.notifications.filter(n => n.to === u.id && !n.read).length;
  const sv = r === 'SV' ? studentOfUser(u.id) : null;
  let content;
  const noPeriod = !period() && r !== 'QTV' && route !== 'periods' && route !== 'library';
  const notInPeriod = (r === 'SV' && !sv) || ((r === 'GV' || r === 'TBM') && !lecturer(u.id) && route !== 'home' && route !== 'library');
  try {
    if (noPeriod) content = page(r === 'GVU' ? 'Chưa có đợt đồ án' : view.title, '', r === 'GVU'
      ? '<div class="alert warn">Chưa có đợt đồ án hiện hành. Hãy tạo đợt đồ án đầu tiên để bắt đầu. <a href="#/periods">Tạo đợt đồ án →</a></div>'
      : '<div class="alert">Hệ thống chưa mở đợt đồ án nào. Vui lòng chờ giáo vụ khoa tạo đợt.</div>');
    else if (notInPeriod) content = page(view.title, '', `<div class="alert warn">Bạn chưa được thêm vào đợt đồ án ${esc(DB.currentPeriod)}. Vui lòng liên hệ giáo vụ khoa.</div>`);
    else content = view.render();
  } catch (err) { console.error(err); content = `<div class="alert err">Lỗi hiển thị: ${esc(err.message)}</div>`; }
  app.innerHTML = `
    <header class="topbar">
      <button class="menu-btn" aria-label="Mở menu" onclick="document.querySelector('.sidebar').classList.toggle('open')">☰</button>
      <span class="brand">ThesisHub</span><span class="tag">Quản lý đồ án tốt nghiệp</span>
      <span class="spacer"></span>
      ${u.roles.length > 1 ? `<select class="role-switch" aria-label="Đổi vai trò" onchange="A.switchRole(this.value)">${u.roles.map(x => `<option value="${x}" ${x === r ? 'selected' : ''}>${ROLE_NAMES[x]}</option>`).join('')}</select>` : ''}
      <div class="user-chip"><div class="avatar">${esc(initials(u.name))}</div>
        <div class="txt"><div class="name">${esc(u.name)}</div><div class="role">${ROLE_NAMES[r]}${sv ? ' – ' + sv.code : ''}</div></div></div>
      <button class="bell" title="Thông báo" aria-label="Thông báo" onclick="A.toggleNotif()">🔔${unread ? `<span class="dot">${unread}</span>` : ''}</button>
    </header>
    <div class="layout">
      <nav class="sidebar">
        ${MENUS[r].map(m => typeof m === 'string' ? `<div class="group">${esc(m.slice(1))}</div>`
          : `<a href="#/${m[0]}" class="${m[0] === route ? 'active' : ''}">${esc(m[1])}</a>`).join('')}
        <div class="bottom">
          <a href="#" onclick="A.changePw();return false">🔑 Đổi mật khẩu</a>
          <a href="#" onclick="A.logout();return false">↩ Đăng xuất</a>
        </div>
      </nav>
      <main class="main">${content}</main>
    </div>`;
  document.title = (view.title || 'Trang chủ') + ' – ThesisHub';
  view.after && view.after();
}

A.switchRole = async r => {
  try { await api('POST', '/api/role', { role: r }); } catch (err) { toast(err.message, 'err'); return; }
  SESSION.role = r; history.replaceState(null, '', '#/home'); await refresh();
  toast('Đang làm việc với vai trò ' + ROLE_NAMES[r] + '.');
};
A.toggleNotif = () => {
  const old = $('.notif-pop'); if (old) { old.remove(); return; }
  const u = me();
  const list = DB.notifications.filter(n => n.to === u.id);
  const pop = document.createElement('div'); pop.className = 'notif-pop';
  pop.innerHTML = `<div class="ph"><span>Thông báo</span><a href="#" onclick="A.readAll();return false">Đánh dấu đã đọc</a></div>
    <ul class="notif">${list.length ? list.slice(0, 30).map(n => `<li class="${n.read ? '' : 'unread'}"><div><div class="tx">${esc(n.text)}</div><div class="tm">${fmtDT(n.time)}</div></div></li>`).join('') : '<li>Chưa có thông báo.</li>'}</ul>`;
  $('.topbar').appendChild(pop);
};
A.readAll = () => { DB.notifications.forEach(n => { if (n.to === me().id) n.read = true; }); save(); render(); };

/* Khung trang chung */
function page(title, sub, body) {
  return `<h1>${esc(title)}</h1>${sub ? `<div class="page-sub">${sub}</div>` : ''}${body}`;
}
function table(headers, rows, emptyText = 'Không có dữ liệu.') {
  return `<div class="table-wrap"><table class="data"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty">${esc(emptyText)}</td></tr>`}</tbody></table></div>`;
}
function phaseTimeline() {
  const ph = period().phases, cur = currentPhase();
  return `<div class="timeline">${ph.map((p, i) => `<div class="step ${i < cur ? 'done' : i === cur ? 'now' : ''}">
    <div class="dot"></div><div class="t">${esc(p[0])}</div><div class="d">${fmtShort(p[1])}${p[1] !== p[2] ? ' - ' + fmtShort(p[2]) : ''}</div></div>`).join('')}</div>`;
}
function notifPanel(limit = 5) {
  const list = DB.notifications.filter(n => n.to === me().id).slice(0, limit);
  return `<div class="panel"><div class="ph"><h2>Thông báo mới</h2></div><div class="pb"><ul class="notif">
    ${list.length ? list.map(n => `<li class="${n.read ? '' : 'unread'}"><div><div class="tx">${esc(n.text)}</div><div class="tm">${fmtDT(n.time)}</div></div></li>`).join('') : '<li>Chưa có thông báo.</li>'}
    </ul></div></div>`;
}
function exportCSV(filename, rows) {
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* Trang chủ theo vai trò */
VIEWS.home = { title: 'Trang chủ', render: () => (HOME[role()] || (() => ''))() };
const HOME = {};

document.addEventListener('DOMContentLoaded', async () => {
  if (location.protocol === 'file:') return render();
  try { BOOT = await api('GET', '/api/bootstrap'); } catch (e) { BOOT = {}; }
  try {
    const r = await api('GET', '/api/me');
    SESSION = { uid: r.user.id, role: r.role, last: Date.now() };
    await refresh();
  } catch (e) { SESSION = null; render(); }
});
