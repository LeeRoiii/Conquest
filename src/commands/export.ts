import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
  GuildMember,
} from 'discord.js';
import { supabase } from '../supabaseClient';
import { stringify } from 'csv-stringify/sync'; // npm install csv-stringify

export const data = new SlashCommandBuilder()
  .setName('export')
  .setDescription('Export roll history as CSV')
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const member = interaction.member as GuildMember;
  const isAdmin = member.permissions.has(PermissionFlagsBits.ManageGuild);

  // Optional: Check for mod role if defined
  const modRoleId = process.env.GIVEAWAY_MOD_ROLE_ID;
  const hasModRole = modRoleId && member.roles.cache.has(modRoleId);
  const isPrivileged = isAdmin || hasModRole;

  const isExportAll = isPrivileged;

  let query = supabase
    .from('rolls')
    .select('*');

  if (!isExportAll) {
    query = query.eq('discord_id', discordId);
  }

  const { data: rolls, error } = await query
    .order('created_at', { ascending: false });
  
  if (error || !rolls) {
    console.error('❌ Supabase error exporting rolls:', error);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('❌ Export Failed')
          .setDescription('Could not fetch your roll history. Please try again.'),
      ],
    });
  }

  if (rolls.length === 0) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Yellow')
          .setTitle('📄 No Rolls Found')
          .setDescription(isExportAll ? 'No users have rolled yet.' : 'You haven’t rolled yet.'),
      ],
    });
  }

  // Format CSV
  const csv = stringify(rolls, {
    header: true,
    columns: {
      id: 'ID',
      discord_id: 'User ID',
      roll_date: 'Roll Date',
      tier_won: 'Tier',
      is_pity: 'Pity Bonus',
      manual: 'Manual Roll',
      granted_by: 'Granted By',
      created_at: 'Created At',
    },
  });

  const file = new AttachmentBuilder(Buffer.from(csv), {
    name: isExportAll ? 'all_rolls.csv' : 'my_rolls.csv',
  });

  return interaction.editReply({
    content: isExportAll ? '📤 Exported all user rolls.' : '📤 Exported your roll history.',
    files: [file],
  });
}
