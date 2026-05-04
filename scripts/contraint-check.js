const data = require('../data/duas.json');

console.log("Total:", data.length);

const long = data.filter(d => d.arabic.length > 500);
console.log("Too long:", long.length);

const empty = data.filter(d => !d.arabic);
console.log("Empty:", empty.length);