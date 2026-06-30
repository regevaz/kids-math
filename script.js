const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const streakEl = document.querySelector("#streak");
const livesEl = document.querySelector("#lives");
const questionEl = document.querySelector("#question");
const roundLabelEl = document.querySelector("#roundLabel");
const feedbackEl = document.querySelector("#feedback");
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
    cut: false,
  }));
}

function updateHud() {
  scoreEl.textContent = score;
  streakEl.textContent = streak;
  livesEl.textContent = "♥".repeat(Math.max(lives, 0));
}

function setFeedback(text, tone = "normal") {
  feedbackEl.textContent = text;
  feedbackEl.style.borderColor = tone === "good" ? "#1f8a70" : tone === "bad" ? "#c84b31" : "#d9ded8";
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
  updateHud();
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
  showCenterCue("בול!", "+10", "good");
  updateHud();
  newQuestion();
}

function wrong(x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
  lives -= 1;
  streak = 0;
  setFeedback(`לא הפעם. התשובה הייתה ${current.answer}.`, "bad");
  slashMarks.push({ x, y, age: 0, type: "bad" });
  burst(x, y, "bad");
  showCenterCue("אופס!", `התשובה: ${current.answer}`, "bad");
  updateHud();
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
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  for (let i = 0; i < 7; i += 1) {
    const y = 115 + i * 62;
    ctx.fillRect(0, y, width, 1);
  }

  ctx.fillStyle = "#17212b";
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.arc(width - 96, height - 86, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function showCenterCue(title, subtitle, type) {
  centerCue = { title, subtitle, type, age: 0 };
}

function burst(x, y, type) {
  const palette = type === "good"
    ? ["#f2b84b", "#1f8a70", "#ffffff", "#75a843"]
    : ["#c84b31", "#17212b", "#ffffff", "#e98626"];

  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const force = rand(type === "good" ? 90 : 55, type === "good" ? 180 : 125);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force - (type === "good" ? 40 : 10),
      size: rand(4, type === "good" ? 9 : 7),
      color: palette[i % palette.length],
      type,
      age: 0,
      life: rand(420, 720),
    });
  }
}

function drawAnswer(answer) {
  const wobbleX = Math.sin(answer.wobble) * 5;
  ctx.save();
  ctx.translate(answer.x + wobbleX, answer.y);
  ctx.rotate(Math.sin(answer.wobble * 0.7) * 0.08);

  ctx.font = "72px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(answer.fruit.icon, 0, 0);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(-31, -20, 62, 40, 8);
  ctx.fill();

  ctx.strokeStyle = answer.fruit.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#17212b";
  ctx.font = "900 25px Arial";
  ctx.fillText(answer.value, 0, 2);
  ctx.restore();
}

function drawSlashes(delta) {
  for (let i = slashMarks.length - 1; i >= 0; i -= 1) {
    const mark = slashMarks[i];
    mark.age += delta;
    const alpha = Math.max(0, 1 - mark.age / 820);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = mark.type === "good" ? "#f2b84b" : "#c84b31";
    ctx.lineWidth = mark.type === "good" ? 9 : 7;
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
    particle.vy += (particle.type === "good" ? 240 : 330) * delta / 1000;

    const alpha = Math.max(0, 1 - particle.age / particle.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.age / 90);
    if (particle.type === "good") {
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (particle.age > particle.life) particles.splice(i, 1);
  }
}

function drawCenterCue(delta, width, height) {
  if (!centerCue) return;

  centerCue.age += delta;
  const life = 2200;
  const progress = Math.min(1, centerCue.age / life);
  const alpha = progress < 0.72 ? 1 : 1 - (progress - 0.72) / 0.28;
  const scale = centerCue.type === "good"
    ? 0.8 + Math.sin(progress * Math.PI) * 0.24
    : 1 + Math.sin(progress * Math.PI * 5) * 0.06;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = centerCue.type === "good" ? "rgba(31, 138, 112, 0.92)" : "rgba(200, 75, 49, 0.94)";
  ctx.beginPath();
  ctx.roundRect(-132, -68, 264, 136, 8);
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 46px Arial";
  ctx.fillText(centerCue.title, 0, -16);
  ctx.font = "800 22px Arial";
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
      drawAnswer(answer);
    });

    drawSlashes(delta);
    drawParticles(delta);
    drawCenterCue(delta, width, height);

    if (answers.some((answer) => answer.value === current.answer && answer.y > height + 92)) {
      wrong();
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
