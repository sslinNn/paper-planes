import { geoCentroid, geoContains, geoDistance, geoGraticule10, geoPath, geoProjection } from 'd3-geo'
import { feature } from 'topojson-client'
import countries from 'i18n-iso-countries'
import world from 'world-atlas/countries-110m.json' with { type: 'json' }

// плоская карта во весь экран: проекция Миллера (сплюснутый Меркатор, ~1.86:1 — почти пропорции экрана).
// шов повёрнут в Берингов пролив (−169°): Чукотка остаётся с Россией, Аляска — с Америкой
const miller = (λ: number, φ: number): [number, number] => [λ, 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * φ))]
miller.invert = (x: number, y: number): [number, number] => [x, 2.5 * Math.atan(Math.exp(y / 1.25)) - (5 * Math.PI) / 8]

export const W = 1000
const NORTH = 82
const SOUTH = -72
export const projection = geoProjection(miller).rotate([-11, 0]).scale(W / (2 * Math.PI)).translate([W / 2, 0])
const top = projection([11, NORTH])![1]
projection.translate([W / 2, -top])
export const H = projection([11, SOUTH])![1]
// 0.1 единицы карты (ширина 1000) — меньше пикселя даже при пятикратном зуме; пути в HTML короче на четверть
export const path = geoPath(projection).digits(1)

// неизвестная страна — Антарктида: кончик Антарктического полуострова, виден даже когда широкий экран режет низ
export const FOG: [number, number] = [-60, -62]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any
const raw = (feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection).features

// Natural Earth 4.1.0 рисует Крым по фактическому контролю — в составе России. Делаем его нейтральным:
// отдельная суша без кода страны, как у прочих спорных территорий (не красится, не считается ничьей)
const SIMFEROPOL: [number, number] = [34.1, 44.95]
export const land: GeoJSON.Feature[] = raw.flatMap((f) => {
  if (String(f.id) !== '643' || f.geometry.type !== 'MultiPolygon') return [f]
  const polys = f.geometry.coordinates
  const i = polys.findIndex((p) => geoContains({ type: 'Polygon', coordinates: p }, SIMFEROPOL))
  if (i < 0) return [f]
  return [
    { ...f, geometry: { type: 'MultiPolygon', coordinates: polys.filter((_, j) => j !== i) } },
    { type: 'Feature', id: 'crimea', properties: { name: 'Crimea' }, geometry: { type: 'Polygon', coordinates: polys[i] } },
  ]
})

// ponytail: центроид мультиполигона (Франция с Гвианой уезжает к Атлантике) — для игрушки ок
const centroids = new Map(land.map((f) => [String(f.id), geoCentroid(f)]))

export function at(iso: string | null): [number, number] {
  if (!iso || iso === 'AQ') return FOG
  return centroids.get(countries.alpha2ToNumeric(iso) ?? '') ?? FOG
}

export const graticule = geoGraticule10()

// ISO alpha-2 страны карты (у пары спорных территорий кода нет)
export const isoOf = (f: GeoJSON.Feature) => countries.numericToAlpha2(String(f.id)) ?? null

// радианы по большому кругу — для длительности полёта
export const EARTH_KM = 6371
export const distance = (a: [number, number], b: [number, number]) => geoDistance(a, b)

// точка юзера должна лежать в его стране — по тем же контурам, что нарисованы на карте
export const inCountry = (iso: string, spot: [number, number]) =>
  land.some((f) => isoOf(f) === iso && geoContains(f, spot))
