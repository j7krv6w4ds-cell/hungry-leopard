/*
  Snow Leopard Sling - Angry Birds style prototype
  - Uses Matter.js
  - Touch & pointer friendly
  - Three levels
  - Snow leopard projectile, mountain goats as targets
  - Destructible blocks (simple removal on strong impacts)
*/

// === Asset SVG data URLs (small inline SVGs) ===
const leopardSVG = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>
  <circle cx="64" cy="64" r="60" fill="#fff6e6" stroke="#333" stroke-width="2"/>
  <ellipse cx="46" cy="55" rx="6" ry="9" fill="#333"/>
  <ellipse cx="82" cy="55" rx="6" ry="9" fill="#333"/>
  <path d="M45 88 Q64 100 83 88" stroke="#333" stroke-width="3" fill="none" stroke-linecap="round"/>
  <g fill="#e6d5b8">
    <circle cx="42" cy="40" r="6"/>
    <circle cx="72" cy="36" r="6"/>
    <circle cx="88" cy="64" r="6"/>
    <circle cx="36" cy="68" r="6"/>
  </g>
</svg>`);

const goatSVG = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>
  <rect width="128" height="128" rx="16" fill="#fff"/>
  <g transform="translate(10,10)">
    <ellipse cx="54" cy="58" rx="38" ry="28" fill="#f2f2f2" stroke="#333" stroke-width="2"/>
    <circle cx="34" cy="50" r="6" fill="#333"/>
    <circle cx="74" cy="50" r="6" fill="#333"/>
    <path d="M24 36 Q40 12 56 36" stroke="#333" stroke-width="3" fill="none"/>
    <path d="M84 34 Q92 26 106 30" stroke="#333" stroke-width="3" fill="none"/>
  </g>
</svg>`);

// convert to data URLs
const LEOPARD_IMG = 'data:image/svg+xml;utf8,' + leopardSVG;
const GOAT_IMG = 'data:image/svg+xml;utf8,' + goatSVG;

// basic configuration
const config = {
  slingX: 180,
  slingYRatio: 0.65, // relative to canvas height
  launchLimit: 800, // max drag distance
  blockDestructSpeed: 6.5,
  goatDestructSpeed: 3.5,
  worldWidth: 5000
};

let Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Constraint = Matter.Constraint,
    Mouse = Matter.Mouse,
    Events = Matter.Events,
    Body = Matter.Body,
    Vector = Matter.Vector;

let engine, render, runner;
let world;
let canvas, scoreEl, levelLabel;
let slingPoint = {x: config.slingX, y: 300};
let projectile = null, slingConstraint = null;
let isDragging = false, launched = false;
let currentLevel = 0;
let score = 0;
let goatsAlive = 0;
let levelDefs = [];

// preload images then init
function preloadImages(urls) {
  return Promise.all(urls.map(u=>{
    return new Promise((res)=>{
      const img = new Image();
      img.onload = ()=>res(img);
      img.onerror = ()=>res(null);
      img.src = u;
    });
  }));
}

function initLevelDefinitions() {
  // each level describes arrays of blocks and goats
  // blocks: {x, y, w, h, angle}
  // goats: {x, y, r}
  levelDefs = [
    {
      blocks: [
        {x: 1100, y: 520, w: 160, h: 24},
        {x: 1100, y: 480, w: 40, h: 60},
        {x: 1180, y: 520, w: 160, h: 24},
        {x: 1260, y: 480, w: 40, h: 60},
        {x: 1380, y: 520, w: 160, h: 24}
      ],
      goats: [
        {x: 1180, y: 430, r: 26}
      ]
    },
    {
      blocks: [
        {x: 1700, y: 540, w: 220, h: 24},
        {x: 1700, y: 500, w: 40, h: 80},
        {x: 1780, y: 540, w: 120, h: 24},
        {x: 1860, y: 500, w: 40, h: 80},
        {x: 1940, y: 540, w: 220, h: 24},
        {x: 1820, y: 460, w: 40, h: 40, angle: -0.4}
      ],
      goats: [
        {x: 1780, y: 420, r: 26},
        {x: 1880, y: 420, r: 26}
      ]
    },
    {
      blocks: [
        {x: 2400, y: 560, w: 260, h: 24},
        {x: 2400, y: 520, w: 40, h: 120},
        {x: 2480, y: 560, w: 160, h: 24},
        {x: 2560, y: 520, w: 40, h: 120},
        {x: 2680, y: 560, w: 260, h: 24},
        {x: 2600, y: 480, w: 40, h: 40},
        {x: 2520, y: 480, w: 40, h: 40}
      ],
      goats: [
        {x: 2480, y: 430, r: 26},
        {x: 2600, y: 430, r: 26},
        {x: 2720, y: 430, r: 26}
      ]
    }
  ];
}

function createEngineAndRender() {
  canvas = document.getElementById('game-canvas');
  scoreEl = document.getElementById('score');
  levelLabel = document.getElementById('levelLabel');

  // create engine
  engine = Engine.create();
  world = engine.world;
  world.gravity.y = 1;

  // responsive canvas sizing for high-DPI
  function applyCanvasSize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(600, rect.width * dpr);
    canvas.height = Math.max(350, rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }
  applyCanvasSize();
  window.addEventListener('resize', ()=>{
    applyCanvasSize();
  });

  render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
      width: canvas.width,
      height: canvas.height,
      wireframes: false,
      background: 'transparent',
      showAngleIndicator: false,
      pixelRatio: window.devicePixelRatio || 1
    }
  });

  Render.run(render);

  runner = Runner.create();
  Runner.run(runner, engine);
}

function buildStaticGrounds() {
  // ground that spans wide world
  const height = render.options.height / (window.devicePixelRatio || 1);
  const worldWidth = config.worldWidth;
  const ground = Bodies.rectangle(worldWidth/2, height + 30, worldWidth, 80, {isStatic:true, render:{fillStyle:'#5c4a34'}});
  Composite.add(world, ground);

  // small platforms / slopes can be added if desired
}

function createLevel(index) {
  // clear world except engine/world default
  Composite.clear(world, false);
  goatsAlive = 0;
  launched = false;
  isDragging = false;

  // create ground and boundaries
  buildStaticGrounds();

  // create obstacles & goats
  const def = levelDefs[index];
  const blocks = def.blocks.map(b=>{
    const body = Bodies.rectangle(b.x, b.y, b.w, b.h, {
      restitution: 0.1,
      density: 0.002,
      friction: 0.6,
      render: {
        fillStyle: '#cda56b',
        strokeStyle: '#8b5a2b',
        lineWidth: 2
      }
    });
    if (b.angle) Body.rotate(body, b.angle);
    Composite.add(world, body);
    return body;
  });

  const goats = def.goats.map(g=>{
    const goat = Bodies.circle(g.x, g.y, g.r, {
      label: 'goat',
      restitution: 0.2,
      density: 0.003,
      render: {
        sprite: { texture: GOAT_IMG, xScale: (g.r*2)/128, yScale: (g.r*2)/128 }
      }
    });
    Composite.add(world, goat);
    return goat;
  });
  goatsAlive = goats.length;

  // create a few background boulders/blocks further
  for(let i=0;i<6;i++){
    const x = 800 + i*300;
    const rock = Bodies.circle(x, 420 - (i%3)*30, 36, {isStatic:false, density:0.002, friction:0.8, render:{fillStyle:'#9aaab5'}});
    Composite.add(world, rock);
  }

  // create the sling + projectile
  createSling();

  // update UI
  levelLabel.textContent = `Level: ${index+1}`;
  updateScore();
}

// create projectile and constraint
function createSling(){
  const canvasH = render.canvas.height / (window.devicePixelRatio || 1);
  slingPoint.y = Math.floor(canvasH * config.slingYRatio);

  // new projectile
  const size = 44;
  projectile = Bodies.circle(slingPoint.x, slingPoint.y, size/2, {
    restitution: 0.4,
    density: 0.006,
    friction: 0.8,
    label: 'projectile',
    render: {
      sprite: { texture: LEOPARD_IMG, xScale: size/128, yScale: size/128 }
    }
  });
  Composite.add(world, projectile);

  // constraint to the sling point
  slingConstraint = Constraint.create({
    pointA: { x: slingPoint.x, y: slingPoint.y },
    bodyB: projectile,
    stiffness: 0.02,
    length: 0
  });
  Composite.add(world, slingConstraint);

  launched = false;
}

// pointer/touch handling
function setupPointerControls(){
  const cv = render.canvas;

  // prevent scrolling gestures on the canvas
  cv.addEventListener('touchmove', (e)=>{ e.preventDefault(); }, {passive:false});

  function getPointerPos(evt){
    const rect = cv.getBoundingClientRect();
    let clientX, clientY;
    if (evt.touches && evt.touches.length) {
      clientX = evt.touches[0].clientX; clientY = evt.touches[0].clientY;
    } else {
      clientX = evt.clientX; clientY = evt.clientY;
    }
    const x = (clientX - rect.left);
    const y = (clientY - rect.top);
    return {x, y};
  }

  function pointerDown(evt){
    const p = getPointerPos(evt);
    // convert pointer pos to world coords noting camera transform (render.bounds)
    const worldPoint = viewToWorld(p);
    if (!projectile) return;
    const dist = Math.hypot(worldPoint.x - projectile.position.x, worldPoint.y - projectile.position.y);
    if (dist < 60 && !launched) {
      isDragging = true;
      // disable body velocity while dragging
      Body.setVelocity(projectile, {x:0,y:0});
      Body.setAngularVelocity(projectile, 0);
      Body.setStatic(projectile, true);
    }
  }

  function pointerMove(evt){
    if (!isDragging || !projectile) return;
    const p = getPointerPos(evt);
    const worldPoint = viewToWorld(p);
    // limit drag distance from sling point
    let delta = Vector.sub(worldPoint, slingPoint);
    const dist = Vector.magnitude(delta);
    if (dist > config.launchLimit) {
      delta = Vector.mult(Vector.normalise(delta), config.launchLimit);
    }
    const target = Vector.add(slingPoint, delta);
    Body.setPosition(projectile, target);
  }

  function pointerUp(evt){
    if (!isDragging) return;
    isDragging = false;
    if (!projectile) return;
    // release projectile: re-enable physics and remove constraint so it launches
    Body.setStatic(projectile, false);
    // slight delay before removing constraint for consistent launch feel
    setTimeout(()=> {
      if (slingConstraint) Composite.remove(world, slingConstraint);
      slingConstraint = null;
      launched = true;
    }, 16);
  }

  // map pointer events
  cv.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);

  // legacy touch fallback (safari)
  cv.addEventListener('touchstart', pointerDown, {passive:false});
  window.addEventListener('touchmove', pointerMove, {passive:false});
  window.addEventListener('touchend', pointerUp);

  // keyboard: space to reset projectile (for desktop)
  window.addEventListener('keydown', (e)=>{
    if (e.code==='Space') resetProjectile();
  });
}

// convert screen point to world coords based on render.bounds
function viewToWorld(pt){
  const bounds = render.bounds;
  const viewportWidth = render.canvas.width / (window.devicePixelRatio || 1);
  const viewportHeight = render.canvas.height / (window.devicePixelRatio || 1);
  const scaleX = (bounds.max.x - bounds.min.x) / viewportWidth;
  const scaleY = (bounds.max.y - bounds.min.y) / viewportHeight;
  return {
    x: bounds.min.x + pt.x * scaleX,
    y: bounds.min.y + pt.y * scaleY
  };
}

// convert world to view (not used currently)
function worldToView(pt){
  const bounds = render.bounds;
  const viewportWidth = render.canvas.width / (window.devicePixelRatio || 1);
  const viewportHeight = render.canvas.height / (window.devicePixelRatio || 1);
  const scaleX = viewportWidth / (bounds.max.x - bounds.min.x);
  const scaleY = viewportHeight / (bounds.max.y - bounds.min.y);
  return {
    x: (pt.x - bounds.min.x) * scaleX,
    y: (pt.y - bounds.min.y) * scaleY
  };
}

// update UI score
function updateScore(){
  scoreEl.textContent = `Score: ${score}`;
}

// reset the projectile to allow another shot (if you added spare projectiles)
function resetProjectile(){
  if (projectile) {
    // remove existing projectile
    try { Composite.remove(world, projectile); } catch(e){}
    projectile = null;
  }
  if (slingConstraint) {
    try { Composite.remove(world, slingConstraint); } catch(e){}
    slingConstraint = null;
  }
  createSling();
}

// check collisions to remove weak blocks/goats
function setupCollisionHandlers(){
  Events.on(engine, 'collisionStart', (ev) => {
    const pairs = ev.pairs;
    for (let pair of pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;

      // check potential block damage
      [a,b].forEach(body => {
        if (!body || body.isStatic) return;
        // block heuristic: rects have render.fillStyle matching block color
        if (body.render && body.render.fillStyle === '#cda56b') {
          // check partner speed
          const impactSpeed = Math.max(a.speed || 0, b.speed || 0);
          if (impactSpeed > config.blockDestructSpeed) {
            // remove block and score
            Composite.remove(world, body);
            score += Math.round(impactSpeed*3);
            updateScore();
          }
        }
      });

      // goats: if goat collides hard -> remove
      if (a.label === 'goat' || b.label === 'goat') {
        const goat = a.label === 'goat' ? a : b;
        const other = a === goat ? b : a;
        const impactSpeed = Math.max(goat.speed || 0, other.speed || 0);
        if (impactSpeed > config.goatDestructSpeed) {
          // remove goat
          Composite.remove(world, goat);
          goatsAlive = Math.max(0, goatsAlive - 1);
          score += 250;
          updateScore();
          checkLevelComplete();
        }
      }
    }
  });
}

// simple camera follow: shift render.bounds towards projectile when launched
function setupCameraFollow(){
  Events.on(engine, 'afterUpdate', () => {
    const bounds = render.bounds;
    const viewportWidth = render.canvas.width / (window.devicePixelRatio || 1);
    const viewportHeight = render.canvas.height / (window.devicePixelRatio || 1);

    // clamp the world bounds
    const minX = 0;
    const maxX = config.worldWidth - (bounds.max.x - bounds.min.x);

    if (launched && projectile) {
      // focus target x near projectile
      const targetX = projectile.position.x - viewportWidth * 0.35;
      const targetY = Math.max(0, projectile.position.y - viewportHeight * 0.45);
      const lerp = 0.08;
      const newMinX = bounds.min.x + (Math.max(minX, Math.min(maxX, targetX)) - bounds.min.x) * lerp;
      const newMinY = bounds.min.y + (Math.max(0, Math.min(200, targetY)) - bounds.min.y) * lerp;

      bounds.min.x = newMinX;
      bounds.max.x = newMinX + viewportWidth;
      bounds.min.y = newMinY;
      bounds.max.y = newMinY + viewportHeight;
    } else {
      // idle look at sling area
      const targetX = 0;
      const newMinX = bounds.min.x + (targetX - bounds.min.x) * 0.06;
      bounds.min.x = newMinX;
      bounds.max.x = newMinX + viewportWidth;
    }
  });
}

// check if all goats destroyed -> show next button enabled
function checkLevelComplete(){
  if (goatsAlive <= 0) {
    document.getElementById('hint').textContent = 'Level cleared! Press Next.';
  }
}

// UI button behaviors
function setupUI(){
  document.getElementById('resetBtn').addEventListener('click', ()=>{
    resetLevel();
  });
  document.getElementById('nextBtn').addEventListener('click', ()=>{
    nextLevel();
  });
}

function resetLevel(){
  createLevel(currentLevel);
  document.getElementById('hint').textContent = 'Drag the snow leopard and release to launch';
}

function nextLevel(){
  if (currentLevel < levelDefs.length - 1) {
    currentLevel++;
    createLevel(currentLevel);
    document.getElementById('hint').textContent = 'Drag the snow leopard and release to launch';
  } else {
    document.getElementById('hint').textContent = 'No more levels in this prototype. Reset to play again.';
  }
}

// initialization
preloadImages([LEOPARD_IMG, GOAT_IMG]).then(()=>{
  initLevelDefinitions();
  createEngineAndRender();
  createLevel(0);
  setupPointerControls();
  setupCollisionHandlers();
  setupCameraFollow();
  setupUI();

  // quick HUD update
  score = 0;
  updateScore();

  // keep render bounds sensible initially
  const viewportWidth = render.canvas.width / (window.devicePixelRatio || 1);
  const viewportHeight = render.canvas.height / (window.devicePixelRatio || 1);
  render.bounds.min.x = 0;
  render.bounds.min.y = 0;
  render.bounds.max.x = viewportWidth;
  render.bounds.max.y = viewportHeight;
});


// --- end of main.js ---
