const {Telegraf} = require('telegraf');
const {TelegramClient} = require('telegram');
const { Api } = require('telegram/tl');
const {StringSession} = require('telegram/sessions');
const input = require('input'); // npm install input
const fs = require('fs');
const path = require('path');

// bot api key: 7362076889:AAGBuX6ceu0q3O1lRhv5e5aM89kw0pOZ9E0


// Настройки Telegram API
const apiId = 28461899; // Замените на ваш API ID, полученный в my.telegram.org
const apiHash = '29c4fd0d5bfc3f60980220f07302d366'; // Замените на ваш API Hash, полученный в my.telegram.org

// Строка сессии Telegram клиента
const stringSession = new StringSession('1AgAOMTQ5LjE1NC4xNjcuNTABuyWgmLW/d8u48d4qZCBkMUQUGWgUrzpSA4XMizs36VO8FcnLb6JuwTDDPRco3PwDbLxz+Yifj44JWklib3jfd8q5RH1BQ9ff/ALGoTQcSkEUZLwpmbdmnVDzrRT81rXqZ3KiuxvKa4HNG+p9jqzr/YkazOG3IwNSLv9u47o3FGrvpCt0sZM6SUPbf4lS2eix/ARL1lGI1UKDmVaSoBUzJfaycpeby7E2fMCZOgrxd8Jt9jytqv8TpL7XfH/lIJ11vEUx21ddRsIOeFebKTqpxIqsxirnl2zDVJ6XwBsIZZlactdu4txfIuwPLj65NvJzEXq5mJRuR0d1UkbMoVMtGlM='); // Или используйте сохраненную строку сессии

const botToken = '7362076889:AAGBuX6ceu0q3O1lRhv5e5aM89kw0pOZ9E0'; // Инициализация клиента

const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

async function downloadFile(client, fileLocation, size, fileName) {
    const bufferSize = 1024 * 1024; // 1 MB
    let offset = 0;
    const filePath = path.join(__dirname, fileName);
    const writeStream = fs.createWriteStream(filePath);

    try {
        while (offset < size) {
            const part = await client.invoke(
                new Api.upload.GetFile({
                    location: fileLocation,
                    offset: offset,
                    limit: bufferSize,
                })
            );

            if (!part.bytes.length) {
                break;
            }

            writeStream.write(Buffer.from(part.bytes));
            offset += part.bytes.length;
        }
    } catch (err) {
        console.error('Error downloading file:', err);
    } finally {
        writeStream.end();
    }

    console.log(`Saved ${fileName} to ${filePath}`);

    return filePath
}



(async () => {
    console.log('Loading interactive example...');

    // Авторизация клиента
    await client.start({
        phoneNumber: async () => await input.text('Please enter your number: '),
        password: async () => await input.text('Please enter your password: '),
        phoneCode: async () => await input.text('Please enter the code you received: '),
        onError: (err) => console.log(err),
    });
    console.log('You are now connected.');

    // Сохранение строки сессии для повторного использования
    console.log('Your session string:', client.session.save());

    // Инициализация бота
    const bot = new Telegraf(botToken);

    bot.start((ctx) => ctx.reply('Привет! Отправьте мне ссылку на сообщение в Telegram-канале.'));

    bot.on('text', async (ctx) => {
            const message = ctx.message.text;

            // Проверяем, является ли сообщение ссылкой на Telegram
            const regex = /https:\/\/t\.me\/(\w+)\/(\d+)/;
            const match = message.match(regex);

            if (match) {
                const channel = match[1];
                const messageId = parseInt(match[2]);

                console.log({channel, messageId})

                try {
                    // Получаем сообщение из канала
                    const result = await client.getMessages(channel, {
                        ids: messageId,
                    });

                    const messageData = result[0];
                    console.log('Message text:', messageData.message);

                    // Отправляем текст сообщения обратно пользователю
                    if (messageData.message) {
                        ctx.reply(`Текст сообщения: ${messageData.message}`);
                    }

                    const media = messageData.media

                    if (media?.document) {
                        const document = media.document;
                        const fileName = document.attributes.find(attr => attr.className === 'DocumentAttributeFilename').fileName || 'unknown';
                        const fileLocation = new Api.InputDocumentFileLocation({
                            id: document.id,
                            accessHash: document.accessHash,
                            fileReference: Buffer.from(document.fileReference), // Преобразуем в буфер
                            thumbSize: '', // Это поле можно оставить пустым
                        });

                        // Загружаем файл по частям
                        const videoFilePath = await downloadFile(client, fileLocation, document.size.value, fileName);

                        ctx.replyWithVideo({ source: videoFilePath });

                    }


                } catch
                    (error) {
                    console.error('Failed to get message:', error);
                    ctx.reply('Не удалось получить сообщение. Проверьте правильность ссылки.');
                }
            } else {
                ctx.reply('Отправьте корректную ссылку на сообщение в Telegram-канале.');
            }
        }
    )
    ;

    bot.launch();
    console.log('Bot is running...');
})();
