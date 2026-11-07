import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiError, getJson, sendJson } from '@/api/client';

export type StaffRole = 'owner' | 'cashier' | 'waiter' | 'kitchen' | 'platform_admin';

export interface Me {
  user: { id: string; email: string; role: StaffRole; displayName: string };
  restaurant: { id: string; name: string; slug: string } | null;
}

/** The signed-in staff member; `undefined` = not checked yet, `null` = signed out. */
export const useSessionStore = defineStore('session', () => {
  const me = ref<Me | null | undefined>(undefined);

  const load = async (): Promise<Me | null> => {
    try {
      me.value = await getJson<Me>('/me');
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) me.value = null;
      else throw error;
    }
    return me.value;
  };

  const signUp = async (input: { restaurantName: string; email: string; password: string }) => {
    me.value = await sendJson<Me>('POST', '/auth/signup', input);
  };

  const signIn = async (input: { email: string; password: string }): Promise<Me> => {
    const signedIn = await sendJson<Me>('POST', '/auth/login', input);
    me.value = signedIn;
    return signedIn;
  };

  const signOut = async () => {
    await sendJson<void>('POST', '/auth/logout');
    me.value = null;
  };

  return { me, load, signUp, signIn, signOut };
});
