// StorageController.js

const fs = require('fs');
const path = require('path');
const USERS_FILE_PATH = path.join(__dirname, 'users.json');

class StorageController {



    static loadUsersFromFile() {
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

    static saveUsersToFile() {
        try {
            fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(this.users, null, 2), 'utf-8');
        } catch (err) {
            console.error('Ошибка записи в users.json:', err);
        }
    }

    
    static users = this.loadUsersFromFile();    // id: chatId
    static tasks = {};                // id: chatId@messageId
};

module.exports = StorageController;
