const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleHelper {
  static S_ID;
  static gsapi;

  /**
   * Инициализация клиента Google Sheets API
   * @param {string} spreadsheetId — ID таблицы
   */
  static async init(spreadsheetId) {
    this.S_ID = spreadsheetId;

    const keyFilePath = path.join(__dirname, 'Keys.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    this.gsapi = google.sheets({ version: 'v4', auth: client });

    console.log('✅ Google API авторизация прошла успешно');
  }


  /**
 * Получить и вывести список всех листов: имя + GID
 */
  static async getAllSheetNamesAndGids() {
    try {
      const response = await this.gsapi.spreadsheets.get({ spreadsheetId: this.S_ID });
      const sheets = response.data.sheets;

      return sheets.map(s => ({
        title: s.properties.title,
        gid: s.properties.sheetId
      }));

    } catch (error) {
      console.error('❌ Ошибка при получении списка листов:', error);
      throw error;
    }
  }

  static getIsoWeek(date) {
    const target = new Date(date.valueOf());
    const dayNumber = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNumber + 3); // четверг текущей недели

    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const firstDayNumber = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstDayNumber + 3);

    const diff = target - firstThursday;
    const weekNumber = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
    const year = target.getFullYear();

    return { week: weekNumber, year };
  }

  static getCurrentSprintNumber() {
    return this.getIsoWeek(new Date()).week;
  }

  static getLastSprintNumber() {
    const today = new Date();
    today.setDate(today.getDate() - 7);
    return this.getIsoWeek(today).week;
  }

  static getNextSprintNumber() {
    const today = new Date();
    today.setDate(today.getDate() + 7);
    return this.getIsoWeek(today).week;
  }



  /**
   * Получение имени листа по GID
   * @param {number} gid — GID листа (sheetId)
   * @returns {Promise<string|null>} Название листа или null
   */
  static async getSheetNameByGid(gid) {
    try {
      const response = await this.gsapi.spreadsheets.get({ spreadsheetId: this.S_ID });
      const sheet = response.data.sheets.find(s => s.properties.sheetId === gid);
      return sheet ? sheet.properties.title : null;
    } catch (error) {
      console.error('❌ Ошибка при получении имени листа по GID:', error);
      throw error;
    }
  }

  // Можно добавлять и другие вспомогательные методы, как writeRange, clearSheet и т.п.
}

module.exports = GoogleHelper;
