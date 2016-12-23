'use strict';

var name = 'set-api';
var description = "set-api [api_key] - set's your API key to the value given (don't add brackets)";
var enabled = true;

var method = function(user, params, db, cb) {
    var api_key = params;
    var username = user.name;

    function finish(error) {
        if (error) {
            cb('There was an error trying to set your API Key');
        } else {
            cb('Succesfuly set API key!');
        }
    }

    db.get("SELECT * FROM users WHERE username = ?", [username], function(err, row) {
        if (row) {
            db.run('UPDATE users SET api_key = ? WHERE username = ?', api_key, username, function(error) {
                finish(error);
            });
        } else {
            db.run('INSERT INTO users(username, api_key) VALUES(?, ?)', username, api_key, function(error) {
                finish(error);
            });
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
