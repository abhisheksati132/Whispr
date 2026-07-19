const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');

// Extract all IDs from HTML
const htmlIds = new Set();
let m;
const idRegex = /id="([^"]+)"/g;
while ((m = idRegex.exec(html)) !== null) htmlIds.add(m[1]);

// Extract all document.getElementById calls in app.js
const getByIdRegex = /document\.getElementById\('([^']+)'\)/g;
const jsIds = new Map();
while ((m = getByIdRegex.exec(js)) !== null) {
  jsIds.set(m[1], (jsIds.get(m[1]) || 0) + 1);
}

console.log('=== IDs fetched in app.js that are NOT in HTML ===');
let found = false;
for (const [id] of jsIds) {
  if (!htmlIds.has(id)) {
    console.log('MISSING: #' + id);
    found = true;
  }
}
if (!found) console.log('All IDs found in HTML!');

// Check for syntax errors by extracting function starts without closes
console.log('\n=== Checking for undefined function calls ===');
const funcCalls = ['renderDiaryList', 'renderBucketList', 'renderGlossaryList', 'renderBonsai', 'renderHeatmap', 'switchExtrasTab', 'changeAccent', 'changeSoundPack'];
funcCalls.forEach(fn => {
  if (!js.includes('function ' + fn) && !js.includes(fn + ' =')) {
    console.log('UNDEFINED FUNCTION: ' + fn);
  } else {
    console.log('OK: ' + fn);
  }
});
