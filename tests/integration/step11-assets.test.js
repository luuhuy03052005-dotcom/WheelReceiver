import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '../..');

test('Step 11.1: Image Assets Integrity & PNG Verification', () => {
  const imagesDir = path.join(rootDir, 'images');
  const publicImagesDir = path.join(rootDir, 'apps/controller-web/public/images');

  const requiredImages = [
    'Wheel.png',
    'Si_nhan_trai.png',
    'Si_nhan_phai.png',
    'horn.png',
    'light_short.png',
    'light_far.png',
    'Start_Stop_engine.png',
    'hop_so_tuan_tu.png'
  ];

  for (const name of requiredImages) {
    const rootPath = path.join(imagesDir, name);
    const pubPath = path.join(publicImagesDir, name);

    assert.equal(fs.existsSync(rootPath), true, `Image ${name} must exist in images/`);
    assert.equal(fs.existsSync(pubPath), true, `Image ${name} must exist in apps/controller-web/public/images/`);

    const buf = fs.readFileSync(rootPath);
    // PNG signature 89 50 4E 47 0D 0A 1A 0A
    assert.equal(buf.slice(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a valid PNG`);
    // RGBA check (byte 25 = 6 for RGBA)
    assert.equal(buf[25], 6, `${name} must have RGBA color type with alpha transparency channel`);
  }
});

test('Step 11.2: Service Worker Cache Manifest contains all PNG assets (Rule 5)', () => {
  const swPath = path.join(rootDir, 'apps/controller-web/public/sw.js');
  const swContent = fs.readFileSync(swPath, 'utf8');

  assert.match(swContent, /wheel-controller-v48/, 'SW cache version must be v48');
  assert.match(swContent, /'images\/Wheel\.png'|'\.\/images\/Wheel\.png'/, 'SW must cache Wheel.png');
  assert.match(swContent, /Si_nhan_trai\.png/, 'SW must cache Si_nhan_trai.png');
  assert.match(swContent, /Si_nhan_phai\.png/, 'SW must cache Si_nhan_phai.png');
  assert.match(swContent, /horn\.png/, 'SW must cache horn.png');
  assert.match(swContent, /light_short\.png/, 'SW must cache light_short.png');
  assert.match(swContent, /light_far\.png/, 'SW must cache light_far.png');
  assert.match(swContent, /Start_Stop_engine\.png/, 'SW must cache Start_Stop_engine.png');
  assert.match(swContent, /hop_so_tuan_tu\.png/, 'SW must cache hop_so_tuan_tu.png');
});

test('Step 11.3: AssetManager Preload Idempotency and Zero Per-Frame Allocation (Rule 1)', async () => {
  const { assetManager, ASSET_MAP, ACTION_IMAGE_MAP } = await import('../../apps/controller-web/public/src/assets.js');

  // Verify asset mappings
  assert.equal(ASSET_MAP.wheel, 'images/Wheel.png');
  assert.equal(ACTION_IMAGE_MAP.indicatorLeft, 'images/Si_nhan_trai.png');
  assert.equal(ACTION_IMAGE_MAP.indicatorRight, 'images/Si_nhan_phai.png');
  assert.equal(ACTION_IMAGE_MAP.horn, 'images/horn.png');
  assert.equal(ACTION_IMAGE_MAP.lowBeam, 'images/light_short.png');
  assert.equal(ACTION_IMAGE_MAP.highBeam, 'images/light_far.png');
  assert.equal(ACTION_IMAGE_MAP.starter, 'images/Start_Stop_engine.png');

  // Preload promise must be idempotent
  const p1 = assetManager.preloadAll();
  const p2 = assetManager.preloadAll();
  assert.equal(p1, p2, 'Repeated preloadAll calls must return the same cached promise');
  await p1;
  assert.equal(assetManager.loaded, true, 'AssetManager must mark loaded=true');
});

test('Step 11.4: SteeringWheel Canvas Preload & Render Logic (Rule 1 & Rule 4)', async () => {
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;
  const origResizeObserver = globalThis.ResizeObserver;

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  globalThis.window = {
    app: { armed: true, layoutEditor: { editing: false } },
    addEventListener() {},
    removeEventListener() {}
  };

  let drawImageCalls = 0;
  let translatedX = 0, translatedY = 0;
  let rotatedAngle = 0;

  let lastDrawImageArgs = [];
  const mockCtx = {
    clearRect() {},
    save() {},
    restore() {},
    translate(x, y) { translatedX = x; translatedY = y; },
    rotate(rad) { rotatedAngle = rad; },
    drawImage(...args) {
      drawImageCalls++;
      lastDrawImageArgs = args;
    },
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    fillRect() {},
    fillText() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    ellipse() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    setTransform() {}
  };

  function createMockEl() {
    return {
      getContext: () => mockCtx,
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 50, top: 50, width: 200, height: 200 }),
      style: {}
    };
  }

  globalThis.document = {
    createElement: () => createMockEl(),
    getElementById: () => null
  };

  try {
    const { SteeringWheel } = await import('../../apps/controller-web/public/src/wheel.js');

    const mockCanvas = createMockEl();
    mockCanvas.parentElement = createMockEl();

    // Provide mock image object
    const mockImage = { name: 'mockWheelImage' };
    const wheel = new SteeringWheel(mockCanvas, {
      steeringRangeDeg: 900,
      wheelImage: mockImage
    });

    assert.equal(wheel.wheelImage, mockImage, 'Wheel must store provided preloaded image');
    assert.equal(wheel.imageLoaded, true, 'imageLoaded must be true');

    // Perform draw with angle = 90 deg
    wheel.currentAngle = 90;
    wheel.draw(true);

    assert.equal(drawImageCalls >= 2, true, 'Draw must draw background and rotating wheel');
    assert.equal(translatedX, wheel.size / 2, 'Must translate to center X');
    assert.equal(translatedY, wheel.size / 2, 'Must translate to center Y');
    assert.equal(Math.round(rotatedAngle * 180 / Math.PI), 90, 'Must rotate wheel at currentAngle');

    // Verify calibrated pivot matches center of small circle and letter W
    const [, dx, dy, dw, dh] = lastDrawImageArgs;
    const pivotRatioX = -dx / dw;
    const pivotRatioY = -dy / dh;
    assert.equal(Math.abs(pivotRatioX - (228.0 / 457)) < 0.005, true, 'Pivot X must be centered on small circle and letter W');
    assert.equal(Math.abs(pivotRatioY - (262.0 / 465)) < 0.005, true, 'Pivot Y must be centered on small circle and letter W');

    // Hitbox math test (Rule 2): angle must be purely geometric
    wheel.updateCenter();
    const angleTest = wheel.angle({ clientX: 150, clientY: 250 }); // dy = 100, dx = 0 -> 90 deg
    assert.equal(Math.round(angleTest), 90, 'Hitbox angle calculation must remain purely geometric');
  } finally {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
    globalThis.ResizeObserver = origResizeObserver;
  }
});

test('Step 11.5: CSS Hitbox Decoupling & Pointer Immunity (Rule 2 & Rule 3)', () => {
  const cssPath = path.join(rootDir, 'apps/controller-web/public/style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify .action-icon-img has pointer-events: none
  assert.match(css, /\.action-icon-img\s*\{[^}]*pointer-events:\s*none;/, 'action-icon-img must have pointer-events: none');
  assert.match(css, /\.palette-icon-img\s*\{[^}]*pointer-events:\s*none;/, 'palette-icon-img must have pointer-events: none');
  assert.match(css, /\.sequential-badge\s*\{[^}]*pointer-events:\s*none;/, 'sequential-badge must have pointer-events: none');
});
