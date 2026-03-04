// ==========================================
// RESTAURANTS MODULE
// ==========================================

let restaurants = [];
let restaurantSearchQuery = '';

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

    // Filter restaurants by search query
    let filteredRestaurants = restaurants;
    if (restaurantSearchQuery) {
        const query = restaurantSearchQuery.toLowerCase();
        filteredRestaurants = restaurants.filter(r => 
            (r.name && r.name.toLowerCase().includes(query)) ||
            (r.location && r.location.toLowerCase().includes(query))
        );
    }

    if (filteredRestaurants.length === 0) {
        container.innerHTML = restaurantSearchQuery 
            ? '<div class="empty-state"><i class="fas fa-search"></i><p>No s\'han trobat restaurants</p></div>'
            : '';
        if (!restaurantSearchQuery) {
            container.appendChild(emptyState);
            emptyState.style.display = '';
        }
        return;
    }

    emptyState.style.display = 'none';

    container.innerHTML = `
        <div class="search-container">
            <i class="fas fa-search search-icon"></i>
            <input 
                type="text" 
                class="search-input" 
                placeholder="Buscar restaurants per nom o ubicació..." 
                value="${restaurantSearchQuery}"
                oninput="searchRestaurants(this.value)"
            >
            ${restaurantSearchQuery ? `<button class="search-clear" onclick="clearRestaurantSearch()"><i class="fas fa-times"></i></button>` : ''}
        </div>
        
        <div class="cards-grid">
            ${filteredRestaurants.map(r => `
                <div class="item-card" data-id="${r.id}">
                    <div class="gradient-header"></div>
                    <div style="padding: 1.5rem;">
                        <div class="card-header">
                            <span class="card-title">${escapeHtml(r.name)}</span>
                        </div>
                        ${r.location ? `<div style="font-size:0.85rem;color:var(--text-light);margin-bottom:0.5rem"><i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> ${escapeHtml(r.location)}</div>` : ''}
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
                </div>
            `).join('')}
        </div>
    `;
}

function searchRestaurants(query) {
    restaurantSearchQuery = query;
    renderRestaurants();
}

function clearRestaurantSearch() {
    restaurantSearchQuery = '';
    renderRestaurants();
}

function openRestaurantModal(editId = null) {
    const restaurant = editId ? restaurants.find(r => r.id === editId) : null;
    const isEdit = !!restaurant;

    const content = `
        <h3>${isEdit ? 'Editar Restaurant' : 'Nou Restaurant'}</h3>
        <form onsubmit="saveRestaurant(event, '${editId || ''}')">
            <div class="form-group">
                <label for="r-name">Nom del Restaurant *</label>
                <input type="text" id="r-name" placeholder="Ex: La Boqueria" value="${isEdit ? escapeHtml(restaurant.name) : ''}" required>
            </div>
            <div class="form-group">
                <label for="r-location">Ubicació</label>
                <input type="text" id="r-location" placeholder="Ex: Barcelona, Espanya" value="${isEdit ? escapeHtml(restaurant.location || '') : ''}">
            </div>
            <div class="form-group">
                <label>Puntuació</label>
                ${renderInteractiveStars(isEdit ? restaurant.rating : 0, 'r-rating')}
            </div>
            <div class="form-group">
                <label for="r-comment">Comentaris</label>
                <textarea id="r-comment" placeholder="Què t'ha semblat? Quin plat recomanaries?">${isEdit ? escapeHtml(restaurant.comment || '') : ''}</textarea>
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
