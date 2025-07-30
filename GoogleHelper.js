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
 * Записать значение в указанную ячейку
 * @param {string} sheetName — Название листа
 * @param {string} cell — Адрес ячейки в формате A1 (например, "A1", "B2")
 * @param {string|number} value — Значение для записи
 */
  static async writeToCell(sheetName, cell, value) {
    try {
      const range = `${sheetName}!${cell}`;
      await this.gsapi.spreadsheets.values.update({
        spreadsheetId: this.S_ID,
        range: range,
        valueInputOption: 'RAW',
        resource: {
          values: [[value]]
        }
      });
      console.log(`✅ Значение "${value}" успешно записано в ячейку ${range}`);
    } catch (error) {
      console.error(`❌ Ошибка при записи в ячейку ${cell}:`, error);
      throw error;
    }
  }

  /**
 * Найти первую пустую строку в указанном диапазоне столбцов
 * @param {number} gid — GID листа (sheetId)
 * @param {string} columnRange — Диапазон столбцов для проверки (например, "A:A" или "A:C")
 * @returns {Promise<number>} Номер первой пустой строки (начиная с 1)
 */
  static async findFirstEmptyRow(gid, columnRange) {
    try {
      const sheetName = await this.getSheetNameByGid(gid);
      if (!sheetName) {
        throw new Error(`Лист с GID ${gid} не найден`);
      }
      const rangeAddress = `${sheetName}!${columnRange}`;
      const response = await this.gsapi.spreadsheets.values.get({
        spreadsheetId: this.S_ID,
        range: rangeAddress
      });
      const values = response.data.values || [];
      let rowIndex = 1;
      for (const row of values) {
        if (row.every(cell => cell === '' || cell === undefined)) {
          return rowIndex;
        }
        rowIndex++;
      }
      return rowIndex; // Если все строки заполнены, возвращаем следующую
    } catch (error) {
      console.error(`❌ Ошибка при поиске пустой строки в диапазоне ${columnRange} на листе с GID ${gid}:`, error);
      throw error;
    }
  }


  /**
 * Записать значения в указанный диапазон ячеек
 * @param {number} gid — GID листа (sheetId)
 * @param {string} range — Диапазон ячеек в формате A1 (например, "A1" или "A1:B2")
 * @param {Array<Array<string|number>>} values — Массив значений для записи (например, [['A1', 'B1'], ['A2', 'B2']])
 */
  static async writeToRange(gid, range, values) {
    try {
      const sheetName = await this.getSheetNameByGid(gid);
      if (!sheetName) {
        throw new Error(`Лист с GID ${gid} не найден`);
      }
      const rangeAddress = `${sheetName}!${range}`;
      await this.gsapi.spreadsheets.values.update({
        spreadsheetId: this.S_ID,
        range: rangeAddress,
        valueInputOption: 'RAW',
        resource: {
          values: values
        }
      });
      console.log(`✅ Значения успешно записаны в диапазон ${rangeAddress}`);
    } catch (error) {
      console.error(`❌ Ошибка при записи в диапазон ${range} на листе с GID ${gid}:`, error);
      throw error;
    }
  }

  /**
   * Получение имени листа по GID
   * @param {number} gid — GID листа (sheetId)
   * @returns {Promise<string|null>} Название листа или null
   */
  static async getSheetNameByGid(gid) {
    try {
      const response = await this.gsapi.spreadsheets.get({ spreadsheetId: this.S_ID });
      const sheet = response.data.sheets.find(s => s.properties.sheetId == gid);
      return sheet ? sheet.properties.title : null;
    } catch (error) {
      console.error('❌ Ошибка при получении имени листа по GID:', error);
      throw error;
    }
  }

  /**
   * Получить строку (A-J) по GID листа, где значение в столбце A заканчивается указанной подстрокой
   * @param {number} gid — GID листа (sheetId)
   * @param {string} substring — Подстрока для поиска в столбце A
   * @returns {Promise<Array<string|number>|null>} Массив значений строки (A-J) или null, если строка не найдена
   */
  static async getRowBySubstringInA(gid, substring) {
    try {
      const sheetName = await this.getSheetNameByGid(gid);
      if (!sheetName) {
        throw new Error(`Лист с GID ${gid} не найден`);
      }
      const rangeAddress = `${sheetName}!A:J`;
      const response = await this.gsapi.spreadsheets.values.get({
        spreadsheetId: this.S_ID,
        range: rangeAddress
      });
      const values = response.data.values || [];
      for (const row of values) {
        const cellA = row[0] || ''; // Значение в столбце A
        if (typeof cellA === 'string' && cellA.endsWith(substring)) {
          return row.slice(0, 10); // Возвращаем первые 10 столбцов (A-J)
        }
      }
      console.log(`ℹ️ Строка с подстрокой "${substring}" в столбце A не найдена на листе с GID ${gid}`);
      return null;
    } catch (error) {
      console.error(`❌ Ошибка при поиске строки с подстрокой "${substring}" в столбце A на листе с GID ${gid}:`, error);
    }
  }

  /**
 * Найти строку, где значение в столбце A заканчивается на substring, вернуть объект task и удалить эту строку
 * @param {number} gid — GID листа (sheetId)
 * @param {string} substring — Подстрока для поиска в столбце A
 * @returns {Promise<Object|null>} Объект task с полями A–J или null, если строка не найдена
 */
  static async deleteRowBySubstringInA(gid, substring) {
    try {
      const sheetName = await this.getSheetNameByGid(gid);
      if (!sheetName) {
        throw new Error(`Лист с GID ${gid} не найден`);
      }

      const rangeAddress = `${sheetName}!A:J`;
      const response = await this.gsapi.spreadsheets.values.get({
        spreadsheetId: this.S_ID,
        range: rangeAddress
      });

      const values = response.data.values || [];
      const columnNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

      let rowIndex = 0;
      for (const row of values) {
        const cellA = row[0] || '';
        if (typeof cellA === 'string' && cellA.endsWith(substring)) {
          const task = {};
          for (let i = 0; i < 10; i++) {
            task[columnNames[i]] = row[i] ?? '';
          }
          task['sheetName'] = sheetName;
          // Удаление строки
          await this.gsapi.spreadsheets.batchUpdate({
            spreadsheetId: this.S_ID,
            resource: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId: gid,
                      dimension: 'ROWS',
                      startIndex: rowIndex,
                      endIndex: rowIndex + 1
                    }
                  }
                }
              ]
            }
          });

          console.log(`🗑️ Строка успешно удалена с листа "${sheetName}". Task:`, task);
          return task;
        }
        rowIndex++;
      }

      console.log(`ℹ️ Строка, заканчивающаяся на "${substring}", не найдена на листе "${sheetName}"`);
      return null;
    } catch (error) {
      console.error(`❌ Ошибка при удалении строки с подстрокой "${substring}" в столбце A:`, error);
      throw error;
    }
  }


  /**
 * Найти строку, где значение в столбце A заканчивается на substring,
 * изменить значение в указанной ячейке (по имени столбца) и вернуть объект task до изменения
 * @param {number} gid — GID листа (sheetId)
 * @param {string} substring — Подстрока для поиска в столбце A
 * @param {string} columnLetter — Буква столбца для изменения (например, 'B', 'C', ...)
 * @param {string|number} newValue — Новое значение для ячейки
 * @returns {Promise<Object|null>} Объект task с полями A–J (до изменения) или null, если строка не найдена
 */
  static async updateCellInRowBySubstringInA(gid, substring, columnLetter, newValue) {
    try {
      const sheetName = await this.getSheetNameByGid(gid);
      if (!sheetName) {
        throw new Error(`Лист с GID ${gid} не найден`);
      }

      const rangeAddress = `${sheetName}!A:J`;
      const response = await this.gsapi.spreadsheets.values.get({
        spreadsheetId: this.S_ID,
        range: rangeAddress
      });

      const values = response.data.values || [];
      const columnNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const columnIndex = columnNames.indexOf(columnLetter.toUpperCase());

      if (columnIndex === -1) {
        throw new Error(`Недопустимое имя столбца: ${columnLetter}`);
      }

      let rowIndex = 0;
      for (const row of values) {
        const cellA = row[0] || '';
        if (typeof cellA === 'string' && cellA.endsWith(substring)) {
          // Собираем исходные данные
          const task = {};
          for (let i = 0; i < 10; i++) {
            task[columnNames[i]] = row[i] ?? '';
          }
          task['sheetName'] = sheetName;

          // Формируем точный адрес ячейки для обновления
          const targetCell = `${columnLetter}${rowIndex + 1}`;
          const targetRange = `${sheetName}!${targetCell}`;

          await this.gsapi.spreadsheets.values.update({
            spreadsheetId: this.S_ID,
            range: targetRange,
            valueInputOption: 'RAW',
            resource: {
              values: [[newValue]]
            }
          });

          console.log(`✏️ Ячейка ${targetCell} успешно обновлена значением "${newValue}". Task:`, task);
          return task;
        }
        rowIndex++;
      }

      console.log(`ℹ️ Строка, заканчивающаяся на "${substring}", не найдена на листе "${sheetName}"`);
      return null;
    } catch (error) {
      console.error(`❌ Ошибка при обновлении ячейки "${columnLetter}" в строке с подстрокой "${substring}" в столбце A:`, error);
      throw error;
    }
  }

  /**
 * Получить массивы значений из столбцов G, H, I начиная со 2-й строки:
 * G → sources, H → priorities, I → statuses
 * @param {number} gid — GID листа (sheetId)
 * @returns {Promise<{ sources: string[], priorities: string[], statuses: string[] }>}
 */
  static async getSourcesPrioritiesStatusesFromColumns(gid) {
    try {
      const sheetName = await this.getSheetNameByGid(gid);
      if (!sheetName) {
        throw new Error(`Лист с GID ${gid} не найден`);
      }

      const ranges = [`${sheetName}!A2:A`, `${sheetName}!G2:G`, `${sheetName}!H2:H`, `${sheetName}!I2:I`];

      const response = await this.gsapi.spreadsheets.values.batchGet({
        spreadsheetId: this.S_ID,
        ranges: ranges
      });

      const getColumnValues = (index) =>
        (response.data.valueRanges?.[index]?.values || [])
          .map(row => (row[0] || '').trim())
          .filter(value => value !== '');

      const responsibles = getColumnValues(0);
      const sources = getColumnValues(1);
      const priorities = getColumnValues(2);
      const statuses = getColumnValues(3);

      return { responsibles, sources, priorities, statuses };
    } catch (error) {
      console.error('❌ Ошибка при получении значений из столбцов A/G/H/I:', error);
      throw error;
    }
  }

  /**
   * Сформировать aHref ссылку на ячейку B в строке, где значение в столбце A равно taskId
   * @param {string} spreadsheetId — ID таблицы
   * @param {number} gid — GID листа (sheetId)
   * @param {string} taskId — ID задачи для поиска в столбце A
   * @returns {Promise<string>} Сформированная HTML-ссылка или строка с ошибкой
   */
  static async generateTaskLink(gid, taskId) {
    try {
      const sheetName = await this.getSheetNameByGid(gid);
      if (!sheetName) {
        throw new Error(`Лист с GID ${gid} не найден`);
      }

      const rangeAddress = `${sheetName}!A:A`;
      const response = await this.gsapi.spreadsheets.values.get({
        spreadsheetId: this.S_ID,
        range: rangeAddress
      });

      const values = response.data.values || [];
      let taskRow = null;

      // Поиск строки с taskId в столбце A
      for (let i = 0; i < values.length; i++) {
        const cellA = values[i][0] || '';
        if (cellA === taskId) {
          taskRow = i + 1; // Номер строки (начиная с 1)
          break;
        }
      }

      if (!taskRow) {
        throw new Error(`Задача с ID ${taskId} не найдена в столбце A на листе "${sheetName}"`);
      }

      // Формирование ссылки
      const aHref = `<a href="https://docs.google.com/spreadsheets/d/${this.S_ID}/edit#gid=${gid}&range=B${taskRow}">${sheetName}, строка ${taskRow}</a>`;
      console.log(`✅ Ссылка сформирована: ${aHref}`);
      return aHref;
    } catch (error) {
      console.error(`❌ Ошибка при формировании ссылки для taskId "${taskId}" на листе с GID ${gid}:`, error);
      throw error;
    }
  }


}

module.exports = GoogleHelper;
