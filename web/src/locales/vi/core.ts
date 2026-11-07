// Core strings: app, landing, auth, navigation, errors.
export const core = {
  app: {
    name: 'TableQR',
    tagline: 'Gọi món tại bàn bằng mã QR',
  },
  landing: {
    title: 'Khách quét mã QR, gọi món ngay tại bàn',
    lead: 'Bếp làm theo đúng thứ tự khách vào, khách thấy món nào đang nấu, thanh toán bằng chuyển khoản VietQR. Miễn phí cho quán của bạn.',
    signUp: 'Đăng ký nhà hàng',
    signIn: 'Đăng nhập',
  },
  sheet: {
    cancel: 'Huỷ',
  },
  form: {
    showPassword: 'Hiện mật khẩu',
    hidePassword: 'Ẩn mật khẩu',
  },
  auth: {
    signUpTitle: 'Đăng ký nhà hàng',
    signUpLead: 'Mất khoảng 1 phút. Sau đó bạn thêm thực đơn và in mã QR cho từng bàn.',
    signInTitle: 'Đăng nhập',
    signInLead: 'Dành cho chủ quán và nhân viên.',
    restaurantName: 'Tên nhà hàng',
    restaurantNameHint: 'Khách sẽ thấy tên này khi quét mã QR.',
    email: 'Email',
    password: 'Mật khẩu',
    passwordHint: 'Ít nhất 10 ký tự.',
    submitSignUp: 'Tạo nhà hàng',
    submitSignIn: 'Đăng nhập',
    haveAccount: 'Đã có tài khoản?',
    noAccount: 'Chưa có tài khoản?',
    goSignIn: 'Đăng nhập',
    goSignUp: 'Đăng ký nhà hàng',
    errors: {
      restaurantName: 'Tên nhà hàng cần từ 2 đến 80 ký tự.',
      email: 'Email chưa đúng định dạng.',
      password: 'Mật khẩu cần ít nhất 10 ký tự.',
      emailTaken: 'Email đã được dùng. Hãy đăng nhập hoặc dùng email khác.',
      invalidCredentials: 'Email hoặc mật khẩu không đúng.',
      loginBlocked: 'Bạn đã nhập sai quá nhiều lần. Thử lại sau 15 phút.',
      restaurantSuspended:
        'Nhà hàng tạm ngưng. Liên hệ chủ quán hoặc bộ phận hỗ trợ TableQR để mở lại.',
    },
  },
  nav: {
    label: 'Quản lý nhà hàng',
    overview: 'Tổng quan',
    menu: 'Thực đơn',
    tables: 'Bàn & QR',
    staff: 'Nhân viên',
    settings: 'Cài đặt',
    signOut: 'Đăng xuất',
  },
  owner: {
    welcome: 'Chào mừng đến {name}',
    lead: 'Làm 3 bước sau là quán của bạn có thể nhận món qua mã QR.',
    steps: {
      menu: { title: 'Thêm thực đơn', body: 'Tạo khu bếp, nhóm món và món ăn với giá bán.' },
      tables: { title: 'Thêm bàn và in mã QR', body: 'Mỗi bàn một mã QR. In ra và dán lên bàn.' },
      settings: {
        title: 'Chọn cách vận hành',
        body: 'Trả tiền trước hay sau, ai mở bàn, tài khoản nhận chuyển khoản.',
      },
    },
    step: 'Bước {n}',
    open: 'Mở',
  },
  errors: {
    unexpected: 'Có lỗi xảy ra. Vui lòng thử lại.',
    network: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
    notFound: 'Không tìm thấy trang này.',
    backHome: 'Về trang chủ',
  },
} as const;
