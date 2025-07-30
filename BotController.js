// BotController.js
const GoogleHelper = require('./GoogleHelper');
const TelegramHelper = require('./TelegramHelper');
const StorageController = require('./StorageController');

class BotController {

  static getFormattedTimestamp() {
    const now = new Date();

    const pad = (n) => String(n).padStart(2, '0');

    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());

    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());

    return `${day}.${month} ${hours}:${minutes}`;
  }

  /**
   * Удаляет сообщение по chatId и messageId
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

      // делаем запись в строку: определяем поля строки
      let taskId = `${this.getFormattedTimestamp()} ${messageId}`;
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
      await TelegramHelper.editMessageText(
        chatId,
        messageId,
        newMessage,
        'HTML',
        true
      );

      const keyboardForCreatedTask = {
        inline_keyboard: [
          [
            { text: `${responsibleName}`, callback_data: `select_resp@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
            { text: `${sourceName}`, callback_data: `select_src@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
          ],
          [
            { text: `${priority}`, callback_data: `select_priority@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
            { text: `${status}`, callback_data: `select_status@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
          ],
          [
            { text: '❌ Удалить задачу', callback_data: `delete@${chatId}@${messageId}@${sprintObj.gid}@${taskId}` },
          ]
        ]
      };

      await TelegramHelper.updateTaskButtons(chatId, messageId, keyboardForCreatedTask);

    } catch (err) {
      console.error(`⚠️ Ошибка при выполнении createTask ⚠️\n`, err.message);
      // throw err;
    }
  }
};

module.exports = BotController;
