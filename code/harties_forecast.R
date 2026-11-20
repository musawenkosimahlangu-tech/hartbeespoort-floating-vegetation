# =====================================================================
# Hartbeespoort floating vegetation: 1-, 2- and 3-month-ahead forecast (v2)
# No lubridate / zoo needed. ranger is optional (falls back to lm).
# Input : harties_floating_monthly_RF.csv  (GEE export, you pick it)
# Optional: drivers_monthly.csv with date, rain_mm, temp_c, level_pct
# =====================================================================
install.packages(c("dplyr", "tidyr", "readr", "purrr","ggplot2"))

library(dplyr)
library(tidyr)
library(readr)
library(purrr)
library(ggplot2)

# ---------------------- 0. SETTINGS ----------------------------------
driver_file <- "C:/Users/musaw/Downloads/drivers_monthly.csv"   # USE YOUR OWN FILE PATH
target_col  <- "floating_ha"           # or "floating_pct_of_wet"
horizons    <- 1:3
train_end   <- as.Date("2024-12-31")   # train up to here, test after
max_gap     <- 2                       # fill gaps of up to 2 months
use_drivers <- TRUE    # set FALSE for the cover-only version

# ---------------------- 1. HELPERS (base R) --------------------------
month_start <- function(x) as.Date(format(as.Date(x), "%Y-%m-01"))

# Linear interpolation, but only across gaps of <= maxgap months
fill_gaps <- function(x, maxgap = 2) {
  idx <- seq_along(x); ok <- !is.na(x)
  if (sum(ok) < 2) return(x)
  y <- approx(idx[ok], x[ok], xout = idx, rule = 1)$y
  r <- rle(is.na(x))
  ends <- cumsum(r$lengths); starts <- ends - r$lengths + 1
  for (i in which(r$values & r$lengths > maxgap)) y[starts[i]:ends[i]] <- NA
  y
}

# Trailing (right-aligned) rolling statistic; NA if any value missing
roll_right <- function(x, k, fun = mean) {
  vapply(seq_along(x), function(i)
    if (i < k) NA_real_ else fun(x[(i - k + 1):i]), numeric(1))
}

use_rf <- requireNamespace("ranger", quietly = TRUE)
cat("Model:", if (use_rf) "Random Forest (ranger)" else
  "Linear regression (ranger not available)", "\n")

# ---------------------- 2. LOAD + CLEAN ------------------------------
csv_file <- file.choose()   # a window opens: pick the RF CSV
raw_df <- read_csv(csv_file, show_col_types = FALSE)
cat("Columns:", paste(names(raw_df), collapse = ", "), "\n")
stopifnot(all(c("date", target_col, "usable") %in% names(raw_df)))

df <- raw_df |>
  mutate(date = month_start(date),
         usable = usable %in% c(1, TRUE, "1", "true", "TRUE")) |>
  arrange(date) |>
  transmute(date, cover = ifelse(usable, .data[[target_col]], NA_real_)) |>
  complete(date = seq(min(date), max(date), by = "month")) |>
  mutate(cover = fill_gaps(cover, max_gap))

cat("Months total:", nrow(df), "| still missing after filling:",
    sum(is.na(df$cover)), "\n")

# ---------------------- 3. FEATURES ----------------------------------
df <- df |>
  mutate(cover_l1 = dplyr::lag(cover, 1),
         cover_l2 = dplyr::lag(cover, 2),
         cover_m3 = roll_right(cover, 3, mean),
         mon  = as.integer(format(date, "%m")),
         msin = sin(2 * pi * mon / 12),
         mcos = cos(2 * pi * mon / 12)) |>
  select(-mon)

feats <- c("cover", "cover_l1", "cover_l2", "cover_m3", "msin", "mcos")

if (use_drivers && file.exists(driver_file)) {
  drv <- read_csv(driver_file, show_col_types = FALSE) |>
    mutate(date = month_start(date)) |>
    arrange(date) |>
    mutate(rain_l1 = dplyr::lag(rain_mm, 1),
           rain_3m = roll_right(rain_mm, 3, sum),
           temp_l1 = dplyr::lag(temp_c, 1))
  df <- left_join(df, drv, by = "date")
  extra <- intersect(c("rain_mm", "rain_l1", "rain_3m", "temp_c",
                       "temp_l1", "level_pct"), names(df))
  feats <- c(feats, extra)
  cat("Drivers used:", paste(extra, collapse = ", "), "\n")
}

# ---------------------- 4. DIRECT FORECAST PER HORIZON ---------------
run_h <- function(h) {
  d <- df |>
    mutate(target      = dplyr::lead(cover, h),
           target_date = dplyr::lead(date, h),
           persistence = cover,                         # same as now
           seasonal    = dplyr::lag(cover, 12 - h))     # same month last year
  d <- d[complete.cases(d[, c("target", feats)]), ]
  
  train <- d[d$target_date <= train_end, ]
  test  <- d[d$target_date >  train_end & !is.na(d$seasonal), ]
  
  if (use_rf) {
    set.seed(42)
    m <- ranger::ranger(target ~ ., data = train[, c("target", feats)],
                        num.trees = 500, importance = "permutation")
    p <- predict(m, test[, feats])$predictions
    imp <- m$variable.importance
  } else {
    m <- lm(target ~ ., data = train[, c("target", feats)])
    p <- as.numeric(predict(m, test[, feats]))
    imp <- NULL
  }
  
  list(pred = data.frame(h = h, date = test$target_date, actual = test$target,
                         model = p, persistence = test$persistence,
                         seasonal = test$seasonal),
       imp = imp, n_train = nrow(train), n_test = nrow(test))
}

res  <- map(horizons, run_h)
pred <- bind_rows(map(res, "pred"))
cat("Training rows per horizon:", paste(map_int(res, "n_train"), collapse = ", "),
    "| test rows:", paste(map_int(res, "n_test"), collapse = ", "), "\n")

# ---------------------- 5. SKILL TABLE -------------------------------
rmse <- function(a, p) sqrt(mean((a - p)^2, na.rm = TRUE))
mae  <- function(a, p) mean(abs(a - p), na.rm = TRUE)

skill <- pred |>
  group_by(h) |>
  summarise(n_test = n(),
            RMSE_model       = rmse(actual, model),
            RMSE_persistence = rmse(actual, persistence),
            RMSE_seasonal    = rmse(actual, seasonal),
            MAE_model        = mae(actual, model),
            MAE_persistence  = mae(actual, persistence),
            MAE_seasonal     = mae(actual, seasonal),
            .groups = "drop") |>
  mutate(model_vs_persistence_pct = 100 * (1 - RMSE_model / RMSE_persistence))
print(as.data.frame(skill))

if (use_rf) {
  for (i in seq_along(horizons)) {
    cat("\nVariable importance, horizon", horizons[i], "months:\n")
    print(round(sort(res[[i]]$imp, decreasing = TRUE), 3))
  }
}

# ---------------------- 6. PLOT + SAVE -------------------------------
p <- pred |>
  pivot_longer(c(actual, model, persistence),
               names_to = "series", values_to = "value") |>
  ggplot(aes(date, value, colour = series, linetype = series)) +
  geom_line(linewidth = 0.8) +
  facet_wrap(~ h, ncol = 1, labeller = label_both) +
  scale_colour_manual(values = c(actual = "black", model = "#d7301f",
                                 persistence = "#2c7fb8")) +
  labs(title = "Floating vegetation: forecast vs actual (test period)",
       x = NULL, y = target_col, colour = NULL, linetype = NULL) +
  theme_minimal()
print(p)

write_csv(pred,  "forecast_predictions.csv")
write_csv(skill, "forecast_skill.csv")
ggsave("forecast_plot.png", p, width = 8, height = 8, dpi = 200)
cat("Saved: forecast_predictions.csv, forecast_skill.csv, forecast_plot.png in",
    getwd(), "\n")

# NOTES 
# * Direct method: one model per horizon; features known at time t,
#   target = cover at t + h.
# * Compare the model with persistence and seasonal baselines. If it does
#   not beat persistence, report that: it is a valid result.
# * Random Forest cannot predict above the largest value seen in training.
