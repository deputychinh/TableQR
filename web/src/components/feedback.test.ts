import { fireEvent, render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { ref } from 'vue';
import BaseSheet from './BaseSheet.vue';
import ConfirmSheet from './ConfirmSheet.vue';
import EmptyState from './EmptyState.vue';
import ErrorState from './ErrorState.vue';
import LoadingState from './LoadingState.vue';
import NumberStepper from './NumberStepper.vue';

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

describe('ConfirmSheet', () => {
  const props = {
    open: true,
    title: 'Xoá Bàn 1?',
    message: 'Không thể hoàn tác.',
    confirmLabel: 'Xoá bàn',
    cancelLabel: 'Huỷ',
  };

  it('spells out the consequence and reports confirm or cancel', async () => {
    const onConfirm = vi.fn<() => void>();
    const onCancel = vi.fn<() => void>();
    render(ConfirmSheet, { props: { ...props, onConfirm, onCancel } });
    expect(screen.getByRole('dialog', { name: 'Xoá Bàn 1?' }).textContent).toContain(
      'Không thể hoàn tác.',
    );
    expect(screen.getByRole('button', { name: 'Xoá bàn' }).className).toContain(
      'base-button--danger',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bàn' }));
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cannot be dismissed while busy', async () => {
    const onCancel = vi.fn<() => void>();
    render(ConfirmSheet, { props: { ...props, busy: true, onCancel } });
    expect((screen.getByRole('button', { name: 'Huỷ' }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('NumberStepper', () => {
  const renderStepper = (initial: number) => {
    const value = ref(initial);
    render(NumberStepper, {
      props: {
        label: 'Số chỗ ngồi',
        min: 1,
        max: 30,
        decrementLabel: 'Bớt',
        incrementLabel: 'Thêm',
        hint: 'Từ 1 đến 30',
        modelValue: value.value,
        'onUpdate:modelValue': (v: number) => (value.value = v),
      },
    });
    return value;
  };

  it('steps within the bounds and disables a button at its bound', async () => {
    const value = renderStepper(1);
    expect((screen.getByRole('button', { name: 'Bớt' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(value.value).toBe(2);
  });

  it('accepts typing, and an empty field becomes NaN for the form to reject', async () => {
    const value = renderStepper(4);
    const input = screen.getByLabelText('Số chỗ ngồi');
    await userEvent.clear(input);
    expect(value.value).toBeNaN();
    await userEvent.type(input, '12');
    expect(value.value).toBe(12);
  });

  it('links its error to the input', () => {
    render(NumberStepper, {
      props: {
        label: 'Số chỗ',
        min: 1,
        max: 30,
        decrementLabel: 'Bớt',
        incrementLabel: 'Thêm',
        error: 'Sai',
        modelValue: 40,
      },
    });
    const input = screen.getByLabelText('Số chỗ');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Sai',
    );
    expect((screen.getByRole('button', { name: 'Thêm' }) as HTMLButtonElement).disabled).toBe(true);
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
