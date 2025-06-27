  // src/commands/setGiveawayChannel.ts
  import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
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
    // 1. Basic Validation
    const channel = interaction.options.getChannel('channel', true);
    const guild = interaction.guild;
    const guildId = interaction.guildId;

    if (!guild || !guildId) {
      return interaction.reply({
        content: '❌ This command must be used in a server.',
        ephemeral: true,
      });
    }

    // 2. Channel Execution Restriction Check
    const { data: config, error: configError } = await supabase
      .from('giveaway_channels')
      .select('channel_id')
      .eq('guild_id', guildId)
      .maybeSingle();

    if (configError) {
      console.error('❌ Supabase error:', configError);
      return interaction.reply({
        content: '❌ Failed to validate channel restrictions. Please try again later.',
        ephemeral: true
      });
    }

    // If a channel is configured, enforce the restriction
    if (config?.channel_id && interaction.channelId !== config.channel_id) {
      const restrictionEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🚫 Command Restricted')
        .setDescription(`This command can only be used in <#${config.channel_id}>`)
        .setFooter({
          text: `Attempted in: #${interaction.channel && 'name' in interaction.channel ? interaction.channel.name : 'unknown'}`
        });

      return interaction.reply({
        embeds: [restrictionEmbed],
        ephemeral: true
      });
    }

    // 3. Channel Existence Check
    const targetChannel = guild.channels.cache.get(channel.id);
    if (!targetChannel) {
      return interaction.reply({
        content: '❌ The specified channel was not found.',
        ephemeral: true,
      });
    }

    // 4. Bot Permission Check
    const botMember = guild.members.me;
    if (!botMember?.permissionsIn(channel.id).has([
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ])) {
      return interaction.reply({
        content: "❌ I need both 'Send Messages' and 'Embed Links' permissions in that channel.",
        ephemeral: true,
      });
    }

    // 5. No Change Check
    if (config?.channel_id === channel.id) {
      const noChangeEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('ℹ️ No Changes Made')
        .setDescription(`<#${channel.id}> is already the giveaway channel`)
        .addFields({
          name: 'Tip',
          value: 'To change the channel, specify a different one'
        });
      
      return interaction.reply({
        embeds: [noChangeEmbed],
        ephemeral: true
      });
    }

    // 6. Database Update
    const { error: upsertError } = await supabase
      .from('giveaway_channels')
      .upsert({ 
        guild_id: guildId, 
        channel_id: channel.id,
        updated_at: new Date().toISOString(),
        updated_by: interaction.user.id
      });

    if (upsertError) {
      console.error('Supabase Error:', upsertError);
      return interaction.reply({
        content: '❌ Database update failed. Please try again later.',
        ephemeral: true,
      });
    }

    // 7. Success Response
    const successEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Giveaway Channel Updated')
      .setDescription(`Successfully set giveaway channel to <#${channel.id}>`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: 'Previous Channel', value: config ? `<#${config.channel_id}>` : 'None set', inline: true },
        { name: 'Configured By', value: interaction.user.toString(), inline: true }
      )
      .setFooter({ text: `Server: ${guild.name}` })
      .setTimestamp();

    return interaction.reply({
      embeds: [successEmbed],
      ephemeral: false
    });
  }