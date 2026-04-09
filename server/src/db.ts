import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

// Admin client - bypasses RLS. Server-side ONLY.
export const supabaseAdmin: SupabaseClient = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
        auth: { autoRefreshToken: false, persistSession: false },
    }
);

// User-scoped client factory - for verifying user JWTs from the mobile app
export function supabaseAsUser(accessToken: string): SupabaseClient {
    return createClient(config.supabase.url, config.supabase.anonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
