// Kitchen screen strings (TQR-014). Spread into src/locales/vi.ts.
export const kitchenLocale = {
  kitchen: {
    title: 'Bếp',
    stations: 'Khu bếp',
    tabWaiting: '{n} món đang chờ',
    loading: 'Đang tải hàng chờ…',
    loadFailed: 'Không tải được hàng chờ của bếp.',
    retry: 'Thử lại',
    noStations: {
      title: 'Chưa có khu bếp',
      body: 'Chủ quán tạo khu bếp trong mục Thực đơn. Sau đó món khách gọi sẽ hiện ở đây.',
    },
    empty: {
      title: 'Chưa có món nào cần làm',
      body: 'Món khách gọi sẽ tự hiện ở đây, bàn vào trước ở trên cùng.',
    },
    columns: {
      waiting: 'Đang chờ ({n})',
      cooking: 'Đang nấu ({n})',
      emptyWaiting: 'Không có món đang chờ.',
      emptyCooking: 'Chưa nấu món nào. Bấm "Bắt đầu nấu" ở món trên cùng.',
    },
    status: {
      waiting: 'Đang chờ',
      cooking: 'Đang nấu',
    },
    ticket: {
      label: '{table}, {quantity} × {dish}',
      table: '{table} · {party} khách',
      quantity: '{n} ×',
      note: 'Ghi chú: {note}',
      waited: 'Chờ {n} phút',
      justIn: 'Vừa vào',
      late: 'Trễ',
      start: 'Bắt đầu nấu',
      done: 'Xong',
      drop: 'Bỏ món',
    },
    drop: {
      title: 'Bỏ {dish} của {table}?',
      body: 'Dùng khi bếp không làm được món này (hết nguyên liệu, hỏng). Khách sẽ thấy món “Đã huỷ” và không phải trả tiền món này. Nhớ báo phục vụ nói với khách.',
      confirm: 'Bỏ món',
      cancel: 'Huỷ',
      done: 'Đã bỏ {dish} của {table}. Hoá đơn của bàn đã được cập nhật.',
    },
    live: {
      reconnecting: 'Mất kết nối, đang kết nối lại…',
    },
    skip: {
      title: 'Có bàn gọi món này trước',
      body: '{tables} gọi {dish} trước bàn này. Ghi lý do nếu bạn vẫn làm bàn này trước.',
      bodyOther: 'Có bàn khác gọi {dish} trước bàn này. Ghi lý do nếu bạn vẫn làm bàn này trước.',
      bodySameTable:
        'Bàn này có một phần {dish} gọi trước món này. Ghi lý do nếu bạn vẫn làm món này trước.',
      reason: 'Lý do làm bàn này trước',
      hint: 'Ví dụ: Bàn này có trẻ nhỏ, khách giục. Tối đa 140 ký tự.',
      required: 'Hãy ghi lý do.',
      confirm: 'Xong món này',
      cancel: 'Huỷ',
    },
    errors: {
      changed: 'Món này vừa thay đổi ở máy khác. Hàng chờ đã được cập nhật.',
      failed: 'Không lưu được. Kiểm tra mạng rồi thử lại.',
    },
    done: '{dish} cho {table} đã xong.',
  },
} as const;
