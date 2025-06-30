import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';
import { supabase } from '../supabaseClient';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const data = new SlashCommandBuilder()
  .setName('export')
  .setDescription('🧾 Export roll reward data as CSV (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  // Fetch all roll winners with prizes
  const { data: prizes, error } = await supabase
    .from('prizes')
    .select(`
      discord_id,
      username,
      wallet,
      tier,
      tier_label,
      won_at
    `)
    .order('won_at', { ascending: true });

  if (error || !prizes || prizes.length === 0) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('❌ Export Failed')
          .setDescription('No prize data found or failed to fetch from Supabase.'),
      ],
    });
  }

  // Prepare CSV content
  const csvData = prizes.map(p => ({
    'Username': p.username || `@${p.discord_id}`,
    'Wallet Address': p.wallet || 'N/A',
    'Tier': p.tier_label,
    'Date of Win': new Date(p.won_at).toLocaleString(),
  }));

  const csvString = stringify(csvData, {
    header: true,
    columns: ['Username', 'Wallet Address', 'Tier', 'Date of Win'],
  });

  // Save to a temp file (cross-platform)
  const fileName = `reward-export-${new Date().toISOString().split('T')[0]}.csv`;
  const filePath = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(filePath, csvString);

  const attachment = new AttachmentBuilder(filePath).setName(fileName);

  await interaction.editReply({
    content: '📄 Here is the exported reward data:',
    files: [attachment],
  });
}
