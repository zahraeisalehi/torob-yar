'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import coverage from '../../../data/fixtures/coverage.json';
import { useRankedOffers, useShops } from '@/lib/store/shops';
import { useLocation } from '@/lib/store/location';
import { useMapStore } from '@/lib/store/map';
import { circleRing, haversineM } from '@/lib/geo/haversine';
import { routeSync } from '@/lib/geo/placeholder';
import type { RankedOffer } from '@/lib/domain/ranking';
import { formatToman, toFaDigits } from '@/lib/domain/format';
import { styleChain } from './styles';
import { addMallLayers, floorsOf, layoutCubes, mallLayerIds, removeMallLayers, setIsolation, MALL_PREFIX } from './mall';

export type MapPadding = { top: number; bottom: number; left: number; right: number };

type Props = {
  step: 'chat' | 'shops' | 'shop';
  shopId: string | null;
  padding: MapPadding;
  onPinClick: (shopId: string) => void;
  onMallShop: (shopId: string) => void;
};

const OUR_SOURCES = ['coverage', 'rings', 'heat', 'route'];
// The worker is copied to /public by scripts/copy-assets.mjs (bundlers can't resolve it from the ESM build).
if (typeof window !== 'undefined') maplibregl.setWorkerUrl(`${window.location.origin}/vendor/maplibre-gl-worker.mjs`);
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function MapView({ step, shopId, padding, onPinClick, onMallShop }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef(new Map<string, { m: maplibregl.Marker; el: HTMLDivElement; key: string }>());
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const labelMarkers = useRef<maplibregl.Marker[]>([]);
  const styleReady = useRef(false);
  const { visible } = useRankedOffers();
  const highlight = useShops((s) => s.highlight);
  const user = useLocation();
  const mall = useMapStore((s) => s.mall);
  const setReady = useMapStore((s) => s.setReady);
  const visibleRef = useRef<RankedOffer[]>([]);
  visibleRef.current = visible;
  const propsRef = useRef({ step, shopId, padding, onPinClick, onMallShop });
  propsRef.current = { step, shopId, padding, onPinClick, onMallShop };

  // ---------- init + style fallback chain ----------
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const chain = styleChain();
    let idx = 0;
    let errors: number[] = [];
    const map = new maplibregl.Map({
      container: container.current,
      style: chain[0] as string | StyleSpecification,
      center: [user.lon, user.lat],
      zoom: 14,
      attributionControl: { compact: true },
      dragRotate: true,
      pitchWithRotate: true,
      maxPitch: 70,
      fadeDuration: 150,
    });
    mapRef.current = map;
    map.touchZoomRotate.enableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-left');
    (window as unknown as { __map?: MLMap }).__map = map;

    const fallback = (why: string) => {
      if (idx >= chain.length - 1) return;
      idx++;
      errors = [];
      console.warn(JSON.stringify({ kind: 'map_style_fallback', to: idx, why }));
      useMapStore.getState().setStyleIndex(idx);
      styleReady.current = false;
      map.setStyle(chain[idx] as string | StyleSpecification);
    };
    let loadTimer = setTimeout(() => !styleReady.current && fallback('timeout'), 9000);
    map.on('error', (e) => {
      const now = Date.now();
      errors = [...errors.filter((t) => now - t < 5000), now];
      if (!styleReady.current || errors.length > 5) {
        fallback(String((e as unknown as { error?: { message?: string } }).error?.message ?? 'error').slice(0, 80));
        clearTimeout(loadTimer);
        loadTimer = setTimeout(() => !styleReady.current && fallback('timeout'), 9000);
      }
    });
    map.on('style.load', () => {
      styleReady.current = true;
      clearTimeout(loadTimer);
      localizeLabels(map);
      ensureLayers(map);
      refreshData();
      setReady(true);
    });
    map.on('zoomend', () => renderPins());
    map.on('moveend', () => renderPins());
    map.on('click', (e) => {
      const ids = mallLayerIds(map);
      if (!ids.length) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ids })[0];
      if (f?.properties?.shopId) propsRef.current.onMallShop(String(f.properties.shopId));
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      clearTimeout(loadTimer);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- our layers ----------
  function ensureLayers(map: MLMap) {
    const empty = { type: 'FeatureCollection' as const, features: [] };
    for (const s of OUR_SOURCES) if (!map.getSource(s)) map.addSource(s, { type: 'geojson', data: empty });
    const add = (l: Parameters<MLMap['addLayer']>[0]) => !map.getLayer(l.id) && map.addLayer(l);
    add({ id: 'coverage-fill', type: 'fill', source: 'coverage', paint: { 'fill-color': '#2f7cf6', 'fill-opacity': 0.035 } });
    add({ id: 'coverage-line', type: 'line', source: 'coverage', paint: { 'line-color': '#2f7cf6', 'line-opacity': 0.35, 'line-width': 1.2, 'line-dasharray': [3, 3] } });
    add({
      id: 'heat',
      type: 'heatmap',
      source: 'heat',
      maxzoom: 17,
      paint: {
        'heatmap-weight': ['get', 'w'],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 18, 15, 40],
        'heatmap-intensity': 0.9,
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.55, 16.5, 0.15],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(240,79,120,0)',
          0.3,
          'rgba(240,79,120,0.18)',
          0.7,
          'rgba(240,79,120,0.32)',
          1,
          'rgba(217,58,99,0.45)',
        ],
      },
    });
    add({ id: 'rings', type: 'line', source: 'rings', paint: { 'line-color': '#2f7cf6', 'line-opacity': 0.45, 'line-width': 1.4, 'line-dasharray': [2, 2] } });
    add({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8 } });
    add({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2f7cf6', 'line-width': 4.5, 'line-dasharray': [1, 1.6] },
    });
    (map.getSource('coverage') as GeoJSONSource).setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [coverage as [number, number][]] },
    });
  }

  function localizeLabels(map: MLMap) {
    for (const l of map.getStyle()?.layers ?? []) {
      if (l.type !== 'symbol') continue;
      const tf = map.getLayoutProperty(l.id, 'text-field');
      if (tf && JSON.stringify(tf).includes('name')) {
        try {
          map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:fa'], ['get', 'name']]);
        } catch {
          /* layer without name */
        }
      }
    }
  }

  // ---------- data → sources ----------
  function refreshData() {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    ensureLayers(map);
    const { step: st, shopId: sid } = propsRef.current;
    const u = useLocation.getState();
    const offers = visibleRef.current;
    const inMall = !!useMapStore.getState().mall;
    const showShops = st !== 'chat' && !inMall;
    (map.getSource('rings') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: showShops
        ? [500, 1000].map((r) => ({ type: 'Feature' as const, properties: { r }, geometry: { type: 'LineString' as const, coordinates: circleRing(u, r) } }))
        : [],
    });
    (map.getSource('heat') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features:
        st === 'shops'
          ? offers.map((o) => ({
              type: 'Feature' as const,
              properties: { w: 0.3 + 0.7 * o.cheapPercentile },
              geometry: { type: 'Point' as const, coordinates: [o.shop.lon, o.shop.lat] },
            }))
          : [],
    });
    const target = sid ? useShops.getState().offers.find((o) => o.shopId === sid)?.shop : null;
    (map.getSource('route') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features:
        st === 'shop' && target && !useMapStore.getState().mall
          ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: routeSync(u, target) } }]
          : [],
    });
    renderUser();
    renderLabels();
    renderPins();
  }

  function renderUser() {
    const map = mapRef.current;
    if (!map) return;
    const u = useLocation.getState();
    // in the mall schematic the entrance marker says «شما اینجایید»; hide the street-level dot
    const show = propsRef.current.step !== 'chat' && !useMapStore.getState().mall;
    if (!show) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      const el = document.createElement('div');
      el.className = 'user-dot';
      el.setAttribute('aria-label', 'موقعیت شما');
      el.title = 'شما اینجایید — برای جابه‌جایی بکشید';
      el.innerHTML = '<span class="user-dot-pulse"></span><span class="user-dot-core"></span>';
      userMarker.current = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([u.lon, u.lat]).addTo(map);
      userMarker.current.on('dragend', () => {
        const ll = userMarker.current!.getLngLat();
        useLocation.getState().set({ lat: ll.lat, lon: ll.lng, source: 'drag', name: 'نقطه انتخابی روی نقشه' });
      });
    } else userMarker.current.setLngLat([u.lon, u.lat]);
  }

  function renderLabels() {
    const map = mapRef.current;
    if (!map) return;
    for (const m of labelMarkers.current) m.remove();
    labelMarkers.current = [];
    if (propsRef.current.step === 'chat' || useMapStore.getState().mall) return;
    const u = useLocation.getState();
    const mk = (text: string, lngLat: [number, number], cls: string) => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = text;
      labelMarkers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(map));
    };
    for (const [r, t] of [
      [500, '۵۰۰ متر'],
      [1000, '۱ کیلومتر'],
    ] as const) {
      const top = circleRing(u, r, 4)[1];
      mk(t, top, 'ring-label');
    }
    const north = (coverage as [number, number][]).reduce((a, b) => (b[1] > a[1] ? b : a));
    mk('پوشش داده‌ها', north, 'coverage-label');
  }

  function pinHtml(o: RankedOffer, selected: boolean) {
    const price = formatToman(o.effectivePrice, { unit: false });
    const icon = o.verified ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M5 12l5 5L20 7"/></svg>' : '';
    const dot = o.fresh === 'checking' ? '<span class="pin-checking"></span>' : '';
    return `<div class="pin pin-${o.fresh}${o.outOfStock ? ' pin-out' : ''}${o.cheapTop20 ? ' pin-cheap' : ''}${selected ? ' pin-selected' : ''}">${dot}${icon}<span>${price}</span></div><div class="pin-tail"></div>`;
  }

  function renderPins() {
    const map = mapRef.current;
    if (!map) return;
    const { step: st, shopId: sid } = propsRef.current;
    const inMall = !!useMapStore.getState().mall;
    const offers = st === 'chat' || inMall ? [] : st === 'shop' ? offersForShop(sid) : visibleRef.current;
    const zoom = map.getZoom();
    const hl = useShops.getState().highlight?.shopId;
    // greedy pixel clustering at low zoom
    type Group = { items: RankedOffer[]; x: number; y: number };
    const groups: Group[] = [];
    const radius = zoom >= 16.5 ? 0 : 58;
    const sorted = [...offers].sort((a, b) => b.score - a.score);
    for (const o of sorted) {
      const p = map.project([o.shop.lon, o.shop.lat]);
      const g = radius ? groups.find((gr) => Math.hypot(gr.x - p.x, gr.y - p.y) < radius) : undefined;
      if (g && o.shopId !== hl && !g.items.some((i) => i.shopId === hl)) g.items.push(o);
      else groups.push({ items: [o], x: p.x, y: p.y });
    }
    const seen = new Set<string>();
    for (const g of groups) {
      const lead = g.items[0];
      const key = g.items.length > 1 ? `c:${g.items.map((i) => i.shopId).sort().join(',')}` : `s:${lead.shopId}`;
      const id = g.items.length > 1 ? key : lead.shopId;
      seen.add(id);
      const selected = lead.shopId === hl || lead.shopId === sid;
      const html =
        g.items.length > 1
          ? `<div class="cluster"><span>${toFaDigits(g.items.length)}</span><small>از ${formatToman(Math.min(...g.items.map((i) => i.effectivePrice)), { unit: false })}</small></div>`
          : pinHtml(lead, selected);
      const existing = markers.current.get(id);
      const lngLat: [number, number] =
        g.items.length > 1
          ? [g.items.reduce((s, i) => s + i.shop.lon, 0) / g.items.length, g.items.reduce((s, i) => s + i.shop.lat, 0) / g.items.length]
          : [lead.shop.lon, lead.shop.lat];
      if (existing) {
        if (existing.el.dataset.html !== html) {
          existing.el.innerHTML = html;
          existing.el.dataset.html = html;
        }
        existing.m.setLngLat(lngLat);
        existing.el.style.zIndex = selected ? '20' : lead.verified ? '5' : '1';
        continue;
      }
      const el = document.createElement('div');
      el.className = 'pin-wrap';
      el.innerHTML = html;
      el.dataset.html = html;
      el.dataset.shopId = g.items.length > 1 ? '' : lead.shopId;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', g.items.length > 1 ? `${g.items.length} فروشگاه` : lead.shop.name);
      el.dataset.testid = g.items.length > 1 ? 'map-cluster' : 'map-pin';
      el.style.zIndex = selected ? '20' : '1';
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (g.items.length > 1) {
          const b = new maplibregl.LngLatBounds();
          for (const i of g.items) b.extend([i.shop.lon, i.shop.lat]);
          map.fitBounds(b, { padding: padPx(80), maxZoom: 17.5, duration: reduced() ? 0 : 600 });
        } else propsRef.current.onPinClick(lead.shopId);
      });
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(map);
      markers.current.set(id, { m, el, key });
    }
    for (const [id, v] of markers.current)
      if (!seen.has(id)) {
        v.m.remove();
        markers.current.delete(id);
      }
  }

  function offersForShop(sid: string | null): RankedOffer[] {
    const all = visibleRef.current;
    const hit = all.find((o) => o.shopId === sid);
    if (hit) return [hit];
    return [];
  }

  function padPx(extra = 40) {
    const p = propsRef.current.padding;
    return { top: p.top + extra, bottom: p.bottom + extra, left: p.left + extra, right: p.right + extra };
  }

  // ---------- reactions ----------
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, shopId, user.lat, user.lon, mall?.status]);

  // camera on step / product / shop change
  const lastFit = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || step === 'chat' || mall) return;
    const offers = visibleRef.current;
    const u = useLocation.getState();
    const key = `${step}:${shopId}:${offers.length ? offers[0].productId : ''}:${u.lat.toFixed(4)},${u.lon.toFixed(4)}:${JSON.stringify(padding)}`;
    if (key === lastFit.current) return;
    lastFit.current = key;
    const b = new maplibregl.LngLatBounds([u.lon, u.lat], [u.lon, u.lat]);
    if (step === 'shop') {
      const t = useShops.getState().offers.find((o) => o.shopId === shopId)?.shop;
      if (t) b.extend([t.lon, t.lat]);
    } else {
      const near = [...offers].sort((a, b2) => a.distanceM - b2.distanceM).slice(0, 8);
      for (const o of near) if (haversineM(u, o.shop) < 6000) b.extend([o.shop.lon, o.shop.lat]);
    }
    const run = () =>
      map.fitBounds(b, { padding: padPx(48), maxZoom: step === 'shop' ? 16.5 : 15.5, duration: reduced() ? 0 : 900, pitch: 0, bearing: 0 });
    if (map.isStyleLoaded()) run();
    else map.once('idle', run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, shopId, visible.length > 0, user.lat, user.lon, padding.top, padding.bottom, padding.left, padding.right, mall]);

  // highlight → bounce / ensure visible
  useEffect(() => {
    if (!highlight) return;
    renderPins();
    const v = markers.current.get(highlight.shopId);
    if (v && highlight.by === 'card') {
      v.el.classList.remove('bounce');
      void v.el.offsetWidth;
      v.el.classList.add('bounce');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);

  // ---------- 3D mall ----------
  const entrance = useRef<maplibregl.Marker | null>(null);
  const savedCam = useRef<{ center: maplibregl.LngLat; zoom: number; pitch: number; bearing: number } | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mall?.status === 'ready' && mall.data) {
      const cubes = mall.cubes ?? layoutCubes(mall.data);
      if (!mall.cubes) {
        // open on the target shop's floor (its chip is selected; «همه» is one tap away)
        const t = cubes.find((c) => c.role === 'target' && c.floorKnown);
        const targetFloor = t ? t.floor : null;
        useMapStore.getState().patchMall({ cubes, floors: floorsOf(cubes), ...(mall.isolate === null && targetFloor !== null ? { isolate: targetFloor } : {}) });
      }
      const go = () => {
        savedCam.current ??= { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
        for (const l of map.getStyle()?.layers ?? [])
          if (l.type === 'fill-extrusion' && !l.id.startsWith(MALL_PREFIX)) map.setLayoutProperty(l.id, 'visibility', 'none');
        // read the live value: the auto-selected floor was patched in after this closure was created
        addMallLayers(map, cubes, useMapStore.getState().mall?.isolate ?? null);
        renderPins();
        // entrance marker on the south edge of the schematic (approximate, like the layout itself)
        entrance.current?.remove();
        const south = Math.min(...cubes.flatMap((c) => c.ring.map((p) => p[1])));
        const el = document.createElement('div');
        el.className = 'mall-entrance';
        el.innerHTML = '<span>ورودی · شما اینجایید</span>';
        entrance.current = new maplibregl.Marker({ element: el, anchor: 'top' })
          .setLngLat([mall.data!.centroid.lon, south - 0.00004])
          .addTo(map);
        map.flyTo({
          center: [mall.data!.centroid.lon, mall.data!.centroid.lat],
          zoom: 18.5,
          pitch: 60,
          bearing: -20,
          duration: reduced() ? 0 : 1200,
          padding: padPx(0),
        });
      };
      if (map.isStyleLoaded()) go();
      else map.once('idle', go);
    }
    if (!mall) {
      entrance.current?.remove();
      entrance.current = null;
    }
    if (!mall && savedCam.current) {
      removeMallLayers(map);
      for (const l of map.getStyle()?.layers ?? [])
        if (l.type === 'fill-extrusion' && !l.id.startsWith(MALL_PREFIX)) map.setLayoutProperty(l.id, 'visibility', 'visible');
      const c = savedCam.current;
      savedCam.current = null;
      map.flyTo({ center: c.center, zoom: c.zoom, pitch: 0, bearing: 0, duration: reduced() ? 0 : 1200 });
      lastFit.current = '';
      refreshData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mall?.status, mall?.complexId, !!mall]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mall?.cubes) return;
    const target = mall.cubes.find((c) => c.role === 'target');
    setIsolation(map, mall.cubes, mall.isolate, target?.floor ?? null);
  }, [mall?.isolate, mall?.cubes]);

  // pulse the target cube
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mall?.status !== 'ready' || reduced()) return;
    let raf = 0;
    const tick = (t: number) => {
      if (map.getLayer(`${MALL_PREFIX}target`)) {
        const v = 0.62 + 0.33 * (0.5 + 0.5 * Math.sin(t / 260));
        map.setPaintProperty(`${MALL_PREFIX}target`, 'fill-extrusion-opacity', mall.isolate !== null ? Math.min(v, 0.95) : v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mall?.status, mall?.isolate]);

  // maplibre adds position:relative to its container, so size it explicitly
  return <div ref={container} className="h-full w-full" data-testid="map" />;
}
