// main/menubar.js

// Function for creating (and recreating) the menubar

function getMenubarTemplate(win) {
    return [
        {
        label: "File",
        submenu: [
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
