const { google } = require('googleapis');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

class GoogleHelper {
  static keys = require('./Keys.json');
  static S_ID;
  static client = new google.auth.JWT(this.keys.client_email, null, this.keys.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  static gsapi = google.sheets({ version: 'v4', auth: this.client });
  static S_NAME;

  static async init(spreadsheetId) {
    this.S_ID = spreadsheetId;
    return new Promise((resolve, reject) => {
      this.client.authorize((error, tokens) => {
        if (error) {
          console.error('Authorization error:', error);
          reject(error);
        } else {
          console.log('Connected...');
          resolve(tokens);
        }
      });
    });
  }

  // Функция для выполнения запроса с экспоненциальной задержкой
  static async retryRequest(fn, maxAttempts = 50, delay = 1000) {
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        return await fn();  // попытка выполнить запрос
      } catch (error) {
        if (error.code === 429 || error.code === 500 || error.code === 503) {
          // Если ошибка квоты (429) или временная ошибка (500/503), ждем перед повторной попыткой
          attempt++;
          const waitTime = delay * Math.pow(2, attempt); // экспоненциальная задержка
          console.log(`Ошибка запроса. Попытка ${attempt} из ${maxAttempts}. Повтор через ${waitTime} мс...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // Для других типов ошибок выбрасываем исключение
          throw error;
        }
      }
    }
    throw new Error('Максимальное количество попыток превышено');
  }


  static findFirstFtpReport(directory, ftpReportName) {
    try {
        const files = fs.readdirSync(directory);
        
        const reportFile = files.find(file => file.startsWith(ftpReportName));
        
        return reportFile ? path.join(directory, reportFile) : null;
    } catch (error) {
        console.error('Ошибка при чтении директории:', error);
        return null;
    }
  }

  static deleteFileSync(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('Файл удален:', filePath);
        } else {
            console.log('Файл не найден:', filePath);
        }
    } catch (error) {
        console.error('Ошибка при удалении файла:', error);
    }
  }
  static async uploadExcelToSheet(excelFilePath, gid, ftpReportName) {
    try {
      const workbook = xlsx.readFile(excelFilePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      if (data.length === 0) {
        console.log(`Получен пустой excel-файл, начинающийся с ${ftpReportName}.`);
        return;
      }
      this.deleteFileSync(excelFilePath);
      // Работа с XLSX закончена!

      // Работа с Google Sheets
      // первый раз получаем имя листа и сохраняем в глобальную переменную
      this.S_NAME = await this.getSheetNameByGid(gid);
      if (!this.S_NAME) {
        throw new Error(`Sheet with GID ${gid} not found.`);
      }

      await this.expandSheetRows(gid, data.length);
      await this.clearSheet(this.S_NAME);

      const BATCH_SIZE = 3000; // было 500
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const progress = Math.min(100, Math.round((i / data.length) * 100));
        await this.updateSheetName(gid, `${ftpReportName} (${progress}%)`);

        const chunk = data.slice(i, i + BATCH_SIZE);
        const range = `${this.S_NAME}!A${i + 1}`;

        // Используем retryRequest для записи данных в Google Sheets
        await this.retryRequest(() => this.writeRange(range, chunk));
      }

      const timestamp = new Date().toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(',', '');
      await this.updateSheetName(gid, `${ftpReportName} (${timestamp})`);

      console.log(`Uploaded data from ${excelFilePath} to sheet with GID "${gid}" successfully.`);
    } catch (error) {
      console.error('Error uploading Excel to Google Sheet:', error);
      throw error;
    }
  }

  static async getSheetNameByGid(gid) {
    try {
      const response = await this.gsapi.spreadsheets.get({ spreadsheetId: this.S_ID });
      const sheet = response.data.sheets.find(s => s.properties.sheetId === gid);
      return sheet ? sheet.properties.title : null;
    } catch (error) {
      console.error('Error fetching sheet name by GID:', error);
      throw error;
    }
  }

  static async expandSheetRows(gid, requiredRows) {
    try {
      const response = await this.gsapi.spreadsheets.get({ spreadsheetId: this.S_ID });
      const sheet = response.data.sheets.find(s => s.properties.sheetId === gid);
      const currentRowCount = sheet.properties.gridProperties.rowCount;

      if (currentRowCount < requiredRows) {
        const request = {
          spreadsheetId: this.S_ID,
          resource: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: sheet.properties.sheetId,
                    gridProperties: { rowCount: requiredRows },
                  },
                  fields: 'gridProperties.rowCount',
                },
              },
            ],
          },
        };
        await this.gsapi.spreadsheets.batchUpdate(request);
        console.log(`Expanded sheet "${this.S_NAME}" to ${requiredRows} rows.`);
      }
    } catch (error) {
      console.error('Error expanding sheet rows:', error);
      throw error;
    }
  }

  static async clearSheet() {
    try {
      await this.gsapi.spreadsheets.values.clear({
        spreadsheetId: this.S_ID,
        range: `${this.S_NAME}`,
      });
      console.log(`Cleared range for sheet "${this.S_NAME}"`);
    } catch (error) {
      console.error('Error clearing range:', error);
      throw error;
    }
  }

  static async writeRange(range, values) {
    try {
      await this.gsapi.spreadsheets.values.update({
        spreadsheetId: this.S_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: values },
      });
    } catch (error) {
      console.error('Error writing range:', error);
      throw error;
    }
  }

  static async updateSheetName(gid, newName) {
    try {
      const request = {
        spreadsheetId: this.S_ID,
        resource: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: gid,
                  title: newName,
                },
                fields: 'title',
              },
            },
          ],
        },
      };
      await this.retryRequest(() => this.gsapi.spreadsheets.batchUpdate(request));
      console.log(`Updated sheet name to "${newName}"`);
      this.S_NAME = newName;
    } catch (error) {
      console.error('Error updating sheet name:', error);
      throw error;
    }
  }
}

module.exports = GoogleHelper;
