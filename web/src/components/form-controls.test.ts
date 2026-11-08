import { fireEvent, render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { defineComponent, h, nextTick, ref } from 'vue';
import ConfirmSheet from './ConfirmSheet.vue';
import ErrorState from './ErrorState.vue';
import LoadingState from './LoadingState.vue';
import NumberStepper from './NumberStepper.vue';
import RadioCardGroup from './RadioCardGroup.vue';
import SelectField from './SelectField.vue';

describe('RadioCardGroup', () => {
  it('shows each choice as a named radio with its explanation and reports the pick', async () => {
    const value = ref('a');
    render(RadioCardGroup, {
      props: {
        legend: 'Khách trả tiền lúc nào?',
        options: [
          { value: 'a', title: 'Sau khi ăn', body: 'Trả một lần' },
          { value: 'b', title: 'Trước khi nấu' },
        ],
        modelValue: value.value,
        'onUpdate:modelValue': (v: string) => (value.value = v),
      },
    });
    expect(screen.getByRole('group', { name: 'Khách trả tiền lúc nào?' })).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Sau khi ăn/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByText('Trả một lần')).toBeTruthy();
    await userEvent.click(screen.getByText('Trước khi nấu'));
    expect(value.value).toBe('b');
  });
});

describe('NumberStepper', () => {
  const renderStepper = (start: number, extra: Record<string, unknown> = {}) => {
    const value = ref(start);
    const Host = defineComponent(
      () => () =>
        h(NumberStepper, {
          label: 'Tối đa',
          min: 1,
          max: 10,
          step: 0.5,
          unit: 'phần',
          decreaseLabel: 'Giảm',
          increaseLabel: 'Tăng',
          modelValue: value.value,
          'onUpdate:modelValue': (v: number) => (value.value = v),
          ...extra,
        }),
    );
    render(Host);
    return { value, input: screen.getByRole('spinbutton', { name: 'Tối đa' }) as HTMLInputElement };
  };

  it('steps up and down by half a portion and shows a Vietnamese decimal', async () => {
    const { value, input } = renderStepper(2);
    await userEvent.click(screen.getByRole('button', { name: 'Tăng' }));
    expect(value.value).toBe(2.5);
    expect(input.value).toBe('2,5');
    expect(input.getAttribute('aria-valuetext')).toBe('2,5 phần');
    await userEvent.click(screen.getByRole('button', { name: 'Giảm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Giảm' }));
    expect(value.value).toBe(1.5);
  });

  it('cannot go past its bounds: the button at the edge is disabled', () => {
    renderStepper(10);
    expect((screen.getByRole('button', { name: 'Tăng' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Giảm' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('snaps typed numbers to the nearest step inside the bounds (comma or dot)', async () => {
    const { value, input } = renderStepper(2);
    await userEvent.clear(input);
    await userEvent.type(input, '3,4');
    await fireEvent.blur(input);
    expect(value.value).toBe(3.5);
    await userEvent.clear(input);
    await userEvent.type(input, '99');
    await fireEvent.change(input);
    expect(value.value).toBe(10);
    await userEvent.clear(input);
    await userEvent.type(input, '0.2');
    await fireEvent.blur(input);
    expect(value.value).toBe(1);
  });

  it('puts back the last good value when the text is not a number', async () => {
    const { value, input } = renderStepper(2);
    await userEvent.clear(input);
    await userEvent.type(input, 'abc');
    await fireEvent.blur(input);
    expect(value.value).toBe(2);
    expect(input.value).toBe('2');
  });

  it('follows the keyboard: arrows step, Home and End jump to the bounds', async () => {
    const { value, input } = renderStepper(2);
    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(value.value).toBe(2.5);
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(value.value).toBe(1.5);
    await fireEvent.keyDown(input, { key: 'End' });
    expect(value.value).toBe(10);
    await fireEvent.keyDown(input, { key: 'Home' });
    expect(value.value).toBe(1);
    await fireEvent.keyDown(input, { key: 'a' });
    expect(value.value).toBe(1);
  });

  it('links hint and error to the input', () => {
    const { input } = renderStepper(2, { hint: 'Gợi ý', error: 'Sai' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
  });
});

describe('ConfirmSheet', () => {
  const renderSheet = (open: boolean, busy = false) => {
    const onConfirm = vi.fn<() => void>();
    const onCancel = vi.fn<() => void>();
    const result = render(ConfirmSheet, {
      props: {
        open,
        busy,
        title: 'Đổi tài khoản?',
        confirmLabel: 'Đồng ý',
        cancelLabel: 'Xem lại',
        onConfirm,
        onCancel,
      },
      slots: { default: 'Tiền sẽ vào tài khoản mới.' },
    });
    return { ...result, onConfirm, onCancel };
  };

  it('is hidden while closed', () => {
    renderSheet(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a named modal dialog, focuses the safe choice and returns focus on close', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender } = renderSheet(false);
    await rerender({ open: true });
    await nextTick();
    const dialog = screen.getByRole('dialog', { name: 'Đổi tài khoản?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Tiền sẽ vào tài khoản mới.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Xem lại' }));
    await rerender({ open: false });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('confirms, cancels with the button, Escape or the backdrop', async () => {
    const { onConfirm, onCancel } = renderSheet(true);
    await userEvent.click(screen.getByRole('button', { name: 'Đồng ý' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Xem lại' }));
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await userEvent.click(document.querySelector('.confirm-sheet__backdrop') as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('keeps Tab inside the sheet', async () => {
    renderSheet(true);
    await nextTick();
    const cancel = screen.getByRole('button', { name: 'Xem lại' });
    const confirm = screen.getByRole('button', { name: 'Đồng ý' });
    confirm.focus();
    await fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    await fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    await fireEvent.keyDown(confirm, { key: 'Enter' });
    expect(document.activeElement).toBe(confirm);
  });

  it('starts in the field when the sheet asks for something, and Tab reaches it', async () => {
    const { rerender } = render(ConfirmSheet, {
      props: { open: false, title: 'Xác nhận', confirmLabel: 'Đồng ý', cancelLabel: 'Xem lại' },
      slots: { default: '<label>Mật khẩu <input type="password" /></label>' },
    });
    await rerender({ open: true });
    await nextTick();
    const field = screen.getByLabelText('Mật khẩu');
    expect(document.activeElement).toBe(field);
    const confirm = screen.getByRole('button', { name: 'Đồng ý' });
    confirm.focus();
    await fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(field);
  });

  it('cannot be dismissed while busy', async () => {
    const { onCancel } = renderSheet(true, true);
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('SelectField, LoadingState, ErrorState', () => {
  it('a select has a label, an error and reports the choice', async () => {
    const value = ref('');
    render(SelectField, {
      props: {
        label: 'Ngân hàng',
        options: [
          { value: '', label: 'Chưa chọn' },
          { value: '970436', label: 'Vietcombank' },
        ],
        error: 'Chọn ngân hàng',
        hint: 'Gợi ý',
        modelValue: value.value,
        'onUpdate:modelValue': (v: string) => (value.value = v),
      },
    });
    const select = screen.getByLabelText('Ngân hàng');
    expect(select.getAttribute('aria-invalid')).toBe('true');
    await userEvent.selectOptions(select, '970436');
    expect(value.value).toBe('970436');
  });

  it('loading announces itself and draws skeleton rows', () => {
    render(LoadingState, { props: { label: 'Đang tải', rows: 2 } });
    expect(screen.getByRole('status').textContent).toContain('Đang tải');
    expect(document.querySelectorAll('.loading-state__row')).toHaveLength(2);
  });

  it('an error offers a retry only when given a label', async () => {
    const onRetry = vi.fn<() => void>();
    const { unmount } = render(ErrorState, {
      props: { message: 'Không tải được', retryLabel: 'Thử lại', onRetry },
    });
    expect(screen.getByRole('alert').textContent).toContain('Không tải được');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalled();
    unmount();
    render(ErrorState, { props: { message: 'Không có quyền' } });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
