// main/menubar.js

// Function for creating (and recreating) the menubar

const selectFolderDialog = require('./events');

function getMenubarTemplate(win, restartServer) {
    return [
        {
        label: "File",
        submenu: [
            {
                label: "Open folder",
                accelerator: "CmdOrCtrl+o",
                click: evt => {
                    const folderPath = selectFolderDialog(evt, win)
                    if (folderPath !== null) {
                        restartServer(win, folderPath)
                    }
                }
                    
            },
            {type: "separator"},
            {
            // TODO: Add keyboard shortcut
            label: "Home",
            click: () => win.loadFile('src/fontra/client/renderer/landing.html')
            },
            {
            // TODO: Add keyboard shortcut
            label: "Settings",
            click: () => win.loadFile('src/fontra/client/renderer/settings.html')
            },
            { type: "separator" },
            // {
            // label: "About dsedit",
            // click: evt => openAboutDialog(evt, win)
            // },
            // { type: "separator" },
            {
            label: "Quit",
            role: "quit"
            }
        ]
        },
        {
            label: "View",
            role: "viewMenu"
        },
        {
        label: "Window",
        role: "windowMenu"
        }
    ];
}

module.exports = getMenubarTemplate
