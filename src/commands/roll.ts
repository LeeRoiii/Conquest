import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { supabase } from '../supabaseClient';
import { getFinalTier, updatePityStreak } from '../utils/pitySystem';

const TIER_DETAILS = [
  { name: 'Tier 1', color: 'Grey', emoji: '🥉', gif: 'https://media1.tenor.com/m/6Q6RzWExaNUAAAAC/gold-one-piece.gif', flavor: 'Better luck next time!' },
  { name: 'Tier 2', color: 'Grey', emoji: '🥉', gif: 'https://media.tenor.com/3zC1Gp-tPM8AAAAC/small-prize.gif', flavor: 'A small win is still a win!' },
  { name: 'Tier 3', color: 'Green', emoji: '🪙', gif: 'https://media.tenor.com/4sX3GhAEm0sAAAAC/coin-money.gif', flavor: 'Not bad at all!' },
  { name: 'Tier 4', color: 'Green', emoji: '🪙', gif: 'https://media.tenor.com/AvEJjZb5dhUAAAAC/coins-drop.gif', flavor: 'You’re getting somewhere!' },
  { name: 'Tier 5', color: 'Blue', emoji: '💎', gif: 'https://media.tenor.com/ZxmhMiGh-ncAAAAC/diamond-money.gif', flavor: 'Shiny things ahead!' },
  { name: 'Tier 6', color: 'Purple', emoji: '✨', gif: 'https://media.tenor.com/fPgNn5SGNWwAAAAC/epic-win.gif', flavor: 'Epic pull!' },
  { name: 'Tier 7', color: 'Purple', emoji: '✨', gif: 'https://media.tenor.com/06Owa9F2ETsAAAAC/jackpot.gif', flavor: 'It’s heating up!' },
  { name: 'Tier 8', color: 'Gold', emoji: '🏆', gif: 'https://media.tenor.com/ES3uI0tW3FYAAAAC/legendary.gif', flavor: 'Legendary prize incoming!' },
  { name: 'Tier 9', color: 'Red', emoji: '🔥', gif: 'https://media.tenor.com/HxXrbqL3KroAAAAC/you-win-perfect.gif', flavor: '🔥 JACKPOT! You hit the top tier!' },
];

export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Spin the prize wheel and test your luck!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;
  const now = new Date();

  // 🛡️ Try to insert a lock to prevent "unli roll"
  const { error: lockError } = await supabase
    .from('roll_locks')
    .insert({ discord_id: discordId });

  if (lockError) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('⚠️ Slow Down')
          .setDescription('You already have an active roll in progress. Please wait a few seconds and try again.'),
      ],
    });
  }

  try {
    // ✅ Giveaway channel check
    const { data: config } = await supabase
      .from('giveaway_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .maybeSingle();

    if (!config || config.channel_id !== channelId) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setTitle('🚫 Command Restricted')
            .setDescription(`This command can only be used in <#${config?.channel_id || 'not_set'}>.`),
        ],
      });
    }

    // ✅ Wallet check
    const { data: user } = await supabase
      .from('users')
      .select('wallet')
      .eq('discord_id', discordId)
      .maybeSingle();

    if (!user?.wallet) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ No Wallet Found')
            .setDescription(
              `To use the prize wheel, you need to **bind your Solana wallet** first.\n\n` +
              `📌 Use the \`/wallet\` command and choose **Bind Wallet** to connect your wallet.\n` +
              `⚠️ Make sure you're eligible (e.g. have the required Level 2+ role).\n\n` +
              `Once your wallet is linked, come back and roll for a chance to win rewards! 🎁`
            )
            .setFooter({ text: 'Wallet binding is required for prize tracking.' })
            .setThumbnail(interaction.guild?.iconURL() ?? ''),
        ],
      });
    }

    // ✅ Check bonus/event/marketplace rolls first
    const { data: availableRolls } = await supabase
      .from('rolls')
      .select('id, source')
      .eq('discord_id', discordId)
      .in('source', ['bonus', 'event', 'marketplace'])
      .is('tier_won', null);

    const usableRoll = availableRolls?.[0];

    // ❌ No extra roll? Check daily cooldown
    if (!usableRoll) {
      const { data: lastRoll } = await supabase
        .from('rolls')
        .select('rolled_at')
        .eq('discord_id', discordId)
        .eq('source', 'daily')
        .order('rolled_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastRoll?.rolled_at) {
        const lastTime = new Date(lastRoll.rolled_at);
        const nextAvailable = new Date(lastTime.getTime() + 24 * 60 * 60 * 1000);

        if (now < nextAvailable) {
          const msLeft = nextAvailable.getTime() - now.getTime();
          const hours = Math.floor(msLeft / 3600000);
          const minutes = Math.floor((msLeft % 3600000) / 60000);

          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('Orange')
                .setTitle('🔒 No Rolls Left Yet')
                .setDescription(
                  `You already used your **daily roll**!\n\n` +
                  `⏳ Next roll in **${hours}h ${minutes}m**\n\n` +
                  `💡 *Want more rolls?* Earn them through **events**, **marketplace**.`
                ),
            ],
          });
        }
      }
    }

    // 🎲 Perform roll
    const { tier, isPity } = await getFinalTier(discordId);
    const tierData = TIER_DETAILS[tier - 1];
    const source = usableRoll ? usableRoll.source : 'daily';

    // ✅ Save roll
    let insertedRollId: string | null = null;
    if (usableRoll) {
      await supabase
        .from('rolls')
        .update({ tier_won: tier, is_pity: isPity, rolled_at: now })
        .eq('id', usableRoll.id);
      insertedRollId = usableRoll.id;
    } else {
      const { data: insertedRoll } = await supabase
        .from('rolls')
        .insert({
          discord_id: discordId,
          tier_won: tier,
          is_pity: isPity,
          source,
          rolled_at: now,
        })
        .select()
        .single();
      insertedRollId = insertedRoll?.id;
    }

    await updatePityStreak(discordId, tier);

    if (tier >= 1 && tier <= 9 && insertedRollId) {
      await supabase.from('prizes').insert({
        discord_id: discordId,
        username: interaction.user.tag,
        wallet: user.wallet,
        tier,
        tier_label: `Tier ${tier}`,
        roll_id: insertedRollId,
        won_at: now,
      });
    }

    // 🌀 Animation
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Blue')
          .setTitle('🎲 Rolling...')
          .setDescription('Spinning the prize wheel...')
          .setImage('https://media.tenor.com/6BWKxLc307kAAAAm/gift-box.webp'),
      ],
    });

    await new Promise(res => setTimeout(res, 2000));

    // 🎉 Final result
    const finalEmbed = new EmbedBuilder()
      .setColor(tierData.color as any)
      .setTitle(`${tierData.emoji} ${tierData.name} Reward!`)
      .setDescription(
        `**${tierData.flavor}**\n\n${isPity ? '🎁 You triggered the **Pity Bonus**!' : '✨ Good luck on the next one!'}`
      )
      .setImage(tierData.gif)
      .setTimestamp();

    await interaction.editReply({ embeds: [finalEmbed] });

  } finally {
    // 🔓 Always remove lock even if the command fails
    await supabase
      .from('roll_locks')
      .delete()
      .eq('discord_id', discordId);
  }
}
