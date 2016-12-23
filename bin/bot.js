'use strict';

var WaniKaniBot = require('../lib/wanikani-bot');

var token = process.env.BOT_API_KEY;
var dbPath = process.env.BOT_DB_PATH;
var name = process.env.BOT_NAME;

var bot = new WaniKaniBot({
    token: token,
    dbPath: dbPath,
    name: name
});

bot.run();
