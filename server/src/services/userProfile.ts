import { HttpError } from '../middleware/error';

export const SELF_PROFILE_FIELDS = [
    'id', 'email', 'display_name', 'username', 'school_id', 'graduation_year', 'avatar_color', 'avatar_url',
    'latitude', 'longitude', 'last_location_at', 'pronouns', 'birthday', 'bio', 'theme_preference',
    'has_seen_walkthrough', 'location_permission_status',
] as const;

export const SELF_PROFILE_SELECT = SELF_PROFILE_FIELDS.join(', ');

const MISSING_COLUMN_CODES = ['42703', 'PGRST204'];

export function profileDbError(error: { code?: string; message: string }, fallback: HttpError) {
    return MISSING_COLUMN_CODES.includes(error.code ?? '')
        ? new HttpError(503, 'profile_schema_mismatch', error.message)
        : fallback;
}

export function computeAge(birthday: string | null | undefined): number | null {
    if (!birthday) return null;
    const bday = new Date(birthday);
    if (isNaN(bday.getTime())) return null;
    const now = new Date();
    const beforeBirthday =
        now.getUTCMonth() < bday.getUTCMonth() ||
        (now.getUTCMonth() === bday.getUTCMonth() && now.getUTCDate() < bday.getUTCDate());
    const age = now.getUTCFullYear() - bday.getUTCFullYear() - (beforeBirthday ? 1 : 0);
    return age >= 0 ? age : null;
}

export function toSelfProfile(row: Record<string, any>) {
    const profile: Record<string, unknown> = {};
    for (const field of SELF_PROFILE_FIELDS) profile[field] = row[field] ?? null;
    return { ...profile, age: computeAge(row.birthday) };
}
