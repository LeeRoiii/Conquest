  import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

  declare module '../commands' {
    export interface Command {
      data: SlashCommandBuilder;
      bypassRestriction?: boolean;
      execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    }
  }