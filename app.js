require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const GoogleHelper = require('./GoogleHelper');

const token = process.env.TELEGRAM_TOKEN;
const spreadsheetId = process.env.SPREADSHEET_ID;
const referenceBookGid = Number(process.env.REFERENCE_BOOK_GID);

// Создание бота
const bot = new TelegramBot(token, { polling: true });

(async () => {
  await GoogleHelper.init(spreadsheetId);

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // Пытаемся получить номер телефона (если пользователь не делал /share)
    const keyboard = {
      reply_markup: {
        one_time_keyboard: true,
        keyboard: [[{
          text: 'Поделиться номером',
          request_contact: true
        }]]
      }
    };
    bot.sendMessage(chatId, 'Привет! Чтобы тебя узнать, поделись номером телефона.', keyboard);
  });

  bot.on('contact', async (msg) => {
    const phone = msg.contact.phone_number.replace('+', '').replace(/\D/g, '');
    const chatId = msg.chat.id;

    try {
      const sheetName = await GoogleHelper.getSheetNameByGid(referenceBookGid);
      const res = await GoogleHelper.gsapi.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A2:C`
      });

      const rows = res.data.values;
      const match = rows.find(row => row[1]?.replace(/\D/g, '') === phone);

      if (match) {
        const [department, number, email] = match;
        bot.sendMessage(chatId, `👋 Привет!\n\nТы из подразделения: <b>${department}</b>\n📞 Номер: <b>${number}</b>\n📧 Email: <b>${email || 'не указан'}</b>`, {
          parse_mode: 'HTML'
        });
      } else {
        bot.sendMessage(chatId, '😕 Не удалось найти тебя в списке.');
      }
    } catch (error) {
      console.error(error);
      bot.sendMessage(chatId, 'Произошла ошибка при проверке номера. Попробуй позже.');
    }
  });
})();
