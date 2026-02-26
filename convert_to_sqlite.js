const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

schema = schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"')
    .replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url = "file:./dev.db"');

const enumMatches = [...schema.matchAll(/enum (\w+) \{[\s\S]*?\}/g)];
const enumNames = enumMatches.map(m => m[1]);

schema = schema.replace(/enum \w+ \{[\s\S]*?\}/g, '');

enumNames.forEach(enumName => {
    const regex = new RegExp(`(\\w+)\\s+${enumName}(\\s+@default\\(([^)]+)\\))?`, 'g');
    schema = schema.replace(regex, (match, fieldName, hasDefault, defaultVal) => {
        let defaultStr = '';
        if (hasDefault) {
            defaultStr = ` @default("${defaultVal}")`;
        }
        return `${fieldName} String${defaultStr}`;
    });

    const regexOptional = new RegExp(`(\\w+)\\s+${enumName}\\?`, 'g');
    schema = schema.replace(regexOptional, `$1 String?`);
});

schema = schema.replace(/Json\?/g, 'String?');
schema = schema.replace(/Json/g, 'String');

fs.writeFileSync('prisma/schema.prisma', schema);
console.log("Schema converted to SQLite successfully");
