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
        opt
          .setName('user')
          .setDescription('The user to receive the roll(s)')
          .setRequired(true)
      )
      .addIntegerOption(opt =>
        opt
          .setName('quantity')
          .setDescription('Number of bonus rolls (max 2)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(2)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('user', true);
  const quantity = interaction.options.getInteger('quantity', true);
  const modUser = interaction.user;
  const member = interaction.member as GuildMember;

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('❌ Permission Denied')
          .setDescription('Only **Admins** can use this command.'),
      ],
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_grant')
      .setLabel(` Yes, give ${quantity} roll${quantity > 1 ? 's' : ''}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cancel_grant')
      .setLabel(' Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  const confirmMsg = await interaction.reply({
    ephemeral: true,
    embeds: [
      new EmbedBuilder()
        .setColor('Yellow')
        .setTitle('⚠️ Confirm Roll Grant')
        .setDescription(`Are you sure you want to give **${quantity}** bonus roll${quantity > 1 ? 's' : ''} to ${targetUser}?`),
    ],
    components: [row],
    fetchReply: true,
  });

  try {
    const confirmation = await confirmMsg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 15_000,
    });

    if (
      confirmation.customId === 'cancel_grant' ||
      confirmation.user.id !== interaction.user.id
    ) {
      await confirmation.update({
        content: '❌ Roll grant cancelled.',
        components: [],
        embeds: [],
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const rollsToInsert = Array.from({ length: quantity }).map(() => ({
      discord_id: targetUser.id,
      roll_date: today,
      tier_won: null,
      is_pity: false,
      manual: true,
      granted_by: modUser.id,
    }));

    const { error } = await supabase.from('rolls').insert(rollsToInsert);

    if (error) {
      console.error('❌ Supabase error inserting manual rolls:', error);
      return confirmation.update({
        components: [],
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Database Error')
            .setDescription('Something went wrong while inserting the roll(s).'),
        ],
      });
    }

    await confirmation.update({
      components: [],
      embeds: [
        new EmbedBuilder()
          .setColor('Green')
          .setTitle('✅ Bonus Roll(s) Granted')
          .setDescription(`Successfully granted **${quantity}** bonus roll${quantity > 1 ? 's' : ''} to ${targetUser}.`)
          .addFields(
            { name: 'User', value: `${targetUser.tag}`, inline: true },
            { name: 'Quantity', value: `${quantity}`, inline: true },
            { name: 'Date', value: today, inline: true }
          )
          .setFooter({ text: `Granted by ${modUser.tag}`, iconURL: modUser.displayAvatarURL() })
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp(),
      ],
    });

    // Fetch the giveaway channel from DB
    const { data: channelData, error: channelError } = await supabase
      .from('giveaway_channels')
      .select('channel_id')
      .eq('guild_id', interaction.guildId)
      .maybeSingle();

    const giveawayChannelMention = !channelError && channelData?.channel_id
      ? `<#${channelData.channel_id}>`
      : 'the designated giveaway channel';

    // ✅ DM the target user with the channel mention included
    await targetUser.send({
      embeds: [
        new EmbedBuilder()
          .setColor('Green')
          .setAuthor({
            name: interaction.guild?.name || 'Server',
            iconURL: interaction.guild?.iconURL() ?? undefined,
          })
          .setTitle('🎁 Bonus Roll Granted')
          .setDescription(
            `You’ve been granted **${quantity}** bonus roll${quantity > 1 ? 's' : ''} by **${modUser.tag}**.\n\n` +
            `You can use your bonus roll${quantity > 1 ? 's' : ''} in ${giveawayChannelMention}!`
          )
          .setFooter({
            text: `${modUser.tag}`,
            iconURL: modUser.displayAvatarURL(),
          })
          .setTimestamp(),
      ],
    });

  } catch (err) {
    await interaction.editReply({
      components: [],
      embeds: [
        new EmbedBuilder()
          .setColor('Grey')
          .setTitle('⏳ Confirmation Expired')
          .setDescription('No response was received in time. Roll grant cancelled.'),
      ],
    });
  }
}
