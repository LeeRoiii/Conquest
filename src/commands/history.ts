import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} from 'discord.js';
import { supabase } from '../supabaseClient';

const ENTRIES_PER_PAGE = 10;
const TIER_EMOJIS: Record<number, string> = {
  1: '⚪',
  2: '🟢',
  3: '🔵',
  4: '🟣',
  5: '✨',
  7: '🔘',
  9: '🎯'
};

export const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View your detailed roll history')
  .addUserOption(opt =>
    opt
      .setName('user')
      .setDescription('View another user\'s history (admin only)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const isAdmin = interaction.memberPermissions?.has('Administrator');
  const targetUser = interaction.options.getUser('user') || interaction.user;

  if (targetUser.id !== interaction.user.id && !isAdmin) {
    return interaction.reply({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⛔ Permission Denied')
          .setDescription('Only admins can view other users\' history.')
      ],
    }); 
  }

  await interaction.deferReply({ ephemeral: true });

  const { data: rolls, error } = await supabase
    .from('rolls')
    .select('*')
    .eq('discord_id', targetUser.id)
    .order('created_at', { ascending: false });

  if (error || !rolls || rolls.length === 0) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('📭 No History Found')
          .setDescription(`${targetUser.username} has no recorded rolls.`)
          .setThumbnail(targetUser.displayAvatarURL())
      ],
    });
  }

  const totalPages = Math.ceil(rolls.length / ENTRIES_PER_PAGE);
  let currentPage = 0;

  const buildEmbed = (page: number) => {
    const slice = rolls.slice(page * ENTRIES_PER_PAGE, (page + 1) * ENTRIES_PER_PAGE);

    // Calculate maximum lengths for perfect alignment
    const maxNumLength = Math.floor(Math.log10(rolls.length)) + 1;
    const maxTierLength = Math.max(...rolls.map(r => `Tier ${r.tier_won}`.length));

    const rollEntries = slice.map((roll, index) => {
      const num = page * ENTRIES_PER_PAGE + index + 1;
      const date = new Date(roll.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const tierEmoji = TIER_EMOJIS[roll.tier_won] || '🔘';
      const tierText = `Tier ${roll.tier_won}`;
      
      let rollType = 'Normal';
      let rollEmoji = '🎲';
      if (roll.manual) {
        rollType = 'Bonus';
        rollEmoji = '✨';
      } else if (roll.is_pity) {
        rollType = 'Pity';
        rollEmoji = '🛡️';
      }
      
      return [
        `${num.toString().padStart(maxNumLength, ' ')}`,
        `• ${tierEmoji} ${tierText.padEnd(maxTierLength, ' ')}`,
        `• ${rollEmoji} ${rollType.padEnd(6, ' ')}`,
        `• 📅 ${date}`
      ].join(' ');
    }).join('\n');

    return new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({
        name: `${targetUser.username}'s Detailed Roll History`,
        iconURL: targetUser.displayAvatarURL()
      })
      .setDescription(
        `**        Roll      **  • **Tier**        •        **Type**   •  **Date** \n` +
        `\`\`\`${rollEntries}\`\`\``
      )
      .setFooter({
        text: `Showing ${slice.length} of ${rolls.length} rolls • Page ${page + 1}/${totalPages}`,
      });
  };

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(totalPages <= 1)
  );

  const message = await interaction.editReply({
    embeds: [buildEmbed(currentPage)],
    components: totalPages > 1 ? [row] : [],
  });

  if (totalPages <= 1) return;

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
  });

  collector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ 
        content: '⛔ You cannot control this menu.', 
        ephemeral: true 
      });
    }

    if (i.customId === 'prev') currentPage--;
    else if (i.customId === 'next') currentPage++;

    const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId('next')
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages - 1)
    );

    await i.update({
      embeds: [buildEmbed(currentPage)],
      components: [newRow],
    });
  });

  collector.on('end', async () => {
    await message.edit({ components: [] });
  });
}