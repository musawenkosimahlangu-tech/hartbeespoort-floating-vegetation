//**************************************************************************
//* HARTBEESPOORT DRIVERS: monthly rainfall + temperature (2019-01 to 2026-10)
//Output CSV columns (matches harties_forecast_v2.R):
//  date, rain_mm, rain_catch_mm, chirps_days, temp_c, temp_min_c, temp_max_c


var START = '2019-01-01';
var N_MONTHS = 94;                       // Jan 2019 ... Oct 2026

// Point on the dam (used for rainfall at the dam and for ERA5-Land temperature)
var DAM_PT = ee.Geometry.Point([27.90, -25.75]);

// ROUGH box for the upstream catchment (Crocodile / Magalies / Jukskei side).
// Replace with a proper catchment polygon when you have one (DWS or HydroSHEDS).
var CATCH = ee.Geometry.Rectangle([27.60, -26.20, 28.40, -25.60]);

var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY');
var era    = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR');

var ERA_BANDS = ['temperature_2m', 'temperature_2m_min', 'temperature_2m_max'];

var months = ee.List.sequence(0, N_MONTHS - 1).map(function (i) {
  var s = ee.Date(START).advance(i, 'month');
  var e = s.advance(1, 'month');

  // ---- CHIRPS: monthly rainfall total (mm) ----
  var cCol = chirps.filterDate(s, e);
  var nDays = cCol.size();
  var rainImg = ee.Image(ee.Algorithms.If(
    nDays.gt(0),
    cCol.select('precipitation').sum(),
    ee.Image.constant(0).rename('precipitation').selfMask()));
  var rainDam = rainImg.reduceRegion({
    reducer: ee.Reducer.first(), geometry: DAM_PT, scale: 5566}).get('precipitation');
  var rainCatch = rainImg.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: CATCH, scale: 5566,
    maxPixels: 1e9}).get('precipitation');

  // ---- ERA5-Land: monthly temperature (K -> deg C) ----
  var eCol = era.filterDate(s, e);
  var eraImg = ee.Image(ee.Algorithms.If(
    eCol.size().gt(0),
    eCol.mean().select(ERA_BANDS),
    ee.Image.constant([0, 0, 0]).rename(ERA_BANDS).selfMask()));
  var t = eraImg.reduceRegion({
    reducer: ee.Reducer.first(), geometry: DAM_PT, scale: 11132});

  function toC(k) {
    k = ee.Number(ee.Algorithms.If(k, k, null));
    return ee.Algorithms.If(k, k.subtract(273.15), null);
  }

  return ee.Feature(null, {
    date: ee.String(s.format('YYYY-MM')).cat('-01'),
    rain_mm: rainDam,
    rain_catch_mm: rainCatch,
    chirps_days: nDays,
    temp_c: toC(t.get('temperature_2m')),
    temp_min_c: toC(t.get('temperature_2m_min')),
    temp_max_c: toC(t.get('temperature_2m_max'))
  });
});

var drivers = ee.FeatureCollection(months);

// Quick look at the first rows (do not print all 94 interactively)
print('First 5 months', drivers.limit(5));

Export.table.toDrive({
  collection: drivers,
  description: 'drivers_monthly',
  folder: 'GEE_Harties',
  fileFormat: 'CSV',
  selectors: ['date', 'rain_mm', 'rain_catch_mm', 'chirps_days',
              'temp_c', 'temp_min_c', 'temp_max_c']
});

// NOTES
// * The newest months may be blank or incomplete: CHIRPS and ERA5-Land are
//   published with a delay. Check chirps_days (should equal the days in the
//   month) and look for empty temperature cells in the last months.
// * Rainfall at the dam is a single 5 km CHIRPS pixel. rain_catch_mm is the
//   average over the box and is a better proxy for runoff and nutrient inflow.
// * Temperature is monthly mean / mean daily min / mean daily max from
//   ERA5-Land (about 9 km pixels). Winter minimum is your frost proxy.
