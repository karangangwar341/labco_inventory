const fs = require('fs');
const path = require('path');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const updated = content
        .replace(/(from\s+['"])(\.[^'"]+?)\.js(['"])/g, '$1$2$3')
        .replace(/(import\s+['"])(\.[^'"]+?)\.js(['"])/g, '$1$2$3')
        .replace(/(import\(['"])(\.[^'"]+?)\.js(['"]\))/g, '$1$2$3');
      if (updated !== content) {
        fs.writeFileSync(fullPath, updated, 'utf8');
        console.log('Updated:', fullPath);
      }
    }
  }
}

walk(path.resolve(__dirname, '../src/server'));
console.log('Finished updating imports in src/server');
