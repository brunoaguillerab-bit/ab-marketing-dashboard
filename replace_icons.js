const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
html = html.split('<i data-lucide="arrow-down-up" size="10"></i>').join('<i data-lucide="chevrons-up-down" size="13" class="sort-icon"></i>');
fs.writeFileSync('index.html', html);
console.log('Replaced all arrow icons.');
