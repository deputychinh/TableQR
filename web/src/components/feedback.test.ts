import { fireEvent, render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import BaseSheet from './BaseSheet.vue';
import EmptyState from './EmptyState.vue';
import ErrorState from './ErrorState.vue';
import LoadingState from './LoadingState.vue';

describe('BaseSheet', () => {
  it('shows a named dialog only while open and asks to close on Esc and backdrop tap', async () => {
    const onClose = vi.fn<() => void>();
    const { rerender } = render(BaseSheet, {
      props: { open: false, title: 'Thêm bàn', onClose },
      slots: { default: 'Nội dung' },
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await rerender({ open: true, title: 'Thêm bàn', onClose });
    const dialog = screen.getByRole('dialog', { name: 'Thêm bàn' });
    expect(dialog.textContent).toContain('Nội dung');
    await fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
    await fireEvent.click(screen.getByText('Nội dung'));
    expect(onClose).toHaveBeenCalledTimes(2);
    await rerender({ open: false, title: 'Thêm bàn', onClose });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('EmptyState, ErrorState, LoadingState', () => {
  it('EmptyState renders its heading at the requested level with the action', () => {
    render(EmptyState, {
      props: { title: 'Chưa có bàn nào', body: 'Thêm bàn', headingLevel: 1 },
      slots: { action: '<button>Thêm bàn đầu tiên</button>' },
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Chưa có bàn nào' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm bàn đầu tiên' })).toBeTruthy();
  });

  it('ErrorState is an alert with a retry', async () => {
    const onRetry = vi.fn<() => void>();
    render(ErrorState, { props: { message: 'Lỗi mạng', retryLabel: 'Thử lại', onRetry } });
    expect(screen.getByRole('alert').textContent).toContain('Lỗi mạng');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('LoadingState tells screen readers what is loading', () => {
    render(LoadingState, { props: { label: 'Đang tải', rows: 2 } });
    expect(screen.getByRole('status').textContent).toContain('Đang tải');
  });
});
