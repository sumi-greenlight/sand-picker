(() => {
  'use strict';

  // ===== State =====
  const STORAGE_KEY = 'sandpicker_items';
  const DEFAULT_ITEMS = [];
  let items = loadItems();
  let particles = [];
  let confettiPieces = [];
  let phase = 'idle'; // idle | countdown | scatter | eliminating | forming | celebration | winner
  let winnerWord = '';
  let winnerIndex = -1;
  let celebrationStart = 0;

  // ===== Audio Engine (Web Audio API — no files needed) =====
  let audioCtx = null;

  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTone(freq, duration, type = 'sine', volume = 0.15, delay = 0) {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ac.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + duration);
  }

  function playCountdownTick(num) {
    // Higher pitch on final "1", low beep on 3 and 2
    const freq = num === 1 ? 880 : num === 2 ? 660 : 520;
    playTone(freq, 0.15, 'sine', 0.2);
    // Sub click
    playTone(freq * 2, 0.05, 'triangle', 0.08, 0.01);
  }

  function playScatter() {
    // Whoosh: quick white noise burst
    const ac = getAudio();
    const bufferSize = ac.sampleRate * 0.3;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.12, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.5;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start();
  }

  function playEliminate() {
    // Soft descending blip
    playTone(300 + Math.random() * 200, 0.08, 'sine', 0.04);
  }

  function playFormingChime() {
    // Gentle ascending shimmer
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      playTone(freq, 0.4, 'sine', 0.08, i * 0.12);
      playTone(freq * 1.5, 0.3, 'triangle', 0.03, i * 0.12 + 0.05);
    });
  }

  function playCelebration() {
    const ac = getAudio();
    // Triumphant fanfare: arpeggiated major chord
    const fanfare = [523, 659, 784, 1047, 1319, 1568]; // C E G C E G (octave up)
    fanfare.forEach((freq, i) => {
      playTone(freq, 0.6 - i * 0.05, 'sine', 0.1, i * 0.08);
      playTone(freq, 0.5, 'triangle', 0.04, i * 0.08 + 0.02);
    });

    // Sparkle shimmer (high harmonics)
    setTimeout(() => {
      for (let i = 0; i < 6; i++) {
        playTone(2000 + Math.random() * 2000, 0.2, 'sine', 0.03, i * 0.15);
      }
    }, 600);

    // Warm sustained chord
    setTimeout(() => {
      [523, 659, 784].forEach(f => {
        playTone(f, 1.5, 'sine', 0.05, 0);
        playTone(f / 2, 1.5, 'triangle', 0.03, 0);
      });
    }, 800);
  }

  // ===== Palette Definitions =====
  const PALETTES = {
    beige: {
      dark:  { particles: ['#c8b898', '#ddd0b8', '#a89878', '#b8a888', '#d0c4a8', '#c4b498', '#e0d4bc', '#b0a080'], glow: [200, 184, 152] },
      light: { particles: ['#8a7a5c', '#9e8c6c', '#7a6a4c', '#6e5e3e', '#887858', '#766644', '#948462', '#a08e6e'], glow: [120, 105, 75] },
      celebration: ['#c8b898', '#ddd0b8', '#e8dcc0', '#f0e8d4', '#d4c8a8', '#FFD700', '#F5DEB3', '#DEB887', '#D2B48C', '#FAEBD7', '#FFF8DC', '#FFFACD'],
    },
    rose: {
      dark:  { particles: ['#e8a0b4', '#f2c0d0', '#c47a90', '#d4919e', '#f0b8c8', '#ebd0d8', '#dba0b0', '#c88a9a'], glow: [232, 160, 180] },
      light: { particles: ['#b86880', '#c47890', '#a05068', '#9a4860', '#b87088', '#a45870', '#c07898', '#8e4058'], glow: [160, 80, 110] },
      celebration: ['#e8a0b4', '#f2c0d0', '#FFB6C1', '#FF69B4', '#DDA0DD', '#E6B0AA', '#F5B7B1', '#D7BDE2', '#F0B27A', '#F9E79F', '#FADBD8', '#FDEDEC'],
    },
    ocean: {
      dark:  { particles: ['#4fc3f7', '#81d4fa', '#0097c4', '#29b6f6', '#039be5', '#b3e5fc', '#0288d1', '#4dd0e1'], glow: [79, 195, 247] },
      light: { particles: ['#0277bd', '#0288d1', '#01579b', '#0288d1', '#0097a7', '#006064', '#00838f', '#00695c'], glow: [2, 120, 180] },
      celebration: ['#4fc3f7', '#81d4fa', '#00BCD4', '#26C6DA', '#80DEEA', '#B2EBF2', '#0097A7', '#00ACC1', '#4DD0E1', '#84FFFF', '#18FFFF', '#00E5FF'],
    },
    aurora: {
      dark:  { particles: ['#bf5af2', '#d68ff8', '#9530c7', '#a855f7', '#c084fc', '#e9d5ff', '#7c3aed', '#b47cfd'], glow: [191, 90, 242] },
      light: { particles: ['#7c3aed', '#8b5cf6', '#6d28d9', '#5b21b6', '#7e22ce', '#9333ea', '#6b21a8', '#a855f7'], glow: [110, 40, 200] },
      celebration: ['#bf5af2', '#d68ff8', '#FF6B9D', '#C084FC', '#A78BFA', '#818CF8', '#F472B6', '#FB7185', '#34D399', '#5EEAD4', '#6EE7B7', '#A7F3D0'],
    },
    mint: {
      dark:  { particles: ['#82ddb0', '#a8ecc8', '#5cb88a', '#6ee7a0', '#4ade80', '#bbf7d0', '#34d399', '#86efac'], glow: [130, 221, 176] },
      light: { particles: ['#059669', '#0d9668', '#047857', '#065f46', '#0f766e', '#10b981', '#0e8a60', '#14785a'], glow: [5, 120, 80] },
      celebration: ['#82ddb0', '#a8ecc8', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5', '#10B981', '#059669', '#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B'],
    },
    mono: {
      dark:  { particles: ['#b0b0b0', '#d0d0d0', '#888888', '#a0a0a0', '#c0c0c0', '#969696', '#d8d8d8', '#b8b8b8'], glow: [176, 176, 176] },
      light: { particles: ['#555555', '#666666', '#444444', '#4a4a4a', '#5a5a5a', '#505050', '#3e3e3e', '#606060'], glow: [70, 70, 70] },
      celebration: ['#b0b0b0', '#d0d0d0', '#e0e0e0', '#ffffff', '#c8c8c8', '#a0a0a0', '#f0f0f0', '#888888', '#d8d8d8', '#c0c0c0', '#e8e8e8', '#b8b8b8'],
    },
  };

  let currentPalette = localStorage.getItem('sandpicker_palette') || 'beige';
  let currentMode = localStorage.getItem('sandpicker_mode') || 'light';
  let isDark = currentMode === 'dark';

  function getPalette() {
    const p = PALETTES[currentPalette] || PALETTES.beige;
    const mode = isDark ? 'dark' : 'light';
    return { ...p[mode], celebration: p.celebration };
  }

  // Convenience accessors
  function getSandPalette() { return getPalette().particles; }
  function getCelebrationColors() { return getPalette().celebration; }
  function getGlowRGB() { return getPalette().glow; }

  // ===== DOM refs =====
  const canvas = document.getElementById('sandCanvas');
  const ctx = canvas.getContext('2d');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const itemInput = document.getElementById('itemInput');
  const addBtn = document.getElementById('addBtn');
  const bulkToggle = document.getElementById('bulkToggle');
  const bulkArea = document.getElementById('bulkArea');
  const bulkInput = document.getElementById('bulkInput');
  const bulkAddBtn = document.getElementById('bulkAddBtn');
  const clearBtn = document.getElementById('clearBtn');
  const itemList = document.getElementById('itemList');
  const itemCount = document.getElementById('itemCount');
  const goBtn = document.getElementById('goBtn');
  const resetBtn = document.getElementById('resetBtn');
  const removeWinnerCheckbox = document.getElementById('removeWinner');

  // ===== Canvas Setup =====
  let W, H, dpr;

  function setupCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ===== Particle Class =====
  class Particle {
    constructor(x, y, char, wordIdx, color) {
      this.x = x;
      this.y = y;
      this.targetX = x;
      this.targetY = y;
      this.homeX = x;
      this.homeY = y;
      this.char = char;
      this.wordIndex = wordIdx;
      this.color = color;
      this.alpha = 1;
      this.size = 14 + Math.random() * 4;
      this.vx = 0;
      this.vy = 0;
      this.alive = true;
      this.settling = false;
    }

    draw() {
      if (!this.alive && this.alpha <= 0) return;
      ctx.save();

      // No sand grains — clean text only

      // Character
      ctx.globalAlpha = this.alpha;
      ctx.font = `700 ${this.size}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.color;
      ctx.fillText(this.char, this.x, this.y);

      // Glow
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = this.alpha * 0.25;
      ctx.fillText(this.char, this.x, this.y);
      ctx.shadowBlur = 0;

      ctx.restore();
    }
  }

  // ===== Confetti Piece =====
  class ConfettiPiece {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 14;
      this.vy = -6 - Math.random() * 10;
      this.gravity = 0.12 + Math.random() * 0.08;
      this.rotation = Math.random() * 360;
      this.rotSpeed = (Math.random() - 0.5) * 12;
      this.w = 4 + Math.random() * 6;
      this.h = 3 + Math.random() * 4;
      this.color = getCelebrationColors()[Math.floor(Math.random() * getCelebrationColors().length)];
      this.alpha = 1;
      this.shape = Math.random() > 0.5 ? 'rect' : 'circle';
    }

    update() {
      this.vy += this.gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.99;
      this.rotation += this.rotSpeed;
      if (this.y > H + 20) this.alpha = 0;
      else if (this.y > H - 100) this.alpha = Math.max(0, this.alpha - 0.02);
    }

    draw() {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.fillStyle = this.color;
      if (this.shape === 'rect') {
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ===== Text → Positions =====
  function getTextPositions(text, fontSize, cx, cy) {
    const positions = [];
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    const total = ctx.measureText(text).width;
    let xOff = cx - total / 2;
    for (let i = 0; i < text.length; i++) {
      const cw = ctx.measureText(text[i]).width;
      positions.push({ x: xOff + cw / 2, y: cy, char: text[i] });
      xOff += cw;
    }
    return positions;
  }

  // ===== Build Scattered Particles =====
  function buildScatteredParticles() {
    particles = [];
    if (items.length === 0) return;
    setupCanvas();

    const allChars = [];
    items.forEach((word, wi) => {
      for (const ch of word) {
        if (ch === ' ') continue;
        allChars.push({ char: ch, wordIndex: wi });
      }
    });

    const margin = 60;
    allChars.forEach(({ char, wordIndex }) => {
      const x = margin + Math.random() * (W - margin * 2);
      const y = margin + Math.random() * (H - margin * 2 - 60);
      const color = getSandPalette()[Math.floor(Math.random() * getSandPalette().length)];
      const p = new Particle(x, y, char, wordIndex, color);
      p.homeX = x;
      p.homeY = y;
      particles.push(p);
    });
  }

  // ===== Idle Animation =====
  let idleTime = 0;

  function animateIdle() {
    idleTime += 0.005;
    particles.forEach((p, i) => {
      p.x = p.homeX + Math.sin(idleTime + i * 0.7) * 0.4;
      p.y = p.homeY + Math.cos(idleTime + i * 0.5) * 0.3;
    });
  }

  // ===== Countdown =====
  function showCountdown(onDone) {
    phase = 'countdown';
    goBtn.classList.add('running');
    let count = 3;

    function tick() {
      countdownOverlay.classList.remove('hidden');
      countdownOverlay.innerHTML = `<span class="countdown-number">${count}</span>`;
      playCountdownTick(count);

      // Force re-trigger animation
      const el = countdownOverlay.querySelector('.countdown-number');
      el.style.animation = 'none';
      el.offsetHeight; // reflow
      el.style.animation = '';

      count--;
      if (count >= 0) {
        setTimeout(tick, 800);
      } else {
        countdownOverlay.classList.add('hidden');
        countdownOverlay.innerHTML = '';
        onDone();
      }
    }

    tick();
  }

  // ===== GO =====
  function go() {
    if (phase !== 'idle' || items.length < 2) return;

    winnerWord = items[Math.floor(Math.random() * items.length)];
    winnerIndex = items.indexOf(winnerWord);

    showCountdown(() => {
      phase = 'scatter';
      playScatter();

      // Scatter all particles
      particles.forEach(p => {
        p.vx = (Math.random() - 0.5) * 14;
        p.vy = (Math.random() - 0.5) * 14;
      });

      setTimeout(() => {
        phase = 'eliminating';
        eliminateParticles();
      }, 1200);
    });
  }

  function eliminateParticles() {
    const losers = particles.filter(p => p.wordIndex !== winnerIndex);
    const winners = particles.filter(p => p.wordIndex === winnerIndex);

    // Shuffle losers
    const shuffled = losers.sort(() => Math.random() - 0.5);

    let delay = 0;
    shuffled.forEach(p => {
      setTimeout(() => {
        p.alive = false;
        p.vy = 2 + Math.random() * 6;
        p.vx = (Math.random() - 0.5) * 5;
        playEliminate();
      }, delay);
      delay += 60 + Math.random() * 50;
    });

    // After losers gone, form the winner
    setTimeout(() => {
      formWinnerWord(winners);
    }, delay + 400);
  }

  function formWinnerWord(winnerParticles) {
    phase = 'forming';
    playFormingChime();

    const fontSize = Math.min(56, W / (winnerWord.length * 0.7));
    const positions = getTextPositions(winnerWord, fontSize, W / 2, H / 2);

    const used = new Set();
    positions.forEach(pos => {
      const idx = winnerParticles.findIndex((p, i) => !used.has(i) && p.char === pos.char);
      if (idx !== -1) {
        used.add(idx);
        const p = winnerParticles[idx];
        p.targetX = pos.x;
        p.targetY = pos.y;
        p.size = fontSize;
        p.settling = true;
      }
    });

    // Transition to celebration after letters settle
    setTimeout(() => {
      startCelebration();
    }, 2000);
  }

  // ===== Celebration =====
  function startCelebration() {
    phase = 'celebration';
    celebrationStart = performance.now();
    confettiPieces = [];
    playCelebration();

    // Initial burst from center
    spawnConfettiBurst(W / 2, H / 2, 80);

    // Side bursts
    setTimeout(() => spawnConfettiBurst(W * 0.2, H * 0.6, 40), 300);
    setTimeout(() => spawnConfettiBurst(W * 0.8, H * 0.6, 40), 500);

    // Continuous sparkle for 3 seconds
    let sparkleCount = 0;
    const sparkleInterval = setInterval(() => {
      spawnConfettiBurst(Math.random() * W, H * 0.4 + Math.random() * H * 0.3, 8);
      sparkleCount++;
      if (sparkleCount > 12) clearInterval(sparkleInterval);
    }, 250);

    // End celebration, show winner state
    setTimeout(() => {
      phase = 'winner';
      goBtn.classList.remove('running');
      goBtn.classList.add('hidden');
      resetBtn.classList.remove('hidden');

      if (removeWinnerCheckbox.checked) {
        const idx = items.indexOf(winnerWord);
        if (idx !== -1) {
          items.splice(idx, 1);
          saveItems();
          renderList();
        }
      }
    }, 4000);
  }

  function spawnConfettiBurst(cx, cy, count) {
    for (let i = 0; i < count; i++) {
      confettiPieces.push(new ConfettiPiece(cx, cy));
    }
  }

  // ===== Ring / Glow Effects =====
  function drawCelebrationEffects() {
    const elapsed = performance.now() - celebrationStart;

    const g = getGlowRGB();

    // Expanding ring
    const ringProgress = Math.min(elapsed / 1500, 1);
    if (ringProgress < 1) {
      const radius = ringProgress * Math.max(W, H) * 0.6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${g[0]}, ${g[1]}, ${g[2]}, ${0.3 * (1 - ringProgress)})`;
      ctx.lineWidth = 3 * (1 - ringProgress);
      ctx.shadowColor = `rgb(${g[0]}, ${g[1]}, ${g[2]})`;
      ctx.shadowBlur = 20 * (1 - ringProgress);
      ctx.stroke();
      ctx.restore();
    }

    // Second ring delayed
    const ring2Elapsed = elapsed - 400;
    if (ring2Elapsed > 0) {
      const r2p = Math.min(ring2Elapsed / 1500, 1);
      if (r2p < 1) {
        const radius = r2p * Math.max(W, H) * 0.5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * (1 - r2p)})`;
        ctx.lineWidth = 2 * (1 - r2p);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Radial glow behind text
    const glowPulse = 0.6 + Math.sin(elapsed * 0.004) * 0.2;
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 150);
    grad.addColorStop(0, `rgba(${g[0]}, ${g[1]}, ${g[2]}, ${0.12 * glowPulse})`);
    grad.addColorStop(0.5, `rgba(${g[0]}, ${g[1]}, ${g[2]}, ${0.04 * glowPulse})`);
    grad.addColorStop(1, `rgba(${g[0]}, ${g[1]}, ${g[2]}, 0)`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawWinnerGlow() {
    const aliveParticles = particles.filter(p => p.alive && p.alpha > 0);
    if (aliveParticles.length === 0) return;

    const g = getGlowRGB();
    const accentHex = getSandPalette()[0];
    const accentLight = getSandPalette()[1] || accentHex;
    const pulse = 0.5 + Math.sin(performance.now() * 0.003) * 0.2;

    // Radial background glow
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 180);
    grad.addColorStop(0, `rgba(${g[0]}, ${g[1]}, ${g[2]}, ${0.08 * pulse})`);
    grad.addColorStop(1, `rgba(${g[0]}, ${g[1]}, ${g[2]}, 0)`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Text shadow glow
    ctx.save();
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 50 * pulse;
    ctx.globalAlpha = 0.12 * pulse;
    ctx.font = `700 ${aliveParticles[0].size}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentHex;
    ctx.fillText(winnerWord, W / 2, H / 2);
    ctx.restore();

    // Floating sparkles around winner
    const t = performance.now() * 0.001;
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const angle = t * 0.5 + (i * Math.PI * 2) / 8;
      const radius = 80 + Math.sin(t + i) * 20;
      const sx = W / 2 + Math.cos(angle) * radius;
      const sy = H / 2 + Math.sin(angle) * radius;
      const sparkAlpha = 0.3 + Math.sin(t * 2 + i) * 0.2;
      ctx.globalAlpha = sparkAlpha;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = accentLight;
      ctx.shadowColor = accentHex;
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.restore();
  }

  // ===== Main Render Loop =====
  function render() {
    setupCanvas();
    ctx.clearRect(0, 0, W, H);

    drawAmbiance();

    if (phase === 'idle') {
      animateIdle();
    }

    // Celebration effects (behind particles)
    if (phase === 'celebration') {
      drawCelebrationEffects();
    }

    // Update & draw particles
    particles.forEach(p => {
      if (phase === 'scatter') {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        if (p.x < 20 || p.x > W - 20) p.vx *= -0.7;
        if (p.y < 20 || p.y > H - 20) p.vy *= -0.7;
        p.x = Math.max(10, Math.min(W - 10, p.x));
        p.y = Math.max(10, Math.min(H - 10, p.y));
      }

      if (phase === 'eliminating' || phase === 'forming' || phase === 'celebration' || phase === 'winner') {
        if (!p.alive) {
          p.vy += 0.18;
          p.x += p.vx;
          p.y += p.vy;
          p.alpha = Math.max(0, p.alpha - 0.012);
        } else if (p.settling) {
          const dx = p.targetX - p.x;
          const dy = p.targetY - p.y;
          p.x += dx * 0.07;
          p.y += dy * 0.07;
          p.vx *= 0.85;
          p.vy *= 0.85;
        } else {
          p.x += p.vx * 0.4;
          p.y += p.vy * 0.4;
          p.vx *= 0.97;
          p.vy *= 0.97;
        }
      }

      p.draw();
    });

    // Confetti (in front of particles)
    confettiPieces.forEach(c => {
      c.update();
      c.draw();
    });
    // Clean up dead confetti
    confettiPieces = confettiPieces.filter(c => c.alpha > 0);

    // Winner glow
    if (phase === 'winner') {
      drawWinnerGlow();
    }

    // Hints
    if (phase === 'idle' && items.length >= 2) {
      drawHint('Click GO to pick a name');
    } else if (phase === 'idle' && items.length < 2) {
      drawHint('Add at least 2 names to begin');
    }

    requestAnimationFrame(render);
  }

  function drawAmbiance() {
    const t = performance.now() * 0.0003;
    const g = getGlowRGB();
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const x = (Math.sin(t + i * 2.1) * 0.5 + 0.5) * W;
      const y = (Math.cos(t + i * 1.7) * 0.5 + 0.5) * H;
      const a = 0.04 + Math.sin(t * 3 + i) * 0.02;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${g[0]}, ${g[1]}, ${g[2]})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHint(text) {
    ctx.save();
    ctx.font = '500 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
    ctx.fillText(text, W / 2, H * 0.15);
    ctx.restore();
  }

  // ===== Reset =====
  function reset() {
    phase = 'idle';
    winnerWord = '';
    winnerIndex = -1;
    confettiPieces = [];
    goBtn.classList.remove('running', 'hidden');
    resetBtn.classList.add('hidden');
    countdownOverlay.classList.add('hidden');
    countdownOverlay.innerHTML = '';
    buildScatteredParticles();
  }

  // ===== Item Management =====
  function addItem(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    items.push(trimmed);
    saveItems();
    renderList();
    if (phase === 'idle') buildScatteredParticles();
  }

  function removeItem(index) {
    items.splice(index, 1);
    saveItems();
    renderList();
    if (phase === 'idle') buildScatteredParticles();
  }

  function clearItems() {
    items = [];
    saveItems();
    renderList();
    particles = [];
  }

  function renderList() {
    itemList.innerHTML = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = item;
      const btn = document.createElement('button');
      btn.className = 'remove-btn';
      btn.dataset.index = i;
      btn.title = 'Remove';
      btn.innerHTML = '&times;';
      li.appendChild(span);
      li.appendChild(btn);
      itemList.appendChild(li);
    });
    itemCount.textContent = `${items.length} name${items.length !== 1 ? 's' : ''}`;
  }

  // ===== Storage =====
  function saveItems() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) { /* ignore */ }
  }

  function loadItems() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { /* ignore */ }
    return [...DEFAULT_ITEMS];
  }

  // ===== Event Listeners =====
  addBtn.addEventListener('click', () => {
    addItem(itemInput.value);
    itemInput.value = '';
    itemInput.focus();
  });

  itemInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addItem(itemInput.value);
      itemInput.value = '';
    }
  });

  bulkToggle.addEventListener('click', () => {
    bulkArea.classList.toggle('hidden');
    bulkToggle.textContent = bulkArea.classList.contains('hidden') ? 'Paste multiple' : 'Hide';
  });

  bulkAddBtn.addEventListener('click', () => {
    const lines = bulkInput.value.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach(line => items.push(line));
    saveItems();
    renderList();
    if (phase === 'idle') buildScatteredParticles();
    bulkInput.value = '';
    bulkArea.classList.add('hidden');
    bulkToggle.textContent = 'Paste multiple';
  });

  clearBtn.addEventListener('click', clearItems);

  itemList.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn')) {
      removeItem(parseInt(e.target.dataset.index, 10));
    }
  });

  goBtn.addEventListener('click', go);
  resetBtn.addEventListener('click', reset);

  // ===== Palette Switcher =====
  const palettePicker = document.getElementById('palettePicker');

  function applyPalette(name) {
    currentPalette = name;
    document.documentElement.setAttribute('data-palette', name);
    localStorage.setItem('sandpicker_palette', name);
    // Update active swatch
    palettePicker.querySelectorAll('.swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.palette === name);
    });
    // Rebuild particles with new colors
    if (phase === 'idle') buildScatteredParticles();
  }

  palettePicker.addEventListener('click', (e) => {
    const swatch = e.target.closest('.swatch');
    if (!swatch) return;
    applyPalette(swatch.dataset.palette);
  });

  // ===== Light / Dark Mode =====
  const modeToggle = document.getElementById('modeToggle');
  const modeIcon = document.getElementById('modeIcon');

  function applyMode(mode) {
    isDark = mode === 'dark';
    currentMode = mode;
    document.documentElement.setAttribute('data-mode', mode);
    localStorage.setItem('sandpicker_mode', mode);
    // ☀ for dark (click to go light), ☾ for light (click to go dark)
    modeIcon.innerHTML = isDark ? '&#9788;' : '&#9790;';
    modeIcon.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    // Rebuild particles since canvas bg logic changes
    if (phase === 'idle') buildScatteredParticles();
  }

  modeToggle.addEventListener('click', () => {
    applyMode(isDark ? 'light' : 'dark');
  });

  // ===== Nearby Places (Overpass API) =====
  const nearbyToggle = document.getElementById('nearbyToggle');
  const nearbyArea = document.getElementById('nearbyArea');
  const locateBtn = document.getElementById('locateBtn');
  const nearbyStatus = document.getElementById('nearbyStatus');
  const nearbyResults = document.getElementById('nearbyResults');
  const addAllNearby = document.getElementById('addAllNearby');
  const placeType = document.getElementById('placeType');
  const placeRadius = document.getElementById('placeRadius');
  const placeLimit = document.getElementById('placeLimit');

  // Multiple Overpass mirrors — try in order, fallback on failure
  const OVERPASS_MIRRORS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  const locationInput = document.getElementById('locationInput');
  const searchLocationBtn = document.getElementById('searchLocationBtn');

  const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

  nearbyToggle.addEventListener('click', () => {
    nearbyArea.classList.toggle('hidden');
    nearbyToggle.textContent = nearbyArea.classList.contains('hidden')
      ? 'Find nearby places' : 'Hide places';
  });

  function setNearbyStatus(msg, isError = false) {
    nearbyStatus.textContent = msg;
    nearbyStatus.classList.remove('hidden', 'error');
    if (isError) nearbyStatus.classList.add('error');
  }

  function hideNearbyStatus() {
    nearbyStatus.classList.add('hidden');
  }

  // ===== Location Search (Nominatim geocoder) =====
  searchLocationBtn.addEventListener('click', () => {
    const query = locationInput.value.trim();
    if (!query) return;
    geocodeAndSearch(query);
  });

  locationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = locationInput.value.trim();
      if (query) geocodeAndSearch(query);
    }
  });

  async function geocodeAndSearch(query) {
    setNearbyStatus('Finding location...');
    searchLocationBtn.disabled = true;
    locateBtn.disabled = true;

    try {
      const resp = await fetch(
        `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      const results = await resp.json();

      if (!results.length) {
        setNearbyStatus('Location not found. Try a different search.', true);
        searchLocationBtn.disabled = false;
        locateBtn.disabled = false;
        return;
      }

      const lat = parseFloat(results[0].lat);
      const lng = parseFloat(results[0].lon);
      const displayName = results[0].display_name.split(',').slice(0, 2).join(',');
      setNearbyStatus(`Searching near ${displayName}...`);
      searchNearbyPlaces(lat, lng);
    } catch (err) {
      console.error('Geocoding error:', err);
      setNearbyStatus('Location search failed. Try again.', true);
      searchLocationBtn.disabled = false;
      locateBtn.disabled = false;
    }
  }

  // ===== Geolocation (browser) =====
  locateBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      setNearbyStatus('Geolocation not supported by your browser.', true);
      return;
    }

    setNearbyStatus('Getting your location...');
    locateBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setNearbyStatus('Searching nearby places...');
        searchNearbyPlaces(lat, lng);
      },
      (err) => {
        locateBtn.disabled = false;
        if (err.code === 1) {
          setNearbyStatus('Location permission denied. Please allow access.', true);
        } else {
          setNearbyStatus('Could not get location. Try again.', true);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  async function searchNearbyPlaces(lat, lng) {
    const type = placeType.value;
    const radiusM = parseInt(placeRadius.value, 10);
    const limit = parseInt(placeLimit.value, 10);

    // Convert radius to bounding box (much faster than "around" for large areas)
    const latDeg = radiusM / 111320;
    const lngDeg = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const south = (lat - latDeg).toFixed(6);
    const north = (lat + latDeg).toFixed(6);
    const west = (lng - lngDeg).toFixed(6);
    const east = (lng + lngDeg).toFixed(6);
    const bbox = `${south},${west},${north},${east}`;

    const query = `[out:json][timeout:30];
node["amenity"="${type}"]["name"](${bbox});
out qt ${limit};`;

    let lastErr = null;

    for (const mirror of OVERPASS_MIRRORS) {
      try {
        setNearbyStatus(`Searching nearby places...`);
        const resp = await fetch(mirror, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
        });

        // Check if response is JSON (not an HTML error page)
        const text = await resp.text();
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          throw new Error('Server returned HTML error');
        }

        const data = JSON.parse(text);
        const places = (data.elements || [])
          .map(el => el.tags?.name)
          .filter(Boolean)
          .slice(0, limit);

        locateBtn.disabled = false;
        searchLocationBtn.disabled = false;

        if (places.length === 0) {
          setNearbyStatus(`No ${placeType.options[placeType.selectedIndex].text.toLowerCase()} found nearby. Try a larger radius.`, true);
          nearbyResults.classList.add('hidden');
          addAllNearby.classList.add('hidden');
          return;
        }

        setNearbyStatus(`Found ${places.length} places`);
        renderNearbyResults(places);
        return; // success — stop trying mirrors
      } catch (err) {
        lastErr = err;
        console.warn(`Overpass mirror failed (${mirror}):`, err.message);
        continue; // try next mirror
      }
    }

    // All mirrors failed
    locateBtn.disabled = false;
    searchLocationBtn.disabled = false;
    console.error('All Overpass mirrors failed:', lastErr);
    setNearbyStatus('All servers busy. Please try again in a moment.', true);
  }

  function renderNearbyResults(places) {
    nearbyResults.innerHTML = '';
    nearbyResults.classList.remove('hidden');
    addAllNearby.classList.remove('hidden');

    places.forEach((name, i) => {
      const li = document.createElement('li');
      li.dataset.place = name;

      const span = document.createElement('span');
      span.className = 'place-name';
      span.textContent = name;

      const btn = document.createElement('button');
      btn.className = 'add-place-btn';
      btn.innerHTML = '+';
      btn.title = 'Add to list';
      btn.addEventListener('click', () => {
        addItem(name);
        li.classList.add('added');
        btn.innerHTML = '';
      });

      li.appendChild(span);
      li.appendChild(btn);
      nearbyResults.appendChild(li);
    });
  }

  addAllNearby.addEventListener('click', () => {
    const placeItems = nearbyResults.querySelectorAll('li:not(.added)');
    placeItems.forEach(li => {
      addItem(li.dataset.place);
      li.classList.add('added');
      li.querySelector('.add-place-btn').innerHTML = '';
    });
    if (placeItems.length > 0) {
      setNearbyStatus(`Added ${placeItems.length} places to the list!`);
    }
  });

  // ===== Resize =====
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (phase === 'idle') buildScatteredParticles();
    }, 150);
  });

  // ===== Init =====
  function initApp() {
    applyMode(currentMode);
    applyPalette(currentPalette);
    setupCanvas();
    renderList();
    buildScatteredParticles();
    render();
  }

  // If app container is already visible (session exists), init immediately
  if (!document.getElementById('appContainer').classList.contains('hidden')) {
    initApp();
  }

  // Otherwise wait for auth-ready event from auth.js
  window.addEventListener('auth-ready', () => {
    // Small delay to let DOM transition complete
    setTimeout(initApp, 100);
  });
})();
