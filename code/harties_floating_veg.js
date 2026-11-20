/**************************************************************************
 * HARTBEESPOORT DAM: FLOATING VEGETATION MONITORING (Sentinel-2)  -- v2
 
 * CLASSES
 *  0 = open water
 *  1 = floating vegetation (hyacinth/salvinia mats, not separated)
 *  2 = cyanobacterial scum / turbid algal water
 *  3 = other (reeds, shoreline, bare ground, shadow)
 *
 * WORKFLOW
 *  Phase A: RUN_RF = false -> check dam outline, imagery, threshold,
 *           digitise training points.
 *  Phase B: RUN_RF = true  -> Random Forest + accuracy, then run Exports.
 **************************************************************************/

// ======================== 0. SETTINGS ====================================
var RUN_RF   = true;          // switch to true once `training` exists
var START    = '2019-01-01';
var END      = '2026-11-01';
var CS_THRESH = 0.6;           // Cloud Score+ cs_cdf threshold
var NDVI_T   = 0.25;           // baseline threshold; tune with the Inspector
var MIN_VALID = 0.6;           // min fraction of dam with valid pixels per month
var MIN_OBS  = 12;             // min valid months for the frequency map
var DISPLAY_YM = '2026-08';    // month shown on the map (YYYY-MM)
var EXPORT_FOLDER = 'GEE_Harties';

var SHOW_CHART = false;        // heavy: leave false, plot the CSV instead
var SHOW_FREQ  = false;        // heavy: leave false, use the Export

var MANUAL_DAM = null;         // optional: assign your own dam polygon
var AOI = ee.Geometry.Rectangle([27.78, -25.82, 28.02, -25.68]);

// ======================== 1. DAM OUTLINE =================================
var gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater');
var maxExt = gsw.select('max_extent').clip(AOI).selfMask();

var damVec = maxExt.reduceToVectors({
  geometry: AOI, scale: 30, geometryType: 'polygon',
  eightConnected: true, maxPixels: 1e9
}).map(function (f) { return f.set('area_m2', f.geometry().area(10)); });

var autoDam = ee.Feature(damVec.sort('area_m2', false).first())
                .geometry().buffer(20).simplify(15);
var dam = MANUAL_DAM ? MANUAL_DAM : autoDam;

Map.centerObject(AOI, 12);
Map.addLayer(ee.Image().byte().paint(ee.FeatureCollection([ee.Feature(dam)]), 1, 2),
             {palette: 'yellow'}, 'Dam outline');

var damHa = ee.Number(
  ee.Image.pixelArea().divide(10000).clip(dam)
    .reduceRegion({reducer: ee.Reducer.sum(), geometry: dam, scale: 10,
                   maxPixels: 1e9, tileScale: 8})
    .get('area'));

// ======================== 2. SENTINEL-2 SETUP ============================
var BANDS = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'];
var INDICES = ['NDVI', 'MNDWI', 'NDCI', 'FAI'];
var SAR = ['VV', 'VH', 'VH_VV'];
var USE_SAR = true;
var FEATURES = USE_SAR ? BANDS.concat(INDICES).concat(SAR) : BANDS.concat(INDICES);

// Filter on the simple AOI rectangle (cheaper than the dam polygon)
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(AOI).filterDate(START, END);
var csp = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(AOI)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'));

// Image availability per year (metadata only). Check before going earlier
// than 2019: L2A coverage over southern Africa may be thin before late 2018.
print('Images per year',
  ee.List.sequence(2019, 2026).map(function (y) {
    return ee.Dictionary({
      year: y,
      n: s2.filter(ee.Filter.calendarRange(y, y, 'year')).size()
    });
  }));

// List of months that have at least one image (metadata only, cheap)
var ymList = ee.List(s2.aggregate_array('system:time_start'))
  .map(function (t) { return ee.Date(t).format('YYYY-MM'); })
  .distinct().sort();
print('Months with imagery', ymList.size());

// Build ONE monthly composite (server-side ym string in, image out)
function monthComposite(ym) {
  ym = ee.String(ym);
  var start = ee.Date.parse('YYYY-MM', ym);
  var sub = s2.filterDate(start, start.advance(1, 'month'))
    .linkCollection(csp, ['cs_cdf'])
    .map(function (img) {
      var r = img.select(BANDS).divide(10000);
      return r.updateMask(img.select('cs_cdf').gte(CS_THRESH));
    });
  var comp = sub.median().clip(dam);
  var ndvi  = comp.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var mndwi = comp.normalizedDifference(['B3', 'B11']).rename('MNDWI');
  var ndci  = comp.normalizedDifference(['B5', 'B4']).rename('NDCI');
  // Floating Algae Index (NIR minus baseline between red 665 and SWIR 1610)
  var k = (842 - 665) / (1610 - 665);
  var fai = comp.select('B8')
    .subtract(comp.select('B4')
      .add(comp.select('B11').subtract(comp.select('B4')).multiply(k)))
    .rename('FAI');
    // Sentinel-1: monthly median in dB, light speckle smoothing
  var sarSub = s1.filterDate(start, start.advance(1, 'month')).select(['VV', 'VH']);
  var sar = sarSub.median().clip(dam).focalMedian(15, 'circle', 'meters');
  var vhvv = sar.select('VH').subtract(sar.select('VV')).rename('VH_VV');
  return comp.addBands([ndvi, mndwi, ndci, fai, sar, vhvv]).set({
    ym: ym,
    n_images: sub.size(),
    n_s1: sarSub.size(),
    'system:time_start': start.millis()
  });
}

// ======================== 3. MAP DISPLAY (one month only) ================
var showImg = monthComposite(DISPLAY_YM);
Map.addLayer(showImg, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.2},
             'True colour ' + DISPLAY_YM, false);
Map.addLayer(showImg, {bands: ['B8', 'B4', 'B3'], min: 0.02, max: 0.35},
             'False colour (veg = red) ' + DISPLAY_YM);
Map.addLayer(showImg.select('NDVI').gt(NDVI_T).selfMask(),
             {palette: 'lime'}, 'Baseline NDVI > ' + NDVI_T + ' ' + DISPLAY_YM, false);

// ---- Index layers for comparing mats vs scum ----
var idxPal = ['440154', '3b528b', '21908d', '5dc863', 'fde725'];  // low -> high

Map.addLayer(showImg.select('NDVI'),  {min: -0.2,  max: 0.8, palette: idxPal},
             'NDVI ' + DISPLAY_YM, false);
Map.addLayer(showImg.select('FAI'),   {min: -0.02, max: 0.10, palette: idxPal},
             'FAI ' + DISPLAY_YM, false);
Map.addLayer(showImg.select('NDCI'),  {min: -0.20, max: 0.30, palette: idxPal},
             'NDCI ' + DISPLAY_YM, false);
Map.addLayer(showImg.select('MNDWI'), {min: -0.6,  max: 0.8, palette: idxPal},
             'MNDWI ' + DISPLAY_YM, false);

Map.addLayer(showImg.select('VH'),    {min: -30, max: -10, palette: idxPal}, 'S1 VH (dB) ' + DISPLAY_YM, false);
Map.addLayer(showImg.select('VV'),    {min: -25, max: 0,   palette: idxPal}, 'S1 VV (dB) ' + DISPLAY_YM, false);
Map.addLayer(showImg.select('VH_VV'), {min: -15, max: -3,  palette: idxPal}, 'S1 VH-VV ' + DISPLAY_YM, false);
// ======================== 4. TRAINING + RANDOM FOREST ====================
// Merge the FeatureCollection layers you digitized on the map.
// Replace the names below with the exact layer names in your Imports panel:
// Points drawn on the map for 2019-02 (each layer needs class + ym = '2019-02')
// ---- Helper: tags 4 FeatureCollection layers with class + month ----
function labelledFC(ym, water, veg, scum, other) {
  function tag(fc, cls) {
    return fc.map(function (f) { return f.set({'class': cls, 'ym': ym}); });
  }
  return tag(water, 0).merge(tag(veg, 1)).merge(tag(scum, 2)).merge(tag(other, 3));
}

// ---- 2019-02 ----
var m2019_02 = labelledFC('2019-02', w_2019_02, v_2019_02, s_2019_02, o_2019_02);

// ---- 2019-08 ----
var m2019_08 = labelledFC('2019-08', w_2019_08, v_2019_08, s_2019_08, o_2019_08);

// ---- 2020-02 ----
var m2020_02 = labelledFC('2020-02', w_2020_01, v_2020_01, s_2020_01, o_2020_01);

// ---- 2020-10 ----
var m2020_10 = labelledFC('2020-10', w_2020_10, v_2020_10, s_2020_10, o_2020_10);

// ---- 2021-02 ----
var m2021_02 = labelledFC('2021-02', w_2021_02, v_2021_02, s_2021_02, o_2021_02);

// ---- 2021-10 ----
var m2021_10 = labelledFC('2021-10', w_2021_10, v_2021_10, s_2021_10, o_2021_10);

// ---- 2022-02 ----
var m2022_02 = labelledFC('2022-02', w_2022_02, v_2022_02, s_2022_02, o_2022_02);

// ---- 2022-08 ----
var m2022_08 = labelledFC('2022-08', w_2022_08, v_2022_08, s_2022_08, o_2022_08);

// ---- 2023-02 ----
var m2023_02 = labelledFC('2023-02', w_2023_02, v_2023_02, s_2023_02, o_2023_02);

// ---- 2023-10 ----
var m2023_10 = labelledFC('2023-10', w_2023_10, v_2023_10, s_2023_10, o_2023_10);

// ---- 2024-02 ----
var m2024_02 = labelledFC('2024-02', w_2024_02, v_2024_02, s_2024_02, o_2024_02);

// ---- 2024-08 ----
var m2024_08 = labelledFC('2024-08', w_2024_08, v_2024_08, s_2024_08, o_2024_08);

// ---- 2025-02 ----
var m2025_02 = labelledFC('2025-02', w_2025_02, v_2025_02, s_2025_02, o_2025_02);

// ---- 2025-09 ----
var m2025_09 = labelledFC('2025-09', w_2025_09, v_2025_09, s_2025_09, o_2025_09);

// ---- 2026-02 ----
var m2026_02 = labelledFC('2026-02', w_2026_02, v_2026_02, s_2026_02, o_2026_02);

// ---- 2026-08 ----
var m2026_08 = labelledFC('2026-08', w_2026_08, v_2026_08, s_2026_08, o_2026_08);

// ---- All training points together ----
var training = m2019_02.merge(m2019_08).merge(m2020_02).merge(m2020_10)
  .merge(m2021_02).merge(m2021_10).merge(m2022_02).merge(m2022_08)
  .merge(m2023_02).merge(m2023_10).merge(m2024_02).merge(m2024_08)
  .merge(m2025_02).merge(m2025_09).merge(m2026_02).merge(m2026_08);

print('Total digitised points:', training.size());
print('Points per class:', training.aggregate_histogram('class'));
print('Points per month:', training.aggregate_histogram('ym'));

var trainingExport = training.map(function (f) {
  var c = f.geometry().coordinates();
  return ee.Feature(null, {
    ym: f.get('ym'),
    'class': f.get('class'),
    lon: c.get(0),
    lat: c.get(1)
  });
});
print('Points to export (expect 320)', trainingExport.size());

Export.table.toDrive({
  collection: trainingExport,
  description: 'training_points',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['ym', 'class', 'lon', 'lat']
});

var classifier;

if (RUN_RF) {
  // One composite per DISTINCT training month, then sample its points
  var trainMonths = training.aggregate_array('ym').distinct();
  var sampled = ee.FeatureCollection(trainMonths.map(function (ym) {
    return monthComposite(ym).select(FEATURES).sampleRegions({
      collection: training.filter(ee.Filter.eq('ym', ym)),
      properties: ['class', 'ym'],
      scale: 10,
      tileScale: 8
    });
  })).flatten();

  print('Usable training points per class', sampled.aggregate_histogram('class'));

  sampled = sampled.randomColumn('rand', 42);
  var TEST_MONTHS = ['2019-08', '2021-02', '2023-10', '2025-02'];
  var testSet  = sampled.filter(ee.Filter.inList('ym', TEST_MONTHS));
  var trainSet = sampled.filter(ee.Filter.inList('ym', TEST_MONTHS).not());
  
  var rfAssess = ee.Classifier.smileRandomForest({numberOfTrees: 300, seed: 42})
    .train({features: trainSet, classProperty: 'class', inputProperties: FEATURES});

  var cm = testSet.classify(rfAssess).errorMatrix('class', 'classification');
  print('Confusion matrix (rows = reference, cols = predicted)', cm.array());
  print('Overall accuracy', cm.accuracy());
  print('Kappa', cm.kappa());
  print("Producer's accuracy (omission)", cm.producersAccuracy());
  print("User's accuracy (commission)", cm.consumersAccuracy());
  print('Variable importance', rfAssess.explain().get('importance'));

  // Final model on all labelled points
  classifier = ee.Classifier.smileRandomForest({numberOfTrees: 300, seed: 42})
    .train({features: sampled, classProperty: 'class', inputProperties: FEATURES});

  var palette = ['1f78b4', '33a02c', 'e31a1c', 'b2a38f'];
  Map.addLayer(showImg.select(FEATURES).classify(classifier),
               {min: 0, max: 3, palette: palette}, 'RF classification ' + DISPLAY_YM);
}

// ======================== 5. MONTHLY STATS (EXPORT) ======================
function monthStats(ym) {
  var img = monthComposite(ym);
  var area = ee.Image.pixelArea().divide(10000);   // hectares
  var layers = [
    area.updateMask(img.select('B8').mask()).rename('valid_ha'),
    area.updateMask(img.select('NDVI').gt(NDVI_T)).rename('floating_thr_ha')
  ];
  if (RUN_RF) {
    var cls = img.select(FEATURES).classify(classifier);
    layers.push(area.updateMask(cls.eq(0)).rename('open_water_ha'));
    layers.push(area.updateMask(cls.eq(1)).rename('floating_ha'));
    layers.push(area.updateMask(cls.eq(2)).rename('scum_ha'));
    layers.push(area.updateMask(cls.eq(3)).rename('other_ha'));
  }
  var sums = ee.Image.cat(layers).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: dam, scale: 10,
    maxPixels: 1e9, tileScale: 8
  });
  var validFrac = ee.Number(sums.get('valid_ha')).divide(damHa);
  var f = ee.Feature(null, sums).set({
    ym: ym,
    date: ee.Date.parse('YYYY-MM', ym).format('YYYY-MM-dd'),
    n_images: img.get('n_images'),
    n_s1: img.get('n_s1'),
    valid_frac: validFrac,
    usable: validFrac.gte(MIN_VALID),
    dam_ha: damHa
  });
  if (RUN_RF) {
    var wet = ee.Number(sums.get('open_water_ha'))
      .add(ee.Number(sums.get('floating_ha')))
      .add(ee.Number(sums.get('scum_ha')));
    f = f.set('floating_pct_of_wet',
              ee.Number(sums.get('floating_ha')).divide(wet).multiply(100));
  }
  return f;
}

var ts = ee.FeatureCollection(ymList.map(monthStats));

var selectors = ['ym', 'date', 'n_images', 'valid_frac', 'usable', 'dam_ha',
                 'valid_ha', 'floating_thr_ha'];
if (RUN_RF) {
  selectors = selectors.concat(['open_water_ha', 'floating_ha', 'scum_ha',
                                'other_ha', 'floating_pct_of_wet']);
}
Export.table.toDrive({
  collection: ts,
  description: 'harties_floating_monthly' + (RUN_RF ? '_RF' : '_threshold'),
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: selectors
});

if (SHOW_CHART) {
  var series = RUN_RF ? ['floating_ha', 'floating_thr_ha'] : ['floating_thr_ha'];
  print(ui.Chart.feature.byFeature(ts.filter(ee.Filter.eq('usable', 1)), 'ym', series)
    .setChartType('LineChart')
    .setOptions({title: 'Floating vegetation area per month (ha)',
                 hAxis: {slantedText: true}, vAxis: {title: 'Hectares'}}));
}

// ======================== 6. PERSISTENCE MAP (EXPORT) ====================
function floatingMask(ym) {
  var img = monthComposite(ym);
  var m = RUN_RF ? img.select(FEATURES).classify(classifier).eq(1)
                 : img.select('NDVI').gt(NDVI_T);
  return m.rename('float').set('ym', ym);
}

var floatCol = ee.ImageCollection.fromImages(ymList.map(floatingMask));
var nObs = floatCol.count().rename('n_obs');
var freq = floatCol.mean().rename('float_freq').updateMask(nObs.gte(MIN_OBS));

if (SHOW_FREQ) {
  Map.addLayer(freq, {min: 0, max: 1,
    palette: ['ffffcc', 'fd8d3c', 'bd0026', '4d004b']}, 'Floating frequency (0-1)');
}

Export.image.toDrive({
  image: freq.toFloat(),
  description: 'harties_float_frequency' + (RUN_RF ? '_RF' : '_threshold'),
  folder: EXPORT_FOLDER,
  region: AOI,
  scale: 10,
  crs: 'EPSG:32735',
  maxPixels: 1e9
});
Export.image.toDrive({
  image: nObs.toInt16(),
  description: 'harties_n_valid_months',
  folder: EXPORT_FOLDER,
  region: AOI,
  scale: 10,
  crs: 'EPSG:32735',
  maxPixels: 1e9
});

// ======================== NOTES ==========================================
// * Run the Exports from the Tasks tab (click RUN on each).
// * Months with valid_frac < MIN_VALID are flagged (usable = 0), not deleted.
// * Cover is relative to JRC max extent; at low water, exposed shore is
// * Random point splits are optimistic; for a stricter test, hold out whole
//   months or years (filter on `ym`).
