import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://nvgwgatymwhrobagabnv.supabase.co'.trim();
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52Z3dnYXR5bXdocm9iYWdhYm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNjk3MDgsImV4cCI6MjExMDY0NTcwOH0.0iuJIM_uGxb90ZmzFyZqIG74zDvZw_TfAmhEZByqzgU'.trim();

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
