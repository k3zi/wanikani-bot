'use strict';
var _ = require('lodash');

var WK_API_BASE_URL = 'https://www.wanikani.com/api/user/';
var request = require('request');

var name = 'test';
var description = "test me - gives you a random test for a critical item below the 85% threshold";
var enabled = true;

var method = function(user, params, db, cb) {
    var username = user.name;
    var userWaitingOnTest = params.userWaitingOnTest;
    var message = params.message;

    db.get("SELECT * FROM users WHERE username = ?", [username], function(err, row) {
        if (row && row['api_key']) {
            var api_key = row['api_key'];

            request(WK_API_BASE_URL + api_key + '/critical-items/85', function(error, response, body) {
                if (!error && response.statusCode == 200) {
                    var result = JSON.parse(body);
                    if (result.user_information) {
                        var info = result.requested_information;
                        if (info && info.length > 0) {
                            var random = _.sample(info);

                            var questionMeaning = (user.profile.last_name || user.profile.first_name || user.name) + 'さん, what does ' + random.character + ' (' + random.type + ') mean?';
                            var answerMeaning = random.meaning;
                            var answerReading = random.important_reading ? random[random.important_reading] : random.kana;
                            var questionReading = answerReading ? 'How is ' + random.character + ' (' + random.type + ') said?' : answerReading;

                            userWaitingOnTest[message.user] = { questionReading: questionReading, questionMeaning: questionMeaning, answerReading: answerReading, answerMeaning: answerMeaning };
                            cb(questionMeaning);
                        } else {
                            cb('ナイス ' + (user.profile.last_name || user.profile.first_name || user.name) + 'さん！ You have no critical items below 75%.');
                        }
                    } else {
                        cb('Ooops... There was an error using that API key. Make sure you didn\'t add brackets.');
                    }
                } else {
                    cb('Ooops... There was an error retrieving your info');
                }
            });
        } else {
            cb('すみません！ ' + (user.profile.last_name || user.profile.first_name || user.name) + 'さん, your API key doesn\'t seem to be in my system. Try using: ```wk set-api [api_key]```  (without brackets) You can do this in a DM to me as well.');
        }
    });
};

module.exports = {
    name: name,
    description: description,
    method: method,
    enabled: enabled
};
