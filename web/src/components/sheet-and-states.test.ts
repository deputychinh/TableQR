import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { ref } from 'vue';
import BaseSheet from './BaseSheet.vue';
import ConfirmSheet from './ConfirmSheet.vue';
import EmptyState from './EmptyState.vue';
import ErrorState from './ErrorState.vue';
import LoadingState from './LoadingState.vue';
import NumberField from './NumberField.vue';
import SelectField from './SelectField.vue';
import StatusChip from './StatusChip.vue';
import TextAreaField from './TextAreaField.vue';
import ToggleSwitch from './ToggleSwitch.vue';

describe('ToggleSwitch', () => {
  it('is a named switch that reports its state and flips on click', async () => {
    const updates: boolean[] = [];
    render(ToggleSwitch, {
      props: {
        label: 'Còn món: Phở',
        stateText: 'Còn món',
        modelValue: true,
        'onUpdate:modelValue': (v: boolean) => updates.push(v),
      },
    });
    const toggle = screen.getByRole('switch', { name: 'Còn món: Phở' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(toggle);
    expect(updates).toEqual([false]);
  });

  it('does nothing when disabled', async () => {
    const updates: boolean[] = [];
    render(ToggleSwitch, {
      props: {
        label: 'X',
        modelValue: false,
        disabled: true,
        'onUpdate:modelValue': (v: boolean) => updates.push(v),
      },
    });
    await userEvent.click(screen.getByRole('switch', { name: 'X' }));
    expect(updates).toEqual([]);
  });
});

describe('state components', () => {
  it('StatusChip shows its word with the tone class', () => {
    render(StatusChip, { props: { label: 'Hết món', tone: 'warning' } });
    expect(screen.getByText('Hết món').className).toContain('status-chip--warning');
  });

  it('EmptyState says why and offers the next action', () => {
    render(EmptyState, {
      props: { title: 'Chưa có món nào', body: 'Thêm món đầu tiên' },
      slots: { action: '<button>Thêm</button>' },
    });
    expect(screen.getByText('Chưa có món nào')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeTruthy();
  });

  it('ErrorState announces the problem and retries', async () => {
    const onRetry = vi.fn<() => void>();
    render(ErrorState, { props: { message: 'Không tải được', retryLabel: 'Thử lại', onRetry } });
    expect(screen.getByRole('alert').textContent).toContain('Không tải được');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('LoadingState is a labelled status with skeleton rows', () => {
    const { container } = render(LoadingState, { props: { label: 'Đang tải', rows: 2 } });
    expect(screen.getByRole('status', { name: 'Đang tải' })).toBeTruthy();
    expect(container.querySelectorAll('.loading-state__row')).toHaveLength(2);
  });
});

describe('BaseSheet and ConfirmSheet', () => {
  it('opens as a labelled dialog, focuses the first field and closes on the close button or Escape', async () => {
    const onClose = vi.fn<() => void>();
    render(BaseSheet, {
      props: { title: 'Thêm món', closeLabel: 'Đóng', onClose },
      slots: { default: '<input aria-label="Tên" />' },
    });
    const dialog = screen.getByRole('dialog', { name: 'Thêm món' });
    expect(dialog.hasAttribute('open')).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Tên')));
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ConfirmSheet spells out the consequence, shows an error and emits the choice', async () => {
    const onConfirm = vi.fn<() => void>();
    const onCancel = vi.fn<() => void>();
    render(ConfirmSheet, {
      props: {
        title: 'Xoá món?',
        message: 'Khách sẽ không thấy món này nữa.',
        confirmLabel: 'Xoá',
        cancelLabel: 'Huỷ',
        danger: true,
        error: 'Còn món',
        onConfirm,
        onCancel,
      },
    });
    expect(screen.getByText('Khách sẽ không thấy món này nữa.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Còn món');
    const confirm = screen.getByRole('button', { name: 'Xoá' });
    expect(confirm.className).toContain('base-button--danger');
    await userEvent.click(confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('form fields', () => {
  it('SelectField links its label and error and emits the chosen value', async () => {
    const value = ref('a');
    render(SelectField, {
      props: {
        label: 'Nhóm món',
        options: [
          { value: 'a', label: 'Món chính' },
          { value: 'b', label: 'Đồ uống' },
        ],
        error: 'Hãy chọn',
        hint: 'Gợi ý',
        modelValue: value.value,
        'onUpdate:modelValue': (v: string) => (value.value = v),
      },
    });
    const select = screen.getByLabelText('Nhóm món');
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
    await userEvent.selectOptions(select, 'b');
    expect(value.value).toBe('b');
  });

  it('TextAreaField limits length and emits typed text', async () => {
    const updates: string[] = [];
    render(TextAreaField, {
      props: {
        label: 'Mô tả',
        maxlength: 200,
        modelValue: '',
        'onUpdate:modelValue': (v: string) => updates.push(v),
      },
    });
    const area = screen.getByLabelText('Mô tả');
    expect(area.getAttribute('maxlength')).toBe('200');
    expect(area.getAttribute('aria-describedby')).toBeNull();
    await userEvent.type(area, 'a');
    expect(updates).toEqual(['a']);
  });

  it('NumberField opens the numeric keypad, shows its unit and error', () => {
    render(NumberField, {
      props: { label: 'Giá bán', unit: '₫', error: 'Sai', modelValue: '35.000' },
    });
    const input = screen.getByLabelText('Giá bán');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('₫')).toBeTruthy();
  });
});
