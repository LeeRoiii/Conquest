import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
} from 'discord.js';
import { enforceGiveawayChannel } from '../utils/commandRestrictions';

export const data = new SlashCommandBuilder()
  .setName('stop-bot')
  .setDescription('Stop the Giveaway bot (admin only)');

export async function execute(interaction: ChatInputCommandInteraction) {
  // Restrict command to the configured giveaway channel
  if (!(await enforceGiveawayChannel(interaction))) return;

  const member = interaction.member as GuildMember;

  if (!member.permissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ Only admins can stop the bot.',
      ephemeral: true,
    });
  }

  await interaction.reply('🛑 Bot is shutting down...');
  console.log(`🛑 Bot was stopped by ${interaction.user.tag}`);
  process.exit(0); // Graceful exit
}
