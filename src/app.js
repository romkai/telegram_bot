const TelegramClient = require('./telegram-client');

function log(...params) {
  console.log(...params);
}

async function main() {
  const client = new TelegramClient(log);
  // https://t.me/bestrest_tour/11426
  const { message, sources } = await client.extractDataFromMessage('bestrest_tour', 11426);
  console.log('RES', message);
  console.log('RES', sources);
}

main();
