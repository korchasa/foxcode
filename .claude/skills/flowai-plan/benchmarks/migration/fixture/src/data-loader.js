const fs = require("fs");
const request = require("request");

function getData(url, callback) {
  request(url, (err, _res, body) => {
    if (err) return callback(err);

    fs.writeFile("cache.json", body, (err) => {
      if (err) return callback(err);
      callback(null, body);
    });
  });
}

module.exports = { getData };
