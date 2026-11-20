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

2.Monthly composites (Google Earth Engine): 

Sentinel-2 surface-reflectance images from January 2019 to October 2026 (94 months) were cloud-masked with Cloud Score+ (threshold 0.6), and a median composite was made for each month at 10 m resolution. Four indices were added: NDVI, MNDWI, NDCI and the Floating Algae Index (FAI). Sentinel-1 (IW mode) monthly median VV and VH backscatter, lightly smoothed, and their difference (VH minus VV) were added to help separate dense mats from open water.

3.Classes (Google Earth Engine): 

•open water
•floating vegetation
•scum or turbid water
•other (reeds, shore, bare ground).

Training and test points were labelled by interpreting Sentinel-2 imagery in false colour, using only locations where the class was clear. No field data were available.

4.Classifier (Google Earth Engine):

A Random Forest with 300 trees was trained on [240] points and tested on [80] points from four whole months that were held out of training (a stricter test than a random split). The test gave overall accuracy, kappa, and producer’s and user’s accuracy for each class, and the Random Forest was then retrained on all 320 points (80 per class, from 16 months) for the final maps.

5.Baseline and monthly area (Google Earth Engine, R):

An NDVI threshold of [0.25] was run alongside the Random Forest for comparison. Area per class was calculated for each month in hectares and as a percentage of the water surface. Months with less than 60% valid pixels were flagged as unusable. The series was exported to CSV and plotted in R.

6.Persistence (Google Earth Engine, ArcGIS Pro): 

The share of valid months in which each pixel was classed as floating vegetation was exported from Earth Engine as a 10 m raster in UTM zone 35S, with pixels having fewer than 12 valid months removed. In ArcGIS Pro, Raster Calculator grouped it into four levels: rarely (below 10% of months), occasionally (10 to 30%), frequently (30 to 60%) and persistently (above 60%) floating.

7.Zones (ArcGIS Pro):

[5] zones (Zone A or dam wall area, Main basin, Magalies inflow, Bay A and Crocodile inflow) were drawn from the dam’s geography with the Split tool, before looking at the results. Zonal Statistics as Table gave mean persistence per zone, and Tabulate Area gave the area of each persistence class per zone.

8.Hotspots (ArcGIS Pro): 

Optimized Hot Spot Analysis was run on the aggregated persistence grid to show where high persistence is spatially clustered, and the result was mapped by confidence level.

9.Forecast (R): 

A separate linear] model was built for each horizon, predicting cover 1, 2 and 3 months ahead from lagged cover and time of year plus rainfall and temperature as drivers. It was trained on data up to the end of 2024 and tested on 22 months (January 2025 to October 2026), and compared with “same as now” and “same month last year” baselines using RMSE and MAE.

10.Maps and layouts (ArcGIS Pro):

Final maps were produced in ArcGIS Pro layouts with a consistent colour scheme, and exported as PNG and PDF.

# Accuracy and validation

| Actual \ Predicted | Open water | Floating veg. | Scum | Other | Producer’s acc. |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Open water** | 20 | 0 | 0 | 0 | 100% |
| **Floating vegetation** | 0 | 20 | 0 | 0 | 100% |
| **Scum / turbid water** | 6 | 1 | 13 | 0 | 65% |
| **Other** | 0 | 0 | 0 | 20 | 100% |
| **User’s accuracy** | 77% | 95% | 100% | 100% | |

Overall accuracy was 91.25% and kappa 0.88.

# Limitations

1.No field validation. No fieldwork or drone imagery was available, so training and test points were labelled by interpreting Sentinel-2 imagery. Only locations where the class was clear were used, which makes the reported accuracy (about 91% overall) optimistic for mixed or ambiguous pixels. The test set was also small (80 points from four months), so the accuracy figures are approximate.

2.Species are not separated. Water hyacinth and salvinia look alike at 10 m resolution, and no field data were available to tell them apart, so they are mapped as one class, “floating vegetation”. The results describe floating vegetation cover overall and say nothing about which species is responsible for changes.

3.10 m pixels mix water and vegetation. Along the shoreline, in narrow inflow arms and at the edges of mats, a single pixel can contain both water and plants, so its class is uncertain. Small mats may be missed, and edge pixels may be misclassified, which affects narrow zones the most.

4.Zone boundaries are a judgement call. The zones were drawn from the dam’s geography before looking at the results, but other boundaries would give different values. Small or narrow zones, such as the inflow channels, rest on fewer pixels, so their means are less stable than those of the large main basin.

# Interpretation of Results

Reliability of the maps

The Random Forest classified held-out months with an overall accuracy of about 91% (kappa 0.88), and it was reliable for the class that matters most. Floating vegetation was found in every test case (producer’s accuracy 100%), and 95% of the pixels labelled as floating vegetation really were (user’s accuracy). Scum or turbid water was the weakest class: only 65% of scum points were found, and about one in four pixels labelled open water was scum. Floating vegetation results can therefore be used with reasonable confidence, and scum results should be read as indicative only. These figures come from image-based validation on 80 test points, and real accuracy on mixed or edge pixels will be lower.

Building up of cover overtime

Floating vegetation cover follows a clear seasonal cycle. In winter (June to September) it falls to about 100 to 350 ha (median about 175 ha, roughly 9% of the water surface). It begins rising in October or November and peaks in summer, with typical December to February values of about 600 to 700 ha, roughly three to four times the winter average. The size of the peak varies strongly between years, from about 600 ha in February 2024 to more than 1,100 ha in February 2022 and January 2026 (up to 59% of the water surface), and the peak was late in 2023 (April, 1,065 ha). This cycle is consistent with warm-season growth and winter die-back, but this project did not test the causes, and the year-to-year differences are not explained by the data analysed here.

Locations where cover builds up

Across the dam, 40.5% of mapped area (760 ha) was rarely floating vegetation and 47.3% (889 ha) occasionally so, while 12.2% (229 ha) was frequently or persistently covered, including 108 ha (5.8%) classed as persistent, meaning floating vegetation in more than 60% of valid months. Persistence differed strongly between zones. The Crocodile inflow, the smallest zone (61 ha), had the highest share of frequent and persistent cover (47.5%, of which 29.1% persistent). The Magalies inflow had almost no rarely floating area (0.7%), with 75.2% occasionally and 24.1% frequently or persistently covered, and it holds the most frequent and persistent cover of any zone in hectares (87 ha, 38% of the dam total) despite making up only 19% of the mapped area. The main basin, at 61% of the area, was mostly rarely or occasionally covered (93.9%), and only 6.1% of it was frequent or persistent, but because it is so large it still contains 69 ha of frequent and persistent cover (30% of the total) and 40 ha of persistent cover (37% of all persistent cover). Bay A and the dam wall area were intermediate, with 15.9% and 11.7% frequent or persistent.

# Recommendations
1.Prioritise the Magalies and Crocodile inflows, where cover is both common and persistent relative to their size, then the parts of the main basin where persistence is highest. In hectares, the Magalies arm and the main basin together hold about 68% of all frequent and persistent cover, so they matter most for the total area affected, and the Crocodile inflow matters most per unit of area.

2.Plan around the seasonal cycle. Cover typically starts to rise in October or November and peaks between December and February, at about three to four times the winter area. Have surveillance and control capacity ready by early spring. Use the low-cover months (June to September, about 100 to 350 ha) for preparation, contracting and maintenance, and, if specialists agree, for work when there is less cover to deal with. The peak can be late (April in 2023), so do not assume a fixed end date.

3.Link the maps to control records. Compare cover with the dates and locations of herbicide, biocontrol and mechanical removal, if the dam’s managers hold them. The large differences between years (for example the high summers of 2022, 2023 and 2025/26 against a lower 2024) can only be tied to management or to conditions with those records and with rainfall, temperature and water level. No conclusion about what worked can be drawn from this project alone.

4.Look at the sources of inflow. Persistence was highest where the rivers enter, which is consistent with nutrient or plant inflow from upstream, though this wasn’t tested. Water-quality sampling and upstream source tracing at these inflows would show whether control within the dam can succeed without action upstream.

5.Improve the data for future work. Drone surveys or high-resolution imagery on a few dates would allow species-level mapping and give a proper accuracy test. Adding water level and rainfall records would let the drivers of year-to-year differences be tested.

# Code


| File | What it does |
|---|---|
| [`code/gee/harties_floating_veg.js`](code/harties_floating_veg.js) | Google Earth Engine: composites, classification, accuracy, exports |
| [`code/gee/harties_drivers.js`](code/harties_drivers.js) | Google Earth Engine: monthly rainfall and temperature |
| [`code/r/harties_forecast.R`](code/harties_forecast.R) | R: time series and forecast comparison |
| [`data/training_points.csv`](data/training_points.csv) | Labelled training points (class, month, longitude, latitude) |

Reproducibility note: the Earth Engine script reads training points that are drawn as layers in the Code Editor. The same points are saved in data/training_points.csv, so the training data can be rebuilt, but the script will not run unchanged for someone else.

# Acknowledgements

Sentinel data: Copernicus / ESA | Water extent: JRC Global Surface Water | Rainfall: CHIRPS | Climate: ERA5-Land | Processing: Google Earth Engine | ArcGIS Pro | R.


