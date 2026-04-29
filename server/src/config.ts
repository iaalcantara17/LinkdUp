import 'dotenv/config';

function required(name: string): string {
    const v = process.env[name];
    if (!v || v === 'replace-me' || v.startsWith('replace-me')) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return v;
}

function optional(name: string, fallback = ''): string {
    return process.env[name] ?? fallback;
}

export const config = {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: optional('NODE_ENV', 'development'),
    corsOrigins: optional('CORS_ORIGIN', '*')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),

    supabase: {
        url: required('SUPABASE_URL'),
        anonKey: required('SUPABASE_ANON_KEY'),
        serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    },

    google: {
        mapsApiKey: required('GOOGLE_MAPS_API_KEY'),
        oauthClientId: required('GOOGLE_OAUTH_CLIENT_ID'),
        oauthClientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
        oauthRedirectUri: required('GOOGLE_OAUTH_REDIRECT_URI'),
    },

};
