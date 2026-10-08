/**
 * WheelReceiver Asset Manager (Prompt 11 / 5 Golden Rules)
 * 1. Preload once at initial setup; never instantiate new Image() inside render() or requestAnimationFrame.
 * 2. Visual assets are strictly decoupled from touch hitboxes and math models.
 * 3. Consistent sizes and alignments across state transitions.
 * 4. Canvas for high-frequency 60/120Hz rotating elements; DOM + CSS GPU transforms for buttons/shifters.
 * 5. Full Service Worker caching support.
 */

export const ASSET_MAP = {
  wheel: 'images/Wheel.png',
  indicatorLeft: 'images/Si_nhan_trai.png',
  indicatorRight: 'images/Si_nhan_phai.png',
  horn: 'images/horn.png',
  lowBeam: 'images/light_short.png',
  highBeam: 'images/light_far.png',
  starter: 'images/Start_Stop_engine.png',
  ignition: 'images/Start_Stop_engine.png',
  sequentialShifter: 'images/hop_so_tuan_tu.png'
};

export const ACTION_IMAGE_MAP = {
  indicatorLeft: 'images/Si_nhan_trai.png',
  indicatorRight: 'images/Si_nhan_phai.png',
  horn: 'images/horn.png',
  lowBeam: 'images/light_short.png',
  highBeam: 'images/light_far.png',
  starter: 'images/Start_Stop_engine.png',
  ignition: 'images/Start_Stop_engine.png'
};

export class AssetManager {
  constructor() {
    this.images = new Map();
    this.loaded = false;
    this.readyPromise = null;
  }

  preloadAll(assetMap = ASSET_MAP) {
    if (this.readyPromise) return this.readyPromise;
    if (typeof Image === 'undefined') {
      this.loaded = true;
      this.readyPromise = Promise.resolve();
      return this.readyPromise;
    }

    const entries = Object.entries(assetMap);
    const promises = entries.map(([key, src]) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.images.set(key, img);
          resolve(img);
        };
        img.onerror = () => {
          console.warn(`[AssetManager] Asset fallback for ${key} (${src})`);
          resolve(null);
        };
        img.src = src;
      });
    });

    this.readyPromise = Promise.all(promises).then(() => {
      this.loaded = true;
      return this.images;
    });

    return this.readyPromise;
  }

  getImage(key) {
    return this.images.get(key) || null;
  }

  hasImage(key) {
    return this.images.has(key);
  }
}

export const assetManager = new AssetManager();
