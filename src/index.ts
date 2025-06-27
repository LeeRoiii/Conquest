import { Client, GatewayIntentBits, Events, ActivityType, Collection, ChatInputCommandInteraction } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Type definitions for commands
interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// Extend Client interface to include commands
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}

// Create the bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  presence: {
    activities: [{
      name: 'giveaways',
      type: ActivityType.Watching,
    }],
    status: 'online',
  },
}) as Client & { commands: Collection<string, Command> };

// Initialize commands collection
client.commands = new Collection();

// Track bot uptime
const startTime = Date.now();

// Dynamic command loading
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath) as Command;
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`⚠️ The command at ${filePath} is missing required "data" or "execute" property.`);
  }
}

// When bot is ready
client.once(Events.ClientReady, async (readyClient) => {
  const username = readyClient.user.tag;
  const inviteLink = `https://discord.com/oauth2/authorize?client_id=${readyClient.user.id}&permissions=8&scope=bot%20applications.commands`;

  console.clear();
  console.log(`\n==============================`);
  console.log(`🤖 BOT INFORMATION`);
  console.log(`✅ ${username} is online and ready!`);
  console.log(`🆔 Client ID: ${readyClient.user.id}`);
  console.log(`🔗 Invite Link: ${inviteLink}`);
  console.log(`📅 Started at: ${new Date(startTime).toLocaleString()}`);
  console.log(`==============================\n`);

  // Send startup message if configured
  const startupChannelId = process.env.STARTUP_CHANNEL_ID;
  if (startupChannelId) {
    try {
      const channel = await readyClient.channels.fetch(startupChannelId);
      if (
        channel &&
        channel.isTextBased() &&
        'send' in channel &&
        typeof channel.send === 'function'
      ) {
        const embed = {
          color: 0x00ff00,
          title: '🟢 Bot Online',
          description: `${username} is now online and ready to serve!`,
          fields: [
            {
              name: 'Uptime',
              value: `<t:${Math.floor(startTime/1000)}:R>`,
              inline: true,
            },
            {
              name: 'Commands Loaded',
              value: client.commands.size.toString(),
              inline: true,
            }
          ],
          timestamp: new Date().toISOString(),
        };

        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('⚠️ Failed to send startup message:', err);
    }
  }

  // Update bot presence periodically
  setInterval(() => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    
    const uptimeString = [
      days > 0 ? `${days}d` : '',
      hours > 0 ? `${hours}h` : '',
      minutes > 0 ? `${minutes}m` : '',
      `${seconds}s`
    ].filter(Boolean).join(' ');

    readyClient.user?.setPresence({
      activities: [{
        name: `for ${uptimeString}`,
        type: ActivityType.Watching,
      }],
      status: 'online',
    });
  }, 60000); // Update every minute
});

// Slash command handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`❌ No command matching ${interaction.commandName} was found.`);
    return interaction.reply({
      content: '❌ Command not found. Please try again later.',
      ephemeral: true,
    });
  }

  try {
    console.log(`⌛ Executing command /${interaction.commandName} for ${interaction.user.tag}`);
    await command.execute(interaction);
    console.log(`✅ Successfully executed /${interaction.commandName} for ${interaction.user.tag}`);
  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);
    
    const errorEmbed = {
      color: 0xff0000,
      title: '❌ Command Error',
      description: 'An error occurred while executing this command.',
      fields: [
        {
          name: 'Error Details',
          value: '```' + (error instanceof Error ? error.message : 'Unknown error') + '```',
        }
      ],
      footer: {
        text: 'Please try again or contact support if the issue persists',
      },
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ 
        embeds: [errorEmbed],
        ephemeral: true,
      });
    }
  }
});

// Error handling
client.on(Events.Error, error => {
  console.error('❌ Client error:', error);
});

client.on(Events.Warn, info => {
  console.warn('⚠️ Client warning:', info);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔑 Logged in successfully'))
  .catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
  });