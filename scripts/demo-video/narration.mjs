// Narration of the phone demo video, one entry per line, in the order the video speaks them.
// `caption` is shown on the phone (digits are fine there); `speak` is what the macOS voice reads
// when it differs (numbers written as words so `say -v Linh` reads them naturally).
// Edit the words here; `make demo-video` re-records and re-voices everything.

/** @type {Record<string, { caption: string, speak?: string }>} */
export const narration = {
  intro: {
    caption: 'Xin chào anh chị chủ quán! Đây là TableQR: khách quét mã QR trên bàn để tự gọi món.',
  },
  signup1: {
    caption: 'Đầu tiên, chủ quán đăng ký ngay trên điện thoại: tên quán, email và mật khẩu.',
  },
  signup2: {
    caption: 'Bấm “Tạo nhà hàng” là xong. Trang Tổng quan chỉ ba bước để bắt đầu.',
    speak: 'Bấm Tạo nhà hàng là xong. Trang Tổng quan chỉ ba bước để bắt đầu.',
  },
  menu1: {
    caption: 'Bước 1: thêm thực đơn. Quán có sẵn một khu bếp, mình tạo nhóm “Món chính”.',
    speak: 'Bước một: thêm thực đơn. Quán có sẵn một khu bếp, mình tạo nhóm Món chính.',
  },
  menu2: {
    caption: 'Thêm món và giá bán: Bún chả, 45.000 đồng.',
    speak: 'Thêm món và giá bán: Bún chả, bốn mươi lăm nghìn đồng.',
  },
  menu3: {
    caption: 'Thêm tiếp Phở bò, Nem rán, Trà đá… là thực đơn đã sẵn sàng.',
    speak: 'Thêm tiếp Phở bò, Nem rán, Trà đá, là thực đơn đã sẵn sàng.',
  },
  tables1: {
    caption: 'Bước 2: thêm bàn. Mỗi bàn có một mã QR riêng.',
    speak: 'Bước hai: thêm bàn. Mỗi bàn có một mã QR riêng.',
  },
  tables2: {
    caption: 'Bấm “In tất cả mã QR”, in ra rồi dán lên từng bàn.',
    speak: 'Bấm In tất cả mã QR, in ra, rồi dán lên từng bàn.',
  },
  settings1: {
    caption: 'Bước 3: chọn cách quán vận hành. Ví dụ: món chờ quá 10 phút thì bếp được nhắc.',
    speak: 'Bước ba: chọn cách quán vận hành. Ví dụ: món chờ quá mười phút thì bếp được nhắc.',
  },
  settings2: {
    caption: 'Chuyển khoản QR đang tắt: khách trả tiền tại quầy. Muốn dùng thì bật sau.',
    speak: 'Chuyển khoản bằng mã QR đang tắt, khách trả tiền tại quầy. Muốn dùng thì bật sau.',
  },
  staff1: {
    caption: 'Tạo tài khoản cho bếp: tên, email, mật khẩu, chọn vai trò “Bếp”.',
    speak: 'Tạo tài khoản cho bếp: tên, email, mật khẩu, chọn vai trò Bếp.',
  },
  kitchen1: {
    caption: 'Đầu bếp đăng nhập trên điện thoại của bếp bằng tài khoản vừa tạo.',
  },
  kitchen2: {
    caption: 'Bấm “Bật đọc to”: có món mới là máy đọc lên.',
    speak: 'Bấm Bật đọc to. Có món mới là máy đọc lên.',
  },
  guest1: {
    caption: 'Khách ngồi Bàn 1, quét mã QR bằng camera điện thoại.',
    speak: 'Khách ngồi Bàn một, quét mã QR bằng camera điện thoại.',
  },
  guest2: {
    caption: 'Trang gọi món mở ngay, không cần cài app. Khách chọn số người.',
  },
  guest3: {
    caption: 'Khách gọi 2 phở bò và 1 trà đá, rồi bấm “Gửi món”.',
    speak: 'Khách gọi hai phở bò và một trà đá, rồi bấm Gửi món.',
  },
  guest4: {
    caption: 'Khách thấy từng món đang chờ bếp làm.',
  },
  kitchen3: {
    caption: 'Đầu bếp không cần nhìn màn hình: máy đọc to bàn và món.',
    speak: 'Đầu bếp không cần nhìn màn hình, máy đọc to bàn và món.',
  },
  later: {
    caption: '10 phút sau…',
    speak: 'Mười phút sau.',
  },
  kitchen4: {
    caption: 'Món chờ quá 10 phút: máy nhắc lại, phiếu món hiện “Trễ”.',
    speak: 'Món chờ quá mười phút, máy nhắc lại, phiếu món hiện chữ Trễ.',
  },
  cook1: {
    caption: 'Bếp bấm “Bắt đầu nấu”, nấu xong bấm “Xong”.',
    speak: 'Bếp bấm Bắt đầu nấu, nấu xong bấm Xong.',
  },
  serve1: {
    caption: 'Phục vụ thấy món đã xong, bưng ra rồi bấm “Đã ra bàn”.',
    speak: 'Phục vụ thấy món đã xong, bưng ra, rồi bấm Đã ra bàn.',
  },
  serve2: {
    caption: 'Điện thoại của khách tự cập nhật: “Đã ra bàn”.',
    speak: 'Điện thoại của khách tự cập nhật: Đã ra bàn.',
  },
  pay1: {
    caption: 'Ăn xong, khách bấm “Xem hoá đơn / Thanh toán”: thanh toán tại quầy.',
    speak: 'Ăn xong, khách bấm Xem hoá đơn, rồi thanh toán tại quầy.',
  },
  pay2: {
    caption: 'Thu ngân nhận tiền, bấm “Đã nhận tiền”.',
    speak: 'Thu ngân nhận tiền, bấm Đã nhận tiền.',
  },
  pay3: {
    caption: 'Khách thấy “Đã thanh toán”. Quán cũng có thể bật chuyển khoản QR trong Cài đặt.',
    speak:
      'Khách thấy Đã thanh toán. Quán cũng có thể bật chuyển khoản bằng mã QR trong phần Cài đặt.',
  },
  outro: {
    caption: 'Mỗi quán một tài khoản, cách vận hành riêng. Dùng ngay trên điện thoại!',
    speak:
      'Mỗi quán một tài khoản, cách vận hành riêng. Dùng ngay trên điện thoại, không cần cài app. Chúc quán mình đông khách!',
  },
};

/** The texts of the title and end cards (rendered to PNG, since this ffmpeg has no drawtext). */
export const cards = {
  strip: 'TableQR — gọi món bằng QR tại bàn',
  title: 'TableQR',
  titleLead: 'Gọi món bằng mã QR tại bàn',
  titleNote: 'Hướng dẫn cho chủ quán · xem trên điện thoại',
  endLines: [
    'Mỗi quán một tài khoản, cách vận hành riêng',
    'Dùng ngay trên điện thoại — không cần cài app',
  ],
};
