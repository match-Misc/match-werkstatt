const fs = require('fs');
let content = fs.readFileSync('src/components/WorkshopOrderDetails.tsx', 'utf8');

// 1. Change 10000 to 3000 for setInterval
content = content.replace(/setInterval\(syncFolder,\s*10000\)/, 'setInterval(syncFolder, 3000)');

// 2. Remove duplicate order info from Dashboard tab. Where is it?
// Usually under activeTab === 'dashboard'. Let's search for it.
// I will just use sed or string replacement for the layout changes.
fs.writeFileSync('src/components/WorkshopOrderDetails.tsx', content);
