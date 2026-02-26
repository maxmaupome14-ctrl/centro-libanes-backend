require('dotenv').config();
require('ts-node').register({ transpileOnly: true });

try {
    require('./src/index.ts');
} catch (e) {
    console.error("FAILED TO LOAD APP:", e);
    process.exit(1);
}
