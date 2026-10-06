# ThesisHub – Hệ thống quản lý đồ án tốt nghiệp

Ứng dụng web cài đặt 23 use-case của Chương 1 (UC1.1–UC5.5) cho 5 vai trò.
Dữ liệu lưu trong cơ sở dữ liệu SQLite trên máy chủ. Hệ thống bắt đầu **trống**, mọi dữ liệu do người dùng tự nhập.

## Chạy
Cần Python 3.8+ (không phải cài thêm thư viện nào).

```bash
cd website
python3 server.py                  # mở http://localhost:8000
python3 server.py --port 9000      # đổi cổng
python3 server.py --host 0.0.0.0   # cho máy khác cùng mạng LAN truy cập (http://<IP-máy-bạn>:8000)
```

Lần chạy đầu tiên tạo file `thesishub.db` và một tài khoản quản trị:
`admin@phenikaa-uni.edu.vn` / `Admin@123` (bắt buộc đổi mật khẩu khi đăng nhập lần đầu).

### Tài khoản dùng thử (nút "Đăng nhập nhanh" ở trang đăng nhập)
Mỗi lần khởi động, máy chủ tạo các tài khoản còn thiếu, không ghi đè tài khoản đã có. Mật khẩu chung: `Thesis@2026`.

| Vai trò | Email | Họ tên |
|---|---|---|
| Quản trị viên | quantri.demo@phenikaa-uni.edu.vn | Nguyễn Văn Quản |
| Giáo vụ khoa | giaovu.demo@phenikaa-uni.edu.vn | Trần Thị Hoa |
| Trưởng bộ môn (kiêm GV) | tbm.demo@phenikaa-uni.edu.vn | PGS.TS. Đỗ Quang Vinh |
| Giảng viên | giangvien.demo@phenikaa-uni.edu.vn | TS. Phạm Thu Hằng |
| Sinh viên (mã 22019999) | sinhvien.demo@st.phenikaa-uni.edu.vn | Nguyễn Minh Anh |

Giảng viên, TBM và sinh viên phải được giáo vụ thêm vào đợt thì mới dùng được các chức năng:
- **Giảng viên & hạn mức → + Thêm giảng viên vào đợt** cho Vinh (PGS.TS) và Hằng (TS).
- **Sinh viên → + Thêm sinh viên** với mã `22019999`. Hệ thống tự gắn với tài khoản sinh viên demo.

Khi triển khai thật, đặt `DEMO_SHORTCUTS = False` ở đầu `server.py` để ẩn các nút đăng nhập nhanh.

Muốn xóa sạch dữ liệu để làm lại từ đầu: dừng máy chủ, xóa file `thesishub.db` rồi chạy lại.

## Thứ tự nhập dữ liệu
1. **Quản trị viên** → Tài khoản người dùng: tạo tài khoản giáo vụ khoa, trưởng bộ môn (chọn cả *Giảng viên* + *Trưởng bộ môn*), giảng viên.
   Mật khẩu tạm của mọi tài khoản mới là `Phenikaa@123`, người dùng phải đổi ở lần đăng nhập đầu.
2. **Giáo vụ khoa** → Đợt đồ án: tạo đợt (đợt đầu tiên tự thành đợt hiện hành) → Giảng viên & hạn mức: thêm giảng viên vào đợt
   → Sinh viên: thêm từng người hoặc nhập file CSV. Tài khoản sinh viên được tạo tự động: `<mã SV>@st.phenikaa-uni.edu.vn`.
3. **Giảng viên** đề xuất đề tài → **Trưởng bộ môn** duyệt → **Sinh viên** đăng ký nguyện vọng → giảng viên chấp nhận / TBM phân công.
4. Sinh viên lập kế hoạch, nộp báo cáo tiến độ, nộp quyển → GVHD duyệt, đánh giá, xác nhận đủ điều kiện bảo vệ.
5. Giáo vụ lập hội đồng, phân công phản biện và xếp lịch → giảng viên gửi phiếu phản biện, chấm điểm → giáo vụ công bố kết quả và lưu trữ.

Lưu ý: các chức năng mở theo mốc thời gian của đợt (ví dụ chỉ đề xuất đề tài / thêm sinh viên trong giai đoạn đăng ký),
nên khi tạo đợt hãy đặt giai đoạn "Đăng ký đề tài" bao gồm ngày hôm nay.

Quên mật khẩu: bản chạy cục bộ chưa nối dịch vụ email, liên kết đặt lại mật khẩu được in ra cửa sổ đang chạy `server.py`.

## Kiến trúc
```
Trình duyệt (HTML/CSS/JS)  ──REST/JSON──►  server.py (Python, http.server)  ──►  thesishub.db (SQLite)
```

| API | Chức năng |
|---|---|
| `POST /api/login`, `/api/logout`, `/api/role`, `/api/change-password`, `/api/forgot`, `/api/reset` | UC1.1 đăng nhập, phiên, mật khẩu |
| `GET /api/me`, `GET /api/state` | thông tin người dùng, dữ liệu của đợt hiện hành (lọc theo vai trò) |
| `POST /api/sync` | ghi các thay đổi (thêm/sửa/xóa bản ghi) trong một giao dịch, có kiểm tra quyền |
| `POST /api/users`, `PUT /api/users/{id}`, `POST /api/users/{id}/lock\|unlock\|reset-password` | UC1.2 quản lý tài khoản |

Máy chủ đảm nhận:
- **Bảo mật:** băm mật khẩu bằng PBKDF2, cookie phiên HttpOnly, hết phiên sau 30 phút, khóa 15 phút khi sai 5 lần.
- **Phân quyền:** mỗi vai trò chỉ ghi được loại dữ liệu của mình. Sinh viên chỉ đọc/ghi dữ liệu của chính mình. Không ai tự duyệt hay tự đánh giá cho chính mình.
- **Ràng buộc:** khóa ngoại giữa các bảng, ví dụ không xóa được đợt đã có dữ liệu.

Bảng dữ liệu (xem `SCHEMA` trong `server.py`): `users, sessions, reset_tokens, login_log, settings, periods, period_phases,
lecturers, topics, students, requests, plans, plan_milestones, reports, theses, councils, council_members, defenses,
reviews, scores, archive, notifications`. Các bảng nghiệp vụ có cột `period_id` để tách dữ liệu theo đợt.

```
server.py                máy chủ, REST API, lược đồ CSDL, phân quyền
index.html, css/         giao diện
js/data.js               hằng số dùng chung (vai trò, mẫu kế hoạch, tiêu chí chấm)
js/app.js                gọi API, đồng bộ dữ liệu, phiên đăng nhập, điều hướng, khung trang
js/views-student.js      UC2.3, UC3.1, UC3.2, UC4.1, UC5.3
js/views-lecturer.js     UC2.1, UC2.2, UC2.4, UC2.5, UC3.3, UC4.2, UC4.5, UC5.1
js/views-admin.js        UC1.2–UC1.5, UC3.4, UC4.3, UC4.4, UC5.2, UC5.4, UC5.5
```

Giới hạn: tệp tải lên (báo cáo, quyển đồ án) hiện chỉ ghi nhận tên và dung lượng, chưa lưu nội dung tệp.
Phần lớn quy tắc nghiệp vụ chi tiết (hạn mức, số mốc kế hoạch…) được kiểm tra ở giao diện.
