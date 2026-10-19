// Every source the page leans on. Rendered into #sources; cards and footnotes link to #src-<id>.
// Ids starting "lg<n>" are logainm.ie entries (placenames only: CC BY 4.0).
export const GROUPS = [
  ['method', 'Weather and method'],
  ['data', 'Elevation, maps and data licences'],
  ['mountain', 'The mountain: name, height, rock, path'],
  ['pilgrim', 'Pilgrimage, legend and folklore'],
  ['arch', 'Archaeology'],
  ['gold', 'The gold'],
  ['near', 'Below the mountain'],
  ['pano', 'The panorama stories'],
  ['names', 'Names and heights'],
];
export const SOURCES = [
  // method
  ['openmeteo', 'method', 'Open-Meteo.com forecast API: UK Met Office (UKMO), DWD ICON and ECMWF IFS models, pressure-level temperature, humidity, height and wind. Fetched live by your browser.', 'https://open-meteo.com/', 'Data CC BY 4.0 (open-meteo.com/en/licence)'],
  ['lawrence', 'method', 'Lawrence, M. G. (2005). The relationship between relative humidity and the dewpoint temperature in moist air. Bulletin of the American Meteorological Society 86(2), 225–234. Source of the 125 m per °C cloud-base rule (his Eq. 22) and the Magnus constants used for dew point.', 'https://doi.org/10.1175/BAMS-86-2-225'],
  ['wmo', 'method', 'WMO International Cloud Atlas: orographic cloud on the windward side of mountains, including caps and collars round isolated peaks; and "hill fog".', 'https://cloudatlas.wmo.int/en/orographic-influences-on-the-windward-side.html'],
  ['windchill', 'method', 'Osczevski, R. and Bluestein, M. (2005). The new wind chill equivalent temperature chart. BAMS 86(10), 1453–1458. The "feels like" formula.', 'https://doi.org/10.1175/BAMS-86-10-1453'],
  ['refraction', 'method', 'Hirt, C. et al. (2010). Monitoring of the refraction coefficient in the lower atmosphere… J. Geophys. Res. 115. Why k = 0.13 is only a convention: near the ground it swings a lot.', 'https://doi.org/10.1029/2010JD014067'],
  ['glow', 'method', 'Sunrise and sunset colour: our own rule of thumb (some mid or high cloud to catch the light, little low cloud overhead, a clear run for the light on the sun\'s side, checked about 100 km out). Not a published method.', null],
  // data
  ['terrain', 'data', 'AWS Terrain Tiles (Terrarium PNG), compiled by Mapzen/Tilezen. Around here the source is EU-DEM v1.0, "produced using Copernicus data and information funded by the European Union – EU-DEM layers"; also SRTM (NASA), GMTED2010 (USGS) and ETOPO1 (NOAA). Used for the horizon, viewshed, profiles and the hero skyline.', 'https://registry.opendata.aws/terrain-tiles/', 'Attribution terms: github.com/tilezen/joerd/blob/master/docs/attribution.md'],
  ['osm', 'data', 'OpenStreetMap contributors: summit positions and heights, the Irish names marked "Irish form: OpenStreetMap", towns, islands and piers, fetched through the Overpass API.', 'https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors, ODbL'],
  ['openfreemap', 'data', 'Map tiles: OpenFreeMap (Positron style), © OpenMapTiles, © OpenStreetMap contributors. Map library: MapLibre GL JS.', 'https://openfreemap.org/', 'Free, open; MapLibre is BSD-licensed'],
  ['hilltop', 'data', 'Hill Top Views: Croagh Patrick summit position, 53.760043, −9.660112 (north-west corner of the chapel); drop 638 m.', 'https://hilltopviews.org.uk/hill.php?id=20054'],
  // mountain
  ['lg114135', 'mountain', 'logainm.ie, Cruach Phádraig: the Irish name and the older Cruachán Aighle; the name is listed as non-validated.', 'https://www.logainm.ie/en/114135', 'Irish-language placename data by Logainm © Government of Ireland, CC BY 4.0'],
  ['joyce', 'mountain', 'P. W. Joyce, The Origin and History of Irish Names of Places, vol. 1 (1910 edition), pp. 387–388: cruach, primarily a rick or stack of corn or hay, extended to round, stacked-looking hills; usually Croagh or Crogh in place names. Public domain.', 'https://archive.org/details/originhistoryofi01joycuoft'],
  ['wpcroagh', 'mountain', 'Wikipedia, Croagh Patrick: known locally as "the Reek", a Hiberno-English word for a rick or stack.', 'https://en.wikipedia.org/wiki/Croagh_Patrick'],
  ['gsi', 'mountain', 'Geological Survey Ireland, County Geological Site report MO037, Croagh Patrick Scree Gullies: 764 m; mainly Silurian (Cregganbaun Formation) quartzite and psammite; scree left by the last Ice Age; unstable underfoot above 550 m.', 'https://gsi.geodata.gov.ie/downloads/Geoheritage/Reports/MO037_Croagh_Patrick_Scree_Gullies.pdf'],
  ['mayoclimb', 'mountain', 'Mayo County Council, Climb Croagh Patrick: 764 m (2,507 ft); a 7 km round trip.', 'https://www.mayo.ie/activities/family-friendly/climb-croagh-patrick'],
  ['discover', 'mountain', 'Discover Ireland, Car-free Croagh Patrick: "around three to four hours".', 'https://www.discoverireland.ie/mayo/car-free-croagh-patrick'],
  ['elfyn', 'mountain', 'Elfyn Jones, Croagh Patrick Footpath Condition Report, for Mountaineering Ireland (May 2013): path from Murrisk, about 5 km; about 30,000 on Reek Sunday; gives the height as 765 m.', 'https://www.mountaineering.ie/_files/Elfyn%20Jones%20Croagh%20Patrick%20Report%20-%20May%202013.pdf'],
  ['mayopath', 'mountain', 'Mayo County Council (8 December 2020): work begins on the Croagh Patrick sustainable path.', 'https://mayo.ie/en-ie/news/stakeholders-welcome-commencement-of-sustainable-a'],
  ['mipath', 'mountain', 'Mountaineering Ireland (30 April 2024): the Croagh Patrick path project concludes.', 'https://mountaineering.ie/news/default.aspx?id=497'],
  ['it2024', 'mountain', 'Irish Times (31 March 2024): pathway to the top almost complete; about 120,000 climb each year.', 'https://www.irishtimes.com/ireland/2024/03/31/pathway-to-top-of-croagh-patrick-almost-complete-after-more-than-three-years-of-work/'],
  ['tanner', 'mountain', 'Tanner, P. W. G. (2014). Geological Magazine 151(6), 1072–1094: Irish gold–silver in 0.1–6 m quartz veins of Upper Silurian to Lower Devonian age, Croagh Patrick among them.', 'https://doi.org/10.1017/S0016756813001131'],
  // pilgrimage
  ['catholicenc', 'pilgrim', 'Catholic Encyclopedia, vol. 4 (1908), "Croagh Patrick": the last Sunday in July "from time immemorial"; quotes the 1432 indulgence; gives "441".', 'https://www.newadvent.org/cathen/04509b.htm'],
  ['tuam', 'pilgrim', 'Archdiocese of Tuam on Croagh Patrick (catholicireland.net): Garland Friday; climbing in the dark until the 1970s.', 'https://www.catholicireland.net/croagh-patrick/'],
  ['stations', 'pilgrim', 'Westport Parish, Stations of the Reek (card; Imprimatur, Archbishop Michael Neary, July 2013).', 'https://westportparish.ie/_files/ugd/a4b0ff_ddd93fcc9afb40a1b9f9c50f509275f5.pdf'],
  ['smr', 'pilgrim', 'National Monuments Service, Sites and Monuments Record (Historic Environment Viewer): MA087-045 Leacht; MA087-044004 Leaba Phádraig; MA087-043001 Roilig Mhuire and cairns; MA087-044006 summit enclosure; MA087-044009 hut sites; MA087-044001 church; MA087-031001 Murrisk friary; MA097-006001 Boheh. Includes the 1838 Ordnance Survey letters.', 'https://heritagedata.maps.arcgis.com/apps/webappviewer/index.html?id=0c9eb9575b544081b0d296436d8f60f8'],
  ['lg114278', 'pilgrim', 'logainm.ie, Leacht Mhionnáin (Leaght Mionnain).', 'https://www.logainm.ie/en/114278'],
  ['lg114376', 'pilgrim', 'logainm.ie, Reilig Mhuire.', 'https://www.logainm.ie/en/114376'],
  ['bishops', 'pilgrim', 'Irish Catholic Bishops\' Conference (2022), via theway.ie: Domhnach na Cruaiche; about 100,000 climbers a year.', 'https://theway.ie/?p=18673'],
  ['reek2026', 'pilgrim', 'Mayo-Ireland.ie: Reek Sunday 2026 (26 July) and Garland Friday (24 July).', 'https://www.mayo-ireland.ie/en/mayo-on-the-move/news/reek-sunday-2026'],
  ['rte1965', 'pilgrim', 'RTÉ Archives: 60,000 climb Croagh Patrick (1965).', 'https://www.rte.ie/archives/2015/0725/716927-60-000-climb-croagh-patrick/'],
  ['rte1999', 'pilgrim', 'RTÉ News, 25 July 1999: "an estimated 25,000".', 'https://www.rte.ie/news/1999/0725/croagh.html'],
  ['irishcatholic2014', 'pilgrim', 'The Irish Catholic (2014): "between 15,000 and 20,000".', 'https://irishcatholic.com/thousands-brave-reek-climb'],
  ['irishnews2015', 'pilgrim', 'Irish News (26 July 2015): Reek Sunday called off after overnight storms; zero visibility.', 'https://www.irishnews.com/news/2015/07/26/news/bad-weather-halts-reek-sunday-pilgrimage-203248/'],
  ['tirechan', 'pilgrim', 'Tírechán, Collectanea §38 (late 7th century), translated by Ludwig Bieler; Latin text alongside (confessio.ie/more/tirechan_latin). confessio.ie (Royal Irish Academy).', 'https://www.confessio.ie/more/tirechan_english'],
  ['au441', 'pilgrim', 'Annals of Ulster, 441 (CELT): "Bishop Patrick was approved in the Catholic faith."', 'https://celt.ucc.ie/published/T100001A/text012.html'],
  ['au1113', 'pilgrim', 'Annals of Ulster, U1113.2 (CELT): the ball of fire on Cruachain Aighle on the night of St Patrick\'s feast.', 'https://celt.ucc.ie/published/T100001A/text684.html'],
  ['tripartite', 'pilgrim', 'The Tripartite Life of Patrick (c. 900), ed. Whitley Stokes (1887), part I, p. 115: the black birds, the bell, "Brigit\'s Gapling".', 'https://archive.org/details/tripartitept100unknuoft'],
  ['duchas', 'pilgrim', 'The Schools\' Collection (1930s), dúchas.ie: Patrick drives the serpents into Loch na Corra.', 'https://duchas.ie/ga/cbes/4428021/4368772/4474421'],
  ['dindshenchas', 'pilgrim', 'The Metrical Dindshenchas (CELT): Cruachán Aigle, once Cruachán Garbrois, named for Aigle son of Derg.', 'https://celt.ucc.ie/published/T106500D/text087.html'],
  ['macneill', 'pilgrim', 'Máire MacNeill, The Festival of Lughnasa (Oxford University Press for the Irish Folklore Commission, 1962; reprinted Dublin 1982).', 'https://openlibrary.org/works/OL4548416W'],
  ['ross', 'pilgrim', 'Anne Ross, review of The Festival of Lughnasa, Scottish Studies: names for the day include Garland Sunday, Lammas Sunday and Domhnach Chrom Dubh.', 'https://open.journals.ed.ac.uk/ScottishStudies/article/download/367/393/422'],
  // archaeology
  ['exc1994', 'arch', 'Excavations.ie 1994:186, Croagh Patrick summit (Gerry Walsh, Mayo County Council; licence 94E0115).', 'https://excavations.ie/report/1994/Mayo/0001795/'],
  ['exc1995', 'arch', 'Excavations.ie 1995:224: radiocarbon date cal. AD 430–890 from the oratory; trenches across the summit wall.', 'https://excavations.ie/report/1995/Mayo/0002066/'],
  ['it1997', 'arch', 'Irish Times (17 March 1997): "Scientific evidence suggests Patrick climbed mountain".', 'https://www.irishtimes.com/news/scientific-evidence-suggests-patrick-climbed-mountain-1.52818'],
  ['dia', 'arch', 'Dictionary of Irish Architects: Oratory of St Patrick, Croagh Patrick (W. H. Byrne & Son; dedicated 30 July 1905).', 'https://www.dia.ie/works/view/1089/building/CO.+MAYO%2C+CROAGH+PATRICK%2C+ORATORY+OF+ST+PATRICK'],
  ['morahan', 'arch', 'Leo Morahan, Croagh Patrick, Co. Mayo: Archaeology, Landscape and People (Croagh Patrick Archaeological Committee, Westport, 2001). Further reading; not checked page by page.', null],
  // gold
  ['emd', 'gold', 'Exploration and Mining Division, Gold in Ireland (2004): visible gold found in quartz veins at Lecanvey in 1984; a "geological reserve" of 498,000 t at 9.94 g/t; the area since excluded from prospecting licences.', 'http://spatial.dcenr.gov.ie/EMD_DOWNLOAD/Reports/Gold_in_Ireland_2004.pdf'],
  ['glencar', 'gold', 'Supreme Court, Glencar Exploration plc v Mayo County Council [2001] IESC 64: names Burmin Exploration and Development plc and Tara Mines plc; the council\'s 1992 mining ban.', 'https://ie.vlex.com/vid/glencar-exploration-p-l-793531077'],
  ['rte1989', 'gold', 'RTÉ Archives, 28 April 1989 (Jim Fahy): David Bellamy backs the campaign against gold mining on Croagh Patrick; Mayo Environmental Group.', 'https://www.rte.ie/archives/2014/0428/612184-plans-to-mine-gold-on-croagh-patrick/'],
  ['cassidy', 'gold', 'Archbishop Joseph Cassidy, "Croagh Patrick: its wealth is not in gold", Irish Times, 6 May 1989 (as catalogued in the Tim Robinson papers, University of Galway archives).', 'https://archivesearch.library.universityofgalway.ie/index.php/mining-in-connemara'],
  ['dail1989', 'gold', 'Dáil Éireann, 20 July 1989: Minister Bobby Molloy on independent environmental impact assessment.', 'https://data.oireachtas.ie/akn/ie/debateRecord/dail/1989-07-20/debate/mul@/main.xml'],
  ['dail1990', 'gold', 'Dáil Éireann, 24 May 1990: Molloy excludes Croagh Patrick from prospecting under the Minerals Development Act, 1940.', 'https://data.oireachtas.ie/akn/ie/debateRecord/dail/1990-05-24/debate/mul@/dbsect_6.xml'],
  ['rteban', 'gold', 'RTÉ Archives: mining ban on Croagh Patrick celebrated in Mayo.', 'https://www.rte.ie/archives/collections/news/21417475-mining-ban-on-croagh-patrick/'],
  // near
  ['opwmurrisk', 'near', 'OPW Heritage Ireland: Murrisk Abbey, founded around 1456 by Hugh O\'Malley.', 'https://heritageireland.ie/unguided-sites/murrisk-abbey/'],
  ['faminememorial', 'near', 'Irish Famine Memorials: Murrisk, 1997 (John Behan\'s "Coffin Ship"; plaque: unveiled by President Mary Robinson on 20 July 1997).', 'https://irishfaminememorials.com/2014/01/16/murrisk-co-mayo-1997/'],
  ['tochar', 'near', 'Mayo County Council: Tóchar Phádraig, Ballintubber Abbey to the Reek, 35 km; restored 1987.', 'https://www.mayo.ie/en-ie/visit-mayo/things-to-do/activities/walking-hiking/tochar-phadraig'],
  // panorama stories
  ['contel', 'pano', 'Connacht Telegraph (20 June 2020): Doolough, scene of the 1849 famine tragedy.', 'https://www.con-telegraph.ie/2020/06/20/mayo-gems-doolough-scene-of-famine-tragedy'],
  ['govjoyce', 'pano', 'Department of Justice press release (2018): posthumous pardon for Myles Joyce (Maamtrasna, 1882).', 'https://www.gov.ie/en/department-of-justice-home-affairs-and-migration/press-releases/minister-flanagan-announces-that-the-government-has-agreed-to-advise-the-president-that-he-exercise-his-constitutional-right-of-pardon-to-grant-a-posthumous-pardon-to-mr-myles-joyce-who-was-convicted-in-relation-to-murders-in-maamtrasna-in-1882/'],
  ['tuammamean', 'pano', 'Archdiocese of Tuam: Máméan, Co. Galway (holy well, "St Patrick\'s Bed", revived pilgrimage).', 'https://tuamarchdiocese.org/mamean-co-galway'],
  ['wpcroaghaun', 'pano', 'Wikipedia, Croaghaun (the sea-cliff claim; no official ranking found).', 'https://en.wikipedia.org/wiki/Croaghaun'],
  ['wpmweelrea', 'pano', 'Wikipedia, Mweelrea: "the highest mountain in the western province of Connacht", 814 m.', 'https://en.wikipedia.org/wiki/Mweelrea'],
  ['wpbenbaun', 'pano', 'Wikipedia, Benbaun: "the tallest mountain of the Twelve Bens range, and the county top for Galway".', 'https://en.wikipedia.org/wiki/Benbaun'],
  ['wpnephin', 'pano', 'Wikipedia, Nephin: "the second-highest peak in Connacht (after Mweelrea)" and "the highest standalone mountain in Ireland".', 'https://en.wikipedia.org/wiki/Nephin'],
  ['wpinishturk', 'pano', 'Wikipedia, Inishturk: highest point 189.3 m.', 'https://en.wikipedia.org/wiki/Inishturk'],
  ['mayodeserted', 'pano', 'Mayo County Council: Achill\'s Deserted Village and booleying.', 'https://mayo.ie/discover/famine-emigration/achills-deserted-village'],
  ['askbridge', 'pano', 'askaboutireland.ie: bridges (the Achill Sound swing bridge, 1887).', 'https://askaboutireland.ie/reading-room/environment-geography/transport/transport-infrastructure-/bridges'],
  ['riaclare', 'pano', 'Royal Irish Academy, New Survey of Clare Island (the 1909–11 survey and its 1992–2009 repeat).', 'https://shop.ria.ie/products/new-survey-of-clare-island-v-1-history-and-cultural-landscape'],
  ['mayoturk', 'pano', 'Mayo County Council: Inishturk (the 1805 signal tower).', 'https://www.mayo.ie/islands/inishturk'],
  ['catholicmayo', 'pano', 'Catholic Encyclopedia, "School of Mayo" (Colmán and Inishbofin, after Bede).', 'https://www.catholic.com/encyclopedia/school-of-mayo'],
  ['archcaher', 'pano', 'Archaeology magazine (4 February 2014): Caher Island\'s second pilgrimage circuit.', 'https://archaeology.org/news/2014/02/04/140204-ireland-caher-monastery/'],
  ['rtedorinish', 'pano', 'RTÉ Archives: hippies in County Mayo (Dorinish).', 'https://www.rte.ie/archives/2016/0107/758290-hippies-in-county-mayo/'],
  ['irishlights', 'pano', 'Commissioners of Irish Lights: Inishgort lighthouse.', 'https://www.irishlights.ie/tourism/our-lighthouses/inishgort.aspx'],
  ['geolsoc', 'pano', 'Geological Society: Clew Bay geosite (drowned drumlins).', 'https://www.geolsoc.org.uk/GeositesClewBay'],
  ['itwestport', 'pano', 'Irish Times (2012): how Westport won Best Place to Live in Ireland.', 'https://www.irishtimes.com/news/the-best-place-to-live-in-ireland-how-westport-won-1.1069874'],
  ['louisburgh', 'pano', 'Louisburgh–Killeen heritage: Louisburgh town (laid out 1795; the Louisbourg name).', 'https://www.louisburgh-killeenheritage.org/places/louisburgh_town-2'],
  ['niahnewport', 'pano', 'National Inventory of Architectural Heritage: St Patrick\'s Church, Newport (Harry Clarke window).', 'https://www.buildingsofireland.ie/buildings-search/building/31208021/saint-patricks-catholic-church-newport-newport-mayo'],
  ['bsbi', 'pano', 'BSBI: Erica erigena (Irish heath), status in Ireland.', 'https://bsbi.org/taxa/2cd4p9h.43e/erica-erigena'],
  ['mayohumbert', 'pano', 'Mayo County Council: General Humbert and the Races of Castlebar.', 'https://mayo.ie/discover/history-heritage/great-battles-conflicts/general-humbert'],
  ['askyeats', 'pano', 'askaboutireland.ie: Yeats\'s epitaph at Drumcliff.', 'https://askaboutireland.ie/learning-zone/primary-students/looking-at-places/sligo/yeats-and-sligo/yeats-epitaph'],
  ['opwknocknarea', 'pano', 'OPW Heritage Ireland: Knocknarea, Queen Medb\'s tomb.', 'https://heritageireland.ie/ga/suimh-neamhthreoraithe/knocknarea-queen-medbs-tomb'],
  // aggregated
  ['lg', 'names', 'logainm.ie, the Placenames Database of Ireland: Irish forms of the names in the panorama (entry numbers are given on each card).', 'https://www.logainm.ie/', 'Irish-language placename data by Logainm © Government of Ireland, CC BY 4.0'],
];

const byId = new Map(SOURCES.map((s) => [s[0], s]));
export function resolve(id) {
  let m;
  if ((m = /^mv(\d+)$/.exec(id))) return { id: 'mv', title: `MountainViews, summit ${m[1]}`, url: `https://mountainviews.ie/summit/${m[1]}/` };
  if ((m = /^lg(\d+)$/.exec(id)) && !byId.has(id)) return { id: 'lg', title: `logainm.ie, entry ${m[1]}`, url: `https://www.logainm.ie/en/${m[1]}` };
  const s = byId.get(id); if (!s) return null;
  return { id, title: s[2].split(/[:.(]/)[0].trim(), url: s[3] };
}
export function renderSources(el) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let n = 0; const num = new Map();
  el.innerHTML = GROUPS.map(([g, title]) => {
    const items = SOURCES.filter((s) => s[1] === g);
    return `<h3>${esc(title)}</h3><ol start="${n + 1}">` + items.map((s) => { n++; num.set(s[0], n); return `<li id="src-${s[0]}">${esc(s[2])}${s[3] ? ` <a href="${esc(s[3])}" rel="noopener" target="_blank">link</a>` : ''}${s[4] ? ` <span class="lic">${esc(s[4])}</span>` : ''}</li>`; }).join('') + '</ol>';
  }).join('') + `<p class="fine">Folklore and legend are labelled as such in the text. Where sources disagree (the height, the station names, the chapel's date, who stopped the mine) the page says so. Facts we could not verify were left out. Licences: forecast data CC BY 4.0 (Open-Meteo); map and place data © OpenStreetMap contributors (ODbL); elevation data per the Terrain Tiles attribution above.</p>`;
  return num;
}
