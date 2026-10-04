# GeoEstate LandCheck Architecture

```text
                 GEOESTATE LANDCHECK
                         |
                    GEOESTATE API
                         |
          +--------------+--------------+
          |              |              |
         OSM            DEM         LAND COVER
      Roads/POI      Elevation       Dynamic
      Buildings      / Terrain       World etc.
          |              |              |
          +--------------+--------------+
                         |
                    SPATIAL ENGINE
                         |
          +--------------+--------------+
          |              |              |
      Proximity      Terrain        Context
      Analysis       Analysis       Analysis
          |              |              |
          +--------------+--------------+
                         |
                 LANDCHECK RESULT
                         |
              +----------+----------+
              |                     |
          Web report             PDF report
```

The current starter intentionally uses a demo scoring layer. External provider adapters should be added behind the server-side API so the UI remains stable as data sources evolve.
