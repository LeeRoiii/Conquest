import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { supabase } from '../supabaseClient';

export async function validateCommandChannel(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  if (!interaction.guildId) return false;

  // Fetch configured channel from database
  const { data, error } = await supabase
    .from('giveaway_channels')
    .select('channel_id')
    .eq('guild_id', interaction.guildId)
    .single();

  if (error || !data) return true; // No restriction if not configured
  
  return interaction.channelId === data.channel_id;
}

export function createChannelRestrictionEmbed(interaction: ChatInputCommandInteraction) {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('Command Restricted')
    .setDescription(`All commands must be used in the designated command channel`)
    .setFooter({
      text: `Attempted in: #${
        interaction.channel && 'name' in interaction.channel
          ? (interaction.channel as { name: string }).name
          : 'unknown'
      }`
    });
}