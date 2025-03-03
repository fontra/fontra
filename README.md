# Fontra

![Fontra Icon](https://github.com/googlefonts/fontra/blob/main/fontra-icon.svg?raw=true)

Fontra is an in-development browser-based font editor. It consists of two main parts:

- Fontra client — runs in the browser, written in JavaScript
- Fontra server — runs locally or on a remote machine, written in Python

## Installing Fontra

### Download and install _Fontra Pak_

[Fontra Pak](https://github.com/googlefonts/fontra-pak) is a Fontra distribution for macOS and Windows. It is a self-contained Fontra server application, which allows you to view and edit fonts in the default browser. We don't have releases for it yet, but you can grab the latest nightly build from the topmost [“Build Application”](https://github.com/googlefonts/fontra-pak/actions) workflow, or, more conveniently, directly from [fontra.xyz](https://fontra.xyz).

Fontra Pak should also work on Linux and other platforms, but you will have to build it from the sources.

### Install from the source code

#### Requirements

- Ensure you have **Python >= 3.10** installed, preferably from [python.org](https://www.python.org/downloads/)

- Ensure you have **Node.js >= 20** installed, preferably from [nodejs.org](https://nodejs.org/en/download/)

#### Setup

- Check out the Fontra repository (the one you are reading this from), cd into the root of the repository

- Create a Python venv in the root of the repo:

  `python3.10 -m venv venv --prompt=fontra`

  (Replace `python3.10` with `python3.11` if you have 3.11 instead.)

- Activate venv:

  `source venv/bin/activate`

- Install general dependencies:

  `pip install --upgrade pip`

  `pip install -r requirements.txt`

  `pip install -e .`

#### Testing

The following steps are needed if you want to run the automated tests and if you want to contribute:

- Install dependencies to run the automated tests:

  `pip install -r requirements-dev.txt`

- Install `pre-commit` to run formatters and linters:

  `pre-commit install --install-hooks`

- To verify if everything is working correctly, run both test suites:

  `pytest`

  `npm test`

#### Running

- Start the fontra server with a path to a folder containing fonts (.designspace, .ufo, .ttf or .otf), using the `filesystem` subcommand:

  `fontra --launch filesystem /path/to/a/folder`

- The default browser will then navigate to:

  `http://localhost:8000/`

- To use Fontra with .rcjk data on disk, or to connect to a remote rcjk server, install the [`fontra-rcjk`](https://github.com/googlefonts/fontra-rcjk) plugin package. Then you can start it with a robocjk server hostname, using the `rcjk` subcommand provided by the `fontra-rcjk` plugin:

  `fontra --launch rcjk some-robocjk-server.some-domain.com`

- To use Fontra in development mode, add `--dev` to the command line:

  `fontra --dev --launch filesystem /path/to/a/folder`

With this option in place, a separate process will be spawned which watches for any changes made to the Javascript files, and automatically bundles these into the client directory on save. Additionally, in developer mode, Javascript errors report a more human-readable traceback.

## Roadmap

The following list of features is not complete, but gives you a rough idea of where we are now, and where we are headed. A green checkmark means: “This feature has been implemented”.

### Input / Output

- Read .designspace ✅
- Write .designspace ✅
- Respond to external .designspace changes (automatic reload)
- Read .ufo ✅
- Write .ufo ✅
- Respond to external .ufo changes (automatic reload) ✅
- Read .ttf + variable .ttf ✅
- Read .otf + variable .otf ✅
- Write .ttf + variable .ttf (For “hot fixes”. Currently not planned, will still require export step.)
- Write .otf + variable .otf (Ditto.)
- Respond to external .ttf and .otf changes (automatic reload)
- Read .glyphs and .glyphspackage ✅ (Via [fontra-glyphs](https://github.com/googlefonts/fontra-glyphs))
- Write .glyphs and .glyphspackage

### Text viewing / editing

- Basic live text entry, including `/glyphname` notation ✅
- Multi-line text ✅
- Basic glyph selection (pick glyph from list) ✅
- Basic designspace navigation (via axis sliders) ✅
- Show live interpolation ✅
- Hand tool for scrolling ✅
- Scroll with gestures ✅
- Zoom with gestures ✅
- Zoom with short-cuts ✅
- Advanced character / glyph search
- Display kerning
- Apply proper text shaping
- Full screen mode ✅
- Right-to-left mode
- Vertical top-to-bottom mode
- Enter “edit mode” for glyph by double-clicking on a glyph in the text ✅

### Glyph editing

- Basic outline editing (move points) ✅
- Basic pen tool (draw points) ✅
- Edit (variable) component parameters ✅
- Decompose (variable) component ✅
- First-class support for quadratic curves ✅
- Multi-level undo/redo, per glyph ✅
- Interactive sidebearing editing
- Numeric sidebearing editing ✅
- Numeric advance width editing ✅
- Pen tool for quadratic curves ✅ (experimental)
- Decent outline editing (adding/removing points, removing contours) ✅ (with caveats)
- Select segments ✅
- Advanced outline editing: edit segments
- Connecting open paths ✅
- Show point coordinates and component origins numerically ✅
- Knife tool ✅
- Shape tool ✅
- Measure tool ✅
- Copy / paste ✅
- Create new glyphs ✅
- Delete glyphs ✅
- Add / remove (variable) components ✅
- Anchors ✅
- Guidelines (local, glyph level) ✅
- Guidelines (global, font level)
- View background layers
- Background image for tracing / reference ✅
- Edit local variation axes ✅
- Edit local sources/layers ✅
- Built-in support for Non-Linear Interpolation
- Remove overlap and other path operators (subtract, intersect, exclude) ✅
- Transformation panel ✅

### Font-level viewing / editing

- Create new font project ✅ (Fontra Pak)
- Cell-based font overview ✅
- List-based font overview
- Edit font meta data (“font info”) ✅
- Edit kerning
- Edit OpenType features
- Edit variation axes ✅
- Visualize and edit variation axis mapping (avar) ✅
- Visualize and edit cross-axis variation axis mapping (avar-2) ✅
- Visualize and edit status field definitions ✅

### Multiple windows

- Propagate changes across multiple windows in real time ✅
- Browser URL encodes most view settings ✅

### Deployment

- Basic standalone desktop application for macOS and Windows ✅ (Via [Fontra Pak](https://github.com/googlefonts/fontra-pak))
- Basic multi-user server deployment with database storage ✅ (Via [fontra-rcjk](https://github.com/googlefonts/fontra-rcjk), [django-robo-cjk](https://github.com/googlefonts/django-robo-cjk), behind [NGINX](https://www.nginx.com/))
- Research GitHub REST API: can Fontra be a GitHub gateway in a practical way?
- Research database solutions for server-based font storage
- Desktop app with integrated browser and auto-update feature (made with Electron or similar)

### Scripting

- A Python scripting library that talks directly to the Fontra server
- JS scripting for in-browser automation
- Python scripting for in-browser automation via WASM/PyOdide
- Add various plug-in APIs, for example:
  - Visualization layer plug-ins for the glyph editor
  - Tool plug-ins

### Export

- FontMake integration (in Fontra Pak) ✅
- `fontc` integration
- Incremental compilation using `fontc`
- Experimental [`glyf1`](https://github.com/harfbuzz/boring-expansion-spec/blob/main/glyf1-varComposites.md) export ✅ (Via [fontra-compile](https://github.com/googlefonts/fontra-compile))

### Collaborative features

- Visualizing the selection of others
- Add review notes / comments
- Suggested edits

### Code structure

- Client/server architecture (JavaScript/Python) ✅
- Local or (networked) remote server ✅
- Client/server communication via JSON objects over a WebSocket ✅
- Highly modular:
  - Pluggable client views ✅
  - Pluggable read/write storage backends ✅
  - Client-agnostic and storage-agnostic server centerpiece ✅
- Asynchronous programming model using async/await ✅

### Future possibilities

- Serverless Fontra
- Peer-to-peer collaboration

## Translations

We are maintaining various language translations of the UI in a spreadsheet. Please contact us if you'd like to contribute (to) a translation.

- [Translation Documentation](https://docs.google.com/spreadsheets/d/1woTU8dZCHJh7yvdk-N1kgQBUj4Sn3SdRsbKgn6ltJQs/edit?gid=1731105247#gid=1731105247)
- [Fontra UI Strings spreadsheet](https://docs.google.com/spreadsheets/d/1woTU8dZCHJh7yvdk-N1kgQBUj4Sn3SdRsbKgn6ltJQs/edit?usp=sharing)
