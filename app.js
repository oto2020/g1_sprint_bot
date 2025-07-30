
// app.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const GoogleHelper = require('./GoogleHelper');
const TelegramHelper = require('./TelegramHelper');
const BotController = require('./BotController');
const StorageController = require('./StorageController');


const token = process.env.TELEGRAM_TOKEN;
const spreadsheetId = process.env.SPREADSHEET_ID;
const referenceBookGid = Number(process.env.REFERENCE_BOOK_GID);

let responsibles, sources, priorities, statuses;    // из листа "Справочник"

const bot = new TelegramBot(token, { polling: true });
TelegramHelper.init(bot); // теперь бот доступен из TelegramHelper.bot

// Информация по спринтам 
let lastSprintObjTitleAndGid;
let currentSprintObjTitleAndGid; // {title: 'спринт 29 14.07-20.07', gid: 324521214}
let nextSprintObjTitleAndGid;

const keyboard = {
    reply_markup: {
        one_time_keyboard: true,
        keyboard: [[{
            text: 'Нажми на меня 📞',
            request_contact: true
        }]]
    }
};

(async () => {
    // // Обязательно инициализируем Google API перед обработкой команд
    await GoogleHelper.init(spreadsheetId);

    let sheets = await GoogleHelper.getAllSheetNamesAndGids();
    console.log('📄 Список листов в таблице:');
    console.table(sheets);

    // актуализируем спринты для понимания предыдущего, текущего и следующего
    lastSprintObjTitleAndGid = sheets.find(s => new RegExp(`спринт ${GoogleHelper.getLastSprintNumber()} `).test(s.title));
    currentSprintObjTitleAndGid = sheets.find(s => new RegExp(`спринт ${GoogleHelper.getCurrentSprintNumber()} `).test(s.title));
    nextSprintObjTitleAndGid = sheets.find(s => new RegExp(`спринт ${GoogleHelper.getNextSprintNumber()} `).test(s.title));

    console.log('Прошлый спринт:', lastSprintObjTitleAndGid);
    console.log('Текущий спринт:', currentSprintObjTitleAndGid);
    console.log('Следующий спринт:', nextSprintObjTitleAndGid);

    let tmp = await GoogleHelper.getSourcesPrioritiesStatusesFromColumns(referenceBookGid);

    responsibles = tmp.responsibles;
    sources = tmp.sources;
    priorities = tmp.priorities;
    statuses = tmp.statuses;
    console.log(responsibles);
    console.log(sources);
    console.log(priorities);
    console.log(statuses);

    console.log(' ///// БОТ ГОТОВ К РАБОТЕ /////// ');

    // // Заглушка !!!! УБРАТЬ И РАСКОММЕНТИРОВАТЬ ВЕРХНИЕ СТРОКИ
    // users[301334882] = {
    //     department: 'ИТ🤖',
    //     number: '79785667199',
    //     email: 'wawka2002@gmail.com',
    //     chatId: '301334882',
    // }

    bot.on('callback_query', async (query) => {
        const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');
        await bot.answerCallbackQuery(query.id);

        if (buttonAction === 'create') {
            await BotController.createTask(query);
        } else if (buttonAction === 'edit') {
            await bot.sendMessage(chatId, `Редактирование задачи ${chatId}@${messageId}\nTODO: реализовать редактирование задачи`);
        } else if (buttonAction === 'cancel') {
            await bot.deleteMessage(chatId, messageId);
        } else if (buttonAction === 'select_resp') {
            let gid = param1;
            let taskId = param2;

            // Информируем, о том, что мы выбираем нового исполнителя задачи
            let taskText = StorageController.tasks[`${chatId}@${messageId}`];
            let aHref = await GoogleHelper.generateTaskLink(gid, taskId);
            let newMessage = `✍️ Выбор нового исполнителя задачи:\n\n` +
                `<b>${taskText}</b>\n\n` +
                `${aHref}\n\n` +
                `<i>Используйте клавиатуру, чтобы изменить:\n` +
                `Исполнителя</i>`;
            await TelegramHelper.editMessageText(
                bot,
                chatId,
                messageId,
                newMessage,
                'HTML',
                true
            );

            let buttonsInRow = 4; // Количество кнопок в одном ряду
            // Формируем кнопки по заданному числу в ряд
            let keyboard = [];
            for (let i = 0; i < responsibles.length; i += buttonsInRow) {
                let row = responsibles.slice(i, i + buttonsInRow).map((resp, respIndex) => {
                    return {
                        text: resp,
                        callback_data: `change_resp@${chatId}@${messageId}@${gid}@${taskId}@${respIndex}`
                    };
                });
                keyboard.push(row);
            }

            // Добавляем последнюю строку с кнопкой "Назад"
            keyboard.push([
                {
                    text: 'Назад',
                    callback_data: `back_to_task@${chatId}@${messageId}@${gid}@${taskId}`
                }
            ]);

            console.log(keyboard);
            await TelegramHelper.updateTaskButtons(chatId, messageId, {
                inline_keyboard: keyboard
            });


        } 
        else if (buttonAction === 'back_to_task') {
            let gid = param1;
            let taskId = param2;
            // воспроизводим задачу
        }
        else if (buttonAction === 'delete') {
            let gid = param1;
            let taskId = param2;
            let task = await GoogleHelper.deleteRowBySubstringInA(gid, taskId);
            await bot.deleteMessage(chatId, messageId);
            await bot.sendMessage(
                chatId,
                `❌ Задача удалена:\n\n` +
                `<b>${task.C}</b>\n\n` +
                `Ответственный: ${task.D}\n` +
                `Источник: ${task.E}\n` +
                `Приоритет: ${task.F}\n` +
                `Комментарий: ${task.H}\n` +
                `Статус: ${task.I}\n\n` +
                `${task.sheetName}`,
                { parse_mode: 'HTML' });
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
                    { text: '🎯 В этот спринт', callback_data: `create@${chatId}@${messageId}@toCurrent` },
                    { text: '↩️ В следующий спринт', callback_data: `create@${chatId}@${messageId}@toNext` },
                ],
                [
                    { text: '✖️ Отмена', callback_data: `cancel@${chatId}@${messageId}` }
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
            const sheetName = await GoogleHelper.getSheetNameByGid(referenceBookGid);
            if (!sheetName) throw new Error('Лист с заданным GID не найден');

            const res = await GoogleHelper.gsapi.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A2:C`
            });

            const rows = res.data.values || [];
            const index = rows.findIndex(row => row[1]?.replace(/\D/g, '') === phone);
            const match = index !== -1 ? { row: rows[index], index } : null;

            if (match) {
                const [department, number, email] = match.row;

                await GoogleHelper.writeToRange(referenceBookGid, `D${index + 2}`, [[chatId]]);
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
            console.error('Ошибка при обработке контакта:', error);
            bot.sendMessage(chatId, '🚨 Произошла ошибка при проверке номера. Попробуй позже.');
        }
    });



})();
