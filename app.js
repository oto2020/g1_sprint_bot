
// app.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const GoogleHelper = require('./GoogleHelper');
const TelegramHelper = require('./TelegramHelper');
const fs = require('fs');
const path = require('path');
const USERS_FILE_PATH = path.join(__dirname, 'users.json');
function loadUsersFromFile() {
    if (fs.existsSync(USERS_FILE_PATH)) {
        try {
            const data = fs.readFileSync(USERS_FILE_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            console.error('Ошибка чтения users.json:', err);
            return {};
        }
    }
    return {};
}

function saveUsersToFile(users) {
    try {
        fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2), 'utf-8');
    } catch (err) {
        console.error('Ошибка записи в users.json:', err);
    }
}

function getFormattedTimestamp() {
    const now = new Date();

    const pad = (n) => String(n).padStart(2, '0');

    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());

    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

const token = process.env.TELEGRAM_TOKEN;
const spreadsheetId = process.env.SPREADSHEET_ID;
const referenceBookGid = Number(process.env.REFERENCE_BOOK_GID);

const bot = new TelegramBot(token, { polling: true });

let users = loadUsersFromFile();    // id: chatId
const tasks = {};                // id: chatId@messageId


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

    let { sources, priorities, statuses } = await GoogleHelper.getSourcesPrioritiesStatusesFromColumns(referenceBookGid);
    console.log(sources, priorities, statuses);
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

        switch (buttonAction) {
            // была нажата кнопка создания задачи
            case 'create':
                // актуализируем спринты для понимания предыдущего, текущего и следующего
                lastSprintObjTitleAndGid = sheets.find(s => new RegExp(`спринт ${GoogleHelper.getLastSprintNumber()} `).test(s.title));
                currentSprintObjTitleAndGid = sheets.find(s => new RegExp(`спринт ${GoogleHelper.getCurrentSprintNumber()} `).test(s.title));
                nextSprintObjTitleAndGid = sheets.find(s => new RegExp(`спринт ${GoogleHelper.getNextSprintNumber()} `).test(s.title));

                // определяем в текущий или в следующий спринт
                let sprintObj = param1 == 'toCurrent' ? currentSprintObjTitleAndGid : nextSprintObjTitleAndGid;

                // находим первую попавшуюся свободную строку
                let firstEmptyRow = await GoogleHelper.findFirstEmptyRow(sprintObj.gid, 'C:E');

                // делаем запись в строку
                let id = `${getFormattedTimestamp()}_${chatId}_${messageId}`;
                let isCompleted = false;
                let taskText = tasks[`${chatId}@${messageId}`]; // Достаем из кеша текст сообщения (задачи)
                let responsibleName = users[chatId].department;
                let sourceName = "Вне плана";
                let priority = "⏳";
                let linkB24 = "";
                let comment = "";
                let status = "Требует внимания ⚠️";

                // записываем строку целиком
                let row = [id, isCompleted, taskText, responsibleName, sourceName, priority, linkB24, comment, status];
                GoogleHelper.writeToRange(sprintObj.gid, `A${firstEmptyRow}:I${firstEmptyRow}`, [row]);

                // Информируем, что задача поставлена
                await TelegramHelper.editMessageText(
                    bot,
                    chatId,
                    messageId,
                    `✅ Задача поставлена:\n\n` +
                    `<b>${taskText}</b>\n\n` +
                    `<a href="https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sprintObj.gid}&range=B${firstEmptyRow}">${sprintObj.title}, строка ${firstEmptyRow}</a>\n\n` +
                    `<i>Используйте клавиатуру, чтобы изменить:\n` +
                    `Исполнителя / Источник,\n` +
                    `Срочность / Статус задачи</i>`,
                    'HTML',
                    true
                );

                const keyboardForCreatedTask = {
                    inline_keyboard: [
                        [
                            { text: `${responsibleName}`, callback_data: `change_resp@${chatId}@${messageId}` },
                            { text: `${sourceName}`, callback_data: `change_src@${chatId}@${messageId}` },
                        ],
                        [
                            { text: `${priority}`, callback_data: `change_priority@${chatId}@${messageId}` },
                            { text: `${status}`, callback_data: `change_status@${chatId}@${messageId}` },
                        ],
                        [
                            { text: '❌ Удалить задачу', callback_data: `delete@${chatId}@${messageId}@${sprintObj.gid}` },
                        ]
                    ]
                };

                await TelegramHelper.updateTaskButtons(bot, chatId, messageId, keyboardForCreatedTask);
                break;

            case 'edit':
                await bot.sendMessage(chatId, `Редактирование задачи ${chatId}@${messageId}\nTODO: реализовать редактирование задачи`);
                break;

            case 'cancel':
                await bot.deleteMessage(chatId, messageId);
                break;

            // Была нажата кнопка удаления задачи
            case 'delete':
                let gid = param1;
                let idSubstring = `_${chatId}_${messageId}`;
                let task = await GoogleHelper.deleteRowBySubstringInA(gid, idSubstring);
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
                break;
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
        if (!users[chatId]) {
            return bot.sendMessage(chatId, 'Пожалуйста, поделись своим номером через /start');
        }
        // console.table(users);

        // Отправим сообщение и сохраним в кеш
        let taskText = msg.text;
        let newMsg = await bot.sendMessage(chatId, `🧐 Постановка задачи:\n${msg.text}`);
        let messageId = newMsg.message_id;
        tasks[`${chatId}@${messageId}`] = taskText;

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

        await TelegramHelper.updateTaskButtons(bot, chatId, messageId, keyboard)
    });


    // КОМАНДА /START
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;

        // если пользователь уже известен
        if (users[chatId]) {
            console.log(`Пользователь запустил бота и он уже известен: `);
            console.log(users[chatId]);
            bot.sendMessage(chatId,
                `👋 Привет!\n\nТы из подразделения: <b>${users[chatId].department}</b>\n` +
                `📞 Номер: <b>${users[chatId].number}</b>\n` +
                `📧 Email: <b>${users[chatId].email || 'не указан'}</b>\n\n` +
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
                users[chatId] = {
                    department, number, email, chatId
                }
                console.log(`Сохранили пользователя: `);
                console.log(users[chatId]);
                saveUsersToFile(users);


            } else {
                bot.sendMessage(chatId, '😕 Не удалось найти тебя в списке. Обратись к @igo4ek');
            }

        } catch (error) {
            console.error('Ошибка при обработке контакта:', error);
            bot.sendMessage(chatId, '🚨 Произошла ошибка при проверке номера. Попробуй позже.');
        }
    });



})();
