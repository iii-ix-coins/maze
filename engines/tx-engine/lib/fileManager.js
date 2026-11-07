const fs = require('fs/promises');
const path = require('path');
async function saveJsonAtomic(filePath, data) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tempPath, json, 'utf8');
  await fs.rename(tempPath, filePath);
  return filePath;
}
module.exports = {
  saveJsonAtomic
};