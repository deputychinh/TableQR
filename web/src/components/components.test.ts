import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { ref } from 'vue';
import BaseButton from './BaseButton.vue';
import FormField from './FormField.vue';
import FormAlert from './FormAlert.vue';
import BrandMark from './BrandMark.vue';
import { i18n } from '@/locales';

describe('BaseButton', () => {
  it('renders a primary button with its label', () => {
    render(BaseButton, { slots: { default: 'Lưu' } });
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button.className).toContain('base-button--primary');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('is disabled and busy while loading', () => {
    render(BaseButton, { props: { loading: true, type: 'submit' }, slots: { default: 'Gửi' } });
    const button = screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('FormField', () => {
  const renderField = (props: Record<string, unknown>) => {
    const value = ref('');
    return render(FormField, {
      props: {
        label: 'Email',
        modelValue: value.value,
        'onUpdate:modelValue': (v: string) => (value.value = v),
        ...props,
      },
      global: { plugins: [i18n] },
    });
  };

  it('links the label, hint and error to the input', () => {
    renderField({ hint: 'Gợi ý', error: 'Sai rồi' });
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toHaveLength(2);
    expect(document.getElementById(describedBy.split(' ')[1] ?? '')?.textContent).toBe('Sai rồi');
  });

  it('has no aria-invalid and no description when there is no hint or error', () => {
    renderField({});
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('lets a password be shown and hidden with a named toggle', async () => {
    renderField({ type: 'password' });
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('type')).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input.getAttribute('type')).toBe('text');
    await userEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(input.getAttribute('type')).toBe('password');
  });

  it('emits typed text', async () => {
    const updates: string[] = [];
    render(FormField, {
      props: {
        label: 'Tên',
        modelValue: '',
        'onUpdate:modelValue': (v: string) => updates.push(v),
      },
      global: { plugins: [i18n] },
    });
    await userEvent.type(screen.getByLabelText('Tên'), 'a');
    expect(updates).toEqual(['a']);
  });
});

describe('FormAlert and BrandMark', () => {
  it('announces a form error as an alert', () => {
    render(FormAlert, { props: { message: 'Có lỗi' } });
    expect(screen.getByRole('alert').textContent).toContain('Có lỗi');
  });

  it('shows the product name', () => {
    render(BrandMark);
    expect(screen.getByText('TableQR')).toBeTruthy();
  });
});
