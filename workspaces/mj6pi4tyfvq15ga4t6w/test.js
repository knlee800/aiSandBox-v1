```js
const fs = require('fs');

function loadConfig() {
  try {
    const data = fs.readFileSync('./config.json', 'utf8');
    const config = JSON.parse(data);
    return config;
  } catch (err) {
    console.error('Failed to read config:', err.message);
    return null;
  }
}

function main() {
  const config = loadConfig();
  if (config) {
    console.log('App Name:', config.appName);
    console.log('Version:', config.version);
    console.log('Debug Mode:', config.debug ? 'ON' : 'OFF');
  } else {
    console.log('No config available.');
  }
}

main();
```