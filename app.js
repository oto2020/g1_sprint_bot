
// app.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const GoogleHelper = require('./GoogleHelper');
const TelegramHelper = require('./TelegramHelper');
const BotController = require('./BotController');
const StorageController = require('./StorageController');


const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const REFERENCE_BOOK_GID = Number(process.env.REFERENCE_BOOK_GID);

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
TelegramHelper.init(bot); // теперь бот доступен из TelegramHelper.bot


(async () => {
    // // Обязательно инициализируем Google API перед обработкой команд
    await GoogleHelper.init(SPREADSHEET_ID);

    // Просто так получаем список листов в таблице
    let sheets = await GoogleHelper.getAllSheetNamesAndGids();
    console.log('📄 Список листов в таблице:');
    console.table(sheets);

    // Заливаем список кнопок с отв./ист./приор./статусами в StorageController
    let tmp = await GoogleHelper.getSourcesPrioritiesStatusesFromColumns(REFERENCE_BOOK_GID);
    StorageController.responsibles = tmp.responsibles;
    StorageController.sources = tmp.sources;
    StorageController.priorities = tmp.priorities;
    StorageController.statuses = tmp.statuses;

    console.log(' ///// БОТ ГОТОВ К РАБОТЕ /////// ');

    // // Заглушка !!!! УБРАТЬ И РАСКОММЕНТИРОВАТЬ ВЕРХНИЕ СТРОКИ
    // users[301334882] = {
    //     department: 'ИТ🤖',
    //     number: '79785667199',
    //     email: 'wawka2002@gmail.com',
    //     chatId: '301334882',
    // }

    bot.on('callback_query', async (query) => {
        const [action] = query.data.split('@');
        await bot.answerCallbackQuery(query.id);

        if (action === 'createTask') {
            // создание задачи в этот или следующий спринт
            await BotController.createTask(query);
        }

        if (action === 'cancelCreation') {
            // отмена создания задачи, удаление сообщения
            await BotController.cancelCreation(query);
        }

        if (action === 'showResp') {
            // показать клавиатуру с выбором ответственных
            await BotController.showResp(query);
        }

        if (action === 'showTask') {
            // показать задачу с клавиатурой с отв./исп./приор./статусом
            await BotController.showTask(query);
        }

        if (action === 'deleteTask') {
            // удалить задачу
            await BotController.deleteTask(query);
        }
    });


    // ПОЛЬЗОВАТЕЛЬ ПРИСЛАЛ СООБЩЕНИЕ ТЕСТОМ - ПРЕДЛАГАЕТСЯ ПОСТАВИТЬ ЗАДАЧУ
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        // console.log(`БЫЛО СООБЩЕНИЕ`);
        // console.log(msg);
        // 1. Пропускаем сообщения от самого бота
        if (msg.from?.is_bot) return;

        // 2. Пропускаем команды
        if (msg.text?.startsWith('/')) return;

        // 3. Пропускаем сообщения-контакты (обрабатываются отдельно)
        if (msg.contact) return;

        // ✅ Обработка обычного пользовательского ввода
        if (!StorageController.users[chatId]) {
            return bot.sendMessage(chatId, 'Пожалуйста, поделись своим номером через /start');
        }
        // console.table(users);

        // Отправим сообщение и сохраним в кеш
        let taskText = msg.text;
        let newMsg = await bot.sendMessage(chatId, `🧐 Постановка задачи:\n${msg.text}`);
        let messageId = newMsg.message_id;
        StorageController.tasks[`${chatId}@${messageId}`] = taskText;

        // опции с клавиатурой
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎯 В этот спринт', callback_data: `createTask@${chatId}@${messageId}@toCurrent` },
                    { text: '↩️ В следующий спринт', callback_data: `createTask@${chatId}@${messageId}@toNext` },
                ],
                [
                    { text: '✖️ Отмена', callback_data: `cancelCreation@${chatId}@${messageId}` }
                ]]
        };

        await TelegramHelper.updateTaskButtons(chatId, messageId, keyboard)
    });


    // КОМАНДА /START
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;

        // если пользователь уже известен
        if (StorageController.users[chatId]) {
            console.log(`Пользователь запустил бота и он уже известен: `);
            console.log(StorageController.users[chatId]);
            bot.sendMessage(chatId,
                `👋 Привет!\n\nТы из подразделения: <b>${StorageController.users[chatId].department}</b>\n` +
                `📞 Номер: <b>${StorageController.users[chatId].number}</b>\n` +
                `📧 Email: <b>${StorageController.users[chatId].email || 'не указан'}</b>\n\n` +
                `Чтобы поставить задачу просто напиши её боту`,
                { parse_mode: 'HTML' }
            );
        }
        const keyboard = {
            reply_markup: {
                one_time_keyboard: true,
                keyboard: [[{
                    text: 'Нажми на меня 📞',
                    request_contact: true
                }]]
            }
        };
        bot.sendMessage(chatId, 'Чтобы актуализировать данные из гугл-таблицы нажмите 📞 в клавиатуре бота', keyboard);

    });

    // 
    bot.on('contact', async (msg) => {
        const phone = msg.contact.phone_number.replace(/\D/g, '');
        const chatId = msg.chat.id;

        // если пользователь уже известен
        if (StorageController.users[chatId]) {
            console.log(`Пользователь поделился контактом, но он уже известен: `);
            console.log(StorageController.users[chatId]);
        }

        try {
            const sheetName = await GoogleHelper.getSheetNameByGid(REFERENCE_BOOK_GID);
            if (!sheetName) throw new Error('Лист с заданным GID не найден');

            const res = await GoogleHelper.gsapi.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A2:C`
            });

            const rows = res.data.values || [];
            const index = rows.findIndex(row => row[1]?.replace(/\D/g, '') === phone);
            const match = index !== -1 ? { row: rows[index], index } : null;

            if (match) {
                const [department, number, email] = match.row;

                await GoogleHelper.writeToRange(REFERENCE_BOOK_GID, `D${index + 2}`, [[chatId]]);
                bot.sendMessage(chatId,
                    `👋 Привет!\n\nТы из подразделения: <b>${department}</b>\n📞 Номер: <b>${number}</b>\n📧 Email: <b>${email || 'не указан'}</b>\n\n` +
                    `Чтобы поставить задачу просто напиши её боту`,
                    { parse_mode: 'HTML' }
                );

                // пользователь найден, запоминаем его
                StorageController.users[chatId] = {
                    department, number, email, chatId
                }
                console.log(`Сохранили пользователя: `);
                console.log(StorageController.users[chatId]);
                StorageController.saveUsersToFile();


            } else {
                bot.sendMessage(chatId, '😕 Не удалось найти тебя в списке. Обратись к @igo4ek');
            }

        } catch (error) {
            // throw error;
            console.error('Ошибка при обработке контакта:', error);
            bot.sendMessage(chatId, '🚨 Произошла ошибка при проверке номера. Попробуй позже.');
        }
    });



})();
