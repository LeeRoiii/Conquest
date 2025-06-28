import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
} from 'discord.js';
import { supabase } from '../supabaseClient';

const TIER_ODDS = [0.4, 0.2, 0.12, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02];
const PITY_THRESHOLD = 6;

const TIER_DETAILS = [
  { name: 'Tier 1', color: 'Grey', emoji: '🥉', gif: 'https://media.tenor.com/BzRS7UIlpAcAAAAC/ouch-fail.gif', flavor: 'Better luck next time!' },
  { name: 'Tier 2', color: 'Grey', emoji: '🥉', gif: 'https://media.tenor.com/3zC1Gp-tPM8AAAAC/small-prize.gif', flavor: 'A small win is still a win!' },
  { name: 'Tier 3', color: 'Green', emoji: '🪙', gif: 'https://media.tenor.com/4sX3GhAEm0sAAAAC/coin-money.gif', flavor: 'Not bad at all!' },
  { name: 'Tier 4', color: 'Green', emoji: '🪙', gif: 'https://media.tenor.com/AvEJjZb5dhUAAAAC/coins-drop.gif', flavor: 'You’re getting somewhere!' },
  { name: 'Tier 5', color: 'Blue', emoji: '💎', gif: 'https://media.tenor.com/ZxmhMiGh-ncAAAAC/diamond-money.gif', flavor: 'Shiny things ahead!' },
  { name: 'Tier 6', color: 'Purple', emoji: '✨', gif: 'https://media.tenor.com/fPgNn5SGNWwAAAAC/epic-win.gif', flavor: 'Epic pull!' },
  { name: 'Tier 7', color: 'Purple', emoji: '✨', gif: 'https://media.tenor.com/06Owa9F2ETsAAAAC/jackpot.gif', flavor: 'It’s heating up!' },
  { name: 'Tier 8', color: 'Gold', emoji: '🏆', gif: 'https://media.tenor.com/ES3uI0tW3FYAAAAC/legendary.gif', flavor: 'Legendary prize incoming!' },
  { name: 'Tier 9', color: 'Red', emoji: '🔥', gif: 'https://media.tenor.com/HxXrbqL3KroAAAAC/you-win-perfect.gif', flavor: '🔥 JACKPOT! You hit the top tier!' },
];

function pickTier(): number {
  const roll = Math.random();
  let cumulative = 0;
  for (let i = 0; i < TIER_ODDS.length; i++) {
    cumulative += TIER_ODDS[i];
    if (roll <= cumulative) return i + 1;
  }
  return 9;
}

export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Spin the prize wheel and test your luck!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;
  const today = new Date().toISOString().slice(0, 10);  

  const { data: config, error: configError } = await supabase
    .from('giveaway_channels')
    .select('channel_id')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (configError || !config || config.channel_id !== channelId) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('🚫 Command Restricted')
          .setDescription(`This command can only be used in <#${config?.channel_id || 'not_set'}>.`),
      ],
    });
  }

  const member = interaction.member as GuildMember;
  const requiredRoleId = process.env.LEVEL_2_ROLE_ID!;
  if (!member.roles.cache.has(requiredRoleId)) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('❌ Permission Denied')
          .setDescription('You need the **Level 2+** role to use this command.'),
      ],
    });
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('wallet')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (userError || !user?.wallet) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('❌ No Wallet Found')
          .setDescription('Please bind your Solana wallet using `/wallet` before rolling.'),
      ],
    });
  }

  const { data: rollsToday, error: rollsError } = await supabase
    .from('rolls')
    .select('*')
    .eq('discord_id', discordId)
    .eq('roll_date', today);

  if (rollsError) {
    console.error('❌ Error checking rolls:', rollsError);
    return interaction.editReply({ content: 'Something went wrong. Please try again later.' });
  }

  const naturalRoll = rollsToday.find(r => !r.manual);
  const manualUnused = rollsToday.find(r => r.manual && r.tier_won === null);

  if (naturalRoll && !manualUnused) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Orange')
          .setTitle('⛔ Daily Limit Reached')
          .setDescription('You can only roll **once per day**.\nCome back tomorrow for another chance!')
          .setImage('https://media.tenor.com/4Vf_LUckhF8AAAAC/clock-waiting.gif')
          .setFooter({ text: '⏳ Reset happens at midnight!' }),
      ],
    });
  }

  const { data: recentRolls } = await supabase
    .from('rolls')
    .select('tier_won')
    .eq('discord_id', discordId)
    .order('roll_date', { ascending: false })
    .limit(PITY_THRESHOLD);

  const isPity = recentRolls?.every(r => r.tier_won !== 9);
  const tier = isPity ? 9 : pickTier();
  const tierData = TIER_DETAILS[tier - 1];

  if (manualUnused) {
    const { error: updateError } = await supabase
      .from('rolls')
      .update({ tier_won: tier, is_pity: isPity })
      .eq('id', manualUnused.id);

    if (updateError) {
      console.error('❌ Failed to update manual roll:', updateError);
      return interaction.editReply({ content: 'Failed to record your roll. Try again later.' });
    }
  } else {
    const { error: insertError } = await supabase.from('rolls').insert({
      discord_id: discordId,
      roll_date: today,
      tier_won: tier,
      is_pity: isPity,
      manual: false,
    });

    if (insertError) {
      console.error('❌ Failed to insert roll:', insertError);
      return interaction.editReply({ content: 'Failed to record your roll. Try again later.' });
    }
  }

  // ⏳ Simulate suspense (2s delay)
  await new Promise(res => setTimeout(res, 2000));

  const embed = new EmbedBuilder()
    .setColor(tierData.color as any)
    .setTitle(`${tierData.emoji} ${tierData.name} Reward!`)
    .setDescription(`**${tierData.flavor}**\n\n${isPity ? '🎁 You triggered the **Pity Bonus**!' : '✨ Good luck on the next one!'}`)
    .setImage(tierData.gif)
    .setFooter({ text: '✅ Wallet verified — you’re eligible to win!' })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
