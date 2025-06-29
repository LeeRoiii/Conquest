import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { supabase } from '../supabaseClient';

export const data = new SlashCommandBuilder()
  .setName('set-giveaway-channel')
  .setDescription('Set the channel where giveaway messages will be sent')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('The channel to use for giveaways')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel('channel', true);
  const guild = interaction.guild;
  const guildId = interaction.guildId;

  if (!guild || !guildId) {
    return interaction.reply({
      content: '❌ This command must be used in a server.',
      ephemeral: true,
    });
  }

  // Fetch current config
  const { data: config, error: configError } = await supabase
    .from('giveaway_channels')
    .select('channel_id, updated_at')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (configError) {
    console.error('❌ Supabase error:', configError);
    return interaction.reply({
      content: '❌ Failed to validate channel restrictions. Please try again later.',
      ephemeral: true,
    });
  }

  // Check cooldown (1 hour = 3600000 ms)
  if (config?.updated_at) {
    const lastUpdate = new Date(config.updated_at).getTime();
    const now = Date.now();
    const cooldownMs = 60 * 60 * 1000;

    if (now - lastUpdate < cooldownMs) {
      const remainingMs = cooldownMs - (now - lastUpdate);
      const minutesLeft = Math.ceil(remainingMs / 60000);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setTitle('⏳ Cooldown Active')
            .setDescription(`The giveaway channel was changed recently. Please wait **${minutesLeft} minute(s)** before updating it again.`),
        ],
        ephemeral: true,
      });
    }
  }

  // No change check
  if (config?.channel_id === channel.id) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('Orange')
          .setTitle('ℹ️ No Changes Made')
          .setDescription(`<#${channel.id}> is already the giveaway channel`)
          .addFields({ name: 'Tip', value: 'To change the channel, specify a different one' }),
      ],
      ephemeral: true,
    });
  }

  // Permissions check
  const botMember = guild.members.me;
  if (!botMember?.permissionsIn(channel.id).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return interaction.reply({
      content: "❌ I need both 'Send Messages' and 'Embed Links' permissions in that channel.",
      ephemeral: true,
    });
  }

  // Confirmation buttons
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_set_channel')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cancel_set_channel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  const confirmEmbed = new EmbedBuilder()
    .setColor('Yellow')
    .setTitle('⚠️ Confirm Giveaway Channel Change')
    .setDescription(`Are you sure you want to set the giveaway channel to <#${channel.id}>?`);

  const confirmMsg = await interaction.reply({
    embeds: [confirmEmbed],
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  try {
    const filter = (i: any) => ['confirm_set_channel', 'cancel_set_channel'].includes(i.customId) && i.user.id === interaction.user.id;
    const confirmation = await confirmMsg.awaitMessageComponent({ componentType: ComponentType.Button, time: 30000, filter });

    if (confirmation.customId === 'cancel_set_channel') {
      await confirmation.update({
        content: '❌ Giveaway channel update cancelled.',
        embeds: [],
        components: [],
      });
      return;
    }

    // User confirmed - update DB
    const { error: upsertError } = await supabase
      .from('giveaway_channels')
      .upsert({
        guild_id: guildId,
        channel_id: channel.id,
        updated_at: new Date().toISOString(),
        updated_by: interaction.user.id,
      });

    if (upsertError) {
      console.error('Supabase Error:', upsertError);
      return confirmation.update({
        content: '❌ Database update failed. Please try again later.',
        embeds: [],
        components: [],
      });
    }

    // Success response
    const successEmbed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('✅ Giveaway Channel Updated')
      .setDescription(`Successfully set giveaway channel to <#${channel.id}>`)
      .setThumbnail(guild.iconURL() ?? null)
      .addFields(
        { name: 'Previous Channel', value: config?.channel_id ? `<#${config.channel_id}>` : 'None set', inline: true },
        { name: 'Configured By', value: interaction.user.toString(), inline: true }
      )
      .setFooter({ text: `Server: ${guild.name}` })
      .setTimestamp();

    await confirmation.update({
      embeds: [successEmbed],
      components: [],
      content: null,
    });

  } catch (error) {
    // Timeout or other error
    await interaction.editReply({
      content: '⏳ Confirmation timed out. Giveaway channel update cancelled.',
      embeds: [],
      components: [],
    });
  }
}
