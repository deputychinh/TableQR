import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createPinia, setActivePinia } from 'pinia';
import { Pencil } from 'lucide-vue-next';
import { i18n } from '@/locales';
import { TOAST_MS, TOAST_QUEUED_MS, useToastStore } from '@/stores/toast';
import IconButton from './IconButton.vue';
import ToastRegion from './ToastRegion.vue';

describe('toast queue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('shows one message at a time, in order, and hides it after a while', () => {
    const toasts = useToastStore();
    toasts.show('Một');
    expect(toasts.current?.message).toBe('Một');
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts.current).toBeUndefined();
  });

  it('shortens the current message when another waits, so a burst never lags', () => {
    const toasts = useToastStore();
    toasts.show('Một');
    toasts.show('Hai', 'error');
    toasts.show('Ba');
    vi.advanceTimersByTime(TOAST_QUEUED_MS);
    expect(toasts.current).toMatchObject({ message: 'Hai', tone: 'error' });
    vi.advanceTimersByTime(TOAST_QUEUED_MS);
    expect(toasts.current?.message).toBe('Ba');
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts.current).toBeUndefined();
  });

  it('closes on demand and moves to the next message', () => {
    const toasts = useToastStore();
    toasts.show('Một');
    toasts.show('Hai');
    toasts.dismiss();
    expect(toasts.current?.message).toBe('Hai');
  });
});

describe('ToastRegion', () => {
  it('is a polite status region that shows the current message with a close button', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    render(ToastRegion, { global: { plugins: [i18n, pinia] } });
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent.trim()).toBe('');
    useToastStore().show('Đã lưu cài đặt.');
    expect(await screen.findByText('Đã lưu cài đặt.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByText('Đã lưu cài đặt.')).toBeNull();
  });
});

describe('IconButton', () => {
  it('names the action, never relying on the icon alone, and can be disabled', async () => {
    const onClick = vi.fn<() => void>();
    const { rerender } = render(IconButton, {
      props: { icon: Pencil, label: 'Sửa Bàn 1', onClick },
    });
    const button = screen.getByRole('button', { name: 'Sửa Bàn 1' });
    expect(button.getAttribute('title')).toBe('Sửa Bàn 1');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    await rerender({ icon: Pencil, label: 'Sửa Bàn 1', onClick, disabled: true });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
