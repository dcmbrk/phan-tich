// Màn hình của sinh viên: UC2.3, UC3.1, UC3.2, UC4.1, UC5.3 và trang chủ.
const mySV = () => studentOfUser(me().id);
const needGVHD = s => s.gvhd ? '' : `<div class="alert warn">Bạn chưa có giảng viên hướng dẫn. Chức năng này mở sau khi nguyện vọng được chấp nhận hoặc bộ môn phân công GVHD.
  <a href="#/register">Đi tới đăng ký đề tài →</a></div>`;

HOME.SV = () => {
  const s = mySV(), u = me(), p = period();
  const reqs = DB.requests.filter(r => r.code === s.code);
  const pending = reqs.filter(r => r.status === 'Chờ xét').length;
  const rejected = reqs.filter(r => r.status === 'Từ chối').length;
  const t = s.topicId && topic(s.topicId);
  const regEnd = p.phases[0][2];
  const left = daysBetween(todayISO(), regEnd);
  const plan = planOf(s.code);
  const deadlines = [];
  if (!s.gvhd) deadlines.push([regEnd, 'Hết hạn đăng ký đề tài', 'red']);
  if (!plan || plan.status !== 'Đã duyệt') deadlines.push([p.phases[1][1], 'Nộp kế hoạch thực hiện', 'grey']);
  (plan ? plan.milestones : milestoneTemplate()).forEach((m, i) => {
    const r = latestReports(s.code)[i];
    if (!r || r.status !== 'Đạt') deadlines.push([m.due, `Mốc ${i + 1}: ${m.title}`, 'grey']);
  });
  deadlines.push([p.phases[2][2], 'Hạn nộp quyển đồ án', 'grey']);
  const up = deadlines.filter(d => d[0] >= todayISO()).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(0, 3);
  return `<h1>Xin chào, ${esc(u.name)}</h1>
    <div class="page-sub">Đợt hiện hành: ${p.id} – ${esc(p.name)} &nbsp;|&nbsp; Bộ môn Kỹ thuật phần mềm</div>
    ${phaseTimeline()}
    <div class="cards">
      <div class="card orange"><div class="label">Đề tài</div><div class="value">${t ? esc(t.id) : 'Chưa có đề tài'}</div>
        <div class="note">${t ? esc(t.title) : 'Hạn đăng ký: ' + fmtDate(regEnd)}</div></div>
      <div class="card blue"><div class="label">Nguyện vọng đang chờ</div><div class="value">${pending} / 3</div>
        <div class="note">${reqs.length} đã gửi, ${rejected} bị từ chối</div></div>
      <div class="card"><div class="label">Giảng viên hướng dẫn</div><div class="value">${s.gvhd ? esc(uname(s.gvhd)) : 'Chưa phân công'}</div>
        <div class="note">${s.gvhd ? 'Tiến độ: ' + progressOf(s.code).label : left >= 0 ? `Còn ${left} ngày để đăng ký` : 'Bộ môn sẽ phân công GVHD'}</div></div>
    </div>
    <div class="cols">
      ${notifPanel()}
      <div class="panel"><div class="ph"><h2>Hạn sắp tới</h2></div><div class="pb">
        ${up.map(d => `<div class="deadline">${badge(fmtDate(d[0]), d[2])}<div>${esc(d[1])}</div></div>`).join('') || '<p class="muted">Không có hạn sắp tới.</p>'}
        ${s.gvhd ? `<a class="btn primary block" href="#/reports">Nộp báo cáo tiến độ</a>` : `<a class="btn primary block" href="#/register">Đăng ký đề tài ngay</a>`}
      </div></div>
    </div>`;
};

/* ---------- UC2.3 Đăng ký đề tài và nguyện vọng hướng dẫn ---------- */
UI.regQ = '';
function regBlockReason(s, t) {
  const mine = DB.requests.filter(r => r.code === s.code);
  if (s.gvhd) return 'Bạn đã có GVHD';
  if (topicTaken(t) >= t.slots || quotaLeft(t.gv) <= 0) return 'Hết chỗ';
  if (mine.some(r => r.topicId === t.id && r.status !== 'Đã hủy')) return 'Đã đăng ký';
  if (mine.filter(r => r.status === 'Chờ xét').length >= 3) return 'Đủ 3 NV';
  return '';
}
function regTableRows() {
  const s = mySV(), q = UI.regQ.toLowerCase();
  return DB.topics.filter(t => t.status === 'Đã duyệt')
    .filter(t => !q || (t.id + t.title + uname(t.gv)).toLowerCase().includes(q))
    .map(t => {
      const why = regBlockReason(s, t);
      const left = t.slots - topicTaken(t);
      return `<tr><td class="nowrap">${t.id}</td><td>${esc(t.title)}</td><td>${esc(uname(t.gv))}</td><td class="num">${Math.max(left, 0)}/${t.slots}</td>
        <td class="nowrap"><button class="link-btn" onclick="A.viewTopic('${t.id}')">Xem</button>
        ${why === 'Hết chỗ' ? badge('Hết chỗ', 'grey') : `<button class="link-btn" ${why ? `disabled title="${esc(why)}"` : ''} onclick="A.regOpen('${t.id}')">Đăng ký</button>`}</td></tr>`;
    });
}
VIEWS.register = {
  title: 'Đăng ký đề tài',
  render() {
    const s = mySV(), p = period();
    const mine = DB.requests.filter(r => r.code === s.code).sort((a, b) => a.nv - b.nv);
    const pending = mine.filter(r => r.status === 'Chờ xét').length;
    const open = todayISO() <= p.phases[0][2];
    return page(`Ngân hàng đề tài – Đợt ${p.id}`, '',
      `${s.gvhd ? `<div class="alert ok">Bạn đã có đề tài <b>${esc(s.topicId)}</b> với GVHD <b>${esc(uname(s.gvhd))}</b>. Ngân hàng đề tài chỉ để tham khảo.</div>`
        : `<div class="alert">Thời gian đăng ký: ${fmtDate(p.phases[0][1])} – ${fmtDate(p.phases[0][2])}. Bạn đang có ${pending}/3 nguyện vọng chờ xét.
          ${open ? '' : '<br><b>Đã hết thời gian đăng ký: bạn sẽ được bộ môn phân công GVHD.</b>'}</div>`}
      <div class="toolbar"><input type="search" placeholder="Tìm theo tên đề tài, mã, giảng viên..." value="${esc(UI.regQ)}"
        oninput="UI.regQ=this.value;document.getElementById('reg-body').innerHTML=regTableRows().join('')"></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Mã đề tài</th><th>Tên đề tài</th><th>Giảng viên</th><th class="num">Còn chỗ</th><th>Thao tác</th></tr></thead>
        <tbody id="reg-body">${regTableRows().join('')}</tbody></table></div>
      <h2 style="margin:26px 0 10px">Nguyện vọng của tôi</h2>
      ${table(['NV', 'Đề tài', 'Giảng viên', 'Ngày gửi', 'Trạng thái', 'Phản hồi', ''],
        mine.map(r => { const t = topic(r.topicId); return `<tr><td>NV${r.nv}</td><td>${t.id} – ${esc(t.title)}</td><td>${esc(uname(t.gv))}</td><td class="nowrap">${fmtDT(r.date)}</td>
          <td>${sbadge(r.status)}</td><td class="small">${esc(r.reason)}</td>
          <td>${r.status === 'Chờ xét' ? `<button class="link-btn red" onclick="A.regCancel(${r.id})">Rút</button>` : ''}</td></tr>`; }),
        'Bạn chưa gửi nguyện vọng nào.')}`);
  },
};
A.viewTopic = id => {
  const t = topic(id);
  openModal({
    title: `${t.id} – Chi tiết đề tài`,
    body: `<h3>${esc(t.title)}</h3><dl class="kv">
      <dt>Giảng viên</dt><dd>${esc(uname(t.gv))}</dd>
      <dt>Số sinh viên tối đa</dt><dd>${t.slots} (còn ${Math.max(t.slots - topicTaken(t), 0)})</dd>
      <dt>Trạng thái</dt><dd>${sbadge(t.status)}</dd>
      <dt>Mô tả</dt><dd>${esc(t.desc)}</dd>
      <dt>Yêu cầu</dt><dd>${esc(t.req)}</dd>
      ${t.comment ? `<dt>Góp ý của TBM</dt><dd>${esc(t.comment)}</dd>` : ''}</dl>`,
    footer: `<button class="btn" onclick="closeModal()">Đóng</button>`,
  });
};
A.regOpen = id => {
  const s = mySV(), t = topic(id);
  const used = DB.requests.filter(r => r.code === s.code && r.status === 'Chờ xét').map(r => r.nv);
  const first = [1, 2, 3].find(n => !used.includes(n));
  openModal({
    title: 'Gửi nguyện vọng hướng dẫn',
    body: `<p><b>Đề tài: ${esc(t.title)}</b><br><span class="muted">Giảng viên: ${esc(uname(t.gv))} · Còn ${t.slots - topicTaken(t)}/${t.slots} chỗ</span></p>
      <div class="field"><label>Thứ tự nguyện vọng *</label><div style="display:flex;gap:28px">
        ${[1, 2, 3].map(n => `<label class="check"><input type="radio" name="nv" value="${n}" ${used.includes(n) ? 'disabled' : ''} ${n === first ? 'checked' : ''}> NV${n}${used.includes(n) ? ' (đã dùng)' : ''}</label>`).join('')}
      </div></div>
      <div class="field"><label for="rg-msg">Lời nhắn gửi giảng viên</label><textarea id="rg-msg" placeholder="Giới thiệu ngắn về bản thân, kinh nghiệm liên quan..."></textarea></div>
      <div class="field"><label for="rg-cv">CV / bảng điểm (không bắt buộc)</label><input id="rg-cv" type="file" accept=".pdf"></div>`,
    footer: `<button class="btn primary" onclick="A.regSend('${id}')">Gửi nguyện vọng</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
};
A.regSend = id => {
  const s = mySV(), t = topic(id);
  const nv = Number(($('input[name=nv]:checked') || {}).value);
  const why = regBlockReason(s, t);
  if (why) { toast('Không thể đăng ký: ' + why + '.', 'err'); return; }
  if (!nv) { toast('Vui lòng chọn thứ tự nguyện vọng.', 'err'); return; }
  const id2 = newId();
  DB.requests.push({ id: id2, code: s.code, topicId: id, nv, msg: val('rg-msg'), status: 'Chờ xét', reason: '', date: nowISO(), cv: (fileInfo('rg-cv') || {}).name });
  notify(t.gv, `${s.name} gửi nguyện vọng NV${nv} vào đề tài ${t.id}.`);
  save(); closeModal(); render(); toast('Đã gửi nguyện vọng NV' + nv + '.', 'ok');
};
A.regCancel = rid => {
  const r = DB.requests.find(x => x.id === rid);
  if (!confirm('Rút nguyện vọng NV' + r.nv + '?')) return;
  r.status = 'Đã hủy'; r.reason = 'Sinh viên rút nguyện vọng';
  save(); render(); toast('Đã rút nguyện vọng.');
};

/* ---------- Đồ án của tôi ---------- */
VIEWS['my-thesis'] = {
  title: 'Đồ án của tôi',
  render() {
    const s = mySV();
    if (!s.gvhd) return page('Đồ án của tôi', '', needGVHD(s));
    const t = topic(s.topicId), pr = progressOf(s.code), th = thesisOf(s.code), d = defenseOf(s.code), plan = planOf(s.code);
    return page('Đồ án của tôi', `${s.code} – ${esc(s.name)} · ${s.cls}`,
      `<div class="cols half">
        <div class="panel"><div class="ph"><h2>Thông tin đề tài</h2></div><div class="pb"><dl class="kv">
          <dt>Mã đề tài</dt><dd>${t.id}</dd><dt>Tên đề tài</dt><dd><b>${esc(t.title)}</b></dd>
          <dt>GVHD</dt><dd>${esc(uname(s.gvhd))}</dd><dt>Mô tả</dt><dd>${esc(t.desc)}</dd></dl></div></div>
        <div class="panel"><div class="ph"><h2>Tình trạng</h2></div><div class="pb"><dl class="kv">
          <dt>Kế hoạch</dt><dd>${plan ? sbadge(plan.status) : badge('Chưa lập', 'grey')}</dd>
          <dt>Tiến độ</dt><dd>${badge(pr.label, pr.cls)} &nbsp; mốc ${pr.cur}/${pr.total} · ${pr.pct}% đạt</dd>
          <dt>Quyển đồ án</dt><dd>${th ? `${esc(th.file)} (${fmtDT(th.date)})` : 'Chưa nộp'}</dd>
          <dt>Xác nhận bảo vệ</dt><dd>${!th ? '–' : !th.confirm ? sbadge('Chờ xác nhận') : sbadge(th.confirm.ok ? 'Đủ điều kiện' : 'Không đủ điều kiện')}</dd>
          <dt>Lịch bảo vệ</dt><dd>${d ? `${d.council} · ${d.time} ${fmtDate(council(d.council).date)} · ${council(d.council).room}` : 'Chưa xếp lịch'}</dd>
          <dt>Kết quả</dt><dd>${isPublished(s.code) ? '<a href="#/result">Đã công bố – xem kết quả</a>' : 'Chưa công bố'}</dd></dl></div></div>
      </div>`);
  },
};

/* ---------- UC3.1 Lập kế hoạch thực hiện đồ án ---------- */
UI.planDraft = null;
function planErrors(ms) { // UC3.1 E1, E2, BR1, BR2
  const p = period(), start = p.phases[1][1], end = p.phases[1][2], submitEnd = p.phases[2][2];
  const errs = {};
  if (ms.length < 4) errs.general = 'Kế hoạch phải có tối thiểu 4 mốc.';
  ms.forEach((m, i) => {
    const e = [];
    if (!m.title) e.push('Thiếu tên mốc');
    if (!m.due) e.push('Thiếu hạn');
    else {
      if (m.due < start || m.due > end) e.push(`Hạn phải trong thời gian thực hiện (${fmtDate(start)} – ${fmtDate(end)})`);
      if (i > 0 && ms[i - 1].due && daysBetween(ms[i - 1].due, m.due) < 7) e.push('Cách mốc trước tối thiểu 7 ngày');
      if (i === ms.length - 1 && m.due > submitEnd) e.push('Mốc cuối không muộn hơn hạn nộp quyển');
    }
    if (e.length) errs[i] = e.join('; ');
  });
  return errs;
}
VIEWS.plan = {
  title: 'Kế hoạch',
  render() {
    const s = mySV();
    if (!s.gvhd) return page('Kế hoạch thực hiện', '', needGVHD(s));
    const plan = planOf(s.code);
    const editable = !plan || plan.status !== 'Đã duyệt';
    if (!UI.planDraft || UI.planDraft.code !== s.code) {
      UI.planDraft = { code: s.code, ms: JSON.parse(JSON.stringify(plan ? plan.milestones : milestoneTemplate())) };
    }
    const ms = editable ? UI.planDraft.ms : plan.milestones;
    const errs = UI.planShowErr ? planErrors(ms) : {};
    const p = period();
    return page('Kế hoạch thực hiện đồ án', `Thời gian thực hiện: ${fmtDate(p.phases[1][1])} – ${fmtDate(p.phases[1][2])} · Hạn nộp quyển: ${fmtDate(p.phases[2][2])}`,
      `${plan ? `<div class="alert ${plan.status === 'Đã duyệt' ? 'ok' : plan.status === 'Yêu cầu sửa' ? 'warn' : ''}">Trạng thái: <b>${plan.status}</b>${plan.comment ? ' – Góp ý của GVHD: ' + esc(plan.comment) : ''}</div>` : ''}
      ${errs.general ? `<div class="alert err">${errs.general}</div>` : ''}
      ${editable ? `<div class="toolbar"><button class="btn" onclick="A.planAdd()">+ Thêm mốc</button>
        <button class="btn" onclick="A.planTemplate()">Dùng mẫu 7 mốc</button><span class="spacer"></span>
        <button class="btn primary" onclick="A.planSubmit()">Gửi GVHD duyệt</button></div>` : ''}
      ${table(['#', 'Tên mốc', 'Hạn hoàn thành', 'Nội dung / sản phẩm', ''], ms.map((m, i) => editable
        ? `<tr class="${errs[i] ? 'hl' : ''}"><td>${i + 1}</td>
          <td><input type="text" value="${esc(m.title)}" oninput="UI.planDraft.ms[${i}].title=this.value" class="${errs[i] && !m.title ? 'invalid' : ''}" aria-label="Tên mốc ${i + 1}"></td>
          <td><input type="date" value="${m.due}" onchange="UI.planDraft.ms[${i}].due=this.value" class="${errs[i] ? 'invalid' : ''}" aria-label="Hạn mốc ${i + 1}">
            ${errs[i] ? `<div class="err">${esc(errs[i])}</div>` : ''}</td>
          <td><input type="text" value="${esc(m.desc)}" oninput="UI.planDraft.ms[${i}].desc=this.value" aria-label="Nội dung mốc ${i + 1}"></td>
          <td><button class="link-btn red" onclick="A.planDel(${i})" aria-label="Xóa mốc">Xóa</button></td></tr>`
        : `<tr><td>${i + 1}</td><td>${esc(m.title)}</td><td>${fmtDate(m.due)}</td><td>${esc(m.desc)}</td><td></td></tr>`))}`);
  },
};
A.planAdd = () => { const ms = UI.planDraft.ms; ms.push({ title: '', due: '', desc: '' }); render(); };
A.planDel = i => { UI.planDraft.ms.splice(i, 1); render(); };
A.planTemplate = () => { UI.planDraft.ms = milestoneTemplate(); render(); };
A.planSubmit = () => {
  const s = mySV();
  const ms = UI.planDraft.ms;
  const errs = planErrors(ms);
  if (Object.keys(errs).length) { UI.planShowErr = true; render(); toast('Kế hoạch chưa hợp lệ, vui lòng kiểm tra các dòng được đánh dấu.', 'err'); return; }
  UI.planShowErr = false;
  let plan = planOf(s.code);
  if (!plan) { plan = { code: s.code }; DB.plans.push(plan); }
  plan.milestones = JSON.parse(JSON.stringify(ms)); plan.status = 'Chờ duyệt'; plan.comment = '';
  notify(s.gvhd, `${s.name} đã gửi kế hoạch thực hiện (${ms.length} mốc) chờ duyệt.`);
  save(); render(); toast('Đã gửi kế hoạch cho GVHD.', 'ok');
};

/* ---------- UC3.2 Nộp báo cáo tiến độ ---------- */
VIEWS.reports = {
  title: 'Báo cáo tiến độ',
  render() {
    const s = mySV();
    if (!s.gvhd) return page('Báo cáo tiến độ', '', needGVHD(s));
    const plan = planOf(s.code);
    if (!plan || plan.status !== 'Đã duyệt') return page('Báo cáo tiến độ', '', `<div class="alert warn">Kế hoạch thực hiện chưa được GVHD duyệt. <a href="#/plan">Xem kế hoạch →</a></div>`);
    const latest = latestReports(s.code);
    const hist = DB.reports.filter(r => r.code === s.code).sort((a, b) => b.date < a.date ? -1 : 1);
    const pr = progressOf(s.code);
    return page('Báo cáo tiến độ', `GVHD: ${esc(uname(s.gvhd))} · Tình trạng: ${badge(pr.label, pr.cls)}`,
      `${table(['Mốc', 'Hạn', 'Lần nộp gần nhất', 'Trạng thái', 'Nhận xét GVHD', ''], plan.milestones.map((m, i) => {
        const r = latest[i];
        return `<tr><td><b>Mốc ${i + 1}</b>: ${esc(m.title)}</td><td class="nowrap">${fmtDate(m.due)}</td>
          <td class="small">${r ? `${esc(r.file)}<br>${fmtDT(r.date)} ${r.late ? badge('Nộp muộn', 'orange') : ''}` : '–'}</td>
          <td>${r ? sbadge(r.status) : badge('Chưa nộp', 'grey')}</td><td class="small">${r ? esc(r.comment) : ''}</td>
          <td>${r && r.status === 'Đạt' ? '' : `<button class="link-btn" onclick="A.repOpen(${i})">${r ? 'Nộp lại' : 'Nộp'}</button>`}</td></tr>`;
      }))}
      <h2 style="margin:26px 0 10px">Lịch sử nộp</h2>
      ${table(['Thời điểm', 'Mốc', 'Tệp', 'Ghi chú', 'Trạng thái'], hist.map(r => `<tr><td class="nowrap">${fmtDT(r.date)}</td><td>Mốc ${r.m + 1}</td>
        <td>${esc(r.file)} <span class="muted small">(${r.size} MB)</span></td><td class="small">${esc(r.note)}</td><td>${sbadge(r.status)}</td></tr>`), 'Chưa có báo cáo nào.')}`);
  },
};
A.repOpen = i => {
  const m = planOf(mySV().code).milestones[i];
  openModal({
    title: `Nộp báo cáo – Mốc ${i + 1}: ${m.title}`,
    body: `<p class="muted">Hạn: ${fmtDate(m.due)}. Tệp cho phép: PDF, DOCX, ZIP; tối đa 50 MB.</p>
      <div class="field"><label for="rp-file">Tệp báo cáo *</label><input id="rp-file" type="file" accept=".pdf,.docx,.zip"></div>
      <div class="field"><label for="rp-note">Nội dung đã thực hiện *</label><textarea id="rp-note" placeholder="Tóm tắt công việc đã làm, khó khăn, kế hoạch tiếp theo..."></textarea></div>`,
    footer: `<button class="btn primary" onclick="A.repSend(${i})">Nộp báo cáo</button><button class="btn" onclick="closeModal()">Hủy</button>`,
  });
};
A.repSend = i => {
  clearErrs($('.modal'));
  const s = mySV(), m = planOf(s.code).milestones[i];
  const f = fileInfo('rp-file'), note = val('rp-note');
  if (!f) return fieldErr('rp-file', 'Vui lòng chọn tệp báo cáo.');
  if (!/\.(pdf|docx|zip)$/i.test(f.name)) return fieldErr('rp-file', 'Định dạng không được phép (chỉ PDF, DOCX, ZIP).');
  if (f.size > 50) return fieldErr('rp-file', 'Tệp vượt quá 50 MB.');
  if (!note) return fieldErr('rp-note', 'Vui lòng nhập nội dung đã thực hiện.');
  const now = nowISO(), late = now.slice(0, 10) > m.due;
  DB.reports.push({ id: newId(), code: s.code, m: i, date: now, file: f.name, size: f.size, note, late, status: 'Chờ đánh giá', comment: '' });
  notify(s.gvhd, `${s.name} đã nộp báo cáo mốc ${i + 1}${late ? ' (nộp muộn)' : ''}.`);
  save(); closeModal(); render(); toast(late ? 'Đã nộp báo cáo (đánh dấu nộp muộn).' : 'Đã nộp báo cáo.', late ? 'warn' : 'ok');
};

/* ---------- UC4.1 Nộp quyển đồ án ---------- */
VIEWS.submit = {
  title: 'Nộp quyển',
  render() {
    const s = mySV();
    if (!s.gvhd) return page('Nộp quyển đồ án', '', needGVHD(s));
    const p = period(), th = thesisOf(s.code);
    const locked = th && th.confirm;
    return page('Nộp quyển đồ án', `Thời gian nộp: ${fmtDate(p.phases[2][1])} – ${fmtDate(p.phases[2][2])}`,
      `${th ? `<div class="panel"><div class="ph"><h2>Bản đã nộp</h2>${th.confirm ? sbadge(th.confirm.ok ? 'Đủ điều kiện' : 'Không đủ điều kiện') : sbadge('Chờ xác nhận')}</div><div class="pb"><dl class="kv">
        <dt>Quyển đồ án</dt><dd>${esc(th.file)} (${th.size} MB)</dd><dt>Mã nguồn</dt><dd>${esc(th.src || '–')}</dd>
        <dt>Thời điểm nộp</dt><dd>${fmtDT(th.date)}</dd><dt>Tỷ lệ trùng lặp</dt><dd>${th.sim}%</dd>
        ${th.confirm ? `<dt>Nhận xét GVHD</dt><dd>${esc(th.confirm.comment)}</dd>` : ''}</dl></div></div>` : ''}
      ${locked ? `<div class="alert">GVHD đã xác nhận phiếu, không thể nộp lại. Liên hệ giáo vụ khoa nếu cần mở lại.</div>` : `
      <div class="panel"><div class="ph"><h2>${th ? 'Nộp phiên bản mới' : 'Nộp quyển'}</h2></div><div class="pb">
        <div class="field"><label for="sb-pdf">Quyển đồ án (PDF, ≤ 50 MB) *</label><input id="sb-pdf" type="file" accept=".pdf"></div>
        <div class="field"><label for="sb-src">Mã nguồn (ZIP/RAR, ≤ 200 MB)</label><input id="sb-src" type="file" accept=".zip,.rar"></div>
        <div class="field"><label class="check"><input id="sb-pledge" type="checkbox"> Tôi cam đoan đồ án là sản phẩm của bản thân, không sao chép trái phép.</label></div>
        <p class="small muted">Tên tệp sẽ được đặt lại theo mẫu &lt;MãSV&gt;_&lt;MãĐợt&gt;_&lt;phiên bản&gt;.pdf</p>
        <button class="btn primary" onclick="A.thesisSend()">Nộp quyển</button>
      </div></div>`}`);
  },
};
A.thesisSend = () => {
  clearErrs();
  const s = mySV(), pdf = fileInfo('sb-pdf'), src = fileInfo('sb-src');
  if (!pdf) return fieldErr('sb-pdf', 'Vui lòng chọn tệp quyển đồ án.');
  if (!/\.pdf$/i.test(pdf.name)) return fieldErr('sb-pdf', 'Quyển đồ án phải là tệp PDF.');
  if (pdf.size > 50) return fieldErr('sb-pdf', 'Tệp vượt quá 50 MB.');
  if (src && src.size > 200) return fieldErr('sb-src', 'Tệp mã nguồn vượt quá 200 MB.');
  if (!val('sb-pledge')) return fieldErr('sb-pledge', 'Bạn cần tích vào ô cam đoan trước khi nộp.');
  let th = thesisOf(s.code);
  const ver = th ? Number((th.file.match(/_v(\d+)\.pdf$/) || [0, 0])[1]) + 1 : 1;
  if (!th) { th = { code: s.code, confirm: null }; DB.theses.push(th); }
  Object.assign(th, { file: `${s.code}_${DB.currentPeriod}_v${ver}.pdf`, size: pdf.size, src: src ? src.name : th.src, date: nowISO(), sim: 5 + Math.floor(Math.random() * 15) });
  notify(s.gvhd, `${s.name} đã nộp quyển đồ án (phiên bản ${ver}), chờ xác nhận đủ điều kiện bảo vệ.`);
  save(); render(); toast('Đã nộp quyển đồ án phiên bản ' + ver + '.', 'ok');
};

/* ---------- Lịch bảo vệ ---------- */
VIEWS.defense = {
  title: 'Lịch bảo vệ',
  render() {
    const s = mySV(), d = defenseOf(s.code);
    if (!d) return page('Lịch bảo vệ', '', `<div class="alert">Bạn chưa được xếp lịch bảo vệ. Lịch được công bố trước ngày bảo vệ ít nhất 5 ngày.</div>`);
    const c = council(d.council), rv = reviewOf(s.code);
    return page('Lịch bảo vệ', '', `<div class="cols half">
      <div class="panel"><div class="ph"><h2>Hội đồng ${c.id}</h2></div><div class="pb"><dl class="kv">
        <dt>Ngày</dt><dd><b>${fmtDate(c.date)}</b> (buổi ${c.session.toLowerCase()})</dd><dt>Giờ bảo vệ</dt><dd><b>${d.time}</b> (45 phút)</dd>
        <dt>Phòng</dt><dd>${esc(c.room)}</dd>${c.members.map(m => `<dt>${m.role}</dt><dd>${esc(uname(m.uid))}</dd>`).join('')}</dl></div></div>
      <div class="panel"><div class="ph"><h2>Phản biện</h2></div><div class="pb"><dl class="kv">
        <dt>Giảng viên phản biện</dt><dd>${esc(uname(d.reviewer))}</dd>
        ${rv ? `<dt>Nhận xét</dt><dd>${esc(rv.comment)}</dd><dt>Câu hỏi</dt><dd>${esc(rv.questions)}</dd>` : '<dt>Phiếu phản biện</dt><dd>Chưa có</dd>'}</dl></div></div>
    </div>`);
  },
};

/* ---------- UC5.3 Tra cứu kết quả ---------- */
VIEWS.result = {
  title: 'Kết quả',
  render() {
    const s = mySV(), r = resultOf(s.code);
    if (!r || !r.published) return page('Kết quả đồ án', '', `<div class="alert">Kết quả chưa được công bố.</div>`);
    const w = period().weights;
    return page('Kết quả đồ án', `${s.code} – ${esc(s.name)}`,
      `<div class="cards">
        <div class="card ${r.pass ? 'green' : 'red'}"><div class="label">Điểm tổng kết</div><div class="value c">${fmtScore(r.final)}</div><div class="note">${r.pass ? 'Đạt' : 'Không đạt'}</div></div>
        <div class="card blue"><div class="label">GVHD (${w.gv}%)</div><div class="value">${fmtScore(r.gv)}</div></div>
        <div class="card blue"><div class="label">Phản biện (${w.pb}%)</div><div class="value">${fmtScore(r.pb)}</div></div>
        <div class="card blue"><div class="label">TB hội đồng (${w.hd}%)</div><div class="value">${fmtScore(r.hd)}</div></div>
      </div>
      ${table(['Thành viên hội đồng', 'Vai trò', 'Điểm'], r.members.map(m => `<tr><td>${esc(uname(m.uid))}</td><td>${m.role}</td><td>${fmtScore(m.score)}</td></tr>`))}`);
  },
};

/* ---------- Kho đồ án (tra cứu) ---------- */
UI.libQ = '';
function libRows() {
  const q = UI.libQ.toLowerCase(), full = role() !== 'SV';
  return DB.archive.filter(a => !q || (a.title + a.student + a.gv).toLowerCase().includes(q)).map(a => `<tr><td class="nowrap">${a.id}</td>
    <td><b>${esc(a.title)}</b><div class="small muted">${esc(a.abstract)}</div></td><td>${esc(a.student)}</td><td>${esc(a.gv)}</td><td>${a.period}</td>
    <td>${full ? `<button class="link-btn" onclick="toast('(Demo) Đang mở toàn văn ${a.id}.pdf')">Toàn văn</button>` : '<span class="small muted">Chỉ xem tóm tắt</span>'}</td></tr>`);
}
VIEWS.library = {
  title: 'Kho đồ án',
  render: () => page('Kho đồ án đã lưu trữ', 'Tra cứu đồ án các khóa trước.',
    `<div class="toolbar"><input type="search" placeholder="Tìm theo tên đề tài, sinh viên, GVHD..." value="${esc(UI.libQ)}"
      oninput="UI.libQ=this.value;document.getElementById('lib-body').innerHTML=libRows().join('')"></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Mã</th><th>Đề tài</th><th>Sinh viên</th><th>GVHD</th><th>Đợt</th><th></th></tr></thead>
    <tbody id="lib-body">${libRows().join('')}</tbody></table></div>`),
};
