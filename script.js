(() => {
  "use strict";

  const WORDS = [
    "Apple", "Moon", "Tiger", "Train", "Book", "River", "Bottle",
    "Monkey", "Laptop", "Bridge", "Garden", "Window", "Rocket",
    "Cloud", "Guitar", "Forest", "Pencil", "Castle", "Orange", "Ocean",
  ];
  const COLORS = ["Red", "Blue", "Yellow", "Green", "Purple", "Orange", "Pink", "White"];
  const EMOJIS = ["😀", "🍎", "🚗", "🌙", "🐶", "⭐", "🎈", "🍀", "🌻", "🎸"];
  const DIFFICULTIES = {
    easy: { length: 3, seconds: 5 },
    medium: { length: 5, seconds: 4 },
    hard: { length: 8, seconds: 3 },
    insane: { length: 12, seconds: 2 },
  };
  const COLOR_HEX = {
    Red: "#d77c72", Blue: "#7297b9", Yellow: "#c5a54e", Green: "#7fa27b",
    Purple: "#9b82af", Orange: "#d89562", Pink: "#ce8eaa", White: "#9eaaa4",
  };
  const HIGH_SCORE_KEY = "mindful-memory-high-score";
  const PLAYER_NAME_KEY = "mindful-memory-player-name";

  const $ = (selector) => document.querySelector(selector);
  const setupPanel = $("#setup-panel");
  const playPanel = $("#play-panel");
  const gameoverPanel = $("#gameover-panel");
  const sequenceGrid = $("#sequence-grid");
  const answerForm = $("#answer-form");
  const answerInput = $("#answer-input");
  const feedback = $("#feedback");
  const timerProgress = $("#timer-progress");
  const timerCircumference = 2 * Math.PI * 20;

  const state = {
    mode: "words",
    difficulty: "easy",
    sequence: [],
    score: 0,
    lives: 3,
    levels: 0,
    hints: 2,
    correctItems: 0,
    attemptedItems: 0,
    streak: 0,
    bestStreak: 0,
    timerId: null,
    hintsUsed: 0,
    soundOn: false,
    audioContext: null,
    highScore: loadHighScore(),
    highScoreAtStart: 0,
  };

  timerProgress.style.strokeDasharray = String(timerCircumference);

  function loadHighScore() {
    try {
      const saved = localStorage.getItem(HIGH_SCORE_KEY);
      if (!saved) return null;
      const record = JSON.parse(saved);
      if (!record || typeof record.name !== "string" || !Number.isFinite(record.score)) {
        $("#storage-note").textContent = "Your saved score could not be read; a new best can still be set.";
        return null;
      }
      return record;
    } catch {
      $("#storage-note").textContent = "Browser storage is unavailable; your best score may not be saved.";
      return null;
    }
  }

  function saveHighScore(name, score) {
    const record = { name, score };
    try {
      localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(record));
      state.highScore = record;
      $("#highscore-display").textContent = `${name} · ${score.toLocaleString()} pts`;
      return true;
    } catch {
      $("#storage-note").textContent = "Browser storage is unavailable; your best score could not be saved.";
      return false;
    }
  }

  function displayHighScore() {
    $("#highscore-display").textContent = state.highScore
      ? `${state.highScore.name} · ${state.highScore.score.toLocaleString()} pts`
      : "No score yet";
  }

  function chooseItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function createSequence(mode, length) {
    if (mode === "words") return Array.from({ length }, () => chooseItem(WORDS));
    if (mode === "colors") return Array.from({ length }, () => chooseItem(COLORS));
    if (mode === "emojis") return Array.from({ length }, () => chooseItem(EMOJIS));
    if (mode === "numbers") return Array.from({ length }, () => String(Math.floor(Math.random() * 10)));
    if (mode === "mixed") {
      const pools = [WORDS, COLORS, EMOJIS];
      return Array.from({ length }, (_, index) =>
        index % 2 === 1 ? String(Math.floor(Math.random() * 100)) : chooseItem(chooseItem(pools))
      );
    }
    return [];
  }

  function normalizedItems(value) {
    const normalized = value.trim().toLocaleLowerCase();
    if (state.mode === "numbers") {
      return normalized.replace(/[\s,]+/g, "").split("");
    }
    return normalized.split(/[\s,]+/).filter(Boolean);
  }

  function renderSequence(sequence, visible) {
    sequenceGrid.replaceChildren();
    sequenceGrid.setAttribute("aria-label", visible ? "Sequence to remember" : "Sequence hidden");
    sequence.forEach((item, index) => {
      const tile = document.createElement("span");
      tile.className = "sequence-tile";
      tile.style.animationDelay = `${Math.min(index * 35, 350)}ms`;
      if (!visible) {
        tile.classList.add("hidden-tile");
        tile.textContent = "•";
        tile.setAttribute("aria-label", "Hidden item");
      } else {
        tile.textContent = item;
        if (state.mode === "emojis" || (state.mode === "mixed" && EMOJIS.includes(item))) {
          tile.classList.add("emoji-tile");
        }
        if (state.mode === "numbers" || (state.mode === "mixed" && /^\d+$/.test(item))) {
          tile.classList.add("number-tile");
        }
        if (state.mode === "colors" || (state.mode === "mixed" && COLOR_HEX[item])) {
          tile.classList.add("color-tile");
          tile.style.backgroundColor = COLOR_HEX[item];
        }
      }
      sequenceGrid.append(tile);
    });
  }

  function setTimerProgress(fraction) {
    timerProgress.style.strokeDashoffset = String(timerCircumference * (1 - fraction));
  }

  function stopTimer() {
    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function setPhase(name, title, description) {
    $("#phase-eyebrow").textContent = name;
    $("#phase-title").textContent = title;
    $("#phase-description").textContent = description;
  }

  function startRound() {
    stopTimer();
    feedback.classList.add("hidden");
    answerForm.classList.add("hidden");
    $("#hint-button").disabled = false;
    $("#hint-button").classList.remove("hidden");
    $("#answer-hint").textContent = "Trust your first instinct.";
    answerInput.value = "";

    const settings = DIFFICULTIES[state.difficulty];
    const length = settings.length + state.levels;
    const bonusRound = state.levels > 0 && state.levels % 5 === 0;
    const seconds = bonusRound ? 10 : settings.seconds;
    state.sequence = createSequence(state.mode, length);

    $("#round-label").textContent = bonusRound ? `✦ BONUS ROUND ${state.levels / 5}` : `ROUND ${state.levels + 1}`;
    $("#live-dot").classList.add("is-live");
    setLives();
    setPhase(
      bonusRound ? "A LITTLE EXTRA" : "TAKE A GOOD LOOK",
      bonusRound ? "Bonus round!" : "Remember this",
      bonusRound
        ? "A little longer to look — and 100 bonus points if you get it right."
        : "Take a mental snapshot. It disappears when the timer runs out."
    );
    $("#timer").classList.remove("hidden");
    $("#timer-value").textContent = String(seconds);
    setTimerProgress(1);
    renderSequence(state.sequence, true);

    const deadline = Date.now() + seconds * 1000;
    state.timerId = window.setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      const fraction = remaining / (seconds * 1000);
      $("#timer-value").textContent = String(Math.ceil(remaining / 1000));
      setTimerProgress(fraction);
      if (remaining <= 0) {
        stopTimer();
        beginRecall();
      }
    }, 60);
  }

  function beginRecall() {
    $("#timer").classList.add("hidden");
    renderSequence(state.sequence, false);
    setPhase("YOUR TURN", "What do you remember?", "Type every item in order, with a space between each one.");
    answerForm.classList.remove("hidden");
    answerInput.focus();
  }

  function setLives() {
    const lives = $("#lives");
    lives.replaceChildren();
    for (let index = 0; index < 3; index += 1) {
      const heart = document.createElement("span");
      heart.textContent = "♥";
      if (index >= state.lives) heart.className = "lost";
      lives.append(heart);
    }
    lives.setAttribute("aria-label", `${state.lives} ${state.lives === 1 ? "life" : "lives"} remaining`);
  }

  function updateStats() {
    $("#score-display").textContent = state.score.toLocaleString();
    $("#streak-display").textContent = state.bestStreak.toLocaleString();
    const accuracy = state.attemptedItems
      ? Math.round((state.correctItems / state.attemptedItems) * 100)
      : null;
    $("#accuracy-display").textContent = accuracy === null ? "—" : `${accuracy}%`;
  }

  function handleAnswer(event) {
    event.preventDefault();
    if (answerForm.classList.contains("hidden")) return;
    const answer = normalizedItems(answerInput.value);
    const expected = state.sequence.map((item) => item.toLocaleLowerCase());
    const matched = expected.reduce(
      (count, item, index) => count + (answer[index] === item ? 1 : 0),
      0
    );
    const correct = answer.length === expected.length && answer.every((item, index) => item === expected[index]);

    state.correctItems += matched;
    state.attemptedItems += state.sequence.length;
    answerForm.classList.add("hidden");
    feedback.classList.remove("hidden", "is-wrong");
    feedback.replaceChildren();

    const title = document.createElement("div");
    title.className = "feedback-title";
    const detail = document.createElement("div");
    detail.className = "feedback-sequence";
    if (correct) {
      const bonusRound = state.levels > 0 && state.levels % 5 === 0;
      const points = state.sequence.length * 10 + (bonusRound ? 100 : 0);
      state.score += points;
      state.levels += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      if (!state.highScore || state.score > state.highScore.score) {
        const playerName = ($("#player-name").value.trim() || "Player").slice(0, 18);
        saveHighScore(playerName, state.score);
      }
      title.textContent = `Perfect recall! +${points} points`;
      detail.textContent = bonusRound ? "Your 100 bonus points are included. Lovely work." : "One more level, one step further.";
      feedback.append(title, detail);
      if (state.streak === 10) detail.textContent += " 🔥 10-round streak!";
    } else {
      state.lives -= 1;
      state.streak = 0;
      feedback.classList.add("is-wrong");
      title.textContent = `Nearly! You remembered ${matched} of ${state.sequence.length}.`;
      detail.textContent = `The sequence was: ${state.sequence.join("  ·  ")}`;
      feedback.append(title, detail);
    }

    updateStats();
    renderSequence(state.sequence, true);
    setLives();
    const nextButton = document.createElement("button");
    nextButton.className = "primary-button";
    nextButton.type = "button";
    nextButton.textContent = state.lives > 0 ? (correct ? "Keep going →" : "Try another →") : "See your results →";
    nextButton.addEventListener("click", () => {
      if (state.lives > 0) startRound();
      else endGame();
    });
    feedback.append(nextButton);
    nextButton.focus();
    playTone(correct ? 660 : 240);
  }

  function getAchievements() {
    const awards = [];
    if (state.levels >= 1) awards.push("🥉 First win");
    if (state.levels >= 10) awards.push("🥈 Memory master");
    if (state.levels >= 20) awards.push("🥇 20 levels");
    if (state.bestStreak >= 10) awards.push("🔥 10 streak");
    if (state.levels >= 1) awards.push("👑 Perfect round");
    return awards;
  }

  function endGame() {
    stopTimer();
    $("#live-dot").classList.remove("is-live");
    setupPanel.classList.add("hidden");
    playPanel.classList.add("hidden");
    gameoverPanel.classList.remove("hidden");
    $("#round-label").textContent = "SESSION COMPLETE";
    const accuracy = state.attemptedItems
      ? Math.round((state.correctItems / state.attemptedItems) * 100)
      : 0;
    const playerName = ($("#player-name").value.trim() || "Player").slice(0, 18);
    const isNewBest = state.score > state.highScoreAtStart;

    $("#gameover-title").textContent = state.levels ? "Beautifully done." : "Every try counts.";
    $("#gameover-copy").textContent = isNewBest && state.score > 0
      ? `Wonderful work, ${playerName} — you just set a new personal best.`
      : `You made it through ${state.levels} ${state.levels === 1 ? "level" : "levels"}. Your mind showed up, and that counts.`;
    $("#final-score").textContent = state.score.toLocaleString();
    $("#final-level").textContent = String(state.levels);
    $("#final-accuracy").textContent = `${accuracy}%`;
    $("#achievement-list").replaceChildren();
    getAchievements().forEach((achievement) => {
      const pill = document.createElement("span");
      pill.className = "achievement-pill";
      pill.textContent = achievement;
      $("#achievement-list").append(pill);
    });

    if (isNewBest && state.score > 0) saveHighScore(playerName, state.score);
    displayHighScore();
    $("#play-again-button").focus();
  }

  function startGame() {
    state.highScoreAtStart = state.highScore ? state.highScore.score : 0;
    state.score = 0;
    state.lives = 3;
    state.levels = 0;
    state.hints = 2;
    state.correctItems = 0;
    state.attemptedItems = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.hintsUsed = 0;
    setupPanel.classList.add("hidden");
    gameoverPanel.classList.add("hidden");
    playPanel.classList.remove("hidden");
    updateStats();
    startRound();
  }

  function useHint() {
    if (state.hints <= 0 || answerForm.classList.contains("hidden")) return;
    state.hints -= 1;
    state.hintsUsed += 1;
    $("#answer-hint").textContent = `The first item starts with “${state.sequence[0][0]}”.`;
    $("#hints-remaining").textContent = `(${state.hints} left)`;
    if (state.hints === 0) $("#hint-button").disabled = true;
  }

  function playTone(frequency) {
    if (!state.soundOn) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!state.audioContext) state.audioContext = new AudioContext();
      const oscillator = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, state.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioContext.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(state.audioContext.destination);
      oscillator.start();
      oscillator.stop(state.audioContext.currentTime + 0.18);
    } catch {
      $("#sound-label").textContent = "Sound unavailable";
    }
  }

  document.querySelectorAll(".mode-card").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((card) => {
        const selected = card === button;
        card.classList.toggle("selected", selected);
        card.setAttribute("aria-pressed", String(selected));
      });
      state.mode = button.dataset.mode;
    });
  });

  document.querySelectorAll(".difficulty-option").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".difficulty-option").forEach((option) => {
        const selected = option === button;
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
      state.difficulty = button.dataset.difficulty;
    });
  });

  $("#start-button").addEventListener("click", startGame);
  $("#play-again-button").addEventListener("click", () => {
    gameoverPanel.classList.add("hidden");
    setupPanel.classList.remove("hidden");
    $("#round-label").textContent = "READY WHEN YOU ARE";
    $("#live-dot").classList.remove("is-live");
    $("#player-name").focus();
  });
  answerForm.addEventListener("submit", handleAnswer);
  $("#hint-button").addEventListener("click", useHint);
  $("#sound-toggle").addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    $("#sound-toggle").setAttribute("aria-pressed", String(state.soundOn));
    $("#sound-icon").textContent = state.soundOn ? "♫" : "♩";
    $("#sound-label").textContent = state.soundOn ? "Sound on" : "Sound off";
    if (state.soundOn) playTone(520);
  });
  $("#player-name").value = (() => {
    try {
      return localStorage.getItem(PLAYER_NAME_KEY) || "";
    } catch {
      $("#storage-note").textContent = "Browser storage is unavailable; your name and score may not be saved.";
      return "";
    }
  })();
  $("#player-name").addEventListener("change", (event) => {
    try {
      localStorage.setItem(PLAYER_NAME_KEY, event.target.value.trim().slice(0, 18));
    } catch {
      $("#storage-note").textContent = "Browser storage is unavailable; your name and score may not be saved.";
    }
  });

  displayHighScore();
})();
