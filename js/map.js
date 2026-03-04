// ==========================================
// WORLD MAP MODULE
// ==========================================

const GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

let worldMap = null;
let geoJsonLayer = null;
let countriesData = {}; // { countryName: 'visited' | 'desired' }

function initMap() {
    // Initialize Leaflet map
    worldMap = L.map('world-map', {
        center: [25, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 6,
        worldCopyJump: true,
        maxBounds: [[-85, -180], [85, 180]],
        maxBoundsViscosity: 1.0
    });

    // Tile layer (simple, light style)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(worldMap);

    // Make map accessible globally for resize
    window.worldMap = worldMap;

    // Load countries from Firebase then load GeoJSON
    loadCountriesFromDB().then(() => {
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

function loadGeoJSON() {
    fetch(GEOJSON_URL)
        .then(res => res.json())
        .then(data => {
            geoJsonLayer = L.geoJSON(data, {
                style: countryStyle,
                onEachFeature: onEachCountry
            }).addTo(worldMap);

            updateMapStats();
        })
        .catch(err => {
            console.error("Error loading GeoJSON:", err);
            showToast("Error carregant el mapa", "error");
        });
}

function countryStyle(feature) {
    const name = feature.properties.name;
    const status = countriesData[name];

    let fillColor = '#dfe6e9'; // Default: light gray
    let fillOpacity = 0.6;

    if (status === 'visited') {
        fillColor = '#00b894';
        fillOpacity = 0.7;
    } else if (status === 'desired') {
        fillColor = '#fdcb6e';
        fillOpacity = 0.7;
    }

    return {
        fillColor: fillColor,
        fillOpacity: fillOpacity,
        color: '#b2bec3',
        weight: 1,
        opacity: 0.8
    };
}

function onEachCountry(feature, layer) {
    const name = feature.properties.name;

    layer.on({
        mouseover: (e) => {
            const l = e.target;
            l.setStyle({
                weight: 2,
                color: '#636e72',
                fillOpacity: 0.85
            });
            l.bringToFront();
        },
        mouseout: (e) => {
            geoJsonLayer.resetStyle(e.target);
        },
        click: (e) => {
            showCountryPopup(name, e.latlng);
        }
    });

    layer.bindTooltip(name, {
        sticky: true,
        className: 'country-tooltip'
    });
}

function showCountryPopup(name, latlng) {
    const status = countriesData[name] || 'none';

    let popupContent = `
        <div class="country-popup">
            <h4>${name}</h4>
            <div class="popup-btns">
                <button class="btn-visited" onclick="setCountryStatus('${name.replace(/'/g, "\\'")}', 'visited')">
                    <i class="fas fa-check"></i> Visitat
                </button>
                <button class="btn-desired" onclick="setCountryStatus('${name.replace(/'/g, "\\'")}', 'desired')">
                    <i class="fas fa-heart"></i> Desitjat
                </button>
                ${status !== 'none' ? `
                <button class="btn-remove" onclick="setCountryStatus('${name.replace(/'/g, "\\'")}', 'none')">
                    <i class="fas fa-times"></i> Eliminar
                </button>` : ''}
            </div>
        </div>
    `;

    L.popup()
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(worldMap);
}

async function setCountryStatus(name, status) {
    worldMap.closePopup();

    if (status === 'none') {
        delete countriesData[name];
    } else {
        countriesData[name] = status;
    }

    // Update map styles
    if (geoJsonLayer) {
        geoJsonLayer.eachLayer(layer => {
            if (layer.feature && layer.feature.properties.name === name) {
                geoJsonLayer.resetStyle(layer);
            }
        });
    }

    updateMapStats();

    // Save to Firebase
    if (isFirebaseConfigured()) {
        try {
            if (status === 'none') {
                await db.collection('countries').doc(name).delete();
            } else {
                await db.collection('countries').doc(name).set({
                    status: status,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            const label = status === 'visited' ? 'visitat' : status === 'desired' ? 'desitjat' : 'eliminat';
            showToast(`${name} marcat com a ${label}`, 'success');
        } catch (err) {
            console.error("Error saving country:", err);
            showToast("Error desant el país", "error");
        }
    }
}

function updateMapStats() {
    const visited = Object.values(countriesData).filter(s => s === 'visited').length;
    const desired = Object.values(countriesData).filter(s => s === 'desired').length;

    const statsEl = document.getElementById('mapStats');
    statsEl.innerHTML = `
        <div class="stat-badge visited">
            <i class="fas fa-check-circle"></i> ${visited} ${visited === 1 ? 'país visitat' : 'països visitats'}
        </div>
        <div class="stat-badge desired">
            <i class="fas fa-heart"></i> ${desired} ${desired === 1 ? 'país desitjat' : 'països desitjats'}
        </div>
    `;
}
