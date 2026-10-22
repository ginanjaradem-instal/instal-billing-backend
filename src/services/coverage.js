const fs = require('node:fs/promises');
const path = require('node:path');

const coverageFile = path.join(__dirname, '..', '..', 'data', 'coverage', 'titik-pelanggan.kml');
const earthRadiusMeters = 6371008.8;
const searchRadiusMeters = 100;
let networkPromise;

function parseCoordinates(value) {
  return value.trim().split(/\s+/).map((coordinate) => {
    const [longitude, latitude] = coordinate.split(',').map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return null;
    }
    return { longitude, latitude };
  }).filter(Boolean);
}

function parseNetwork(kml) {
  const routes = [];
  const geometries = kml.matchAll(/<(Point|LineString)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi);
  for (const geometry of geometries) {
    const coordinateBlocks = geometry[2].matchAll(/<coordinates\b[^>]*>([\s\S]*?)<\/coordinates\s*>/gi);
    for (const block of coordinateBlocks) {
      const coordinates = parseCoordinates(block[1]);
      if (geometry[1].toLowerCase() === 'linestring' && coordinates.length > 1) {
        routes.push(coordinates);
      }
    }
  }
  if (routes.length === 0) throw new Error('Coverage KML does not contain cable routes');
  return { routes };
}

async function getNetwork() {
  if (!networkPromise) {
    networkPromise = fs.readFile(coverageFile, 'utf8')
      .then(parseNetwork)
      .catch((error) => {
        networkPromise = undefined;
        throw error;
      });
  }
  return networkPromise;
}

function distanceToSegmentMeters(longitude, latitude, start, end) {
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeScale = Math.cos(latitudeRadians);
  const pointX = 0;
  const pointY = 0;
  const startX = (start.longitude - longitude) * Math.PI / 180 * earthRadiusMeters * longitudeScale;
  const startY = (start.latitude - latitude) * Math.PI / 180 * earthRadiusMeters;
  const endX = (end.longitude - longitude) * Math.PI / 180 * earthRadiusMeters * longitudeScale;
  const endY = (end.latitude - latitude) * Math.PI / 180 * earthRadiusMeters;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const projection = segmentLengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / segmentLengthSquared));
  const closestX = startX + projection * segmentX;
  const closestY = startY + projection * segmentY;
  return Math.hypot(pointX - closestX, pointY - closestY);
}

function isNearRoute(longitude, latitude, routes) {
  for (const route of routes) {
    for (let index = 1; index < route.length; index += 1) {
      if (distanceToSegmentMeters(longitude, latitude, route[index - 1], route[index]) <= searchRadiusMeters) {
        return true;
      }
    }
  }
  return false;
}

async function checkCoverage(longitude, latitude) {
  const { routes } = await getNetwork();
  const nearNetwork = isNearRoute(longitude, latitude, routes);
  return nearNetwork
    ? {
      status: 'near_network',
      message: 'Ada jalur kabel InstaLink dalam radius 100 meter. Ketersediaan pemasangan tetap perlu dikonfirmasi tim.',
    }
    : {
      status: 'not_detected',
      message: 'Jalur kabel InstaLink belum terdeteksi dalam radius 100 meter. Silakan hubungi tim untuk pemeriksaan lebih lanjut.',
    };
}

module.exports = { checkCoverage, isNearRoute, parseNetwork };
