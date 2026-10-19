// Numbered sources. Copy cites them as <a class="cite" href="#s-KEY">KEY</a>; renderSources()
// numbers them in order of first citation and rewrites the citation text to that number.
const A = (u, t) => `<a href="${u}" rel="noopener">${t || u.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`;

export const SOURCES = {
  // tide, datums, levels
  erddap: `Marine Institute, tide predictions (ERDDAP dataset IMI-TidePrediction), Roonagh, 2026–2028, 5-minute values; station list. CC BY 4.0. ${A('https://erddap.marine.ie/erddap/tabledap/IMI-TidePrediction.html')}`,
  mipred: `Marine Institute, "Tidal predictions": "derived from harmonic analysis of data measured at the tide gauges around the Irish coast". ${A('https://www.marine.ie/site-area/data-services/marine-forecasts/tidal-predictions')}`,
  roonagh: `Marine Institute, Irish National Tide Gauge Network 12: Roonagh Pier (installed 2016): MSL +0.376 m, LAT −1.955 m relative to OD Malin; mean spring range 3.797 m; "one of the most challenging sites". data.gov.ie record, modified 18 Oct 2026. ${A('https://data.gov.ie/dataset/irish-national-tide-gauge-network-intgn-12-roonagh-pier-tide-guage-co-mayo-ireland-2016-present')}`,
  intgn: `Marine Institute gauge metadata on data.gov.ie, mean sea level relative to OD Malin: Galway +0.029 m, Inishmore +0.045 m, Ballyglass +0.066 m, Sligo +0.081 m (search "Irish National Tide Gauge Network"). ${A('https://data.gov.ie/dataset?q=Irish+National+Tide+Gauge+Network')}`,
  odm: `NERC Vocabulary Server, L11 "Malin OD": "Mean sea level at Portmoor Pier, Malin Head averaged between 1960 and 1969". ${A('https://vocab.nerc.ac.uk/collection/L11/current/D24/')}`,
  easytide: `UK Hydrographic Office, ADMIRALTY EasyTide predictions for Inishgort (0697) and Roonah Quay (0700), 17–24 Oct 2026 (Crown copyright); compared with this page's Roonagh model. Used only for time and height differences. ${A('https://easytide.admiralty.co.uk/')}`,
  hoskyn: `Admiralty, <i>Sailing Directions for the West Coast of Ireland</i>, Part II (1868), p. 138: "It is high water on full and change at Clare island at 4 h. 38 m. Springs rise 12¼ feet; neaps, 9½ feet. At Westport, at 4 h. 57 m. Springs rise 12¾ feet; neaps, 9½ feet." ${A('https://archive.org/details/sailingdirectio00deptgoog')}`,
  lewis: `Samuel Lewis, <i>A Topographical Dictionary of Ireland</i> (1837), "Westport": "spring tides rise to the height of 14 and neap to 8 feet"; "The quays are now being extended" (online transcriptions). ${A('https://www.melocki.org.uk/lewis/Ireland/i03900.txt')}; ${A('https://peterspioneers.com/Westport.htm')}`,
  cotton: `A. D. Cotton, "Marine Algae", Clare Island Survey part 15, <i>Proc. Royal Irish Academy</i> 31 (1912): "At Westport Quay the rise and fall during spring-tides is about 15 feet". ${A('https://archive.org/details/clareislandsurve00prae')}`,
  mwp16: `Malachy Walsh and Partners for Mayo County Council, Westport slipway and pontoon, drawings 17068-5002 rev C ("Tide Data From Admiralty Tide Tables For Inishgort (ODM): +1.8 MHWS, +0.8 MHWN, −0.8 MLWN, −1.8 MLWS") and 17068-1002 rev C (30 May 2016), foreshore application. ${A('https://www.gov.ie/en/department-of-housing-local-government-and-heritage/publications/mayo-county-council-westport-harbour/')}`,
  mwp17: `Malachy Walsh and Partners, <i>Westport Slipway and Pontoon</i>, report 17068-6002-A (July 2017), pp. 18–19: "Admiralty Chart 2057 has a drying-out height marked of 1.4m, just west of the Point of Roman Island." ${A('https://assets.gov.ie/static/documents/mayo-county-council-westport-harbour-proposed-new-slipway-and-pontoon-771-mb.pdf')}`,
  jba: `JBA Consulting for Mayo County Council, Draft Westport Local Area Plan, Strategic Flood Risk Assessment (Sept 2023): "Westport Quay 15/12/2012 High tide and storm surge – highest event on record (2.75mOD)". ${A('https://consult.mayo.ie/en/system/files/materials/4193/Draft%20Westport%20LAP%20-%20SFRA.pdf')}`,
  noaa: `NOAA Ocean Service, "What are spring and neap tides?" ${A('https://oceanservice.noaa.gov/facts/springtide.html')}`,
  // seabed, land, coast
  opw: `Office of Public Works LiDAR, 2011, tile OPW_189 (2 m DTM and DSM, surveyed by Fugro, "RMS error within +/-200mm"), from Geological Survey Ireland's open topographic data. Contains Irish Public Sector Data (Geological Survey Ireland & the Office of Public Works) licensed under CC BY 4.0. ${A('https://gsi.geodata.gov.ie/downloads/LiDAR/OPW_NASC/OPW_189.zip')}`,
  infomar: `INFOMAR (Geological Survey Ireland & Marine Institute), Bathymetry 10 m inshore grid, depths relative to LAT; datum method (UKHO VORF). Contains Irish Public Sector Data licensed under CC BY 4.0. ${A('https://spatial.marine.ie/arcgis/rest/services/test/bathymetry10mCoverage/ImageServer')}; ${A('https://infomar.ie/surveys/equipment/geodesy-datum-tide')}`,
  osm: `© OpenStreetMap contributors, ODbL: the Point swimming area (node 9996872068), shower, shelters, slipways and coastline. ${A('https://www.openstreetmap.org/node/9996872068')}`,
  // weather, water
  omfc: `Open-Meteo forecast API (best-match models), wind, air temperature, rain, cloud. CC BY 4.0. ${A('https://open-meteo.com/en/docs')}`,
  ommarine: `Open-Meteo Marine API, sea-surface temperature from Météo-France (0.08°). CC BY 4.0. ${A('https://open-meteo.com/en/docs/marine-weather-api')}`,
  neatl: `Marine Institute, Northeast Atlantic ROMS model (ERDDAP IMI_NEATL), sea-surface temperature, 0.0125° grid. CC BY 4.0. ${A('https://erddap.marine.ie/erddap/griddap/IMI_NEATL.html')}`,
  ictemp: `Marine Institute, Irish Coastal Temperature Network (ERDDAP ICTempNetwork): Inishoo Bay, 1 m, 2005–2009; Curraun 2004–2025. CC BY 4.0. ${A('https://erddap.marine.ie/erddap/tabledap/ICTempNetwork.html')}`,
  spm: `US Army Corps of Engineers, <i>Shore Protection Manual</i> (1984), vol. 1, ch. 3: shallow-water wave forecasting equations and the wind-stress factor U<sub>A</sub> = 0.71 U<sup>1.23</sup>.`,
  body: `R. Drillis and R. Contini (1966), body segment lengths as fractions of height, as reproduced in D. A. Winter, <i>Biomechanics and Motor Control of Human Movement</i> (fig. 4.1): ankle 0.039, knee 0.285, hip 0.530, elbow 0.630, chest 0.720, shoulder 0.818, chin 0.870, eye 0.936.`,
  // the works
  plan2010: `Mayo County Council, Westport Town and Environs Development Plan 2010–2016, objective OO-07: "create a bathing area at Roman Island with associated facilities". ${A('https://www.mayo.ie/getmedia/04793fb3-d1e8-4e0d-89e4-78957c4e998b/Westport-2010-2016.pdf')}`,
  wto2021: `Westport Tourism Organisation, submission MYO-C16-28 to the Westport plan consultation, 29 Apr 2021. ${A('https://consult.mayo.ie/en/submission/myo-c16-28')}`,
  west2021: `WEST, submission to the Westport LAP pre-draft consultation, 29 Apr 2021. ${A('https://consult.mayo.ie/en/system/files/materials/581/3395/WEST%20Westport%20LAP%20Draft%20submission%2029.04_.pdf')}`,
  tt2021: `SuperValu TidyTowns adjudication report, Westport, 2021. ${A('https://www.tidytowns.ie/u_reports/2021/mayo/2021-County-Mayo-Westport-366.pdf')}`,
  tt2022: `TidyTowns adjudication report, Westport, 2022. ${A('https://www.tidytowns.ie/u_reports/2022/mayo/2022-Mayo-Westport-366.pdf')}`,
  tt2024: `TidyTowns adjudication report, Westport, 2024. ${A('https://www.tidytowns.ie/u_reports/2024/mayo/2024-Mayo-Westport-366.pdf')}`,
  ctshower: `Connacht Telegraph, "€37,000 quote for shower at popular Mayo swimming spot", 29 Dec 2022. ${A('https://www.con-telegraph.ie/2022/12/29/e37000-quote-for-shower-at-popular-mayo-swimming-spot')}`,
  crf2023: `Department of Rural and Community Development, Community Recognition Fund 2023, successful projects (17 May 2023): "Installation of Amenity Facilities at the Point, Quay, Westport €60,000". ${A('https://assets.gov.ie/257760/df6eb197-ba64-40bb-94da-54bc97f48026.pdf')}`,
  artbrief: `Mayo County Council, Westport Public Art Project Brief, Aug 2023, project 3, "Concrete shelters at 'The Point' swimming area" (location 53.802523, −9.560275). ${A('https://www.mayo.ie/getmedia/281940ec-6b31-4735-afb0-085865c771be/Westport-Public-Art-Project-Brief-August-2023.pdf')}`,
  ct2024: `Connacht Telegraph, "Master plan for Westport's Roman Island", 2 Feb 2024. ${A('https://www.con-telegraph.ie/2024/02/02/master-plan-for-westports-roman-island')}`,
  wp2024: `Western People, "Mayo attraction to benefit from new shelters and shower", 20 Sep 2024, quoting Mayo County Council, 18 Sep 2024. ${A('https://www.westernpeople.ie/news/mayo-attraction-to-benefit-from-new-shelters-and-shower_arid-32274.html')}`,
  wp2026: `Western People, "Swimmers raise complaints about dogs entering water at popular facility", 15 Oct 2026. ${A('https://www.westernpeople.ie/news/swimmers-raise-complaints-about-dogs-entering-water-at-popular-facility_arid-20330791.html')}`,
  lap2024: `Mayo County Council, Westport Local Area Plan 2024–2030, p. 56 and objective HSCO 16; Map 5.3 (Roman Island masterplan outline). ${A('https://mayo.ie/getmedia/8d3ff0c0-df51-485b-9718-76b494dd7edd/Westport-Local-Area-Plan-2024-2030.pdf')}`,
  ct2026jan: `Connacht Telegraph, "Review of west Mayo quay project rejected for funding", 28 Jan 2026. ${A('https://www.con-telegraph.ie/2026/01/28/review-of-west-mayo-quay-project-rejected-for-funding/')}`,
  ct2026aug: `Connacht Telegraph, "Funding for master plan to transform Mayo quay area", 7 Aug 2026; Western People, 11 Aug 2026. ${A('https://www.con-telegraph.ie/2026/08/07/funding-for-master-plan-to-transform-mayo-quay-area/')}`,
  ct2019: `Connacht Telegraph, "€225,000 for Westport harbour projects", 31 Mar 2019, and "New facility built at busy Mayo seafront location", 3 Dec 2019. ${A('https://www.con-telegraph.ie/2019/03/31/e225000-for-westport-harbour-projects/')}`,
  // history
  abp: `An Bord Pleanála, inspector's report, case 302783 (Roman Island, decided 27 Sep 2019). ${A('https://www.pleanala.ie/anbordpleanala/media/abp/cases/reports/302/r302783.pdf')}`,
  lifetime: `"Island 413: Roman Island, Westport", <i>A Lifetime of Islands</i> blog, 28 Jun 2018 (a personal blog reading the historic OS maps). ${A('http://alifetimeofislands.blogspot.com/2018/06/island-413-roman-island-westport-county.html')}`,
  lap2005: `Mayo County Council, Westport Local Area Plan 2005–2011 ("the former site of the Old Bath Hotel"). ${A('https://www.mayo.ie/getmedia/b0f33324-ffa6-4dc5-8a02-a779721bbb4a/Westport-05-11.pdf')}`,
  niahstore: `National Inventory of Architectural Heritage, reg. 31308726, Roman Island, Westport Quay: shipping store, "built 1908", William Friel, "[Demolished 2015]". ${A('https://www.buildingsofireland.ie/buildings-search/building/31308726/roman-island-westport-quay-mayo')}`,
  niahquay: `National Inventory of Architectural Heritage, reg. 31211020, quay, Cloonmonad: "built 1780; extant 1818 … Undergoing reconstruction, 1837". ${A('https://www.buildingsofireland.ie/buildings-search/building/31211020/cloonmonad-westport-quay-mayo')}`,
  ct2016: `Connacht Telegraph, "New Mayo pet food manufacturing plant opens", 25 Nov 2016. ${A('https://www.con-telegraph.ie/2016/11/25/new-mayo-pet-food-manufacturing-plant-opens/')}`,
  duchas: `National Folklore Collection, Schools' Collection (1930s), Westport. ${A('https://www.duchas.ie/en/cbes/4428017/4368518/4471902')}`,
  ctport: `Connacht Telegraph, "Mayo ports, whaling stations and maritime activities", 18 Jul 2026 (citing Rosa Meehan, 2003). ${A('https://www.con-telegraph.ie/2026/07/18/mayo-ports-whaling-stations-and-maritime-activities/')}`,
  lyons: `Mayo County Library, Lyons Photographic Collection, "Westport" album index (archived copy, Dec 2023). ${A('http://web.archive.org/web/20231210193121/https://library.mayo.ie/media/Lyons%20Collection/Lyons%20Photographic%20Collection/album/Mayo%20places/Westport/Westport/index.html')}`,
  ct2021: `Connacht Telegraph, "Westport Quay: a bit of God's heaven", 21 Nov 2021. ${A('https://www.con-telegraph.ie/2021/11/21/westport-quay-a-bit-of-gods-heaven/')}`,
  // bathing water
  epa: `EPA, Table of Identified Bathing Waters and classifications 2022–2025 (beaches.ie). ${A('https://www.beaches.ie/wp-content/uploads/2026/05/Table-of-Identified-Bathing-Waters-Classifications-2022-to-2025_update-2.pdf')}`,
  beaches: `beaches.ie site list (API), 240 locations, fetched 19 Oct 2026. ${A('https://api.beaches.ie/odata/beaches')}`,
  ct2025: `Connacht Telegraph, "Mayo County Council issues warning over bathing water quality at popular spots", 6 Jun 2025. ${A('https://www.con-telegraph.ie/2025/06/06/mayo-county-council-issues-warning-over-bathing-water-quality-at-popular-spots')}`,
  mwr2022: `Midwest Radio, "Swimming banned at popular Westport location", 15 Jun 2022 (archived copy). ${A('http://web.archive.org/web/20221129150508/https://www.midwestradio.ie/index.php/news/58220-swimming-banned-at-popular-westport-location')}`,
  ctdns2022: `Connacht Telegraph, "Do Not Swim notice at west Mayo bathing spot", 4 Nov 2022. ${A('https://www.con-telegraph.ie/2022/11/04/do-not-swim-notice-at-west-mayo-bathing-spot')}`,
  mwr2023: `Midwest Radio, "Two Do Not Swim notices issued for bathing waters in the county", 2 Aug 2023 (archived copy). ${A('http://web.archive.org/web/20230802192600/https://midwestradio.ie/index.php/news/69172-two-do-not-swim-notices-issued-for-bathing-waters-in-the-county')}`,
  dns2024: `Connacht Telegraph, 29 Aug 2024 and 13 Sep 2024; Western People, Sep 2024 ("due to deterioration in bathing water quality"). ${A('https://www.con-telegraph.ie/2024/09/13/two-do-not-swim-notices-lifted-at-mayo-beaches')}; ${A('https://www.westernpeople.ie/news/alert-warning-issued-for-popular-mayo-public-area_arid-31337.html')}`,
  mayo2026: `Mayo County Council, "Bathing water identification 2026". ${A('https://www.mayo.ie/news/bathing-water-identification-2026')}`,
  lifeguards: `Connacht Telegraph, "Council confirms list of Mayo beaches lifeguarded this weekend", 20 Jun 2026. ${A('https://www.con-telegraph.ie/2026/06/20/council-confirms-list-of-mayo-beaches-lifeguarded-this-weekend/')}`,
  it2017: `Irish Times, "Man drowns while swimming in sea at Westport", 9 Jun 2017. ${A('https://www.irishtimes.com/news/ireland/irish-news/man-drowns-while-swimming-in-sea-at-westport-1.3114429')}`,
  // the future
  nasaslr: `NASA Sea Level Change Team, Sea Level Projection Tool (IPCC AR6), grid cell 53° N, 10° W: total relative sea-level change against 1995–2014, medium confidence, SSP1-2.6 and SSP5-8.5 (median and 17–83% likely range), including vertical land motion. ${A('https://sealevel.nasa.gov/ipcc-ar6-sea-level-projection-tool?lat=53&lon=-10&data_layer=scenario')}`,
  ar6: `B. Fox-Kemper et al. (2021), "Ocean, Cryosphere and Sea Level Change", ch. 9 in <i>Climate Change 2021: The Physical Science Basis</i> (IPCC AR6 WG1); G. G. Garner et al. (2021), IPCC AR6 Sea Level Projections, doi:10.5281/zenodo.5914709. ${A('https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-9/')}`,
  cfram: `Office of Public Works, CFRAM Programme (Western CFRAM study), coastal flood maps for Westport Quay: 10% and 0.5% AEP today, and 0.5% AEP in the High-End Future Scenario. CC BY-NC-ND 4.0, so linked here rather than reproduced. ${A('https://www.floodinfo.ie/map/floodmaps/')}`,
  reek: `Skyline of Croagh Patrick from Westport Quay, computed for the Croagh Patrick page from AWS Terrain Tiles / EU-DEM ("produced using Copernicus data and information funded by the European Union").`,
};

export function renderSources(ol) {
  // number by order of first citation in the document, then list the rest
  const order = [];
  document.querySelectorAll('a.cite').forEach((a) => {
    const k = a.getAttribute('href').replace('#s-', '');
    if (SOURCES[k] && !order.includes(k)) order.push(k);
  });
  for (const k of Object.keys(SOURCES)) if (!order.includes(k)) order.push(k);
  ol.replaceChildren();
  order.forEach((k) => {
    const li = document.createElement('li');
    li.id = 's-' + k;
    li.innerHTML = SOURCES[k];
    ol.append(li);
  });
  document.querySelectorAll('a.cite').forEach((a) => {
    const k = a.getAttribute('href').replace('#s-', '');
    const n = order.indexOf(k) + 1;
    a.textContent = n > 0 ? String(n) : '?';
    a.addEventListener('click', () => { const d = document.getElementById('dSources'); if (d) d.open = true; });
  });
}
