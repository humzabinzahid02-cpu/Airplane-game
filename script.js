class PlaneLandingGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('game-container');
    
    this.throttleSlider = document.getElementById('throttle-slider');
    this.pitchSlider = document.getElementById('pitch-slider');
    
    // UI elements
    this.scoreVal = document.getElementById('score-val');
    this.streakVal = document.getElementById('streak-val');
    this.altVal = document.getElementById('alt-val');
    this.spdVal = document.getElementById('spd-val');
    this.distVal = document.getElementById('dist-val');
    this.trendVal = document.getElementById('trend-val');
    
    this.msgContainer = document.getElementById('message-container');
    this.gameMsg = document.getElementById('game-message');
    this.subMsg = document.getElementById('sub-message');
    
    this.resultScreen = document.getElementById('result-screen');
    this.resSpeed = document.getElementById('res-speed');
    this.resAngle = document.getElementById('res-angle');
    this.resDist = document.getElementById('res-dist');
    this.resScore = document.getElementById('res-score');
    this.resTitle = document.getElementById('result-title');
    this.startScreen = document.getElementById('start-screen');
    
    document.getElementById('next-btn').addEventListener('click', () => this.nextLevel());
    document.getElementById('restart-btn').addEventListener('click', () => this.restartGame());
    document.getElementById('start-btn').addEventListener('click', () => this.startGame());

    this.keys = { up: false, down: false, left: false, right: false };
    
    this.bindEvents();
    this.resizeData = { w: 0, h: 0 };
    this.resize();
    
    // Game variables
    this.score = 0;
    this.streak = 0;
    this.level = 1;
    this.state = 'START_MENU'; // PLAYING, CRASHED, LANDED, START_MENU
    
    document.getElementById('hud').style.display = 'none';
    document.getElementById('controls').style.display = 'none';
    
    // World & physics config
    this.gravity = 0.05;
    this.drag = 0.01;
    
    // Level generation base settings
    this.runwayDistBase = 8000;
    this.runwayLenBase = 4000;
    
    this.initLevel(true);
    
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') this.keys.up = true;
      if (e.key === 'ArrowDown') this.keys.down = true;
      if (e.key === 'ArrowLeft') this.keys.left = true;
      if (e.key === 'ArrowRight') this.keys.right = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp') this.keys.up = false;
      if (e.key === 'ArrowDown') this.keys.down = false;
      if (e.key === 'ArrowLeft') this.keys.left = false;
      if (e.key === 'ArrowRight') this.keys.right = false;
    });
  }

  resize() {
    const isPortrait = window.innerHeight > window.innerWidth;
    
    if (isPortrait && window.innerWidth < 1000) {
      this.container.classList.add('rotated');
      // When rotated, canvas internal width/height should match the visually "landscape" dimensions
      this.canvas.width = window.innerHeight;
      this.canvas.height = window.innerWidth;
    } else {
      this.container.classList.remove('rotated');
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
    
    this.resizeData.w = this.canvas.width;
    this.resizeData.h = this.canvas.height;
  }

  startGame() {
    this.startScreen.classList.remove('active');
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('controls').style.display = 'flex';
    this.initLevel(false);
  }

  initLevel(isMenu = false) {
    if (!isMenu) {
      this.state = 'PLAYING';
      this.resultScreen.classList.remove('active');
      this.msgContainer.style.opacity = '1';
      this.gameMsg.innerText = 'APPROACHING RUNWAY';
      this.subMsg.innerText = 'Adjust speed and angle to land safely';
      
      setTimeout(() => {
        if (this.state === 'PLAYING') this.msgContainer.style.opacity = '0';
      }, 5000); // 5 second timeout
    }

    this.generateClouds();

    // AI Adaptation (difficulty increases with streak)
    let difficultyFactor = Math.min(this.streak * 0.1, 0.5);
    let runWayW = this.runwayLenBase * (1 - difficultyFactor);
    let startDist = this.runwayDistBase * (1 + difficultyFactor * 0.5);

    this.runway = {
      x: startDist,
      width: runWayW,
      y: 0
    };

    this.plane = {
      x: 0,
      y: -1200, // altitude (negative is up)
      vx: 8,
      vy: 0,
      angle: 0, // degrees: positive is nose down, negative is nose up
      targetAngle: 0,
      width: 60,
      height: 15,
      throttle: 60
    };
    
    // Reset inputs
    this.throttleSlider.value = 60;
    this.pitchSlider.value = 0;
    
    this.particles = [];
    this.clouds = [];
    this.screenShake = 0;
    this.generateClouds();
  }

  restartGame() {
    this.score = 0;
    this.streak = 0;
    this.level = 1;
    this.updateHUD();
    this.initLevel();
  }

  nextLevel() {
    this.level++;
    this.initLevel();
  }

  updatePhysics(dt) {
    if (this.state === 'START_MENU') {
      this.plane.y += Math.sin(performance.now() / 300) * 0.5; // Hover effect
      return;
    }
    if (this.state !== 'PLAYING') return;

    // Handle Desktop Keys -> Sliders
    if (this.keys.up) this.pitchSlider.value = Math.max(-30, parseInt(this.pitchSlider.value) - 1);
    if (this.keys.down) this.pitchSlider.value = Math.min(30, parseInt(this.pitchSlider.value) + 1);
    if (this.keys.right) this.throttleSlider.value = Math.min(100, parseInt(this.throttleSlider.value) + 1);
    if (this.keys.left) this.throttleSlider.value = Math.max(0, parseInt(this.throttleSlider.value) - 1);

    // Read inputs
    let throttleVal = parseInt(this.throttleSlider.value); // 0 to 100
    let pitchVal = parseInt(this.pitchSlider.value); // -30 to 30

    this.plane.targetAngle = pitchVal;

    // Throttle dictates target forward speed
    // 0 throttle = 3 vx, 100 throttle = 20 vx
    let targetSpeed = 3 + (throttleVal / 100) * 17;
    
    this.plane.vx += (targetSpeed - this.plane.vx) * 0.05;

    // Angle smoothing
    this.plane.angle += (this.plane.targetAngle - this.plane.angle) * 0.1;

    // Vertical velocity physics
    let angleRad = this.plane.angle * Math.PI / 180;
    
    // Lift is based on speed and angle
    // If vx is low, lift is low -> stall (gravity takes over)
    let stallFactor = Math.max(0, (8 - this.plane.vx) * 0.1); 
    
    // Normal vertical speed based on pitch and forward speed
    let targetVy = Math.sin(angleRad) * this.plane.vx + stallFactor + this.gravity * 20;

    this.plane.vy += (targetVy - this.plane.vy) * 0.05;

    // Update position
    this.plane.x += this.plane.vx * dt * 0.06;
    this.plane.y += this.plane.vy * dt * 0.06;

    // Screen bound for altitude
    if (this.plane.y > 0) {
      this.plane.y = 0;
      this.checkLanding();
    }

    this.updateHUD();
  }

  checkLanding() {
    let runwayStart = this.runway.x;
    let runwayEnd = this.runway.x + this.runway.width;
    
    let crashReason = null;
    let scoreGained = 0;

    // Check conditions
    if (this.plane.x < runwayStart) {
      crashReason = "Landed short of runway";
    } else if (this.plane.x > runwayEnd) {
      crashReason = "Overshot the runway";
    } else if (this.plane.vy > 4) {
      crashReason = "Hard landing (Vertical speed too high)";
    } else if (this.plane.vx > 14) {
      crashReason = "Forward speed too high";
    } else if (this.plane.angle > 5) {
      crashReason = "Nose down crash";
    } else if (this.plane.angle < -15) {
      crashReason = "Tail strike";
    }

    if (crashReason) {
      this.state = 'CRASHED';
      this.endSequence(false, crashReason);
      this.screenShake = 20;
      this.spawnDust(this.plane.x, this.plane.y, 30, '#576574');
    } else {
      this.state = 'LANDED';
      this.plane.vy = 0;
      this.plane.vx = 0; // stop plane
      this.plane.angle = 0; // flatten
      
      // Calculate score based on distance to center and vy
      let center = runwayStart + this.runway.width / 2;
      let distToCenter = Math.abs(this.plane.x - center);
      let accuracyScore = Math.max(0, 500 - distToCenter * 0.5);
      let softnessScore = Math.max(0, 500 - this.plane.vy * 100);
      
      scoreGained = Math.round(accuracyScore + softnessScore);
      this.streak++;
      this.score += scoreGained + (this.streak * 50);

      this.spawnDust(this.plane.x, this.plane.y, 15, '#c8d6e5');
      this.endSequence(true, "PERFECT LANDING", scoreGained);
    }
  }

  endSequence(success, msg, points = 0) {
    this.msgContainer.style.opacity = '1';
    
    if (success) {
      this.gameMsg.innerText = "TOUCHDOWN";
      this.gameMsg.style.color = "#448b56";
      this.subMsg.innerText = "";
      
      setTimeout(() => {
        this.resTitle.innerText = "LANDING SUCCESSFUL";
        this.resTitle.style.color = "#3867d6"; // Unified brand color
        this.resSpeed.innerText = this.plane.vy < 2 ? "Perfect" : "Good";
        this.resAngle.innerText = this.plane.angle < 0 ? "Flared" : "Flat";
        this.resDist.innerText = "Center";
        this.resScore.innerText = points;
        document.getElementById('next-btn').style.display = 'block';
        this.resultScreen.classList.add('active');
      }, 5000); // 5 second timeout
      
    } else {
      this.streak = 0;
      this.gameMsg.innerText = "CRASHED";
      this.gameMsg.style.color = "#c0392b";
      this.subMsg.innerText = msg;
      
      setTimeout(() => {
        this.resTitle.innerText = "LANDING FAILED";
        this.resTitle.style.color = "#ff4d4d"; // Neon Red
        this.resSpeed.innerText = "Too fast";
        this.resAngle.innerText = "Unstable";
        this.resDist.innerText = "Off track";
        this.resScore.innerText = "0";
        document.getElementById('next-btn').style.display = 'none';
        this.resultScreen.classList.add('active');
      }, 5000); // 5 second timeout
    }
    
    this.updateHUD();
  }

  updateHUD() {
    this.scoreVal.innerText = this.score;
    this.streakVal.innerText = this.streak;
    this.altVal.innerText = Math.max(0, Math.round(-this.plane.y));
    this.spdVal.innerText = Math.round(this.plane.vx * 10);

    let trend = 'LEVEL';
    if (this.plane.vy < -0.8) trend = 'CLIMB';
    else if (this.plane.vy > 0.8) trend = 'DESCEND';
    this.trendVal.innerText = trend;
    
    // Calculate distance
    if (this.runway) {
      let dist = Math.max(0, Math.round(this.runway.x - this.plane.x));
      if (this.plane.x >= this.runway.x && this.plane.x <= this.runway.x + this.runway.width) {
        this.distVal.innerText = "0";
      } else if (this.plane.x > this.runway.x + this.runway.width) {
        this.distVal.innerText = "OVER";
      } else {
        this.distVal.innerText = dist;
      }
    }
  }

  spawnDust(x, y, amount, color) {
    for (let i = 0; i < amount; i++) {
        this.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 1) * 3,
            life: 1,
            color: color,
            size: Math.random() * 6 + 2
        });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
        let p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02 * (dt * 0.06);
        if (p.life <= 0) {
            this.particles.splice(i, 1);
        }
    }
  }

  generateClouds() {
    this.clouds = [];
    let layerCount = 16;
    for (let i = 0; i < layerCount; i++) {
      this.clouds.push({
        x: Math.random() * this.resizeData.w,
        y: 0.12 + Math.random() * 0.18,
        scale: 0.8 + Math.random() * 0.7,
        speed: 0.02 + Math.random() * 0.04,
        opacity: 0.35 + Math.random() * 0.25
      });
    }
  }

  updateClouds(dt) {
    for (let cloud of this.clouds) {
      cloud.x -= cloud.speed * dt * 0.06 * 30;
      if (cloud.x < -240) {
        cloud.x = this.resizeData.w + Math.random() * 240;
        cloud.y = 0.12 + Math.random() * 0.18;
        cloud.scale = 0.8 + Math.random() * 0.7;
        cloud.opacity = 0.35 + Math.random() * 0.25;
      }
    }
  }

  drawClouds(w, h) {
    this.ctx.save();
    for (let cloud of this.clouds) {
      let cx = cloud.x;
      let cy = h * cloud.y;
      let size = 80 * cloud.scale;

      this.ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy, size * 0.7, size * 0.4, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.ellipse(cx + size * 0.4, cy + 4, size * 0.55, size * 0.35, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.ellipse(cx - size * 0.4, cy + 2, size * 0.5, size * 0.32, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  draw() {
    // Screen shake
    if (this.screenShake > 0) {
      this.ctx.save();
      let dx = (Math.random() - 0.5) * this.screenShake;
      let dy = (Math.random() - 0.5) * this.screenShake;
      this.ctx.translate(dx, dy);
      this.screenShake *= 0.9;
      if (this.screenShake < 0.5) this.screenShake = 0;
    }

    let w = this.resizeData.w;
    let h = this.resizeData.h;

    // Clear
    this.ctx.fillStyle = '#b3d4ee';
    this.ctx.fillRect(0, 0, w, h);

    // Sky gradient
    let grad = this.ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#a1c4e6');
    grad.addColorStop(1, '#e6dec1');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, w, h);

    // Clouds in the sky
    this.drawClouds(w, h);

    // Camera setup
    // Keep plane at 20% width on screen
    let cameraX = this.plane.x - w * 0.2;
    // Ground is y=0. We want y=0 to be at screen h*0.8
    // ScreenY = (WorldY - CameraY) * scale
    // If we want world Y=0 to map to screen Y=H*0.8, then cameraY bounds are simple:
    let displayZeroY = h * 0.8;
    // Let's scroll camera vertically slightly so plane doesn't go off top
    let planeScreenY = displayZeroY + this.plane.y;
    let cameraYOffset = 0;
    
    if (planeScreenY < h * 0.3) {
      cameraYOffset = (h * 0.3) - planeScreenY;
    }

    this.ctx.save();
    
    // Draw background mountains (parallax)
    this.ctx.fillStyle = '#cad2c5';
    this.ctx.beginPath();
    let bgOffset = -(cameraX * 0.2) % 1000;
    this.ctx.moveTo(0, displayZeroY + cameraYOffset);
    for (let i = 0; i < 5; i++) {
        let x = bgOffset + i * 400;
        this.ctx.lineTo(x, displayZeroY + cameraYOffset - 150);
        this.ctx.lineTo(x + 200, displayZeroY + cameraYOffset);
    }
    this.ctx.fill();

    // Transform for world coordinates
    this.ctx.translate(-cameraX, cameraYOffset);

    // Draw Ground
    this.ctx.fillStyle = '#8a8272';
    // Extend ground far left and right
    this.ctx.fillRect(cameraX, displayZeroY, w, h); // only need to cover screen

    // Approach Lights System (ALS)
    let approachLen = 3000;
    for (let x = this.runway.x - approachLen; x < this.runway.x; x += 200) {
        if (x > cameraX - 200 && x < cameraX + w + 200) { // culling
            // Small grey pole
            this.ctx.fillStyle = '#5c636a';
            this.ctx.fillRect(x, displayZeroY - 6, 4, 6);
            // Glowing orange light
            this.ctx.fillStyle = '#e69a53'; 
            this.ctx.beginPath();
            this.ctx.arc(x + 2, displayZeroY - 8, 5, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    // Draw Runway
    this.ctx.fillStyle = '#605e59';
    this.ctx.fillRect(this.runway.x, displayZeroY, this.runway.width, 14);

    // White Runway Markings
    this.ctx.fillStyle = '#ffffff';
    let dashLen = 40;
    let dashSpace = 40;
    for (let x = this.runway.x + 20; x < this.runway.x + this.runway.width - 20; x += dashLen + dashSpace) {
        this.ctx.fillRect(x, displayZeroY, dashLen, 6);
    }
    
    // Threshold markings
    for (let i = 0; i < 4; i++) {
      this.ctx.fillRect(this.runway.x + 10, displayZeroY + i*3 - 5, 20, 2);
    }

    // Draw Particles
    for (let p of this.particles) {
        this.ctx.globalAlpha = p.life;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, displayZeroY + p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;

    // Draw Plane
    this.ctx.save();
    this.ctx.translate(this.plane.x, displayZeroY + this.plane.y);
    this.ctx.rotate(this.plane.angle * Math.PI / 180);

    // Fuselage bottom shading (drawn first/behind)
    this.ctx.fillStyle = '#dde4f0';
    this.ctx.beginPath();
    this.ctx.moveTo(-this.plane.width/2, 2);
    this.ctx.lineTo(this.plane.width/2 + 15, 2);
    this.ctx.lineTo(this.plane.width/2, 10);
    this.ctx.lineTo(-this.plane.width/2, 10);
    this.ctx.closePath();
    this.ctx.fill();

    // Main Fuselage
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.moveTo(-this.plane.width/2, -8); // Top back
    this.ctx.lineTo(this.plane.width/2, -8);  // Top front
    this.ctx.lineTo(this.plane.width/2 + 15, 2); // Nose tip
    this.ctx.lineTo(-this.plane.width/2, 2);  // Mid back
    this.ctx.closePath();
    this.ctx.fill();
    
    // Fuselage Tail angle
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.moveTo(-this.plane.width/2, -8);
    this.ctx.lineTo(-this.plane.width/2 - 8, -2);
    this.ctx.lineTo(-this.plane.width/2, 10);
    this.ctx.fill();

    // Cockpit Window
    this.ctx.fillStyle = '#8ca2b5';
    this.ctx.beginPath();
    this.ctx.moveTo(this.plane.width/2 - 5, -8);
    this.ctx.lineTo(this.plane.width/2 + 8, -2);
    this.ctx.lineTo(this.plane.width/2 + 2, 2);
    this.ctx.lineTo(this.plane.width/2 - 8, 2);
    this.ctx.fill();

    // Tail fin
    this.ctx.fillStyle = '#5c80a1'; // Soft muted blue accent
    this.ctx.beginPath();
    this.ctx.moveTo(-this.plane.width/2 + 5, -8);
    this.ctx.lineTo(-this.plane.width/2 - 5, -24);
    this.ctx.lineTo(-this.plane.width/2 - 16, -24);
    this.ctx.lineTo(-this.plane.width/2 - 8, -8);
    this.ctx.closePath();
    this.ctx.fill();

    // Back horizontal stabilizer
    this.ctx.fillStyle = '#b0c4d6';
    this.ctx.beginPath();
    this.ctx.moveTo(-this.plane.width/2 - 4, -2);
    this.ctx.lineTo(-this.plane.width/2 - 15, 4);
    this.ctx.lineTo(-this.plane.width/2 - 5, 4);
    this.ctx.fill();

    // Wing
    this.ctx.fillStyle = '#bfcedb';
    this.ctx.beginPath();
    this.ctx.moveTo(10, 4);
    this.ctx.lineTo(25, 18);
    this.ctx.lineTo(8, 18);
    this.ctx.lineTo(-10, 4);
    this.ctx.fill();

    // Engine under wing
    this.ctx.fillStyle = '#7a8e9e';
    this.ctx.beginPath();
    this.ctx.moveTo(0, 10);
    this.ctx.lineTo(14, 10);
    this.ctx.lineTo(12, 16);
    this.ctx.lineTo(2, 16);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore(); // Plane restore
    this.ctx.restore(); // Camera restore
    
    if (this.screenShake > 0) {
      this.ctx.restore();
    }
  }

  loop(time) {
    let dt = time - this.lastTime;
    this.lastTime = time;
    
    // Cap dt to prevent massive jumps when tab is inactive
    if (dt > 100) dt = 16;

    this.updatePhysics(dt);
    this.updateParticles(dt);
    this.updateClouds(dt);
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Start Game when window loads
window.onload = () => {
  new PlaneLandingGame();
};
