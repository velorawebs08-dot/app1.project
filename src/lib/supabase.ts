import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://nvgwgatymwhrobagabnv.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'PASTE_ANON_KEY_HERE';

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey
);
