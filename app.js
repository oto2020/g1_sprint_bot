require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const GoogleHelper = require('./GoogleHelper');

const token = process.env.TELEGRAM_TOKEN;
const spreadsheetId = process.env.SPREADSHEET_ID;
const referenceBookGid = Number(process.env.REFERENCE_BOOK_GID);

const bot = new TelegramBot(token, { polling: true });

const users = {};

(async () => {
    // Обязательно инициализируем Google API перед обработкой команд
    await GoogleHelper.init(spreadsheetId);

    let sheets = await GoogleHelper.getAllSheetNamesAndGids();
    console.log('📄 Список листов в таблице:');
    console.table(sheets);

    let lastSprintNumber = GoogleHelper.getLastSprintNumber();
    let currentSprintNumber = GoogleHelper.getCurrentSprintNumber();
    let nextSprintNumber = GoogleHelper.getNextSprintNumber();
    console.log('Прошлый спринт:', lastSprintNumber);
    console.log('Текущий спринт:', currentSprintNumber);
    console.log('Следующий спринт:', nextSprintNumber);

    const lastSprintGid = sheets.find(s => new RegExp(`спринт ${lastSprintNumber} `).test(s.title));
    const currentSprintGid = sheets.find(s => new RegExp(`спринт ${currentSprintNumber} `).test(s.title));
    const nextSprintGid = sheets.find(s => new RegExp(`спринт ${nextSprintNumber} `).test(s.title));

    console.log('Прошлый спринт:', lastSprintGid);
    console.log('Текущий спринт:', currentSprintGid);
    console.log('Следующий спринт:', nextSprintGid);

    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;

        const keyboard = {
            reply_markup: {
                one_time_keyboard: true,
                keyboard: [[{
                    text: 'Поделиться номером',
                    request_contact: true
                }]]
            }
        };

        // если пользователь уже известен
        if (users[chatId]) {
            console.log(`Пользователь запустил бота и он уже известен: `);
            console.log(users[chatId]);
            bot.sendMessage(chatId,
                `👋 Привет!\n\nТы из подразделения: <b>${users[chatId].department}</b>\n` +
                `📞 Номер: <b>${users[chatId].number}</b>\n` + 
                `📧 Email: <b>${users[chatId].email || 'не указан'}</b>\n` + 
                `Чтобы актуализировать данные из гугл-таблицы поделитесь контактом в клавиатуре бота`,
                { parse_mode: 'HTML' }
            );
        }

        bot.sendMessage(chatId, 'Привет! Чтобы тебя узнать, поделись номером телефона.', keyboard);
    });

    bot.on('contact', async (msg) => {
        const phone = msg.contact.phone_number.replace(/\D/g, '');
        const chatId = msg.chat.id;

        // если пользователь уже известен
        if (users[chatId]) {
            console.log(`Пользователь поделился контактом, но он уже известен: `);
            console.log(users[chatId]);
        }

        try {
            const sheetName = await GoogleHelper.getSheetNameByGid(referenceBookGid);
            if (!sheetName) throw new Error('Лист с заданным GID не найден');

            const res = await GoogleHelper.gsapi.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A2:C`
            });

            const rows = res.data.values || [];
            const match = rows.find(row => row[1]?.replace(/\D/g, '') === phone);

            if (match) {
                const [department, number, email] = match;
                bot.sendMessage(chatId,
                    `👋 Привет!\n\nТы из подразделения: <b>${department}</b>\n📞 Номер: <b>${number}</b>\n📧 Email: <b>${email || 'не указан'}</b>`,
                    { parse_mode: 'HTML' }
                );

                // пользователь найден, запоминаем его
                users[chatId] = {
                    department, number, email
                }
                console.log(`Сохранили пользователя: `);
                console.log(users[chatId]);

            } else {
                bot.sendMessage(chatId, '😕 Не удалось найти тебя в списке.');
            }

        } catch (error) {
            console.error('Ошибка при обработке контакта:', error);
            bot.sendMessage(chatId, '🚨 Произошла ошибка при проверке номера. Попробуй позже.');
        }
    });
})();
