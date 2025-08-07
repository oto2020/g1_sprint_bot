// BotController.js
const GoogleHelper = require('./GoogleHelper');
const TelegramHelper = require('./TelegramHelper');
const StorageController = require('./StorageController');

class BotController {

  /**
   * создает задачу
   */
  static async createTask(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');

      // актуализируем спринты для понимания предыдущего, текущего и следующего
      let sheets = await GoogleHelper.getAllSheetNamesAndGids();
      let sprintObj = (param1 === 'toCurrent') ?
        sheets.find(s => new RegExp(`спринт ${GoogleHelper.getCurrentSprintNumber()} `).test(s.title)) :
        sheets.find(s => new RegExp(`спринт ${GoogleHelper.getNextSprintNumber()} `).test(s.title));

      // находим первую попавшуюся свободную строку
      let firstEmptyRow = await GoogleHelper.findFirstEmptyRow(sprintObj.gid, 'C:C');

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
      GoogleHelper.writeToRange(sprintObj.gid, `A${firstEmptyRow}:I${firstEmptyRow}`, [row]);

      // Информируем, что задача поставлена
      let newMessage = `✅ Задача поставлена:\n\n` +
        `<b>${taskText}</b>\n\n` +
        `<a href="https://docs.google.com/spreadsheets/d/${GoogleHelper.S_ID}/edit#gid=${sprintObj.gid}&range=B${firstEmptyRow}">${sprintObj.title}, строка ${firstEmptyRow}</a>\n\n` +
        `<i>Используйте клавиатуру, чтобы изменить:\n` +
        `Исполнителя / Источник,\n` +
        `Срочность / Статус задачи</i>`;
      await TelegramHelper.editMessageText(chatId, messageId, newMessage);

      const keyboardForCreatedTask = {
        inline_keyboard: [
          [
            { text: `${responsibleName}`, callback_data: `showResp@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
            { text: `${sourceName}`, callback_data: `showSrc@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
          ],
          [
            { text: `${priority}`, callback_data: `showPriority@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
            { text: `${status}`, callback_data: `showStatus@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
          ],
          [
            { text: '❌ Удалить задачу', callback_data: `deleteTask@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
          ]
        ]
      };

      await TelegramHelper.updateTaskButtons(chatId, messageId, keyboardForCreatedTask);

    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении createTask ⚠️\n`, err.message);
      // throw err;
    }
  }

  static async showResp(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');

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
      await TelegramHelper.editMessageText(chatId, messageId, newMessage);

      let buttonsInRow = 4; // Количество кнопок в одном ряду
      // Формируем кнопки по заданному числу в ряд
      let keyboard = [];
      let { responsibles } = StorageController;
      for (let i = 0; i < responsibles.length; i += buttonsInRow) {
        let row = responsibles.slice(i, i + buttonsInRow).map((resp, respIndex) => {
          return {
            text: resp,
            callback_data: `changeResp@${chatId}@${messageId}@${gid}@${taskId}@${respIndex}`
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
      await TelegramHelper.updateTaskButtons(chatId, messageId, {
        inline_keyboard: keyboard
      });

    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении showResp ⚠️\n`, err.message);
      // throw err;
    }
  }

  static async deleteTask(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');

      let gid = param1;
      let taskId = param2;
      let task = await GoogleHelper.deleteRowBySubstringInA(gid, taskId);
      await TelegramHelper.bot.deleteMessage(chatId, messageId);
      await TelegramHelper.bot.sendMessage(
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
      let task = await GoogleHelper.getTaskById(gid, taskId);

      // ft это fromTable
      let [ftTaskId, ftIsCompleted, ftTaskText, ftResponsibleName, ftSourceName, ftPriority, ftB24link, ftComment, ftStatus, ftPenalty] = Object.values(task);
      // Информируем, о том, что мы выбираем нового исполнителя задачи
      let taskText = StorageController.tasks[`${chatId}@${messageId}`];
      let aHref = await GoogleHelper.generateTaskLink(gid, taskId);
      let newMessage = `👀 Задача:\n\n` +
        `<b>${taskText}</b>\n\n` +
        `${aHref}\n\n` +
        `<i>Используйте клавиатуру, чтобы изменить:\n` +
        `Исполнителя / Источник,\n` +
        `Срочность / Статус задачи</i>`;

      const keyboardForCreatedTask = {
        inline_keyboard: [
          [
            { text: `${ftResponsibleName}`, callback_data: `showResp@${chatId}@${messageId}@${gid}@${taskId}` },
            { text: `${ftSourceName}`, callback_data: `showSrc@${chatId}@${messageId}@${gid}@${taskId}` },
          ],
          [
            { text: `${ftPriority}`, callback_data: `showPriority@${chatId}@${messageId}@${gid}@${taskId}` },
            { text: `${ftStatus}`, callback_data: `showStatus@${chatId}@${messageId}@${gid}@${taskId}` },
          ],
          [
            { text: '❌ Удалить задачу', callback_data: `deleteTask@${chatId}@${messageId}@${gid}@${taskId}` },
          ]
        ]
      };

      // если нужно изменить текущее сообщение
      if (isThisMessage) {
        await TelegramHelper.editMessageText(chatId, messageId, newMessage);
        await TelegramHelper.updateTaskButtons(chatId, messageId, keyboardForCreatedTask);
      }


    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении showTask ⚠️\n`, err.message);
      // throw err;
    }
  }

  static async cancelCreation(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');
      await TelegramHelper.bot.deleteMessage(chatId, messageId);
    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении cancelCreation ⚠️\n`, err.message);
      // throw err;
    }
  }
  static async methodTemplate(query) {
    try {
      const [buttonAction, chatId, messageId, param1, param2, param3, param4] = query.data.split('@');

      // актуализируем спринты для понимания предыдущего, текущего и следующего
      let sheets = await GoogleHelper.getAllSheetNamesAndGids();

    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении НАПИСАТЬ НАЗВАНИЕ МЕТОДА !!! ⚠️\n`, err.message);
      // throw err;
    }
  }
};




module.exports = BotController;
