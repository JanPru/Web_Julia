// ==========================================
// MOVIES & SERIES MODULE
// ==========================================

let movies = [];
let currentMovieFilter = 'all';

async function initMovies() {
    if (!isFirebaseConfigured()) return;

    try {
        const snapshot = await db.collection('movies').orderBy('createdAt', 'desc').get();
        movies = [];
        snapshot.forEach(doc => {
            movies.push({ id: doc.id, ...doc.data() });
        });
        renderMovies();
    } catch (err) {
        console.error("Error loading movies:", err);
    }
}

function renderMovies() {
    const container = document.getElementById('movies-list');
    const emptyState = document.getElementById('movies-empty');

    const filtered = currentMovieFilter === 'all'
        ? movies
        : movies.filter(m => m.type === currentMovieFilter);

    if (filtered.length === 0) {
        container.innerHTML = '';
        if (movies.length === 0) {
            container.appendChild(emptyState);
            emptyState.style.display = '';
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-filter"></i>
                    <p>No hi ha resultats per aquest filtre.</p>
                </div>
            `;
        }
        return;
    }

    container.innerHTML = filtered.map(m => `
        <div class="item-card" data-id="${m.id}">
            <div class="card-header">
                <span class="card-title">${escapeHtml(m.title)}</span>
                <span class="card-type ${m.type}">
                    ${m.type === 'movie' ? '<i class="fas fa-film"></i> Pel·lícula' : '<i class="fas fa-tv"></i> Sèrie'}
                </span>
            </div>
            ${m.genre ? `<div style="font-size:0.85rem;color:var(--text-light);margin-bottom:0.3rem"><i class="fas fa-tag" style="color:var(--purple)"></i> ${escapeHtml(m.genre)}</div>` : ''}
            ${renderStars(m.rating)}
            ${m.comment ? `<p class="card-comment">"${escapeHtml(m.comment)}"</p>` : ''}
            <div class="card-actions">
                <button class="btn-icon" onclick="editMovie('${m.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="deleteMovie('${m.id}')" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function filterMovies(filter) {
    currentMovieFilter = filter;

    // Update active tab
    document.querySelectorAll('#movieFilters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderMovies();
}

function openMovieModal(editId = null) {
    const movie = editId ? movies.find(m => m.id === editId) : null;
    const isEdit = !!movie;

    const content = `
        <h3>${isEdit ? 'Editar Títol' : 'Nou Títol'}</h3>
        <form onsubmit="saveMovie(event, '${editId || ''}')">
            <div class="form-group">
                <label for="m-title">Títol *</label>
                <input type="text" id="m-title" placeholder="Ex: Breaking Bad" value="${isEdit ? escapeHtml(movie.title) : ''}" required>
            </div>
            <div class="form-group">
                <label for="m-type">Tipus</label>
                <select id="m-type">
                    <option value="movie" ${isEdit && movie.type === 'movie' ? 'selected' : ''}>Pel·lícula</option>
                    <option value="series" ${isEdit && movie.type === 'series' ? 'selected' : ''}>Sèrie</option>
                </select>
            </div>
            <div class="form-group">
                <label for="m-genre">Gènere</label>
                <input type="text" id="m-genre" placeholder="Ex: Drama, Thriller" value="${isEdit ? escapeHtml(movie.genre || '') : ''}">
            </div>
            <div class="form-group">
                <label>Puntuació</label>
                ${renderInteractiveStars(isEdit ? movie.rating : 0, 'm-rating')}
            </div>
            <div class="form-group">
                <label for="m-comment">Comentaris</label>
                <textarea id="m-comment" placeholder="Què t'ha semblat? La recomanaries?">${isEdit ? escapeHtml(movie.comment || '') : ''}</textarea>
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

function editMovie(id) {
    openMovieModal(id);
}

async function saveMovie(e, editId) {
    e.preventDefault();

    const title = document.getElementById('m-title').value.trim();
    const type = document.getElementById('m-type').value;
    const genre = document.getElementById('m-genre').value.trim();
    const rating = getStarRating('m-rating');
    const comment = document.getElementById('m-comment').value.trim();

    if (!title) {
        showToast("El títol és obligatori", "error");
        return;
    }

    closeModal();
    showLoading();

    const data = {
        title,
        type,
        genre,
        rating,
        comment,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (editId) {
            await db.collection('movies').doc(editId).update(data);
            const idx = movies.findIndex(m => m.id === editId);
            if (idx !== -1) movies[idx] = { ...movies[idx], ...data };
            showToast("Títol actualitzat!", "success");
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('movies').add(data);
            movies.unshift({ id: docRef.id, ...data });
            showToast("Títol afegit!", "success");
        }
        renderMovies();
    } catch (err) {
        console.error("Error saving movie:", err);
        showToast("Error desant el títol", "error");
    } finally {
        hideLoading();
    }
}

async function deleteMovie(id) {
    if (!confirm("Segur que vols eliminar aquest títol?")) return;

    showLoading();

    try {
        await db.collection('movies').doc(id).delete();
        movies = movies.filter(m => m.id !== id);
        renderMovies();
        showToast("Títol eliminat", "success");
    } catch (err) {
        console.error("Error deleting movie:", err);
        showToast("Error eliminant el títol", "error");
    } finally {
        hideLoading();
    }
}
