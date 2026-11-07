// Platform admin screen (TQR-009).
export const adminLocale = {
  admin: {
    shellTitle: 'Quản trị nền tảng',
    title: 'Nhà hàng',
    lead: 'Tạm ngưng một nhà hàng khi có lạm dụng. Mở lại bất cứ lúc nào.',
    count: '{n} nhà hàng',
    loading: 'Đang tải danh sách nhà hàng…',
    retry: 'Thử lại',
    more: 'Xem thêm',
    empty: 'Chưa có nhà hàng nào đăng ký.',
    noOwner: 'Chưa có chủ quán',
    staffCount: '{n} tài khoản',
    status: {
      active: 'Đang hoạt động',
      suspended: 'Tạm ngưng',
    },
    suspend: 'Tạm ngưng',
    reactivate: 'Mở lại',
    suspendTitle: 'Tạm ngưng {name}?',
    suspendBody:
      'Toàn bộ nhân viên của nhà hàng bị đăng xuất ngay và không đăng nhập được. Khách quét mã QR sẽ thấy "Nhà hàng tạm ngưng".',
    reactivateTitle: 'Mở lại {name}?',
    reactivateBody: 'Nhân viên đăng nhập lại được và khách gọi món được như trước.',
    suspended: 'Đã tạm ngưng {name}.',
    reactivated: 'Đã mở lại {name}.',
    errors: {
      load: 'Không tải được danh sách nhà hàng.',
      notFound: 'Không tìm thấy nhà hàng này.',
    },
  },
} as const;
