const { Telegraf } = require('telegraf');
const express = require('express');
const TelegramClient = require('./telegram-client');

// const botToken = '7362076889:AAGBuX6ceu0q3O1lRhv5e5aM89kw0pOZ9E0';
const botToken = '6912587615:AAFGV9_B9HPvwknlR-VTKGsbhqGCqrQGG5I';

function log(...params) {
  console.log(...params);
}

const userStats = {};

function updateUserStats(name) {
  if (userStats[name]) {
    userStats[name] += 1;
  } else {
    userStats[name] = 1;
  }
}

function showUserStats() {
  console.log('STATS ---------------------------------');
  Object.keys(userStats).forEach((k) => {
    console.log(`${k}: ${userStats[k]}`);
  });
}

(async () => {
  const bot = new Telegraf(botToken);
  const client = new TelegramClient(log);
  bot.start((ctx) => ctx.reply('Hello! Send me a link to a message in a Telegram channel'));
  bot.on('text', async (ctx) => {
    const username = ctx.from.username ? `@${ctx.from.username}` : '<noname>';
    updateUserStats(username);

    const messageLink = ctx.message.text;
    const regex = /https:\/\/t\.me\/(\w+)\/(\d+)/;
    const match = messageLink.match(regex);
    if (match) {
      const channel = match[1];
      const messageId = parseInt(match[2], 10);
      console.log({ channel, messageId });
      try {
        ctx.reply('One moment, retrieving data...');
        const { message, sources } = await client.extractDataFromMessage(channel, messageId);
        if (message) {
          ctx.reply(message);
        }
        if (sources.length > 0) {
          await ctx.replyWithMediaGroup(sources);
        }
        showUserStats();
      } catch (error) {
        console.error('Failed to extract data from message:', error);
        ctx.reply('Failed to retrieve the message content. Please check the link\'s accuracy');
      }
    } else {
      ctx.reply('Please send a valid link to a message in a Telegram channel');
    }
  });
  bot.launch();
  console.log('Bot is running...');
})();

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
