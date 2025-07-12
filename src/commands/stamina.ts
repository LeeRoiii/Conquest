import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { supabase } from '../supabaseClient';

const MAX_STAMINA = 200;
const REPLENISH_MINUTES = 15;

export const data = new SlashCommandBuilder()
  .setName('stamina')
  .setDescription('Check your current stamina and regeneration status');

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const serverId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  const { data: player, error } = await supabase
    .from('players')
    .select('stamina, stamina_updated_at')
    .eq('user_id', userId)
    .eq('server_id', serverId)
    .single();

  if (error || !player) {
    return interaction.editReply({
      content: '❌ You have no stamina data. Start your conquest first with `/start`.',
    });
  }

  const staminaLast = player.stamina ?? MAX_STAMINA;
  const lastUpdateStr = player.stamina_updated_at;

  let staminaCurrent = staminaLast;
  let nextFullTime: Date | null = null;

  if (lastUpdateStr) {
    const lastUpdate = new Date(lastUpdateStr);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastUpdate.getTime()) / 60000);

    const gainedPoints = Math.floor(diffMinutes / REPLENISH_MINUTES);
    staminaCurrent = Math.min(MAX_STAMINA, staminaLast + gainedPoints);

    if (staminaCurrent < MAX_STAMINA) {
      const minutesToFull = (MAX_STAMINA - staminaCurrent) * REPLENISH_MINUTES - (diffMinutes % REPLENISH_MINUTES);
      nextFullTime = new Date(now.getTime() + minutesToFull * 60000);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🏃 Stamina Status')
    .addFields(
      { name: 'Current Stamina', value: `${staminaCurrent} / ${MAX_STAMINA}`, inline: true },
    )
    .setColor('Green');

  if (nextFullTime) {
    embed.addFields({
      name: 'Full Stamina In',
      value: `<t:${Math.floor(nextFullTime.getTime() / 1000)}:R>`, // Discord relative timestamp
      inline: true,
    });
  } else {
    embed.setDescription('You have full stamina! Ready for your next move!');
  }

  return interaction.editReply({ embeds: [embed] });
}
