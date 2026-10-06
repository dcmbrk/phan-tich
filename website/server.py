#!/usr/bin/env python3
"""ThesisHub – máy chủ web: REST API + cơ sở dữ liệu SQLite + phục vụ giao diện.

Chạy:  python3 server.py                 (mở http://localhost:8000)
       python3 server.py --host 0.0.0.0  (cho máy khác trong mạng LAN truy cập)
Chỉ dùng thư viện chuẩn của Python 3, không cần cài thêm gói nào.
"""
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get('THESISHUB_DB') or os.path.join(BASE, 'thesishub.db')

SESSION_TIMEOUT = 30 * 60          # UC1.1 BR3: hết phiên sau 30 phút không thao tác
LOCK_MS = 15 * 60 * 1000           # UC1.1 E2: khóa tạm 15 phút sau 5 lần sai
RESET_TTL = 30 * 60                # UC1.1 A1: liên kết đặt lại mật khẩu hiệu lực 30 phút
DEFAULT_PASSWORD = 'Phenikaa@123'  # UC1.2 BR3: mật khẩu mặc định, bắt buộc đổi lần đầu
ADMIN_EMAIL = 'admin@phenikaa-uni.edu.vn'
ADMIN_PASSWORD = 'Admin@123'
EMAIL_RE = re.compile(r'^[a-z0-9._-]+@(st\.)?phenikaa-uni\.edu\.vn$', re.I)  # UC1.1 BR1
PW_RE = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$')                # UC1.1 BR2
ROLES = ('QTV', 'GVU', 'TBM', 'GV', 'SV')

# Tài khoản dùng thử: mỗi vai trò một tài khoản, hiện thành nút "Đăng nhập nhanh" ở trang đăng nhập.
# Khi triển khai thật, đặt DEMO_SHORTCUTS = False để ẩn các nút này (tài khoản vẫn còn, có thể khóa ở mục Quản trị).
DEMO_SHORTCUTS = True
DEMO_PASSWORD = 'Thesis@2026'
DEMO_ACCOUNTS = [  # (id, mã, họ tên, email, vai trò, đơn vị, vai trò dùng khi đăng nhập nhanh)
    ('demo-qtv', 'DEMO-QTV', 'Nguyễn Văn Quản', 'quantri.demo@phenikaa-uni.edu.vn', 'QTV', 'Phòng CNTT', 'QTV'),
    ('demo-gvu', 'DEMO-GVU', 'Trần Thị Hoa', 'giaovu.demo@phenikaa-uni.edu.vn', 'GVU', 'Văn phòng khoa', 'GVU'),
    ('demo-tbm', 'DEMO-TBM', 'PGS.TS. Đỗ Quang Vinh', 'tbm.demo@phenikaa-uni.edu.vn', 'GV,TBM', 'Kỹ thuật phần mềm', 'TBM'),
    ('demo-gv', 'DEMO-GV', 'TS. Phạm Thu Hằng', 'giangvien.demo@phenikaa-uni.edu.vn', 'GV', 'Kỹ thuật phần mềm', 'GV'),
    ('demo-sv', '22019999', 'Nguyễn Minh Anh', 'sinhvien.demo@st.phenikaa-uni.edu.vn', 'SV', 'K17-KTPM', 'SV'),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  roles TEXT NOT NULL, dept TEXT, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Hoạt động',
  must_change_pw INTEGER NOT NULL DEFAULT 1, failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL, last INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_tokens (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS periods (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
  w_gv INTEGER NOT NULL, w_pb INTEGER NOT NULL, w_hd INTEGER NOT NULL, assign_locked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS period_phases (
  period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE, idx INTEGER NOT NULL,
  name TEXT NOT NULL, start TEXT, end TEXT, PRIMARY KEY (period_id, idx)
);
CREATE TABLE IF NOT EXISTS lecturers (
  period_id TEXT NOT NULL REFERENCES periods(id), uid TEXT NOT NULL REFERENCES users(id),
  degree TEXT NOT NULL, quota INTEGER NOT NULL, PRIMARY KEY (period_id, uid)
);
CREATE TABLE IF NOT EXISTS topics (
  period_id TEXT NOT NULL REFERENCES periods(id), id TEXT NOT NULL, title TEXT NOT NULL,
  gv TEXT NOT NULL REFERENCES users(id), slots INTEGER NOT NULL, status TEXT NOT NULL, comment TEXT,
  descr TEXT, req TEXT, reserved INTEGER, PRIMARY KEY (period_id, id)
);
CREATE TABLE IF NOT EXISTS students (
  period_id TEXT NOT NULL REFERENCES periods(id), code TEXT NOT NULL, uid TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, cls TEXT, gpa REAL, credits INTEGER, gvhd TEXT REFERENCES users(id), topic_id TEXT,
  PRIMARY KEY (period_id, code), FOREIGN KEY (period_id, topic_id) REFERENCES topics(period_id, id)
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY, period_id TEXT NOT NULL, code TEXT NOT NULL, topic_id TEXT NOT NULL,
  nv INTEGER NOT NULL, msg TEXT, status TEXT NOT NULL, reason TEXT, date TEXT, cv TEXT,
  FOREIGN KEY (period_id, code) REFERENCES students(period_id, code)
);
CREATE TABLE IF NOT EXISTS plans (
  period_id TEXT NOT NULL, code TEXT NOT NULL, status TEXT NOT NULL, comment TEXT,
  PRIMARY KEY (period_id, code), FOREIGN KEY (period_id, code) REFERENCES students(period_id, code)
);
CREATE TABLE IF NOT EXISTS plan_milestones (
  period_id TEXT NOT NULL, code TEXT NOT NULL, idx INTEGER NOT NULL, title TEXT, due TEXT, descr TEXT,
  PRIMARY KEY (period_id, code, idx), FOREIGN KEY (period_id, code) REFERENCES plans(period_id, code) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, period_id TEXT NOT NULL, code TEXT NOT NULL, m INTEGER NOT NULL, date TEXT,
  file TEXT, size REAL, note TEXT, late INTEGER, status TEXT NOT NULL, comment TEXT,
  FOREIGN KEY (period_id, code) REFERENCES students(period_id, code)
);
CREATE TABLE IF NOT EXISTS theses (
  period_id TEXT NOT NULL, code TEXT NOT NULL, file TEXT, size REAL, src TEXT, date TEXT, sim INTEGER,
  confirm_ok INTEGER, confirm_score REAL, confirm_comment TEXT,
  PRIMARY KEY (period_id, code), FOREIGN KEY (period_id, code) REFERENCES students(period_id, code)
);
CREATE TABLE IF NOT EXISTS councils (
  period_id TEXT NOT NULL REFERENCES periods(id), id TEXT NOT NULL, date TEXT, session TEXT, room TEXT,
  published INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (period_id, id)
);
CREATE TABLE IF NOT EXISTS council_members (
  period_id TEXT NOT NULL, council_id TEXT NOT NULL, uid TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL,
  PRIMARY KEY (period_id, council_id, uid),
  FOREIGN KEY (period_id, council_id) REFERENCES councils(period_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS defenses (
  period_id TEXT NOT NULL, code TEXT NOT NULL, council_id TEXT NOT NULL, reviewer TEXT REFERENCES users(id), time TEXT,
  PRIMARY KEY (period_id, code), FOREIGN KEY (period_id, code) REFERENCES students(period_id, code),
  FOREIGN KEY (period_id, council_id) REFERENCES councils(period_id, id)
);
CREATE TABLE IF NOT EXISTS reviews (
  period_id TEXT NOT NULL, code TEXT NOT NULL, uid TEXT NOT NULL REFERENCES users(id), comment TEXT, questions TEXT,
  score REAL, allow INTEGER, date TEXT,
  PRIMARY KEY (period_id, code), FOREIGN KEY (period_id, code) REFERENCES students(period_id, code)
);
CREATE TABLE IF NOT EXISTS scores (
  period_id TEXT NOT NULL, code TEXT NOT NULL, uid TEXT NOT NULL REFERENCES users(id),
  c1 REAL, c2 REAL, c3 REAL, c4 REAL, comment TEXT,
  PRIMARY KEY (period_id, code, uid), FOREIGN KEY (period_id, code) REFERENCES students(period_id, code)
);
CREATE TABLE IF NOT EXISTS archive (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, student TEXT, gv TEXT, period TEXT, score REAL, abstract TEXT, code TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, time TEXT, is_read INTEGER NOT NULL DEFAULT 0
);
"""

# Các bảng ánh xạ trực tiếp: tên tập dữ liệu phía giao diện -> bảng, cột khóa, có thuộc đợt hay không, (trường JSON, cột)
SIMPLE = {
    'lecturers': dict(table='lecturers', pk=['period_id', 'uid'], scoped=True,
                      cols=[('uid', 'uid'), ('degree', 'degree'), ('quota', 'quota')]),
    'topics': dict(table='topics', pk=['period_id', 'id'], scoped=True,
                   cols=[('id', 'id'), ('title', 'title'), ('gv', 'gv'), ('slots', 'slots'), ('status', 'status'), ('comment', 'comment'),
                         ('desc', 'descr'), ('req', 'req'), ('reserved', 'reserved')]),
    'students': dict(table='students', pk=['period_id', 'code'], scoped=True,
                     cols=[('code', 'code'), ('uid', 'uid'), ('name', 'name'), ('cls', 'cls'), ('gpa', 'gpa'), ('credits', 'credits'),
                           ('gvhd', 'gvhd'), ('topicId', 'topic_id')]),
    'requests': dict(table='requests', pk=['id'], scoped=True,
                     cols=[('id', 'id'), ('code', 'code'), ('topicId', 'topic_id'), ('nv', 'nv'), ('msg', 'msg'), ('status', 'status'),
                           ('reason', 'reason'), ('date', 'date'), ('cv', 'cv')]),
    'reports': dict(table='reports', pk=['id'], scoped=True,
                    cols=[('id', 'id'), ('code', 'code'), ('m', 'm'), ('date', 'date'), ('file', 'file'), ('size', 'size'), ('note', 'note'),
                          ('late', 'late'), ('status', 'status'), ('comment', 'comment')]),
    'defenses': dict(table='defenses', pk=['period_id', 'code'], scoped=True,
                     cols=[('code', 'code'), ('council', 'council_id'), ('reviewer', 'reviewer'), ('time', 'time')]),
    'reviews': dict(table='reviews', pk=['period_id', 'code'], scoped=True,
                    cols=[('code', 'code'), ('uid', 'uid'), ('comment', 'comment'), ('questions', 'questions'), ('score', 'score'),
                          ('allow', 'allow'), ('date', 'date')]),
    'archive': dict(table='archive', pk=['id'], scoped=False,
                    cols=[('id', 'id'), ('title', 'title'), ('student', 'student'), ('gv', 'gv'), ('period', 'period'), ('score', 'score'),
                          ('abstract', 'abstract'), ('code', 'code')]),
    'notifications': dict(table='notifications', pk=['id'], scoped=False,
                          cols=[('id', 'id'), ('to', 'user_id'), ('text', 'text'), ('time', 'time'), ('read', 'is_read')]),
}
BOOL_FIELDS = {'late', 'allow', 'read'}
# Thứ tự ghi: bảng cha trước bảng con (xóa thì ngược lại – giao diện đã gửi đúng thứ tự)
COLLECTIONS = ['periods', 'lecturers', 'topics', 'students', 'requests', 'plans', 'reports', 'theses',
               'councils', 'defenses', 'reviews', 'scores', 'archive', 'notifications', 'meta']
# Vai trò được ghi vào từng tập dữ liệu
WRITE_ROLES = {
    'periods': {'GVU'}, 'lecturers': {'GVU'}, 'students': {'GVU', 'TBM', 'GV'}, 'topics': {'GV', 'TBM', 'GVU'},
    'requests': {'SV', 'GV', 'TBM'}, 'plans': {'SV', 'GV', 'TBM'}, 'reports': {'SV', 'GV', 'TBM'}, 'theses': {'SV', 'GV', 'TBM'},
    'councils': {'GVU'}, 'defenses': {'GVU'}, 'reviews': {'GV', 'TBM', 'GVU'}, 'scores': {'GV', 'TBM'}, 'archive': {'GVU'},
    'notifications': set(ROLES), 'meta': {'GVU', 'TBM'},
}
# (vai trò, tập dữ liệu) -> (bảng, cột khóa, các trạng thái được tự đặt)
SELF_STATUS = {
    ('GV', 'topics'): ('topics', 'id', {'Chờ duyệt'}),
    ('SV', 'requests'): ('requests', 'id', {'Chờ xét', 'Đã hủy'}),
    ('SV', 'plans'): ('plans', 'code', {'Chờ duyệt'}),
    ('SV', 'reports'): ('reports', 'id', {'Chờ đánh giá'}),
}
SV_OWN = {'requests', 'plans', 'reports', 'theses', 'defenses', 'reviews', 'scores'}  # sinh viên chỉ đọc/ghi dữ liệu của mình


class ApiError(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


# ---------------------------------------------------------------- tiện ích
def now_ms():
    return int(time.time() * 1000)


def local_iso():
    return time.strftime('%Y-%m-%dT%H:%M')


def hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 120_000).hex()
    return f'{salt}${digest}'


def check_pw(pw, stored):
    salt, _ = stored.split('$', 1)
    return hmac.compare_digest(hash_pw(pw, salt), stored)


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    return db


def setting(db, key):
    row = db.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
    return row['value'] if row else None


def set_setting(db, key, value):
    db.execute('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, value))


def upsert(db, table, row, pk):
    cols = list(row)
    updates = ', '.join(f'{c}=excluded.{c}' for c in cols if c not in pk)
    db.execute(f'INSERT INTO {table} ({", ".join(cols)}) VALUES ({", ".join("?" * len(cols))}) '
               f'ON CONFLICT({", ".join(pk)}) DO ' + (f'UPDATE SET {updates}' if updates else 'NOTHING'),
               [row[c] for c in cols])


def init_db():
    with connect() as db:
        db.executescript(SCHEMA)
        if not db.execute('SELECT 1 FROM users LIMIT 1').fetchone():
            db.execute('INSERT INTO users(id, code, name, email, roles, dept, password_hash, must_change_pw) VALUES(?,?,?,?,?,?,?,1)',
                       ('u-admin', 'QTV001', 'Quản trị viên hệ thống', ADMIN_EMAIL, 'QTV', 'Phòng CNTT', hash_pw(ADMIN_PASSWORD)))
            print(f'[ThesisHub] Đã tạo cơ sở dữ liệu mới. Tài khoản quản trị: {ADMIN_EMAIL} / {ADMIN_PASSWORD}')
        if DEMO_SHORTCUTS:
            for uid, code, name, email, roles, dept, _ in DEMO_ACCOUNTS:  # chỉ tạo tài khoản còn thiếu, không ghi đè
                if not db.execute('SELECT 1 FROM users WHERE id=? OR code=? OR lower(email)=?', (uid, code, email)).fetchone():
                    db.execute('INSERT INTO users(id, code, name, email, roles, dept, password_hash, must_change_pw) VALUES(?,?,?,?,?,?,?,0)',
                               (uid, code, name, email, roles, dept, hash_pw(DEMO_PASSWORD)))
                    print(f'[ThesisHub] Tạo tài khoản dùng thử {email} / {DEMO_PASSWORD}')


def user_json(r):
    return dict(id=r['id'], code=r['code'], name=r['name'], email=r['email'], roles=r['roles'].split(','), dept=r['dept'] or '',
                status=r['status'], mustChangePw=bool(r['must_change_pw']), lockedUntil=r['locked_until'])


def student_code(db, pid, uid):
    row = db.execute('SELECT code FROM students WHERE period_id=? AND uid=?', (pid, uid)).fetchone()
    return row['code'] if row else None


# ---------------------------------------------------------------- đọc toàn bộ dữ liệu cho giao diện
def load_simple(db, name, pid, code=None):
    spec = SIMPLE[name]
    sql = f'SELECT {", ".join(c for _, c in spec["cols"])} FROM {spec["table"]}'
    args = []
    if spec['scoped']:
        sql += ' WHERE period_id=?'
        args.append(pid)
        if code is not None:
            sql += ' AND code=?'
            args.append(code)
    out = []
    for r in db.execute(sql, args):
        item = {}
        for j, c in spec['cols']:
            item[j] = bool(r[c]) if j in BOOL_FIELDS and r[c] is not None else r[c]
        out.append(item)
    return out


def load_state(db, sess):
    uid, role = sess['user_id'], sess['role']
    pid = setting(db, 'current_period')
    periods = []
    for p in db.execute('SELECT * FROM periods ORDER BY id'):
        phases = [[r['name'], r['start'] or '', r['end'] or ''] for r in
                  db.execute('SELECT * FROM period_phases WHERE period_id=? ORDER BY idx', (p['id'],))]
        periods.append(dict(id=p['id'], name=p['name'], status=p['status'], weights=dict(gv=p['w_gv'], pb=p['w_pb'], hd=p['w_hd']), phases=phases))
    st = dict(version=1, currentPeriod=None, assignLocked=False,
              users=[user_json(r) for r in db.execute('SELECT * FROM users ORDER BY code')],
              lecturers=[], students=[], topics=[], requests=[], plans=[], reports=[], theses=[], councils=[], defenses=[],
              reviews=[], scores=[], published={}, archived=[], archive=load_simple(db, 'archive', None), periods=periods,
              notifications=[], loginLog=[])
    st['archive'].sort(key=lambda a: a['id'], reverse=True)
    rows = db.execute('SELECT id, user_id, text, time, is_read FROM notifications WHERE user_id=? ORDER BY time DESC, id DESC LIMIT 100', (uid,))
    st['notifications'] = [dict(id=r['id'], to=r['user_id'], text=r['text'], time=r['time'], read=bool(r['is_read'])) for r in rows]
    if role == 'QTV':
        st['loginLog'] = [dict(uid=r['user_id'], time=r['time']) for r in db.execute('SELECT * FROM login_log ORDER BY id DESC LIMIT 200')]
    period = db.execute('SELECT * FROM periods WHERE id=?', (pid,)).fetchone() if pid else None
    if not period:
        return st
    st['currentPeriod'] = pid
    st['assignLocked'] = bool(period['assign_locked'])
    own = student_code(db, pid, uid) if role == 'SV' else None
    if role == 'SV' and own is None:
        own = '__none__'
    for name in ('lecturers', 'topics', 'students', 'requests', 'reports', 'defenses', 'reviews'):
        st[name] = load_simple(db, name, pid, own if name in SV_OWN else None)
    code_filter = ' AND code=?' if own else ''
    args = (pid, own) if own else (pid,)
    for p in db.execute('SELECT * FROM plans WHERE period_id=?' + code_filter, args):
        ms = [dict(title=m['title'] or '', due=m['due'] or '', desc=m['descr'] or '') for m in
              db.execute('SELECT * FROM plan_milestones WHERE period_id=? AND code=? ORDER BY idx', (pid, p['code']))]
        st['plans'].append(dict(code=p['code'], status=p['status'], comment=p['comment'] or '', milestones=ms))
    for t in db.execute('SELECT * FROM theses WHERE period_id=?' + code_filter, args):
        confirm = None if t['confirm_ok'] is None else dict(ok=bool(t['confirm_ok']), score=t['confirm_score'], comment=t['confirm_comment'] or '')
        st['theses'].append(dict(code=t['code'], file=t['file'], size=t['size'], src=t['src'], date=t['date'], sim=t['sim'], confirm=confirm))
    for c in db.execute('SELECT * FROM councils WHERE period_id=? ORDER BY id', (pid,)):
        members = [dict(uid=m['uid'], role=m['role']) for m in
                   db.execute("SELECT * FROM council_members WHERE period_id=? AND council_id=? "
                              "ORDER BY CASE role WHEN 'Chủ tịch' THEN 0 WHEN 'Thư ký' THEN 1 ELSE 2 END", (pid, c['id']))]
        st['councils'].append(dict(id=c['id'], date=c['date'], session=c['session'], room=c['room'], members=members))
        st['published'][c['id']] = bool(c['published'])
    for s in db.execute('SELECT * FROM scores WHERE period_id=?' + code_filter, args):
        st['scores'].append(dict(code=s['code'], uid=s['uid'], c=[s['c1'], s['c2'], s['c3'], s['c4']], comment=s['comment'] or ''))
    st['archived'] = [r['code'] for r in db.execute('SELECT code FROM archive WHERE period=? AND code IS NOT NULL', (pid,))]
    return st


# ---------------------------------------------------------------- ghi dữ liệu (đồng bộ thay đổi từ giao diện)
def ensure_student_account(db, item):
    """UC1.4: thêm sinh viên vào đợt sẽ tự tạo tài khoản nếu sinh viên chưa có."""
    if db.execute('SELECT 1 FROM users WHERE id=?', (item['uid'],)).fetchone():
        return
    row = db.execute('SELECT id FROM users WHERE code=?', (item['code'],)).fetchone()
    if row:
        item['uid'] = row['id']
        return
    email = f"{item['code']}@st.phenikaa-uni.edu.vn"
    if db.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone():
        raise ApiError(f'Email {email} đã được dùng cho tài khoản khác.')
    db.execute('INSERT INTO users(id, code, name, email, roles, dept, password_hash, must_change_pw) VALUES(?,?,?,?,?,?,?,1)',
               (item['uid'], item['code'], item['name'], email, 'SV', item.get('cls') or '', hash_pw(DEFAULT_PASSWORD)))
    print(f'[Email] Gửi tới {email}: tài khoản ThesisHub đã được tạo, mật khẩu tạm {DEFAULT_PASSWORD}')


def check_permission(db, sess, pid, c, op, key, item):
    role, uid = sess['role'], sess['user_id']
    if c not in WRITE_ROLES:
        raise ApiError(f'Tập dữ liệu không hợp lệ: {c}')
    if role not in WRITE_ROLES[c]:
        raise ApiError(f'Vai trò {role} không có quyền thay đổi dữ liệu "{c}".', 403)
    if c == 'students' and op == 'del' and role != 'GVU':
        raise ApiError('Chỉ giáo vụ khoa được loại sinh viên khỏi đợt.', 403)
    if c == 'students' and op == 'put' and role != 'GVU' and not db.execute(
            'SELECT 1 FROM students WHERE period_id=? AND code=?', (pid, key)).fetchone():
        raise ApiError('Chỉ giáo vụ khoa được thêm sinh viên vào đợt.', 403)
    if role == 'SV' and c in SV_OWN:
        own = student_code(db, pid, uid)
        if not own or (item or {}).get('code', str(key)) != own:
            raise ApiError('Sinh viên chỉ được thay đổi dữ liệu của chính mình.', 403)
    if c in ('scores', 'reviews') and op == 'put' and role != 'GVU' and item.get('uid') != uid:
        raise ApiError('Chỉ được ghi phiếu của chính mình.', 403)
    if c == 'topics' and role == 'GV':
        gv = item.get('gv') if item else None
        if gv is None:
            row = db.execute('SELECT gv FROM topics WHERE period_id=? AND id=?', (pid, key)).fetchone()
            gv = row['gv'] if row else uid
        if gv != uid:
            raise ApiError('Giảng viên chỉ được thay đổi đề tài của mình.', 403)
    # Không tự duyệt cho mình: GV chỉ đặt đề tài về "Chờ duyệt"; SV chỉ gửi/rút, không tự đánh giá.
    rule = (role, c)
    if role == 'TBM' and c == 'topics' and op == 'put' and item.get('gv') == uid:
        rule = ('GV', 'topics')  # UC2.2 BR1: đề tài của TBM do giáo vụ khoa duyệt
    if op == 'put' and rule in SELF_STATUS:
        table, keycol, allowed = SELF_STATUS[rule]
        old = db.execute(f'SELECT status FROM {table} WHERE {keycol}=?' + (' AND period_id=?' if keycol != 'id' else ''),
                         (key, pid) if keycol != 'id' else (key,)).fetchone()
        if item.get('status') not in allowed and (not old or old['status'] != item.get('status')):
            raise ApiError('Bạn không được tự đặt trạng thái "%s".' % item.get('status'), 403)
    if role == 'SV' and c == 'theses' and op == 'put':
        old = db.execute('SELECT confirm_ok, confirm_score FROM theses WHERE period_id=? AND code=?', (pid, key)).fetchone()
        cf = item.get('confirm')
        if (cf is not None) and not (old and old['confirm_ok'] is not None and bool(old['confirm_ok']) == bool(cf.get('ok'))
                                     and old['confirm_score'] == cf.get('score')):
            raise ApiError('Sinh viên không được tự xác nhận đủ điều kiện bảo vệ.', 403)
    if c == 'notifications':
        row = db.execute('SELECT user_id FROM notifications WHERE id=?', (key,)).fetchone()
        if (row and row['user_id'] != uid) or (op == 'del' and not row):
            raise ApiError('Không được sửa thông báo của người khác.', 403)


def apply_op(db, sess, pid, op):
    c, kind, key, item = op.get('c'), op.get('op'), op.get('key'), op.get('item') or {}
    if kind not in ('put', 'del'):
        raise ApiError('Thao tác không hợp lệ.')
    if c not in ('periods', 'archive', 'notifications', 'meta') and not pid:
        raise ApiError('Chưa có đợt đồ án hiện hành.')
    if c == 'meta':
        return apply_meta(db, sess, pid, key, item)
    check_permission(db, sess, pid, c, kind, key, item if kind == 'put' else None)

    if c in SIMPLE:
        spec = SIMPLE[c]
        if kind == 'del':
            where = ' AND '.join(f'{k}=?' for k in spec['pk'])
            args = ([pid, key] if spec['scoped'] and len(spec['pk']) == 2 else [key])
            db.execute(f'DELETE FROM {spec["table"]} WHERE {where}', args)
            return
        if c == 'students':
            ensure_student_account(db, item)
        row = {col: (1 if item.get(j) else 0) if j in BOOL_FIELDS else item.get(j) for j, col in spec['cols']}
        if spec['scoped']:
            row = {'period_id': pid, **row}
        upsert(db, spec['table'], row, spec['pk'])
        return

    if c == 'periods':
        if kind == 'del':
            try:
                db.execute('DELETE FROM periods WHERE id=?', (key,))
            except sqlite3.IntegrityError:
                raise ApiError('Đợt đã có dữ liệu (sinh viên, đề tài) nên không thể xóa. Hãy dùng chức năng "Kết thúc".')
            return
        w = item['weights']
        if w['gv'] + w['pb'] + w['hd'] != 100:
            raise ApiError('Tổng trọng số phải bằng 100%.')
        if item['status'] == 'Đang diễn ra' and db.execute(
                "SELECT COUNT(*) FROM periods WHERE status='Đang diễn ra' AND id<>?", (item['id'],)).fetchone()[0] >= 2:
            raise ApiError('Chỉ được có tối đa 2 đợt đang diễn ra.')
        upsert(db, 'periods', dict(id=item['id'], name=item['name'], status=item['status'], w_gv=w['gv'], w_pb=w['pb'], w_hd=w['hd']), ['id'])
        db.execute('DELETE FROM period_phases WHERE period_id=?', (item['id'],))
        for i, (name, start, end) in enumerate(item['phases']):
            db.execute('INSERT INTO period_phases VALUES(?,?,?,?,?)', (item['id'], i, name, start, end))
    elif c == 'plans':
        if kind == 'del':
            db.execute('DELETE FROM plans WHERE period_id=? AND code=?', (pid, key))
            return
        upsert(db, 'plans', dict(period_id=pid, code=item['code'], status=item['status'], comment=item.get('comment')), ['period_id', 'code'])
        db.execute('DELETE FROM plan_milestones WHERE period_id=? AND code=?', (pid, item['code']))
        for i, m in enumerate(item.get('milestones') or []):
            db.execute('INSERT INTO plan_milestones VALUES(?,?,?,?,?,?)', (pid, item['code'], i, m.get('title'), m.get('due'), m.get('desc')))
    elif c == 'theses':
        if kind == 'del':
            db.execute('DELETE FROM theses WHERE period_id=? AND code=?', (pid, key))
            return
        cf = item.get('confirm') or {}
        upsert(db, 'theses', dict(period_id=pid, code=item['code'], file=item.get('file'), size=item.get('size'), src=item.get('src'),
                                  date=item.get('date'), sim=item.get('sim'),
                                  confirm_ok=(1 if cf.get('ok') else 0) if item.get('confirm') else None,
                                  confirm_score=cf.get('score'), confirm_comment=cf.get('comment')), ['period_id', 'code'])
    elif c == 'councils':
        if kind == 'del':
            db.execute('DELETE FROM councils WHERE period_id=? AND id=?', (pid, key))
            return
        upsert(db, 'councils', dict(period_id=pid, id=item['id'], date=item.get('date'), session=item.get('session'), room=item.get('room')),
               ['period_id', 'id'])
        db.execute('DELETE FROM council_members WHERE period_id=? AND council_id=?', (pid, item['id']))
        for m in item.get('members') or []:
            db.execute('INSERT INTO council_members VALUES(?,?,?,?)', (pid, item['id'], m['uid'], m['role']))
    elif c == 'scores':
        if kind == 'del':
            code, uid = str(key).split('|', 1)
            db.execute('DELETE FROM scores WHERE period_id=? AND code=? AND uid=?', (pid, code, uid))
            return
        cs = (list(item.get('c') or []) + [None] * 4)[:4]
        upsert(db, 'scores', dict(period_id=pid, code=item['code'], uid=item['uid'], c1=cs[0], c2=cs[1], c3=cs[2], c4=cs[3],
                                  comment=item.get('comment')), ['period_id', 'code', 'uid'])
    else:
        raise ApiError(f'Tập dữ liệu không hợp lệ: {c}')


def apply_meta(db, sess, pid, key, item):
    role, value = sess['role'], item.get('v')
    if key == 'currentPeriod':
        if role != 'GVU':
            raise ApiError('Chỉ giáo vụ khoa được đổi đợt hiện hành.', 403)
        if value and not db.execute('SELECT 1 FROM periods WHERE id=?', (value,)).fetchone():
            raise ApiError('Đợt không tồn tại.')
        set_setting(db, 'current_period', value)
    elif key == 'assignLocked':
        if role != 'TBM':
            raise ApiError('Chỉ trưởng bộ môn được chốt phân công.', 403)
        db.execute('UPDATE periods SET assign_locked=? WHERE id=?', (1 if value else 0, pid))
    elif str(key).startswith('published:'):
        if role != 'GVU':
            raise ApiError('Chỉ giáo vụ khoa được công bố kết quả.', 403)
        db.execute('UPDATE councils SET published=? WHERE period_id=? AND id=?', (1 if value else 0, pid, key.split(':', 1)[1]))
    else:
        raise ApiError('Thao tác không hợp lệ.')


# ---------------------------------------------------------------- máy chủ HTTP
STATIC = re.compile(r'^/(index\.html|css/[\w.-]+\.css|js/[\w.-]+\.js)$')
MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8'}
OPEN_WHEN_MUST_CHANGE = {'/api/me', '/api/logout', '/api/change-password'}


class Handler(BaseHTTPRequestHandler):
    server_version = 'ThesisHub/1.0'

    def log_message(self, fmt, *args):
        if not self.path.startswith('/api/state'):
            super().log_message(fmt, *args)

    # ---- trả lời
    def send_json(self, data, status=200, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path):
        if path == '/':
            path = '/index.html'
        if not STATIC.match(path):
            return self.send_json({'error': 'Không tìm thấy'}, 404)
        full = os.path.join(BASE, path.lstrip('/'))
        if not os.path.isfile(full):
            return self.send_json({'error': 'Không tìm thấy'}, 404)
        with open(full, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', MIME[os.path.splitext(full)[1]])
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    # ---- phiên đăng nhập
    def session_token(self):
        cookie = SimpleCookie(self.headers.get('Cookie') or '')
        return cookie['thsid'].value if 'thsid' in cookie else None

    def current_session(self, db):
        token = self.session_token()
        if not token:
            raise ApiError('Chưa đăng nhập.', 401)
        sess = db.execute('SELECT s.*, u.status, u.must_change_pw FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=?', (token,)).fetchone()
        if not sess or time.time() - sess['last'] > SESSION_TIMEOUT:
            db.execute('DELETE FROM sessions WHERE token=?', (token,))
            db.commit()
            raise ApiError('Phiên làm việc đã hết hạn sau 30 phút không thao tác.', 401)
        if sess['status'] == 'Khóa':
            db.execute('DELETE FROM sessions WHERE token=?', (token,))
            raise ApiError('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên.', 401)
        db.execute('UPDATE sessions SET last=? WHERE token=?', (int(time.time()), token))
        return dict(sess)

    def read_body(self):
        if self.command in ('POST', 'PUT') and not (self.headers.get('Content-Type') or '').startswith('application/json'):
            raise ApiError('Yêu cầu phải gửi dạng JSON.', 415)  # chặn gửi form chéo trang (CSRF)
        length = int(self.headers.get('Content-Length') or 0)
        if length > 5_000_000:
            raise ApiError('Dữ liệu gửi lên quá lớn.', 413)
        raw = self.rfile.read(length) if length else b'{}'
        try:
            return json.loads(raw or b'{}')
        except json.JSONDecodeError:
            raise ApiError('Dữ liệu JSON không hợp lệ.')

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/api/'):
            return self.handle_api('GET', path)
        self.serve_static(path)

    def do_POST(self):
        self.handle_api('POST', urlparse(self.path).path)

    def do_PUT(self):
        self.handle_api('PUT', urlparse(self.path).path)

    def handle_api(self, method, path):
        db = connect()
        try:
            body = self.read_body()
            with db:
                result = self.route(db, method, path, body)
            if isinstance(result, tuple):
                self.send_json(result[0], cookie=result[1])
            else:
                self.send_json(result)
        except ApiError as e:
            self.send_json({'error': str(e)}, e.status)
        except sqlite3.IntegrityError as e:
            self.send_json({'error': f'Dữ liệu không hợp lệ hoặc đang được tham chiếu ({e}).'}, 409)
        finally:
            db.close()

    # ---- định tuyến API
    def route(self, db, method, path, body):
        if method == 'GET' and path == '/api/bootstrap':
            # "mới khởi tạo" = quản trị viên ban đầu chưa từng đổi mật khẩu
            fresh = db.execute('SELECT must_change_pw FROM users WHERE email=?', (ADMIN_EMAIL,)).fetchone()
            demo = []
            if DEMO_SHORTCUTS:
                for uid, code, name, email, roles, dept, role in DEMO_ACCOUNTS:
                    row = db.execute("SELECT status FROM users WHERE id=?", (uid,)).fetchone()
                    if row and row['status'] != 'Khóa':
                        demo.append({'role': role, 'name': name, 'email': email, 'password': DEMO_PASSWORD})
            return {'fresh': bool(fresh and fresh[0]), 'adminEmail': ADMIN_EMAIL, 'adminPassword': ADMIN_PASSWORD if fresh and fresh[0] else None,
                    'demo': demo}
        if method == 'POST' and path == '/api/login':
            return self.login(db, body)
        if method == 'POST' and path == '/api/forgot':
            return self.forgot(db, body)
        if method == 'POST' and path == '/api/reset':
            return self.reset(db, body)

        sess = self.current_session(db)
        if sess['must_change_pw'] and path not in OPEN_WHEN_MUST_CHANGE:
            raise ApiError('Bạn cần đổi mật khẩu trước khi tiếp tục.', 403)
        uid, role = sess['user_id'], sess['role']

        if method == 'GET' and path == '/api/me':
            u = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
            return {'user': user_json(u), 'role': role}
        if method == 'POST' and path == '/api/logout':
            db.execute('DELETE FROM sessions WHERE token=?', (self.session_token(),))
            return {'ok': True}, 'thsid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
        if method == 'POST' and path == '/api/change-password':
            return self.change_password(db, sess, body)
        if method == 'POST' and path == '/api/role':
            u = db.execute('SELECT roles FROM users WHERE id=?', (uid,)).fetchone()
            if body.get('role') not in u['roles'].split(','):
                raise ApiError('Vai trò không hợp lệ.', 403)
            db.execute('UPDATE sessions SET role=? WHERE token=?', (body['role'], sess['token']))
            return {'ok': True}
        if method == 'GET' and path == '/api/state':
            return load_state(db, sess)
        if method == 'POST' and path == '/api/sync':
            pid = setting(db, 'current_period')
            ops = body.get('ops') or []
            for op in ops:
                apply_op(db, sess, pid, op)
            return {'ok': True, 'applied': len(ops)}

        # UC1.2 – quản lý tài khoản (chỉ quản trị viên)
        m = re.match(r'^/api/users(?:/([\w-]+))?(?:/(lock|unlock|reset-password))?$', path)
        if m:
            if role != 'QTV':
                raise ApiError('Chỉ quản trị viên được quản lý tài khoản.', 403)
            return self.users_api(db, sess, method, m.group(1), m.group(2), body)
        raise ApiError('Không tìm thấy API.', 404)

    # ---- UC1.1 Đăng nhập
    def login(self, db, body):
        email = str(body.get('email') or '').strip().lower()
        pw = str(body.get('password') or '')
        if not EMAIL_RE.match(email):
            raise ApiError('Email phải thuộc tên miền @phenikaa-uni.edu.vn hoặc @st.phenikaa-uni.edu.vn.')
        u = db.execute('SELECT * FROM users WHERE lower(email)=?', (email,)).fetchone()
        if u and u['status'] == 'Khóa':
            raise ApiError('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên.')
        if u and u['locked_until'] > now_ms():
            mins = -(-(u['locked_until'] - now_ms()) // 60000)
            raise ApiError(f'Tài khoản đang tạm khóa do nhập sai mật khẩu 5 lần. Thử lại sau {mins} phút.')
        if not u or not check_pw(pw, u['password_hash']):
            if u:
                failed = u['failed'] + 1
                if failed >= 5:
                    db.execute('UPDATE users SET failed=0, locked_until=? WHERE id=?', (now_ms() + LOCK_MS, u['id']))
                    db.commit()  # lưu lại trạng thái khóa trước khi báo lỗi
                    raise ApiError('Sai mật khẩu 5 lần liên tiếp. Tài khoản bị tạm khóa 15 phút.')
                db.execute('UPDATE users SET failed=? WHERE id=?', (failed, u['id']))
                db.commit()
                raise ApiError(f'Email hoặc mật khẩu không chính xác. (Còn {5 - failed} lần thử)')
            raise ApiError('Email hoặc mật khẩu không chính xác.')
        db.execute('UPDATE users SET failed=0, locked_until=0 WHERE id=?', (u['id'],))
        db.execute('INSERT INTO login_log(user_id, time) VALUES(?, ?)', (u['id'], local_iso()))
        token = secrets.token_urlsafe(32)
        db.execute('INSERT INTO sessions(token, user_id, role, last) VALUES(?,?,?,?)', (token, u['id'], u['roles'].split(',')[0], int(time.time())))
        cookie = f'thsid={token}; Path=/; HttpOnly; SameSite=Lax' + ('; Max-Age=2592000' if body.get('remember') else '')
        return {'user': user_json(u), 'mustChangePw': bool(u['must_change_pw'])}, cookie

    def change_password(self, db, sess, body):
        u = db.execute('SELECT * FROM users WHERE id=?', (sess['user_id'],)).fetchone()
        if not u['must_change_pw'] and not check_pw(str(body.get('old') or ''), u['password_hash']):
            raise ApiError('Mật khẩu hiện tại không đúng.')
        new = str(body.get('new') or '')
        if not PW_RE.match(new):
            raise ApiError('Mật khẩu mới tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số.')
        db.execute('UPDATE users SET password_hash=?, must_change_pw=0 WHERE id=?', (hash_pw(new), u['id']))
        db.execute('INSERT INTO notifications(id, user_id, text, time, is_read) VALUES(?,?,?,?,0)',
                   (now_ms() * 1000 + secrets.randbelow(1000), u['id'], 'Đổi mật khẩu thành công.', local_iso()))
        return {'ok': True}

    def forgot(self, db, body):
        email = str(body.get('email') or '').strip().lower()
        if not EMAIL_RE.match(email):
            raise ApiError('Email không hợp lệ hoặc không thuộc tên miền của trường.')
        u = db.execute('SELECT id FROM users WHERE lower(email)=?', (email,)).fetchone()
        if u:
            token = secrets.token_urlsafe(24)
            db.execute('INSERT INTO reset_tokens VALUES(?,?,?)', (token, u['id'], int(time.time()) + RESET_TTL))
            host = self.headers.get('Host') or 'localhost:8000'
            print(f'[Email] Gửi tới {email}: đặt lại mật khẩu tại http://{host}/#/reset/{token} (hiệu lực 30 phút)')
        return {'ok': True}  # không tiết lộ email có tồn tại hay không

    def reset(self, db, body):
        row = db.execute('SELECT * FROM reset_tokens WHERE token=?', (str(body.get('token') or ''),)).fetchone()
        if not row or row['expires'] < time.time():
            raise ApiError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.')
        new = str(body.get('password') or '')
        if not PW_RE.match(new):
            raise ApiError('Mật khẩu tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số.')
        db.execute('UPDATE users SET password_hash=?, failed=0, locked_until=0, must_change_pw=0 WHERE id=?', (hash_pw(new), row['user_id']))
        db.execute('DELETE FROM reset_tokens WHERE user_id=?', (row['user_id'],))
        return {'ok': True}

    # ---- UC1.2 Quản lý tài khoản
    def users_api(self, db, sess, method, uid, action, body):
        if method == 'POST' and not uid:
            code, name = str(body.get('code') or '').strip(), str(body.get('name') or '').strip()
            email = str(body.get('email') or '').strip().lower()
            roles = [r for r in body.get('roles') or [] if r in ROLES]
            if not code or not name or not roles:
                raise ApiError('Thiếu mã, họ tên hoặc vai trò.')
            if not EMAIL_RE.match(email):
                raise ApiError('Email sai định dạng hoặc không thuộc tên miền của trường.')
            if db.execute('SELECT 1 FROM users WHERE lower(email)=? OR code=?', (email, code)).fetchone():
                raise ApiError('Tài khoản đã tồn tại.')
            new_id = 'u' + secrets.token_hex(6)
            db.execute('INSERT INTO users(id, code, name, email, roles, dept, password_hash, must_change_pw) VALUES(?,?,?,?,?,?,?,1)',
                       (new_id, code, name, email, ','.join(roles), body.get('dept') or '', hash_pw(DEFAULT_PASSWORD)))
            print(f'[Email] Gửi tới {email}: tài khoản ThesisHub đã được tạo, mật khẩu tạm {DEFAULT_PASSWORD}')
            return {'ok': True, 'id': new_id}
        u = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
        if not u:
            raise ApiError('Không tìm thấy tài khoản.', 404)
        if method == 'PUT' and not action:
            roles = [r for r in body.get('roles') or [] if r in ROLES]
            if not roles or not str(body.get('name') or '').strip():
                raise ApiError('Thiếu họ tên hoặc vai trò.')
            if uid == sess['user_id'] and 'QTV' not in roles:
                raise ApiError('Không thể tự gỡ vai trò quản trị viên của chính mình.')
            db.execute('UPDATE users SET name=?, roles=?, dept=? WHERE id=?', (body['name'].strip(), ','.join(roles), body.get('dept') or '', uid))
            return {'ok': True}
        if method == 'POST' and action == 'lock':
            if uid == sess['user_id']:
                raise ApiError('Không thể tự khóa tài khoản của chính mình.')
            db.execute("UPDATE users SET status='Khóa' WHERE id=?", (uid,))
            db.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
            return {'ok': True}
        if method == 'POST' and action == 'unlock':
            db.execute("UPDATE users SET status='Hoạt động', failed=0, locked_until=0 WHERE id=?", (uid,))
            return {'ok': True}
        if method == 'POST' and action == 'reset-password':
            db.execute('UPDATE users SET password_hash=?, must_change_pw=1 WHERE id=?', (hash_pw(DEFAULT_PASSWORD), uid))
            return {'ok': True, 'password': DEFAULT_PASSWORD}
        raise ApiError('Không tìm thấy API.', 404)


def main():
    ap = argparse.ArgumentParser(description='Máy chủ ThesisHub')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8000)
    args = ap.parse_args()
    init_db()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    shown = 'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host
    print(f'[ThesisHub] Đang chạy tại http://{shown}:{args.port}  (Ctrl+C để dừng)')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n[ThesisHub] Đã dừng.')


if __name__ == '__main__':
    main()
