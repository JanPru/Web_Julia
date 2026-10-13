// ==========================================
// RESTAURANTS MODULE (estil TheFork: llista + mapa)
// ==========================================

let restaurants = [];

const R_DEFAULT_CENTER = [41.3874, 2.1686]; // Barcelona
const R_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const R_TILES_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const R_CUISINES = [
    'Mediterrània', 'Catalana', 'Tapes', 'Italiana', 'Pizza', 'Japonesa', 'Xinesa',
    'Asiàtica', 'Coreana', 'Tailandesa', 'Índia', 'Mexicana', 'Peruana', 'Americana',
    'Hamburgueses', 'Brunch', 'Marisc', 'Grega', 'Libanesa', 'Vegetariana', 'Postres'
];

let rFilters = { q: '', status: 'all', minRating: 0, price: 0, cuisine: '' };
let rSort = 'recent';
let rView = 'list';
let rSelectedId = null;
let rUserPos = null;

let rMap = null;
let rMarkersLayer = null;
let rUserMarker = null;
let rDetailMap = null;

// Form state
let rFormMap = null;
let rFormMarker = null;
let rFormCoords = null;
let rFormPhoto = undefined;      // undefined = sense canvis, string = nova foto
let rFormPhotoRemoved = false;

async function initRestaurants() {
    if (!isFirebaseConfigured()) return;

    const search = document.getElementById('rSearch');
    search.addEventListener('input', () => {
        rFilters.q = search.value;
        renderRestaurants();
    });
    document.getElementById('rSort').addEventListener('change', (e) => setRestaurantSort(e.target.value));
    window.addEventListener('resize', sizeRestaurantMap);

    try {
        const snapshot = await db.collection('restaurants').orderBy('createdAt', 'desc').get();
        restaurants = [];
        snapshot.forEach(doc => {
            restaurants.push({ id: doc.id, ...doc.data() });
        });
        renderRestaurants();
    } catch (err) {
        console.error("Error loading restaurants:", err);
    }
}

// ---- Helpers ----
function rStatus(r) {
    return r.status === 'wishlist' ? 'wishlist' : 'visited';
}

function rHasCoords(r) {
    return typeof r.lat === 'number' && typeof r.lng === 'number';
}

function rPrice(n) {
    return n ? '€'.repeat(n) : '';
}

function rNormalize(text) {
    return (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function rTime(ts) {
    return ts && ts.toMillis ? ts.toMillis() : Date.now();
}

function rDistanceKm(a, b) {
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function rDistanceLabel(r) {
    if (!rUserPos || !rHasCoords(r)) return '';
    const km = rDistanceKm(rUserPos, [r.lat, r.lng]);
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}

function rMetaLine(r) {
    return [r.cuisine ? escapeHtml(r.cuisine) : '', rPrice(r.price)].filter(Boolean).join(' · ');
}

function rRatingBadge(r) {
    if (rStatus(r) !== 'visited' || !r.rating) return '';
    const tier = r.rating >= 4 ? 'top' : r.rating === 3 ? 'mid' : 'low';
    return `<span class="rbadge ${tier}">${r.rating}<small>/5</small></span>`;
}

function rPhotoHtml(r, cls) {
    if (r.photo) return `<img class="${cls}" src="${r.photo}" alt="${escapeAttr(r.name)}" loading="lazy">`;
    return `<div class="${cls} rphoto-placeholder"><i class="fas fa-utensils"></i></div>`;
}

function rDirectionsUrl(r) {
    const query = r.location ? `${r.name} ${r.location}` : `${r.lat},${r.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getUserPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('no-geolocation'));
        navigator.geolocation.getCurrentPosition(
            pos => {
                rUserPos = [pos.coords.latitude, pos.coords.longitude];
                resolve(rUserPos);
            },
            reject,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    });
}

// ---- Filtering & sorting ----
function getFilteredRestaurants() {
    const q = rNormalize(rFilters.q.trim());
    const list = restaurants.filter(r => {
        if (rFilters.status !== 'all' && rStatus(r) !== rFilters.status) return false;
        if (rFilters.minRating && (rStatus(r) !== 'visited' || (r.rating || 0) < rFilters.minRating)) return false;
        if (rFilters.price && r.price !== rFilters.price) return false;
        if (rFilters.cuisine && r.cuisine !== rFilters.cuisine) return false;
        if (q && !rNormalize([r.name, r.cuisine, r.location, r.comment].join(' ')).includes(q)) return false;
        return true;
    });

    if (rSort === 'rating') {
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (rSort === 'name') {
        list.sort((a, b) => a.name.localeCompare(b.name, 'ca'));
    } else if (rSort === 'near' && rUserPos) {
        const dist = r => rHasCoords(r) ? rDistanceKm(rUserPos, [r.lat, r.lng]) : Infinity;
        list.sort((a, b) => dist(a) - dist(b));
    } else {
        list.sort((a, b) => rTime(b.createdAt) - rTime(a.createdAt));
    }
    return list;
}

async function setRestaurantSort(value) {
    if (value === 'near' && !rUserPos) {
        try {
            await getUserPosition();
        } catch {
            showToast("No s'ha pogut obtenir la teva ubicació", "error");
            document.getElementById('rSort').value = rSort;
            return;
        }
    }
    rSort = value;
    renderRestaurants();
}

function setRestaurantFilter(key, value) {
    rFilters[key] = rFilters[key] === value && key !== 'status' ? (typeof value === 'number' ? 0 : '') : value;
    renderRestaurants();
}

function clearRestaurantFilters() {
    rFilters = { q: '', status: 'all', minRating: 0, price: 0, cuisine: '' };
    document.getElementById('rSearch').value = '';
    renderRestaurants();
}

// ---- Rendering ----
function renderRestaurantChips() {
    const chip = (label, active, onclick) =>
        `<button class="rchip ${active ? 'active' : ''}" onclick="${onclick}">${label}</button>`;

    const cuisines = [...new Set(restaurants.map(r => r.cuisine).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ca'));

    document.getElementById('rChips').innerHTML = [
        chip('Tots', rFilters.status === 'all', "setRestaurantFilter('status','all')"),
        chip('<i class="fas fa-check"></i> Hi hem anat', rFilters.status === 'visited', "setRestaurantFilter('status','visited')"),
        chip('<i class="fas fa-heart"></i> Volem anar-hi', rFilters.status === 'wishlist', "setRestaurantFilter('status','wishlist')"),
        '<span class="rchip-sep"></span>',
        chip('<i class="fas fa-star"></i> 4+', rFilters.minRating === 4, "setRestaurantFilter('minRating',4)"),
        ...[1, 2, 3, 4].map(p => chip(rPrice(p), rFilters.price === p, `setRestaurantFilter('price',${p})`)),
        cuisines.length ? '<span class="rchip-sep"></span>' : '',
        ...cuisines.map(c => chip(escapeHtml(c), rFilters.cuisine === c, `setRestaurantFilter('cuisine', ${escapeAttr(JSON.stringify(c))})`))
    ].join('');
}

function renderRestaurants() {
    const container = document.getElementById('restaurants-list');
    const emptyState = document.getElementById('restaurants-empty');

    renderRestaurantChips();
    if (rMap) renderRestaurantMarkers(false);

    if (restaurants.length === 0) {
        document.getElementById('rCount').textContent = '';
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = '';
        return;
    }

    const list = getFilteredRestaurants();
    document.getElementById('rCount').textContent =
        `${list.length} restaurant${list.length === 1 ? '' : 's'}`;

    if (list.length === 0) {
        container.innerHTML = `
            <div class="rlist-empty">
                <i class="fas fa-search"></i>
                <p>Cap restaurant amb aquests filtres</p>
                <button class="btn btn-ghost" onclick="clearRestaurantFilters()">Treure filtres</button>
            </div>`;
        return;
    }

    container.innerHTML = list.map(r => {
        const dist = rDistanceLabel(r);
        return `
        <article class="rcard" onclick="openRestaurantDetail('${r.id}')">
            <div class="rcard-media ${r.photo ? '' : 'no-photo'}">
                ${rPhotoHtml(r, 'rcard-photo')}
                ${rStatus(r) === 'wishlist' ? '<span class="rcard-tag"><i class="fas fa-heart"></i> Volem anar-hi</span>' : ''}
            </div>
            <div class="rcard-body">
                <div class="rcard-top">
                    <h3 class="rcard-name">${escapeHtml(r.name)}</h3>
                    ${rRatingBadge(r)}
                </div>
                ${rMetaLine(r) ? `<div class="rcard-meta">${rMetaLine(r)}</div>` : ''}
                ${r.location || dist ? `
                    <div class="rcard-address">
                        <i class="fas fa-location-dot"></i>
                        <span>${escapeHtml(r.location || '')}</span>
                        ${dist ? `<span class="rcard-dist">${dist}</span>` : ''}
                    </div>` : ''}
                ${r.comment ? `<p class="rcard-comment">"${escapeHtml(r.comment)}"</p>` : ''}
            </div>
        </article>`;
    }).join('');
}

// ---- List / map view ----
function toggleRestaurantView() {
    setRestaurantView(rView === 'list' ? 'map' : 'list');
}

function setRestaurantView(view) {
    rView = view;
    const isMap = view === 'map';
    document.getElementById('restaurants').classList.toggle('map-mode', isMap);
    document.getElementById('rViewToggle').innerHTML = isMap
        ? '<i class="fas fa-list"></i> Llista'
        : '<i class="fas fa-map"></i> Mapa';
    hideRestaurantMapCard();

    if (isMap) {
        window.scrollTo(0, 0);
        ensureRestaurantMap();
        sizeRestaurantMap();
        setTimeout(() => {
            rMap.invalidateSize();
            renderRestaurantMarkers(true);
        }, 50);
    }
}

function sizeRestaurantMap() {
    if (rView !== 'map') return;
    const wrap = document.getElementById('rMapWrap');
    const top = wrap.getBoundingClientRect().top;
    wrap.style.height = Math.max(320, window.innerHeight - top - 12) + 'px';
    if (rMap) rMap.invalidateSize();
}

function ensureRestaurantMap() {
    if (rMap) return;
    rMap = L.map('restaurants-map', { zoomControl: false }).setView(R_DEFAULT_CENTER, 12);
    L.control.zoom({ position: 'topright' }).addTo(rMap);
    L.tileLayer(R_TILES, {
        attribution: R_TILES_ATTRIBUTION,
        maxZoom: 19
    }).addTo(rMap);
    rMarkersLayer = L.layerGroup().addTo(rMap);
    rMap.on('click', () => {
        if (!rSelectedId) return;
        hideRestaurantMapCard();
        renderRestaurantMarkers(false);
    });
}

function rPinIcon(r) {
    const visited = rStatus(r) === 'visited';
    const label = visited
        ? (r.rating ? `<i class="fas fa-star"></i> ${r.rating}` : '<i class="fas fa-utensils"></i>')
        : '<i class="fas fa-heart"></i>';
    return L.divIcon({
        className: 'rpin-anchor',
        html: `<div class="rpin ${visited ? 'visited' : 'wishlist'} ${rSelectedId && r.id === rSelectedId ? 'selected' : ''}">${label}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
    });
}

function renderRestaurantMarkers(fit) {
    if (!rMap) return;
    rMarkersLayer.clearLayers();

    const list = getFilteredRestaurants();
    const located = list.filter(rHasCoords);

    located.forEach(r => {
        const marker = L.marker([r.lat, r.lng], {
            icon: rPinIcon(r),
            zIndexOffset: r.id === rSelectedId ? 1000 : 0
        });
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            selectRestaurantOnMap(r.id);
        });
        rMarkersLayer.addLayer(marker);
    });

    const missing = list.length - located.length;
    const note = document.getElementById('rMapNote');
    note.textContent = missing ? `${missing} sense ubicació` : '';
    note.classList.toggle('rf-hidden', !missing);

    if (fit) {
        if (located.length === 1) {
            rMap.setView([located[0].lat, located[0].lng], 15);
        } else if (located.length > 1) {
            rMap.fitBounds(L.latLngBounds(located.map(r => [r.lat, r.lng])), { padding: [50, 50], maxZoom: 15 });
        }
    }
}

function selectRestaurantOnMap(id) {
    const r = restaurants.find(x => x.id === id);
    if (!r) return;
    rSelectedId = id;
    renderRestaurantMarkers(false);
    rMap.panTo([r.lat, r.lng]);

    const card = document.getElementById('rMapCard');
    card.innerHTML = `
        <div class="rmapcard" onclick="openRestaurantDetail('${r.id}')">
            ${rPhotoHtml(r, 'rmapcard-photo')}
            <div class="rmapcard-body">
                <div class="rcard-top">
                    <h3 class="rcard-name">${escapeHtml(r.name)}</h3>
                    ${rRatingBadge(r)}
                </div>
                ${rMetaLine(r) ? `<div class="rcard-meta">${rMetaLine(r)}</div>` : ''}
                ${r.location ? `<div class="rcard-address"><i class="fas fa-location-dot"></i><span>${escapeHtml(r.location)}</span></div>` : ''}
                ${rStatus(r) === 'wishlist' ? '<span class="rmapcard-tag"><i class="fas fa-heart"></i> Volem anar-hi</span>' : ''}
            </div>
        </div>`;
    card.classList.remove('rf-hidden');
}

function hideRestaurantMapCard() {
    rSelectedId = null;
    document.getElementById('rMapCard').classList.add('rf-hidden');
}

async function locateMeOnRestaurantMap() {
    try {
        const pos = await getUserPosition();
        if (rUserMarker) rUserMarker.remove();
        rUserMarker = L.circleMarker(pos, {
            radius: 8, color: '#fff', weight: 3, fillColor: '#2e86de', fillOpacity: 1
        }).addTo(rMap);
        rMap.setView(pos, 15);
        renderRestaurants();
    } catch {
        showToast("No s'ha pogut obtenir la teva ubicació", "error");
    }
}

// ---- Detail sheet ----
function openRestaurantDetail(id) {
    const r = restaurants.find(x => x.id === id);
    if (!r) return;
    const visited = rStatus(r) === 'visited';

    const content = `
        <div class="rdetail">
            <div class="rdetail-media">${rPhotoHtml(r, 'rdetail-photo')}</div>
            <div class="rdetail-head">
                <div>
                    <h3>${escapeHtml(r.name)}</h3>
                    ${rMetaLine(r) ? `<div class="rcard-meta">${rMetaLine(r)}</div>` : ''}
                </div>
                ${rRatingBadge(r)}
            </div>
            <div class="rdetail-status ${visited ? 'visited' : 'wishlist'}">
                ${visited ? '<i class="fas fa-check"></i> Hi hem anat' : '<i class="fas fa-heart"></i> Volem anar-hi'}
            </div>
            ${visited && r.rating ? renderStars(r.rating) : ''}
            ${r.location ? `<div class="rcard-address"><i class="fas fa-location-dot"></i><span>${escapeHtml(r.location)}</span>${rDistanceLabel(r) ? `<span class="rcard-dist">${rDistanceLabel(r)}</span>` : ''}</div>` : ''}
            ${r.comment ? `<p class="rdetail-comment">"${escapeHtml(r.comment)}"</p>` : ''}
            ${rHasCoords(r) ? '<div id="rDetailMap" class="rdetail-map"></div>' : ''}
            <div class="rdetail-actions">
                ${rHasCoords(r) || r.location ? `<a class="btn btn-primary" href="${rDirectionsUrl(r)}" target="_blank" rel="noopener"><i class="fas fa-diamond-turn-right"></i> Com arribar</a>` : ''}
                ${!visited ? `<button class="btn btn-secondary" onclick="openRestaurantModal('${r.id}', 'visited')"><i class="fas fa-check"></i> Ja hi hem anat!</button>` : ''}
                <div class="rdetail-secondary">
                    <button class="btn btn-ghost" onclick="openRestaurantModal('${r.id}')"><i class="fas fa-pen"></i> Editar</button>
                    <button class="btn btn-ghost rdetail-delete" onclick="deleteRestaurant('${r.id}')"><i class="fas fa-trash-alt"></i> Eliminar</button>
                </div>
            </div>
        </div>`;

    openModal(content, 'sheet');

    if (rDetailMap) { rDetailMap.remove(); rDetailMap = null; }
    if (rHasCoords(r)) {
        setTimeout(() => {
            rDetailMap = L.map('rDetailMap', {
                zoomControl: false, dragging: false, scrollWheelZoom: false,
                doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false
            }).setView([r.lat, r.lng], 16);
            L.tileLayer(R_TILES, {
                attribution: R_TILES_ATTRIBUTION, maxZoom: 19
            }).addTo(rDetailMap);
            L.marker([r.lat, r.lng], { icon: rPinIcon({ ...r, id: null }), interactive: false }).addTo(rDetailMap);
        }, 50);
    }
}

// ---- Add / edit form ----
function openRestaurantModal(editId = null, forceStatus = null) {
    const restaurant = editId ? restaurants.find(r => r.id === editId) : null;
    const isEdit = !!restaurant;
    const status = forceStatus || (isEdit ? rStatus(restaurant) : 'visited');
    const price = isEdit ? (restaurant.price || 0) : 0;

    rFormCoords = isEdit && rHasCoords(restaurant) ? [restaurant.lat, restaurant.lng] : null;
    rFormPhoto = undefined;
    rFormPhotoRemoved = false;

    const cuisineOptions = [...new Set([...R_CUISINES, ...restaurants.map(r => r.cuisine).filter(Boolean)])]
        .map(c => `<option value="${escapeAttr(c)}">`).join('');

    const content = `
        <h3>${isEdit ? 'Editar Restaurant' : 'Nou Restaurant'}</h3>
        <form onsubmit="saveRestaurant(event, '${editId || ''}')">
            <div class="form-group">
                <label for="r-name">Restaurant *</label>
                <input type="text" id="r-name" placeholder="Ex: El cos del Jan" value="${isEdit ? escapeAttr(restaurant.name) : ''}" required>
            </div>
            <div class="form-group">
                <label>Estat</label>
                <div class="segmented" id="r-status" data-value="${status}">
                    <button type="button" data-value="visited" class="${status === 'visited' ? 'active' : ''}" onclick="setRestaurantStatusInput('visited')"><i class="fas fa-check"></i> Hi hem anat</button>
                    <button type="button" data-value="wishlist" class="${status === 'wishlist' ? 'active' : ''}" onclick="setRestaurantStatusInput('wishlist')"><i class="fas fa-heart"></i> Volem anar-hi</button>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="r-cuisine">Tipus de cuina</label>
                    <input type="text" id="r-cuisine" list="rCuisineList" placeholder="Ex: Italiana" value="${isEdit ? escapeAttr(restaurant.cuisine || '') : ''}">
                    <datalist id="rCuisineList">${cuisineOptions}</datalist>
                </div>
                <div class="form-group">
                    <label>Preu</label>
                    <div class="segmented compact" id="r-price" data-value="${price}">
                        ${[1, 2, 3, 4].map(p => `<button type="button" data-value="${p}" class="${p === price ? 'active' : ''}" onclick="setRestaurantPriceInput(${p})">${rPrice(p)}</button>`).join('')}
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label for="r-location">Ubicació</label>
                <div class="rloc-search">
                    <input type="text" id="r-location" placeholder="Ex: El llit del Jan" value="${isEdit ? escapeAttr(restaurant.location || '') : ''}" onkeydown="if(event.key==='Enter'){event.preventDefault();searchRestaurantLocation();}">
                    <button type="button" class="rloc-btn" onclick="searchRestaurantLocation()" title="Cercar al mapa"><i class="fas fa-search"></i></button>
                    <button type="button" class="rloc-btn" onclick="useCurrentLocationForRestaurant()" title="Sóc aquí"><i class="fas fa-location-crosshairs"></i></button>
                </div>
                <div id="rLocResults" class="rloc-results"></div>
                <div id="rFormMap" class="rform-map"></div>
                <small class="form-hint">Cerca l'adreça o toca el mapa per posar el punt</small>
            </div>
            <div class="form-group" id="rRatingGroup" ${status === 'wishlist' ? 'style="display:none"' : ''}>
                <label>Puntuació</label>
                ${renderInteractiveStars(isEdit ? (restaurant.rating || 0) : 0, 'r-rating')}
            </div>
            <div class="form-group">
                <label for="r-comment">Comentaris</label>
                <textarea id="r-comment" placeholder="Ex: El millor pene que he provat mai">${isEdit ? escapeHtml(restaurant.comment || '') : ''}</textarea>
            </div>
            <div class="form-group">
                <label>Foto</label>
                <div class="rphoto-picker">
                    <div id="rPhotoPreview" class="rphoto-preview">${isEdit && restaurant.photo ? `<img src="${restaurant.photo}" alt="">` : ''}</div>
                    <label class="btn btn-ghost rphoto-btn">
                        <i class="fas fa-camera"></i> <span>${isEdit && restaurant.photo ? 'Canviar' : 'Afegir foto'}</span>
                        <input type="file" accept="image/*" onchange="handleRestaurantPhoto(this)" hidden>
                    </label>
                    <button type="button" id="rPhotoRemove" class="btn btn-ghost" onclick="removeRestaurantPhoto()" ${isEdit && restaurant.photo ? '' : 'style="display:none"'}><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel·lar</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> ${isEdit ? 'Guardar' : 'Afegir'}
                </button>
            </div>
        </form>
    `;

    openModal(content, 'sheet');
    if (isEdit && restaurant.rating) document.getElementById('r-rating').dataset.rating = restaurant.rating;
    setTimeout(initRestaurantFormMap, 50);
}

function editRestaurant(id) {
    openRestaurantModal(id);
}

function setRestaurantStatusInput(value) {
    const el = document.getElementById('r-status');
    el.dataset.value = value;
    el.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.value === value));
    document.getElementById('rRatingGroup').style.display = value === 'wishlist' ? 'none' : '';
}

function setRestaurantPriceInput(value) {
    const el = document.getElementById('r-price');
    const next = parseInt(el.dataset.value) === value ? 0 : value;
    el.dataset.value = next;
    el.querySelectorAll('button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.value) === next));
}

function initRestaurantFormMap() {
    if (rFormMap) { rFormMap.remove(); rFormMap = null; }
    rFormMarker = null;

    rFormMap = L.map('rFormMap', { zoomControl: false }).setView(rFormCoords || rUserPos || R_DEFAULT_CENTER, rFormCoords ? 16 : 12);
    L.tileLayer(R_TILES, {
        attribution: R_TILES_ATTRIBUTION,
        maxZoom: 19
    }).addTo(rFormMap);

    if (rFormCoords) setRestaurantFormPoint(rFormCoords, false);
    rFormMap.on('click', (e) => setRestaurantFormPoint([e.latlng.lat, e.latlng.lng], false));
}

function setRestaurantFormPoint(coords, recenter = true) {
    rFormCoords = coords;
    if (!rFormMap) return;
    if (rFormMarker) {
        rFormMarker.setLatLng(coords);
    } else {
        rFormMarker = L.marker(coords, { draggable: true }).addTo(rFormMap);
        rFormMarker.on('dragend', () => {
            const p = rFormMarker.getLatLng();
            rFormCoords = [p.lat, p.lng];
        });
    }
    if (recenter) rFormMap.setView(coords, 16);
}

function rShortAddress(res) {
    const a = res.address || {};
    const street = [a.road || a.pedestrian || a.square, a.house_number].filter(Boolean).join(' ');
    const area = a.neighbourhood || a.suburb || a.quarter || '';
    const city = a.city || a.town || a.village || a.municipality || '';
    return [street, area, city].filter(Boolean).join(', ') || res.display_name;
}

async function searchRestaurantLocation() {
    const input = document.getElementById('r-location');
    const query = input.value.trim() || document.getElementById('r-name').value.trim();
    const results = document.getElementById('rLocResults');
    if (!query) {
        showToast("Escriu una adreça o el nom del restaurant", "info");
        return;
    }

    results.innerHTML = '<div class="rloc-loading"><i class="fas fa-spinner fa-spin"></i> Cercant...</div>';
    const center = rFormMap ? rFormMap.getCenter() : { lat: R_DEFAULT_CENTER[0], lng: R_DEFAULT_CENTER[1] };
    const viewbox = [center.lng - 0.3, center.lat + 0.2, center.lng + 0.3, center.lat - 0.2].join(',');

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=ca&viewbox=${viewbox}&q=${encodeURIComponent(query)}`;
        const data = await (await fetch(url)).json();
        if (!data.length) {
            results.innerHTML = '<div class="rloc-loading">No s\'ha trobat res. Prova una altra adreça o toca el mapa.</div>';
            return;
        }
        window._rLocResults = data;
        results.innerHTML = data.map((res, i) => `
            <button type="button" class="rloc-result" onclick="pickRestaurantLocation(${i})">
                <i class="fas fa-location-dot"></i>
                <span><strong>${escapeHtml(res.name || rShortAddress(res))}</strong><small>${escapeHtml(rShortAddress(res))}</small></span>
            </button>`).join('');
    } catch (err) {
        console.error("Geocoding error:", err);
        results.innerHTML = '<div class="rloc-loading">Error cercant l\'adreça</div>';
    }
}

function pickRestaurantLocation(i) {
    const res = window._rLocResults[i];
    document.getElementById('r-location').value = rShortAddress(res);
    const nameInput = document.getElementById('r-name');
    if (!nameInput.value.trim() && res.name) nameInput.value = res.name;
    document.getElementById('rLocResults').innerHTML = '';
    setRestaurantFormPoint([parseFloat(res.lat), parseFloat(res.lon)]);
}

async function useCurrentLocationForRestaurant() {
    try {
        const pos = await getUserPosition();
        setRestaurantFormPoint(pos);
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=ca&lat=${pos[0]}&lon=${pos[1]}`;
        const res = await (await fetch(url)).json();
        if (res && res.address) document.getElementById('r-location').value = rShortAddress(res);
    } catch {
        showToast("No s'ha pogut obtenir la teva ubicació", "error");
    }
}

async function handleRestaurantPhoto(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const blob = await compressImage(file, 900, 0.65);
    const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
    if (dataUrl.length > 900000) {
        showToast("La foto és massa gran", "error");
        return;
    }
    rFormPhoto = dataUrl;
    rFormPhotoRemoved = false;
    document.getElementById('rPhotoPreview').innerHTML = `<img src="${dataUrl}" alt="">`;
    document.getElementById('rPhotoRemove').style.display = '';
}

function removeRestaurantPhoto() {
    rFormPhoto = undefined;
    rFormPhotoRemoved = true;
    document.getElementById('rPhotoPreview').innerHTML = '';
    document.getElementById('rPhotoRemove').style.display = 'none';
}

async function saveRestaurant(e, editId) {
    e.preventDefault();

    const name = document.getElementById('r-name').value.trim();
    const status = document.getElementById('r-status').dataset.value;
    const cuisine = document.getElementById('r-cuisine').value.trim();
    const price = parseInt(document.getElementById('r-price').dataset.value) || 0;
    const location = document.getElementById('r-location').value.trim();
    const rating = status === 'visited' ? getStarRating('r-rating') : 0;
    const comment = document.getElementById('r-comment').value.trim();

    if (!name) {
        showToast("El nom és obligatori", "error");
        return;
    }

    closeModal();
    showLoading();

    const data = {
        name,
        status,
        cuisine,
        price,
        location,
        rating,
        comment,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (rFormCoords) {
        data.lat = rFormCoords[0];
        data.lng = rFormCoords[1];
    }
    if (rFormPhoto) data.photo = rFormPhoto;

    try {
        if (editId) {
            const update = { ...data };
            if (rFormPhotoRemoved) update.photo = firebase.firestore.FieldValue.delete();
            await db.collection('restaurants').doc(editId).update(update);
            const idx = restaurants.findIndex(r => r.id === editId);
            if (idx !== -1) {
                restaurants[idx] = { ...restaurants[idx], ...data };
                if (rFormPhotoRemoved) delete restaurants[idx].photo;
            }
            showToast("Restaurant actualitzat!", "success");
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('restaurants').add(data);
            restaurants.unshift({ id: docRef.id, ...data });
            showToast("Restaurant afegit!", "success");
        }
        renderRestaurants();
    } catch (err) {
        console.error("Error saving restaurant:", err);
        showToast("Error desant el restaurant", "error");
    } finally {
        hideLoading();
    }
}

async function deleteRestaurant(id) {
    if (!confirm("Segur que vols eliminar aquest restaurant?")) return;

    closeModal();
    showLoading();

    try {
        await db.collection('restaurants').doc(id).delete();
        restaurants = restaurants.filter(r => r.id !== id);
        if (rSelectedId === id) hideRestaurantMapCard();
        renderRestaurants();
        showToast("Restaurant eliminat", "success");
    } catch (err) {
        console.error("Error deleting restaurant:", err);
        showToast("Error eliminant el restaurant", "error");
    } finally {
        hideLoading();
    }
}

// Escape HTML helper
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
