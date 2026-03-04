// ==========================================
// SELFIES MODULE
// ==========================================

let selfies = [];

async function initSelfies() {
    if (!isFirebaseConfigured()) return;

    try {
        const snapshot = await db.collection('selfies').orderBy('createdAt', 'desc').get();
        selfies = [];
        snapshot.forEach(doc => {
            selfies.push({ id: doc.id, ...doc.data() });
        });
        renderSelfies();
    } catch (err) {
        console.error("Error loading selfies:", err);
    }
}

function renderSelfies() {
    const container = document.getElementById('selfies-gallery');
    const emptyState = document.getElementById('selfies-empty');

    if (selfies.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = '';
        return;
    }

    container.innerHTML = selfies.map(s => `
        <div class="photo-item" data-id="${s.id}">
            <img src="${s.url}" alt="${escapeHtml(s.caption || 'Selfie')}" 
                 onclick="openImageViewer('${s.url}')" loading="lazy">
            <div class="photo-overlay">
                <span class="photo-caption">${escapeHtml(s.caption || '')}</span>
                <button class="btn-delete-photo" onclick="event.stopPropagation(); deleteSelfie('${s.id}', '${s.storagePath || ''}')" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function openSelfieUpload() {
    const content = `
        <h3>Pujar Selfies</h3>
        <div class="form-group">
            <label for="selfie-caption">Títol / Descripció (opcional)</label>
            <input type="text" id="selfie-caption" placeholder="Ex: Vacances a París!">
        </div>
        <div class="upload-area" onclick="document.getElementById('selfie-file-input').click()">
            <i class="fas fa-cloud-upload-alt"></i>
            <p>Fes clic o arrossega les fotos aquí</p>
            <p class="upload-hint">JPG, PNG, WEBP · Màx. 10MB per foto</p>
        </div>
        <div class="upload-preview" id="selfie-preview"></div>
        <div class="form-actions" id="selfie-upload-actions" style="display:none">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel·lar</button>
            <button type="button" class="btn btn-primary" onclick="uploadSelfies()">
                <i class="fas fa-upload"></i> Pujar
            </button>
        </div>
    `;

    openModal(content);
}

let pendingSelfieFiles = [];

function handleSelfieFiles(files) {
    pendingSelfieFiles = Array.from(files);

    const preview = document.getElementById('selfie-preview');
    const actions = document.getElementById('selfie-upload-actions');

    if (!preview || !actions) return;

    if (pendingSelfieFiles.length > 0) {
        actions.style.display = 'flex';
        preview.innerHTML = '';

        pendingSelfieFiles.forEach(file => {
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

async function uploadSelfies() {
    if (pendingSelfieFiles.length === 0) {
        showToast("Selecciona almenys una foto", "error");
        return;
    }

    const caption = document.getElementById('selfie-caption')?.value.trim() || '';

    closeModal();
    showLoading();

    let successCount = 0;

    for (const file of pendingSelfieFiles) {
        try {
            // Compress image
            const compressed = await compressImage(file);
            const fileName = `selfies/${generateId()}_${file.name}`;

            // Upload to Firebase Storage
            const ref = storage.ref(fileName);
            await ref.put(compressed);
            const url = await ref.getDownloadURL();

            // Save metadata to Firestore
            const docRef = await db.collection('selfies').add({
                url: url,
                storagePath: fileName,
                caption: caption,
                originalName: file.name,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            selfies.unshift({
                id: docRef.id,
                url: url,
                storagePath: fileName,
                caption: caption,
                originalName: file.name
            });

            successCount++;
        } catch (err) {
            console.error("Error uploading selfie:", err);
        }
    }

    pendingSelfieFiles = [];
    renderSelfies();
    hideLoading();

    if (successCount > 0) {
        showToast(`${successCount} ${successCount === 1 ? 'foto pujada' : 'fotos pujades'}!`, "success");
    } else {
        showToast("Error pujant les fotos", "error");
    }
}

async function deleteSelfie(id, storagePath) {
    if (!confirm("Segur que vols eliminar aquesta foto?")) return;

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
        await db.collection('selfies').doc(id).delete();
        selfies = selfies.filter(s => s.id !== id);
        renderSelfies();
        showToast("Foto eliminada", "success");
    } catch (err) {
        console.error("Error deleting selfie:", err);
        showToast("Error eliminant la foto", "error");
    } finally {
        hideLoading();
    }
}
