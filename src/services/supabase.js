import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jswxifehbnvdhjkahden.supabase.co';
const supabaseAnonKey = 'sb_publishable_G3bzWItUL3zmN75kUNNSVg_Xmav7_jJ';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});

export default supabase;