// Màn hình của quản trị viên và giáo vụ khoa: UC1.2–UC1.5, UC3.4, UC4.3, UC4.4, UC5.2, UC5.4, UC5.5.
const DEGREE_QUOTA = { ThS: 5, TS: 8, 'PGS.TS': 10, 'GS.TS': 10 }; // UC1.5 BR1
const accStatus = u => u.status === 'Khóa' ? 'Khóa' : u.lockedUntil > Date.now() ? 'Tạm khóa' : 'Hoạt động';

/* ---------- Trang chủ quản trị viên ---------- */
HOME.QTV = () => {
  const today = todayISO();
  return `<h1>Xin chào, ${esc(me().name)}</h1><div class="page-sub">Quản trị hệ thống ThesisHub</div>
    <div class="cards">
      <div class="card blue"><div class="label">Tổng tài khoản</div><div class="value">${DB.users.length}</div></div>
      <div class="card red"><div class="label">Đang khóa / tạm khóa</div><div class="value c">${DB.users.filter(u => accStatus(u) !== 'Hoạt động').length}</div></div>
      <div class="card green"><div class="label">Lượt đăng nhập hôm nay</div><div class="value c">${DB.loginLog.filter(l => l.time.startsWith(today)).length}</div></div>
      <div class="card orange"><div class="label">Chưa đổi mật khẩu mặc định</div><div class="value c">${DB.users.filter(u => u.mustChangePw).length}</div></div>
    </div>
    <div class="cols half">${notifPanel()}
      <div class="panel"><div class="ph"><h2>Đăng nhập gần đây</h2></div><div class="pb">
        ${DB.loginLog.slice(0, 6).map(l => `<div class="deadline">${esc(uname(l.uid))} <span class="muted small">· ${fmtDT(l.time)}</span></div>`).join('') || '<p class="muted">Chưa có.</p>'}
      </div></div></div>`;
};

/* ---------- UC1.2 Quản lý tài khoản người dùng ---------- */
UI.accQ = ''; UI.accRole = ''; UI.accSt = '';
function accRows() {
  const q = UI.accQ.toLowerCase();
  return DB.users.filter(u => (!q || (u.name + u.email + u.code).toLowerCase().includes(q)) && (!UI.accRole || u.roles.includes(UI.accRole)) && (!UI.accSt || accStatus(u) === UI.accSt))
    .map(u => { const st = accStatus(u); return `<tr><td>${esc(u.code)}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td class="small">${u.roles.map(r => ROLE_NAMES[r]).join(', ')}</td>
      <td>${sbadge(st)}</td><td class="nowrap"><button class="link-btn" onclick="A.accForm('${u.id}')">Sửa</button>
      ${st === 'Hoạt động' ? `<button class="link-btn red" onclick="A.accLock('${u.id}')">Khóa</button>` : `<button class="link-btn green" onclick="A.accUnlock('${u.id}')">Mở khóa</button>`}
      <button class="link-btn" onclick="A.accResetPw('${u.id}')">Đặt lại MK</button></td></tr>`; });
}
const refreshAcc = () => { $('#acc-body').innerHTML = accRows().join(''); };
VIEWS.accounts = {
  title: 'Tài khoản người dùng',
  render: () => page('Quản lý tài khoản người dùng', `${DB.users.length} tài khoản · Tài khoản không bị xóa, chỉ được khóa`,
    `<div class="toolbar"><input type="search" placeholder="Tìm theo tên, email, mã..." value="${esc(UI.accQ)}" oninput="UI.accQ=this.value;refreshAcc()">
      <select aria-label="Vai trò" onchange="UI.accRole=this.value;refreshAcc()"><option value="">Vai trò: Tất cả</option>${Object.entries(ROLE_NAMES).map(([k, v]) => `<option value="${k}" ${UI.accRole === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select aria-label="Trạng thái" onchange="UI.accSt=this.value;refreshAcc()"><option value="">Trạng thái: Tất cả</option>${['Hoạt động', 'Tạm khóa', 'Khóa'].map(s => `<option ${UI.accSt === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <span class="spacer"></span><button class="btn primary" onclick="A.accForm()">+ Thêm tài khoản</button></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Mã</th><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
    <tbody id="acc-body">${accRows().join('')}</tbody></table></div>`),
};
A.accForm = id => {
  const u = id ? user(id) : { name: '', email: '', code: '', roles: [], dept: '' };
  openModal({
    title: id ? 'Sửa tài khoản' : 'Thêm tài khoản',
    body: `<div class="grid2"><div class="field"><label for="ac-code">Mã người dùng *</label><input id="ac-code" type="text" value="${esc(u.code)}" ${id ? 'disabled' : ''}></div>
      <div class="field"><label for="ac-name">Họ tên *</label><input id="ac-name" type="text" value="${esc(u.name)}"></div></div>
      <div class="field"><label for="ac-email">Email trường *</label><input id="ac-email" type="email" value="${esc(u.email)}" ${id ? 'disabled' : ''}></div>
      <div class="field"><label for="ac-dept">Đơn vị / lớp</label><input id="ac-dept" type="text" value="${esc(u.dept)}"></div>
      <div class="field" id="ac-roles"><label>Vai trò * <span class="muted small">(có thể chọn nhiều)</span></label><div style="display:flex;gap:18px;flex-wrap:wrap">
        ${Object.entries(ROLE_NAMES).map(([k, v]) => `<label class="check"><input type="checkbox" value="${k}" ${u.roles.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div></div>
      ${id ? '' : `<p class="small muted">Mật khẩu mặc định: <code>${DEFAULT_PASSWORD}</code> – người dùng phải đổi ở lần đăng nhập đầu tiên.</p>`}`,
    footer: `<button class="btn primary" id="ac-save">Lưu</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#ac-save').onclick = async () => {
    clearErrs($('.modal'));
    const code = val('ac-code'), name = val('ac-name'), email = val('ac-email').toLowerCase();
    const roles = $$('#ac-roles input:checked').map(i => i.value);
    let bad = false;
    if (!code) { fieldErr('ac-code', 'Bắt buộc.'); bad = true; }
    if (!name) { fieldErr('ac-name', 'Bắt buộc.'); bad = true; }
    if (!EMAIL_RE.test(email)) { fieldErr('ac-email', 'Email sai định dạng hoặc không thuộc tên miền của trường.'); bad = true; }
    if (!roles.length) { $('#ac-roles').insertAdjacentHTML('beforeend', '<div class="err">Chọn ít nhất một vai trò.</div>'); bad = true; }
    if (bad) return;
    try {
      if (id) await api('PUT', '/api/users/' + id, { name, roles, dept: val('ac-dept') });
      else await api('POST', '/api/users', { code, name, email, roles, dept: val('ac-dept') });
    } catch (err) { fieldErr(id ? 'ac-name' : 'ac-email', err.message); return; }
    closeModal(); await refresh(); toast(id ? 'Đã cập nhật tài khoản.' : 'Đã tạo tài khoản, email thông báo đã được gửi.', 'ok');
  };
};
A.accLock = id => {
  if (id === me().id) { toast('Không thể tự khóa tài khoản của chính mình.', 'err'); return; }
  const u = user(id);
  const reason = prompt(`Lý do khóa tài khoản ${u.name}:`);
  if (reason === null) return;
  userAction(id, 'lock', 'Đã khóa tài khoản.');
};
A.accUnlock = id => userAction(id, 'unlock', 'Đã mở khóa tài khoản.');
A.accResetPw = id => {
  if (!confirm(`Đặt lại mật khẩu của ${user(id).name} về mặc định?`)) return;
  userAction(id, 'reset-password', `Mật khẩu mới: ${DEFAULT_PASSWORD} (bắt buộc đổi khi đăng nhập).`);
};
async function userAction(id, action, okMsg) {
  try { await api('POST', `/api/users/${id}/${action}`, {}); await refresh(); toast(okMsg, 'ok'); }
  catch (err) { toast(err.message, 'err'); }
}
VIEWS.loginlog = {
  title: 'Nhật ký đăng nhập',
  render: () => page('Nhật ký đăng nhập', '200 lượt gần nhất',
    table(['Thời điểm', 'Người dùng', 'Email', 'Vai trò'], DB.loginLog.map(l => { const u = user(l.uid) || {}; return `<tr><td>${fmtDT(l.time)}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td class="small">${(u.roles || []).map(r => ROLE_NAMES[r]).join(', ')}</td></tr>`; }), 'Chưa có lượt đăng nhập.')),
};

/* ---------- Trang chủ giáo vụ ---------- */
HOME.GVU = () => {
  const approved = DB.topics.filter(t => t.status === 'Đã duyệt').length;
  const toPublish = DB.councils.filter(c => !DB.published[c.id]).length;
  const eligible = DB.theses.filter(t => t.confirm && t.confirm.ok).length;
  return `<h1>Xin chào, ${esc(me().name)}</h1><div class="page-sub">Giáo vụ khoa · Đợt hiện hành ${period().id} – ${esc(period().name)}</div>
    ${phaseTimeline()}
    <div class="cards">
      <div class="card blue"><div class="label">Sinh viên trong đợt</div><div class="value">${DB.students.length}</div><div class="note">${DB.students.filter(s => !s.gvhd).length} chưa có GVHD</div></div>
      <div class="card green"><div class="label">Đề tài đã duyệt</div><div class="value">${approved}</div><div class="note">${DB.topics.length - approved} chờ xử lý / khác</div></div>
      <div class="card orange"><div class="label">Đủ điều kiện bảo vệ</div><div class="value">${eligible}</div><div class="note">${DB.defenses.length} đã xếp lịch</div></div>
      <div class="card red"><div class="label">Hội đồng chưa công bố</div><div class="value c">${toPublish}</div><div class="note"><a href="#/results">Tổng hợp kết quả →</a></div></div>
    </div>${notifPanel(6)}`;
};

/* ---------- UC1.3 Quản lý đợt đồ án ---------- */
VIEWS.periods = {
  title: 'Đợt đồ án',
  render: () => page('Quản lý đợt đồ án tốt nghiệp', 'Tối đa 2 đợt "Đang diễn ra" cùng lúc (đợt chính và đợt bổ sung)',
    `<div class="toolbar"><span class="spacer"></span><button class="btn primary" onclick="A.periodForm()">+ Tạo đợt mới</button></div>
    ${table(['Mã đợt', 'Tên đợt', 'Đăng ký đề tài', 'Thực hiện', 'Bảo vệ', 'Trọng số (HD/PB/HĐ)', 'Trạng thái', 'Thao tác'], DB.periods.map(p => `<tr>
      <td><b>${p.id}</b>${p.id === DB.currentPeriod ? '<br>' + badge('Hiện hành', 'blue') : ''}</td><td>${esc(p.name)}</td>
      <td class="small nowrap">${fmtDate(p.phases[0][1])} – ${fmtDate(p.phases[0][2])}</td><td class="small nowrap">${fmtDate(p.phases[1][1])} – ${fmtDate(p.phases[1][2])}</td>
      <td class="small nowrap">${fmtDate(p.phases[3][1])} – ${fmtDate(p.phases[3][2])}</td><td>${p.weights.gv}/${p.weights.pb}/${p.weights.hd}</td><td>${sbadge(p.status)}</td>
      <td class="nowrap">${p.id !== DB.currentPeriod ? `<button class="link-btn green" onclick="A.periodCurrent('${p.id}')">Đặt hiện hành</button>` : ''}
        ${p.status !== 'Đã kết thúc' ? `<button class="link-btn" onclick="A.periodForm('${p.id}')">Sửa</button>
        <button class="link-btn" onclick="A.periodEnd('${p.id}')">Kết thúc</button>` : ''}
        <button class="link-btn red" onclick="A.periodDel('${p.id}')">Xóa</button></td></tr>`))}`),
};
A.periodForm = id => {
  const p = id ? period(id) : { id: '', name: '', weights: { gv: 30, pb: 20, hd: 50 }, phases: ['Đăng ký đề tài', 'Thực hiện', 'Nộp quyển', 'Bảo vệ', 'Kết quả'].map(n => [n, '', '']) };
  openModal({
    title: id ? `Sửa đợt ${id}` : 'Tạo đợt đồ án mới', wide: true,
    body: `<div class="grid2"><div class="field"><label for="pd-id">Mã đợt *</label><input id="pd-id" type="text" placeholder="DA2027-1" value="${p.id}" ${id ? 'disabled' : ''}><div class="hint">Dạng DA&lt;năm&gt;-&lt;học kỳ&gt;</div></div>
      <div class="field"><label for="pd-name">Tên đợt *</label><input id="pd-name" type="text" value="${esc(p.name)}"></div></div>
      <h3>Các mốc thời gian</h3>
      ${table(['Giai đoạn', 'Bắt đầu', 'Kết thúc'], p.phases.map((ph, i) => `<tr><td>${ph[0]}</td><td><input type="date" id="pd-s${i}" value="${ph[1]}" aria-label="Bắt đầu ${ph[0]}"></td><td><input type="date" id="pd-e${i}" value="${ph[2]}" aria-label="Kết thúc ${ph[0]}"></td></tr>`))}
      <h3 style="margin-top:16px">Trọng số điểm (%)</h3>
      <div class="grid3"><div class="field"><label for="pd-wgv">GVHD</label><input id="pd-wgv" type="number" value="${p.weights.gv}"></div>
        <div class="field"><label for="pd-wpb">Phản biện</label><input id="pd-wpb" type="number" value="${p.weights.pb}"></div>
        <div class="field"><label for="pd-whd">Hội đồng</label><input id="pd-whd" type="number" value="${p.weights.hd}"></div></div>`,
    footer: `<button class="btn primary" id="pd-save">Lưu</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#pd-save').onclick = () => {
    clearErrs($('.modal'));
    const code = id || val('pd-id').toUpperCase(), name = val('pd-name');
    let bad = false;
    if (!/^DA\d{4}-[1-3]$/.test(code)) { fieldErr('pd-id', 'Mã đợt không đúng định dạng.'); bad = true; }
    else if (!id && period(code)) { fieldErr('pd-id', 'Mã đợt đã tồn tại.'); bad = true; }
    if (!name) { fieldErr('pd-name', 'Bắt buộc.'); bad = true; }
    const phases = p.phases.map((ph, i) => [ph[0], val('pd-s' + i), val('pd-e' + i)]);
    phases.forEach((ph, i) => {
      if (!ph[1] || !ph[2] || ph[1] > ph[2] || (i > 0 && ph[1] < phases[i - 1][2]) || (!id && ph[1] < todayISO())) { fieldErr('pd-s' + i, 'Mốc không hợp lệ'); bad = true; }
    });
    const w = { gv: Number(val('pd-wgv')), pb: Number(val('pd-wpb')), hd: Number(val('pd-whd')) };
    if (w.gv + w.pb + w.hd !== 100) { fieldErr('pd-whd', 'Tổng trọng số phải bằng 100%.'); bad = true; }
    if (bad) return;
    if (id) Object.assign(p, { name, phases, weights: w });
    else {
      DB.periods.push({ id: code, name, phases, weights: w, status: DB.currentPeriod ? 'Sắp diễn ra' : 'Đang diễn ra' });
      if (!DB.currentPeriod) DB.currentPeriod = code; // đợt đầu tiên trở thành đợt hiện hành
    }
    save(); closeModal(); render(); toast('Đã lưu đợt ' + code + '.', 'ok');
  };
};
A.periodEnd = id => {
  if (!confirm(`Kết thúc đợt ${id}? Sau khi kết thúc, dữ liệu đợt chỉ còn để tra cứu.`)) return;
  period(id).status = 'Đã kết thúc'; save(); render(); toast('Đã kết thúc đợt ' + id + '.');
};
A.periodCurrent = id => {
  if (!confirm(`Đặt ${id} làm đợt hiện hành? Mọi chức năng sẽ làm việc với dữ liệu của đợt này.`)) return;
  DB.currentPeriod = id;
  if (period(id).status === 'Sắp diễn ra') period(id).status = 'Đang diễn ra';
  save(); toast('Đã chuyển sang đợt ' + id + '.', 'ok');
};
A.periodDel = id => {
  if (id === DB.currentPeriod) { toast('Không thể xóa đợt hiện hành. Hãy đặt đợt khác làm hiện hành hoặc dùng chức năng "Kết thúc".', 'err'); return; }
  if (!confirm('Xóa đợt ' + id + '?')) return;
  DB.periods = DB.periods.filter(p => p.id !== id); save(); render(); toast('Đã xóa đợt.');
};

/* ---------- UC1.4 Quản lý danh sách sinh viên ---------- */
UI.stQ = '';
function stRows() {
  const q = UI.stQ.toLowerCase();
  return DB.students.filter(s => !q || (s.code + s.name).toLowerCase().includes(q)).map(s => `<tr><td>${s.code}</td><td>${esc(s.name)}</td><td>${s.cls}</td>
    <td class="num">${s.gpa.toFixed(2)}</td><td class="num">${s.credits}</td><td>${s.gvhd ? esc(uname(s.gvhd)) : '<span class="muted">Chưa có</span>'}</td><td>${s.topicId || '–'}</td>
    <td><button class="link-btn red" onclick="A.stDel('${s.code}')">Loại khỏi đợt</button></td></tr>`);
}
VIEWS.students = {
  title: 'Sinh viên',
  render() {
    const open = todayISO() <= period().phases[0][2];
    return page(`Sinh viên làm đồ án – Đợt ${period().id}`, `${DB.students.length} sinh viên`,
      `${open ? '' : '<div class="alert warn">Đã hết giai đoạn đăng ký đề tài: không thể thêm sinh viên vào đợt.</div>'}
      <div class="toolbar"><input type="search" placeholder="Tìm theo mã, họ tên..." value="${esc(UI.stQ)}" oninput="UI.stQ=this.value;document.getElementById('st-body').innerHTML=stRows().join('')">
        <span class="spacer"></span><button class="btn" ${open ? '' : 'disabled'} onclick="A.stImport()">Nhập từ tệp CSV</button>
        <button class="btn primary" ${open ? '' : 'disabled'} onclick="A.stAdd()">+ Thêm sinh viên</button></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Mã SV</th><th>Họ tên</th><th>Lớp</th><th class="num">GPA</th><th class="num">Tín chỉ</th><th>GVHD</th><th>Đề tài</th><th></th></tr></thead>
      <tbody id="st-body">${stRows().join('')}</tbody></table></div>`);
  },
};
function addStudent({ code, name, cls, gpa, credits }) {
  if (student(code)) return 'Sinh viên đã thuộc đợt đang diễn ra';
  // Máy chủ tự tạo tài khoản sinh viên (email <mã SV>@st.phenikaa-uni.edu.vn, mật khẩu tạm) nếu chưa có.
  const u = DB.users.find(x => x.code === code);
  const uid = u ? u.id : 's' + code;
  DB.students.push({ code, uid, name, cls, gpa, credits, gvhd: null, topicId: null });
  if (u) notify(uid, `Bạn đã được thêm vào đợt đồ án ${period().id} – ${period().name}.`);
  return '';
}
A.stAdd = () => {
  openModal({
    title: 'Thêm sinh viên vào đợt',
    body: `<div class="grid2"><div class="field"><label for="sa-code">Mã SV *</label><input id="sa-code" type="text"></div>
      <div class="field"><label for="sa-name">Họ tên *</label><input id="sa-name" type="text"></div>
      <div class="field"><label for="sa-cls">Lớp *</label><input id="sa-cls" type="text" value="K17-KTPM"></div>
      <div class="field"><label for="sa-gpa">GPA</label><input id="sa-gpa" type="number" step="0.01" value="3.00"></div>
      <div class="field"><label for="sa-cr">Số tín chỉ tích lũy</label><input id="sa-cr" type="number" value="125"></div></div>`,
    footer: `<button class="btn primary" id="sa-ok">Thêm</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#sa-ok').onclick = () => {
    clearErrs($('.modal'));
    const code = val('sa-code'), name = val('sa-name');
    if (!/^\d{8}$/.test(code)) return fieldErr('sa-code', 'Mã SV gồm 8 chữ số.');
    if (!name) return fieldErr('sa-name', 'Bắt buộc.');
    const err = addStudent({ code, name, cls: val('sa-cls'), gpa: Number(val('sa-gpa')), credits: Number(val('sa-cr')) });
    if (err) return fieldErr('sa-code', err);
    save(); closeModal(); render(); toast('Đã thêm sinh viên ' + name + '.', 'ok');
  };
};
A.stImport = () => {
  openModal({
    title: 'Nhập danh sách sinh viên',
    body: `<p>Tệp CSV có dòng tiêu đề: <code>MaSV,HoTen,Lop,GPA,TinChi</code>. <a href="#" onclick="exportCSV('mau_danh_sach_sinh_vien.csv',[['MaSV','HoTen','Lop','GPA','TinChi'],['22010500','Nguyễn Văn A','K17-KTPM','3.10','126']]);return false">Tải tệp mẫu</a></p>
      <div class="field"><label for="si-file">Tệp CSV *</label><input id="si-file" type="file" accept=".csv"></div><div id="si-out"></div>`,
    footer: `<button class="btn primary" id="si-ok">Nhập</button><button class="btn" onclick="closeModal()">Đóng</button>`,
  });
  $('#si-ok').onclick = () => {
    clearErrs($('.modal'));
    const f = $('#si-file').files[0];
    if (!f) return fieldErr('si-file', 'Chọn tệp CSV.');
    if (!/\.csv$/i.test(f.name)) return fieldErr('si-file', 'Tệp sai định dạng, chỉ nhận CSV.');
    f.text().then(txt => {
      const lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
      const head = (lines.shift() || '').replace(/"/g, '').split(',').map(x => x.trim());
      if (head.join(',') !== 'MaSV,HoTen,Lop,GPA,TinChi') { fieldErr('si-file', 'Sai mẫu cột. Vui lòng tải tệp mẫu.'); return; }
      let ok = 0; const errs = [];
      lines.forEach((l, i) => {
        const c = l.split(',').map(x => x.replace(/^"|"$/g, '').trim());
        if (!/^\d{8}$/.test(c[0]) || !c[1]) { errs.push(`Dòng ${i + 2}: dữ liệu không hợp lệ`); return; }
        const e = addStudent({ code: c[0], name: c[1], cls: c[2] || 'K17-KTPM', gpa: Number(c[3]) || 0, credits: Number(c[4]) || 0 });
        if (e) errs.push(`Dòng ${i + 2} (${c[0]}): ${e}`); else ok++;
      });
      save();
      $('#si-out').innerHTML = `<div class="alert ${errs.length ? 'warn' : 'ok'}">Đã nhập ${ok} sinh viên.${errs.length ? '<br>' + errs.map(esc).join('<br>') : ''}</div>`;
      $('#st-body').innerHTML = stRows().join('');
    });
  };
};
A.stDel = code => {
  const s = student(code);
  if (DB.scores.some(x => x.code === code)) { toast('Không thể loại sinh viên đã có điểm bảo vệ.', 'err'); return; }
  if (!confirm(`Loại ${s.name} khỏi đợt ${period().id}?`)) return;
  DB.students = DB.students.filter(x => x.code !== code);
  ['requests', 'plans', 'reports', 'theses', 'defenses', 'reviews'].forEach(k => { DB[k] = DB[k].filter(x => x.code !== code); });
  save(); render(); toast('Đã loại sinh viên khỏi đợt.');
};

/* ---------- UC1.5 Quản lý giảng viên và hạn mức ---------- */
VIEWS.lecturers = {
  title: 'Giảng viên & hạn mức',
  render: () => page(`Giảng viên và hạn mức hướng dẫn – Đợt ${period().id}`, 'Hạn mức mặc định: ThS 5, TS 8, PGS/GS 10 sinh viên mỗi đợt',
    `<div class="toolbar"><span class="spacer"></span><button class="btn primary" onclick="A.lecAdd()">+ Thêm giảng viên vào đợt</button></div>
    ${table(['Giảng viên', 'Email', 'Học vị', 'Hạn mức', 'Đã nhận', 'Đề tài', 'Thao tác'], DB.lecturers.map(l => { const u = user(l.uid); return `<tr>
      <td>${esc(u.name)}${u.roles.includes('TBM') ? ' ' + badge('TBM', 'blue') : ''}</td><td class="small">${esc(u.email)}</td><td>${l.degree}</td>
      <td class="num">${l.quota}</td><td class="num">${supervisedCount(l.uid)}</td><td class="num">${DB.topics.filter(t => t.gv === l.uid).length}</td>
      <td class="nowrap"><button class="link-btn" onclick="A.lecQuota('${l.uid}')">Sửa hạn mức</button><button class="link-btn red" onclick="A.lecDel('${l.uid}')">Xóa khỏi đợt</button></td></tr>`; }))}`),
};
A.lecQuota = uid => {
  const l = lecturer(uid);
  openModal({
    title: 'Sửa hạn mức – ' + uname(uid),
    body: `<div class="grid2"><div class="field"><label for="lq-deg">Học vị</label><select id="lq-deg">${Object.keys(DEGREE_QUOTA).map(d => `<option ${d === l.degree ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="field"><label for="lq-q">Hạn mức (SV) *</label><input id="lq-q" type="number" min="0" value="${l.quota}"></div></div>
      <p class="small muted">Hiện đang hướng dẫn ${supervisedCount(uid)} sinh viên.</p>`,
    footer: `<button class="btn primary" id="lq-ok">Lưu</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#lq-ok').onclick = () => {
    clearErrs($('.modal'));
    const q = Number(val('lq-q')), n = supervisedCount(uid);
    if (!(q >= 0)) return fieldErr('lq-q', 'Hạn mức không hợp lệ.');
    if (q < n) return fieldErr('lq-q', `Hạn mức mới nhỏ hơn số sinh viên đã nhận (${n}).`);
    l.quota = q; l.degree = val('lq-deg'); save(); closeModal(); render(); toast('Đã cập nhật hạn mức.', 'ok');
  };
};
A.lecDel = uid => {
  if (supervisedCount(uid)) { toast('Không thể xóa giảng viên đã nhận sinh viên.', 'err'); return; }
  if (!confirm(`Xóa ${uname(uid)} khỏi đợt?`)) return;
  DB.lecturers = DB.lecturers.filter(l => l.uid !== uid); save(); render(); toast('Đã xóa giảng viên khỏi đợt.');
};
A.lecAdd = () => {
  const cands = DB.users.filter(u => u.roles.includes('GV') && !lecturer(u.id) && u.status !== 'Khóa');
  if (!cands.length) { toast('Không còn giảng viên nào để thêm. Tạo tài khoản giảng viên ở chức năng của quản trị viên.', 'warn'); return; }
  openModal({
    title: 'Thêm giảng viên vào đợt',
    body: `<div class="field"><label for="la-u">Giảng viên *</label><select id="la-u">${cands.map(u => `<option value="${u.id}">${esc(u.name)} – ${esc(u.email)}</option>`).join('')}</select></div>
      <div class="field"><label for="la-deg">Học vị</label><select id="la-deg">${Object.keys(DEGREE_QUOTA).map(d => `<option>${d}</option>`).join('')}</select><div class="hint">Hạn mức được đặt theo học vị, có thể sửa sau.</div></div>`,
    footer: `<button class="btn primary" id="la-ok">Thêm</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#la-ok').onclick = () => {
    const deg = val('la-deg');
    DB.lecturers.push({ uid: val('la-u'), degree: deg, quota: DEGREE_QUOTA[deg] });
    save(); closeModal(); render(); toast('Đã thêm giảng viên.', 'ok');
  };
};

/* ---------- UC3.4 Theo dõi tiến độ tổng hợp ---------- */
UI.pgQ = ''; UI.pgGv = ''; UI.pgSt = ''; UI.pgSel = {};
function pgList() {
  const q = UI.pgQ.toLowerCase();
  return DB.students.filter(s => s.gvhd).map(s => ({ s, p: progressOf(s.code) }))
    .filter(x => (!q || (x.s.name + x.s.code).toLowerCase().includes(q)) && (!UI.pgGv || x.s.gvhd === UI.pgGv) && (!UI.pgSt || x.p.label === UI.pgSt));
}
function pgRows() {
  const list = pgList();
  if (!list.length) return `<tr><td colspan="7" class="empty">Không có sinh viên phù hợp.</td></tr>`;
  return list.map(({ s, p }) => `<tr><td><input type="checkbox" aria-label="Chọn ${esc(s.name)}" ${UI.pgSel[s.code] ? 'checked' : ''} onchange="UI.pgSel['${s.code}']=this.checked"></td>
    <td>${s.code}</td><td>${esc(s.name)}</td><td>${esc(uname(s.gvhd))}</td><td>Mốc ${p.cur}/${p.total}</td>
    <td><div style="display:flex;gap:8px;align-items:center"><div class="progress" style="flex:1"><div style="width:${p.pct}%"></div></div>${p.pct}%</div></td><td>${badge(p.label, p.cls)}</td></tr>`).join('');
}
VIEWS.progress = {
  title: 'Theo dõi tiến độ',
  render() {
    const all = DB.students.filter(s => s.gvhd).map(s => progressOf(s.code));
    const cnt = l => all.filter(p => p.label === l).length;
    const gvs = [...new Set(DB.students.filter(s => s.gvhd).map(s => s.gvhd))];
    return page(`Theo dõi tiến độ tổng hợp – ${role() === 'TBM' ? 'Bộ môn Kỹ thuật phần mềm' : 'Toàn khoa'}`, '',
      `<div class="cards">
        <div class="card green"><div class="label">Đúng tiến độ</div><div class="value c">${cnt('Đạt')}</div></div>
        <div class="card orange"><div class="label">Cần bổ sung</div><div class="value c">${cnt('Cần bổ sung')}</div></div>
        <div class="card red"><div class="label">Chậm tiến độ</div><div class="value c">${cnt('Chậm tiến độ')}</div></div>
        <div class="card"><div class="label">Chưa nộp / chờ đánh giá</div><div class="value">${cnt('Chưa nộp') + cnt('Chờ đánh giá')}</div></div>
      </div>
      <div class="toolbar">
        <input type="search" placeholder="Tìm theo tên sinh viên..." value="${esc(UI.pgQ)}" oninput="UI.pgQ=this.value;document.getElementById('pg-body').innerHTML=pgRows()">
        <select aria-label="GVHD" onchange="UI.pgGv=this.value;document.getElementById('pg-body').innerHTML=pgRows()"><option value="">GVHD: Tất cả</option>${gvs.map(g => `<option value="${g}" ${UI.pgGv === g ? 'selected' : ''}>${esc(uname(g))}</option>`).join('')}</select>
        <select aria-label="Tiến độ" onchange="UI.pgSt=this.value;document.getElementById('pg-body').innerHTML=pgRows()"><option value="">Tiến độ: Tất cả</option>${['Đạt', 'Cần bổ sung', 'Chậm tiến độ', 'Chờ đánh giá', 'Chưa nộp'].map(s => `<option ${UI.pgSt === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <span class="spacer"></span><button class="btn danger" onclick="A.pgRemind()">Gửi nhắc nhở</button><button class="btn" onclick="A.pgExport()">Xuất Excel</button></div>
      <div class="table-wrap"><table class="data"><thead><tr><th></th><th>Mã SV</th><th>Họ tên</th><th>GVHD</th><th>Mốc hiện tại</th><th>Hoàn thành</th><th>Tình trạng</th></tr></thead>
      <tbody id="pg-body">${pgRows()}</tbody></table></div>`);
  },
};
A.pgRemind = () => {
  const codes = Object.keys(UI.pgSel).filter(c => UI.pgSel[c] && student(c));
  if (!codes.length) { toast('Chọn ít nhất một sinh viên.', 'warn'); return; }
  codes.forEach(c => { const s = student(c); notify(s.uid, `${me().name} nhắc nhở: bạn đang ${progressOf(c).label.toLowerCase()}, vui lòng cập nhật tiến độ.`); notify(s.gvhd, `Đã gửi nhắc nhở tiến độ tới sinh viên ${s.name}.`); });
  UI.pgSel = {}; save(); render(); toast(`Đã gửi nhắc nhở tới ${codes.length} sinh viên và GVHD.`, 'ok');
};
A.pgExport = () => exportCSV(`tien_do_${DB.currentPeriod}.csv`, [['Mã SV', 'Họ tên', 'GVHD', 'Mốc hiện tại', 'Hoàn thành (%)', 'Tình trạng'],
  ...pgList().map(({ s, p }) => [s.code, s.name, uname(s.gvhd), `${p.cur}/${p.total}`, p.pct, p.label])]);

/* ---------- UC4.3 Thành lập hội đồng bảo vệ ---------- */
VIEWS.councils = {
  title: 'Hội đồng bảo vệ',
  render: () => page('Hội đồng bảo vệ', `Đợt ${period().id} · Bảo vệ ${fmtDate(period().phases[3][1])} – ${fmtDate(period().phases[3][2])}`,
    `<div class="toolbar"><span class="spacer"></span><button class="btn primary" onclick="A.councilForm()">+ Thành lập hội đồng</button></div>
    ${table(['Mã', 'Ngày / buổi', 'Phòng', 'Thành viên', 'Số SV', 'Trạng thái', ''], DB.councils.map(c => `<tr><td><b>${c.id}</b></td><td>${fmtDate(c.date)} · ${c.session}</td><td>${esc(c.room)}</td>
      <td class="small">${c.members.map(m => `${m.role}: ${esc(uname(m.uid))}`).join('<br>')}</td><td class="num">${DB.defenses.filter(d => d.council === c.id).length}/10</td>
      <td>${DB.published[c.id] ? sbadge('Đã công bố') : badge('Chưa công bố', 'grey')}</td>
      <td class="nowrap">${DB.published[c.id] ? '' : `<button class="link-btn" onclick="A.councilForm('${c.id}')">Sửa</button><button class="link-btn red" onclick="A.councilDel('${c.id}')">Xóa</button>`}</td></tr>`), 'Chưa có hội đồng.')}`),
};
A.councilForm = id => {
  const c = id ? council(id) : { id: 'HĐ' + String(Math.max(0, ...DB.councils.map(x => Number(x.id.replace(/\D/g, '')) || 0)) + 1).padStart(2, '0'), date: period().phases[3][1], session: 'Sáng', room: '', members: [] };
  const rows = [...c.members, ...Array(5 - c.members.length).fill({ uid: '', role: 'Ủy viên' })];
  openModal({
    title: id ? `Sửa hội đồng ${id}` : 'Thành lập hội đồng bảo vệ', wide: true,
    body: `<div class="grid3"><div class="field"><label for="cn-date">Ngày bảo vệ *</label><input id="cn-date" type="date" value="${c.date}"></div>
      <div class="field"><label for="cn-ses">Buổi *</label><select id="cn-ses">${['Sáng', 'Chiều'].map(s => `<option ${s === c.session ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label for="cn-room">Phòng *</label><input id="cn-room" type="text" value="${esc(c.room)}" placeholder="A2-301"></div></div>
      <h3>Thành viên (3–5 người, chủ tịch có học vị Tiến sĩ trở lên)</h3>
      ${table(['#', 'Giảng viên', 'Vai trò'], rows.map((m, i) => `<tr><td>${i + 1}</td>
        <td><select id="cn-u${i}" aria-label="Thành viên ${i + 1}"><option value="">–</option>${DB.lecturers.map(l => `<option value="${l.uid}" ${l.uid === m.uid ? 'selected' : ''}>${esc(uname(l.uid))} (${l.degree})</option>`).join('')}</select></td>
        <td><select id="cn-r${i}" aria-label="Vai trò ${i + 1}">${['Chủ tịch', 'Thư ký', 'Ủy viên'].map(r => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td></tr>`))}
      <div id="cn-err" style="margin-top:12px"></div>`,
    footer: `<button class="btn primary" id="cn-ok">Lưu hội đồng</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#cn-ok').onclick = () => {
    clearErrs($('.modal'));
    const err = t => { $('#cn-err').innerHTML = `<div class="alert err">${t}</div>`; };
    const date = val('cn-date'), session = val('cn-ses'), room = val('cn-room');
    if (!date) return fieldErr('cn-date', 'Bắt buộc.');
    if (!room) return fieldErr('cn-room', 'Bắt buộc.');
    const members = [0, 1, 2, 3, 4].map(i => ({ uid: val('cn-u' + i), role: val('cn-r' + i) })).filter(m => m.uid);
    if (new Set(members.map(m => m.uid)).size !== members.length) return err('Một giảng viên được chọn nhiều lần.');
    if (members.length < 3 || members.length > 5) return err('Hội đồng phải có 3–5 thành viên.');
    const chairs = members.filter(m => m.role === 'Chủ tịch'), secs = members.filter(m => m.role === 'Thư ký');
    if (chairs.length !== 1 || secs.length !== 1) return err('Hội đồng phải có đúng 1 chủ tịch và 1 thư ký.');
    if (lecturer(chairs[0].uid).degree === 'ThS') return err('Chủ tịch hội đồng phải có học vị Tiến sĩ trở lên.');
    const clash = members.map(m => ({ m, o: DB.councils.find(o => o.id !== c.id && o.date === date && o.session === session && o.members.some(x => x.uid === m.uid)) })).filter(x => x.o);
    if (clash.length) return err('Trùng lịch: ' + clash.map(x => `${esc(uname(x.m.uid))} đã thuộc ${x.o.id} cùng buổi`).join('; ') + '.');
    const conflictRv = DB.defenses.filter(d => d.council === c.id && members.some(m => m.uid === d.reviewer));
    if (conflictRv.length) return err('GV phản biện của ' + conflictRv.map(d => esc(student(d.code).name)).join(', ') + ' không được là thành viên hội đồng.');
    Object.assign(c, { date, session, room, members });
    if (!id) DB.councils.push(c);
    members.forEach(m => notify(m.uid, `Bạn là ${m.role.toLowerCase()} hội đồng ${c.id} (${fmtDate(date)}, buổi ${session.toLowerCase()}, phòng ${room}).`));
    save(); closeModal(); render(); toast('Đã lưu hội đồng ' + c.id + '.', 'ok');
  };
};
A.councilDel = id => {
  if (DB.defenses.some(d => d.council === id)) { toast('Hội đồng đã có sinh viên, hãy chuyển sinh viên sang hội đồng khác trước.', 'err'); return; }
  if (!confirm('Xóa hội đồng ' + id + '?')) return;
  DB.councils = DB.councils.filter(c => c.id !== id); save(); render();
};

/* ---------- UC4.4 Phân công phản biện và xếp lịch bảo vệ ---------- */
const SLOTS = { 'Sáng': ['07:30', '08:15', '09:00', '09:45', '10:30', '11:15'], 'Chiều': ['13:30', '14:15', '15:00', '15:45', '16:30', '17:15'] };
VIEWS.schedule = {
  title: 'Phản biện & lịch',
  render() {
    const eligible = DB.theses.filter(t => t.confirm && t.confirm.ok).map(t => student(t.code)).filter(Boolean);
    const notReady = DB.students.filter(s => s.gvhd && !eligible.includes(s));
    return page('Phân công phản biện và xếp lịch bảo vệ', `${eligible.length} sinh viên đủ điều kiện · ${DB.defenses.length} đã xếp lịch`,
      `${table(['Sinh viên', 'Đề tài', 'GVHD', 'Hội đồng', 'Giờ', 'Phản biện', ''], eligible.map(s => { const d = defenseOf(s.code); const c = d && council(d.council); return `<tr>
        <td><b>${esc(s.name)}</b><div class="small muted">${s.code}</div></td><td class="small">${esc(topic(s.topicId).title)}</td><td>${esc(uname(s.gvhd))}</td>
        <td>${d ? `${d.council}<div class="small muted">${fmtDate(c.date)} · ${esc(c.room)}</div>` : '–'}</td><td>${d ? d.time : '–'}</td><td>${d ? esc(uname(d.reviewer)) : '–'}</td>
        <td>${d && DB.published[d.council] ? '' : `<button class="link-btn" onclick="A.schedForm('${s.code}')">${d ? 'Sửa' : 'Xếp lịch'}</button>`}</td></tr>`; }), 'Chưa có sinh viên được xác nhận đủ điều kiện.')}
      <p class="small muted" style="margin-top:12px">${notReady.length} sinh viên khác chưa nộp quyển hoặc chưa được GVHD xác nhận. Lịch phải công bố trước ngày bảo vệ ít nhất 5 ngày; mỗi lượt 45 phút.</p>`);
  },
};
A.schedForm = code => {
  const s = student(code), d = defenseOf(code) || { council: DB.councils[0] && DB.councils[0].id, reviewer: '', time: '' };
  if (!DB.councils.length) { toast('Chưa có hội đồng. Hãy thành lập hội đồng trước.', 'warn'); return; }
  const slotOpts = cid => SLOTS[council(cid).session].map(t => { const busy = DB.defenses.find(x => x.council === cid && x.time === t && x.code !== code); return `<option value="${t}" ${t === d.time ? 'selected' : ''} ${busy ? 'disabled' : ''}>${t}${busy ? ' – ' + esc(student(busy.code).name) : ''}</option>`; }).join('');
  openModal({
    title: `Xếp lịch bảo vệ – ${s.name}`,
    body: `<p class="muted">GVHD: ${esc(uname(s.gvhd))}</p>
      <div class="field"><label for="sc-c">Hội đồng *</label><select id="sc-c" onchange="A.schedSlots()">${DB.councils.filter(c => !DB.published[c.id]).map(c => `<option value="${c.id}" ${c.id === d.council ? 'selected' : ''}>${c.id} · ${fmtDate(c.date)} ${c.session} · ${esc(c.room)} (${DB.defenses.filter(x => x.council === c.id).length}/10)</option>`).join('')}</select></div>
      <div class="field"><label for="sc-t">Giờ bảo vệ *</label><select id="sc-t">${slotOpts(d.council)}</select></div>
      <div class="field"><label for="sc-r">Giảng viên phản biện *</label><select id="sc-r"><option value="">– Chọn –</option>${DB.lecturers.map(l => `<option value="${l.uid}" ${l.uid === d.reviewer ? 'selected' : ''}>${esc(uname(l.uid))}</option>`).join('')}</select></div>
      <div id="sc-err"></div>`,
    footer: `<button class="btn primary" id="sc-ok">Lưu</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  A.schedSlots = () => { $('#sc-t').innerHTML = slotOpts(val('sc-c')); };
  $('#sc-ok').onclick = () => {
    const err = t => { $('#sc-err').innerHTML = `<div class="alert err">${t}</div>`; };
    const cid = val('sc-c'), time = val('sc-t'), rv = val('sc-r'), c = council(cid);
    if (!cid || !time || !rv) return err('Vui lòng chọn đủ hội đồng, giờ và giảng viên phản biện.');
    if (rv === s.gvhd) return err('Giảng viên phản biện không được là GVHD của sinh viên.');
    if (c.members.some(m => m.uid === rv)) return err('Giảng viên phản biện không được là thành viên hội đồng sinh viên bảo vệ.');
    if (DB.defenses.some(x => x.council === cid && x.time === time && x.code !== code)) return err('Khung giờ đã có sinh viên khác.');
    if (DB.defenses.filter(x => x.council === cid && x.code !== code).length >= 10) return err('Hội đồng đã đủ 10 sinh viên.');
    let def = defenseOf(code);
    if (!def) { def = { code }; DB.defenses.push(def); }
    const rvChanged = def.reviewer && def.reviewer !== rv;
    Object.assign(def, { council: cid, time, reviewer: rv });
    if (rvChanged) DB.reviews = DB.reviews.filter(r => r.code !== code);
    notify(s.uid, `Lịch bảo vệ: ${cid}, ${time} ngày ${fmtDate(c.date)}, phòng ${c.room}.`);
    notify(rv, `Bạn được phân công phản biện đồ án của ${s.name} (bảo vệ ${fmtDate(c.date)}).`);
    save(); closeModal(); render(); toast('Đã xếp lịch bảo vệ.', 'ok');
  };
};

/* ---------- UC5.2 Tổng hợp và công bố kết quả ---------- */
VIEWS.results = {
  title: 'Tổng hợp kết quả',
  render() {
    const w = period().weights;
    return page('Tổng hợp và công bố kết quả', `Điểm tổng kết = ${w.gv}% GVHD + ${w.pb}% phản biện + ${w.hd}% TB hội đồng · Đạt khi ≥ 5,0 và không thành viên nào chấm dưới 4,0`,
      DB.councils.map(c => {
        const ds = DB.defenses.filter(d => d.council === c.id).sort((a, b) => a.time < b.time ? -1 : 1);
        const rs = ds.map(d => ({ d, s: student(d.code), r: resultOf(d.code) }));
        const missing = rs.filter(x => x.r.missing.length);
        const pub = !!DB.published[c.id];
        return `<div class="panel"><div class="ph"><h2>${c.id} · ${fmtDate(c.date)} · ${esc(c.room)}</h2>
          ${pub ? sbadge('Đã công bố') : `<button class="btn primary" ${ds.length ? '' : 'disabled'} onclick="A.publish('${c.id}')">Công bố kết quả</button>`}
          <button class="btn" onclick="A.resExport('${c.id}')">Xuất bảng điểm</button></div><div class="pb">
          ${!pub && missing.length ? `<div class="alert warn">Còn thiếu phiếu: ${missing.map(x => `<b>${esc(x.s.name)}</b> (${x.r.missing.map(esc).join(', ')})`).join('; ')}</div>` : ''}
          ${table(['Giờ', 'Sinh viên', 'GVHD', 'Phản biện', ...c.members.map(m => `${esc(uname(m.uid).replace(/^.*\. /, ''))}<div class="small muted">${m.role}</div>`), 'TB HĐ', 'Tổng kết', 'Kết quả'],
            rs.map(({ d, s, r }) => `<tr><td>${d.time}</td><td>${esc(s.name)}</td><td>${fmtScore(r.gv)}</td><td>${fmtScore(r.pb)}</td>
              ${r.members.map(m => `<td>${fmtScore(m.score)}</td>`).join('')}<td>${fmtScore(r.hd)}</td><td><b>${fmtScore(r.final)}</b></td>
              <td>${r.final == null ? badge('Thiếu phiếu', 'grey') : sbadge(r.pass ? 'Đạt' : 'Không đạt')}</td></tr>`), 'Hội đồng chưa có sinh viên.')}
        </div></div>`;
      }).join('') || '<div class="alert">Chưa có hội đồng.</div>');
  },
};
A.publish = cid => {
  const ds = DB.defenses.filter(d => d.council === cid);
  const missing = ds.filter(d => resultOf(d.code).missing.length);
  if (missing.length) { toast('Không thể công bố khi còn thiếu phiếu: ' + missing.map(d => student(d.code).name).join(', ') + '.', 'err'); return; }
  if (!confirm(`Công bố kết quả hội đồng ${cid}? Sau khi công bố, thành viên không thể sửa phiếu chấm.`)) return;
  DB.published[cid] = true;
  ds.forEach(d => notify(student(d.code).uid, 'Kết quả bảo vệ đồ án của bạn đã được công bố.'));
  save(); render(); toast('Đã công bố kết quả ' + cid + '.', 'ok');
};
A.resExport = cid => {
  const rows = DB.defenses.filter(d => d.council === cid).map(d => { const s = student(d.code), r = resultOf(d.code); return [s.code, s.name, r.gv, r.pb, r.hd, r.final, r.final == null ? 'Thiếu phiếu' : r.pass ? 'Đạt' : 'Không đạt']; });
  exportCSV(`ket_qua_${cid}.csv`, [['Mã SV', 'Họ tên', 'GVHD', 'Phản biện', 'TB hội đồng', 'Tổng kết', 'Kết quả'], ...rows]);
};

/* ---------- UC5.4 Lưu trữ đồ án ---------- */
VIEWS.archive = {
  title: 'Lưu trữ đồ án',
  render() {
    const done = DB.defenses.filter(d => DB.published[d.council] && resultOf(d.code).pass).map(d => student(d.code));
    return page('Lưu trữ đồ án', 'Lưu trữ quyển đồ án đã bảo vệ đạt vào kho để tra cứu và kiểm tra trùng lặp đề tài',
      `<h2 style="margin-bottom:10px">Đồ án đã công bố kết quả đạt</h2>
      ${table(['Sinh viên', 'Đề tài', 'GVHD', 'Điểm', 'Trạng thái', ''], done.map(s => { const ar = DB.archived.includes(s.code); return `<tr><td>${esc(s.name)}<div class="small muted">${s.code}</div></td>
        <td>${esc(topic(s.topicId).title)}</td><td>${esc(uname(s.gvhd))}</td><td>${fmtScore(resultOf(s.code).final)}</td><td>${ar ? sbadge('Đã lưu trữ') : badge('Chưa lưu trữ', 'grey')}</td>
        <td>${ar ? '' : `<button class="link-btn" onclick="A.archiveForm('${s.code}')">Lưu trữ</button>`}</td></tr>`; }), 'Chưa có đồ án nào được công bố đạt.')}
      <h2 style="margin:26px 0 10px">Kho đồ án</h2>
      <div class="table-wrap"><table class="data"><thead><tr><th>Mã</th><th>Đề tài</th><th>Sinh viên</th><th>GVHD</th><th>Đợt</th><th></th></tr></thead><tbody>${libRows().join('')}</tbody></table></div>`);
  },
};
A.archiveForm = code => {
  const s = student(code);
  openModal({
    title: 'Lưu trữ đồ án – ' + s.name,
    body: `<p><b>${esc(topic(s.topicId).title)}</b></p>
      <div class="field"><label for="ar-final">Quyển hoàn chỉnh sau bảo vệ (PDF)</label><input id="ar-final" type="file" accept=".pdf"><div class="hint">Bỏ trống để dùng bản đã nộp: ${esc(thesisOf(code).file)}</div></div>
      <div class="field"><label for="ar-exp">Bảng giải trình chỉnh sửa *</label><input id="ar-exp" type="file" accept=".pdf,.docx"></div>
      <div class="field"><label for="ar-abs">Tóm tắt *</label><textarea id="ar-abs">${esc(topic(s.topicId).desc)}</textarea></div>`,
    footer: `<button class="btn primary" id="ar-ok">Lưu trữ</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#ar-ok').onclick = () => {
    clearErrs($('.modal'));
    if (!fileInfo('ar-exp')) return fieldErr('ar-exp', 'Thiếu bảng giải trình chỉnh sửa.');
    if (!val('ar-abs')) return fieldErr('ar-abs', 'Bắt buộc.');
    DB.archive.unshift({ id: 'LT-' + DB.currentPeriod.slice(2, 6) + '-' + String(DB.archive.length + 1).padStart(3, '0'), title: topic(s.topicId).title, student: s.name, gv: uname(s.gvhd), period: DB.currentPeriod, score: resultOf(code).final, abstract: val('ar-abs'), code });
    DB.archived.push(code);
    save(); closeModal(); render(); toast('Đã lưu trữ đồ án vào kho.', 'ok');
  };
};

/* ---------- UC5.5 Thống kê, báo cáo ---------- */
function bars(rows, cls = '') {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([label, v, c, note]) => `<div class="bar-row"><span>${esc(label)}</span><div class="bar-track"><div class="bar ${c || cls}" style="width:${v / max * 100}%"></div></div><span class="right">${note ?? v}</span></div>`).join('');
}
VIEWS.stats = {
  title: 'Thống kê',
  render() {
    const prog = DB.students.filter(s => s.gvhd).map(s => progressOf(s.code).label);
    const finals = DB.defenses.map(d => resultOf(d.code)).filter(r => r.final != null);
    const pass = finals.filter(r => r.pass).length;
    const bands = [['Dưới 5,0', 0, 5, 'red'], ['5,0 – 6,9', 5, 7, 'orange'], ['7,0 – 7,9', 7, 8, ''], ['8,0 – 8,9', 8, 9, 'green'], ['9,0 – 10', 9, 10.01, 'green']];
    const topicSt = ['Đã duyệt', 'Chờ duyệt', 'Yêu cầu sửa', 'Từ chối'];
    return page(`Thống kê – Đợt ${period().id}`, role() === 'TBM' ? 'Số liệu bộ môn Kỹ thuật phần mềm' : 'Số liệu toàn khoa',
      `<div class="toolbar"><span class="spacer"></span><button class="btn" onclick="A.statsExport()">Xuất báo cáo (CSV)</button></div>
      <div class="cards">
        <div class="card blue"><div class="label">Sinh viên</div><div class="value">${DB.students.length}</div><div class="note">${DB.students.filter(s => s.gvhd).length} đã có GVHD</div></div>
        <div class="card green"><div class="label">Đề tài đã duyệt</div><div class="value">${DB.topics.filter(t => t.status === 'Đã duyệt').length}</div><div class="note">trên ${DB.topics.length} đề xuất</div></div>
        <div class="card orange"><div class="label">Điểm TB tổng kết</div><div class="value">${finals.length ? fmtScore(round1(finals.reduce((a, r) => a + r.final, 0) / finals.length)) : '–'}</div><div class="note">${finals.length} SV đủ phiếu</div></div>
        <div class="card red"><div class="label">Tỷ lệ đạt</div><div class="value">${finals.length ? Math.round(pass / finals.length * 100) + '%' : '–'}</div><div class="note">${pass}/${finals.length} sinh viên</div></div>
      </div>
      <div class="cols half">
        <div class="panel"><div class="ph"><h2>Tình trạng tiến độ</h2></div><div class="pb">
          ${bars([['Đạt', prog.filter(x => x === 'Đạt').length, 'green'], ['Cần bổ sung', prog.filter(x => x === 'Cần bổ sung').length, 'orange'], ['Chậm tiến độ', prog.filter(x => x === 'Chậm tiến độ').length, 'red'], ['Chờ đánh giá', prog.filter(x => x === 'Chờ đánh giá').length], ['Chưa nộp', prog.filter(x => x === 'Chưa nộp').length, 'grey'], ['Chưa có GVHD', DB.students.filter(s => !s.gvhd).length, 'grey']])}
        </div></div>
        <div class="panel"><div class="ph"><h2>Phổ điểm tổng kết</h2></div><div class="pb">
          ${finals.length ? bars(bands.map(b => [b[0], finals.filter(r => r.final >= b[1] && r.final < b[2]).length, b[3]])) : '<p class="muted">Chưa có dữ liệu điểm.</p>'}
        </div></div>
        <div class="panel"><div class="ph"><h2>Sinh viên hướng dẫn / hạn mức</h2></div><div class="pb">
          ${bars(DB.lecturers.map(l => [uname(l.uid).replace(/^.*\. /, ''), supervisedCount(l.uid), supervisedCount(l.uid) >= l.quota ? 'red' : '', `${supervisedCount(l.uid)}/${l.quota}`]))}
        </div></div>
        <div class="panel"><div class="ph"><h2>Đề tài theo trạng thái</h2></div><div class="pb">
          ${bars(topicSt.map(s => [s, DB.topics.filter(t => t.status === s).length, STATUS_CLS[s] === 'blue' ? '' : STATUS_CLS[s]]))}
        </div></div>
      </div>`);
  },
};
A.statsExport = () => exportCSV(`thong_ke_${DB.currentPeriod}.csv`, [['Mã SV', 'Họ tên', 'GVHD', 'Đề tài', 'Tiến độ', 'Điểm tổng kết', 'Kết quả'],
  ...DB.students.map(s => { const r = resultOf(s.code); return [s.code, s.name, s.gvhd ? uname(s.gvhd) : '', s.topicId || '', progressOf(s.code).label, r && r.final != null ? r.final : '', r && r.final != null ? (r.pass ? 'Đạt' : 'Không đạt') : '']; })]);
