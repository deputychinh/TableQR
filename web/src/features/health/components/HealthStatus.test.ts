import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import HealthStatus from './HealthStatus.vue';
import { i18n } from '@/locales';
import { vi as messages } from '@/locales/vi';

const okFetch = (() =>
  Promise.resolve(new Response(JSON.stringify({ status: 'ok', db: 'up' })))) as typeof fetch;
const failingFetch = (() => Promise.reject(new TypeError('offline'))) as typeof fetch;
const serverErrorFetch = (() =>
  Promise.resolve(new Response('{}', { status: 503 }))) as typeof fetch;

const renderWith = (fetchImpl: typeof fetch) =>
  render(HealthStatus, { props: { fetchImpl }, global: { plugins: [i18n] } });

describe('HealthStatus', () => {
  it('shows loading first, then the ok message when the API is up', async () => {
    renderWith(okFetch);
    expect(screen.getByText(messages.health.loading)).toBeTruthy();
    expect(await screen.findByText(messages.health.ok)).toBeTruthy();
  });

  it('shows an alert and a retry button when the API is unreachable', async () => {
    renderWith(failingFetch);
    expect((await screen.findByRole('alert')).textContent).toContain(messages.health.error);
    expect(screen.getByRole('button', { name: messages.health.retry })).toBeTruthy();
  });

  it('retries and recovers after a server error', async () => {
    let calls = 0;
    const flaky = ((...args: Parameters<typeof fetch>) => {
      calls += 1;
      return calls === 1 ? serverErrorFetch(...args) : okFetch(...args);
    }) as typeof fetch;
    renderWith(flaky);
    await userEvent.click(await screen.findByRole('button', { name: messages.health.retry }));
    expect(await screen.findByText(messages.health.ok)).toBeTruthy();
  });
});
