'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var SQLite = require('sqlite3').verbose();
var Vow = require('vow');
var Bot = require('slackbots');

var _ = require('lodash');

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

         var methods = {};
         require('fs').readdirSync(__dirname + '/methods/').forEach(function(file) {
             if (file.match(/\.js$/) !== null && file !== 'index.js') {
                 var method = require('./methods/' + file);
                 methods[method.name] = method;
             }
         });

         this.methods = methods;
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
            if (this._isMentioningWaniKani(message) || message.user in this.userWaitingOnTest) {
                this._replyToMessage(message);
            }
        }
    };

    _replyToMessage(message) {
        var self = this;
        var text = message.text.toLowerCase();

        this.getUserById(message.user).then(function(user) {
            var call = self._extractCall(text);
            var calledMethod = call[0];
            var attributes = call[1];
            var shouldReply = true;
            var reply = '';

            var params = { attributes: attributes, userWaitingOnTest: self.userWaitingOnTest, message: message, text: text };

            if (calledMethod == 'commands') {
                reply = '```';
                for (var i in self.methods) {
                    var method = self.methods[i];
                    if (method.enabled) {
                        reply += (method.description + "\n");
                    }
                }
                reply += '```';
            } else {
                if (message.user in self.userWaitingOnTest) {
                    calledMethod = 'checkTest';
                }

                if (calledMethod in self.methods) {

                    shouldReply = self.methods[calledMethod].method(user, params, self.db, function(reply) {
                        self.postMessage(message.channel, reply, {as_user: true});
                    });
                }
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

}



module.exports = WaniKaniBot;
