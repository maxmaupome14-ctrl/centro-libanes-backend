const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

schema = schema.replace(/@db\.\w+/g, '');

fs.writeFileSync('prisma/schema.prisma', schema);
console.log("Postgres db annotations removed successfully");
