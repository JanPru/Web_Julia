// ==========================================
// MAIN APPLICATION LOGIC
// ==========================================

// ---- Navigation ----
function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const pageEl = document.getElementById(page);
    if (pageEl) pageEl.classList.add('active');

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });

    // Close mobile nav
    document.getElementById('navLinks').classList.remove('open');

    // Handle map resize when switching to map page
    if (page === 'map' && window.worldMap) {
        setTimeout(() => window.worldMap.invalidateSize(), 200);
    }

    // Update URL hash
    history.replaceState(null, '', '#' + page);
}

// ---- Init on DOMContentLoaded ----
document.addEventListener('DOMContentLoaded', () => {
    // Nav link clicks
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.dataset.page);
        });
    });

    // Mobile nav toggle
    document.getElementById('navToggle').addEventListener('click', () => {
        document.getElementById('navLinks').classList.toggle('open');
    });

    // Scroll shadow for navbar
    window.addEventListener('scroll', () => {
        document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 10);
    });

    // Handle hash on load
    const hash = window.location.hash.replace('#', '') || 'home';
    navigateTo(hash);

    // QR Code
    generateQR();

    // Check Firebase configuration and init all modules
    if (isFirebaseConfigured()) {
        authReady.then(() => {
            initMap();
            initRestaurants();
            initMovies();
            initSelfies();
            initTrips();
        });
    } else {
        console.warn("⚠ Firebase not configured. Please update js/firebase-config.js with your Firebase credentials.");
        showToast("Configura Firebase a js/firebase-config.js per activar la persistència", "info");
        // Initialize map anyway (it works without Firebase for display)
        initMap();
    }
});

// ---- QR Code ----
function generateQR() {
    const qrContainer = document.getElementById('qr-code');
    const qrUrl = document.getElementById('qr-url');
    const url = window.location.href.split('#')[0];

    if (qrUrl) qrUrl.textContent = url;

    if (qrContainer && typeof QRCode !== 'undefined') {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: url,
            width: 180,
            height: 180,
            colorDark: "#2d3436",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

// ---- Modal ----
function openModal(content) {
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
}

function handleOverlayClick(e) {
    if (e.target.id === 'modal-overlay') {
        closeModal();
    }
}

// ---- Toast Notifications ----
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ---- Loading ----
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// ---- Image Viewer ----
function openImageViewer(src) {
    const viewer = document.getElementById('image-viewer');
    document.getElementById('viewer-image').src = src;
    viewer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeImageViewer() {
    document.getElementById('image-viewer').classList.add('hidden');
    document.body.style.overflow = '';
}

// ---- Star Rating Helper ----
function renderStars(rating) {
    let html = '<div class="star-rating">';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="fa${i <= rating ? 's' : 'r'} fa-star"></i>`;
    }
    html += '</div>';
    return html;
}

function renderInteractiveStars(currentRating, inputId) {
    let html = '<div class="form-star-rating" id="' + inputId + '">';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="fa${i <= currentRating ? 's' : 'r'} fa-star ${i <= currentRating ? 'active' : ''}" 
                    data-value="${i}" onclick="setStarRating('${inputId}', ${i})"></i>`;
    }
    html += '</div>';
    return html;
}

function setStarRating(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.dataset.rating = value;
    container.querySelectorAll('i').forEach((star) => {
        const v = parseInt(star.dataset.value);
        star.className = `fa${v <= value ? 's' : 'r'} fa-star ${v <= value ? 'active' : ''}`;
    });
}

function getStarRating(containerId) {
    const container = document.getElementById(containerId);
    return container ? parseInt(container.dataset.rating || '0') : 0;
}

// ---- Image Compression ----
function compressImage(file, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = (h * maxWidth) / w;
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ---- Generate unique ID ----
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeImageViewer();
    }
});
