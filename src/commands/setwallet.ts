import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageComponentInteraction,
} from 'discord.js';
import { supabase } from '../supabaseClient';

const WALLET_CHANGE_COOLDOWN_DAYS = 3;
const COLLECTOR_TIMEOUT = 30000;

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function maskAddress(address: string): string {
  return address.length < 10 ? address : `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export const data = new SlashCommandBuilder()
  .setName('wallet')
  .setDescription('Manage your Solana wallet connection');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const username = interaction.user.tag;

  // 🔒 1. Channel Restriction Check via Supabaseasdasd
  const guildId = interaction.guildId;
  const currentChannelId = interaction.channelId;

  const { data: config, error: configError } = await supabase
    .from('giveaway_channels')
    .select('channel_id')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (configError) {
    console.error('❌ Supabase error:', configError);
    return interaction.editReply({
      content: '❌ Failed to validate the giveaway channel.',
    });
  }

  if (!config || config.channel_id !== currentChannelId) {
    const fallbackChannel = config?.channel_id ? `<#${config.channel_id}>` : 'Not set';
    const restrictionEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🚫 Command Restricted')
      .setDescription(`This command can only be used in:\n${fallbackChannel}`)
      .setFooter({
        text: `Attempted in: #${interaction.channel && 'name' in interaction.channel ? interaction.channel.name : 'unknown'}`,
      });

    return interaction.editReply({
      embeds: [restrictionEmbed],
    });
  }

  // 🔐 2. Role Check
  const member = interaction.member as GuildMember;
  const requiredRoleId = process.env.LEVEL_2_ROLE_ID!;
  if (!member.roles.cache.has(requiredRoleId)) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Permission Denied')
          .setDescription('You need the Level 2+ role to use this command.'),
      ],
    });
  }

  // 🧾 3. Fetch User
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('wallet, updated_at')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (userError) {
    console.error('❌ Supabase error:', userError);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Database Error')
          .setDescription('Failed to fetch your wallet info.'),
      ],
    });
  }

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🔐 Wallet Management')
    .setDescription('Choose an action for your Solana wallet');

  const now = new Date();

  if (user?.wallet) {

    const lastUpdated = user.updated_at ? new Date(user.updated_at) : null;
    const diffDays = lastUpdated
      ? (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const canChange = diffDays >= WALLET_CHANGE_COOLDOWN_DAYS;

    embed.addFields({
      name: 'Wallet Status',
      value: canChange
        ? '✅ You can change your wallet'
        : `⏳ Wallet change available in ${Math.ceil(WALLET_CHANGE_COOLDOWN_DAYS - diffDays)} days`,
      inline: true,
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('view_wallet')
        .setLabel('View Wallet')
        .setEmoji('🔍')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('change_wallet')
        .setLabel('Change Wallet')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canChange),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } else {
    embed.addFields({
      name: 'Wallet Status',
      value: '❌ No wallet bound to your account',
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('bind_wallet')
        .setLabel('Bind Wallet')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  }

  // 🎯 4. Collector for Button Clicks
  const collector = interaction.channel!.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECTOR_TIMEOUT,
    filter: i => i.user.id === interaction.user.id,
  });

  collector.on('collect', async (i: MessageComponentInteraction) => {
    try {
      await i.deferUpdate();

      await interaction.editReply({ components: [] }); // Clean up buttons

      if (i.customId === 'view_wallet' && user?.wallet) {
        return i.followUp({
          ephemeral: true,
          embeds: [
            new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('🔍 Your Wallet')
              .setDescription(`\`${user.wallet}\``),
          ],
        });
      }

      if (i.customId === 'bind_wallet' || i.customId === 'change_wallet') {
        await handleWalletModal(i, discordId, username, i.customId === 'change_wallet');
      }
    } catch (err) {
      console.error('Interaction error:', err);
      interaction.editReply({
        content: '❌ Something went wrong.',
        components: [],
      });
    }
  });

  collector.on('end', collected => {
    if (collected.size === 0) {
      interaction.editReply({
        content: '⌛ Menu timed out. Use /wallet again if needed.',
        components: [],
      });
    }
  });
}

// 💾 Wallet Modal Logic
async function handleWalletModal(
  interaction: MessageComponentInteraction,
  discordId: string,
  username: string,
  isChange: boolean,
) {
  const modal = new ModalBuilder()
    .setCustomId(isChange ? 'change_wallet_modal' : 'bind_wallet_modal')
    .setTitle(isChange ? 'Change Wallet' : 'Bind Wallet')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('wallet_input')
          .setLabel('Enter your wallet address')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(32)
          .setMaxLength(44)
          .setPlaceholder('e.g., D8w7...Xy9z'),
      ),
    );

  await interaction.showModal(modal);

  try {
    const submitted = await interaction.awaitModalSubmit({
      time: COLLECTOR_TIMEOUT,
      filter: i => i.user.id === interaction.user.id,
    });

    const wallet = submitted.fields.getTextInputValue('wallet_input').trim();
    if (!isValidSolanaAddress(wallet)) {
      return submitted.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Address')
            .setDescription('That is not a valid Solana wallet.'),
        ],
      });
    }

    const { error } = await supabase.from('users').upsert(
      {
        discord_id: discordId,
        username,
        wallet,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'discord_id' },
    );

    if (error) throw error;

    const actionText = isChange ? 'updated' : 'bound';

    await submitted.reply({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle(`✅ Wallet ${actionText}`)
          .setDescription(`\`${wallet}\` has been ${actionText}.`)
          .setFooter({ text: `You can change it again in ${WALLET_CHANGE_COOLDOWN_DAYS} days.` }),
      ],
    });

    try {
      await submitted.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(`🔐 Wallet ${actionText}`)
            .setDescription(`Your wallet was ${actionText} on <t:${Math.floor(Date.now() / 1000)}:F>`)
            .addFields({ name: 'Wallet', value: `\`${maskAddress(wallet)}\`` })
            .setFooter({ text: 'Use /wallet to view or change again.' }),
        ],
      });
    } catch (dmError) {
      console.warn('DM failed:', dmError);
    }
  } catch (err) {
    console.error('Modal error:', err);
    interaction.followUp({
      ephemeral: true,
      content: '⌛ You took too long. Please try again.',
    });
  }
}
