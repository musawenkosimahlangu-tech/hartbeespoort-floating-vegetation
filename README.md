# hartbeespoort-floating-vegetation
Satellite-based monitoring of floating invasive vegetation on Hartbeespoort Dam using Sentinel-1 and Sentinel-2 from 2019 to 2026. Incorporates different geospatial tools such as Google Earth Engine, ArcGIS Pro and R software.
AUTHOR: Musawenkosi Mahlangu | BSc in Geospatial Sciences | University of the Witwatersrand | musawenkosimahlangup216hnh@gmail.com

# Aim and objectives
Aim: 
To map and quantify floating invasive vegetation across Hartbeespoort Dam from 2019 to 2026 using multi-temporal Sentinel-1 and Sentinel-2 imagery, identifying spatial and seasonal accumulation patterns

Objectives:
1.Map the spatial and temporal distribution of floating invasive vegetation on Hartbeespoort Dam between January 2019 and October 2026 at monthly intervals, using Sentinel-1 and Sentinel-2 imagery and a Random Forest classifier.
2.Quantify changes in floating vegetation cover between 2019 and 2026 at monthly intervals using time-series analysis.
3.Identify spatial persistence patterns and accumulation zones of floating invasive vegetation using persistence frequency mapping and zonal statistics.

# Key Results
•Largest Persistence zone: Occasionally floating | floating in 47,346565% of the valid months
•Overall Accuracy: 91.25% | Kappa: 88.33% on the analyzed months
•Floating vegetation: producer's accuracy of 100% | user's accuracy of 95.24%
•Seasonal pattern: Floating vegetation cover follows a clear seasonal cycle. It is lowest in winter (June to September), when monthly area is typically 100 to 350 ha (median about 175 ha, roughly 9% of the water surface). It rises from October or November to a summer peak between December and February, when the median is about 600 to 700 ha. Peak size varies a lot between years, from about 600 ha in February 2024 to over 1,100 ha in February 2022 and January 2026 (up to 59% of the water surface), and in 2019 cover stayed high through winter (about 540 to 770 ha).
•Forecast: On 22 held-out months (January 2025 to October 2026), the model forecast cover 1, 2 and 3 months ahead with errors (RMSE) of about 170, 225 and 245 ha. That is lower than a “same as now” baseline (about 205, 355 and 475 ha) and a “same month last year” baseline (about 300 ha) at every horizon. It consistently underestimated the largest peaks, by about 220 ha at 1 month and 340 to 390 ha at 2 to 3 months in months above 700 ha, so it is a better guide to the direction of the season than to peak size.


# Maps and Figures




# Data Sources


| Data | Source | Used for |
| :--- | :--- | :--- |
| Sentinel-2 L2A (`COPERNICUS/S2_SR_HARMONIZED`) | Google Earth Engine | Optical bands and indices |
| Cloud Score+ (`GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED`) | Google Earth Engine | Cloud masking |
| Sentinel-1 GRD (`COPERNICUS/S1_GRD`) | Google Earth Engine | Radar backscatter |
| JRC Global Surface Water (`JRC/GSW1_4/GlobalSurfaceWater`) | Google Earth Engine | Dam outline |
| CHIRPS (`UCSB-CHG/CHIRPS/DAILY`) | Google Earth Engine | Rainfall as driver |
| ERA5-Land (`ECMWF/ERA5_LAND/MONTHLY_AGGR`) | Google Earth Engine | Temperature as driver |
| Training points | Digitised by myself on Sentinel-2 imagery | Random Forest training and testing (`data/training_points.csv`) |


# Methodology
1.Dam outline (Google Earth Engine):
The largest water body within the study area was taken from the JRC Global Surface Water maximum extent layer and buffered by 20 m to include the fringe, giving a mask of about 2,000 ha. Using the maximum extent, not the water seen on each date, means floating mats on the surface are still inside the dam outline.
Monthly composites (Google Earth Engine): 
Sentinel-2 surface-reflectance images from January 2019 to October 2026 (94 months) were cloud-masked with Cloud Score+ (threshold 0.6), and a median composite was made for each month at 10 m resolution. Four indices were added: NDVI, MNDWI, NDCI and the Floating Algae Index (FAI). Sentinel-1 (IW mode) monthly median VV and VH backscatter, lightly smoothed, and their difference (VH minus VV) were added to help separate dense mats from open water.
Classes (Google Earth Engine): open water, floating vegetation, scum or turbid water, and other (reeds, shore, bare ground). Training and test points were labelled by interpreting Sentinel-2 imagery in false colour, using only locations where the class was clear. No field data were available.
Classifier (Google Earth Engine): a Random Forest with 300 trees was trained on [240] points and tested on [80] points from four whole months that were held out of training (a stricter test than a random split). The test gave overall accuracy, kappa, and producer’s and user’s accuracy for each class, and the Random Forest was then retrained on all 320 points (80 per class, from 16 months) for the final maps.
Baseline and monthly area (Google Earth Engine, R): an NDVI threshold of [0.25] was run alongside the Random Forest for comparison. Area per class was calculated for each month in hectares and as a percentage of the water surface. Months with less than 60% valid pixels were flagged as unusable. The series was exported to CSV and plotted in R.
Persistence (Google Earth Engine, ArcGIS Pro): the share of valid months in which each pixel was classed as floating vegetation was exported from Earth Engine as a 10 m raster in UTM zone 35S, with pixels having fewer than 12 valid months removed. In ArcGIS Pro, Raster Calculator grouped it into four levels: rarely (below 10% of months), occasionally (10 to 30%), frequently (30 to 60%) and persistently (above 60%) floating.
Zones (ArcGIS Pro): [5] zones (Zone A or dam wall area, Main basin, Magalies inflow, Bay A and Crocodile inflow) were drawn from the dam’s geography with the Split tool, before looking at the results. Zonal Statistics as Table gave mean persistence per zone, and Tabulate Area gave the area of each persistence class per zone.
Hotspots (ArcGIS Pro): Optimized Hot Spot Analysis was run on [the aggregated persistence grid] to show where high persistence is spatially clustered, and the result was mapped by confidence level.
Forecast (R): a separate [Random Forest or linear] model was built for each horizon, predicting cover 1, 2 and 3 months ahead from lagged cover and time of year [plus rainfall and temperature]. It was trained on data up to the end of 2024 and tested on 22 months (January 2025 to October 2026), and compared with “same as now” and “same month last year” baselines using RMSE and MAE.
Maps and layouts (ArcGIS Pro): final maps were produced in ArcGIS Pro layouts with a consistent colour scheme, and exported as PNG and PDF.

