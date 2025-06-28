import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
} from 'discord.js';
import { supabase } from '../supabaseClient';

export const data = new SlashCommandBuilder()
  .setName('give')
  .setDescription('Grant rewards to a user (admin only)')
  .addSubcommand(sub =>
    sub
      .setName('roll')
      .setDescription('Give an extra roll to a user')
      .addUserOption(opt =>
        opt
          .setName('user')
          .setDescription('The user to receive the roll')
          .setRequired(true)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 👈 Requires Admin
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('user', true);
  const modUser = interaction.user;

  const member = interaction.member as GuildMember;
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) {
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

  await interaction.deferReply({ ephemeral: true });

  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from('rolls').insert({
    discord_id: targetUser.id,
    roll_date: today,
    tier_won: null,
    is_pity: false,
    manual: true,
    granted_by: modUser.id,
  });

  if (error) {
    console.error('❌ Supabase error inserting manual roll:', error);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('❌ Database Error')
          .setDescription('Something went wrong while inserting the roll.'),
      ],
    });
  }

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor('Green')
        .setTitle('✅ Bonus Roll Granted')
        .setDescription(`Successfully granted **1 roll** to <@${targetUser.id}>`)
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: 'Date', value: today, inline: true }
        )
        .setFooter({ text: `Granted by ${modUser.tag}` })
        .setTimestamp(),
    ],
  });
}
    // Note: This command is only for admins, so no need to check channel or role restrictions
    // as it will be handled by the default member permissions.
    