// TelegramHelper.js
class TelegramHelper {
  /**
   * Отправляет markdownV2-сообщение без кнопок и возвращает chatId и messageId
   * @param {TelegramBot} bot - экземпляр Telegram бота
   * @param {number} chatId - ID чата, куда отправляется сообщение
   * @param {string} text - текст сообщения в формате MarkdownV2
   * @returns {Promise<{chatId: number, messageId: number}>}
   */
  static async sendMarkdownMessage(bot, chatId, text) {
    const msg = await bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
    });
    return { chatId: msg.chat.id, messageId: msg.message_id };
  }

  static async updateTaskButtons(bot, chatId, messageId, inlineKeyboard) {
    // console.log(`Обновляю клавиатуру ${chatId}@${messageId}`);
    // console.log(inlineKeyboard?.inline_keyboard);

    try {
      // 1‑й аргумент — только клавиатура
      // 2‑й аргумент — куда её поставить
      await bot.editMessageReplyMarkup(
        { inline_keyboard: inlineKeyboard.inline_keyboard },
        { chat_id: chatId, message_id: messageId }
      );
    } catch (error) {
      console.error(
        'Ошибка при обновлении клавиатуры:',
        error.response?.data || error.message
      );
    }
  }




  /**
 * Обновляет текст существующего сообщения
 * @param {TelegramBot} bot - экземпляр Telegram бота
 * @param {number} chatId - ID чата
 * @param {number} messageId - ID сообщения
 * @param {string} newText - Новый текст сообщения (в MarkdownV2 или HTML)
 * @param {'MarkdownV2' | 'HTML'} [parseMode='MarkdownV2'] - Режим парсинга
 */
  static async editMessageText(bot, chatId, messageId, newText, parseMode = 'MarkdownV2', disableWebPagePreview = false) {
    try {
      await bot.editMessageText(newText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: parseMode,
        disable_web_page_preview: disableWebPagePreview
      });
    } catch (error) {
      console.error(`Ошибка при редактировании сообщения ${messageId} в чате ${chatId}:`, error.message);
    }
  }


  /**
   * Удаляет сообщение по chatId и messageId
   */
  static async deleteMessage(bot, chatId, messageId) {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (err) {
      console.error(`Не удалось удалить сообщение ${messageId} в чате ${chatId}:`, err.message);
    }
  }
};

module.exports = TelegramHelper;
