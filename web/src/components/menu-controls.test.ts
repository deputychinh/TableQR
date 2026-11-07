import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import NumberField from './NumberField.vue';
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

describe('StatusChip', () => {
  it('StatusChip shows its word with the tone class', () => {
    render(StatusChip, { props: { label: 'Hết món', tone: 'warning' } });
    expect(screen.getByText('Hết món').className).toContain('status-chip--warning');
  });
});

describe('form fields', () => {
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
