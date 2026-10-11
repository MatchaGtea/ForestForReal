# NOTICE — Upstream Source Attributions

The Thailand Canonical Administrative-Names Reference composes data from four MIT-licensed upstream repositories. Each is acknowledged here per MIT's notice-preservation requirement and per CC BY 4.0's attribution requirement on derivative works.

## thailand-geography-data/thailand-geography-json

- **Repository:** https://github.com/thailand-geography-data/thailand-geography-json
- **Copyright:** (c) 2023-Present Joe Takara
- **License:** MIT
- **Used for:** Primary ADM1 names base (TIS-1099 codes, English names, Thai-script names)

## kongvut/thai-province-data

- **Repository:** https://github.com/kongvut/thai-province-data
- **Copyright:** (c) Kongvut Sangkla
- **License:** MIT
- **Used for:** Region grouping (`geography_id`), subdistrict lat/long for centroid fallback, English-spelling cross-validation

## GeoThai/data

- **Repository:** https://github.com/GeoThai/data
- **License:** MIT
- **Used for:** English-spelling cross-validation (v1 and v2)

## piyayut-ch/mapthai

- **Repository:** https://github.com/piyayut-ch/mapthai
- **Copyright:** (c) Piyayut Chitchumnong (ORCID linked in package DESCRIPTION)
- **License:** MIT
- **Used for:** ADM1 polygon source for centroid computation. Polygons themselves are not redistributed in this artifact; only the computed centroid lat/long per province.

## Upstream license texts

The full LICENSE file for each upstream is preserved at `data/inputs/<source-name>/LICENSE` in this repository.

## Our license

The data and methodology in this artifact are licensed under CC BY 4.0. The build code is licensed under MIT. See `LICENSE` and `LICENSE-CODE` files in this repository.
