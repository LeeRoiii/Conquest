import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { supabase } from '../supabaseClient';

export const data = new SlashCommandBuilder()
  .setName('give')
  .setDescription('Grant rewards to a user (admin only)')
  .addSubcommand(sub =>
    sub
      .setName('roll')
      .setDescription('Give extra roll(s) to a user')
      .addUserOption(opt =>
        opt.setName('user').setDescription('User to receive the roll(s)').setRequired(true)
      )
      .addIntegerOption(opt =>
        opt
          .setName('quantity')
          .setDescription('Number of bonus rolls (max 2)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(2)
      )
      .addStringOption(opt =>
        opt
          .setName('source')
          .setDescription('Type of bonus roll (event, marketplace)')
          .setRequired(true)
          .addChoices(
            { name: 'Event', value: 'event' },
            { name: 'Marketplace', value: 'marketplace' }
          )
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('user', true);
  const quantity = interaction.options.getInteger('quantity', true);
  const source = interaction.options.getString('source', true);
  const modUser = interaction.user;
  const member = interaction.member as GuildMember;

  // Admin check
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('❌ Permission Denied')
          .setDescription('Only **Admins** can use this command.'),
      ],
    });
  }

  // Check if user exists and has a bound wallet
  const { data: targetUserData } = await supabase
    .from('users')
    .select('wallet')
    .eq('discord_id', targetUser.id)
    .maybeSingle();

  if (!targetUserData?.wallet) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('❌ Cannot Grant Rolls')
          .setDescription(
            `The user ${targetUser} **has not bound their wallet yet**.\n\nThey must use the \`/wallet\` command to bind their Solana wallet first.`
          )
          .setFooter({ text: 'Wallet binding is required before receiving rolls.' }),
      ],
    });
  }

  // Confirmation prompt
  const confirmMsg = await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor('Yellow')
        .setTitle('⚠️ Confirm Roll Grant')
        .setDescription(
          `Are you sure you want to give **${quantity}** bonus roll${quantity > 1 ? 's' : ''} to ${targetUser}?\n\nSource: **${source}**`
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_grant')
          .setLabel(`✅ Yes, give ${quantity} roll${quantity > 1 ? 's' : ''}`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_grant')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      ),
    ],
  });

  try {
    const confirmation = await confirmMsg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 15_000,
    }).catch(() => null);

    if (!confirmation || confirmation.customId === 'cancel_grant' || confirmation.user.id !== modUser.id) {
      await interaction.editReply({
        components: [],
        embeds: [
          new EmbedBuilder()
            .setColor('Grey')
            .setTitle('⏳ Confirmation Expired')
            .setDescription('No response in time. Roll grant cancelled.'),
        ],
      });
      return;
    }

    await confirmation.deferUpdate();

    const now = new Date();
    const rollsToInsert = Array.from({ length: quantity }).map(() => ({
      discord_id: targetUser.id,
      tier_won: null,
      is_pity: false,
      source,
      granted_by: modUser.id,
      rolled_at: now,
    }));

    const { error } = await supabase.from('rolls').insert(rollsToInsert);

    if (error) {
      console.error('❌ Supabase error inserting rolls:', error);
      return interaction.editReply({
        components: [],
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Database Error')
            .setDescription('Something went wrong while inserting the roll(s).'),
        ],
      });
    }

    await interaction.editReply({
      components: [],
      embeds: [
        new EmbedBuilder()
          .setColor('Green')
          .setTitle('✅ Bonus Roll(s) Granted')
          .setDescription(
            `Successfully granted **${quantity}** bonus roll${quantity > 1 ? 's' : ''} to ${targetUser}.`
          )
          .addFields(
            { name: 'User', value: targetUser.tag, inline: true },
            { name: 'Quantity', value: `${quantity}`, inline: true },
            { name: 'Source', value: source, inline: true },
            { name: 'Time', value: `<t:${Math.floor(now.getTime() / 1000)}:f>`, inline: false }
          )
          .setFooter({ text: `Granted by ${modUser.tag}`, iconURL: modUser.displayAvatarURL() })
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp(),
      ],
    });

    // DM the user if possible
    const { data: config } = await supabase
      .from('giveaway_channels')
      .select('channel_id')
      .eq('guild_id', interaction.guildId)
      .maybeSingle();

    const giveawayMention = config?.channel_id
      ? `<#${config.channel_id}>`
      : '`/roll` command channel';

    await targetUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor('Green')
          .setAuthor({
            name: interaction.guild?.name || 'Server',
            iconURL: interaction.guild?.iconURL() ?? undefined,
          })
          .setTitle('🎁 Bonus Roll Received')
          .setDescription(
            `You've been granted **${quantity}** bonus roll${quantity > 1 ? 's' : ''} by **${modUser.tag}**!\n\n` +
            `💡 Use them in ${giveawayMention}.\nSource: **${source}**`
          )
          .setFooter({ text: `Given by ${modUser.tag}`, iconURL: modUser.displayAvatarURL() })
          .setTimestamp(),
      ],
    }).catch(() => {
      console.warn(`❗ Could not DM ${targetUser.tag}`);
    });

  } catch (err) {
    console.error('Confirmation error:', err);
    await interaction.editReply({
      components: [],
      embeds: [
        new EmbedBuilder()
          .setColor('Grey')
          .setTitle('⏳ Confirmation Expired')
          .setDescription('No response in time. Roll grant cancelled.'),
      ],
    });
  }
}
