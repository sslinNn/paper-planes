import { geoCentroid, geoDistance, geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import countries from 'i18n-iso-countries'
import world from 'world-atlas/countries-110m.json' with { type: 'json' }

export const W = 960
export const H = 500
// неизвестная страна — Антарктида
export const FOG: [number, number] = [0, -78]

export const projection = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' })
export const path = geoPath(projection)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any
export const land = (feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection).features

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
export const distance = (a: [number, number], b: [number, number]) => geoDistance(a, b)
