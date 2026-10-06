// Hằng số dùng chung của ThesisHub. Dữ liệu nghiệp vụ được lưu trên máy chủ (server.py + SQLite).
const DEFAULT_PASSWORD = 'Phenikaa@123'; // mật khẩu tạm cho tài khoản mới, bắt buộc đổi ở lần đăng nhập đầu

const ROLE_NAMES = {
  QTV: 'Quản trị viên',
  GVU: 'Giáo vụ khoa',
  TBM: 'Trưởng bộ môn',
  GV: 'Giảng viên',
  SV: 'Sinh viên',
};

// Mẫu kế hoạch 7 mốc (UC3.1); hạn được chia đều trong giai đoạn "Thực hiện" của đợt hiện hành.
const MILESTONE_TITLES = [
  'Đề cương chi tiết', 'Đặc tả yêu cầu', 'Phân tích và thiết kế', 'Cài đặt chức năng chính',
  'Kiểm thử', 'Hoàn thiện sản phẩm', 'Bản thảo quyển đồ án',
];
function milestoneTemplate() {
  const ph = period().phases[1];
  const start = new Date(ph[1]).getTime(), end = new Date(ph[2]).getTime();
  const step = (end - start) / MILESTONE_TITLES.length;
  return MILESTONE_TITLES.map((title, i) => ({ title, due: new Date(start + step * (i + 1)).toISOString().slice(0, 10), desc: '' }));
}

// Tiêu chí phiếu chấm bảo vệ (UC5.1)
const CRITERIA = [
  { name: 'Nội dung, kết quả đề tài', max: 4.0 },
  { name: 'Hình thức quyển', max: 1.5 },
  { name: 'Trình bày, slide', max: 2.0 },
  { name: 'Trả lời câu hỏi', max: 2.5 },
];
