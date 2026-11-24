import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('your-project.supabase.co')
);

const CONFIG_ERROR = {
  message:
    'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  code: 'SUPABASE_NOT_CONFIGURED',
  details: '',
  hint: '',
};

function createUnconfiguredClient(): SupabaseClient {
  const errorResult = async () => ({ data: null, error: CONFIG_ERROR });

  const queryProxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (val: unknown) => void) =>
            resolve({ data: null, error: CONFIG_ERROR });
        }
        return () => queryProxy;
      },
    }
  );

  return {
    rpc: errorResult,
    from: () => queryProxy,
    functions: {
      invoke: errorResult,
    },
    storage: {
      from: () => ({
        upload: errorResult,
        download: errorResult,
        remove: errorResult,
        createSignedUrl: errorResult,
      }),
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: CONFIG_ERROR }),
      signInWithOtp: errorResult,
      verifyOtp: errorResult,
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : createUnconfiguredClient();
