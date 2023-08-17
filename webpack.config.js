const path = require('path');

module.exports = function(defaultConfig) {
    defaultConfig.module.rules[0].use.push(path.resolve(__dirname, './dist/loader/index.js'));
    return defaultConfig;
};
