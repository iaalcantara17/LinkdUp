import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

export const supabaseAdmin: SupabaseClient = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
        auth: { autoRefreshToken: false, persistSession: false },
    }
);

export function supabaseSignIn(email: string, password: string) {
    return createClient(config.supabase.url, config.supabase.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    }).auth.signInWithPassword({ email, password });
}

export function supabaseAsUser(accessToken: string): SupabaseClient {
    return createClient(config.supabase.url, config.supabase.anonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
