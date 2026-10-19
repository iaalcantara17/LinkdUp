import { supabaseAdmin } from '../db';
import { HttpError } from '../middleware/error';

export type FollowFlags = { i_follow: boolean; follows_me: boolean };

function fail(error: { message: string } | null) {
    if (error) throw new HttpError(500, 'follows_query_failed', error.message);
}

export async function followingIds(userId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin.from('user_follows').select('followed_id').eq('follower_id', userId);
    fail(error);
    return (data ?? []).map((r: any) => r.followed_id);
}

export async function friendIds(userId: string): Promise<Set<string>> {
    const following = await followingIds(userId);
    if (following.length === 0) return new Set();
    const { data, error } = await supabaseAdmin
        .from('user_follows')
        .select('follower_id')
        .eq('followed_id', userId)
        .in('follower_id', following);
    fail(error);
    return new Set((data ?? []).map((r: any) => r.follower_id));
}

export async function followFlags(me: string, ids: string[]): Promise<(id: string) => FollowFlags> {
    if (ids.length === 0) return () => ({ i_follow: false, follows_me: false });
    const [mine, theirs] = await Promise.all([
        supabaseAdmin.from('user_follows').select('followed_id').eq('follower_id', me).in('followed_id', ids),
        supabaseAdmin.from('user_follows').select('follower_id').eq('followed_id', me).in('follower_id', ids),
    ]);
    fail(mine.error);
    fail(theirs.error);
    const iFollow = new Set((mine.data ?? []).map((r: any) => r.followed_id));
    const followsMe = new Set((theirs.data ?? []).map((r: any) => r.follower_id));
    return (id) => ({ i_follow: iFollow.has(id), follows_me: followsMe.has(id) });
}

export async function isEitherBlocked(a: string, b: string): Promise<boolean> {
    const { data } = await supabaseAdmin
        .from('user_blocks')
        .select('blocker_id')
        .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
        .limit(1);
    return (data ?? []).length > 0;
}

export async function follow(me: string, target: string): Promise<void> {
    if (me === target) throw new HttpError(400, 'cannot_follow_self');
    if (await isEitherBlocked(me, target)) throw new HttpError(403, 'blocked');
    const { error } = await supabaseAdmin
        .from('user_follows')
        .upsert({ follower_id: me, followed_id: target }, { onConflict: 'follower_id,followed_id' });
    if (error) throw new HttpError(500, 'follow_failed', error.message);
}

export async function unfollow(me: string, target: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('user_follows')
        .delete()
        .eq('follower_id', me)
        .eq('followed_id', target);
    if (error) throw new HttpError(500, 'unfollow_failed', error.message);
}
