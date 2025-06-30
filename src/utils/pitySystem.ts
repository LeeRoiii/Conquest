import { supabase } from '../supabaseClient';

const TARGET_TIER = 1;
const REWARD_TIER = 9;
const STREAK_REQUIRED = 9;

/**
 * Called every roll to update the user's streak and pity status.
 */
export async function updatePityStreak(discordId: string, rolledTier: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: user, error } = await supabase
    .from('users')
    .select('pity_streak, last_roll_date')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (error || !user) {
    console.error('❌ Failed to fetch user for pity streak update:', error);
    return;
  }

  const lastDate = user.last_roll_date;
  let streak = 0;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (rolledTier === TARGET_TIER) {
    if (lastDate === yesterdayStr) {
      streak = (user.pity_streak ?? 0) + 1;
    } else {
      streak = 1;
    }
  } else {
    streak = 0;
  }

  const updates: any = {
    pity_streak: streak,
    last_roll_date: today,
  };

  if (streak >= STREAK_REQUIRED) {
    updates.pity_qualified = true;
  }

  await supabase
    .from('users')
    .update(updates)
    .eq('discord_id', discordId);
}

/**
 * Picks a tier based on odds (no env used).
 */
function pickTier(): number {
  const TIER_ODDS = [0.4, 0.2, 0.12, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02];
  const roll = Math.random();
  let cumulative = 0;
  for (let i = 0; i < TIER_ODDS.length; i++) {
    cumulative += TIER_ODDS[i];
    if (roll <= cumulative) return i + 1;
  }
  return REWARD_TIER;
}

/**
 * Main tier resolver — uses pity_qualified if set, else rolls normally.
 */
export async function getFinalTier(discordId: string): Promise<{ tier: number; isPity: boolean }> {
  const { data: user, error } = await supabase
    .from('users')
    .select('pity_qualified, last_pity_awarded_at')
    .eq('discord_id', discordId)
    .maybeSingle();

  let isPity = false;
  const today = new Date().toISOString().slice(0, 10);

  if (user?.pity_qualified) {
    const lastAwarded = user.last_pity_awarded_at?.slice(0, 10);
    if (lastAwarded !== today) {
      isPity = true;

      // Clear pity state
      await supabase.from('users')
        .update({
          pity_qualified: false,
          pity_streak: 0,
          last_pity_awarded_at: new Date().toISOString(),
        })
        .eq('discord_id', discordId);
    }
  }

  const tier = isPity ? REWARD_TIER : pickTier();
  return { tier, isPity };
}
