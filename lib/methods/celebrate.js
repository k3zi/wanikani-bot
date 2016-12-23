var _ = require('lodash');

var WK_API_BASE_URL = 'https://www.wanikani.com/api/user/';
var request = require('request');

var name = 'celebrate';
var description = "celebrate - throws a party for your WK level up";
var enabled = true;

var method = function(user, params, db, cb) {
    var username = user.name;

    db.get("SELECT * FROM users WHERE username = ?", [username], function(err, row) {
        if (row && row['api_key']) {
            var api_key = row['api_key'];

            request(WK_API_BASE_URL + api_key + '/user-information', function(error, response, body) {
                if (!error && response.statusCode == 200) {
                    var result = JSON.parse(body);
                    if (result.user_information) {
                        var level = result.user_information.level;

                        db.run('UPDATE users SET level = ? WHERE username = ?', level, username, function(error) {
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

    return false;
};

module.exports = {
    name: name,
    description: description,
    method: method,
    enabled: enabled
};
