/* GeoEstate DEM hydrology: priority-flood fill -> D8 flow direction -> flow accumulation -> HAND + TWI.
 * Build:  gcc -O2 -o hydro hydro.c -lm
 * Usage:  hydro dem.i16 slope.u8x4 ncols nrows north cellX_deg cellY_deg stream_km2 out_dir
 *   dem.i16     raw little-endian int16, row-major north->south, 0 = no data
 *   slope.u8x4  raw uint8 = slope degrees * 4 (255 = no data)  (optional: pass "-" to use 1 deg everywhere)
 * Writes out_dir/hand.u8 (HAND metres*2; 0 = modelled stream cell, non-stream cells are >= 1; 255=nodata), twi.u8 (TWI*8, 255=nodata), acc.i32 (upslope cell count).
 * Method: Barnes, Lehman & Mulla (2014) Priority-Flood (flats drain toward their spill point), D8 routing. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <math.h>
#include <string.h>

typedef struct { float z; int32_t i; } Node;
static Node *heap; static size_t hn = 0;
static void hpush(float z, int32_t i) {
  size_t k = hn++; heap[k].z = z; heap[k].i = i;
  while (k) { size_t p = (k - 1) >> 1; if (heap[p].z <= heap[k].z) break; Node t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; }
}
static Node hpop(void) {
  Node top = heap[0]; heap[0] = heap[--hn]; size_t k = 0;
  for (;;) { size_t l = 2 * k + 1, r = l + 1, m = k;
    if (l < hn && heap[l].z < heap[m].z) m = l; if (r < hn && heap[r].z < heap[m].z) m = r;
    if (m == k) break; Node t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; }
  return top;
}
static const int DR[8] = {-1,-1,-1, 0, 0, 1, 1, 1};
static const int DC[8] = {-1, 0, 1,-1, 1,-1, 0, 1};

int main(int argc, char **argv) {
  if (argc < 10) { fprintf(stderr, "usage: hydro dem slope ncols nrows north cellX cellY stream_km2 outdir\n"); return 1; }
  const long W = atol(argv[3]), H = atol(argv[4]); const double north = atof(argv[5]), cx = atof(argv[6]), cy = atof(argv[7]), streamKm2 = atof(argv[8]);
  const char *od = argv[9]; const long N = W * H;
  int16_t *dem = malloc(N * 2); FILE *f = fopen(argv[1], "rb"); if (!f || fread(dem, 2, N, f) != (size_t)N) { fprintf(stderr, "dem read failed\n"); return 1; } fclose(f);
  uint8_t *slp = NULL; if (strcmp(argv[2], "-")) { slp = malloc(N); f = fopen(argv[2], "rb"); if (!f || fread(slp, 1, N, f) != (size_t)N) { fprintf(stderr, "slope read failed\n"); return 1; } fclose(f); }

  float *fill = malloc(N * 4); uint8_t *dir = malloc(N); int32_t *order = malloc(N * 4), *pit = malloc(N * 4);
  heap = malloc(N * sizeof(Node)); memset(dir, 254, N);                         /* 254 = not yet visited, 255 = outlet */
  long nvalid = 0;
  for (long i = 0; i < N; i++) { fill[i] = dem[i]; if (dem[i] != 0) nvalid++; }
  /* seeds: valid cells on the grid edge or touching no-data */
  for (long r = 0; r < H; r++) for (long c = 0; c < W; c++) { long i = r * W + c; if (dem[i] == 0) continue;
    int edge = (r == 0 || c == 0 || r == H - 1 || c == W - 1);
    for (int k = 0; k < 8 && !edge; k++) { long rr = r + DR[k], cc = c + DC[k]; if (dem[rr * W + cc] == 0) edge = 1; }
    if (edge) { dir[i] = 255; hpush(fill[i], (int32_t)i); } }
  long on = 0, ph = 0, pt = 0;
  while (hn || ph < pt) {
    int32_t c; if (ph < pt) c = pit[ph++]; else c = hpop().i;
    order[on++] = c; long r = c / W, col = c % W;
    for (int k = 0; k < 8; k++) { long rr = r + DR[k], cc = col + DC[k]; if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
      long n = rr * W + cc; if (dem[n] == 0 || dir[n] != 254) continue;
      dir[n] = (uint8_t)(7 - k);                                                /* direction from n back to c (opposite of k) */
      if (fill[n] <= fill[c]) { fill[n] = fill[c]; pit[pt++] = (int32_t)n; } else hpush(fill[n], (int32_t)n); }
  }
  fprintf(stderr, "valid %ld processed %ld\n", nvalid, on);

  int32_t *acc = malloc(N * 4); for (long i = 0; i < N; i++) acc[i] = dem[i] ? 1 : 0;
  for (long q = on - 1; q >= 0; q--) { long c = order[q]; if (dir[c] >= 8) continue; long r = c / W, col = c % W; long p = (r + DR[dir[c]]) * W + (col + DC[dir[c]]); acc[p] += acc[c]; }

  float *ref = malloc(N * 4); uint8_t *hand = malloc(N), *twi = malloc(N); memset(hand, 255, N); memset(twi, 255, N);
  double dy = cy * 110574.0; long nstream = 0;
  for (long q = 0; q < on; q++) { long c = order[q]; long r = c / W, col = c % W;
    double lat = north - (r + 0.5) * cy; double dx = cx * 111320.0 * cos(lat * M_PI / 180.0), area = dx * dy;
    int stream = acc[c] * area >= streamKm2 * 1e6;
    if (dir[c] >= 8 || stream) ref[c] = fill[c]; else { long p = (r + DR[dir[c]]) * W + (col + DC[dir[c]]); ref[c] = ref[p]; }
    if (stream) nstream++;
    double h = dem[c] - ref[c]; if (h < 0) h = 0; double hv = h * 2.0; uint8_t hb = hv > 254 ? 254 : (uint8_t)(hv + 0.5);
    hand[c] = stream ? 0 : (hb == 0 ? 1 : hb);                                 /* 0 is reserved for modelled stream cells */
    double sd = slp && slp[c] != 255 ? slp[c] / 4.0 : 1.0; if (sd < 0.5) sd = 0.5;
    double a = acc[c] * area / dx;                                              /* specific catchment area, m */
    double t = log(a / tan(sd * M_PI / 180.0)); double tv = t * 8.0; twi[c] = tv < 0 ? 0 : tv > 254 ? 254 : (uint8_t)(tv + 0.5);
  }
  fprintf(stderr, "stream cells %ld\n", nstream);
  char p[1024]; snprintf(p, sizeof p, "%s/hand.u8", od); f = fopen(p, "wb"); fwrite(hand, 1, N, f); fclose(f);
  snprintf(p, sizeof p, "%s/twi.u8", od); f = fopen(p, "wb"); fwrite(twi, 1, N, f); fclose(f);
  snprintf(p, sizeof p, "%s/acc.i32", od); f = fopen(p, "wb"); fwrite(acc, 4, N, f); fclose(f);
  return 0;
}
