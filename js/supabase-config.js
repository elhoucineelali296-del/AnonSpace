const SUPABASE_URL = "https://nqzeenelxuhkaqztujbo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KzW8JIQmqkb2wp53vssS2A_vHtNftG1";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.db = db;