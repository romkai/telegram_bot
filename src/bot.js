const { Telegraf } = require('telegraf');
const TelegramClient = require('./telegram-client');

// const botToken = '7362076889:AAGBuX6ceu0q3O1lRhv5e5aM89kw0pOZ9E0';
const botToken = '6912587615:AAFGV9_B9HPvwknlR-VTKGsbhqGCqrQGG5I';

function log(...params) {
  console.log(...params);
}

(async () => {
  const bot = new Telegraf(botToken);
  const client = new TelegramClient(log);
  bot.start((ctx) => ctx.reply('Привет! Отправьте мне ссылку на сообщение в Telegram-канале.'));
  bot.on('text', async (ctx) => {
    const messageLink = ctx.message.text;
    const regex = /https:\/\/t\.me\/(\w+)\/(\d+)/;
    const match = messageLink.match(regex);
    if (match) {
      const channel = match[1];
      const messageId = parseInt(match[2], 10);
      console.log({ channel, messageId });
      try {
        ctx.reply('Минуточку, идет получение данных...');
        const { message, sources } = await client.extractDataFromMessage(channel, messageId);
        if (message) {
          ctx.reply(message);
        }
        if (sources.length > 0) {
          await ctx.replyWithMediaGroup(sources);
        }
      } catch (error) {
        console.error('Failed to extract data from message:', error);
        ctx.reply('Не удалось получить содержимое сообщения. Проверьте правильность ссылки.');
      }
    } else {
      ctx.reply('Отправьте корректную ссылку на сообщение в Telegram-канале.');
    }
  });
  bot.launch();
  console.log('Bot is running...');
})();
