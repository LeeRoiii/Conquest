import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { supabase } from '../supabaseClient';

/**
 * Restricts a command to the configured giveaway channel for the server.
 * 
 * @param interaction The command interaction object.
 * @returns `true` if allowed, `false` if blocked.
 */
export async function enforceGiveawayChannel(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;

  const { data: config, error } = await supabase
    .from('giveaway_channels')
    .select('channel_id')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (error || !config || config.channel_id !== channelId) {
    const allowedChannel = config?.channel_id ? `<#${config.channel_id}>` : '❌ Not Set';

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🚫 Command Restricted')
      .setDescription(`This command can only be used in:\n${allowedChannel}`)
      .setFooter({
        text: `Attempted in #${interaction.channel && 'name' in interaction.channel ? interaction.channel.name : 'unknown'}`,
      });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return false;
  }

  return true;
}
