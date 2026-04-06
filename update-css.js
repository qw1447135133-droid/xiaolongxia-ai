const fs = require('fs');
const content = `@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
:root { color-scheme: dark; }
body { 
  background-color: #0B0E11; 
  color: #EAECEF; 
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
  margin: 0; 
  font-size: 14px; 
}
#root { width: 100%; min-height: 100vh; text-align: left; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #181A20; }
::-webkit-scrollbar-thumb { background: #2B3139; border-radius: 3px; }
`;
fs.writeFileSync('D:\\GitHub\\Quantitative Finance\\frontend\\src\\index.css', content);
