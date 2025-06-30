import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ComponentType,
  AttachmentBuilder,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import { supabase } from '../supabaseClient';
import { stringify } from 'csv-stringify/sync';

export const data = new SlashCommandBuilder()
  .setName('export')
  .setDescription('Export roll history with filters')
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.member as GuildMember;
  const discordId = interaction.user.id;
  const isAdmin = member.permissions.has(PermissionFlagsBits.ManageGuild);
  const modRoleId = process.env.GIVEAWAY_MOD_ROLE_ID;
  const hasModRole = modRoleId && member.roles.cache.has(modRoleId);
  const isPrivileged = isAdmin || hasModRole;

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('export_filter_menu')
      .setPlaceholder('Select export filter')
      .addOptions([
        { label: 'All Rolls', value: 'all' },
        { label: 'Only My Rolls', value: 'mine' },
        { label: 'Tier 6 and Above', value: 'tier6plus' },
        { label: 'Only Pity Rolls', value: 'pity' },
      ])
  );

  await interaction.editReply({
    content: '📤 Choose an export filter:',
    components: [row],
  });

  const select = await interaction.channel!.awaitMessageComponent({
    componentType: ComponentType.StringSelect,
    time: 15_000,
  }).catch(() => null);

  if (!select) {
    return interaction.editReply({
      content: '⏱️ You didn’t select a filter in time.',
      components: [],
    });
  }

  await select.deferUpdate();

  const selected = select.values[0];
  let query = supabase.from('rolls').select('*, users!inner(username, wallet)').order('created_at', { ascending: false });

  if (selected === 'mine') query = query.eq('discord_id', discordId);
  if (selected === 'tier6plus') query = query.gte('tier_won', 6);
  if (selected === 'pity') query = query.eq('is_pity', true);
  if (selected === 'all' && !isPrivileged) {
    return interaction.editReply({
      content: '❌ You must be a mod/admin to export all rolls.',
      components: [],
    });
  }

  const { data: rolls, error } = await query;

  if (error || !rolls) {
    console.error('❌ Supabase error exporting rolls:', error);
    return interaction.editReply({
      content: 'Failed to export rolls.',
      components: [],
    });
  }

  if (rolls.length === 0) {
    return interaction.editReply({
      content: '📭 No rolls match the selected filter.',
      components: [],
    });
  }

  const csv = stringify(
    rolls.map(r => ({
      Username: r.users?.username ?? 'Unknown',
      Wallet: r.users?.wallet ?? 'N/A',
      Tier: r.tier_won,
      Pity: r.is_pity ? 'Yes' : 'No',
      Manual: r.manual ? 'Yes' : 'No',
      GrantedBy: r.granted_by ?? '',
      Date: r.roll_date,
    })),
    { header: true }
  );

  const file = new AttachmentBuilder(Buffer.from(csv), {
    name: 'filtered_rolls.csv',
  });

  return interaction.editReply({
    content: '✅ Export complete!',
    components: [],
    files: [file],
  });
}
