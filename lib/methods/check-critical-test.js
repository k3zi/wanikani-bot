var _ = require('lodash');
var similarText = require('./../helpers/similar-text');
var converter = require('jp-conversion');

var name = 'checkTest';
var description = "test me - gives you a random test for a critical item below the 85% threshold";
var enabled = false;

var method = function(user, params, db, cb) {
    var username = user.name;
    var text = params.text;
    var userWaitingOnTest = params.userWaitingOnTest;
    var message = params.message;
    var test = userWaitingOnTest[message.user];

    if (test.questionMeaning && test.questionMeaning.length > 0) {
        var answerMeaning = test.answerMeaning;
        var answerMeanings = answerMeaning.split(', ');

        var maxSimularity = 0;
        var maxWord = answerMeanings[0];
        for (var i = 0; i < answerMeanings.length; i++) {
            var simularity = similarText(answerMeanings[i], text) / answerMeanings[i].length;
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
        if (!test.questionReading || test.questionReading.length == 0) {
            delete userWaitingOnTest[message.user];
        }

        cb(result + (test.questionReading ? ("\n" + test.questionReading) : '') || '');
    } else if (test.questionReading && test.questionReading.length > 0) {
        var answerReading = test.answerReading;
        var hiriganaEquivMessage = converter.convert(text).hiragana;

        var answerReadings = answerReading.split(', ');

        var maxSimularity = 0;
        var maxWord = answerReadings[0];
        for (var i = 0; i < answerReadings.length; i++) {
            var hiriganaEquivAnswer = converter.convert(answerReadings[i]).hiragana;
            var simularity = similarText(answerReadings[i], hiriganaEquivMessage) / answerReadings[i].length;
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
        delete userWaitingOnTest[message.user];
        cb(result);
    }

    return false;
};

module.exports = {
    name: name,
    description: description,
    method: method,
    enabled: enabled
};
