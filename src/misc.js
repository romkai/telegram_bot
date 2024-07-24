const fs = require('fs');
const path = require('path');
const fsExtra = require('fs-extra');

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

function shortText(text) {
  const shortedText = String(text).slice(0, 100);
  return shortedText + (shortedText.length < String(text).length ? '...' : '');
}

function pathExists(fileOrDirPath) {
  return new Promise((resolve) => {
    fs.access(fileOrDirPath, fs.constants.F_OK, (err) => resolve(!err));
  });
}

async function makeDir(directoryPath) {
  return new Promise((resolve, reject) => {
    fs.mkdir(directoryPath, { recursive: true }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function writeFile(filePath, content, options = {}) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, content, options, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function writeFileWithMkDir(filePath, content, options = {}) {
  const directoryPath = path.dirname(filePath);
  if (await pathExists(directoryPath) === false) {
    await makeDir(directoryPath);
  }

  await writeFile(filePath, content, options);
}

async function unlinkFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

const deleteOldFiles = async (downloadsDir, hours = 24) => {
  try {
    const files = await fsExtra.readdir(downloadsDir);
    console.log('Found files: ', files.length);

    const currentTime = Date.now();

    for (const file of files) {
      const filePath = path.join(downloadsDir, file);
      const stats = await fsExtra.stat(filePath);

      if (currentTime - stats.birthtimeMs > hours * 60 * 60 * 1000) {
        await fsExtra.remove(filePath);
        console.log(`Deleted: ${filePath}`);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
};

module.exports = {
  delay,
  shortText,
  writeFileWithMkDir,
  pathExists,
  unlinkFile,
  deleteOldFiles,
};
