// ==========================================
// TRIPS MODULE
// ==========================================

let trips = []; // Array of { id, city, photoCount }
let tripPhotos = []; // Photos for the currently viewed trip
let currentTripId = null;
let currentTripCity = '';

async function initTrips() {
    if (!isFirebaseConfigured()) return;

    try {
        const snapshot = await db.collection('trips').orderBy('createdAt', 'desc').get();
        trips = [];
        snapshot.forEach(doc => {
            trips.push({ id: doc.id, ...doc.data() });
        });
        renderTrips();
    } catch (err) {
        console.error("Error loading trips:", err);
    }
}

function renderTrips() {
    const container = document.getElementById('trips-folders');
    const emptyState = document.getElementById('trips-empty');

    if (trips.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = '';
        return;
    }

    container.innerHTML = trips.map(t => `
        <div class="trip-folder" data-id="${t.id}" onclick="openTripDetail('${t.id}')">
            <button class="folder-delete" onclick="event.stopPropagation(); deleteTrip('${t.id}')" title="Eliminar carpeta">
                <i class="fas fa-trash-alt"></i>
            </button>
            <i class="fas fa-folder folder-icon"></i>
            <div class="folder-name">${escapeHtml(t.city)}</div>
            <div class="folder-count">${t.photoCount || 0} fotos</div>
        </div>
    `).join('');
}

function openTripModal() {
    const content = `
        <h3>Nova Carpeta de Viatge</h3>
        <form onsubmit="createTrip(event)">
            <div class="form-group">
                <label for="trip-city">Nom de la Ciutat *</label>
                <input type="text" id="trip-city" placeholder="Ex: París, Roma, Tokyo..." required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel·lar</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-folder-plus"></i> Crear
                </button>
            </div>
        </form>
    `;

    openModal(content);
}

async function createTrip(e) {
    e.preventDefault();

    const city = document.getElementById('trip-city').value.trim();
    if (!city) {
        showToast("El nom de la ciutat és obligatori", "error");
        return;
    }

    // Check if city already exists
    if (trips.some(t => t.city.toLowerCase() === city.toLowerCase())) {
        showToast("Ja existeix una carpeta amb aquest nom", "error");
        return;
    }

    closeModal();
    showLoading();

    try {
        const docRef = await db.collection('trips').add({
            city: city,
            photoCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        trips.unshift({ id: docRef.id, city: city, photoCount: 0 });
        renderTrips();
        showToast(`Carpeta "${city}" creada!`, "success");
    } catch (err) {
        console.error("Error creating trip:", err);
        showToast("Error creant la carpeta", "error");
    } finally {
        hideLoading();
    }
}

async function deleteTrip(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;

    if (!confirm(`Segur que vols eliminar la carpeta "${trip.city}" i totes les seves fotos?`)) return;

    showLoading();

    try {
        // Delete all photos in this trip
        const photosSnapshot = await db.collection('trips').doc(id).collection('photos').get();
        const batch = db.batch();

        for (const photoDoc of photosSnapshot.docs) {
            const photoData = photoDoc.data();
            // Delete from storage
            if (photoData.storagePath) {
                try {
                    await storage.ref(photoData.storagePath).delete();
                } catch (e) {
                    console.warn("Could not delete photo from storage:", e.message);
                }
            }
            batch.delete(photoDoc.ref);
        }

        await batch.commit();

        // Delete the trip document
        await db.collection('trips').doc(id).delete();

        trips = trips.filter(t => t.id !== id);
        renderTrips();
        showToast(`Carpeta "${trip.city}" eliminada`, "success");
    } catch (err) {
        console.error("Error deleting trip:", err);
        showToast("Error eliminant la carpeta", "error");
    } finally {
        hideLoading();
    }
}

async function openTripDetail(tripId) {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;

    currentTripId = tripId;
    currentTripCity = trip.city;

    // Hide folders, show detail
    document.getElementById('trips-folders').classList.add('hidden');
    document.getElementById('trip-detail').classList.remove('hidden');
    document.getElementById('trip-city-name').textContent = trip.city;

    // Load photos
    showLoading();
    try {
        const snapshot = await db.collection('trips').doc(tripId).collection('photos').orderBy('createdAt', 'desc').get();
        tripPhotos = [];
        snapshot.forEach(doc => {
            tripPhotos.push({ id: doc.id, ...doc.data() });
        });
        renderTripPhotos();
    } catch (err) {
        console.error("Error loading trip photos:", err);
        showToast("Error carregant les fotos", "error");
    } finally {
        hideLoading();
    }
}

function renderTripPhotos() {
    const container = document.getElementById('trip-photos');

    if (tripPhotos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-images"></i>
                <p>Encara no hi ha fotos en aquesta carpeta.</p>
                <button class="btn btn-primary" onclick="openTripPhotoUpload()">
                    <i class="fas fa-upload"></i> Pujar fotos
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = tripPhotos.map(p => `
        <div class="photo-item" data-id="${p.id}">
            <img src="${p.url}" alt="${escapeHtml(p.caption || currentTripCity)}" 
                 onclick="openImageViewer('${p.url}')" loading="lazy">
            <div class="photo-overlay">
                <span class="photo-caption">${escapeHtml(p.caption || '')}</span>
                <button class="btn-delete-photo" onclick="event.stopPropagation(); deleteTripPhoto('${p.id}', '${p.storagePath || ''}')" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function backToTrips() {
    currentTripId = null;
    currentTripCity = '';
    tripPhotos = [];

    document.getElementById('trips-folders').classList.remove('hidden');
    document.getElementById('trip-detail').classList.add('hidden');
}

function openTripPhotoUpload() {
    const content = `
        <h3>Pujar Fotos a "${escapeHtml(currentTripCity)}"</h3>
        <div class="form-group">
            <label for="trip-photo-caption">Títol / Descripció (opcional)</label>
            <input type="text" id="trip-photo-caption" placeholder="Ex: La Torre Eiffel de nit">
        </div>
        <div class="upload-area" onclick="document.getElementById('trip-file-input').click()">
            <i class="fas fa-cloud-upload-alt"></i>
            <p>Fes clic o arrossega les fotos aquí</p>
            <p class="upload-hint">JPG, PNG, WEBP · Màx. 10MB per foto</p>
        </div>
        <div class="upload-preview" id="trip-photo-preview"></div>
        <div class="form-actions" id="trip-upload-actions" style="display:none">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel·lar</button>
            <button type="button" class="btn btn-primary" onclick="uploadTripPhotos()">
                <i class="fas fa-upload"></i> Pujar
            </button>
        </div>
    `;

    openModal(content);
}

let pendingTripFiles = [];

function handleTripFiles(files) {
    pendingTripFiles = Array.from(files);

    const preview = document.getElementById('trip-photo-preview');
    const actions = document.getElementById('trip-upload-actions');

    if (!preview || !actions) return;

    if (pendingTripFiles.length > 0) {
        actions.style.display = 'flex';
        preview.innerHTML = '';

        pendingTripFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'preview-thumb';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    }
}

async function uploadTripPhotos() {
    if (pendingTripFiles.length === 0) {
        showToast("Selecciona almenys una foto", "error");
        return;
    }

    if (!currentTripId) return;

    const caption = document.getElementById('trip-photo-caption')?.value.trim() || '';

    closeModal();
    showLoading();

    let successCount = 0;

    for (const file of pendingTripFiles) {
        try {
            // Compress image
            const compressed = await compressImage(file);
            const safeCityName = currentTripCity.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `trips/${safeCityName}/${generateId()}_${file.name}`;

            // Upload to Firebase Storage
            const ref = storage.ref(fileName);
            await ref.put(compressed);
            const url = await ref.getDownloadURL();

            // Save to Firestore subcollection
            const docRef = await db.collection('trips').doc(currentTripId).collection('photos').add({
                url: url,
                storagePath: fileName,
                caption: caption,
                originalName: file.name,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            tripPhotos.unshift({
                id: docRef.id,
                url: url,
                storagePath: fileName,
                caption: caption
            });

            successCount++;
        } catch (err) {
            console.error("Error uploading trip photo:", err);
        }
    }

    // Update photo count on trip document
    if (successCount > 0) {
        try {
            const trip = trips.find(t => t.id === currentTripId);
            const newCount = (trip?.photoCount || 0) + successCount;
            await db.collection('trips').doc(currentTripId).update({
                photoCount: newCount
            });
            if (trip) trip.photoCount = newCount;
        } catch (e) {
            console.warn("Could not update photo count:", e.message);
        }
    }

    pendingTripFiles = [];
    renderTripPhotos();
    hideLoading();

    if (successCount > 0) {
        showToast(`${successCount} ${successCount === 1 ? 'foto pujada' : 'fotos pujades'}!`, "success");
    } else {
        showToast("Error pujant les fotos", "error");
    }
}

async function deleteTripPhoto(photoId, storagePath) {
    if (!confirm("Segur que vols eliminar aquesta foto?")) return;
    if (!currentTripId) return;

    showLoading();

    try {
        // Delete from Storage
        if (storagePath) {
            try {
                await storage.ref(storagePath).delete();
            } catch (e) {
                console.warn("Could not delete from storage:", e.message);
            }
        }

        // Delete from Firestore
        await db.collection('trips').doc(currentTripId).collection('photos').doc(photoId).delete();
        tripPhotos = tripPhotos.filter(p => p.id !== photoId);
        renderTripPhotos();

        // Update photo count
        try {
            const trip = trips.find(t => t.id === currentTripId);
            const newCount = Math.max(0, (trip?.photoCount || 1) - 1);
            await db.collection('trips').doc(currentTripId).update({
                photoCount: newCount
            });
            if (trip) trip.photoCount = newCount;
        } catch (e) {
            console.warn("Could not update photo count:", e.message);
        }

        showToast("Foto eliminada", "success");
    } catch (err) {
        console.error("Error deleting trip photo:", err);
        showToast("Error eliminant la foto", "error");
    } finally {
        hideLoading();
    }
}
