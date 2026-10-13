// ==========================================
// WORLD MAP MODULE (països, estadístiques i viatges estil Polarsteps)
// ==========================================

const GEOJSON_URL = 'data/countries.geo.json';
const HOME = { name: 'Barcelona', lat: 41.3874, lng: 2.1686 };
const CONTINENTS = [
    { id: 'europe', label: 'Europa' },
    { id: 'asia', label: 'Àsia' },
    { id: 'africa', label: 'Àfrica' },
    { id: 'north-america', label: 'Amèrica del Nord' },
    { id: 'south-america', label: 'Amèrica del Sud' },
    { id: 'oceania', label: 'Oceania' }
];
const COUNTRY_COLORS = { visited: '#27ae60', desired: '#f39c12', none: '#163a27' };

let worldMap = null;
let geoJsonLayer = null;
let countriesData = {};   // { countryName: 'visited' | 'desired' }
let countryIndex = {};    // { countryName: { props, layer } }
let trips = [];
let selectedTripId = null;
let tripRoutesLayer = null;
let tripFormCountries = [];

function initMap() {
    worldMap = L.map('world-map', {
        center: [25, 0],
        zoom: window.innerWidth < 700 ? 1 : 2,
        minZoom: 1,
        maxZoom: 6,
        worldCopyJump: true,
        maxBounds: [[-85, -200], [85, 200]],
        maxBoundsViscosity: 1.0,
        attributionControl: false
    });
    window.worldMap = worldMap;
    tripRoutesLayer = L.layerGroup().addTo(worldMap);

    initCountrySearch();

    Promise.all([loadCountriesFromDB(), loadTripsFromDB()]).then(() => {
        loadGeoJSON();
    });
}

async function loadCountriesFromDB() {
    if (!isFirebaseConfigured()) return;

    try {
        const snapshot = await db.collection('countries').get();
        snapshot.forEach(doc => {
            countriesData[doc.id] = doc.data().status;
        });
    } catch (err) {
        console.warn("Could not load countries:", err.message);
    }
}

async function loadTripsFromDB() {
    if (!isFirebaseConfigured()) return;

    try {
        const snapshot = await db.collection('trips').get();
        trips = [];
        snapshot.forEach(doc => trips.push({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.warn("Could not load trips:", err.message);
    }
}

function loadGeoJSON() {
    fetch(GEOJSON_URL)
        .then(res => res.json())
        .then(data => {
            geoJsonLayer = L.geoJSON(data, {
                style: countryStyle,
                onEachFeature: onEachCountry
            }).addTo(worldMap);

            updateMapStats();
            renderTrips();
        })
        .catch(err => {
            console.error("Error loading GeoJSON:", err);
            showToast("Error carregant el mapa", "error");
        });
}

// ---- Helpers ----
function countryLabel(name) {
    return countryIndex[name] ? countryIndex[name].props.ca : name;
}

function flagHtml(name, cls = 'wm-flag') {
    const iso = countryIndex[name] && countryIndex[name].props.iso2;
    if (!iso) return `<span class="${cls} wm-flag-empty"></span>`;
    return `<img class="${cls}" src="https://flagcdn.com/w40/${iso.toLowerCase()}.png" alt="" loading="lazy">`;
}

function distanceKm(lat1, lng1, lat2, lng2) {
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function normalizeText(text) {
    return (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseDay(str) {
    const [y, m, d] = (str || '').split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
}

function tripDays(trip) {
    const start = parseDay(trip.start);
    const end = parseDay(trip.end) || start;
    if (!start) return 0;
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function formatTripDates(trip) {
    const start = parseDay(trip.start);
    const end = parseDay(trip.end);
    if (!start) return '';
    const fmt = new Intl.DateTimeFormat('ca', { day: 'numeric', month: 'short' });
    const year = new Intl.DateTimeFormat('ca', { year: 'numeric' });
    if (!end || +end === +start) return `${fmt.format(start)} ${year.format(start)}`;
    if (start.getFullYear() === end.getFullYear()) return `${fmt.format(start)} – ${fmt.format(end)} ${year.format(end)}`;
    return `${fmt.format(start)} ${year.format(start)} – ${fmt.format(end)} ${year.format(end)}`;
}

// ---- Countries ----
function countryStyle(feature) {
    const status = countriesData[feature.properties.name] || 'none';
    return {
        fillColor: COUNTRY_COLORS[status],
        fillOpacity: status === 'none' ? 0.6 : 0.75,
        color: '#2c6045',
        weight: 1,
        opacity: 0.8
    };
}

function onEachCountry(feature, layer) {
    const name = feature.properties.name;
    countryIndex[name] = { props: feature.properties, layer };

    layer.on({
        mouseover: (e) => {
            e.target.setStyle({ weight: 2, color: '#e8f8f5', fillOpacity: 0.85 });
            e.target.bringToFront();
        },
        mouseout: (e) => {
            geoJsonLayer.resetStyle(e.target);
        },
        click: (e) => {
            showCountryPopup(name, e.latlng);
        }
    });

    layer.bindTooltip(feature.properties.ca, {
        sticky: true,
        className: 'country-tooltip'
    });
}

function showCountryPopup(name, latlng) {
    const status = countriesData[name] || 'none';
    const safeName = escapeAttr(JSON.stringify(name));
    const countryTrips = trips.filter(t => (t.countries || []).includes(name));

    const popupContent = `
        <div class="country-popup">
            <h4>${flagHtml(name)} ${escapeHtml(countryLabel(name))}</h4>
            ${countryTrips.length ? `
                <div class="popup-trips">
                    ${countryTrips.map(t => `<button onclick="selectTrip('${t.id}')"><i class="fas fa-route"></i> ${escapeHtml(t.title)}</button>`).join('')}
                </div>` : ''}
            <div class="popup-btns">
                <button class="btn-visited ${status === 'visited' ? 'is-on' : ''}" onclick="setCountryStatus(${safeName}, 'visited')">
                    <i class="fas fa-check"></i> Visitat
                </button>
                <button class="btn-desired ${status === 'desired' ? 'is-on' : ''}" onclick="setCountryStatus(${safeName}, 'desired')">
                    <i class="fas fa-heart"></i> Desitjat
                </button>
                ${status !== 'none' ? `
                <button class="btn-remove" onclick="setCountryStatus(${safeName}, 'none')">
                    <i class="fas fa-times"></i> Treure
                </button>` : ''}
            </div>
        </div>
    `;

    L.popup({ closeButton: true, className: 'country-popup-wrap' })
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(worldMap);
}

async function setCountryStatus(name, status, { quiet = false } = {}) {
    if (!quiet) worldMap.closePopup();

    if (status === 'none') {
        delete countriesData[name];
    } else {
        countriesData[name] = status;
    }

    if (countryIndex[name]) geoJsonLayer.resetStyle(countryIndex[name].layer);
    updateMapStats();

    if (!isFirebaseConfigured()) return;
    try {
        if (status === 'none') {
            await db.collection('countries').doc(name).delete();
        } else {
            await db.collection('countries').doc(name).set({
                status: status,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        if (!quiet) {
            const label = status === 'visited' ? 'visitat' : status === 'desired' ? 'desitjat' : 'tret de la llista';
            showToast(`${countryLabel(name)}: ${label}`, 'success');
        }
    } catch (err) {
        console.error("Error saving country:", err);
        showToast("Error desant el país", "error");
    }
}

function focusCountry(name) {
    const entry = countryIndex[name];
    if (!entry) return;
    worldMap.flyToBounds(entry.layer.getBounds(), { padding: [30, 30], maxZoom: 5, duration: 0.8 });
    worldMap.once('moveend', () => showCountryPopup(name, [entry.props.lat, entry.props.lng]));
}

// ---- Search ----
function searchCountries(query, limit = 6) {
    const q = normalizeText(query.trim());
    if (!q) return [];
    return Object.values(countryIndex)
        .map(({ props }) => {
            const ca = normalizeText(props.ca);
            const en = normalizeText(props.name);
            const score = ca.startsWith(q) ? 0 : en.startsWith(q) ? 1 : ca.includes(q) ? 2 : en.includes(q) ? 3 : -1;
            return { props, score };
        })
        .filter(r => r.score >= 0)
        .sort((a, b) => a.score - b.score || a.props.ca.localeCompare(b.props.ca, 'ca'))
        .slice(0, limit)
        .map(r => r.props);
}

function initCountrySearch() {
    const input = document.getElementById('wmSearch');
    const results = document.getElementById('wmResults');

    const pick = (name) => {
        input.value = '';
        results.innerHTML = '';
        input.blur();
        document.getElementById('world-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
        focusCountry(name);
    };

    input.addEventListener('input', () => {
        const found = searchCountries(input.value);
        results.innerHTML = found.map(p => {
            const status = countriesData[p.name];
            const badge = status === 'visited' ? '<i class="fas fa-check wm-res-visited"></i>'
                : status === 'desired' ? '<i class="fas fa-heart wm-res-desired"></i>' : '';
            return `<button type="button" class="wm-result" data-name="${escapeAttr(p.name)}">
                ${flagHtml(p.name)}<span>${escapeHtml(p.ca)}</span>${badge}
            </button>`;
        }).join('') || (input.value.trim() ? '<div class="wm-noresult">Cap país amb aquest nom</div>' : '');
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const first = results.querySelector('.wm-result');
            if (first) pick(first.dataset.name);
        } else if (e.key === 'Escape') {
            input.value = '';
            results.innerHTML = '';
        }
    });

    results.addEventListener('click', (e) => {
        const btn = e.target.closest('.wm-result');
        if (btn) pick(btn.dataset.name);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.wm-search')) results.innerHTML = '';
    });
}

// ---- Stats ----
function updateMapStats() {
    const all = Object.values(countryIndex).map(c => c.props).filter(p => p.continent !== 'antarctica');
    const visitedNames = Object.keys(countriesData).filter(n => countriesData[n] === 'visited');
    const visited = visitedNames.map(n => countryIndex[n] && countryIndex[n].props).filter(Boolean);
    const desired = Object.values(countriesData).filter(s => s === 'desired').length;

    const total = all.length || 1;
    const pct = (visited.length / total) * 100;
    const continentsVisited = new Set(visited.map(p => p.continent).filter(c => c !== 'antarctica'));

    let farthest = null;
    visited.forEach(p => {
        const km = distanceKm(HOME.lat, HOME.lng, p.lat, p.lng);
        if (!farthest || km > farthest.km) farthest = { name: p.name, km };
    });

    const days = trips.reduce((sum, t) => sum + tripDays(t), 0);
    const ring = 2 * Math.PI * 34;

    document.getElementById('mapStats').innerHTML = `
        <div class="wm-stat-main">
            <svg class="wm-ring" viewBox="0 0 80 80" aria-hidden="true">
                <circle cx="40" cy="40" r="34" class="wm-ring-bg"></circle>
                <circle cx="40" cy="40" r="34" class="wm-ring-fg"
                    stroke-dasharray="${ring}" stroke-dashoffset="${ring * (1 - Math.min(1, pct / 100))}"></circle>
            </svg>
            <div>
                <div class="wm-big">${pct.toFixed(1).replace('.', ',')}<small>%</small></div>
                <div class="wm-label">del món</div>
            </div>
        </div>
        <div class="wm-stat"><span class="wm-num">${visited.length}</span><span class="wm-label">països visitats</span></div>
        <div class="wm-stat"><span class="wm-num">${continentsVisited.size}<small>/6</small></span><span class="wm-label">continents</span></div>
        <div class="wm-stat"><span class="wm-num">${trips.length}</span><span class="wm-label">${trips.length === 1 ? 'viatge' : 'viatges'} · ${days} dies</span></div>
        <div class="wm-stat"><span class="wm-num wm-desired">${desired}</span><span class="wm-label">a la llista de desitjos</span></div>
        <div class="wm-stat wm-stat-wide">
            <span class="wm-label">El més lluny de casa</span>
            ${farthest
                ? `<span class="wm-far">${flagHtml(farthest.name)} ${escapeHtml(countryLabel(farthest.name))} <b>${Math.round(farthest.km).toLocaleString('ca')} km</b></span>`
                : '<span class="wm-far">Encara cap</span>'}
        </div>
        <div class="wm-continents">
            ${CONTINENTS.map(c => {
                const inC = all.filter(p => p.continent === c.id).length;
                const vis = visited.filter(p => p.continent === c.id).length;
                return `<div class="wm-cont">
                    <div class="wm-cont-top"><span>${c.label}</span><span>${vis}/${inC}</span></div>
                    <div class="wm-bar"><span style="width:${inC ? (vis / inC) * 100 : 0}%"></span></div>
                </div>`;
            }).join('')}
        </div>
    `;
}

// ---- Trips (Polarsteps) ----
function sortedTrips() {
    return [...trips].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}

function renderTrips() {
    const container = document.getElementById('wmTrips');
    const list = sortedTrips();
    document.getElementById('wmTripsCount').textContent = list.length ? `${list.length} ${list.length === 1 ? 'viatge' : 'viatges'}` : '';

    const addCard = `
        <button class="wm-trip wm-trip-add" onclick="openTripModal()">
            <i class="fas fa-plus"></i>
            <span>${list.length ? 'Nou viatge' : 'Afegiu el primer viatge'}</span>
        </button>`;

    container.innerHTML = list.map((t, i) => {
        const countries = t.countries || [];
        return `
        <article class="wm-trip ${t.id === selectedTripId ? 'is-selected' : ''}" onclick="selectTrip('${t.id}')">
            <div class="wm-trip-step">${String(i + 1).padStart(2, '0')}</div>
            <div class="wm-trip-flags">${countries.slice(0, 4).map(n => flagHtml(n)).join('')}${countries.length > 4 ? `<span class="wm-more">+${countries.length - 4}</span>` : ''}</div>
            <h4>${escapeHtml(t.title)}</h4>
            <div class="wm-trip-dates">${formatTripDates(t)}</div>
            <div class="wm-trip-meta">${tripDays(t)} ${tripDays(t) === 1 ? 'dia' : 'dies'} · ${countries.map(n => escapeHtml(countryLabel(n))).join(', ')}</div>
            <button class="wm-trip-edit" onclick="event.stopPropagation(); openTripModal('${t.id}')" aria-label="Editar viatge"><i class="fas fa-pen"></i></button>
        </article>`;
    }).join('') + addCard;

    scrollTripsToLatest();
}

// Comença pel viatge més recent, com a Polarsteps
function scrollTripsToLatest() {
    const container = document.getElementById('wmTrips');
    requestAnimationFrame(() => {
        const cards = container.querySelectorAll('.wm-trip:not(.wm-trip-add)');
        const last = cards[cards.length - 1];
        if (last) container.scrollLeft = last.offsetLeft;
    });
}

function arcPoints(from, to, segments = 48) {
    // Corba suau entre dos punts (Bézier quadràtica desplaçada cap amunt)
    const [lat1, lng1] = from;
    const [lat2, lng2] = to;
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    const dist = Math.hypot(lat2 - lat1, lng2 - lng1);
    const ctrl = [midLat + dist * 0.25, midLng];
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        pts.push([a * lat1 + b * ctrl[0] + c * lat2, a * lng1 + b * ctrl[1] + c * lng2]);
    }
    return pts;
}

function selectTrip(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    selectedTripId = id;
    worldMap.closePopup();
    tripRoutesLayer.clearLayers();

    const countries = (trip.countries || []).filter(n => countryIndex[n]);
    const bounds = L.latLngBounds([[HOME.lat, HOME.lng]]);

    L.circleMarker([HOME.lat, HOME.lng], {
        radius: 5, color: '#e8f8f5', weight: 2, fillColor: '#06150d', fillOpacity: 1
    }).bindTooltip('Casa', { className: 'country-tooltip' }).addTo(tripRoutesLayer);

    let prev = [HOME.lat, HOME.lng];
    countries.forEach((name, i) => {
        const p = countryIndex[name].props;
        const point = [p.lat, p.lng];
        L.polyline(arcPoints(prev, point), {
            color: '#7dcea0', weight: 2, dashArray: '6 8', className: 'wm-route'
        }).addTo(tripRoutesLayer);
        L.marker(point, {
            icon: L.divIcon({ className: 'wm-step-anchor', html: `<div class="wm-step">${i + 1}</div>`, iconSize: [0, 0] })
        }).addTo(tripRoutesLayer);
        bounds.extend(countryIndex[name].layer.getBounds());
        prev = point;
    });

    worldMap.flyToBounds(bounds, { padding: [40, 40], maxZoom: 5, duration: 0.9 });
    renderTrips();
    document.getElementById('world-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---- Trip form ----
function openTripModal(editId = null) {
    const trip = editId ? trips.find(t => t.id === editId) : null;
    const isEdit = !!trip;
    tripFormCountries = isEdit ? [...(trip.countries || [])] : [];

    openModal(`
        <h3>${isEdit ? 'Editar viatge' : 'Nou viatge'}</h3>
        <form onsubmit="saveTrip(event, '${editId || ''}')">
            <div class="form-group">
                <label for="t-title">Nom del viatge *</label>
                <input type="text" id="t-title" placeholder="Ex: Escapada a Roma" value="${isEdit ? escapeAttr(trip.title) : ''}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="t-start">Inici *</label>
                    <input type="date" id="t-start" value="${isEdit ? trip.start || '' : ''}" required>
                </div>
                <div class="form-group">
                    <label for="t-end">Final</label>
                    <input type="date" id="t-end" value="${isEdit ? trip.end || '' : ''}">
                </div>
            </div>
            <div class="form-group">
                <label for="t-country">Països *</label>
                <div class="wm-chips" id="tChips"></div>
                <div class="wm-search wm-search-inline">
                    <i class="fas fa-search"></i>
                    <input type="text" id="t-country" placeholder="Afegeix un país..." autocomplete="off">
                    <div class="wm-results" id="tResults"></div>
                </div>
            </div>
            <div class="form-group">
                <label for="t-comment">Records</label>
                <textarea id="t-comment" placeholder="Què en recordem?">${isEdit ? escapeHtml(trip.comment || '') : ''}</textarea>
            </div>
            <div class="form-actions">
                ${isEdit ? `<button type="button" class="btn btn-ghost rdetail-delete" onclick="deleteTrip('${editId}')"><i class="fas fa-trash-alt"></i></button>` : ''}
                <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel·lar</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? 'Guardar' : 'Afegir'}</button>
            </div>
        </form>
    `, 'sheet');

    renderTripChips();
    const input = document.getElementById('t-country');
    const results = document.getElementById('tResults');
    const add = (name) => {
        if (!tripFormCountries.includes(name)) tripFormCountries.push(name);
        input.value = '';
        results.innerHTML = '';
        renderTripChips();
        input.focus();
    };
    input.addEventListener('input', () => {
        results.innerHTML = searchCountries(input.value, 5)
            .filter(p => !tripFormCountries.includes(p.name))
            .map(p => `<button type="button" class="wm-result" data-name="${escapeAttr(p.name)}">${flagHtml(p.name)}<span>${escapeHtml(p.ca)}</span></button>`)
            .join('');
    });
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const first = results.querySelector('.wm-result');
        if (first) add(first.dataset.name);
    });
    results.addEventListener('click', (e) => {
        const btn = e.target.closest('.wm-result');
        if (btn) add(btn.dataset.name);
    });
}

function renderTripChips() {
    document.getElementById('tChips').innerHTML = tripFormCountries.map((n, i) => `
        <span class="wm-chip">${flagHtml(n)} ${escapeHtml(countryLabel(n))}
            <button type="button" onclick="removeTripCountry(${i})" aria-label="Treure"><i class="fas fa-times"></i></button>
        </span>`).join('');
}

function removeTripCountry(i) {
    tripFormCountries.splice(i, 1);
    renderTripChips();
}

async function saveTrip(e, editId) {
    e.preventDefault();
    const title = document.getElementById('t-title').value.trim();
    const start = document.getElementById('t-start').value;
    let end = document.getElementById('t-end').value;
    const comment = document.getElementById('t-comment').value.trim();

    if (!title || !start) return;
    if (!tripFormCountries.length) {
        showToast("Afegeix almenys un país", "error");
        return;
    }
    if (end && end < start) end = start;

    const data = {
        title,
        start,
        end: end || start,
        countries: [...tripFormCountries],
        comment,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    closeModal();
    showLoading();
    try {
        if (editId) {
            await db.collection('trips').doc(editId).update(data);
            const idx = trips.findIndex(t => t.id === editId);
            if (idx !== -1) trips[idx] = { ...trips[idx], ...data };
            showToast("Viatge actualitzat!", "success");
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const ref = await db.collection('trips').add(data);
            trips.push({ id: ref.id, ...data });
            editId = ref.id;
            showToast("Viatge afegit!", "success");
        }

        // Si el viatge ja ha començat, els seus països queden com a visitats
        if (parseDay(start) <= new Date()) {
            for (const name of data.countries) {
                if (countriesData[name] !== 'visited') await setCountryStatus(name, 'visited', { quiet: true });
            }
        }

        updateMapStats();
        selectTrip(editId);
    } catch (err) {
        console.error("Error saving trip:", err);
        showToast("Error desant el viatge", "error");
    } finally {
        hideLoading();
    }
}

async function deleteTrip(id) {
    if (!confirm("Segur que vols eliminar aquest viatge?")) return;
    closeModal();
    showLoading();
    try {
        await db.collection('trips').doc(id).delete();
        trips = trips.filter(t => t.id !== id);
        if (selectedTripId === id) {
            selectedTripId = null;
            tripRoutesLayer.clearLayers();
        }
        renderTrips();
        updateMapStats();
        showToast("Viatge eliminat", "success");
    } catch (err) {
        console.error("Error deleting trip:", err);
        showToast("Error eliminant el viatge", "error");
    } finally {
        hideLoading();
    }
}
