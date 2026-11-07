// Source of truth for every display string (Vietnamese UI).
export const vi = {
  app: {
    name: 'TableQR',
    tagline: 'Gọi món tại bàn bằng mã QR',
  },
  health: {
    title: 'Trạng thái hệ thống',
    loading: 'Đang kiểm tra máy chủ…',
    ok: 'Máy chủ và cơ sở dữ liệu đang hoạt động',
    error: 'Không kết nối được máy chủ. Vui lòng thử lại.',
    retry: 'Thử lại',
  },
} as const;

export type Messages = typeof vi;
