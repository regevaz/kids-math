const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const streakEl = document.querySelector("#streak");
const livesEl = document.querySelector("#lives");
const questionEl = document.querySelector("#question");
const roundLabelEl = document.querySelector("#roundLabel");
const feedbackEl = document.querySelector("#feedback");
const playArea = document.querySelector(".play-area");
const startOverlay = document.querySelector("#startOverlay");
const startGame = document.querySelector("#startGame");
const tableSelect = document.querySelector("#tableSelect");
const pauseGame = document.querySelector("#pauseGame");
const newGame = document.querySelector("#newGame");

const fruits = [
  { icon: "🍎", color: "#d9382e" },
  { icon: "🍊", color: "#e98626" },
  { icon: "🍋", color: "#e0b72f" },
  { icon: "🍐", color: "#75a843" },
  { icon: "🫐", color: "#4459b8" },
  { icon: "🍇", color: "#7b4ab0" },
  { icon: "🍑", color: "#df7657" },
  { icon: "🥝", color: "#6b8f35" },
];
const slashMarks = [];
const particles = [];
const scoreBursts = [];

let answers = [];
let running = false;
let paused = false;
let lastTime = 0;
let spawnTimer = 0;
let centerCue = null;
let current = null;
let score = 0;
let streak = 0;
let lives = 3;
let round = 1;
let speed = 38;
let tableMode = "mixed";

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chooseFactors() {
  const fixed = tableMode === "mixed" ? rand(2, 12) : Number(tableMode);
  return Math.random() > 0.5 ? [fixed, rand(2, 12)] : [rand(2, 12), fixed];
}

function newQuestion() {
  const [a, b] = chooseFactors();
  current = { a, b, answer: a * b };
  questionEl.textContent = `${a} × ${b}`;
  roundLabelEl.textContent = `שלב ${round}`;
  answers = [];
  spawnTimer = 0;
  createAnswerSet();
}

function createAnswerSet() {
  const values = new Set([current.answer]);
  while (values.size < 5) {
    const near = current.answer + rand(-18, 18);
    const candidate = Math.random() > 0.35 ? near : rand(4, 144);
    if (candidate > 0 && candidate !== current.answer) {
      values.add(candidate);
    }
  }

  const shuffled = [...values].sort(() => Math.random() - 0.5);
  const width = canvas.clientWidth;
  const step = width / shuffled.length;
  answers = shuffled.map((value, index) => ({
    value,
    x: step * index + step / 2 + rand(-18, 18),
    y: -rand(90, 280),
    radius: 38,
    speed: speed + rand(-8, 20),
    fruit: fruits[rand(0, fruits.length - 1)],
    wobble: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.5,
    scale: 0.94 + Math.random() * 0.16,
    trail: [],
    cut: false,
  }));
}

function bumpElement(element) {
  element.classList.remove("is-bumping");
  void element.offsetWidth;
  element.classList.add("is-bumping");
}

function pulseFeedback() {
  feedbackEl.classList.remove("is-pulsing");
  void feedbackEl.offsetWidth;
  feedbackEl.classList.add("is-pulsing");
}

function updateHud(bump = null) {
  scoreEl.textContent = score;
  streakEl.textContent = streak;
  livesEl.textContent = "♥".repeat(Math.max(lives, 0));
  if (bump === "score") bumpElement(scoreEl.parentElement);
  if (bump === "streak") bumpElement(streakEl.parentElement);
  if (bump === "lives") bumpElement(livesEl.parentElement);
}

function setFeedback(text, tone = "normal") {
  feedbackEl.textContent = text;
  feedbackEl.style.borderColor = tone === "good" ? "#1f8a70" : tone === "bad" ? "#c84b31" : "#d9ded8";
  pulseFeedback();
}

function start() {
  tableMode = tableSelect.value;
  score = 0;
  streak = 0;
  lives = 3;
  round = 1;
  speed = 38;
  paused = false;
  running = true;
  startOverlay.classList.remove("is-visible");
  pauseGame.textContent = "השהיה";
  setFeedback("קדימה. מצאו את התשובה הנכונה!");
  centerCue = null;
  slashMarks.length = 0;
  particles.length = 0;
  scoreBursts.length = 0;
  updateHud("score");
  resizeCanvas();
  newQuestion();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function stopWithMessage(title, message) {
  running = false;
  startOverlay.classList.add("is-visible");
  startOverlay.querySelector("h2").textContent = title;
  startOverlay.querySelector("p").textContent = message;
  startGame.textContent = "שחקו שוב";
}

function correct(x, y) {
  score += 10 + Math.min(streak, 10) * 2;
  streak += 1;
  if (streak > 0 && streak % 5 === 0) {
    score += 20;
    setFeedback(`רצף ${streak}! בונוס זריזות נוסף.`, "good");
  } else {
    setFeedback("יפה! חתכתם את התשובה הנכונה.", "good");
  }
  round += 1;
  speed = Math.min(105, speed + 2);
  slashMarks.push({ x, y, age: 0, type: "good" });
  burst(x, y, "good");
  scoreBursts.push({ x, y, text: `+${10 + Math.min(streak - 1, 10) * 2}`, age: 0, type: "good" });
  showCenterCue("בול!", "+10", "good");
  updateHud("score");
  bumpElement(streakEl.parentElement);
  newQuestion();
}

function wrong(x = canvas.clientWidth / 2, y = canvas.clientHeight / 2, reason = "slice") {
  lives -= 1;
  streak = 0;
  if (reason === "miss") {
    setFeedback(`הפרי נפל. התשובה הייתה ${current.answer}.`, "bad");
    splash(x, y);
    showCenterCue("נפל!", `התשובה: ${current.answer}`, "bad");
  } else {
    setFeedback(`לא הפעם. התשובה הייתה ${current.answer}.`, "bad");
    slashMarks.push({ x, y, age: 0, type: "bad" });
    burst(x, y, "bad");
    showCenterCue("אופס!", `התשובה: ${current.answer}`, "bad");
  }
  playArea.classList.remove("is-shaking");
  void playArea.offsetWidth;
  playArea.classList.add("is-shaking");
  updateHud("lives");
  if (lives <= 0) {
    stopWithMessage("נגמרו החיים", `צברתם ${score} נקודות. נסו שוב ותראו איך הרצף עולה.`);
  } else {
    newQuestion();
  }
}

function checkAnswer(value, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
  if (!running || paused || !current) return;
  if (Number(value) === current.answer) {
    correct(x, y);
  } else {
    wrong(x, y);
  }
}

function drawBackground(width, height) {
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "rgba(255,255,255,0.16)");
  sky.addColorStop(0.55, "rgba(22,131,109,0.045)");
  sky.addColorStop(1, "rgba(229,169,63,0.08)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.38)";
  for (let i = 0; i < 7; i += 1) {
    const y = 118 + i * 62;
    ctx.fillRect(0, y, width, 1);
  }

  const focus = ctx.createRadialGradient(width * 0.5, height * 0.48, 60, width * 0.5, height * 0.48, Math.max(width, height) * 0.58);
  focus.addColorStop(0, "rgba(255,255,255,0.0)");
  focus.addColorStop(1, "rgba(24,32,42,0.08)");
  ctx.fillStyle = focus;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(24,32,42,0.055)";
  ctx.beginPath();
  ctx.arc(width - 96, height - 86, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(229,169,63,0.75)";
  ctx.beginPath();
  ctx.roundRect(width - 150, height - 35, 86, 6, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function showCenterCue(title, subtitle, type) {
  centerCue = { title, subtitle, type, age: 0 };
}

function burst(x, y, type) {
  const palette = type === "good"
    ? ["#e5a93f", "#16836d", "#ffffff", "#75a843", "#2669b5"]
    : ["#ca4a34", "#18202a", "#ffffff", "#e98626"];

  for (let i = 0; i < 26; i += 1) {
    const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.32;
    const force = rand(type === "good" ? 120 : 70, type === "good" ? 260 : 150);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force - (type === "good" ? 40 : 10),
      size: rand(4, type === "good" ? 9 : 7),
      color: palette[i % palette.length],
      type,
      age: 0,
      life: rand(520, 920),
    });
  }
}

function splash(x, y) {
  const palette = ["#e98626", "#ca4a34", "#e5a93f", "#75a843", "#ffffff"];
  particles.push({
    x,
    y: y + 4,
    vx: 0,
    vy: 0,
    size: 14,
    color: "rgba(202,74,52,0.72)",
    type: "splash-ring",
    age: 0,
    life: 1500,
  });

  for (let i = 0; i < 30; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const spread = rand(80, 250) * side * (0.45 + Math.random() * 0.55);
    particles.push({
      x,
      y,
      vx: spread,
      vy: -rand(90, 270),
      size: rand(4, 11),
      color: palette[i % palette.length],
      type: "splash",
      age: 0,
      life: rand(1100, 1800),
    });
  }
}

function drawFruitTrail(answer) {
  for (let i = 0; i < answer.trail.length; i += 1) {
    const point = answer.trail[i];
    const alpha = (i + 1) / answer.trail.length;
    ctx.save();
    ctx.globalAlpha = alpha * 0.13;
    ctx.fillStyle = answer.fruit.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 22 * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAnswer(answer) {
  const wobbleX = Math.sin(answer.wobble) * 5;
  drawFruitTrail(answer);

  ctx.save();
  ctx.translate(answer.x + wobbleX, answer.y);
  ctx.rotate(Math.sin(answer.wobble * 0.7) * 0.08 + answer.spin);
  ctx.scale(answer.scale, answer.scale);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#18202a";
  ctx.beginPath();
  ctx.ellipse(0, 42, 42, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.font = "84px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(answer.fruit.icon, 0, -7);

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath();
  ctx.roundRect(-31, 12, 62, 38, 8);
  ctx.fill();

  ctx.strokeStyle = answer.fruit.color;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.fillStyle = "#17212b";
  ctx.font = "900 24px Arial";
  ctx.fillText(answer.value, 0, 32);
  ctx.restore();
}

function drawSlashes(delta) {
  for (let i = slashMarks.length - 1; i >= 0; i -= 1) {
    const mark = slashMarks[i];
    mark.age += delta;
    const alpha = Math.max(0, 1 - mark.age / 820);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = mark.type === "good" ? "rgba(229,169,63,0.55)" : "rgba(202,74,52,0.42)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = mark.type === "good" ? "#e5a93f" : "#ca4a34";
    ctx.lineWidth = mark.type === "good" ? 11 : 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(mark.x - 48, mark.y + 38);
    ctx.lineTo(mark.x + 58, mark.y - 42);
    ctx.stroke();

    if (mark.type === "bad") {
      ctx.beginPath();
      ctx.moveTo(mark.x - 42, mark.y - 38);
      ctx.lineTo(mark.x + 48, mark.y + 38);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#ffffff";
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mark.x - 40, mark.y + 30);
      ctx.lineTo(mark.x + 48, mark.y - 34);
      ctx.stroke();
    }

    ctx.restore();
    if (mark.age > 820) slashMarks.splice(i, 1);
  }
}

function drawParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.age += delta;
    particle.x += (particle.vx * delta) / 1000;
    particle.y += (particle.vy * delta) / 1000;
    particle.vy += (particle.type === "good" ? 240 : particle.type === "splash" ? 420 : 330) * delta / 1000;

    const alpha = Math.max(0, 1 - particle.age / particle.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.age / 90);
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = particle.type === "good" ? 10 : particle.type === "splash-ring" ? 14 : 5;

    if (particle.type === "splash-ring") {
      const progress = Math.min(1, particle.age / particle.life);
      ctx.rotate(-particle.age / 90);
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 5 * (1 - progress);
      ctx.beginPath();
      ctx.ellipse(0, 0, 28 + progress * 74, 8 + progress * 18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(202,74,52,0.18)";
      ctx.beginPath();
      ctx.ellipse(0, 5, 38 + progress * 44, 7 + progress * 7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (particle.type === "good") {
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    } else if (particle.type === "splash") {
      ctx.scale(1.45, 0.72);
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (particle.age > particle.life) particles.splice(i, 1);
  }
}

function drawScoreBursts(delta) {
  for (let i = scoreBursts.length - 1; i >= 0; i -= 1) {
    const burstText = scoreBursts[i];
    burstText.age += delta;
    const progress = Math.min(1, burstText.age / 900);
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(burstText.x, burstText.y - progress * 70);
    ctx.scale(1 + Math.sin(progress * Math.PI) * 0.12, 1 + Math.sin(progress * Math.PI) * 0.12);
    ctx.fillStyle = "#16836d";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 28px Arial";
    ctx.strokeText(burstText.text, 0, 0);
    ctx.fillText(burstText.text, 0, 0);
    ctx.restore();

    if (burstText.age > 900) scoreBursts.splice(i, 1);
  }
}

function drawCenterCue(delta, width, height) {
  if (!centerCue) return;

  centerCue.age += delta;
  const life = 2200;
  const progress = Math.min(1, centerCue.age / life);
  const alpha = progress < 0.68 ? 1 : 1 - (progress - 0.68) / 0.32;
  const scale = centerCue.type === "good"
    ? 0.78 + Math.sin(progress * Math.PI) * 0.26
    : 1 + Math.sin(progress * Math.PI * 5) * 0.06;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.shadowColor = centerCue.type === "good" ? "rgba(22,131,109,0.4)" : "rgba(202,74,52,0.36)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = centerCue.type === "good" ? "rgba(22, 131, 109, 0.94)" : "rgba(202, 74, 52, 0.95)";
  ctx.beginPath();
  ctx.roundRect(-142, -72, 284, 144, 8);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.94)";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 50px Arial";
  ctx.fillText(centerCue.title, 0, -16);
  ctx.font = "900 23px Arial";
  ctx.fillText(centerCue.subtitle, 0, 32);
  ctx.restore();

  if (centerCue.age > life) centerCue = null;
}

function loop(now) {
  if (!running) return;
  const delta = Math.min(32, now - lastTime);
  lastTime = now;

  if (!paused) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    drawBackground(width, height);

    spawnTimer += delta;
    answers.forEach((answer) => {
      answer.y += (answer.speed * delta) / 1000;
      answer.wobble += delta / 350;
      answer.spin += Math.sin(answer.wobble) * 0.0007 * delta;
      answer.trail.push({ x: answer.x + Math.sin(answer.wobble) * 5, y: answer.y });
      if (answer.trail.length > 7) answer.trail.shift();
      drawAnswer(answer);
    });

    drawSlashes(delta);
    drawParticles(delta);
    drawScoreBursts(delta);
    drawCenterCue(delta, width, height);

    const missed = answers.find((answer) => answer.value === current.answer && answer.y > height + 92);
    if (missed) {
      wrong(missed.x, height - 22, "miss");
    }
  }

  requestAnimationFrame(loop);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const point = event.touches ? event.touches[0] : event;
  return {
    x: point.clientX - rect.left,
    y: point.clientY - rect.top,
  };
}

function pickAnswer(event) {
  const point = canvasPoint(event);
  const hit = answers.find((answer) => (
    Math.abs(point.x - answer.x) <= 52 && Math.abs(point.y - answer.y) <= 46
  ));
  if (hit) {
    checkAnswer(hit.value, hit.x, hit.y);
  }
}

canvas.addEventListener("click", pickAnswer);
canvas.addEventListener("touchstart", (event) => {
  event.preventDefault();
  pickAnswer(event);
}, { passive: false });

startGame.addEventListener("click", start);
newGame.addEventListener("click", () => {
  stopWithMessage("מוכנים?", "חתכו את הפרי עם התשובה הנכונה. חיתוך לא נכון מוריד חיים.");
  startGame.textContent = "התחלה";
});

pauseGame.addEventListener("click", () => {
  if (!running) return;
  paused = !paused;
  pauseGame.textContent = paused ? "המשך" : "השהיה";
  setFeedback(paused ? "המשחק בהשהיה." : "חזרנו למשחק.");
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateHud();
drawBackground(canvas.clientWidth, canvas.clientHeight);
