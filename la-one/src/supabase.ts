import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://jtkuhrytrikgkqephjah.supabase.co',
  'sb_publishable_QoWJI1f7iAEH4ZWl0nX6qA_qHGe5dit',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
