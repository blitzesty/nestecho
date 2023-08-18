const path = require('path');

module.exports = function(defaultConfig) {
    defaultConfig.output.filename = 'app-entry.js';
    defaultConfig.output.path = path.resolve(process.cwd(), './node_modules/.nestecho-runtime');
    defaultConfig.module.rules[0].use.push(path.resolve(__dirname, './dist/loader/index.js'));
    return defaultConfig;
};
