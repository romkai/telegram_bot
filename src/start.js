require('dotenv').config();
const MTProto = require('@mtproto/core');
const path = require('path');
const fs = require('fs');
const prompts = require('prompts');

const api_id = Number(process.env.API_ID);
const api_hash = process.env.API_HASH;
const session_path = path.join(__dirname, './config/session.json');

console.log({ api_id, api_hash, session_path })

const mtproto = new MTProto({
    api_id,
    api_hash,
    storageOptions: {
        path: session_path,
    },
});

const inputPhoneNumber = async () => {
    const response = await prompts({
        type: 'text',
        name: 'phone_number',
        message: 'Please enter your phone number:',
    });

    return response.phone_number;
};

const inputCode = async () => {
    const response = await prompts({
        type: 'text',
        name: 'code',
        message: 'Please enter the code you received:',
    });

    return response.code;
};

const inputPassword = async () => {
    const response = await prompts({
        type: 'password',
        name: 'password',
        message: 'Please enter your password:',
    });

    return response.password;
};

const login = async () => {
    const phone_number = await inputPhoneNumber();

    try {
        const { phone_code_hash } = await mtproto.call('auth.sendCode', {
            phone_number,
            settings: {
                _: 'codeSettings',
            },
        });

        const phone_code = await inputCode();

        try {
            await mtproto.call('auth.signIn', {
                phone_number,
                phone_code_hash,
                phone_code,
            });
        } catch (error) {
            if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
                const password = await inputPassword();

                const { srp_id, current_algo, srp_B } = await mtproto.call('account.getPassword');

                const { g, p, salt1, salt2 } = current_algo;

                const { A, M1 } = await mtproto.crypto.getSRPParams({
                    g,
                    p,
                    salt1,
                    salt2,
                    gB: srp_B,
                    password,
                });

                await mtproto.call('auth.checkPassword', {
                    password: {
                        _: 'inputCheckPasswordSRP',
                        srp_id,
                        A,
                        M1,
                    },
                });
            } else {
                throw error;
            }
        }

        console.log('Logged in successfully');
    } catch (error) {
        console.error('Error during login:', error);
    }
};

const downloadFile = async (inputLocation, filePath) => {
    let offset = 0;
    let buffer = Buffer.alloc(0);
    while (true) {
        const response = await mtproto.call('upload.getFile', {
            location: inputLocation,
            offset,
            limit: 1048576, // 1MB
        });
        buffer = Buffer.concat([buffer, response.bytes]);
        offset += response.bytes.length;
        if (response.bytes.length < 1048576) break;
    }
    fs.writeFileSync(filePath, buffer);
    console.log(`File saved to ${filePath}`);
};

const getMessage = async (channelUsername, messageId) => {
    console.log({ channelUsername, messageId })
    try {
        const resolveResult = await mtproto.call('contacts.resolveUsername', {
            username: channelUsername,
        });

        console.log('resolveResult:', resolveResult); // Добавлено для отладки

        const { peer } = resolveResult;
        const { chats } = resolveResult;
        const targetChat = chats.find(x => x.username === channelUsername)
        if (!targetChat) throw new Error('Не найден chat с username: '+channelUsername)

        const { id: channel_id, access_hash } = targetChat;

        console.log({ channel_id, access_hash, messageId })

        const messagesResult = await mtproto.call('messages.getHistory', {
            peer: {
                _: 'inputPeerChannel',
                channel_id,
                access_hash,
            },
            // add_offset: messageId - 1,
            offset_id: messageId + 1,
            limit: 1,
        });

        // console.log(messagesResult)

        const message = messagesResult.messages[0];
        console.log(`Message ID: ${message.id}, Content: ${message.message}`);

        fs.writeFileSync('./response.json', JSON.stringify(message, undefined, 2));

        if (message.media && message.media._ === 'messageMediaPhoto') {
            const photo = message.media.photo;
            const inputLocation = {
                _: 'inputPhotoFileLocation',
                id: photo.id,
                access_hash: photo.access_hash,
                file_reference: photo.file_reference,
                thumb_size: 'y'
            };

            await downloadFile(inputLocation, path.join(__dirname, 'downloads', `${message.id}_photo.jpg`));
        } else if (message.grouped_id) {
            // Обработка сообщений, содержащих несколько фото и видео (альбом)
            const albumMessagesResult = await mtproto.call('messages.getHistory', {
                peer: {
                    _: 'inputPeerChannel',
                    channel_id,
                    access_hash,
                },
                min_id: messageId - 9, // смотрим до 10 сообщений назад
                max_id: messageId + 9, // смотрим до 10 сообщений вперед
                limit: 20,
            });

            const albumMessages = albumMessagesResult.messages.filter(m => m.grouped_id && m.grouped_id === message.grouped_id);

            for (const albumMessage of albumMessages) {
                if (albumMessage.media && albumMessage.media._ === 'messageMediaPhoto') {
                    const photo = albumMessage.media.photo;
                    const inputLocation = {
                        _: 'inputPhotoFileLocation',
                        id: photo.id,
                        access_hash: photo.access_hash,
                        file_reference: photo.file_reference,
                        thumb_size: 'y'
                    };

                    await downloadFile(inputLocation, path.join(__dirname, 'downloads', `${albumMessage.id}_photo.jpg`));
                } else if (albumMessage.media && albumMessage.media._ === 'messageMediaDocument' && albumMessage.media.document.mime_type.startsWith('video/')) {
                    const document = albumMessage.media.document;
                    const documentInputLocation = {
                        _: 'inputDocumentFileLocation',
                        id: document.id,
                        access_hash: document.access_hash,
                        file_reference: document.file_reference,
                    };

                    const documentExtension = path.extname(document.attributes.find(attr => attr._ === 'documentAttributeFilename').file_name);
                    await downloadFile(documentInputLocation, path.join(__dirname, 'downloads', `${albumMessage.id}_video${documentExtension}`));
                }
            }
        }

        // if (message.media) {
        //     console.log('MEDIA', message.media)
        //
        //     switch (message.media._) {
        //         case 'messageMediaPhoto':
        //             const photo = message.media.photo;
        //             const photoSize = photo.sizes[photo.sizes.length - 1];
        //             console.log('last photo size', photoSize)
        //             const photoLocation = photoSize.location;
        //
        //             const photoInputLocation = {
        //                 _: 'inputFileLocation',
        //                 volume_id: photoLocation.volume_id,
        //                 local_id: photoLocation.local_id,
        //                 secret: photoLocation.secret,
        //             };
        //
        //             await downloadFile(photoInputLocation, path.join(__dirname, 'downloads', `${message.id}_photo.jpg`));
        //             break;
        //
        //         case 'messageMediaVideo':
        //             const video = message.media.document;
        //             const videoInputLocation = {
        //                 _: 'inputDocumentFileLocation',
        //                 id: video.id,
        //                 access_hash: video.access_hash,
        //                 file_reference: video.file_reference,
        //             };
        //
        //             await downloadFile(videoInputLocation, path.join(__dirname, 'downloads', `${message.id}_video.mp4`));
        //             break;
        //
        //         case 'messageMediaDocument':
        //             const document = message.media.document;
        //             const documentInputLocation = {
        //                 _: 'inputDocumentFileLocation',
        //                 id: document.id,
        //                 access_hash: document.access_hash,
        //                 file_reference: document.file_reference,
        //             };
        //
        //             const documentExtension = path.extname(document.attributes[0].file_name);
        //             await downloadFile(documentInputLocation, path.join(__dirname, 'downloads', `${message.id}_document${documentExtension}`));
        //             break;
        //
        //         case 'messageMediaGeo':
        //             console.log(`Geo location: lat=${message.media.geo.lat}, long=${message.media.geo.long}`);
        //             break;
        //
        //         case 'messageMediaContact':
        //             const contact = message.media;
        //             console.log(`Contact: ${contact.first_name} ${contact.last_name}, Phone: ${contact.phone_number}`);
        //             break;
        //
        //         case 'messageMediaUnsupported':
        //             console.log('Unsupported media type.');
        //             break;
        //
        //         case 'messageMediaVenue':
        //             const venue = message.media.venue;
        //             console.log(`Venue: ${venue.title}, Address: ${venue.address}, Lat: ${venue.geo.lat}, Long: ${venue.geo.long}`);
        //             break;
        //
        //         case 'messageMediaGame':
        //             const game = message.media.game;
        //             console.log(`Game: ${game.title}, Description: ${game.description}`);
        //             break;
        //
        //         case 'messageMediaInvoice':
        //             const invoice = message.media.invoice;
        //             console.log(`Invoice: ${invoice.title}, Total Amount: ${invoice.total_amount}`);
        //             break;
        //
        //         case 'messageMediaPoll':
        //             const poll = message.media.poll;
        //             console.log(`Poll: ${poll.question}, Options: ${poll.answers.map(a => a.text).join(', ')}`);
        //             break;
        //
        //         case 'messageMediaWebPage':
        //             const webPage = message.media.webpage;
        //             console.log(`Web Page: ${webPage.title}, URL: ${webPage.url}`);
        //             break;
        //
        //         case 'messageMediaDice':
        //             const dice = message.media.dice;
        //             console.log(`Dice value: ${dice.value}`);
        //             break;
        //
        //         default:
        //             console.log('Unknown media type.');
        //     }
        // }
    } catch (error) {
        console.error('Error fetching message:', error);
    }
};

const main = async () => {
    const channelUsername = 'bestrest_tour';
    const messageId = 11438; // ID сообщения, которое нужно прочитать
// https://t.me/bestrest_tour/11438?single
    if (!fs.existsSync(session_path)) {
        await login();
    }

    await getMessage(channelUsername, messageId);
};

main();
