// ==========================================
// RESTAURANTS MODULE
// ==========================================

let restaurants = [];

async function initRestaurants() {
    if (!isFirebaseConfigured()) return;

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

function renderRestaurants() {
    const container = document.getElementById('restaurants-list');
    const emptyState = document.getElementById('restaurants-empty');

    if (restaurants.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = '';
        return;
    }

    container.innerHTML = restaurants.map(r => `
        <div class="item-card" data-id="${r.id}">
            <div class="card-header">
                <span class="card-title">${escapeHtml(r.name)}</span>
            </div>
            ${r.location ? `<div style="font-size:0.85rem;color:var(--text-light);margin-bottom:0.3rem"><i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> ${escapeHtml(r.location)}</div>` : ''}
            ${renderStars(r.rating)}
            ${r.comment ? `<p class="card-comment">"${escapeHtml(r.comment)}"</p>` : ''}
            <div class="card-actions">
                <button class="btn-icon" onclick="editRestaurant('${r.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteRestaurant('${r.id}')" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function openRestaurantModal(editId = null) {
    const restaurant = editId ? restaurants.find(r => r.id === editId) : null;
    const isEdit = !!restaurant;

    const content = `
        <h3>${isEdit ? 'Editar Restaurant' : 'Nou Restaurant'}</h3>
        <form onsubmit="saveRestaurant(event, '${editId || ''}')">
            <div class="form-group">
                <label for="r-name">Restaurant *</label>
                <input type="text" id="r-name" placeholder="Ex: El cos del Jan" value="${isEdit ? escapeHtml(restaurant.name) : ''}" required>
            </div>
            <div class="form-group">
                <label for="r-location">Ubicació</label>
                <input type="text" id="r-location" placeholder="Ex: El llit del Jan" value="${isEdit ? escapeHtml(restaurant.location || '') : ''}">
            </div>
            <div class="form-group">
                <label>Puntuació</label>
                ${renderInteractiveStars(isEdit ? restaurant.rating : 0, 'r-rating')}
            </div>
            <div class="form-group">
                <label for="r-comment">Comentaris</label>
                <textarea id="r-comment" placeholder="Ex: El millor pene que he provat mai">${isEdit ? escapeHtml(restaurant.comment || '') : ''}</textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel·lar</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> ${isEdit ? 'Guardar' : 'Afegir'}
                </button>
            </div>
        </form>
    `;

    openModal(content);
}

function editRestaurant(id) {
    openRestaurantModal(id);
}

async function saveRestaurant(e, editId) {
    e.preventDefault();

    const name = document.getElementById('r-name').value.trim();
    const location = document.getElementById('r-location').value.trim();
    const rating = getStarRating('r-rating');
    const comment = document.getElementById('r-comment').value.trim();

    if (!name) {
        showToast("El nom és obligatori", "error");
        return;
    }

    closeModal();
    showLoading();

    const data = {
        name,
        location,
        rating,
        comment,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (editId) {
            await db.collection('restaurants').doc(editId).update(data);
            const idx = restaurants.findIndex(r => r.id === editId);
            if (idx !== -1) restaurants[idx] = { ...restaurants[idx], ...data };
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

    showLoading();

    try {
        await db.collection('restaurants').doc(id).delete();
        restaurants = restaurants.filter(r => r.id !== id);
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
