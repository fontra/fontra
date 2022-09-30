const { dialog } = require("electron");

function selectFolderDialog(evt, win) {
    const files = dialog.showOpenDialogSync(win, {
        properties: ["openDirectory", "createDirectory"],
        defaultPath: global.folder
    });
    if (files && files.length > 0) return files[0];
    return null;
}

module.exports = selectFolderDialog
