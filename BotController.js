// BotController.js
const MainHelper = require('./MainHelper');
const StorageController = require('./StorageController');

class BotController {

  /**
   * создает задачу
   */
  static async createTask(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');

      // актуализируем спринты для понимания предыдущего, текущего и следующего
      let sheets = await MainHelper.getAllSheetNamesAndGids();
      let sprintObj = (param1 === 'toCurrent') ?
        sheets.find(s => new RegExp(`спринт ${MainHelper.getCurrentSprintNumber()} `).test(s.title)) :
        sheets.find(s => new RegExp(`спринт ${MainHelper.getNextSprintNumber()} `).test(s.title));

      // находим первую попавшуюся свободную строку
      let firstEmptyRow = await MainHelper.findFirstEmptyRow(sprintObj.gid, 'C:C');

      // Формируем строку с датой-временем
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const year = now.getFullYear();
      const month = pad(now.getMonth() + 1);
      const day = pad(now.getDate());
      const hours = pad(now.getHours());
      const minutes = pad(now.getMinutes());
      const seconds = pad(now.getSeconds());
      let formattedTimeStamp = `${day}.${month} ${hours}:${minutes}`;

      // делаем запись в строку: определяем поля строки
      let taskId = `${formattedTimeStamp} ${messageId}`;
      let isCompleted = false;
      let taskText = StorageController.tasks[`${chatId}@${messageId}`]; // Достаем из кеша текст сообщения (задачи)
      let responsibleName = StorageController.users[chatId].department;
      let sourceName = "Вне плана";
      let priority = "⏳";
      let linkB24 = "";
      let comment = "";
      let status = "Требует внимания ⚠️";
      // делаем запись в строку: формируем массив для строки
      let row = [taskId, isCompleted, taskText, responsibleName, sourceName, priority, linkB24, comment, status];
      MainHelper.writeToRange(sprintObj.gid, `A${firstEmptyRow}:I${firstEmptyRow}`, [row]);

      // Информируем, что задача поставлена
      let newMessage = `✅ Задача поставлена:\n\n` +
        `<b>${taskText}</b>\n\n` +
        `<a href="https://docs.google.com/spreadsheets/d/${MainHelper.S_ID}/edit#gid=${sprintObj.gid}&range=B${firstEmptyRow}">${sprintObj.title}, строка ${firstEmptyRow}</a>\n\n` +
        `<i>Используйте клавиатуру, чтобы изменить:\n` +
        `Исполнителя / Источник,\n` +
        `Срочность / Статус задачи</i>`;
      await MainHelper.editMessageText(chatId, messageId, newMessage);

      const keyboardForCreatedTask = {
        inline_keyboard: [
          [
            { text: `${responsibleName}`, callback_data: `showBtns@${chatId}@${messageId}@${sprintObj.gid}@${taskId}@resp` },
            { text: `${sourceName}`, callback_data: `showBtns@${chatId}@${messageId}@${sprintObj.gid}@${taskId}@src` },
          ],
          [
            { text: `${priority}`, callback_data: `showBtns@${chatId}@${messageId}@${sprintObj.gid}@${taskId}@priority` },
            { text: `${status}`, callback_data: `showBtns@${chatId}@${messageId}@${sprintObj.gid}@${taskId}@status` },
          ],
          [
            { text: '❌ Удалить задачу', callback_data: `deleteTask@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
          ]
        ]
      };

      await MainHelper.updateTaskButtons(chatId, messageId, keyboardForCreatedTask);

    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении createTask ⚠️\n`, err.message);
      // throw err;
    }
  }

  // Выдает задачу и кнопки с ответственными
  static async showBtns(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');

      let gid = param1;
      let taskId = param2;
      let buttonsCategory = param3; // resp, src, priority, status

      // Получаем задачу по id
      let task = await MainHelper.getTaskById(gid, taskId);

      // Информируем, о том, что мы выбираем нового исполнителя задачи
      let aHref = await MainHelper.generateTaskLink(gid, taskId);
      let newMessage = `✍️ Выбор источника (постановщика) задачи:\n\n` +
        `<b>${task.name}</b>\n\n` +
        `${aHref}\n\n` +
        `<i>Используйте клавиатуру, чтобы изменить:\n` +
        `Исполнителя</i>`;
      await MainHelper.editMessageText(chatId, messageId, newMessage);

      let buttonsInRow = 4; // Количество кнопок в одном ряду
      // Формируем кнопки по заданному числу в ряд
      let keyboard = [];

      let buttons;
      if (buttonsCategory == 'resp') buttons = StorageController.responsibles;
      if (buttonsCategory == 'src') buttons = StorageController.sources;
      if (buttonsCategory == 'priority') buttons = StorageController.priorities;
      if (buttonsCategory == 'status') buttons = StorageController.statuses;
      
      for (let i = 0; i < buttons.length; i += buttonsInRow) {
        let row = buttons.slice(i, i + buttonsInRow).map((button, buttonIndex) => {
          return {
            text: button,
            callback_data: `change@${chatId}@${messageId}@${gid}@${taskId}@${buttonIndex}`
          };
        });
        keyboard.push(row);
      }

      // Добавляем последнюю строку с кнопкой "Назад" // this значит будет перерисовано это сообщение, а не будет выслано новое
      keyboard.push([
        {
          text: 'Назад',
          callback_data: `showTask@${chatId}@${messageId}@${gid}@${taskId}@thisMsg`
        }
      ]);

      console.log(keyboard);
      await MainHelper.updateTaskButtons(chatId, messageId, {
        inline_keyboard: keyboard
      });

    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении showSrc ⚠️\n`, err.message);
      // throw err;
    }
  }


  static async deleteTask(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');

      let gid = param1;
      let taskId = param2;
      let task = await MainHelper.deleteRowBySubstringInA(gid, taskId);
      await MainHelper.bot.deleteMessage(chatId, messageId);
      await MainHelper.bot.sendMessage(
        chatId,
        `❌ Задача удалена:\n\n` +
        `<b>${task.name}</b>\n\n` +
        `Ответственный: ${task.responsible}\n` +
        `Источник: ${task.source}\n` +
        `Приоритет: ${task.priority}\n` +
        `Комментарий: ${task.comment}\n` +
        `Статус: ${task.status}\n\n` +
        `${task.sheetName}`,
        { parse_mode: 'HTML' });

    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении deleteTask ⚠️\n`, err.message);
      // throw err;
    }
  }


  static async showTask(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');



      let gid = param1;
      let taskId = param2;
      let isThisMessage = param3 === 'thisMsg';

      // Получаем задачу по id
      let task = await MainHelper.getTaskById(gid, taskId);

      // Информируем, о том, что мы выбираем нового исполнителя задачи
      let aHref = await MainHelper.generateTaskLink(gid, taskId);
      let newMessage = `👀 Задача:\n\n` +
        `<b>${task.name}</b>\n\n` +
        `${aHref}\n\n` +
        `<i>Используйте клавиатуру, чтобы изменить:\n` +
        `Исполнителя / Источник,\n` +
        `Срочность / Статус задачи</i>`;

      const keyboardForCreatedTask = {
        inline_keyboard: [
          [
            { text: `${task.responsible}`, callback_data: `showBtns@${chatId}@${messageId}@${gid}@${taskId}@resp` },
            { text: `${task.source}`, callback_data: `showBtns@${chatId}@${messageId}@${gid}@${taskId}@src` },
          ],
          [
            { text: `${task.priority}`, callback_data: `showBtns@${chatId}@${messageId}@${gid}@${taskId}@priority` },
            { text: `${task.status}`, callback_data: `showBtns@${chatId}@${messageId}@${gid}@${taskId}@status` },
          ],
          [
            { text: '❌ Удалить задачу', callback_data: `deleteTask@${chatId}@${messageId}@${gid}@${taskId}` },
          ]
        ]
      };

      // если нужно изменить текущее сообщение
      if (isThisMessage) {
        await MainHelper.editMessageText(chatId, messageId, newMessage);
        await MainHelper.updateTaskButtons(chatId, messageId, keyboardForCreatedTask);
      }


    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении showTask ⚠️\n`, err.message);
      // throw err;
    }
  }

  static async cancelCreation(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');
      await MainHelper.bot.deleteMessage(chatId, messageId);
    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении cancelCreation ⚠️\n`, err.message);
      // throw err;
    }
  }
  static async methodTemplate(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');

      // актуализируем спринты для понимания предыдущего, текущего и следующего
      let sheets = await MainHelper.getAllSheetNamesAndGids();

    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении НАПИСАТЬ НАЗВАНИЕ МЕТОДА !!! ⚠️\n`, err.message);
      // throw err;
    }
  }
};




module.exports = BotController;
