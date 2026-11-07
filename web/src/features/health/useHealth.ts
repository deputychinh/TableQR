import { ref } from 'vue';
import { getJson } from '@/api/client';

export type HealthState = 'loading' | 'ok' | 'error';

export interface HealthResponse {
  status: 'ok';
  db: 'up';
}

export const useHealth = (fetchImpl: typeof fetch = fetch) => {
  const state = ref<HealthState>('loading');

  const check = async (): Promise<void> => {
    state.value = 'loading';
    try {
      const body = await getJson<HealthResponse>('/health', fetchImpl);
      state.value = body.status === 'ok' && body.db === 'up' ? 'ok' : 'error';
    } catch {
      state.value = 'error';
    }
  };

  return { state, check };
};
