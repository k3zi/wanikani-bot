'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var SQLite = require('sqlite3').verbose();
var Vow = require('vow');
var Bot = require('slackbots');

var request = require('request');
var WK_API_BASE_URL = 'https://www.wanikani.com/api/user/';
var _ = require('lodash');
var converter = require('jp-conversion');

class WaniKaniBot extends Bot {
    /**
     * @param {object} params
     * @constructor
     */

     constructor(params) {
         super(params);
         this.dbPath = params.dbPath || path.resolve(process.cwd(), 'data', 'wanikani-bot.db');
         this.token = params.token;
         this.name = params.name || 'wanikani-bot';
         this.userWaitingOnTest = {};

         console.assert(params.token, 'token must be defined');

         this.user = null;
         this.db = null;
     }

     // Start

    run() {
        this.on('start', this._onStart);
        this.on('message', this._onMessage);
    }

    _onStart() {
        this.loadBotUser();
        this.connectDb();
    }

    loadBotUser() {
        var self = this;
        this.user = this.users.filter(function (user) {
            return user.name === self.name;
        })[0];
    }

    connectDb() {
        if (!fs.existsSync(this.dbPath)) {
            console.error('Database path ' + '"' + this.dbPath + '" does not exists or it\'s not readable.');
            process.exit(1);
        }

        this.db = new SQLite.Database(this.dbPath);
    };

    // Checks

    _isChatMessage(message) {
        return message.type === 'message' && Boolean(message.text);
    };

    _isChannelConversation(message) {
        return typeof message.channel === 'string' &&
            message.channel[0] === 'C';
    };

    _isDMConversation(message) {
        return typeof message.channel === 'string' &&
            message.channel[0] === 'D';
    };

    _isFromWaniKaniBot(message) {
        return message.user === this.user.id;
    };

    _isMentioningWaniKani(message) {
        return message.text.toLowerCase().indexOf('wk') == 0 ||
            message.text.toLowerCase().indexOf(this.name) == 0;
    }

    // Helper Calls

    _extractCall(message) {
        // #message = wk [method] [params]

        // message = [method] [params]
        message = message.substr(message.indexOf(' ') + 1);

        // [method] [params]
        var s = message.indexOf(' ');
        var method = message.substr(0, s);
        var params = message.substr(s + 1);

        return [method || params, method ? params : ''];
    };


    // Action Calls

    _onMessage(message) {
        if (this._isChatMessage(message) && !this._isFromWaniKaniBot(message)) {
            console.log(this.userWaitingOnTest);
            console.log(message);

            if (this._isMentioningWaniKani(message) || message.user in this.userWaitingOnTest) {
                console.log('*******');
                this._replyToMessage(message);
            }
        }
    };

    _replyToMessage(message) {
        var self = this;
        var text = message.text.toLowerCase();

        this.getUserById(message.user).then(function(user) {
            var call = self._extractCall(text);
            var method = call[0];
            var params = call[1];
            var shouldReply = true;
            var reply = '';

            if (method == 'commands') {
                reply = "```set-api [api_key] - set's your API key to the value given (don't add brackets)"
                + "\ncelebrate - throws a party for your WK level up"
                + "\ntest me - gives you a random test for a critical item below the 85% threshold"
                + "```";
            } else if (method == 'set-api') {
                shouldReply = false;
                self._setAPI(user, params, function(reply) {
                    self.postMessage(message.channel, reply, {as_user: true});
                });
            } else if (method == 'celebrate') {
                shouldReply = false;
                self._celebrateLevelUp(user, params, function(reply) {
                    self.postMessage(message.channel, reply, {as_user: true});
                });
            } else if (method == 'test' && params == 'me') {
                shouldReply = false;
                self._randomTest(user, null, function(reply, test) {
                    self.userWaitingOnTest[message.user] = test;
                    self.postMessage(message.channel, reply, {as_user: true});
                });
            } else if (message.user in self.userWaitingOnTest) {
                shouldReply = false;
                console.log('found test');
                self._checkRandomTest(user, { test: self.userWaitingOnTest[message.user], text: text }, function(reply, shouldDelete) {
                    if (shouldDelete) {
                        delete self.userWaitingOnTest[message.user];
                    }

                    self.postMessage(message.channel, reply, {as_user: true});
                });
            }

            if (shouldReply) {
                if (!reply || reply.length == 0) {
                    var unkown = _.sample(['しりません...', 'わかりません...', '何ですか？']);
                    reply = (user.profile.last_name || user.profile.first_name || user.name) + 'さん, ' + unkown;
                }

                self.postMessage(message.channel, reply, {as_user: true});
            }
        });
    };

    _setAPI(user, params, cb) {
        var self = this;
        var api_key = params;
        var username = user.name;

        function finish(error) {
            if (error) {
                cb('There was an error trying to set your API Key');
            } else {
                cb('Succesfuly set API key!');
            }
        }

        self.db.get("SELECT * FROM users WHERE username = ?", [username], function(err, row) {
            if (row) {
                self.db.run('UPDATE users SET api_key = ? WHERE username = ?', api_key, username, function(error) {
                    finish(error);
                });
            } else {
                self.db.run('INSERT INTO users(username, api_key) VALUES(?, ?)', username, api_key, function(error) {
                    finish(error);
                });
            }
        });
    };

    _celebrateLevelUp(user, params, cb) {
        var self = this;
        var username = user.name;

        this.db.get("SELECT * FROM users WHERE username = ?", [username], function(err, row) {
            if (row && row['api_key']) {
                var api_key = row['api_key'];

                request(WK_API_BASE_URL + api_key + '/user-information', function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        var result = JSON.parse(body);
                        if (result.user_information) {
                            var level = result.user_information.level;

                            self.db.run('UPDATE users SET level = ? WHERE username = ?', level, username, function(error) {
                                cb('やった！ @' + username + ' is now on level ' + level + ' :balloon: :party: :balloon:');
                            });
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
    }

    _randomTest(user, params, cb) {
        var self = this;
        var username = user.name;

        this.db.get("SELECT * FROM users WHERE username = ?", [username], function(err, row) {
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

                                cb(questionMeaning, { questionReading: questionReading, questionMeaning: questionMeaning, answerReading: answerReading, answerMeaning: answerMeaning});
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
    }

    _checkRandomTest(user, params, cb) {
        var self = this;
        var username = user.name;
        var test = params.test;
        var message = params.text;

        if (test.questionMeaning && test.questionMeaning.length > 0) {
            var answerMeaning = test.answerMeaning;
            var answerMeanings = answerMeaning.split(', ');

            var maxSimularity = 0;
            var maxWord = answerMeanings[0];
            for (var i = 0; i < answerMeanings.length; i++) {
                var simularity = self._similarText(answerMeanings[i], message) / answerMeanings[i].length;
                if (simularity > maxSimularity && maxSimularity != 1) {
                    maxSimularity = simularity;
                    maxWord = answerMeanings[i];
                }
            }

            var result = '';
            if (maxSimularity == 1.0) {
                result = 'ナイス ' + (user.profile.last_name || user.profile.first_name || user.name) + 'さん！ That was the correct answer.';
            } else if (maxSimularity > 0.6) {
                result = (user.profile.last_name || user.profile.first_name || user.name) + 'さん！ That answer was slighly off. The right answer is: ' + maxWord;
            } else {
                result = 'ごめんなさい ' + (user.profile.last_name || user.profile.first_name || user.name) + 'さん！ That answer was incorrect. The right answer is: ' + maxWord;
            }

            test.questionMeaning = null;
            cb(result + (test.questionReading ? ("\n" + test.questionReading) : '') || '', !test.questionReading || test.questionReading.length == 0);
        } else if (test.questionReading && test.questionReading.length > 0) {
            var answerReading = test.answerReading;
            var hiriganaEquivMessage = converter.convert(message).hiragana;

            var answerReadings = answerReading.split(', ');

            var maxSimularity = 0;
            var maxWord = answerReadings[0];
            for (var i = 0; i < answerReadings.length; i++) {
                var hiriganaEquivAnswer = converter.convert(answerReadings[i]).hiragana;
                var simularity = self._similarText(answerReadings[i], hiriganaEquivMessage) / answerReadings[i].length;
                if (simularity > maxSimularity && maxSimularity != 1) {
                    maxSimularity = simularity;
                    maxWord = answerReadings[i];
                }
            }

            var result = '';
            if (maxSimularity == 1.0) {
                result = 'ナイス ' + (user.profile.last_name || user.profile.first_name || user.name) + 'さん！ That was the correct answer.';
            } else if (maxSimularity > 0.6) {
                result = (user.profile.last_name || user.profile.first_name || user.name) + 'さん！ That answer was slighly off. The right answer is: ' + answerReading;
            } else {
                result = 'ごめんなさい ' + (user.profile.last_name || user.profile.first_name || user.name) + 'さん！ That answer was incorrect. The right answer is: ' + answerReading;
            }

            test.questionReading = null;
            cb(result, true);
        }
    }

    _similarText(first, second) {
        if (first === null || second === null || typeof first === 'undefined' || typeof second === 'undefined') {
            return 0;
        }

        first += '';
        second += '';

        var pos1 = 0,
            pos2 = 0,
            max = 0,
            firstLength = first.length,
            secondLength = second.length,
            p, q, l, sum;

        max = 0;

        for (p = 0; p < firstLength; p++) {
            for (q = 0; q < secondLength; q++) {
                for (l = 0;
                (p + l < firstLength) && (q + l < secondLength) && (first.charAt(p + l) === second.charAt(q + l)); l++);
                if (l > max) {
                    max = l;
                    pos1 = p;
                    pos2 = q;
                }
            }
        }

        sum = max;

        if (sum) {
            if (pos1 && pos2) {
                sum += this._similarText(first.substr(0, pos2), second.substr(0, pos2));
            }

            if ((pos1 + max < firstLength) && (pos2 + max < secondLength)) {
                sum += this._similarText(first.substr(pos1 + max, firstLength - pos1 - max), second.substr(pos2 + max, secondLength - pos2 - max));
            }
        }
        return sum;
    }

}



module.exports = WaniKaniBot;
