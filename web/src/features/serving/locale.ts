// Waiter screen strings (TQR-015). Spread into src/locales/vi.ts.
export const servingLocale = {
  serving: {
    title: 'Phục vụ',
    heldOrders: 'Đơn chờ duyệt',
    loading: 'Đang tải món đã xong…',
    loadFailed: 'Không tải được danh sách món đã xong.',
    retry: 'Thử lại',
    ready: {
      title: 'Món đã xong — mang ra bàn',
      empty: {
        title: 'Chưa có món nào xong',
        body: 'Khi bếp bấm "Xong", món sẽ hiện ở đây theo từng bàn, món xong trước ở trên cùng.',
      },
    },
    tables: {
      title: 'Các bàn đang phục vụ',
      complete: 'Đủ món',
      remaining: 'Còn {n} món',
    },
    table: '{table} · {party} khách',
    item: {
      quantity: '{n} ×',
      note: 'Ghi chú: {note}',
      doneAt: 'Xong lúc {time}',
      serve: 'Đã ra bàn',
    },
    live: {
      reconnecting: 'Mất kết nối, đang kết nối lại…',
    },
    served: 'Đã ra bàn: {dish} cho {table}.',
    errors: {
      changed: 'Món này vừa được cập nhật ở máy khác. Danh sách đã được làm mới.',
      failed: 'Không lưu được. Kiểm tra mạng rồi thử lại.',
    },
  },
} as const;
