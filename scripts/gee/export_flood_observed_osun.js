/**
 * GeoEstate - observed flood evidence for Osun State  (Google Earth Engine Code Editor script)
 *
 * HOW TO RUN
 *   1. Open https://code.earthengine.google.com (needs an Earth Engine account; free for non-commercial use,
 *      commercial use needs a commercial EE licence).
 *   2. Paste this whole file into a new script and press Run.
 *   3. Open the "Tasks" tab (top right) -> click RUN next to "geoestate_flood_observed_osun" -> RUN again in the dialog.
 *   4. When it finishes, download  GeoEstate/flood_observed_osun.tif  from Google Drive, then locally run:
 *        python3 scripts/prepare-flood-observed.py path/to/flood_observed_osun.tif
 *
 * OUTPUT: one 4-band uint8 GeoTIFF on EXACTLY the same 30 m grid as your ALOS slope/elevation files
 * (EPSG:4326, 3729 x 4139 cells), so layers line up with the DEM-derived ones. Band order matters:
 *   1 jrc_occurrence  % of valid observations (1984-2021) in which JRC Global Surface Water saw open water, 0-100
 *   2 gfd_events      number of MODIS-mapped flood events (Global Flood Database, 2000-2018) that flooded the pixel (250 m)
 *   3 s1_wet_pct      % of Sentinel-1 scenes in the wet season (Jun-Oct) classified as water, 2017-2025, 0-100
 *   4 s1_dry_pct      same for the dry season (Dec-Feb). Water in wet AND dry season = permanent water;
 *                     water in wet but NOT dry = likely seasonal flooding (the app uses wet minus dry).
 * No-data is exported as 0 (no water observed).
 *
 * NOTE: dataset ids/versions below were correct when written; if Earth Engine reports an id as deprecated
 * or missing, check the dataset page in the EE catalog for its current id.
 */

// ---- Same grid as alos_slope_deg_osun.tif --------------------------------------------------------
var CELL = 0.00026949458523585647, WEST = 4.052659572776809, NORTH = 8.095886835070365;
var NCOLS = 3729, NROWS = 4139;
var TRANSFORM = [CELL, 0, WEST, 0, -CELL, NORTH];
var region = ee.Geometry.Rectangle([WEST, NORTH - NROWS * CELL, WEST + NCOLS * CELL, NORTH], 'EPSG:4326', false);

// ---- 1. JRC Global Surface Water: occurrence ------------------------------------------------------
var jrc = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0).rename('jrc_occurrence');

// ---- 2. Global Flood Database (Dartmouth Flood Observatory, MODIS): number of past floods ---------
var gfd = ee.ImageCollection('GLOBAL_FLOOD_DB/MODIS_EVENTS/V1').select('flooded').sum()
  .unmask(0).rename('gfd_events');

// ---- 3/4. Sentinel-1 radar water frequency, wet vs dry season -------------------------------------
var START = '2017-01-01', END = '2025-12-31';
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(region).filterDate(START, END)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .select('VV');

// Radar shadow on steep ground looks like water: mask slopes > 5 degrees (AW3D30 DSM).
var flatEnough = ee.Terrain.slope(ee.Image('JAXA/ALOS/AW3D30/V3_2').select('DSM')).lt(5);

function waterFreq(col, name) {
  // GRD values are already in dB. Light speckle smoothing, then threshold at -16 dB (typical open-water cut-off).
  var water = col.map(function (img) {
    return img.focal_median(30, 'circle', 'meters').lt(-16).copyProperties(img, ['system:time_start']);
  });
  return water.mean().multiply(100).updateMask(flatEnough)
    .reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 64})     // 10 m -> 30 m
    .reproject({crs: 'EPSG:4326', crsTransform: TRANSFORM})
    .unmask(0).rename(name);
}
var wet = waterFreq(s1.filter(ee.Filter.calendarRange(6, 10, 'month')), 's1_wet_pct');
var dry = waterFreq(s1.filter(ee.Filter.calendarRange(12, 2, 'month')), 's1_dry_pct');

// ---- Stack + preview + export ---------------------------------------------------------------------
var stack = ee.Image.cat([jrc, gfd, wet, dry]).round().clamp(0, 255).toUint8();

Map.centerObject(region, 8);
Map.addLayer(jrc, {min: 0, max: 100, palette: ['ffffff', '0000ff']}, 'JRC occurrence', false);
Map.addLayer(gfd, {min: 0, max: 5, palette: ['ffffff', 'ff0000']}, 'GFD flood events', false);
Map.addLayer(wet.subtract(dry).max(0), {min: 0, max: 60, palette: ['ffffff', '00bfff', '00007f']}, 'S1 wet minus dry (seasonal flooding)');

Export.image.toDrive({
  image: stack,
  description: 'geoestate_flood_observed_osun',
  folder: 'GeoEstate',
  fileNamePrefix: 'flood_observed_osun',
  region: region,
  crs: 'EPSG:4326',
  crsTransform: TRANSFORM,
  maxPixels: 1e10,
  fileFormat: 'GeoTIFF'
});
