const CACHE_PREFIX = 'lzy-offline-shell';
const CACHE_VERSION = 'f34a1d70e1a7aaed';
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const CORE_URLS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/lzy-mark.svg',
  './assets/lzy-icon-180.png',
  './assets/lzy-icon-192.png',
  './assets/lzy-icon-512.png',
];
const BUILD_ASSET_MANIFEST = [
  "./assets/life/home-apartment-evening-v1.jpg",
  "./assets/life/places/city_health_center-v1.jpg",
  "./assets/life/places/city_learning_center-v1.jpg",
  "./assets/life/places/city_leisure_quarter-v1.jpg",
  "./assets/life/places/city_mobility_hub-v1.jpg",
  "./assets/life/places/city_retail_arcade-v1.jpg",
  "./assets/life/products/cinema_evening-v1.jpg",
  "./assets/life/products/city_apartment-v1.jpg",
  "./assets/life/products/city_bicycle-v1.jpg",
  "./assets/life/products/city_sedan-v1.jpg",
  "./assets/life/products/clinic_consultation-v1.jpg",
  "./assets/life/products/cloud_subscription-v1.jpg",
  "./assets/life/products/coffee-v1.jpg",
  "./assets/life/products/commuter_scooter-v1.jpg",
  "./assets/life/products/compact_studio-v1.jpg",
  "./assets/life/products/daily_clothes-v1.jpg",
  "./assets/life/products/daily_laptop-v1.jpg",
  "./assets/life/products/daily_phone-v1.jpg",
  "./assets/life/products/desk_workstation-v1.jpg",
  "./assets/life/products/evening_course-v1.jpg",
  "./assets/life/products/family_groceries-v1.jpg",
  "./assets/life/products/family_home-v1.jpg",
  "./assets/life/products/fiber_connection-v1.jpg",
  "./assets/life/products/fitness_membership-v1.jpg",
  "./assets/life/products/home_goods-v1.jpg",
  "./assets/life/products/institution_headquarters-v1.jpg",
  "./assets/life/products/meal_box-v1.jpg",
  "./assets/life/products/mobile_data_plan-v1.jpg",
  "./assets/life/products/mobility_subscription-v1.jpg",
  "./assets/life/products/operator_workshop-v1.jpg",
  "./assets/life/products/pocket_phone-v1.jpg",
  "./assets/life/products/reading_sofa-v1.jpg",
  "./assets/life/products/recovery_program-v1.jpg",
  "./assets/life/products/refrigerator-v1.jpg",
  "./assets/life/products/studio_phone-v1.jpg",
  "./assets/life/products/tailored_workwear-v1.jpg",
  "./assets/life/products/transit_card-v1.jpg",
  "./assets/life/products/used_laptop-v1.jpg",
  "./assets/life/products/vocational_lab-v1.jpg",
  "./assets/life/products/weather_coat-v1.jpg",
  "./assets/life/shop-clothing-v1.jpg",
  "./assets/life/shop-computer-v1.jpg",
  "./assets/life/shop-digital-devices-v1.jpg",
  "./assets/life/shop-everyday-goods-v1.jpg",
  "./assets/life/shop-food-v1.jpg",
  "./assets/life/shop-home-v1.jpg",
  "./assets/life/shop-housing-v1.jpg",
  "./assets/life/shop-phone-v1.jpg",
  "./assets/life/shop-service-v1.jpg",
  "./assets/life/shop-vehicle-city-sedan-v1.jpg",
  "./assets/life/shop-vehicle-light-mobility-v1.jpg",
  "./assets/lzy-icon-180.png",
  "./assets/lzy-icon-192.png",
  "./assets/lzy-icon-512.png",
  "./assets/lzy-mark.svg",
  "./assets/world2d/jiangwan/art-pack-manifest-v1.json",
  "./assets/world2d/jiangwan/building-kit-v1.svg",
  "./assets/world2d/jiangwan/character-resident-v1.svg",
  "./assets/world2d/jiangwan/interior-kit-v1.svg",
  "./assets/world2d/jiangwan/lighting-kit-v1.svg",
  "./assets/world2d/jiangwan/road-kit-v1.svg",
  "./assets/world2d/jiangwan/vegetation-rain-tree-v1.svg",
  "./assets/world2d/jiangwan/vehicle-city-bus-v1.svg",
  "./assets/world2d/jiangwan/weather-kit-v1.svg",
  "./index.html",
  "./manifest.webmanifest",
  "./src/content/company-universe-v2.js",
  "./src/derivatives/actors.js",
  "./src/derivatives/contracts.js",
  "./src/derivatives/eligibility.js",
  "./src/derivatives/engine.js",
  "./src/derivatives/index.js",
  "./src/derivatives/pricing.js",
  "./src/derivatives/risk.js",
  "./src/derivatives/stress.js",
  "./src/engine.js",
  "./src/experience/city-life-ecology.js",
  "./src/experience/city-life-view.js",
  "./src/experience/city-life.css",
  "./src/experience/derivatives-view.js",
  "./src/experience/derivatives.css",
  "./src/experience/emergent-worldline-v2.js",
  "./src/experience/entertainment-agency.js",
  "./src/experience/entertainment-world.js",
  "./src/experience/life-economy.js",
  "./src/experience/market-intelligence-view.js",
  "./src/experience/market-intelligence.css",
  "./src/experience/market-intelligence.js",
  "./src/experience/market-three-asset-contract.js",
  "./src/experience/open-world-city-authority.js",
  "./src/experience/open-world-city-life.js",
  "./src/experience/open-world-city-view.js",
  "./src/experience/player-wealth-view.js",
  "./src/experience/player-wealth.css",
  "./src/experience/player-wealth.js",
  "./src/experience/social-career-ecology.js",
  "./src/experience/social-career-rules.js",
  "./src/experience/social-career-view.js",
  "./src/experience/social-career.css",
  "./src/experience/world-experience.js",
  "./src/experience/worldline-view.js",
  "./src/game2d/jiangwan-art-frame.js",
  "./src/game2d/runtime.js",
  "./src/market/advanced-participant-ecology.js",
  "./src/market/agents.js",
  "./src/market/audit-cold-store.js",
  "./src/market/bars.js",
  "./src/market/behavior-kernel.js",
  "./src/market/chart-domain.js",
  "./src/market/client.js",
  "./src/market/ecology-contract.js",
  "./src/market/fundamental-linkage.js",
  "./src/market/fundamental-network-projection.js",
  "./src/market/institutional-ecology.js",
  "./src/market/liquidity.js",
  "./src/market/maker-ecology.js",
  "./src/market/order-book.js",
  "./src/market/player-reality-trace.js",
  "./src/market/professional-ecology-control.js",
  "./src/market/simulator.js",
  "./src/market/stage.css",
  "./src/market/stage.js",
  "./src/market/turnover-truth.js",
  "./src/market/valuation.js",
  "./src/market/worker.js",
  "./src/market/world-publication.js",
  "./src/platform/art-25d-performance-oracle.js",
  "./src/platform/executable-runtime.js",
  "./src/platform/installability.js",
  "./src/platform/long-horizon-oracle.js",
  "./src/platform/publication-atomicity-oracle.js",
  "./src/platform/runtime-boundary.js",
  "./src/role-strategies.js",
  "./src/storage-codec.js",
  "./src/storage-compression-worker.js",
  "./src/storage.js",
  "./src/ui.js",
  "./src/world2d/authority.js",
  "./src/world2d/city-pack.js",
  "./src/world2d/index.js",
  "./src/world2d/jiangwan-art-pack.js",
  "./src/world2d/open-world-art-quality.js",
  "./src/world2d/open-world-city-content.js",
  "./src/world2d/projection.js",
  "./src/world2d/scene.js",
  "./src/worldline.js",
  "./styles.css"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll([
          ...new Set([
            ...CORE_URLS,
            ...BUILD_ASSET_MANIFEST,
          ]),
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(`${CACHE_PREFIX}-`) &&
                name !== CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request)) ??
      (await cache.match('./index.html')) ??
      (await cache.match('./'));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached =
    (await cache.match(request)) ??
    (await cache.match(request, { ignoreSearch: true }));
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    request.mode === 'navigate'
      ? networkFirst(request)
      : cacheFirst(request),
  );
});
