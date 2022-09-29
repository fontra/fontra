# Fontra

![Fontra Icon](https://github.com/BlackFoundryCom/fontra/blob/main/fontra-icon.svg?raw=true)

Fontra is an in-development browser-based font editor. It consists of two main parts:

- Fontra client — runs in the browser, written in JavaScript
- Fontra server — runs locally or on a remote machine, written in Python

## Installing Fontra

- Check out the repo, cd into the root of the repo

- Ensure you have Python >= 3.10 installed, preferably from [python.org](https://www.python.org/downloads/)

- Create a Python venv in the root of the repo:

    `python3 -m venv venv --prompt=fontra`

- Activate venv:

    `source venv/bin/activate`

- Install dependencies:

    `pip install --upgrade pip`

    `pip install -r requirements.txt`

    `pip install -e .`

    `npm install`


## Running Fontra

### In an Electron app

- Run an Electron app with a path to a folder containing fonts (.designspace, .ufo, .ttf or .otf):

    `npm run start -- /path/to/a/folder`

### In a web browser

- Start the fontra server with a path to a folder containing fonts (.designspace, .ufo, .ttf or .otf), using the `filesystem` subcommand:

    `fontra --launch filesystem /path/to/a/folder`

- The default browser will then navigate to:

    `http://localhost:8000/`

- To use Fontra with .rcjk data on disk, or to connect to a remote rcjk server, install the [`fontra-rcjk`](https://github.com/BlackFoundryCom/fontra-rcjk) plugin package. Then you can start it with a robocjk server hostname, using the `rcjk` subcommand provided by the `fontra-rcjk` plugin:

    `fontra --launch rcjk some-robocjk-server.some-domain.com`
