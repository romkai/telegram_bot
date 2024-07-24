require('dotenv').config();
const MTProto = require('@mtproto/core');
const path = require('path');
const fs = require('fs');
const prompts = require('prompts');

const api_id = process.env.API_ID;
const api_hash = process.env.API_HASH;
const session_path = path.join(__dirname, './config/session.json');
// const downloads_path = path.join('config', 'session.json');

class TelegramClient {
  mtproto = null;

  emit = null;

  constructor(emitFunc) {
    this.emit = emitFunc;
    this.mtproto = new MTProto({ api_id, api_hash, storageOptions: { path: session_path } });
  }

  static async inputPhoneNumber() {
    const response = await prompts({
      type: 'text',
      name: 'phone_number',
      message: 'Please enter your phone number:',
    });
    return response.phone_number;
  }

  static async inputCode() {
    const response = await prompts({
      type: 'text',
      name: 'code',
      message: 'Please enter the code you received:',
    });
    return response.code;
  }

  static async inputPassword() {
    const response = await prompts({
      type: 'password',
      name: 'password',
      message: 'Please enter your password:',
    });
    return response.password;
  }

  async login() {
    const phone_number = await TelegramClient.inputPhoneNumber();
    try {
      const { phone_code_hash } = await this.mtproto.call('auth.sendCode', {
        phone_number,
        settings: { _: 'codeSettings' },
      });
      const phone_code = await TelegramClient.inputCode();
      try {
        await this.mtproto.call('auth.signIn', {
          phone_number,
          phone_code_hash,
          phone_code,
        });
      } catch (error) {
        if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
          const password = await TelegramClient.inputPassword();
          const { srp_id, current_algo, srp_B } = await this.mtproto.call('account.getPassword');
          const {
            g, p, salt1, salt2,
          } = current_algo;
          const { A, M1 } = await this.mtproto.crypto.getSRPParams({
            g,
            p,
            salt1,
            salt2,
            gB: srp_B,
            password,
          });
          await this.mtproto.call('auth.checkPassword', {
            password: {
              _: 'inputCheckPasswordSRP', srp_id, A, M1,
            },
          });
        } else {
          throw error;
        }
      }
      this.emit('Logged in successfully');
    } catch (error) {
      this.emit('Error during login:', error);
    }
  }

  async downloadFile(inputLocation, filePath) {
    let offset = 0;
    let buffer = Buffer.alloc(0);
    while (true) {
      const response = await this.mtproto.call('upload.getFile', {
        location: inputLocation,
        offset,
        limit: 1048576, // 1MB
      });
      buffer = Buffer.concat([buffer, response.bytes]);
      offset += response.bytes.length;
      if (response.bytes.length < 1048576) break;
    }
    fs.writeFileSync(filePath, buffer);
  }

  async extractDataFromMessage(channelUsername, messageId) {
    this.emit({ channelUsername, messageId });
    const resolveResult = await this.mtproto.call('contacts.resolveUsername', { username: channelUsername });

    const { chats } = resolveResult;
    const targetChat = chats.find((x) => x.username === channelUsername);

    if (!targetChat) throw new Error(`Не найден chat с username: ${channelUsername}`);

    const { id: channel_id, access_hash } = targetChat;
    this.emit('channel data: ', { channel_id, access_hash, messageId });

    const messagesResult = await this.mtproto.call('messages.getHistory', {
      peer: {
        _: 'inputPeerChannel',
        channel_id,
        access_hash,
      },
      offset_id: messageId + 1,
      limit: 1,
    });

    if (messagesResult.messages.length === 0) throw new Error(`Не найдено сообщение с id: ${messageId}`);

    const message = messagesResult.messages[0];

    const responseFile = path.resolve('downloads', 'main-message.json');
    console.log(responseFile);
    fs.writeFileSync(responseFile, JSON.stringify(message, undefined, 2));

    const { grouped_id } = message;

    let allMessages = [message];

    if (grouped_id) {
      this.emit('Это группа сообщений');
      const history = await this.mtproto.call('messages.getHistory', {
        peer: {
          _: 'inputPeerChannel',
          channel_id,
          access_hash,
        },
        offset_id: messageId + 10,
        limit: 20,
      });

      this.emit('Запрошено', history.messages.length);
      const rrr = path.resolve('downloads', 'grouped.json');
      fs.writeFileSync(rrr, JSON.stringify(history.messages, undefined, 2));
      allMessages = history.messages.filter((x) => x.grouped_id === grouped_id);
      this.emit('Найдено сообщений в группе: ', allMessages.length);
    }

    let messageText = '';

    const m0 = allMessages.find((x) => Boolean(x.message));
    if (m0) {
      messageText = m0.message;
      this.emit(`Message ID: ${m0.id}, Content: ${`${m0.message.slice(0, 25)}...`}`);
    }

    // eslint-disable-next-line no-restricted-syntax
    const sources = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const x of allMessages) {
      const source = await this.extractFiles(x);
      if (source) sources.unshift(source);
    }

    return { message: messageText, sources };
  }

  async extractFiles(message) {
    // this.emit('m', message.id, `${message.message.slice(0, 25)}...`);
    if (message.media && message.media._ === 'messageMediaPhoto') {
      const { photo } = message.media;
      const inputLocation = {
        _: 'inputPhotoFileLocation',
        id: photo.id,
        access_hash: photo.access_hash,
        file_reference: photo.file_reference,
        thumb_size: 'y',
      };

      const photoPath = path.join('downloads', `${message.id}_photo.jpg`);
      await this.downloadFile(inputLocation, photoPath);

      return { type: 'photo', media: { source: photoPath }, caption: '' };
    }

    if (message.media && message.media._ === 'messageMediaDocument' && message.media.document.mime_type.startsWith('video/')) {
      const { document } = message.media;
      const documentInputLocation = {
        _: 'inputDocumentFileLocation',
        id: document.id,
        access_hash: document.access_hash,
        file_reference: document.file_reference,
      };

      const documentExtension = path.extname(document.attributes.find((attr) => attr._ === 'documentAttributeFilename').file_name);
      const videoPath = path.join('downloads', `${message.id}_video${documentExtension}`);
      await this.downloadFile(documentInputLocation, videoPath);

      return { type: 'video', media: { source: videoPath }, caption: '' };
    }

    return null;
  }
}

module.exports = TelegramClient;
