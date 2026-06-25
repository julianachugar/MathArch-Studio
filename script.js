// Configuración  de Supabase
const SUPABASE_URL = "https://qllrqzmxhubmuzradbrr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_4HWOpoYASZDSwvoGYsUwvw_G--CUWmz";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════════════════
   DATOS Y ESTADO — MATERIALES CON CRITERIO TÉCNICO Y 3D
   ═══════════════════════════════════════════════════════ */
const MATS = [
  {
    id: 'madera',
    name: 'Madera laminada',
    cost: 420,
    eco: 0.28,
    minSlope: 8,
    desc: 'Liviana · renovable',
    fullDesc: 'Excelente equilibrio: huella de carbono muy baja y costo moderado. Al ser paneles encastrados, exige pendientes intermedias para evitar filtraciones en las uniones.',
    prosCons: '🟢 Captura CO₂ / 🔴 Requiere mantenimiento hidráulico.',
    // ── PROPIEDADES 3D ──
    roughness: 0.8,   // Mate, no refleja casi nada
    metalness: 0.1,   // No es metálico
    opacity: 1.0,     // Totalmente opaco
    transparent: false
  },
  {
    id: 'hormigon',
    name: 'Hormigón visto',
    cost: 260,
    eco: 0.82,
    minSlope: 2,
    desc: 'Resistente · pesado',
    fullDesc: 'Es el material más económico pero con una altísima huella de carbono debido a la producción del cemento. Su gran ventaja es que es monolítico (una sola pieza), lo que permite cubiertas casi planas sin riesgo de filtración.',
    prosCons: '🟢 Muy económico y duradero / 🔴 Emisiones de CO₂ muy elevadas.',
    // ── PROPIEDADES 3D ──
    roughness: 0.95,  // Súper rugoso y opaco (absorbe la luz)
    metalness: 0.0,   // Cero componentes metálicos
    opacity: 1.0,
    transparent: false
  },
  {
    id: 'acero',
    name: 'Acero',
    cost: 680,
    eco: 0.60,
    minSlope: 5,
    desc: 'Alta resistencia',
    fullDesc: 'Costo elevado y huella de carbono alta. Sin embargo, permite piezas estructurales muy esbeltas y una excelente impermeabilización por solape de chapas metálicas, bancándose pendientes bajas.',
    prosCons: '🟢 Gran resistencia estructural / 🔴 Costo financiero elevado.',
    // ── PROPIEDADES 3D ──
    roughness: 0.3,   // Bastante liso para que brille con la luz
    metalness: 0.9,   // Máximo nivel metálico (reflejo industrial)
    opacity: 1.0,
    transparent: false
  },
  {
    id: 'vidrio',
    name: 'Vidrio estructural',
    cost: 980,
    eco: 0.22,
    minSlope: 6,
    desc: 'Estético · bajo impacto',
    fullDesc: 'El material más caro del catálogo. Su impacto ambiental es bajo gracias a la luz natural que filtra (ahorro energético) y componentes reciclables. Exige pendientes moderadas para evitar que el agua estancada ensucie los paños.',
    prosCons: '🟢 Estética premium y luz natural / 🔴 Costo crítico por metro cuadrado.',
    // ── PROPIEDADES 3D ──
    roughness: 0.1,   // Hiper pulido, reflejo tipo espejo
    metalness: 0.8,   // Brillo de cristal reflectante
    opacity: 0.35,    // Traslúcido para ver a través de él
    transparent: true // Activa el canal alfa en WebGL
  }
];

const CONSTRAINTS = {
  hMin: 3, hMax: 9, wMin: 8, areaMin: 20, slopeMin: 4, ecoMax: 0.75
};

const SCORE_CATS = [
  {key:'s1', label:'Eficiencia estructural'},
  {key:'s2', label:'Escala humana'},
  {key:'s3', label:'Sustentabilidad'},
  {key:'s4', label:'Drenaje pluvial'},
  {key:'s5', label:'Diseño global'},
];

let S = {
  grupo:'', integrantes:'', mat:MATS[0],
  a:-0.5, b:0, c:6, px:0.5,
  scores:{s1:0,s2:0,s3:0,s4:0,s5:0}, total:0
};

let ranking = [];
let rainParticles = [];
let rainRAF = null;
let activeTab = 0;


/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const fmt = (n, d=2) => Number(n).toFixed(d);
const f = x => S.a*x*x + S.b*x + S.c;
const fp = x => 2*S.a*x + S.b;
const angDeg = x => Math.atan(Math.abs(fp(x)))*180/Math.PI;

function getRange() {
  const {a,b,c} = S;
  const disc = b*b - 4*a*c;
  if(disc < 0) return {x0:-6, x1:6};
  const sq = Math.sqrt(disc);
  const r1 = (-b-sq)/(2*a), r2 = (-b+sq)/(2*a);
  return {x0: Math.min(r1,r2), x1: Math.max(r1,r2)};
}

function getVx() { return -S.b/(2*S.a); }

function numInteg(x0, x1, n=300) {
  const dx=(x1-x0)/n; let s=0;
  for(let i=0;i<n;i++) s += Math.max(0, f(x0+(i+.5)*dx))*dx;
  return s;
}

function avgSlope(x0, x1, n=20) {
  let s=0;
  for(let i=0;i<n;i++) s += angDeg(x0+i*(x1-x0)/(n-1));
  return s/n;
}

/* ═══════════════════════════════════════════════════════
   START / TABS
═══════════════════════════════════════════════════════ */
function startApp() {
  const g = $('inp-grupo').value.trim();
  if(!g) { $('inp-grupo').focus(); return; }
  S.grupo = g;
  S.integrantes = $('inp-integrantes').value.trim();
  $('lbl-grupo').textContent = g;
  $('intro').classList.remove('active');
  $('app').classList.add('active');
  buildMatGrid();
  buildScoreRows();
  update();
}

$('inp-grupo').addEventListener('keydown', e => { if(e.key==='Enter') startApp(); });

function setTab(i) {
  activeTab = i;
  document.querySelectorAll('.tab').forEach((t,j) => t.classList.toggle('active', j===i));
  document.querySelectorAll('.panel').forEach((p,j) => p.classList.toggle('active', j===i));
  if(i===1) updateDeriv();
  if(i===2) drawInteg();
  if(i===3) { initRain(); drawRain(); }
  if(i===4) renderEvalGrid();
  if(i===5) fetchRanking();
}


/* ═══════════════════════════════════════════════════════
   MATERIAL GRID
═══════════════════════════════════════════════════════ */
function buildMatGrid() {
  $('mat-grid').innerHTML = MATS.map(m => `
    <button class="mat-btn ${m.id===S.mat.id?'sel':''}" onclick="selMat('${m.id}')">
      <div class="mat-name">${m.name}</div>
      <div class="mat-specs">$${m.cost}/m² · eco ${m.eco}</div>
    </button>`).join('');
}
function selMat(id) { S.mat = MATS.find(m=>m.id===id); buildMatGrid(); update(); }

/* ═══════════════════════════════════════════════════════
   MAIN UPDATE
═══════════════════════════════════════════════════════ */
function update() {
  S.a = parseFloat($('sl-a').value);
  S.b = parseFloat($('sl-b').value);
  S.c = parseFloat($('sl-c').value);
  $('val-a').textContent = fmt(S.a);
  $('val-b').textContent = fmt(S.b);
  $('val-c').textContent = fmt(S.c);

  const {x0,x1} = getRange();
  const vx = getVx(), vy = f(vx);
  const hmax = Math.max(0, vy);
  const ancho = x1-x0;
  const area = numInteg(x0, x1);
  const pMaxAng = angDeg(x0);
  const ecoVal = S.mat.eco;

  // formula badge
  const a=S.a, b=S.b, c=S.c;
  $('formula-badge').textContent = `y = ${fmt(a,2)}x² ${b>=0?'+':''}${fmt(b,2)}x ${c>=0?'+':''}${fmt(c,1)}`;

  // metrics + color coding
  setMetric('m-hmax','m-hmax-c', fmt(hmax,1), hmax>=CONSTRAINTS.hMin&&hmax<=CONSTRAINTS.hMax?'ok':(hmax<CONSTRAINTS.hMin?'err':'warn'));
  setMetric('m-ancho','m-ancho-c', fmt(ancho,1), ancho>=CONSTRAINTS.wMin?'ok':'err');
  $('m-vx').textContent = fmt(vx,2);
  setMetric('m-area','m-area-c', fmt(area,1), area>=CONSTRAINTS.areaMin?'ok':'err');
  $('m-pmax').textContent = fmt(pMaxAng,1)+'°';
  setMetric('m-eco','m-eco-c', ecoVal.toFixed(2), ecoVal<=CONSTRAINTS.ecoMax?'ok':'err');

  // constraint status bar
  renderConstraints(hmax, ancho, area, avgSlope(x0,x1), ecoVal);

  // draw
  drawMath(x0,x1,vx,vy);
  drawArch(x0,x1,vx,vy);

  // scores
  calcScores(hmax, ancho, area, avgSlope(x0,x1));

  // update open tabs
  if(activeTab===1) updateDeriv();
  if(activeTab===2) drawInteg();
  if(activeTab===3) { initRain(); }
}

function setMetric(valId, cardId, val, status) {
  $(valId).textContent = val;
  const card = $(cardId);
  if(card) { card.className = 'metric ' + status; }
}

function renderConstraints(hmax, ancho, area, slope, eco) {
  const cs = [
    {lbl:'Altura', val:fmt(hmax,1)+'m', ok: hmax>=CONSTRAINTS.hMin&&hmax<=CONSTRAINTS.hMax},
    {lbl:'Ancho',  val:fmt(ancho,1)+'m', ok: ancho>=CONSTRAINTS.wMin},
    {lbl:'Superficie', val:fmt(area,1)+'m²', ok: area>=CONSTRAINTS.areaMin},
    {lbl:'Drenaje', val:fmt(slope,1)+'°', ok: slope>=CONSTRAINTS.slopeMin},
    {lbl:'Eco', val:eco.toFixed(2), ok: eco<=CONSTRAINTS.ecoMax},
  ];
  $('constraint-status').innerHTML = cs.map(c=>`
    <div class="cs-item ${c.ok?'ok':'err'}">
      <div class="cs-lbl">${c.lbl}</div>
      <div class="cs-val">${c.val} ${c.ok?'✓':'✗'}</div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════════
   DIBUJO — MATEMÁTICO (ahora también expone el transform
   de pantalla↔matemática para que los puntos sean draggables)
═══════════════════════════════════════════════════════ */

// Guarda el último mapeo pixel↔coordenada-matemática usado al dibujar cv-math.
// Los manejadores de mouse (mousedown/mousemove) lo reutilizan para saber
// dónde están los puntos de control en pantalla y a qué (x,y) matemático
// corresponde la posición actual del mouse. Se recalcula en cada drawMath().
let mathTransform = null;

function drawMath(x0,x1,vx,vy) {
  const cv=$('cv-math'), ctx=cv.getContext('2d');
  const W=cv.width, H=cv.height, PAD=36;

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#F7F9FC'; ctx.fillRect(0,0,W,H);

  // DEFINIMOS UN RANGO FIJO PARA EL GRÁFICO (Ej: de -10 a 10 metros en el eje X)
  const xMinFijo = -10;
  const xMaxFijo = 10;

  const yMin = Math.min(0, f(x0), f(x1))-0.5;
  const yMax = Math.max(vy,0)+0.8;
  
  // Modificamos las funciones de transformación para usar la escala estática
  const tX = x=>(x-xMinFijo)/(xMaxFijo-xMinFijo)*(W-2*PAD)+PAD;
  const tY = y=>H-PAD-(y-yMin)/(yMax-yMin)*(H-2*PAD);

  mathTransform = {
    x0, x1, yMin, yMax, W, H, PAD,
    tX, tY,
    // La conversión inversa del mouse también debe respetar la escala fija
    invX: px => xMinFijo + (px-PAD)/(W-2*PAD)*(xMaxFijo-xMinFijo),
    invY: py => yMin + (H-PAD-py)/(H-2*PAD)*(yMax-yMin),
  };


  // grid
  ctx.strokeStyle='rgba(30,80,120,0.07)'; ctx.lineWidth=1;
  for(let gx=Math.ceil(x0);gx<=Math.floor(x1);gx++){
    ctx.beginPath(); ctx.moveTo(tX(gx),PAD); ctx.lineTo(tX(gx),H-PAD); ctx.stroke();
  }
  for(let gy=Math.ceil(yMin);gy<=Math.floor(yMax);gy++){
    ctx.beginPath(); ctx.moveTo(PAD,tY(gy)); ctx.lineTo(W-PAD,tY(gy)); ctx.stroke();
  }

  // axes
  ctx.strokeStyle='rgba(30,80,120,0.25)'; ctx.lineWidth=1;
  if(yMin<0&&yMax>0){
    ctx.beginPath(); ctx.moveTo(PAD,tY(0)); ctx.lineTo(W-PAD,tY(0)); ctx.stroke();
  }
  if(x0<0&&x1>0){
    ctx.beginPath(); ctx.moveTo(tX(0),PAD); ctx.lineTo(tX(0),H-PAD); ctx.stroke();
  }

  // axis ticks + labels
  ctx.fillStyle='rgba(30,80,120,0.4)'; ctx.font='10px Space Mono,monospace'; ctx.textAlign='center';
  for(let gx=Math.ceil(x0);gx<=Math.floor(x1);gx++){
    if(gx!==0){
      ctx.fillText(gx, tX(gx), H-PAD+14);
    }
  }
  ctx.textAlign='right';
  for(let gy=Math.ceil(yMin);gy<=Math.floor(yMax);gy++){
    if(gy!==0) ctx.fillText(gy, PAD-4, tY(gy)+3);
  }

  // parabola fill
  ctx.beginPath();
  ctx.moveTo(tX(x0), tY(Math.max(0,f(x0))));
  for(let i=0;i<=200;i++){
    const x=x0+i*(x1-x0)/200;
    ctx.lineTo(tX(x), tY(f(x)));
  }
  ctx.lineTo(tX(x1), tY(Math.max(0,f(x1))));
  ctx.closePath();
  ctx.fillStyle='rgba(46,134,171,0.06)'; ctx.fill();

  // parabola stroke
  ctx.strokeStyle='#2E86AB'; ctx.lineWidth=2.5;
  ctx.beginPath();
  for(let i=0;i<=200;i++){
    const x=x0+i*(x1-x0)/200;
    i===0?ctx.moveTo(tX(x),tY(f(x))):ctx.lineTo(tX(x),tY(f(x)));
  }
  ctx.stroke();

  // ── Puntos de control draggables: raíz izquierda y raíz derecha ──
  // Se dibujan ANTES del vértice para que el vértice quede "por encima"
  // visualmente si llegaran a superponerse en parábolas muy angostas.
  const rootStyle = (isHover) => {
    ctx.fillStyle = isHover ? '#E74C3C' : '#B03A2E';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
  };
  [{x:x0, key:'root0'}, {x:x1, key:'root1'}].forEach(r => {
    const isHover = dragState.hoverPoint === r.key || dragState.activePoint === r.key;
    rootStyle(isHover);
    ctx.beginPath(); ctx.arc(tX(r.x), tY(0), isHover?7:5.5, 0, 2*Math.PI); ctx.fill(); ctx.stroke();
  });
  ctx.fillStyle='rgba(176,58,46,0.7)'; ctx.font='9px Space Mono,monospace'; ctx.textAlign='center';
  ctx.fillText(`raíz`, tX(x0), tY(0)+18);
  ctx.fillText(`raíz`, tX(x1), tY(0)+18);

  // ── Punto de control draggable: vértice ──
  const vertexHover = dragState.hoverPoint === 'vertex' || dragState.activePoint === 'vertex';
  ctx.fillStyle = vertexHover ? '#2E86AB' : '#1A5276';
  ctx.beginPath(); ctx.arc(tX(vx),tY(vy), vertexHover?8:6, 0,2*Math.PI); ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='rgba(26,82,118,0.6)'; ctx.font='10px Space Mono,monospace'; ctx.textAlign='left';
  ctx.fillText(`V(${fmt(vx,1)}, ${fmt(vy,1)})`, tX(vx)+10, tY(vy)-6);

  // axis labels
  ctx.fillStyle='rgba(30,80,120,0.4)'; ctx.font='10px Space Mono,monospace';
  ctx.textAlign='left'; ctx.fillText('y', PAD-8, PAD+8);
  ctx.textAlign='right'; ctx.fillText('x', W-PAD+14, tY(0)+4);
}


/* ═══════════════════════════════════════════════════════
   PUNTOS DE CONTROL DRAGGABLES SOBRE cv-math
   ───────────────────────────────────────────────────────
   Permite arrastrar con el mouse: el vértice (V) y las dos raíces.
   Cada arrastre recalcula a, b, c y dispara el mismo update() que
   usan los sliders, así que TODO lo demás (canvas 3D, scores,
   restricciones, etc.) se sigue refrescando exactamente igual.

   Mapeo matemático usado al arrastrar:
   - Vértice (vx, vy):  dado a fijo,  b = -2*a*vx   y   c = vy - a*vx²
                        (se despeja de vx=-b/2a y vy=f(vx))
   - Raíz x0 o x1:      dado a fijo y la otra raíz fija, la parábola
                        queda definida por sus dos raíces (xr1, xr2):
                        f(x) = a(x - xr1)(x - xr2)  →  se expande para
                        obtener b y c en función de a, xr1, xr2.
═══════════════════════════════════════════════════════ */
const HIT_RADIUS = 12; // px de tolerancia para "agarrar" un punto con el mouse

let dragState = {
  activePoint: null,   // 'vertex' | 'root0' | 'root1' | null mientras se arrastra
  hoverPoint: null,    // igual, pero solo para resaltar al pasar el mouse (sin click)
  fixedRoot: null,      // al arrastrar una raíz, guardamos la OTRA raíz para no moverla
};

/**
 * Convierte coordenadas de mouse (relativas al viewport) a coordenadas
 * internas del canvas, considerando que el canvas se escala con CSS
 * (width:100% en el wrapper) pero su resolución interna es fija (700x220).
 */
function getCanvasCoords(evt, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    px: (evt.clientX - rect.left) * scaleX,
    py: (evt.clientY - rect.top) * scaleY,
  };
}

/**
 * Determina si (px,py) está suficientemente cerca de alguno de los
 * 3 puntos de control actuales (vértice, raíz0, raíz1) y devuelve
 * su identificador, o null si no hay match.
 */
function hitTestControlPoints(px, py) {
  if (!mathTransform) return null;
  const {tX, tY} = mathTransform;
  const vx = getVx(), vy = f(vx);
  const {x0, x1} = getRange();

  const candidates = [
    {key:'vertex', sx: tX(vx), sy: tY(vy)},
    {key:'root0',  sx: tX(x0), sy: tY(0)},
    {key:'root1',  sx: tX(x1), sy: tY(0)},
  ];
  for (const c of candidates) {
    const d = Math.hypot(px - c.sx, py - c.sy);
    if (d <= HIT_RADIUS) return c.key;
  }
  return null;
}

/**
 * Aplica nuevos coeficientes (a,b,c) al estado, los clampea a los
 * rangos de los sliders (para no generar geometrías degeneradas o
 * fuera del dominio pedagógico), sincroniza sliders + inputs numéricos,
 * y llama a update() para refrescar TODA la app (igual que un slider).
 */
function applyCoeffs(a, b, c) {
  const slA = $('sl-a'), slB = $('sl-b'), slC = $('sl-c');
  a = Math.min(parseFloat(slA.max), Math.max(parseFloat(slA.min), a));
  b = Math.min(parseFloat(slB.max), Math.max(parseFloat(slB.min), b));
  c = Math.min(parseFloat(slC.max), Math.max(parseFloat(slC.min), c));

  slA.value = a; slB.value = b; slC.value = c;
  update(); // S.a/b/c, val-a/b/c y todos los gráficos se actualizan acá adentro
}

/**
 * Arrastre del VÉRTICE: mantiene 'a' constante (no cambiamos la
 * curvatura al mover el vértice) y resuelve b, c a partir de la
 * nueva posición (vx, vy) deseada.
 *   vx = -b/(2a)  →  b = -2*a*vx
 *   vy = a*vx² + b*vx + c  →  c = vy - a*vx² - b*vx
 */
function dragVertex(mathX, mathY) {
  const a = S.a; // curvatura fija mientras se arrastra el vértice
  // vy no puede ser negativo (no tiene sentido arquitectónico una cubierta bajo el piso)
  const vy = Math.max(0.1, mathY);
  const vx = mathX;
  const b = -2 * a * vx;
  const c = vy - a*vx*vx - b*vx;
  applyCoeffs(a, b, c);
}

/**
 * Arrastre de una RAÍZ: mantiene 'a' constante y la OTRA raíz fija
 * (guardada en dragState.fixedRoot al iniciar el drag). Reconstruye
 * b y c a partir de las dos raíces, usando la forma factorizada:
 *   f(x) = a(x - r1)(x - r2) = a*x² - a*(r1+r2)*x + a*r1*r2
 *   →  b = -a*(r1+r2)     c = a*r1*r2
 */
function dragRoot(movingRootX) {
  const a = S.a;
  const fixed = dragState.fixedRoot;
  const r1 = movingRootX, r2 = fixed;
  // evita que las dos raíces colapsen en el mismo punto (ancho → 0)
  if (Math.abs(r1 - r2) < 0.5) return;
  const b = -a*(r1+r2);
  const c = a*r1*r2;
  applyCoeffs(a, b, c);
}

/**
 * Actualiza a/b/c cuando el usuario edita directamente el cuadro
 * numérico (en vez de mover el slider o arrastrar el canvas).
 * Conecta con onchange="updateFromTextInput('a', this.value)" en el HTML.
 */
function updateFromTextInput(coef, rawValue) {
  const val = parseFloat(rawValue);
  if (isNaN(val)) { update(); return; } // valor inválido → simplemente re-sincroniza con el estado actual
  if (coef === 'a') applyCoeffs(val, S.b, S.c);
  if (coef === 'b') applyCoeffs(S.a, val, S.c);
  if (coef === 'c') applyCoeffs(S.a, S.b, val);
}

/**
 * Inicializa los listeners de mouse sobre cv-math. Se llama una sola
 * vez al cargar la app (al final del script). Como el canvas se vuelve
 * a dibujar constantemente, los listeners no se reinyectan: solo leen
 * el `mathTransform` global más reciente en cada evento.
 */
function initMathCanvasDrag() {
  const cv = $('cv-math');
  if (!cv) return;

  cv.addEventListener('mousedown', (evt) => {
    const {px, py} = getCanvasCoords(evt, cv);
    const hit = hitTestControlPoints(px, py);
    if (!hit) return;
    dragState.activePoint = hit;
    cv.classList.add('dragging');

    // si empieza a arrastrar una raíz, fijamos la otra para no moverla
    if (hit === 'root0' || hit === 'root1') {
      const {x0, x1} = getRange();
      dragState.fixedRoot = (hit === 'root0') ? x1 : x0;
    }
    evt.preventDefault();
  });

  window.addEventListener('mousemove', (evt) => {
    if (!cv || !mathTransform) return;
    const {px, py} = getCanvasCoords(evt, cv);

    if (!dragState.activePoint) {
      // sin drag activo: solo actualizamos el hover (para cursor + resaltado visual)
      const hit = hitTestControlPoints(px, py);
      if (hit !== dragState.hoverPoint) {
        dragState.hoverPoint = hit;
        cv.classList.toggle('draggable-hover', !!hit);
        // redibuja solo para mostrar el resaltado de hover (sin tocar S ni recalcular nada más)
        const {x0:hx0, x1:hx1} = getRange();
        drawMath(hx0, hx1, getVx(), f(getVx()));
      }
      return;
    }

    // hay un punto siendo arrastrado: convertimos pixel → coordenada matemática
    const mathX = mathTransform.invX(px);
    const mathY = mathTransform.invY(py);

    if (dragState.activePoint === 'vertex') dragVertex(mathX, mathY);
    else dragRoot(mathX); // root0 o root1: la posición X del mouse es la nueva raíz
  });

  window.addEventListener('mouseup', () => {
    if (dragState.activePoint) {
      dragState.activePoint = null;
      dragState.fixedRoot = null;
      cv.classList.remove('dragging');
    }
  });

  // si el mouse sale del canvas sin soltar el botón, quitamos el hover visual
  cv.addEventListener('mouseleave', () => {
    if (!dragState.activePoint && dragState.hoverPoint) {
      dragState.hoverPoint = null;
      cv.classList.remove('draggable-hover');
    }
  });
}


function drawArch(x0,x1,vx,vy) {
  const cv=$('cv-arch'), ctx=cv.getContext('2d');
  const W=cv.width, H=cv.height;
  const PAD_L=40, PAD_R=40, PAD_B=36, PAD_T=20;
  const DW=W-PAD_L-PAD_R, DH=H-PAD_T-PAD_B;

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#EEF3F8'; ctx.fillRect(0,0,W,H);

  // sky gradient
  const sky=ctx.createLinearGradient(0,0,0,H*0.6);
  sky.addColorStop(0,'#D6EAF8'); sky.addColorStop(1,'#EEF3F8');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.65);

  const terrenoMin = -12.5;
  const terrenoMax = 12.5;

  const maxH=Math.max(vy,7.0);
  
  // Transformamos las coordenadas basándonos en el terreno fijo
  const tX=x=>PAD_L+(x-terrenoMin)/(terrenoMax-terrenoMin)*DW;
  const tY=y=>H-PAD_B-(Math.max(0,y)/maxH)*DH;
  const groundY=H-PAD_B;

  // ground shadow
  ctx.fillStyle='rgba(0,0,0,0.06)';
  ctx.beginPath();
  ctx.ellipse(W/2, groundY+4, DW*0.45, 6, 0, 0, 2*Math.PI);
  ctx.fill();

  // ground
  ctx.fillStyle='#CBD5E0';
  ctx.fillRect(0, groundY, W, PAD_B);
  ctx.fillStyle='#A0ADB8';
  ctx.fillRect(0, groundY, W, 1.5);

  // ground lines (pavement)
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.setLineDash([8,12]);
  for(let i=1;i<4;i++){
    ctx.beginPath(); ctx.moveTo(W*i/4, groundY+4); ctx.lineTo(W*i/4, H); ctx.stroke();
  }
  ctx.setLineDash([]);

  // roof fill
  ctx.beginPath();
  ctx.moveTo(tX(x0), groundY);
  for(let i=0;i<=200;i++){
    const x=x0+i*(x1-x0)/200;
    ctx.lineTo(tX(x), tY(f(x)));
  }
  ctx.lineTo(tX(x1), groundY);
  ctx.closePath();
  const roofFill=ctx.createLinearGradient(0,tY(vy),0,groundY);
  roofFill.addColorStop(0,'rgba(46,134,171,0.18)');
  roofFill.addColorStop(1,'rgba(46,134,171,0.04)');
  ctx.fillStyle=roofFill; ctx.fill();

  // structural columns
  ctx.strokeStyle='rgba(26,82,118,0.4)'; ctx.lineWidth=1.5; ctx.setLineDash([]);
  const colCount=6;
  for(let i=0;i<=colCount;i++){
    const cx=x0+i*(x1-x0)/colCount;
    const cy=f(cx);
    if(cy>0){
      ctx.beginPath();
      ctx.moveTo(tX(cx), groundY);
      ctx.lineTo(tX(cx), tY(cy));
      ctx.stroke();
      // column base plate
      ctx.fillStyle='rgba(26,82,118,0.3)';
      ctx.fillRect(tX(cx)-3, groundY-2, 6, 4);
    }
  }

  // roof outline
  ctx.strokeStyle='#1A5276'; ctx.lineWidth=2.5; ctx.setLineDash([]);
  ctx.beginPath();
  for(let i=0;i<=200;i++){
    const x=x0+i*(x1-x0)/200;
    const y=f(x);
    if(y<0) continue;
    i===0?ctx.moveTo(tX(x),tY(y)):ctx.lineTo(tX(x),tY(y));
  }
  ctx.stroke();

  // ridge line (highlight)
  ctx.strokeStyle='rgba(126,200,227,0.5)'; ctx.lineWidth=4;
  ctx.beginPath();
  for(let i=0;i<=200;i++){
    const x=x0+i*(x1-x0)/200;
    const y=f(x);
    if(y<0) continue;
    i===0?ctx.moveTo(tX(x),tY(y)):ctx.lineTo(tX(x),tY(y));
  }
  ctx.stroke();

  // draw people (stick figures for human scale)
  const personPositions=[0.2,0.5,0.8];
  for(const pos of personPositions){
    const px=x0+pos*(x1-x0);
    const py=f(px);
    if(py<0) continue;
    const pxS=tX(px);
    const personH=Math.min(40, DH*0.18);
    const footY=groundY-2;
    const headY=footY-personH;
    const headR=personH*0.14;

    ctx.strokeStyle='#5A6B7A'; ctx.lineWidth=1.5; ctx.lineCap='round';
    // head
    ctx.beginPath(); ctx.arc(pxS, headY-headR, headR, 0, 2*Math.PI); ctx.stroke();
    // body
    ctx.beginPath(); ctx.moveTo(pxS, headY); ctx.lineTo(pxS, headY+personH*0.4); ctx.stroke();
    // arms
    ctx.beginPath(); ctx.moveTo(pxS-personH*0.2, headY+personH*0.15); ctx.lineTo(pxS+personH*0.2, headY+personH*0.15); ctx.stroke();
    // legs
    ctx.beginPath(); ctx.moveTo(pxS, headY+personH*0.4); ctx.lineTo(pxS-personH*0.12, footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pxS, headY+personH*0.4); ctx.lineTo(pxS+personH*0.12, footY); ctx.stroke();

    // height annotation
    if(py > 0.5){
      ctx.strokeStyle='rgba(26,82,118,0.3)'; ctx.lineWidth=0.8; ctx.setLineDash([2,3]);
      ctx.beginPath(); ctx.moveTo(pxS+16, groundY); ctx.lineTo(pxS+16, tY(py)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(26,82,118,0.5)'; ctx.font='8px Space Mono,monospace'; ctx.textAlign='left';
      const clearance=py;
      ctx.fillText(fmt(clearance,1)+'m', pxS+19, (groundY+tY(py))/2+3);
    }
  }

  // dimension annotation — width
  ctx.strokeStyle='rgba(26,82,118,0.4)'; ctx.lineWidth=1; ctx.setLineDash([3,4]);
  ctx.beginPath(); ctx.moveTo(PAD_L, groundY+18); ctx.lineTo(W-PAD_R, groundY+18); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='rgba(26,82,118,0.6)'; ctx.font='9px Space Mono,monospace'; ctx.textAlign='center';
  ctx.fillText(fmt(x1-x0,1)+' m', W/2, groundY+28);

  // max height annotation
  ctx.strokeStyle='rgba(26,82,118,0.3)'; ctx.lineWidth=0.8; ctx.setLineDash([2,3]);
  const vxS=tX(vx);
  ctx.beginPath(); ctx.moveTo(PAD_L-22, tY(vy)); ctx.lineTo(PAD_L-22, groundY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='rgba(26,82,118,0.6)'; ctx.font='9px Space Mono,monospace'; ctx.textAlign='center';
  ctx.save(); ctx.translate(PAD_L-32, (tY(vy)+groundY)/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillText(fmt(vy,1)+' m', 0, 0);
  ctx.restore();

  // material label
  ctx.fillStyle='rgba(26,82,118,0.5)'; ctx.font='9px Space Grotesk,sans-serif'; ctx.textAlign='right';
  ctx.fillText(S.mat.name, W-PAD_R, PAD_T+10);
}


/* ═══════════════════════════════════════════════════════
   DERIVADAS
═══════════════════════════════════════════════════════ */
function updateDeriv() {
  const {x0,x1}=getRange();
  const t=parseFloat($('sl-px').value)/100;
  const xp=x0+t*(x1-x0), yp=f(xp), slope=fp(xp);
  const ang=angDeg(xp);
  $('val-px').textContent=fmt(xp,2);

  let status,color,msg;
  if(ang>12){status='ok';color='#1A7F5A';msg='Pendiente elevada — excelente drenaje. Verificar cargas de viento laterales.';}
  else if(ang>CONSTRAINTS.slopeMin){status='ok';color='#1A7F5A';msg='Pendiente adecuada — el agua escurre eficientemente hacia los bordes.';}
  else if(ang>2){status='warn';color='#B8860B';msg='Pendiente moderada — drenaje aceptable pero puede haber acumulación en lluvia intensa.';}
  else{status='err';color='#B03A2E';msg='Pendiente insuficiente — riesgo de acumulación de agua y filtraciones. Modificar diseño.';}

  $('deriv-info').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
      <div class="metric"><div class="metric-val">${fmt(xp,2)}</div><div class="metric-lbl">Posición x</div></div>
      <div class="metric"><div class="metric-val">${fmt(slope,3)}</div><div class="metric-lbl">f'(x) = pendiente</div></div>
      <div class="metric ${status}"><div class="metric-val">${fmt(ang,1)}°</div><div class="metric-lbl">Ángulo</div></div>
    </div>
    <div style="background:${color}15;border:1px solid ${color}40;border-left:3px solid ${color};border-radius:0 6px 6px 0;padding:10px 12px;font-size:12px;color:${color};margin-bottom:4px;">
      <b>f'(${fmt(xp,1)}) = ${fmt(slope,3)}</b> — ${msg}
    </div>
    <div style="font-size:11px;color:var(--muted);font-family:var(--font-mono);">f'(x) = ${fmt(2*S.a,3)}x + ${fmt(S.b,3)}</div>`;

  // sectors
  const secsX=[x0+0.15*(x1-x0),0.5*(x0+x1),x0+0.85*(x1-x0)];
  const secsLbl=['Sector izq.','Centro','Sector der.'];
  $('sector-grid').innerHTML=secsX.map((x,i)=>{
    const a=angDeg(x);
    const ok=a>=CONSTRAINTS.slopeMin;
    return`<div class="sector-item">
      <div class="sector-ang" style="color:${ok?'#1A7F5A':'#B03A2E'}">${fmt(a,1)}°</div>
      <div class="sector-lbl">${secsLbl[i]}</div>
      <div class="sector-status" style="color:${ok?'#1A7F5A':'#B03A2E'}">${ok?'Drena ✓':'Acumula ✗'}</div>
    </div>`;
  }).join('');

  // draw
  const cv=$('cv-deriv'), ctx=cv.getContext('2d');
  const W=cv.width,H=cv.height,PAD=36;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#F7F9FC'; ctx.fillRect(0,0,W,H);

  const yMinD=Math.min(0,f(x0),f(x1))-0.3;
  const yMaxD=Math.max(f(getVx()),0)+0.6;
  const tX=x=>(x-x0)/(x1-x0)*(W-2*PAD)+PAD;
  const tY=y=>H-PAD-(y-yMinD)/(yMaxD-yMinD)*(H-2*PAD);

  ctx.strokeStyle='rgba(30,80,120,0.07)'; ctx.lineWidth=1;
  for(let gx=Math.ceil(x0);gx<=Math.floor(x1);gx++){ctx.beginPath();ctx.moveTo(tX(gx),PAD);ctx.lineTo(tX(gx),H-PAD);ctx.stroke();}

  ctx.strokeStyle='#2E86AB'; ctx.lineWidth=2;
  ctx.beginPath();
  for(let i=0;i<=200;i++){const x=x0+i*(x1-x0)/200;i===0?ctx.moveTo(tX(x),tY(f(x))):ctx.lineTo(tX(x),tY(f(x)));}
  ctx.stroke();

  // tangent
  const tLen=0.8;
  ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
  ctx.beginPath();
  ctx.moveTo(tX(xp-tLen),tY(yp+slope*(-tLen)));
  ctx.lineTo(tX(xp+tLen),tY(yp+slope*(tLen)));
  ctx.stroke(); ctx.setLineDash([]);

  // angle arc
  if(Math.abs(slope)>0.01){
    const arcR=28;
    const baseAng=slope>0?0:Math.PI;
    const slopeAng=Math.atan(slope);
    ctx.strokeStyle=color+'80'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(tX(xp),tY(yp),arcR,baseAng-0.01,baseAng-slopeAng,slope<0); ctx.stroke();
  }

  // point
  ctx.fillStyle=color; ctx.beginPath(); ctx.arc(tX(xp),tY(yp),6,0,2*Math.PI); ctx.fill();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(tX(xp),tY(yp),3,0,2*Math.PI); ctx.fill();
}

/* ═══════════════════════════════════════════════════════
   INTEGRALES — ANIMACIÓN DINÁMICA DE RIEMANN
   ═══════════════════════════════════════════════════════ */
// Variable global controlada por el usuario
let riemannN = 4; 

// Función que se ejecuta cuando movés el slider manual
function onChangeRiemann(val) {
  riemannN = parseInt(val);
  drawInteg(); // Redibujamos al toque
}

/* ═══════════════════════════════════════════════════════
   INTEGRALES — SUMA DE RIEMANN BAJO CONTROL MANUAL
   ═══════════════════════════════════════════════════════ */
function drawInteg() {
  const {x0, x1} = getRange();
  const area = numInteg(x0, x1);
  const sup = area * 1.18;
  const costo = sup * S.mat.cost;
  const eco = (S.mat.eco * sup).toFixed(2);

  // Actualizar textos de los cuadraditos de métricas
  if($('int-area')) $('int-area').textContent = fmt(area, 1);
  if($('int-sup')) $('int-sup').textContent = fmt(sup, 1);
  if($('int-costo')) $('int-costo').textContent = 'USD ' + Math.round(costo).toLocaleString();
  if($('int-eco')) $('int-eco').textContent = eco + ' ton';

  // Actualizar el numerito del badge del slider
  if($('riemann-qty')) $('riemann-qty').textContent = `n = ${riemannN}`;

  const cv = $('cv-integ');
  if(!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, PAD = 36;
  
  ctx.clearRect(0, 0, W, H); 
  ctx.fillStyle = '#F7F9FC'; 
  ctx.fillRect(0, 0, W, H);

  const vy = f(getVx());
  const yMin = -0.2, yMax = Math.max(vy, 0.5) + 0.4;
  const tX = x => (x - x0) / (x1 - x0) * (W - 2 * PAD) + PAD;
  const tY = y => H - PAD - (y - yMin) / (yMax - yMin) * (H - 2 * PAD);

  // 1. Grilla
  ctx.strokeStyle = 'rgba(30,80,120,0.07)'; ctx.lineWidth = 1;
  for(let gy = 0; gy <= Math.floor(yMax); gy++) {
    ctx.beginPath(); ctx.moveTo(PAD, tY(gy)); ctx.lineTo(W - PAD, tY(gy)); ctx.stroke();
  }

  // 2. Dibujo de rectángulos discretos
  let sumaAproximada = 0;
  const dx = (x1 - x0) / riemannN;

  for(let i = 0; i < riemannN; i++) {
    const xi = x0 + i * dx;
    const xf = x0 + (i + 1) * dx;
    const xMid = (xi + xf) / 2;
    const ym = Math.max(0, f(xMid));

    if(ym > 0) {
      sumaAproximada += dx * ym;

      const shade = 0.07 + 0.04 * (i % 2);
      ctx.fillStyle = `rgba(46,134,171, ${shade})`;
      ctx.strokeStyle = 'rgba(46,134,171,0.35)'; 
      ctx.lineWidth = riemannN > 40 ? 0.4 : 0.8;

      ctx.beginPath(); 
      ctx.rect(tX(xi), tY(ym), tX(xf) - tX(xi), tY(0) - tY(ym));
      ctx.fill(); 
      ctx.stroke();

      // Puntos muestra de altura (solo si son poquitos para no saturar)
      if (riemannN <= 25) {
        ctx.fillStyle = '#E74C3C';
        ctx.beginPath(); ctx.arc(tX(xMid), tY(ym), 2.5, 0, 2 * Math.PI); ctx.fill();
      }
    }
  }

  // 3. Eje horizontal
  ctx.strokeStyle = 'rgba(30,80,120,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, tY(0)); ctx.lineTo(W - PAD, tY(0)); ctx.stroke();

  // 4. Curva Teórica Continua
  ctx.strokeStyle = '#1A5276'; ctx.lineWidth = 3;
  ctx.beginPath();
  for(let i = 0; i <= 200; i++) {
    const x = x0 + i * (x1 - x0) / 200;
    i === 0 ? ctx.moveTo(tX(x), tY(f(x))) : ctx.lineTo(tX(x), tY(f(x)));
  }
  ctx.stroke();

  // 5. Cálculos en pantalla
  const errorPct = Math.abs((sumaAproximada - area) / area * 100).toFixed(1);
  
  ctx.fillStyle = '#1A5276'; ctx.font = 'bold 11px Space Mono, monospace'; ctx.textAlign = 'left';
  ctx.fillText(`Suma de las barras = ${fmt(sumaAproximada, 2)} m²`, PAD + 10, PAD + 16);
  ctx.fillText(`Área exacta (Integral) = ${fmt(area, 2)} m²`, PAD + 10, PAD + 32);

  // 6. ACTUALIZAR EL TEXTO DIDÁCTICO DINÁMICO
  updateIntegText(riemannN, errorPct);
}

// Función auxiliar para cambiar el texto explicativo según lo que ve el usuario
function updateIntegText(n, error) {
  const box = $('riemann-explanation');
  if(!box) return;

  if (n <= 8) {
    box.innerHTML = ` <b>Pocos rectángulos (n = ${n}):</b> Quedan "huecos" vacíos o esquinas que sobresalen de la curva. El ancho de cada barra es muy grande, por eso el error es del <b>${error}%</b>. Es una aproximación poco precisa.`;
    box.style.borderLeftColor = '#E74C3C';
  } else if (n > 8 && n <= 30) {
    box.innerHTML = ` <b>Aumentando la división (n = ${n}):</b> Al achicar el ancho de las barras ($dx$), estas se adaptan mucho mejor al techo parabólico. Los dientes de sierra disminuyen y el error bajó al <b>${error}%</b>.`;
    box.style.borderLeftColor = '#F39C12';
  } else {
    box.innerHTML = ` <b>Concepto de Integral (n = ${n}):</b> Casi perfecto. Cuando el número de rectángulos tiende a infinito, el ancho de cada uno se vuelve infinitesimal (tiende a 0). Las barras se fusionan con la curva, el error es del <b>${error}%</b> y la suma se transforma en una <b>Integral Definida</b>.`;
    box.style.borderLeftColor = '#2ECC71';
  }
}


/* ═══════════════════════════════════════════════════════
   LLUVIA
═══════════════════════════════════════════════════════ */
function initRain() {
  rainParticles=[];
  for(let i=0;i<70;i++){
    rainParticles.push({x:Math.random()*800,y:Math.random()*300,vy:2.5+Math.random()*3,onRoof:false,rx:0,ry:0,restCount:0});
  }
}

function drawRain() {
  if(activeTab!==3){cancelAnimationFrame(rainRAF);return;}
  const cv=$('cv-rain'), ctx=cv.getContext('2d');
  const W=800,H=300;
  ctx.clearRect(0,0,W,H);

  const {x0,x1}=getRange();
  const PAD=40,PB=40;
  const vy=f(getVx());
  const maxH=Math.max(vy,0.5);
  const DW=W-2*PAD;
  const tX=x=>PAD+(x-x0)/(x1-x0)*DW;
  const tY=y=>H-PB-(Math.max(0,y)/maxH)*(H-PB-20);
  const groundY=H-PB;

  // sky
  ctx.fillStyle='#D6EAF8'; ctx.fillRect(0,0,W,groundY);
  // ground
  ctx.fillStyle='#CBD5E0'; ctx.fillRect(0,groundY,W,PB);
  ctx.fillStyle='#A0ADB8'; ctx.fillRect(0,groundY,W,1.5);

  // roof
  ctx.fillStyle='rgba(46,134,171,0.1)';
  ctx.beginPath(); ctx.moveTo(tX(x0),groundY);
  for(let i=0;i<=100;i++){const x=x0+i*(x1-x0)/100;ctx.lineTo(tX(x),tY(f(x)));}
  ctx.lineTo(tX(x1),groundY); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#1A5276'; ctx.lineWidth=2.5;
  ctx.beginPath();
  for(let i=0;i<=100;i++){const x=x0+i*(x1-x0)/100;const y=f(x);if(y<0)continue;i===0?ctx.moveTo(tX(x),tY(y)):ctx.lineTo(tX(x),tY(y));}
  ctx.stroke();

  // particles
  for(const p of rainParticles){
    const pxLocal=x0+(p.x-PAD)/DW*(x1-x0);
    const roofY=tY(Math.max(0,f(pxLocal)));
    if(!p.onRoof){
      if(p.y>=roofY&&pxLocal>=x0&&pxLocal<=x1){
        p.onRoof=true; p.rx=pxLocal; p.ry=roofY;
        p.slope=fp(pxLocal); p.dir=p.slope>0?-1:1;
      } else {
        ctx.strokeStyle='rgba(70,130,200,0.5)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x,p.y+8); ctx.stroke();
        p.y+=p.vy;
        if(p.y>groundY+10){p.y=-10;p.x=PAD+Math.random()*DW;p.onRoof=false;}
      }
    } else {
      const speed=0.06+Math.abs(p.slope)*0.05;
      p.rx+=p.dir*speed;
      const ny=Math.max(0,f(p.rx));
      p.ry=tY(ny);
      const sx=tX(p.rx);
      const isRest=Math.abs(fp(p.rx))<0.05;
      if(isRest) p.restCount++; else p.restCount=0;
      const alpha=p.restCount>30?0.9:0.65;
      const blue=p.restCount>30?'rgba(30,90,200,'+alpha+')':'rgba(60,160,240,'+alpha+')';
      ctx.fillStyle=blue; ctx.beginPath(); ctx.arc(sx,p.ry,p.restCount>10?3.5:2.5,0,2*Math.PI); ctx.fill();
      if(p.rx<x0-0.3||p.rx>x1+0.3||p.ry>groundY){p.y=-10;p.x=PAD+Math.random()*DW;p.onRoof=false;p.restCount=0;}
    }
  }

  // update stats
  const {x0:rx0,x1:rx1}=getRange();
  const as=avgSlope(rx0,rx1);
  const efic=Math.min(100,Math.round(as*6+10));
  $('rain-pend').textContent=fmt(as,1)+'°';
  $('rain-efic').textContent=efic+'%';
  const rb=$('rain-badge');
  if(as>10){rb.className='arch-badge ok';rb.textContent='Drenaje eficiente';}
  else if(as>4){rb.className='arch-badge warn';rb.textContent='Drenaje moderado';}
  else{rb.className='arch-badge err';rb.textContent='Acumulación de agua';}

  rainRAF=requestAnimationFrame(drawRain);
}

/* ═══════════════════════════════════════════════════════
   SCORES
═══════════════════════════════════════════════════════ */
function calcScores(hmax, ancho, area, slope) {
  // Eficiencia estructural: proporción ideal 1:3 a 1:5
  const prop=ancho>0?hmax/ancho:0;
  const ideal=prop>=0.2&&prop<=0.45;
  const s1=ideal?Math.round(80+Math.random()*2):Math.max(10,Math.round(60-Math.abs(prop-0.3)*200));

  // Escala humana: altura entre 3 y 7m
  const s2=hmax>=3&&hmax<=7?Math.round(75+Math.min(20,(hmax-3)*8)):
            hmax<3?Math.round(hmax/3*50):Math.round(Math.max(20,70-(hmax-7)*10));

  // Sustentabilidad: eco index
  const s3=Math.round((1-S.mat.eco)*100);

  // Drenaje
  const s4=Math.min(100,Math.round(slope*8));

  // Diseño global: equilibrio
  const avgS=(s1+s2+s3+s4)/4;
  const constraintsMet=[hmax>=3,hmax<=9,ancho>=8,area>=20,slope>=4,S.mat.eco<=0.75].filter(Boolean).length;
  const s5=Math.round(avgS*0.6+constraintsMet/6*40);

  S.scores={s1:Math.min(100,s1),s2:Math.min(100,s2),s3:Math.min(100,s3),s4:Math.min(100,s4),s5:Math.min(100,s5)};
  S.total=S.scores.s1+S.scores.s2+S.scores.s3+S.scores.s4+S.scores.s5;

  $('total-chip').textContent=S.total;
  $('total-big').textContent=S.total;
  buildScoreRows();
}

function buildScoreRows() {
  $('score-rows').innerHTML=SCORE_CATS.map(({key,label})=>{
    const v=S.scores[key]||0;
    const color=v>=70?'#1A7F5A':v>=40?'#B8860B':'#B03A2E';
    return`<div class="score-row">
      <span class="score-lbl">${label}</span>
      <div class="score-track"><div class="score-fill" style="width:${v}%;background:${color}"></div></div>
      <span class="score-num">${v}</span>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   EVALUACIÓN ARQUITECTÓNICA
═══════════════════════════════════════════════════════ */
function renderEvalGrid() {
  const {x0,x1}=getRange();
  const vx=getVx(),vy=f(vx);
  const hmax=Math.max(0,vy);
  const ancho=x1-x0;
  const area=numInteg(x0,x1);
  const slope=avgSlope(x0,x1);

  const items=[
    {
      icon:'📐',
      title:'Escala humana',
      ok:hmax>=3&&hmax<=7,
      desc:hmax<3?`Altura (${fmt(hmax,1)}m) insuficiente para habitabilidad. Mínimo requerido: 3m.`:
           hmax>7?`Altura (${fmt(hmax,1)}m) excesiva para un pabellón. Puede generar sensación de vacío.`:
           `Altura (${fmt(hmax,1)}m) apropiada para uso humano confortable.`
    },
    {
      icon:'📏',
      title:'Proporción altura/ancho',
      ok:ancho>0&&(hmax/ancho)>=0.15&&(hmax/ancho)<=0.5,
      desc:`Relación h/a = ${ancho>0?fmt(hmax/ancho,2):'—'}. ${ancho>0&&hmax/ancho>=0.15&&hmax/ancho<=0.5?'Proporción equilibrada y estructuralmente estable.':'Proporción fuera del rango óptimo (0.15–0.50).'}`
    },
    {
      icon:'💧',
      title:'Drenaje pluvial',
      ok:slope>=CONSTRAINTS.slopeMin,
      desc:`Pendiente promedio: ${fmt(slope,1)}°. ${slope>=CONSTRAINTS.slopeMin?'Evacuación eficiente del agua de lluvia garantizada.':'Riesgo de acumulación de agua. Aumentar curvatura o inclinación.'}`
    },
    {
      icon:'🌿',
      title:'Sustentabilidad',
      ok:S.mat.eco<=CONSTRAINTS.ecoMax,
      desc:`Material: ${S.mat.name}. Índice de impacto: ${S.mat.eco}. ${S.mat.eco<=CONSTRAINTS.ecoMax?'Cumple con el índice de impacto ambiental máximo.':'Supera el límite de impacto ambiental del proyecto.'}`
    },
  ];

  $('eval-grid').innerHTML=items.map(it=>`
    <div class="eval-item">
      <div class="eval-icon" style="background:${it.ok?'var(--alert-ok-bg)':'var(--alert-err-bg)'}">${it.icon}</div>
      <div>
        <div class="eval-title" style="color:${it.ok?'var(--alert-ok)':'var(--alert-err)'}">${it.title} ${it.ok?'✓':'✗'}</div>
        <div class="eval-desc">${it.desc}</div>
      </div>
    </div>`).join('');
}


/* ═══════════════════════════════════════════════════════
   RANKING
═══════════════════════════════════════════════════════ */
/**
 * Valida el nombre de grupo, calcula el área real (integral) y la función
 * actual, e inserta el diseño en la tabla 'ranking' de Supabase.
 * Columnas usadas: grupo, integrantes, material, area, funcion, puntaje.
 *
 * Nota: usamos la variable real `supabaseClient` (definida arriba con
 * supabase.createClient), NO `window.supabaseClient` — esa referencia
 * estaba rota porque nunca se asignó nada a `window.supabaseClient`,
 * así que las llamadas anteriores fallaban silenciosamente.
 */
async function registrarDiseño() {
  // ── Validación: el nombre de grupo es obligatorio ──
  if (!S.grupo || !S.grupo.trim()) {
    alert('Ingresá el nombre del grupo antes de registrar el diseño.');
    return;
  }

  const btn = document.querySelector('.btn-register');
  const btnOriginalText = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  const {x0, x1} = getRange();
  const area = numInteg(x0, x1);
  const funcionStr = `y=${fmt(S.a,2)}x²${S.b>=0?'+':''}${fmt(S.b,2)}x${S.c>=0?'+':''}${fmt(S.c,1)}`;

  const payload = {
    grupo: S.grupo.trim(),
    integrantes: S.integrantes || '',
    material: S.mat.id,
    area: Number(fmt(area, 2)),
    funcion: funcionStr,
    puntaje: S.total,
  };

  try {
    // [OPCIONAL] Si querés evitar que el mismo grupo se duplique en la tabla:
    await supabaseClient
      .from('ranking')
      .delete()
      .eq('grupo', S.grupo.trim());

    // 1. Insertamos el diseño y ESPERAMOS que Supabase confirme con el await
    const { error } = await supabaseClient
      .from('ranking')
      .insert([payload]);

    if (error) throw error;

    console.log('✅ Diseño guardado con éxito. Redirigiendo...');

    // 2. Cambiamos a la pestaña de ranking
    setTab(5); 

    // 3. Forzamos manualmente la lectura inmediata para asegurarnos de traer los datos recién metidos
    await fetchRanking();

  } catch (err) {
    console.error('Error al registrar el diseño en Supabase:', err);
    alert('No se pudo guardar el diseño. Probá nuevamente en un momento.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btnOriginalText; }
  }
}

/**
 * Trae el ranking completo desde Supabase (ordenado de mayor a menor
 * puntaje), limpia #rank-body y renderiza las filas dinámicamente.
 * Maneja estado de carga y de error explícitamente.
 */
async function fetchRanking() {
  const tbody = $('rank-body');
  const countBadge = $('rank-count');
  if (!tbody) return;

  // ── Estado de carga ──
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">Cargando ranking…</td></tr>';

  try {
    const { data, error } = await supabaseClient
      .from('ranking')
      .select('*')
      .order('puntaje', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (countBadge) {
      countBadge.textContent = data.length + ' grupo' + (data.length !== 1 ? 's' : '');
    }

    // ── Estado vacío ──
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">Aún no hay diseños registrados.</td></tr>';
      return;
    }

    // ── Render de filas ──
    tbody.innerHTML = data.map((r, i) => {
      const cls = i === 0 ? 'p1' : i === 1 ? 'p2' : i === 2 ? 'p3' : '';
      const matLabel = (MATS.find(m => m.id === r.material) || {}).name || r.material || '—';
      return `<tr>
        <td><span class="pos ${cls}">${i + 1}°</span></td>
        <td style="font-weight:500">${r.grupo}</td>
        <td style="font-family:var(--font-mono);color:var(--petrol);font-weight:700">${r.puntaje}</td>
        <td>${matLabel}</td>
        <td style="font-family:var(--font-mono)">${r.area ?? '—'} m²</td>
        <td style="font-family:var(--font-mono);font-size:11px">${r.funcion || '—'}</td>
        <td><span class="arch-badge ok" style="font-size:10px;padding:3px 8px;">Registrado</span></td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Error al traer el ranking de Supabase:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--alert-err);padding:24px;">No se pudo cargar el ranking. Revisá tu conexión e intentá de nuevo.</td></tr>';
  }
}


/* ═══════════════════════════════════════════════════════
   MÓDULO 3D — "CAMINAR TU ECUACIÓN" (A-Frame)
   ───────────────────────────────────────────────────────
   Mapeo de variables:
     S.a, S.b, S.c  → coeficientes de la parábola (sliders sl-a/sl-b/sl-c)
     S.mat.minSlope → pendiente mínima (°) requerida por el material elegido
   La función f(x) y fp(x) ya están definidas arriba y se reutilizan
   tal cual para que la geometría 3D sea matemáticamente idéntica
   a los gráficos 2D.
═══════════════════════════════════════════════════════ */

const ROOF_DEPTH = 10;      // profundidad en Z del pabellón (metros), fijo según consigna
const CLEARANCE_MIN = 1.75; // gálibo mínimo de escala humana (metros)
let rain3DActive = false;   // controla si la lluvia 3D + overlay de estancamiento están encendidos

/**
 * Convierte la pendiente local |f'(x)| en un color rojo→verde.
 * Rojo brillante  = pendiente por debajo del mínimo del material (estancamiento)
 * Verde           = pendiente igual o por encima del mínimo (drena bien)
 * Se interpola para que la transición no sea binaria sino gradual.
 */
function slopeToColor(absSlope, minSlopeDeg) {
  const minRad = minSlopeDeg * Math.PI / 180;
  const minTan = Math.tan(minRad);
  // ratio 0 → muy por debajo del mínimo (rojo) | ratio 1 → cumple o supera (verde)
  const ratio = Math.min(1, absSlope / Math.max(minTan, 0.0001));
  const r = Math.round(231 - ratio*150);   // de #E74C3C hacia verde
  const g = Math.round(76 + ratio*130);
  const b = Math.round(60 + ratio*30);
  return `rgb(${r},${g},${b})`;
}

/**
 * Genera la malla de la cubierta en 3D extruyendo franjas de planos
 * a lo largo del eje Z (profundidad ROOF_DEPTH), siguiendo y = f(x).
 * Cada franja es un <a-entity geometry="primitive:plane"> coloreada
 * según el mapa de calor de la derivada local.
 */
/**
 * Genera la malla de la cubierta en 3D extruyendo franjas de planos
 * a lo largo del eje Z (profundidad ROOF_DEPTH), siguiendo y = f(x).
 */
function build3DRoof() {
  const roofContainer = document.getElementById('roof-container');
  const colContainer = document.getElementById('columns-container');
  const peopleContainer = document.getElementById('people-container');
  
  if (!roofContainer || !colContainer || !peopleContainer) return;
  
  roofContainer.innerHTML = '';
  colContainer.innerHTML = '';
  peopleContainer.innerHTML = '';

  const {x0, x1} = getRange();
  const N = 60; // Resolución de la malla (cantidad de franjas a lo largo de X)
  const dx = (x1 - x0) / N;

  // ── Franjas de la cubierta (Corrección de Rotación y Ejes) ──
  for (let i = 0; i < N; i++) {
    const xa = x0 + i*dx;
    const xb = x0 + (i+1)*dx;
    const xm = (xa+xb)/2;
    const ya = Math.max(0, f(xa));
    const yb = Math.max(0, f(xb));
    const ym = (ya+yb)/2;

    // Pendiente local en el centro de la franja → mapa de calor
    const slope = Math.abs(fp(xm));
    const color = slopeToColor(slope, S.mat.minSlope);

    const segLen = Math.sqrt(dx*dx + (yb-ya)*(yb-ya));
    const angleRad = Math.atan2(yb-ya, dx);
    const angleDeg = angleRad * (180 / Math.PI);

    // ── Franjas de la cubierta (Dentro del bucle for de tu función build3DRoof) ──
    const strip = document.createElement('a-entity');
    
    strip.setAttribute('geometry', `primitive:box; width:${segLen.toFixed(3)}; height:0.05; depth:${ROOF_DEPTH}`);
    
    // MODIFICACIÓN: Inyectamos dinámicamente las propiedades visuales del material seleccionado
    // Si es vidrio, se activa transparent:true y opacity:0.4 para ver el cielo.
    strip.setAttribute('material', `
      color: ${color}; 
      roughness: ${S.mat.roughness}; 
      metalness: ${S.mat.metalness}; 
      opacity: ${S.mat.opacity}; 
      transparent: ${S.mat.transparent};
      shader: standard; 
      side: double
    `);
    
    strip.setAttribute('rotation', `0 0 ${angleDeg.toFixed(2)}`);
    strip.setAttribute('position', `${xm.toFixed(3)} ${ym.toFixed(3)} 0`);
    
    roofContainer.appendChild(strip);

    // ── OVERLAY DE ESTANCAMIENTO (rojo semitransparente) ──
    // Se monta SOBRE la franja base, sin reemplazarla ni alterar su color.
    // Solo aparece donde la pendiente real (en grados) es menor al umbral
    // de drenaje del proyecto (CONSTRAINTS.slopeMin, por defecto 4°).
    const slopeDeg = Math.atan(slope) * 180 / Math.PI;
    if (slopeDeg < CONSTRAINTS.slopeMin) {
      // Intensidad de la alerta: cuanto más lejos del mínimo, más opaco el rojo (0.25 a 0.65)
      const deficit = (CONSTRAINTS.slopeMin - slopeDeg) / CONSTRAINTS.slopeMin; // 0..1
      const overlayOpacity = (0.25 + Math.min(1, deficit) * 0.4).toFixed(2);

      const overlay = document.createElement('a-entity');
      overlay.classList.add('stagnation-overlay'); // permite togglear visibilidad por JS
      overlay.setAttribute('geometry', `primitive:box; width:${segLen.toFixed(3)}; height:0.06; depth:${ROOF_DEPTH}`);
      overlay.setAttribute('material', `
        color: #E74C3C;
        opacity: ${overlayOpacity};
        transparent: true;
        shader: flat;
        side: double
      `);
      overlay.setAttribute('rotation', `0 0 ${angleDeg.toFixed(2)}`);
      // se eleva ligeramente (0.03m) por encima de la franja base para evitar z-fighting
      overlay.setAttribute('position', `${xm.toFixed(3)} ${(ym+0.03).toFixed(3)} 0`);
      // visible solo si la simulación de lluvia 3D está activa (se controla en toggleRainOverlay)
      overlay.setAttribute('visible', rain3DActive);
      roofContainer.appendChild(overlay);
    }
  }

  // ── Columnas estructurales (Ajuste de altura real) ──
  const colCount = 6;
  for (let i = 0; i <= colCount; i++) {
    const cx = x0 + i*(x1-x0)/colCount;
    const cy = Math.max(0, f(cx));
    
    if (cy < 0.3) continue; // Si es demasiado bajo no ponemos columna
    
    // Ponemos una columna al frente y otra atrás del pabellón en el eje Z
    for (const cz of [-ROOF_DEPTH/2 + 0.15, ROOF_DEPTH/2 - 0.15]) {
      const col = document.createElement('a-entity');
      col.setAttribute('geometry', `primitive:cylinder; radius:0.06; height:${cy.toFixed(3)}`);
      col.setAttribute('material', 'color:#1A5276; roughness:0.5; metalness:0.4');
      // En A-Frame el pivote del cilindro está en su centro, por eso la posición Y es cy/2
      col.setAttribute('position', `${cx.toFixed(3)} ${(cy/2).toFixed(3)} ${cz}`);
      colContainer.appendChild(col);
    }
  }

  // ── Figuras humanas de referencia (Escala 1.75m en Y=0) ──
  const peoplePos = [0.25, 0.5, 0.75];
  for (const t of peoplePos) {
    const px = x0 + t*(x1-x0);
    const py = Math.max(0, f(px));
    
    if (py < CLEARANCE_MIN) continue; // No metemos alumnos donde se choquen la cabeza
    
    const person = document.createElement('a-entity');
    // Las personas nacen apoyadas en el suelo (Y = 0)
    person.setAttribute('position', `${px.toFixed(3)} 0 0`);
    person.innerHTML = `
      <a-entity geometry="primitive:cylinder; radius:0.15; height:1.4" position="0 0.7 0" material="color:#5A6B7A; roughness:0.8"></a-entity>
      <a-entity geometry="primitive:sphere; radius:0.14" position="0 1.5 0" material="color:#E8C39E; roughness:0.7"></a-entity>
    `;
    peopleContainer.appendChild(person);
  }

  // ── Grilla métrica del suelo ──
  const grid = document.getElementById('floor-grid');
  if (grid) {
    grid.innerHTML = '';
    for (let gx = Math.ceil(x0); gx <= Math.floor(x1); gx++) {
      const line = document.createElement('a-entity');
      line.setAttribute('line', `start:${gx} 0.01 -${ROOF_DEPTH/2}; end:${gx} 0.01 ${ROOF_DEPTH/2}; color:#8FA6B8`);
      grid.appendChild(line);
    }
  }

  // HUD: Actualizar ecuación en pantalla
  const fnEl = document.getElementById('hud-fn');
  if (fnEl) fnEl.textContent = `y = ${fmt(S.a,2)}x² ${S.b>=0?'+':''}${fmt(S.b,2)}x ${S.c>=0?'+':''}${fmt(S.c,1)}`;
}

/* ═══════════════════════════════════════════════════════
   LLUVIA 3D — PARTÍCULAS NATIVAS A-FRAME
   ───────────────────────────────────────────────────────
   No usamos un shader custom: cada gota es una <a-entity>
   con geometry "cylinder" muy fino (efecto de "raya" de lluvia).
   Un componente A-Frame (rain-drop) mueve cada gota en su tick()
   y la reinicia arriba cuando toca el suelo o la cubierta.
   Esto mantiene todo el movimiento DENTRO de A-Frame, sin requestAnimationFrame manual.
═══════════════════════════════════════════════════════ */
const RAIN_DROP_COUNT = 90;

/**
 * Componente de una gota individual. Cae en línea recta sobre el eje Y.
 * Al llegar a la altura de la cubierta f(x) en su posición X, o al suelo (y=0)
 * si está fuera del footprint del pabellón, se reposiciona arriba y reinicia.
 */
AFRAME.registerComponent('rain-drop', {
  schema: { speed: {type:'number', default: 4} },
  init: function () {
    this.resetDrop(true);
  },
  resetDrop: function (randomHeight) {
    const {x0, x1} = getRange();
    // las gotas caen en una franja un poco más ancha que el pabellón, para que se vea lluvia "ambiente"
    const margin = 2;
    this.x = (x0 - margin) + Math.random() * ((x1 - x0) + margin*2);
    this.z = (Math.random() - 0.5) * ROOF_DEPTH;
    this.y = randomHeight ? (6 + Math.random()*6) : (10 + Math.random()*4);
    this.el.object3D.position.set(this.x, this.y, this.z);
  },
  tick: function (time, deltaMs) {
    const dt = deltaMs / 1000;
    this.y -= this.data.speed * dt;

    // altura de la cubierta en la posición X,Z de esta gota (el techo no depende de Z, es una extrusión recta)
    const {x0, x1} = getRange();
    const insideFootprint = this.x >= x0 && this.x <= x1;
    const roofY = insideFootprint ? Math.max(0, f(this.x)) : 0;

    if (this.y <= roofY) {
      // la gota "impactó": si fue sobre la cubierta, podríamos generar un pequeño splash visual simple
      this.resetDrop(false);
      return;
    }
    this.el.object3D.position.y = this.y;
  }
});

/**
 * Crea (o destruye) las gotas de lluvia dentro de la escena y
 * muestra/oculta el overlay rojo de estancamiento sobre la cubierta.
 * Se llama desde la pestaña "Simulación" y desde el botón dentro del modo 3D.
 */
function toggleRain3D(forceState) {
  rain3DActive = (forceState !== undefined) ? forceState : !rain3DActive;

  const rainContainer = document.getElementById('rain-3d-container');
  if (!rainContainer) return;

  if (rain3DActive) {
    // generar gotas si el contenedor está vacío
    if (rainContainer.children.length === 0) {
      for (let i=0; i<RAIN_DROP_COUNT; i++) {
        const drop = document.createElement('a-entity');
        drop.setAttribute('geometry', 'primitive:cylinder; radius:0.012; height:0.4');
        drop.setAttribute('material', 'color:#9FD3F0; opacity:0.55; transparent:true; shader:flat');
        drop.setAttribute('rain-drop', `speed:${4+Math.random()*2}`);
        rainContainer.appendChild(drop);
      }
    }
    rainContainer.setAttribute('visible', true);
  } else {
    rainContainer.setAttribute('visible', false);
  }

  // mostrar/ocultar overlays rojos de estancamiento sobre la cubierta
  document.querySelectorAll('.stagnation-overlay').forEach(el => el.setAttribute('visible', rain3DActive));

  const btn = document.getElementById('btn-toggle-rain-3d');
  if (btn) btn.textContent = rain3DActive ? '🌧️ Detener lluvia' : '🌧️ Simular lluvia en 3D';
}
/**
 * Componente A-Frame: corre en cada frame (tick) sobre el rig de la cámara.
 * Compara la posición X del usuario con la altura del techo f(x) en ese punto
 * (gálibo). Si el gálibo es menor a 1.75m, activa el flash rojo de advertencia.
 */
AFRAME.registerComponent('clearance-checker', {
  tick: function () {
    const pos = this.el.object3D.position;
    const camX = pos.x;
    const roofY = Math.max(0, f(camX));
    const clearance = roofY; // altura del techo medida desde el suelo (y=0)

    const hudX = document.getElementById('hud-x');
    const hudRoof = document.getElementById('hud-roof');
    const hudClear = document.getElementById('hud-clear');
    const warn = document.getElementById('clearance-warning');
    if (!hudX) return;

    hudX.textContent = camX.toFixed(2) + ' m';
    hudRoof.textContent = roofY.toFixed(2) + ' m';
    hudClear.textContent = clearance.toFixed(2) + ' m';

    const {x0, x1} = getRange();
    const insideFootprint = camX >= x0 && camX <= x1;

    if (insideFootprint && clearance < CLEARANCE_MIN) {
      warn.classList.add('active');
      hudClear.style.color = '#FF6B5B';
    } else {
      warn.classList.remove('active');
      hudClear.style.color = '#7EC8E3';
    }
  }
});

/**
 * Entra al modo 3D: oculta la interfaz 2D, muestra la escena A-Frame,
 * y construye la malla de la cubierta a partir de los valores ACTUALES
 * de S.a, S.b, S.c (sliders) y S.mat (material seleccionado).
 */
function enter3D() {
  document.getElementById('scene-3d-wrap').classList.add('active');
  // pequeña espera para que A-Frame termine de montar la escena antes de inyectar geometría
  setTimeout(() => {
    build3DRoof();
    // Si el usuario venía de la pestaña "Simulación" con la lluvia 2D activa,
    // la lluvia 3D arranca encendida automáticamente para mantener coherencia entre vistas.
    toggleRain3D(activeTab === 3);
  }, 60);
}

function exit3D() {
  document.getElementById('scene-3d-wrap').classList.remove('active');
  document.getElementById('clearance-warning').classList.remove('active');
  // apagamos la lluvia al salir para no seguir animando partículas fuera de pantalla
  toggleRain3D(false);
}/* ==========================================================================
   MÓDULO DE OPTIMIZACIÓN FINAL — BÚSQUEDA POR FUERZA BRUTA
   ========================================================================== */
function bruteForceOptimum() {
  const aVals = []; for (let a = -2.5; a <= -0.1; a += 0.1) aVals.push(Math.round(a * 100) / 100);
  const bVals = []; for (let b = -2; b <= 2; b += 0.5) bVals.push(Math.round(b * 100) / 100);
  const cVals = []; for (let c = 2; c <= 10; c += 0.5) cVals.push(Math.round(c * 100) / 100);

  let best = null;

  for (const a of aVals) {
    for (const b of bVals) {
      for (const c of cVals) {
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        const r1 = (-b - sq) / (2 * a), r2 = (-b + sq) / (2 * a);
        const x0 = Math.min(r1, r2), x1 = Math.max(r1, r2);
        const ancho = x1 - x0;
        if (ancho < CONSTRAINTS.wMin) continue;

        const vx = -b / (2 * a);
        const vy = a * vx * vx + b * vx + c;
        if (vy < CONSTRAINTS.hMin || vy > CONSTRAINTS.hMax) continue;

        // Restricción de gálibo: la altura en el tramo central transitable debe superar 1.75m
        const margin = ancho * 0.15;
        const xa = x0 + margin, xb = x1 - margin;
        let clearanceOK = true;
        for (let t = 0; t <= 10; t++) {
          const x = xa + t * (xb - xa) / 10;
          const y = a * x * x + b * x + c;
          if (y < CLEARANCE_MIN) { clearanceOK = false; break; }
        }
        if (!clearanceOK) continue;

        // Restricción de escurrimiento: pendiente en ambos extremos >= mínimo del material
        const slope0 = Math.abs(2 * a * x0 + b), slope1 = Math.abs(2 * a * x1 + b);
        const minSlopeRad = S.mat.minSlope * Math.PI / 180;
        const minTan = Math.tan(minSlopeRad);
        if (slope0 < minTan || slope1 < minTan) continue;

        // Área bajo la curva (integral numérica simple)
        let area = 0; const n = 80, ddx = (x1 - x0) / n;
        for (let i = 0; i < n; i++) { const x = x0 + (i + .5) * ddx; area += Math.max(0, a * x * x + b * x + c) * ddx; }
        if (area < CONSTRAINTS.areaMin) continue;

        if (!best || area > best.area) {
          best = { a, b, c, x0, x1, ancho, vy, area };
        }
      }
    }
  }
  return best;
}

function runOptimization() {
  const optimal = bruteForceOptimum();
  const { x0, x1 } = getRange();
  const userArea = numInteg(x0, x1);
  const userHmax = Math.max(0, f(getVx()));
  const userAncho = x1 - x0;

  if (!optimal) {
    document.getElementById('optim-results').innerHTML = `
      <div class="edu-box" style="border-left-color:var(--alert-err)">
        No se encontró un óptimo dentro del espacio de búsqueda con las restricciones actuales del material. Probá con un material de menor pendiente mínima.
      </div>`;
    return;
  }

  const gap = ((optimal.area - userArea) / optimal.area * 100);
  const gapAbs = Math.abs(gap).toFixed(1);
  let gapMsg, gapColor, gapBg;
  if (gap <= 2) { gapMsg = `¡Excelente! Tu diseño está a solo ${gapAbs}% del óptimo teórico.`; gapColor = '#1A7F5A'; gapBg = '#E8F8F2'; }
  else if (gap <= 15) { gapMsg = `Buen diseño — estás ${gapAbs}% por debajo del máximo teórico posible.`; gapColor = '#B8860B'; gapBg = '#FEF9E7'; }
  else { gapMsg = `Hay margen de mejora: tu área es ${gapAbs}% menor que el óptimo teórico.`; gapColor = '#B03A2E'; gapBg = '#FDEDEC'; }

  // Se corrigió el uso de $('formula-badge') por el método nativo
  const formulaBadgeText = document.getElementById('formula-badge') ? document.getElementById('formula-badge').textContent : 'y = ax² + bx + c';

  document.getElementById('optim-results').innerHTML = `
    <div class="optim-gap-banner" style="background:${gapBg};color:${gapColor}">${gapMsg}</div>
    <div class="optim-compare">
      <div class="optim-card theo">
        <div class="optim-card-head"><span class="optim-dot gold"></span><span class="optim-card-title">Óptimo teórico (computadora)</span></div>
        <div class="optim-stat"><span class="optim-stat-lbl">Función</span><span class="optim-stat-val">y=${fmt(optimal.a, 2)}x²${optimal.b >= 0 ? '+' : ''}${fmt(optimal.b, 2)}x${optimal.c >= 0 ? '+' : ''}${fmt(optimal.c, 1)}</span></div>
        <div class="optim-stat"><span class="optim-stat-lbl">Área (∫f dx)</span><span class="optim-stat-val">${fmt(optimal.area, 2)} m²</span></div>
        <div class="optim-stat"><span class="optim-stat-lbl">Altura máx.</span><span class="optim-stat-val">${fmt(optimal.vy, 2)} m</span></div>
        <div class="optim-stat"><span class="optim-stat-lbl">Ancho</span><span class="optim-stat-val">${fmt(optimal.ancho, 2)} m</span></div>
      </div>
      <div class="optim-card user">
        <div class="optim-card-head"><span class="optim-dot user"></span><span class="optim-card-title">Tu diseño actual</span></div>
        <div class="optim-stat"><span class="optim-stat-lbl">Función</span><span class="optim-stat-val">${formulaBadgeText}</span></div>
        <div class="optim-stat"><span class="optim-stat-lbl">Área (∫f dx)</span><span class="optim-stat-val">${fmt(userArea, 2)} m²</span></div>
        <div class="optim-stat"><span class="optim-stat-lbl">Altura máx.</span><span class="optim-stat-val">${fmt(userHmax, 2)} m</span></div>
        <div class="optim-stat"><span class="optim-stat-lbl">Ancho</span><span class="optim-stat-val">${fmt(userAncho, 2)} m</span></div>
      </div>
    </div>
    <div class="canvas-wrap" style="height:220px;">
      <canvas id="cv-optim" width="700" height="220"></canvas>
    </div>`;

  drawOptimChart(optimal, userArea, userHmax, userAncho);
}

function drawOptimChart(optimal, userArea, userHmax, userAncho) {
  const cv = document.getElementById('cv-optim');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, PAD = 44;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#F7F9FC'; ctx.fillRect(0, 0, W, H);

  const maxArea = Math.max(optimal.area, userArea) * 1.25;
  const maxH = Math.max(optimal.vy, userHmax) * 1.25;
  const tX = v => PAD + (v / maxArea) * (W - 2 * PAD);
  const tY = v => H - PAD - (v / maxH) * (H - 2 * PAD);

  // grid
  ctx.strokeStyle = 'rgba(30,80,120,0.08)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const gx = PAD + i * (W - 2 * PAD) / 5;
    ctx.beginPath(); ctx.moveTo(gx, PAD); ctx.lineTo(gx, H - PAD); ctx.stroke();
    const gy = PAD + i * (H - 2 * PAD) / 5;
    ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(W - PAD, gy); ctx.stroke();
  }
  // axes
  ctx.strokeStyle = 'rgba(30,80,120,0.3)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(PAD, PAD); ctx.lineTo(PAD, H - PAD); ctx.stroke();

  ctx.fillStyle = 'rgba(30,80,120,0.5)'; ctx.font = '10px Space Mono,monospace';
  ctx.textAlign = 'center'; ctx.fillText('Área bajo la curva (m²) →', W / 2, H - 10);
  ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('Altura máxima (m) →', 0, 0); ctx.restore();

  // connecting line (gap visual)
  ctx.strokeStyle = 'rgba(176,58,46,0.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(tX(optimal.area), tY(optimal.vy)); ctx.lineTo(tX(userArea), tY(userHmax)); ctx.stroke();
  ctx.setLineDash([]);

  // optimal point
  ctx.fillStyle = '#D4AF37';
  ctx.shadowColor = '#D4AF37'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(tX(optimal.area), tY(optimal.vy), 8, 0, 2 * Math.PI); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#92400E'; ctx.font = '11px Space Grotesk,sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Óptimo teórico', tX(optimal.area) + 12, tY(optimal.vy) - 8);

  // user point
  ctx.fillStyle = '#2E86AB';
  ctx.beginPath(); ctx.arc(tX(userArea), tY(userHmax), 8, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#1A5276'; ctx.font = '11px Space Grotesk,sans-serif';
  ctx.fillText('Tu diseño', tX(userArea) + 12, tY(userHmax) + 16);
}

// Funciones globales para controlar el catálogo técnico
function openCatalog() {
  const modal = document.getElementById('catalog-modal');
  if (modal) modal.style.display = 'flex';
}

function closeCatalog() {
  const modal = document.getElementById('catalog-modal');
  if (modal) modal.style.display = 'none';
}

// Cerrar el modal si el usuario hace click afuera de la caja blanca
window.addEventListener('click', (event) => {
  const modal = document.getElementById('catalog-modal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
});

function selectMaterialFromCatalog(idMaterial) {
  // 1. Buscamos el objeto del material dentro de tu array global MATS
  const materialEncontrado = MATS.find(m => m.id === idMaterial);
  
  if (materialEncontrado) {
    // 2. Actualizamos el estado global del proyecto
    S.mat = materialEncontrado;
    
    // 3. Forzamos la actualización visual de la interfaz (grilla de materiales externa, puntos, etc.)
    // Nota: Reemplazá 'update()' por el nombre exacto de la función que refresca tus gráficos 2D y cálculos
    if (typeof update === 'function') {
      update(); 
    }
    
    // 4. Cerramos el catálogo automáticamente para que el alumno vea el cambio reflejado
    closeCatalog();
    
    console.log(` Material cambiado desde el catálogo a: ${materialEncontrado.name}`);
  }
}

/* ==========================================================================
   INICIALIZACIÓN DE LA INTERFAZ
   (Asegurarse de definir estas funciones abajo o arriba de este módulo)
   ========================================================================== */
// buildMatGrid();
// buildScoreRows();

// Los listeners de drag sobre cv-math se montan una sola vez al cargar el script.
// No dependen de startApp() porque el canvas ya existe en el DOM desde el index.html
// (aunque su panel esté oculto hasta que el usuario complete la pantalla de inicio).
initMathCanvasDrag();


