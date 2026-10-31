# Memory Challenge

A memory challenge game with both a browser version and a Python console version.

## Play the website

Open `index.html` in a browser. The website is built with plain HTML, CSS, and
JavaScript and does not need a package install or server. Your personal best and
player name are stored locally in your browser.

To preview it through a local web server instead:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

The static website can be published with GitHub Pages by pushing the project to
a GitHub repository and enabling Pages for the repository's root folder.

## Run

To play the original terminal version:

```powershell
python main.py
```

Choose a game mode and difficulty, memorize each sequence before it disappears,
and type it back in order. Correct rounds increase the sequence length; mistakes
cost one of three lives. The game also includes hints, bonus rounds, achievements,
accuracy tracking, and a saved high score in `high_score.json`.

The high-score file is created beside `main.py` the first time a new best score
is achieved.
