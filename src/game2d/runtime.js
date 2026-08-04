import { projectJiangwanArtFrame } from './jiangwan-art-frame.js?v=f34a1d70e1a7aaed';
import { JIANGWAN_ART_PACK_V1 } from '../world2d/jiangwan-art-pack.js?v=f34a1d70e1a7aaed';

const CONTROL_KEYS = Object.freeze({
  ArrowUp: [0, -1024],
  KeyW: [0, -1024],
  ArrowDown: [0, 1024],
  KeyS: [0, 1024],
  ArrowLeft: [-1024, 0],
  KeyA: [-1024, 0],
  ArrowRight: [1024, 0],
  KeyD: [1024, 0],
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function worldToJiangwanScreenQ(positionQ) {
  const x = finite(positionQ?.x);
  const y = finite(positionQ?.y);
  const elevationQ = finite(positionQ?.elevationQ);
  return {
    x: x - y,
    y: Math.round((x + y) / 2 - elevationQ),
  };
}

export function jiangwanScreenToWorldQ(screenQ) {
  const screenX = finite(screenQ?.x);
  const screenY = finite(screenQ?.y);
  return {
    x: Math.round(screenY + screenX / 2),
    y: Math.round(screenY - screenX / 2),
  };
}

function jiangwanArtSceneTransform(canvas, scene) {
  const bounds = scene?.bounds ?? { x: 0, y: 0, width: 1, height: 1 };
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ].map(worldToJiangwanScreenQ);
  const minimumX = Math.min(...corners.map((point) => point.x));
  const maximumX = Math.max(...corners.map((point) => point.x));
  const minimumY = Math.min(...corners.map((point) => point.y));
  const maximumY = Math.max(...corners.map((point) => point.y));
  const padding = Math.max(18, Math.min(canvas.width, canvas.height) * 0.035);
  const widthQ = Math.max(1, maximumX - minimumX);
  const heightQ = Math.max(1, maximumY - minimumY);
  const scale = Math.min(
    (canvas.width - padding * 2) / widthQ,
    (canvas.height - padding * 2) / heightQ,
  );
  const width = widthQ * scale;
  const height = heightQ * scale;
  const offsetX = (canvas.width - width) / 2 - minimumX * scale;
  const offsetY = (canvas.height - height) / 2 - minimumY * scale;
  return {
    scale,
    offsetX,
    offsetY,
    minimumX,
    minimumY,
    maximumX,
    maximumY,
    x: (screenXQ) => offsetX + screenXQ * scale,
    y: (screenYQ) => offsetY + screenYQ * scale,
    screenQX: (screenX) => (screenX - offsetX) / scale,
    screenQY: (screenY) => (screenY - offsetY) / scale,
  };
}

function roundedRect(context, x, y, width, height, radius = 8) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function sceneTransform(canvas, scene) {
  const bounds = scene?.bounds ?? { x: 0, y: 0, width: 1, height: 1 };
  const padding = Math.max(18, Math.min(canvas.width, canvas.height) * 0.035);
  const scale = Math.min(
    (canvas.width - padding * 2) / bounds.width,
    (canvas.height - padding * 2) / bounds.height,
  );
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  const offsetX = (canvas.width - width) / 2 - bounds.x * scale;
  const offsetY = (canvas.height - height) / 2 - bounds.y * scale;
  return {
    scale,
    offsetX,
    offsetY,
    x: (worldX) => offsetX + worldX * scale,
    y: (worldY) => offsetY + worldY * scale,
    worldX: (screenX) => (screenX - offsetX) / scale,
    worldY: (screenY) => (screenY - offsetY) / scale,
  };
}

function drawLabel(context, text, x, y, { accent = false } = {}) {
  context.save();
  context.font = '600 12px "PingFang SC", system-ui, sans-serif';
  const width = context.measureText(text).width + 14;
  roundedRect(context, x - width / 2, y - 24, width, 20, 6);
  context.fillStyle = accent ? 'rgba(212, 181, 106, .94)' : 'rgba(17, 21, 18, .88)';
  context.fill();
  context.fillStyle = accent ? '#16140d' : '#f0e9da';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, x, y - 14);
  context.restore();
}

function drawHome(context, canvas, projection, time) {
  const scene = projection.scene;
  const transform = sceneTransform(canvas, scene);
  const bounds = scene.bounds;
  const roomX = transform.x(bounds.x);
  const roomY = transform.y(bounds.y);
  const roomW = bounds.width * transform.scale;
  const roomH = bounds.height * transform.scale;

  context.clearRect(0, 0, canvas.width, canvas.height);
  const background = context.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, '#1b2525');
  background.addColorStop(1, '#111512');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  roundedRect(context, roomX, roomY, roomW, roomH, 16);
  context.clip();
  context.fillStyle = '#c5b89c';
  context.fillRect(roomX, roomY, roomW, roomH);
  context.strokeStyle = 'rgba(66, 58, 44, .12)';
  context.lineWidth = 1;
  const grid = Math.max(12, 512 * transform.scale);
  for (let x = roomX; x <= roomX + roomW; x += grid) {
    context.beginPath();
    context.moveTo(x, roomY);
    context.lineTo(x, roomY + roomH);
    context.stroke();
  }
  for (let y = roomY; y <= roomY + roomH; y += grid) {
    context.beginPath();
    context.moveTo(roomX, y);
    context.lineTo(roomX + roomW, y);
    context.stroke();
  }

  const rugX = transform.x(4_350);
  const rugY = transform.y(3_650);
  const rugW = 3_000 * transform.scale;
  const rugH = 2_100 * transform.scale;
  roundedRect(context, rugX, rugY, rugW, rugH, 12);
  context.fillStyle = '#8f6249';
  context.fill();
  context.strokeStyle = 'rgba(244, 224, 187, .45)';
  context.lineWidth = Math.max(1, 32 * transform.scale);
  context.stroke();

  const colors = {
    bed: ['#6f796d', '#e8dfcd'],
    computer: ['#554b40', '#253039'],
    sofa: ['#587064', '#9aa494'],
    table: ['#76593e', '#ad8359'],
    storage: ['#675843', '#8b7657'],
  };
  for (const collider of scene.colliders ?? []) {
    const x = transform.x(collider.x);
    const y = transform.y(collider.y);
    const width = collider.width * transform.scale;
    const height = collider.height * transform.scale;
    roundedRect(context, x, y, width, height, 8);
    context.fillStyle = colors[collider.kind]?.[0] ?? '#5b5c54';
    context.fill();
    context.strokeStyle = colors[collider.kind]?.[1] ?? '#aaa690';
    context.lineWidth = Math.max(1, 22 * transform.scale);
    context.stroke();
    if (collider.kind === 'computer') {
      const screenWidth = width * 0.38;
      const screenHeight = height * 0.45;
      roundedRect(
        context,
        x + width * 0.3,
        y + height * 0.12,
        screenWidth,
        screenHeight,
        4,
      );
      context.fillStyle = '#122e32';
      context.fill();
      context.fillStyle = 'rgba(132, 184, 199, .85)';
      context.fillRect(
        x + width * 0.35,
        y + height * 0.22,
        screenWidth * 0.7,
        Math.max(2, screenHeight * 0.08),
      );
    }
  }

  const windowX = transform.x(5_120);
  const windowY = transform.y(180);
  const windowW = 2_048 * transform.scale;
  const windowH = 420 * transform.scale;
  roundedRect(context, windowX, windowY, windowW, windowH, 5);
  context.fillStyle = '#60838c';
  context.fill();
  context.strokeStyle = '#d2c5a7';
  context.lineWidth = Math.max(2, 48 * transform.scale);
  context.stroke();
  const rainPhase = (finite(time) / 18) % 28;
  context.strokeStyle = 'rgba(217, 237, 242, .52)';
  context.lineWidth = 1;
  for (let index = 0; index < 12; index += 1) {
    const x = windowX + ((index * 37 + rainPhase) % Math.max(1, windowW));
    context.beginPath();
    context.moveTo(x, windowY + 4);
    context.lineTo(x - 4, windowY + windowH - 4);
    context.stroke();
  }

  const doorX = transform.x(1_450);
  const doorY = transform.y(6_950);
  const doorW = 1_200 * transform.scale;
  const doorH = 700 * transform.scale;
  context.fillStyle = '#3e725f';
  context.fillRect(doorX, doorY, doorW, doorH);
  context.fillStyle = '#d4b56a';
  context.beginPath();
  context.arc(doorX + doorW * 0.82, doorY + doorH * 0.46, 4, 0, Math.PI * 2);
  context.fill();

  const plantX = transform.x(10_450);
  const plantY = transform.y(6_050);
  context.fillStyle = '#6c543f';
  context.fillRect(plantX - 10, plantY, 20, 24);
  context.fillStyle = '#41694c';
  for (const angle of [-2.2, -1.7, -1.2, -0.7]) {
    context.beginPath();
    context.ellipse(
      plantX + Math.cos(angle) * 15,
      plantY + Math.sin(angle) * 20,
      8,
      18,
      angle,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  for (const entry of projection.interactables ?? []) {
    const anchor = entry.standPositionQ;
    const x = transform.x(anchor.x);
    const y = transform.y(anchor.y);
    const pulse = 5 + Math.sin(finite(time) / 420 + x) * 1.5;
    context.beginPath();
    context.arc(x, y, pulse, 0, Math.PI * 2);
    context.fillStyle = entry.available ? '#d4b56a' : '#918d82';
    context.fill();
    context.strokeStyle = 'rgba(17, 21, 18, .5)';
    context.lineWidth = 2;
    context.stroke();
    drawLabel(context, entry.verbZh, x, y, { accent: entry.distanceQ <= entry.maxDistanceQ });
  }

  const player = projection.playerPose.positionQ;
  const playerX = transform.x(player.x);
  const playerY = transform.y(player.y);
  context.shadowColor = 'rgba(17, 21, 18, .45)';
  context.shadowBlur = 10;
  context.beginPath();
  context.ellipse(playerX, playerY + 8, 11, 6, 0, 0, Math.PI * 2);
  context.fillStyle = 'rgba(17, 21, 18, .36)';
  context.fill();
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(playerX, playerY, 10, 0, Math.PI * 2);
  context.fillStyle = '#f0e9da';
  context.fill();
  context.strokeStyle = '#263c35';
  context.lineWidth = 4;
  context.stroke();
  const facingVector = {
    north: [0, -1],
    east: [1, 0],
    south: [0, 1],
    west: [-1, 0],
  }[projection.playerPose.facing] ?? [0, -1];
  context.beginPath();
  context.moveTo(playerX, playerY);
  context.lineTo(playerX + facingVector[0] * 15, playerY + facingVector[1] * 15);
  context.strokeStyle = '#d4b56a';
  context.lineWidth = 3;
  context.stroke();
  context.restore();

  context.strokeStyle = 'rgba(212, 181, 106, .72)';
  context.lineWidth = 2;
  roundedRect(context, roomX, roomY, roomW, roomH, 16);
  context.stroke();
}

function drawOutdoor(context, canvas, projection, time) {
  const scene = projection.scene;
  const transform = sceneTransform(canvas, scene);
  const bounds = scene.bounds;
  const mapX = transform.x(bounds.x);
  const mapY = transform.y(bounds.y);
  const mapWidth = bounds.width * transform.scale;
  const mapHeight = bounds.height * transform.scale;

  context.clearRect(0, 0, canvas.width, canvas.height);
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#70858a');
  sky.addColorStop(0.48, '#40585a');
  sky.addColorStop(1, '#1c2927');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  roundedRect(context, mapX, mapY, mapWidth, mapHeight, 16);
  context.clip();
  context.fillStyle = '#6f8066';
  context.fillRect(mapX, mapY, mapWidth, mapHeight);

  const riverY = transform.y(0);
  const riverHeight = 3_584 * transform.scale;
  const river = context.createLinearGradient(0, riverY, 0, riverY + riverHeight);
  river.addColorStop(0, '#385f68');
  river.addColorStop(1, '#254b54');
  context.fillStyle = river;
  context.fillRect(mapX, riverY, mapWidth, riverHeight);
  context.strokeStyle = 'rgba(213, 231, 224, .2)';
  context.lineWidth = Math.max(1, 70 * transform.scale);
  for (let index = 0; index < 8; index += 1) {
    const y = riverY + (index + 0.6) * riverHeight / 8;
    context.beginPath();
    context.moveTo(mapX + ((index * 733 + finite(time) / 22) % 1_600) * transform.scale, y);
    context.lineTo(mapX + mapWidth - 900 * transform.scale, y + 90 * transform.scale);
    context.stroke();
  }

  for (const region of scene.walkableRegions ?? []) {
    const x = transform.x(region.x);
    const y = transform.y(region.y);
    const width = region.width * transform.scale;
    const height = region.height * transform.scale;
    context.fillStyle =
      region.regionId === 'riverside_greenway'
        ? '#7f9273'
        : '#a8a49a';
    context.fillRect(x, y, width, height);
    context.strokeStyle = 'rgba(239, 235, 218, .2)';
    context.lineWidth = Math.max(1, 20 * transform.scale);
    context.strokeRect(x, y, width, height);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const road of scene.roads ?? []) {
    const points = road.centerlineQ ?? [];
    if (points.length < 2) continue;
    context.beginPath();
    points.forEach((point, index) => {
      const x = transform.x(point.x);
      const y = transform.y(point.y);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = '#3f4645';
    context.lineWidth = Math.max(3, road.widthQ * transform.scale);
    context.stroke();
    context.setLineDash([
      Math.max(4, 420 * transform.scale),
      Math.max(4, 320 * transform.scale),
    ]);
    context.strokeStyle = 'rgba(224, 211, 157, .68)';
    context.lineWidth = Math.max(1, 42 * transform.scale);
    context.stroke();
    context.setLineDash([]);
  }

  const buildingPalette = ['#765e4e', '#5d6b67', '#756f59', '#665969'];
  for (const [index, collider] of (scene.colliders ?? []).entries()) {
    const x = transform.x(collider.x);
    const y = transform.y(collider.y);
    const width = collider.width * transform.scale;
    const height = collider.height * transform.scale;
    roundedRect(context, x, y, width, height, 7);
    context.fillStyle = buildingPalette[index % buildingPalette.length];
    context.fill();
    context.strokeStyle = 'rgba(237, 224, 195, .55)';
    context.lineWidth = Math.max(1, 50 * transform.scale);
    context.stroke();
    context.fillStyle = 'rgba(239, 210, 143, .6)';
    const windowSize = Math.max(2, 320 * transform.scale);
    for (let wx = x + windowSize; wx < x + width - windowSize / 2; wx += windowSize * 1.7) {
      context.fillRect(wx, y + windowSize * 0.55, windowSize * 0.6, windowSize * 0.4);
    }
  }

  const rainPhase = (finite(time) / 17) % 26;
  context.strokeStyle = 'rgba(221, 238, 239, .32)';
  context.lineWidth = 1;
  for (let index = 0; index < 42; index += 1) {
    const x = mapX + ((index * 83 + rainPhase * 11) % Math.max(1, mapWidth));
    const y = mapY + ((index * 47 + rainPhase * 17) % Math.max(1, mapHeight));
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 3, y + 10);
    context.stroke();
  }

  for (const entry of projection.interactables ?? []) {
    const anchor = entry.standPositionQ;
    const x = transform.x(anchor.x);
    const y = transform.y(anchor.y);
    const nearby = entry.distanceQ <= entry.maxDistanceQ;
    context.beginPath();
    context.arc(
      x,
      y,
      5 + Math.sin(finite(time) / 420 + x) * 1.5,
      0,
      Math.PI * 2,
    );
    context.fillStyle = entry.available ? '#dfbf70' : '#918d82';
    context.fill();
    context.strokeStyle = 'rgba(17, 21, 18, .58)';
    context.lineWidth = 2;
    context.stroke();
    drawLabel(context, entry.labelZh, x, y, { accent: nearby });
  }

  const player = projection.playerPose.positionQ;
  const playerX = transform.x(player.x);
  const playerY = transform.y(player.y);
  context.beginPath();
  context.ellipse(playerX, playerY + 7, 10, 5, 0, 0, Math.PI * 2);
  context.fillStyle = 'rgba(15, 20, 18, .4)';
  context.fill();
  context.beginPath();
  context.arc(playerX, playerY, 9, 0, Math.PI * 2);
  context.fillStyle = '#f0e9da';
  context.fill();
  context.strokeStyle = '#263c35';
  context.lineWidth = 4;
  context.stroke();
  context.restore();

  context.strokeStyle = 'rgba(212, 181, 106, .72)';
  context.lineWidth = 2;
  roundedRect(context, mapX, mapY, mapWidth, mapHeight, 16);
  context.stroke();
}

const outdoorArtImageCache = new Map();

function outdoorArtImage(sourcePath) {
  if (outdoorArtImageCache.has(sourcePath)) {
    return outdoorArtImageCache.get(sourcePath);
  }
  const record = {
    image: null,
    status: 'loading',
  };
  if (typeof Image !== 'function') {
    record.status = 'unavailable';
    outdoorArtImageCache.set(sourcePath, record);
    return record;
  }
  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', () => {
    record.status = 'ready';
  });
  image.addEventListener('error', () => {
    record.status = 'error';
  });
  image.src = new URL(`../../${sourcePath}`, import.meta.url).href;
  record.image = image;
  outdoorArtImageCache.set(sourcePath, record);
  return record;
}

function artDrawableBounds(drawable, transform, time) {
  const scaleMilli = finite(drawable.scaleMilli, 1_000);
  const assetScale = Math.max(0.05, scaleMilli / 1_000);
  const widthQ = Math.max(
    256,
    finite(drawable.footprintQ?.widthQ, 1_024) * assetScale,
  );
  const depthQ = Math.max(
    128,
    finite(drawable.footprintQ?.depthQ, 512) * assetScale,
  );
  const heightQ = Math.max(
    64,
    finite(drawable.heightQ, 1_024) * assetScale,
  );
  const width = Math.max(2, (widthQ + depthQ) * transform.scale * 0.72);
  const height = Math.max(
    2,
    (heightQ + (widthQ + depthQ) * 0.22) * transform.scale,
  );
  const footX = transform.x(drawable.screenPositionQ.x);
  const footY = transform.y(drawable.screenPositionQ.y);
  const moving = [
    'walk_start',
    'walk_loop',
    'walk_stop',
  ].includes(drawable.motionClipId);
  const presentationBob = moving
    ? Math.sin(finite(time) / 92 + footX * 0.013) * Math.min(3, height * 0.025)
    : 0;
  const pivotWidthQ = Math.max(
    1,
    finite(drawable.footprintQ?.widthQ, 1_024),
  );
  const pivotRatio = clamp(
    finite(drawable.pivotQ?.x, pivotWidthQ / 2) / pivotWidthQ,
    0,
    1,
  );
  return {
    footX,
    footY,
    x: footX - width * pivotRatio,
    y: footY - height + presentationBob,
    width,
    height,
  };
}

function drawOutdoorArtFallback(context, drawable, bounds) {
  const palette = JIANGWAN_ART_PACK_V1.visualGrammar.palette;
  const colors = palette[drawable.category] ?? ['#765e4e', '#e7e0d2'];
  context.save();
  context.globalAlpha =
    drawable.category === 'weather'
      ? 0.18
      : drawable.category === 'lighting'
        ? 0.28
        : 0.92;
  roundedRect(
    context,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    Math.min(8, bounds.width * 0.12),
  );
  context.fillStyle = colors[0] ?? '#765e4e';
  context.fill();
  context.strokeStyle = colors[1] ?? '#e7e0d2';
  context.lineWidth = Math.max(1, Math.min(3, bounds.width * 0.025));
  context.stroke();
  context.restore();
}

function drawOutdoorArtFrame(
  context,
  canvas,
  projection,
  cityLifeProjection,
  previousWorld2dProjection,
  interpolationAlpha,
  time,
) {
  const matchingCityLifeProjection =
    cityLifeProjection?.worldId === projection.worldId &&
    cityLifeProjection?.authorityCommitSeq === projection.authorityCommitSeq
      ? cityLifeProjection
      : null;
  const matchingPreviousWorld2dProjection =
    previousWorld2dProjection?.worldId === projection.worldId &&
    previousWorld2dProjection?.scene?.id === projection.scene.id &&
    previousWorld2dProjection?.scene?.geometryRevision ===
      projection.scene.geometryRevision &&
    previousWorld2dProjection?.authorityCommitSeq <=
      projection.authorityCommitSeq
      ? previousWorld2dProjection
      : null;
  const reducedMotion = Boolean(
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
  );
  const artFrame = projectJiangwanArtFrame({
    world2dProjection: projection,
    cityLifeProjection: matchingCityLifeProjection,
    previousWorld2dProjection: matchingPreviousWorld2dProjection,
    interpolationAlpha: reducedMotion ? 1 : interpolationAlpha,
    reducedMotion,
  });
  const transform = jiangwanArtSceneTransform(canvas, projection.scene);
  const bounds = projection.scene.bounds;
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => {
    const screenQ = worldToJiangwanScreenQ(point);
    return {
      x: transform.x(screenQ.x),
      y: transform.y(screenQ.y),
    };
  });

  context.clearRect(0, 0, canvas.width, canvas.height);
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  const isNight = artFrame.environment.dayPhase === 'night';
  sky.addColorStop(0, isNight ? '#172427' : '#70858a');
  sky.addColorStop(1, isNight ? '#0d1415' : '#263b3a');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath();
  corners.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.clip();
  context.fillStyle = '#6f8066';
  context.fill();

  const occludedEntities = new Set(
    artFrame.occlusion.entries.map((entry) => entry.entityId),
  );
  let readyAssetCount = 0;
  for (const drawable of artFrame.drawables) {
    const drawableBounds = artDrawableBounds(drawable, transform, time);
    if (drawable.contactShadow?.required) {
      context.save();
      context.globalAlpha = 0.34;
      context.fillStyle = '#111512';
      context.beginPath();
      context.ellipse(
        drawableBounds.footX,
        drawableBounds.footY + 1,
        Math.max(2, drawableBounds.width * 0.28),
        Math.max(1, drawableBounds.width * 0.09),
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();
    }
    const record = outdoorArtImage(drawable.sourcePath);
    if (record.status !== 'ready' || !record.image) {
      drawOutdoorArtFallback(context, drawable, drawableBounds);
      continue;
    }
    readyAssetCount += 1;
    context.save();
    if (occludedEntities.has(drawable.entityId)) {
      context.globalAlpha = 0.48;
    } else if (drawable.category === 'weather') {
      context.globalAlpha = 0.24;
    } else if (drawable.category === 'lighting') {
      context.globalAlpha = isNight ? 0.62 : 0.24;
      context.globalCompositeOperation = 'screen';
    }
    context.drawImage(
      record.image,
      drawableBounds.x,
      drawableBounds.y,
      drawableBounds.width,
      drawableBounds.height,
    );
    context.restore();
  }

  for (const entry of projection.interactables ?? []) {
    const screenQ = worldToJiangwanScreenQ(entry.standPositionQ);
    const x = transform.x(screenQ.x);
    const y = transform.y(screenQ.y);
    const nearby = entry.distanceQ <= entry.maxDistanceQ;
    context.beginPath();
    context.arc(
      x,
      y,
      5 + Math.sin(finite(time) / 420 + x) * 1.5,
      0,
      Math.PI * 2,
    );
    context.fillStyle = entry.available ? '#dfbf70' : '#918d82';
    context.fill();
    context.strokeStyle = 'rgba(17, 21, 18, .58)';
    context.lineWidth = 2;
    context.stroke();
    drawLabel(context, entry.labelZh, x, y, { accent: nearby });
  }
  context.restore();

  context.strokeStyle = 'rgba(212, 181, 106, .72)';
  context.lineWidth = 2;
  context.beginPath();
  corners.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.stroke();

  canvas.dataset.artPackId = artFrame.packId;
  canvas.dataset.artFrameCommitSeq = String(artFrame.authorityCommitSeq);
  canvas.dataset.artIntegrationStatus = 'player_reachable_technical_slice';
  delete canvas.dataset.artFrameError;
  canvas.dataset.artReadyAssets = String(readyAssetCount);
  canvas.dataset.artDrawCommandCount = String(
    artFrame.performance.measurements.drawCommandsPerFrame,
  );
  canvas.dataset.artElapsedHistoryReads = String(
    artFrame.performance.elapsedHistoryReads,
  );
  return artFrame;
}

export function mountWorld2DRuntime(
  host,
  {
    projection: initialProjection,
    cityLifeProjection: initialCityLifeProjection = null,
    sendControl = async () => null,
  } = {},
) {
  if (!(host instanceof Element)) {
    throw new TypeError('A 2D world stage element is required.');
  }
  let activeHost = host;
  const canvas = host.querySelector('[data-testid="world2d-canvas"]');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('The 2D world canvas is missing.');
  }
  /** @type {CanvasRenderingContext2D | null} */
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');

  let projection = initialProjection;
  let cityLifeProjection = initialCityLifeProjection;
  let previousWorld2dProjection = null;
  let projectionReceivedAtMs = 0;
  let destroyed = false;
  let suspended = false;
  let frameHandle = null;
  let resizeObserver = null;
  const pressed = new Set();
  let lastVectorKey = '';

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = clamp(globalThis.devicePixelRatio || 1, 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function reflectAuthority() {
    const position = projection?.playerPose?.positionQ;
    if (!position) return;
    canvas.dataset.authorityX = String(position.x);
    canvas.dataset.authorityY = String(position.y);
    canvas.dataset.authorityCommitSeq = String(
      projection.authorityCommitSeq ?? '',
    );
    canvas.dataset.intentKind = projection.playerPose.intentKind;
  }

  function frame(time) {
    frameHandle = null;
    if (destroyed || suspended) return;
    resize();
    if (projection?.scene && projection?.playerPose) {
      if (projection.scene.id === 'jiangwan_outdoor') {
        const interpolationAlpha = clamp(
          (finite(time) - projectionReceivedAtMs) / 120,
          0,
          1,
        );
        try {
          drawOutdoorArtFrame(
            context,
            canvas,
            projection,
            cityLifeProjection,
            previousWorld2dProjection,
            interpolationAlpha,
            time,
          );
        } catch (error) {
          canvas.dataset.artPackId = JIANGWAN_ART_PACK_V1.packId;
          canvas.dataset.artFrameCommitSeq = String(
            projection.authorityCommitSeq ?? '',
          );
          canvas.dataset.artIntegrationStatus = 'blocked_frame_contract';
          canvas.dataset.artFrameError = String(
            error?.message ?? 'unknown_art_frame_error',
          );
          drawOutdoor(context, canvas, projection, time);
        }
      } else {
        drawHome(context, canvas, projection, time);
      }
    }
    scheduleFrame();
  }

  function scheduleFrame() {
    if (destroyed || suspended || frameHandle !== null) return;
    frameHandle = requestAnimationFrame(frame);
  }

  function clearPressedInput() {
    if (pressed.size === 0) return;
    pressed.clear();
    lastVectorKey = '';
    void sendControl({ kind: 'stop' });
  }

  function vectorFromPressed() {
    let x = 0;
    let y = 0;
    for (const code of pressed) {
      const vector = CONTROL_KEYS[code];
      if (!vector) continue;
      x += vector[0];
      y += vector[1];
    }
    return {
      x: clamp(x, -1024, 1024),
      y: clamp(y, -1024, 1024),
    };
  }

  function publishKeyboardIntent() {
    const vectorQ = vectorFromPressed();
    const vectorKey = `${vectorQ.x}:${vectorQ.y}`;
    if (vectorKey === lastVectorKey) return;
    lastVectorKey = vectorKey;
    if (vectorQ.x === 0 && vectorQ.y === 0) {
      void sendControl({ kind: 'stop' });
      return;
    }
    void sendControl({ kind: 'set_move_intent', vectorQ });
  }

  function keydown(event) {
    if (suspended) return;
    if (!CONTROL_KEYS[event.code]) return;
    if (
      event.target !== canvas &&
      !activeHost.contains(event.target)
    ) {
      return;
    }
    event.preventDefault();
    pressed.add(event.code);
    publishKeyboardIntent();
  }

  function keyup(event) {
    if (!CONTROL_KEYS[event.code]) return;
    if (suspended) {
      pressed.delete(event.code);
      return;
    }
    event.preventDefault();
    pressed.delete(event.code);
    publishKeyboardIntent();
  }

  function stopOnBlur() {
    clearPressedInput();
  }

  function pointerdown(event) {
    if (!projection?.scene || !projection?.interactables?.length) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const rect = canvas.getBoundingClientRect();
    const ratioX = canvas.width / Math.max(1, rect.width);
    const ratioY = canvas.height / Math.max(1, rect.height);
    const pointerX = (event.clientX - rect.left) * ratioX;
    const pointerY = (event.clientY - rect.top) * ratioY;
    const outdoor = projection.scene.id === JIANGWAN_ART_PACK_V1.sceneId;
    const transform = outdoor
      ? jiangwanArtSceneTransform(canvas, projection.scene)
      : sceneTransform(canvas, projection.scene);
    const worldPoint = outdoor
      ? jiangwanScreenToWorldQ({
          x: transform.screenQX(pointerX),
          y: transform.screenQY(pointerY),
        })
      : {
          x: transform.worldX(pointerX),
          y: transform.worldY(pointerY),
        };
    const nearest = [...projection.interactables].sort((left, right) => {
      const leftDistance = Math.hypot(
        left.standPositionQ.x - worldPoint.x,
        left.standPositionQ.y - worldPoint.y,
      );
      const rightDistance = Math.hypot(
        right.standPositionQ.x - worldPoint.x,
        right.standPositionQ.y - worldPoint.y,
      );
      return leftDistance - rightDistance || left.entityId.localeCompare(right.entityId);
    })[0];
    if (nearest) {
      void sendControl({ kind: 'move_to', targetAnchorId: nearest.standAnchorId });
    }
  }

  globalThis.addEventListener('keydown', keydown);
  globalThis.addEventListener('keyup', keyup);
  globalThis.addEventListener('blur', stopOnBlur);
  canvas.addEventListener('pointerdown', pointerdown);
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
  }
  reflectAuthority();
  scheduleFrame();

  return Object.freeze({
    update(nextProjection, nextCityLifeProjection = null) {
      if (destroyed || !nextProjection?.scene) return;
      previousWorld2dProjection = projection;
      projection = nextProjection;
      cityLifeProjection = nextCityLifeProjection;
      projectionReceivedAtMs = globalThis.performance?.now?.() ?? 0;
      reflectAuthority();
    },
    rehost(nextHost) {
      if (destroyed || !(nextHost instanceof Element)) return;
      const placeholder = nextHost.querySelector(
        '[data-testid="world2d-canvas"]',
      );
      if (!(placeholder instanceof HTMLCanvasElement)) {
        throw new TypeError('The next 2D world canvas host is missing.');
      }
      if (placeholder !== canvas) placeholder.replaceWith(canvas);
      activeHost = nextHost;
      resize();
      reflectAuthority();
    },
    suspend() {
      if (destroyed || suspended) return;
      suspended = true;
      clearPressedInput();
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
      resizeObserver?.unobserve(canvas);
    },
    resume() {
      if (destroyed) return;
      suspended = false;
      resizeObserver?.observe(canvas);
      resize();
      reflectAuthority();
      scheduleFrame();
    },
    destroy() {
      if (destroyed) return;
      clearPressedInput();
      destroyed = true;
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
      resizeObserver?.disconnect();
      globalThis.removeEventListener('keydown', keydown);
      globalThis.removeEventListener('keyup', keyup);
      globalThis.removeEventListener('blur', stopOnBlur);
      canvas.removeEventListener('pointerdown', pointerdown);
    },
  });
}
