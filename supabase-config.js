const SUPABASE_URL = "https://fllsbalijfyoniqnqlnj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_l2mLtoNwPgKer42idC0ZpQ_8eFdBfaO";
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
window.supabaseClient = supabaseClient;
