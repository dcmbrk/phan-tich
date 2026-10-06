// Màn hình của giảng viên và trưởng bộ môn: UC2.1, UC2.2, UC2.4, UC2.5, UC3.3, UC4.2, UC4.5, UC5.1.
// Gửi thông báo tới mọi tài khoản đang hoạt động có vai trò r (có thể có nhiều giáo vụ / trưởng bộ môn)
const notifyRole = (r, text) => DB.users.filter(u => u.roles.includes(r) && u.status !== 'Khóa' && u.id !== me().id).forEach(u => notify(u.id, text));

HOME.GV = () => {
  const u = me(), l = lecturer(u.id);
  const myTopics = DB.topics.filter(t => t.gv === u.id);
  const reqs = DB.requests.filter(r => r.status === 'Chờ xét' && topic(r.topicId).gv === u.id);
  const mine = DB.students.filter(s => s.gvhd === u.id);
  const waitRep = DB.reports.filter(r => r.status === 'Chờ đánh giá' && student(r.code).gvhd === u.id);
  const waitPlan = DB.plans.filter(p => p.status === 'Chờ duyệt' && student(p.code).gvhd === u.id);
  const waitThesis = DB.theses.filter(t => !t.confirm && student(t.code).gvhd === u.id);
  const waitReview = DB.defenses.filter(d => d.reviewer === u.id && !reviewOf(d.code));
  const waitScore = DB.defenses.filter(d => council(d.council).members.some(m => m.uid === u.id) && !scoreOf(d.code, u.id) && !DB.published[d.council]);
  const todo = [
    [reqs.length, 'nguyện vọng hướng dẫn chờ xét', 'requests'],
    [waitPlan.length, 'kế hoạch chờ duyệt', 'supervise'],
    [waitRep.length, 'báo cáo tiến độ chờ đánh giá', 'supervise'],
    [waitThesis.length, 'quyển đồ án chờ xác nhận đủ điều kiện', 'supervise'],
    [waitReview.length, 'phiếu phản biện cần gửi', 'review'],
    [waitScore.length, 'phiếu chấm bảo vệ chưa chấm', 'grading'],
  ].filter(x => x[0]);
  return `<h1>Xin chào, ${esc(u.name)}</h1><div class="page-sub">Đợt hiện hành: ${period().id} – ${esc(period().name)}</div>
    ${phaseTimeline()}
    <div class="cards">
      <div class="card blue"><div class="label">Đề tài của tôi</div><div class="value">${myTopics.length}</div><div class="note">${myTopics.filter(t => t.status === 'Đã duyệt').length} đã duyệt</div></div>
      <div class="card orange"><div class="label">Nguyện vọng chờ xét</div><div class="value c">${reqs.length}</div><div class="note">Xét trong vòng 3 ngày</div></div>
      <div class="card green"><div class="label">Sinh viên hướng dẫn</div><div class="value">${mine.length} / ${l ? l.quota : 0}</div><div class="note">Còn ${quotaLeft(u.id)} chỗ</div></div>
      <div class="card red"><div class="label">Báo cáo chờ đánh giá</div><div class="value c">${waitRep.length}</div><div class="note">Đánh giá trong 7 ngày</div></div>
    </div>
    <div class="cols">${notifPanel()}
      <div class="panel"><div class="ph"><h2>Việc cần làm</h2></div><div class="pb">
        ${todo.length ? todo.map(t => `<div class="deadline"><a href="#/${t[2]}"><b>${t[0]}</b> ${t[1]} →</a></div>`).join('') : '<p class="muted">Không có việc tồn đọng.</p>'}
      </div></div></div>`;
};

HOME.TBM = () => {
  const pending = DB.topics.filter(t => t.status === 'Chờ duyệt' && t.gv !== me().id).length;
  const noGv = DB.students.filter(s => !s.gvhd).length;
  const slow = DB.students.filter(s => progressOf(s.code).label === 'Chậm tiến độ').length;
  return `<h1>Xin chào, ${esc(me().name)}</h1><div class="page-sub">Trưởng bộ môn Kỹ thuật phần mềm · Đợt ${period().id}</div>
    ${phaseTimeline()}
    <div class="cards">
      <div class="card blue"><div class="label">Đề tài chờ duyệt</div><div class="value c">${pending}</div><div class="note"><a href="#/approve">Duyệt đề tài →</a></div></div>
      <div class="card orange"><div class="label">SV chưa có GVHD</div><div class="value c">${noGv}</div><div class="note"><a href="#/assign">Phân công →</a></div></div>
      <div class="card red"><div class="label">Chậm tiến độ</div><div class="value c">${slow}</div><div class="note"><a href="#/progress">Theo dõi →</a></div></div>
      <div class="card green"><div class="label">Sinh viên trong đợt</div><div class="value">${DB.students.length}</div><div class="note">${DB.lecturers.length} giảng viên tham gia</div></div>
    </div>${notifPanel(6)}`;
};

/* ---------- UC2.1 Đề xuất đề tài ---------- */
function topicLocked(t) { return t.status === 'Đã duyệt' && topicTaken(t) > 0; } // BR3
VIEWS['my-topics'] = {
  title: 'Đề tài của tôi',
  render() {
    const u = me(), l = lecturer(u.id), p = period();
    const mine = DB.topics.filter(t => t.gv === u.id);
    const used = mine.filter(t => t.status !== 'Từ chối').reduce((a, t) => a + t.slots, 0);
    const open = todayISO() <= p.phases[0][2];
    return page('Đề tài của tôi', `Hạn mức hướng dẫn: ${l.quota} SV · Tổng chỗ đã đề xuất: ${used}/${Math.floor(l.quota * 1.5)} (tối đa 1,5 lần hạn mức)`,
      `<div class="toolbar"><span class="spacer"></span>
        <button class="btn primary" ${open ? '' : 'disabled title="Hết thời gian đề xuất"'} onclick="A.topicForm()">+ Đề xuất đề tài</button></div>
      ${table(['Mã', 'Tên đề tài', 'Số SV', 'Đã nhận', 'Trạng thái', 'Góp ý', 'Thao tác'], mine.map(t => `<tr>
        <td class="nowrap">${t.id}</td><td>${esc(t.title)}</td><td class="num">${t.slots}</td><td class="num">${topicTaken(t)}</td><td>${sbadge(t.status)}</td>
        <td class="small">${esc(t.comment)}</td>
        <td class="nowrap"><button class="link-btn" onclick="A.viewTopic('${t.id}')">Xem</button>
          ${topicLocked(t) ? '' : `<button class="link-btn" onclick="A.topicForm('${t.id}')">Sửa</button><button class="link-btn red" onclick="A.topicDel('${t.id}')">Xóa</button>`}</td></tr>`),
        'Bạn chưa đề xuất đề tài nào.')}`);
  },
};
A.topicForm = id => {
  const t = id ? topic(id) : { title: '', desc: '', req: '', slots: 2 };
  openModal({
    title: id ? `Sửa đề tài ${id}` : 'Đề xuất đề tài mới',
    body: `<div class="field"><label for="tp-title">Tên đề tài *</label><input id="tp-title" type="text" value="${esc(t.title)}"></div>
      <div class="field"><label for="tp-desc">Mô tả, mục tiêu *</label><textarea id="tp-desc">${esc(t.desc)}</textarea></div>
      <div class="field"><label for="tp-req">Yêu cầu đối với sinh viên</label><textarea id="tp-req">${esc(t.req)}</textarea></div>
      <div class="field"><label for="tp-slots">Số sinh viên tối đa (1–3) *</label><input id="tp-slots" type="number" min="1" max="3" value="${t.slots}" style="max-width:120px"></div>
      <div id="tp-warn"></div>`,
    footer: `<button class="btn primary" id="tp-save">${id ? 'Lưu thay đổi' : 'Gửi đề xuất'}</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  let confirmedDup = false;
  $('#tp-save').onclick = () => {
    clearErrs($('.modal'));
    const u = me(), l = lecturer(u.id);
    const title = val('tp-title'), desc = val('tp-desc'), slots = Number(val('tp-slots'));
    let bad = false;
    if (!title) { fieldErr('tp-title', 'Vui lòng nhập tên đề tài.'); bad = true; }
    if (!desc) { fieldErr('tp-desc', 'Vui lòng nhập mô tả.'); bad = true; }
    if (!(slots >= 1 && slots <= 3)) { fieldErr('tp-slots', 'Số sinh viên tối đa từ 1 đến 3.'); bad = true; }
    if (bad) return;
    const used = DB.topics.filter(x => x.gv === u.id && x.status !== 'Từ chối' && x.id !== id).reduce((a, x) => a + x.slots, 0);
    if (used + slots > l.quota * 1.5) return fieldErr('tp-slots', `Tổng số chỗ vượt 1,5 lần hạn mức (${used} + ${slots} > ${l.quota * 1.5}).`);
    const dups = [...DB.topics.filter(x => x.id !== id).map(x => ({ code: x.id, title: x.title, src: 'Đợt hiện tại' })),
      ...DB.archive.map(a => ({ code: a.id, title: a.title, src: 'Kho lưu trữ ' + a.period }))]
      .map(x => ({ ...x, sim: similarity(title, x.title) })).filter(x => x.sim > 0.8);
    if (dups.length && !confirmedDup) {
      $('#tp-warn').innerHTML = `<div class="alert warn"><b>Tên đề tài gần trùng với:</b><ul style="margin:6px 0">${dups.map(d => `<li>${d.code} – ${esc(d.title)} (${d.src}, tương đồng ${Math.round(d.sim * 100)}%)</li>`).join('')}</ul>Nhấn lại nút để vẫn gửi đề xuất.</div>`;
      confirmedDup = true; return;
    }
    if (id) {
      Object.assign(topic(id), { title, desc, req: val('tp-req'), slots, status: 'Chờ duyệt', comment: '' });
    } else {
      const n = Math.max(0, ...DB.topics.map(x => Number(x.id.split('-').pop()) || 0)) + 1;
      DB.topics.push({ id: 'DT-KTPM-' + String(n).padStart(3, '0'), title, desc, req: val('tp-req'), slots, gv: u.id, status: 'Chờ duyệt', comment: '' });
    }
    notifyRole(u.roles.includes('TBM') ? 'GVU' : 'TBM', `${u.name} ${id ? 'cập nhật' : 'đề xuất'} đề tài "${title}" chờ phê duyệt.`);
    save(); closeModal(); render(); toast(id ? 'Đã cập nhật, đề tài chuyển sang chờ duyệt.' : 'Đã gửi đề xuất đề tài.', 'ok');
  };
};
A.topicDel = id => {
  const t = topic(id);
  if (topicLocked(t)) { toast('Không thể xóa đề tài đã duyệt và có sinh viên đăng ký.', 'err'); return; }
  if (!confirm(`Xóa đề tài ${id}?`)) return;
  DB.topics = DB.topics.filter(x => x.id !== id);
  DB.requests.filter(r => r.topicId === id && r.status === 'Chờ xét').forEach(r => { r.status = 'Đã hủy'; r.reason = 'Đề tài đã bị thu hồi'; notify(student(r.code).uid, `Đề tài ${id} đã bị giảng viên thu hồi, nguyện vọng của bạn bị hủy.`); });
  save(); render(); toast('Đã xóa đề tài.');
};

/* ---------- UC2.2 Phê duyệt đề tài ---------- */
UI.apFilter = 'Chờ duyệt';
VIEWS.approve = {
  title: 'Duyệt đề tài',
  render() {
    const u = me();
    // TBM duyệt đề tài của bộ môn trừ đề tài của chính mình; giáo vụ duyệt đề tài do TBM đề xuất.
    const scope = DB.topics.filter(t => role() === 'GVU' ? user(t.gv).roles.includes('TBM') : t.gv !== u.id);
    const list = scope.filter(t => UI.apFilter === 'Tất cả' || t.status === UI.apFilter);
    return page(role() === 'GVU' ? 'Duyệt đề tài của trưởng bộ môn' : 'Phê duyệt đề tài', `Hạn xử lý: ${fmtDate(period().phases[0][1])} · ${scope.filter(t => t.status === 'Chờ duyệt').length} đề tài đang chờ`,
      `<div class="toolbar"><select aria-label="Lọc trạng thái" onchange="UI.apFilter=this.value;render()">
        ${['Chờ duyệt', 'Đã duyệt', 'Yêu cầu sửa', 'Từ chối', 'Tất cả'].map(s => `<option ${s === UI.apFilter ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      ${table(['Mã', 'Tên đề tài', 'Giảng viên', 'Số SV', 'Trạng thái', ''], list.map(t => `<tr><td class="nowrap">${t.id}</td><td>${esc(t.title)}</td>
        <td>${esc(uname(t.gv))}</td><td class="num">${t.slots}</td><td>${sbadge(t.status)}</td>
        <td><button class="link-btn" onclick="A.apOpen('${t.id}')">${t.status === 'Chờ duyệt' ? 'Xét duyệt' : 'Xem'}</button></td></tr>`), 'Không có đề tài phù hợp.')}`);
  },
};
A.apOpen = id => {
  const t = topic(id);
  const sims = [...DB.topics.filter(x => x.id !== id), ...DB.archive].map(x => ({ x, s: similarity(t.title, x.title) })).filter(o => o.s > 0.5);
  openModal({
    title: `Xét duyệt đề tài ${t.id}`, wide: true,
    body: `<h3>${esc(t.title)}</h3><dl class="kv"><dt>Giảng viên</dt><dd>${esc(uname(t.gv))}</dd><dt>Số SV tối đa</dt><dd>${t.slots}</dd>
      <dt>Mô tả</dt><dd>${esc(t.desc)}</dd><dt>Yêu cầu</dt><dd>${esc(t.req)}</dd><dt>Trạng thái</dt><dd>${sbadge(t.status)}</dd></dl>
      ${sims.length ? `<div class="alert warn" style="margin-top:12px">Đề tài tương tự: ${sims.map(o => `${o.x.id} – ${esc(o.x.title)} (${Math.round(o.s * 100)}%)`).join('; ')}</div>` : ''}
      ${t.status === 'Chờ duyệt' ? `<div class="field" style="margin-top:12px"><label for="ap-cmt">Góp ý (bắt buộc khi yêu cầu sửa / từ chối)</label><textarea id="ap-cmt"></textarea></div>` : ''}`,
    footer: t.status === 'Chờ duyệt' ? `<button class="btn success" onclick="A.apDecide('${id}','Đã duyệt')">Phê duyệt</button>
      <button class="btn" onclick="A.apDecide('${id}','Yêu cầu sửa')">Yêu cầu chỉnh sửa</button>
      <button class="btn danger" onclick="A.apDecide('${id}','Từ chối')">Từ chối</button>` : `<button class="btn" onclick="closeModal()">Đóng</button>`,
  });
};
A.apDecide = (id, status) => {
  const t = topic(id);
  if (!t) { closeModal(); render(); toast('Đề tài đã được giảng viên thu hồi.', 'warn'); return; }
  clearErrs($('.modal'));
  const cmt = val('ap-cmt');
  if (status !== 'Đã duyệt' && !cmt) return fieldErr('ap-cmt', 'Vui lòng nhập góp ý.');
  t.status = status; t.comment = cmt;
  notify(t.gv, `Đề tài ${t.id} ${status === 'Đã duyệt' ? 'đã được phê duyệt' : status === 'Từ chối' ? 'bị từ chối' : 'cần chỉnh sửa'}${cmt ? ': ' + cmt : '.'}`);
  save(); closeModal(); render(); toast(`Đề tài ${t.id}: ${status}.`, status === 'Đã duyệt' ? 'ok' : 'warn');
};

/* ---------- UC2.4 Xét duyệt yêu cầu hướng dẫn ---------- */
VIEWS.requests = {
  title: 'Yêu cầu hướng dẫn',
  render() {
    const u = me(), left = quotaLeft(u.id);
    const all = DB.requests.filter(r => topic(r.topicId) && topic(r.topicId).gv === u.id);
    const pending = all.filter(r => r.status === 'Chờ xét').sort((a, b) => a.nv - b.nv || (a.date < b.date ? -1 : 1));
    const done = all.filter(r => r.status !== 'Chờ xét');
    return page('Yêu cầu hướng dẫn', `Hạn mức: ${lecturer(u.id).quota} · Đã nhận ${supervisedCount(u.id)} · Còn ${left} chỗ`,
      `${left <= 0 ? '<div class="alert warn">Bạn đã hết hạn mức hướng dẫn, không thể chấp nhận thêm sinh viên.</div>' : ''}
      ${table(['Sinh viên', 'GPA', 'Đề tài', 'NV', 'Lời nhắn', 'Ngày gửi', 'Thao tác'], pending.map(r => {
        const s = student(r.code), t = topic(r.topicId), full = topicTaken(t) >= t.slots;
        return `<tr class="${r.nv === 1 ? 'hl' : ''}"><td><b>${esc(s.name)}</b><div class="small muted">${s.code}</div></td><td>${s.gpa.toFixed(2)}</td>
          <td>${t.id}<div class="small muted">${esc(t.title)}</div></td><td>NV${r.nv}</td><td class="small">${esc(r.msg)}${r.cv ? `<br>📎 ${esc(r.cv)}` : ''}</td>
          <td class="nowrap small">${fmtDT(r.date)}</td>
          <td class="nowrap"><button class="link-btn green" ${left <= 0 || full ? `disabled title="${full ? 'Đề tài đã đủ sinh viên' : 'Hết hạn mức'}"` : ''} onclick="A.reqAccept(${r.id})">Chấp nhận</button>
            <button class="link-btn red" onclick="A.reqReject(${r.id})">Từ chối</button></td></tr>`;
      }), 'Không có nguyện vọng chờ xét.')}
      <h2 style="margin:26px 0 10px">Đã xử lý</h2>
      ${table(['Sinh viên', 'Đề tài', 'NV', 'Trạng thái', 'Ghi chú'], done.map(r => `<tr><td>${esc(student(r.code).name)}</td><td>${r.topicId}</td><td>NV${r.nv}</td>
        <td>${sbadge(r.status)}</td><td class="small">${esc(r.reason)}</td></tr>`), 'Chưa có.')}`);
  },
};
A.reqAccept = rid => {
  const r = DB.requests.find(x => x.id === rid), s = student(r.code), t = topic(r.topicId), u = me();
  if (s.gvhd) { // UC2.4 E2
    r.status = 'Đã hủy'; r.reason = 'Sinh viên đã được giảng viên khác chấp nhận';
    save(); render(); toast('Sinh viên đã được giảng viên khác chấp nhận trước đó, nguyện vọng chuyển sang "Đã hủy".', 'warn'); return;
  }
  if (quotaLeft(u.id) <= 0 || topicTaken(t) >= t.slots) { toast('Đã hết hạn mức hoặc đề tài đã đủ sinh viên.', 'err'); return; }
  s.gvhd = u.id; s.topicId = t.id;
  r.status = 'Chấp nhận'; r.reason = '';
  DB.requests.filter(x => x.code === s.code && x.id !== rid && x.status === 'Chờ xét').forEach(x => {
    x.status = 'Đã hủy'; x.reason = 'Sinh viên đã được giảng viên khác chấp nhận';
    notify(topic(x.topicId).gv, `Nguyện vọng của ${s.name} vào đề tài ${x.topicId} đã tự hủy do sinh viên được giảng viên khác chấp nhận.`);
  });
  notify(s.uid, `${u.name} đã chấp nhận hướng dẫn bạn với đề tài ${t.id} – ${t.title}.`);
  save(); render(); toast(`Đã nhận ${s.name}.`, 'ok');
};
A.reqReject = rid => {
  const r = DB.requests.find(x => x.id === rid);
  openModal({
    title: 'Từ chối nguyện vọng',
    body: `<p>Sinh viên: <b>${esc(student(r.code).name)}</b> – đề tài ${r.topicId}</p>
      <div class="field"><label for="rj-reason">Lý do từ chối *</label><textarea id="rj-reason"></textarea></div>`,
    footer: `<button class="btn danger" id="rj-ok">Từ chối</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#rj-ok').onclick = () => {
    clearErrs($('.modal'));
    const reason = val('rj-reason');
    if (!reason) return fieldErr('rj-reason', 'Vui lòng nhập lý do.');
    r.status = 'Từ chối'; r.reason = reason;
    notify(student(r.code).uid, `${me().name} đã từ chối nguyện vọng của bạn (đề tài ${r.topicId}): ${reason}`);
    save(); closeModal(); render(); toast('Đã từ chối nguyện vọng.');
  };
};

/* ---------- UC2.5 Phân công giảng viên hướng dẫn ---------- */
const assignableTopics = () => DB.topics.filter(t => t.status === 'Đã duyệt' && topicTaken(t) < t.slots && quotaLeft(t.gv) > 0);
VIEWS.assign = {
  title: 'Phân công GVHD',
  render() {
    const unassigned = DB.students.filter(s => !s.gvhd);
    const totalLeft = DB.lecturers.reduce((a, l) => a + Math.max(quotaLeft(l.uid), 0), 0);
    const opts = assignableTopics();
    return page('Phân công giảng viên hướng dẫn', `Đợt ${period().id} · Bộ môn Kỹ thuật phần mềm`,
      `${DB.assignLocked ? '<div class="alert ok">Phân công đã được chốt. Mọi thay đổi GVHD do giáo vụ khoa thực hiện và phải ghi lý do.</div>' : ''}
      ${totalLeft < unassigned.length ? `<div class="alert warn">Tổng hạn mức còn lại (${totalLeft}) nhỏ hơn số sinh viên chưa có GVHD (${unassigned.length}). Đề nghị giáo vụ khoa tăng hạn mức (UC1.5).</div>` : ''}
      <div class="cards">
        <div class="card orange"><div class="label">Sinh viên chưa có GVHD</div><div class="value c">${unassigned.length}</div></div>
        <div class="card green"><div class="label">Tổng hạn mức còn lại</div><div class="value c">${totalLeft}</div></div>
        <div class="card blue"><div class="label">Đề tài còn chỗ</div><div class="value c">${opts.length}</div></div>
      </div>
      <div class="toolbar"><h2 style="flex:1">Sinh viên chưa có GVHD</h2>
        ${DB.assignLocked ? '' : `<button class="btn" onclick="A.autoAssign()">Gợi ý tự động</button><button class="btn primary" onclick="A.lockAssign()">Chốt phân công</button>`}</div>
      ${table(['Mã SV', 'Họ tên', 'GPA', 'NV đang chờ', 'Phân công vào đề tài'], unassigned.map(s => `<tr><td>${s.code}</td><td>${esc(s.name)}</td><td>${s.gpa.toFixed(2)}</td>
        <td class="small">${DB.requests.filter(r => r.code === s.code && r.status === 'Chờ xét').map(r => `NV${r.nv}: ${r.topicId}`).join('<br>') || '–'}</td>
        <td>${DB.assignLocked ? '–' : `<select aria-label="Chọn đề tài" onchange="A.assignTo('${s.code}',this.value)"><option value="">– Chọn đề tài / GVHD –</option>
          ${opts.map(t => `<option value="${t.id}">${t.id} · ${esc(uname(t.gv))} · còn ${t.slots - topicTaken(t)} chỗ</option>`).join('')}</select>`}</td></tr>`),
        'Tất cả sinh viên đã có GVHD.')}
      <h2 style="margin:26px 0 10px">Hạn mức giảng viên</h2>
      ${table(['Giảng viên', 'Học vị', 'Hạn mức', 'Đã nhận', 'Còn lại', ''], DB.lecturers.map(l => {
        const n = supervisedCount(l.uid);
        return `<tr><td>${esc(uname(l.uid))}</td><td>${l.degree}</td><td class="num">${l.quota}</td><td class="num">${n}</td><td class="num">${l.quota - n}</td>
          <td style="width:30%"><div class="progress"><div style="width:${Math.min(100, n / l.quota * 100)}%"></div></div></td></tr>`;
      }))}`);
  },
};
function doAssign(s, t, auto) {
  s.gvhd = t.gv; s.topicId = t.id;
  DB.requests.filter(r => r.code === s.code && r.status === 'Chờ xét').forEach(r => { r.status = 'Đã hủy'; r.reason = 'Bộ môn đã phân công GVHD'; });
  notify(s.uid, `Bộ môn đã phân công bạn vào đề tài ${t.id} với GVHD ${uname(t.gv)}.`);
  notify(t.gv, `Bộ môn phân công sinh viên ${s.name} (${s.code}) cho bạn hướng dẫn${auto ? ' (gợi ý tự động)' : ''}.`);
}
A.assignTo = (code, tid) => {
  if (!tid) return;
  const s = student(code), t = topic(tid);
  if (quotaLeft(t.gv) <= 0 || topicTaken(t) >= t.slots) { toast('Không phân công vượt hạn mức.', 'err'); return; }
  doAssign(s, t, false); save(); render(); toast(`Đã phân công ${s.name} → ${uname(t.gv)}.`, 'ok');
};
A.autoAssign = () => {
  let n = 0;
  DB.students.filter(s => !s.gvhd).forEach(s => {
    const t = assignableTopics().sort((a, b) => quotaLeft(b.gv) - quotaLeft(a.gv))[0];
    if (t) { doAssign(s, t, true); n++; }
  });
  save(); render(); toast(n ? `Đã gợi ý phân công cho ${n} sinh viên.` : 'Không còn đề tài phù hợp để phân công.', n ? 'ok' : 'warn');
};
A.lockAssign = () => {
  const left = DB.students.filter(s => !s.gvhd);
  if (left.length) { toast('Chưa thể chốt: còn ' + left.length + ' sinh viên chưa có GVHD (' + left.map(s => s.name).join(', ') + ').', 'err'); return; }
  if (!confirm('Chốt phân công GVHD cho đợt ' + DB.currentPeriod + '?')) return;
  DB.assignLocked = true; notifyRole('GVU', 'Trưởng bộ môn đã chốt phân công GVHD đợt ' + DB.currentPeriod + '.');
  save(); render(); toast('Đã chốt phân công.', 'ok');
};

/* ---------- UC3.3 + UC4.2 Sinh viên hướng dẫn ---------- */
UI.supSel = null;
VIEWS.supervise = {
  title: 'Sinh viên hướng dẫn',
  render() {
    const mine = DB.students.filter(s => s.gvhd === me().id);
    if (!mine.length) return page('Sinh viên hướng dẫn', '', '<div class="alert">Bạn chưa hướng dẫn sinh viên nào trong đợt này.</div>');
    if (!mine.some(s => s.code === UI.supSel)) UI.supSel = mine[0].code;
    const s = student(UI.supSel), plan = planOf(s.code), th = thesisOf(s.code), latest = latestReports(s.code), pr = progressOf(s.code);
    const reps = DB.reports.filter(r => r.code === s.code).sort((a, b) => b.date < a.date ? -1 : 1);
    return page('Sinh viên hướng dẫn', `${mine.length} sinh viên · Đợt ${period().id}`,
      `<div class="cols side">
        <div class="panel"><div class="ph"><h2>Danh sách</h2></div><div class="list-pick">
          ${mine.map(x => { const p = progressOf(x.code); const wait = DB.reports.some(r => r.code === x.code && r.status === 'Chờ đánh giá') || planOf(x.code)?.status === 'Chờ duyệt' || (thesisOf(x.code) && !thesisOf(x.code).confirm);
            return `<div class="item ${x.code === s.code ? 'sel' : ''}" tabindex="0" role="button" onclick="UI.supSel='${x.code}';render()" onkeydown="if(event.key==='Enter'){UI.supSel='${x.code}';render()}">
              <b>${esc(x.name)} <span class="muted small">${x.code}</span></b>${badge(p.label, p.cls)} ${wait ? badge('Cần xử lý', 'blue') : ''}</div>`; }).join('')}
        </div></div>
        <div>
          <div class="panel"><div class="ph"><h2>${esc(s.name)} – ${s.code}</h2>${badge(pr.label, pr.cls)}</div><div class="pb">
            <dl class="kv"><dt>Đề tài</dt><dd>${s.topicId} – ${esc(topic(s.topicId).title)}</dd><dt>Hoàn thành</dt><dd>${pr.pct}% (mốc ${pr.cur}/${pr.total})</dd></dl></div></div>

          <div class="panel"><div class="ph"><h2>Kế hoạch thực hiện</h2>${plan ? sbadge(plan.status) : badge('Chưa lập', 'grey')}</div><div class="pb">
            ${plan ? table(['#', 'Mốc', 'Hạn'], plan.milestones.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.title)}${m.desc ? `<div class="small muted">${esc(m.desc)}</div>` : ''}</td><td>${fmtDate(m.due)}</td></tr>`))
              + (plan.status === 'Chờ duyệt' ? `<div class="toolbar" style="margin:12px 0 0"><button class="btn success" onclick="A.planDecide('${s.code}',true)">Duyệt kế hoạch</button>
                <button class="btn" onclick="A.planDecide('${s.code}',false)">Yêu cầu sửa</button></div>` : '')
              : '<p class="muted">Sinh viên chưa gửi kế hoạch.</p>'}
          </div></div>

          <div class="panel"><div class="ph"><h2>Báo cáo tiến độ</h2></div><div class="pb">
            ${table(['Mốc', 'Thời điểm nộp', 'Tệp / ghi chú', 'Trạng thái', ''], reps.map(r => `<tr><td>Mốc ${r.m + 1}</td>
              <td class="nowrap small">${fmtDT(r.date)} ${r.late ? badge('Nộp muộn', 'orange') : ''}</td>
              <td class="small">${esc(r.file)}<br><span class="muted">${esc(r.note)}</span>${r.comment ? `<br><b>Nhận xét:</b> ${esc(r.comment)}` : ''}</td>
              <td>${sbadge(r.status)}</td><td>${latest[r.m] === r ? `<button class="link-btn" onclick="A.evalOpen(${r.id})">${r.status === 'Chờ đánh giá' ? 'Đánh giá' : 'Sửa'}</button>` : ''}</td></tr>`), 'Chưa có báo cáo.')}
          </div></div>

          <div class="panel"><div class="ph"><h2>Xác nhận đủ điều kiện bảo vệ</h2></div><div class="pb">
            ${!th ? '<p class="muted">Sinh viên chưa nộp quyển đồ án.</p>' : `
              <dl class="kv"><dt>Quyển đồ án</dt><dd>${esc(th.file)} (${th.size} MB) · nộp ${fmtDT(th.date)}</dd><dt>Tỷ lệ trùng lặp</dt><dd>${th.sim}%</dd></dl>
              ${th.confirm ? `<div class="alert ${th.confirm.ok ? 'ok' : 'err'}" style="margin-top:12px">${th.confirm.ok ? 'Đã xác nhận đủ điều kiện' : 'Không đủ điều kiện'} · Điểm GVHD: <b>${fmtScore(th.confirm.score)}</b> · ${esc(th.confirm.comment)}</div>` : `
              <div class="grid2" style="margin-top:12px">
                <div class="field"><label>Kết luận *</label><label class="check"><input type="radio" name="cf-ok" value="1" checked> Đủ điều kiện bảo vệ</label>
                  <label class="check"><input type="radio" name="cf-ok" value="0"> Không đủ điều kiện</label></div>
                <div class="field"><label for="cf-score">Điểm GVHD (0–10) *</label><input id="cf-score" type="number" step="0.1" min="0" max="10"></div></div>
              <div class="field"><label for="cf-cmt">Nhận xét *</label><textarea id="cf-cmt"></textarea></div>
              <button class="btn primary" onclick="A.confirmThesis('${s.code}')">Xác nhận phiếu</button>`}`}
          </div></div>
        </div></div>`);
  },
};
A.planDecide = (code, ok) => {
  const plan = planOf(code), s = student(code);
  let cmt = '';
  if (!ok) { cmt = prompt('Góp ý cho sinh viên (bắt buộc):') || ''; if (!cmt.trim()) { toast('Cần nhập góp ý khi yêu cầu sửa.', 'err'); return; } }
  plan.status = ok ? 'Đã duyệt' : 'Yêu cầu sửa'; plan.comment = cmt.trim();
  notify(s.uid, ok ? 'GVHD đã duyệt kế hoạch thực hiện của bạn.' : 'GVHD yêu cầu sửa kế hoạch: ' + cmt);
  save(); render(); toast(ok ? 'Đã duyệt kế hoạch.' : 'Đã gửi yêu cầu sửa.', ok ? 'ok' : 'warn');
};
A.evalOpen = rid => {
  const r = DB.reports.find(x => x.id === rid);
  openModal({
    title: `Đánh giá báo cáo mốc ${r.m + 1} – ${student(r.code).name}`,
    body: `<p class="small muted">${esc(r.file)} · ${fmtDT(r.date)}${r.late ? ' · nộp muộn' : ''}</p><p>${esc(r.note)}</p>
      <div class="field"><label>Đánh giá *</label><div style="display:flex;gap:22px;flex-wrap:wrap">
        ${['Đạt', 'Cần bổ sung', 'Chậm tiến độ'].map(s => `<label class="check"><input type="radio" name="ev-st" value="${s}" ${r.status === s || (r.status === 'Chờ đánh giá' && s === 'Đạt') ? 'checked' : ''}> ${s}</label>`).join('')}</div></div>
      <div class="field"><label for="ev-cmt">Nhận xét</label><textarea id="ev-cmt">${esc(r.comment)}</textarea><div class="hint">Bắt buộc khi đánh giá "Cần bổ sung" hoặc "Chậm tiến độ".</div></div>`,
    footer: `<button class="btn primary" id="ev-ok">Lưu đánh giá</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
  $('#ev-ok').onclick = () => {
    clearErrs($('.modal'));
    const st = $('input[name=ev-st]:checked').value, cmt = val('ev-cmt');
    if (st !== 'Đạt' && !cmt) return fieldErr('ev-cmt', 'Vui lòng nhập nhận xét.');
    r.status = st; r.comment = cmt;
    notify(student(r.code).uid, `GVHD đã đánh giá báo cáo mốc ${r.m + 1}: ${st}.`);
    save(); closeModal(); render(); toast('Đã lưu đánh giá.', 'ok');
  };
};
A.confirmThesis = code => {
  clearErrs();
  const ok = $('input[name=cf-ok]:checked').value === '1', score = parseFloat(val('cf-score')), cmt = val('cf-cmt');
  if (isNaN(score) || score < 0 || score > 10) return fieldErr('cf-score', 'Điểm phải trong khoảng 0–10.');
  if (!cmt) return fieldErr('cf-cmt', 'Vui lòng nhập nhận xét.');
  thesisOf(code).confirm = { ok, score: round1(score), comment: cmt };
  notify(student(code).uid, ok ? 'GVHD đã xác nhận bạn đủ điều kiện bảo vệ.' : 'GVHD xác nhận bạn chưa đủ điều kiện bảo vệ: ' + cmt);
  notifyRole('GVU', `${uname(me().id)} đã xác nhận phiếu của ${student(code).name}: ${ok ? 'đủ điều kiện' : 'không đủ điều kiện'}.`);
  save(); render(); toast('Đã xác nhận phiếu GVHD.', 'ok');
};

/* ---------- UC4.5 Nhận xét phản biện ---------- */
VIEWS.review = {
  title: 'Phản biện',
  render() {
    const list = DB.defenses.filter(d => d.reviewer === me().id);
    if (!list.length) return page('Nhận xét phản biện', '', '<div class="alert">Bạn chưa được phân công phản biện sinh viên nào.</div>');
    if (!list.some(d => d.code === UI.rvSel)) UI.rvSel = list[0].code;
    const s = student(UI.rvSel), d = defenseOf(s.code), c = council(d.council), th = thesisOf(s.code), rv = reviewOf(s.code);
    const lockedPub = !!DB.published[d.council];
    const deadline = new Date(c.date); deadline.setDate(deadline.getDate() - 2);
    return page('Nhận xét phản biện', `${list.length} sinh viên được phân công`,
      `<div class="cols side">
        <div class="panel"><div class="ph"><h2>Sinh viên phản biện</h2></div><div class="list-pick">
          ${list.map(x => `<div class="item ${x.code === s.code ? 'sel' : ''}" tabindex="0" role="button" onclick="UI.rvSel='${x.code}';render()">
            <b>${esc(student(x.code).name)}</b>${reviewOf(x.code) ? badge('Đã gửi', 'green') : badge('Chưa gửi', 'grey')} <span class="small muted">${x.council}</span></div>`).join('')}
        </div></div>
        <div class="panel"><div class="ph"><h2>Phiếu phản biện: ${esc(s.name)} (${s.code})</h2></div><div class="pb">
          <dl class="kv"><dt>Đề tài</dt><dd>${esc(topic(s.topicId).title)}</dd><dt>GVHD</dt><dd>${esc(uname(s.gvhd))}</dd>
            <dt>Quyển đồ án</dt><dd>${th ? `<a href="#" onclick="toast('(Demo) Mở ${esc(th.file)}');return false">${esc(th.file)}</a> · trùng lặp ${th.sim}%` : '–'}</dd>
            <dt>Bảo vệ</dt><dd>${c.id} · ${d.time} ${fmtDate(c.date)} · ${esc(c.room)}</dd>
            <dt>Hạn gửi phiếu</dt><dd>${fmtDate(deadline.toISOString())} (trước ngày bảo vệ 2 ngày)</dd></dl>
          <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
          <div class="field"><label for="rv-cmt">Nhận xét chung *</label><textarea id="rv-cmt" ${lockedPub ? 'disabled' : ''}>${esc(rv ? rv.comment : '')}</textarea></div>
          <div class="field"><label for="rv-q">Câu hỏi cho sinh viên</label><textarea id="rv-q" ${lockedPub ? 'disabled' : ''}>${esc(rv ? rv.questions : '')}</textarea></div>
          <div class="grid2"><div class="field"><label for="rv-score">Điểm phản biện (0–10) *</label><input id="rv-score" type="number" step="0.1" min="0" max="10" value="${rv ? rv.score : ''}" ${lockedPub ? 'disabled' : ''}></div>
            <div class="field"><label>Đề nghị *</label><label class="check"><input type="radio" name="rv-allow" value="1" ${!rv || rv.allow ? 'checked' : ''} ${lockedPub ? 'disabled' : ''}> Cho phép bảo vệ</label>
              <label class="check"><input type="radio" name="rv-allow" value="0" ${rv && !rv.allow ? 'checked' : ''} ${lockedPub ? 'disabled' : ''}> Không cho phép</label></div></div>
          ${lockedPub ? '<div class="alert">Kết quả đã công bố, không thể sửa phiếu.</div>' : `<button class="btn primary" onclick="A.reviewSave('${s.code}')">${rv ? 'Cập nhật phiếu' : 'Gửi phiếu phản biện'}</button>`}
        </div></div></div>`);
  },
};
A.reviewSave = code => {
  clearErrs();
  const cmt = val('rv-cmt'), score = parseFloat(val('rv-score'));
  if (!cmt) return fieldErr('rv-cmt', 'Vui lòng nhập nhận xét.');
  if (isNaN(score) || score < 0 || score > 10) return fieldErr('rv-score', 'Điểm phải trong khoảng 0–10.');
  let rv = reviewOf(code);
  if (!rv) { rv = { code, uid: me().id }; DB.reviews.push(rv); }
  Object.assign(rv, { comment: cmt, questions: val('rv-q'), score: round1(score), allow: $('input[name=rv-allow]:checked').value === '1', date: nowISO() });
  notify(student(code).uid, 'Giảng viên phản biện đã gửi nhận xét cho đồ án của bạn.');
  notifyRole('GVU', `${me().name} đã gửi phiếu phản biện cho ${student(code).name}.`);
  save(); render(); toast('Đã gửi phiếu phản biện.', 'ok');
};

/* ---------- UC5.1 Chấm điểm bảo vệ ---------- */
VIEWS.grading = {
  title: 'Chấm điểm',
  render() {
    const u = me();
    const cs = DB.councils.filter(c => c.members.some(m => m.uid === u.id));
    if (!cs.length) return page('Chấm điểm bảo vệ', '', '<div class="alert">Bạn chưa là thành viên hội đồng bảo vệ nào.</div>');
    if (!cs.some(c => c.id === UI.grC)) UI.grC = cs[0].id;
    const c = council(UI.grC);
    const ds = DB.defenses.filter(d => d.council === c.id).sort((a, b) => a.time < b.time ? -1 : 1);
    if (!ds.some(d => d.code === UI.grS)) UI.grS = ds[0] && ds[0].code;
    const pub = !!DB.published[c.id];
    const myRole = c.members.find(m => m.uid === u.id).role;
    let form = '<p class="muted">Hội đồng chưa có sinh viên.</p>';
    if (UI.grS) {
      const s = student(UI.grS), sc = scoreOf(s.code, u.id), th = thesisOf(s.code), rv = reviewOf(s.code);
      const vals = sc ? sc.c : CRITERIA.map(() => '');
      form = `<p class="muted">Tham khảo: Điểm GVHD ${fmtScore(th && th.confirm ? th.confirm.score : null)} • Điểm phản biện ${fmtScore(rv ? rv.score : null)}</p>
        ${table(['Tiêu chí', 'Điểm tối đa', 'Điểm chấm'], CRITERIA.map((k, i) => `<tr><td>${k.name}</td><td>${k.max.toFixed(1)}</td>
          <td><input type="number" class="gr-in" id="gr-${i}" step="0.1" min="0" max="${k.max}" value="${vals[i]}" ${pub ? 'disabled' : ''} oninput="A.grSum()" aria-label="${k.name}"></td></tr>`))}
        <p style="font-size:17px"><b>Tổng điểm thành viên:</b> <b id="gr-total" style="color:var(--primary)">–</b> / 10</p>
        <div class="field"><label for="gr-cmt">Nhận xét</label><textarea id="gr-cmt" ${pub ? 'disabled' : ''}>${esc(sc ? sc.comment : '')}</textarea></div>
        ${pub ? '<div class="alert">Kết quả đã công bố, không thể sửa phiếu.</div>' : `<div class="right"><button class="btn primary" onclick="A.grSave('${s.code}')">Lưu phiếu</button></div>`}`;
    }
    return page(`Chấm điểm bảo vệ – ${c.id} (${fmtDate(c.date)}, ${c.room})`, `Vai trò của bạn: ${myRole}${cs.length > 1 ? ' · ' + cs.map(x => x.id === c.id ? `<b>${x.id}</b>` : `<a href="#" onclick="UI.grC='${x.id}';UI.grS=null;render();return false">${x.id}</a>`).join(' · ') : ''}`,
      `<div class="cols side">
        <div class="panel"><div class="ph"><h2>Sinh viên trong hội đồng</h2></div><div class="list-pick">
          ${ds.map(d => { const done = !!scoreOf(d.code, u.id); return `<div class="item ${d.code === UI.grS ? 'sel' : ''}" tabindex="0" role="button" onclick="UI.grS='${d.code}';render()">
            <b>${d.time} &nbsp;${esc(student(d.code).name)}</b>${d.code === UI.grS && !done ? badge('Đang chấm', 'blue') : done ? badge('Đã chấm', 'green') : badge('Chưa chấm', 'grey')}</div>`; }).join('')}
        </div></div>
        <div class="panel"><div class="ph"><h2>Phiếu chấm: ${UI.grS ? `${esc(student(UI.grS).name)} (${UI.grS})` : ''}</h2></div><div class="pb">${form}</div></div>
      </div>`);
  },
  after() { if ($('#gr-total')) A.grSum(); },
};
A.grSum = () => {
  const vs = CRITERIA.map((k, i) => parseFloat($('#gr-' + i).value));
  $('#gr-total').textContent = vs.some(isNaN) ? '–' : fmtScore(round1(vs.reduce((a, b) => a + b, 0)));
};
A.grSave = code => {
  clearErrs();
  const vs = CRITERIA.map((k, i) => parseFloat($('#gr-' + i).value));
  let bad = false;
  vs.forEach((v, i) => { if (isNaN(v) || v < 0 || v > CRITERIA[i].max) { fieldErr('gr-' + i, `0 – ${CRITERIA[i].max}`); bad = true; } });
  if (bad) { toast('Điểm tiêu chí vượt thang điểm hoặc còn trống.', 'err'); return; }
  if (DB.published[defenseOf(code).council]) { toast('Kết quả đã công bố, không thể sửa phiếu.', 'err'); return; }
  let sc = scoreOf(code, me().id);
  if (!sc) { sc = { code, uid: me().id }; DB.scores.push(sc); }
  sc.c = vs.map(round1); sc.comment = val('gr-cmt');
  save(); render(); toast(`Đã lưu phiếu chấm: ${fmtScore(scoreTotal(sc))} điểm.`, 'ok');
};
