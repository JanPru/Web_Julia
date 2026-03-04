# Júlia, Jan i les nostres coses 🌍

Aplicació web personal per gestionar viatges, restaurants, pel·lícules i plans!

## Característiques

- **Mapa Mundial**: Mapa interactiu per marcar països visitats (verd) i desitjats (groc)
- **Restaurants**: Afegir restaurants amb puntuació (1-5 estrelles) i comentaris
- **Pel·lícules i Sèries**: Registre de pel·lícules i sèries amb puntuació i opinió
- **Plans**: Gestionar plans fets i pendents amb dates i descripcions
- **Persistència**: Totes les dades es guarden al núvol amb Firebase

## Configuració de Firebase (Requerit)

### 1. Crear un projecte Firebase

1. Ves a [Firebase Console](https://console.firebase.google.com/)
2. Clica **"Añadir proyecto"** / **"Add project"**
3. Dona-li un nom (ex: `julia-jan-web`)
4. Segueix els passos (pots desactivar Google Analytics si vols)
5. Clica **"Crear proyecto"**

### 2. Registrar l'aplicació web

1. Al teu projecte, clica la icona **Web** (`</>`)
2. Posa un nom (ex: `julia-jan`)
3. **No** cal activar Firebase Hosting ara
4. Clica **"Registrar app"**
5. **Copia** les claus de configuració que apareixen

### 3. Configurar les claus

Obre l'arxiu `js/firebase-config.js` i substitueix els valors:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",                    // La teva API Key
    authDomain: "julia-jan-web.firebaseapp.com",
    projectId: "julia-jan-web",
    storageBucket: "julia-jan-web.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
};
```

### 4. Activar serveis Firebase

#### Firestore Database:
1. Al menú lateral: **Build** > **Firestore Database**
2. Clica **"Create database"**
3. Selecciona **"Start in test mode"** (per desenvolupament)
4. Escull una localització (ex: `europe-west1`)
5. Clica **"Enable"**

#### Authentication:
1. Al menú lateral: **Build** > **Authentication**
2. Clica **"Get started"**
3. A la pestanya **"Sign-in method"**
4. Activa **"Anonymous"** (Anònim)
5. Clica **"Save"**

### 5. Regles de Seguretat (Producció)

Per producció, actualitza les regles de seguretat:

**Firestore Rules:**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## Desplegament Gratuït

### Opció A: GitHub Pages

1. Crea un repositori a [GitHub](https://github.com/)
2. Puja tots els arxius del projecte
3. Ves a **Settings** > **Pages**
4. Selecciona **Branch: main** i carpeta **/ (root)**
5. Clica **Save**
6. La teva web estarà a: `https://el-teu-usuari.github.io/el-teu-repo/`

### Opció B: Netlify

1. Ves a [Netlify](https://www.netlify.com/) i crea un compte gratuït
2. Arrossega la carpeta del projecte a la secció "Deploy"
3. Obtindràs una URL automàtica (ex: `https://random-name.netlify.app`)

### Opció C: Vercel

1. Ves a [Vercel](https://vercel.com/) i connecta el teu repositori GitHub
2. Selecciona el projecte i clica **Deploy**
3. Obtindràs una URL automàtica

### Opció D: Firebase Hosting

1. Instal·la Firebase CLI: `npm install -g firebase-tools`
2. Executa: `firebase login`
3. Executa: `firebase init hosting`
4. Selecciona el teu projecte
5. Directori públic: `.` (el directori actual)
6. Executa: `firebase deploy`
7. La teva web estarà a: `https://el-teu-projecte.web.app`

## Estructura del Projecte

```
Web Julia/
├── index.html              # Pàgina principal
├── qr-print.html           # Pàgina per imprimir el QR
├── css/
│   └── style.css           # Estils
├── js/
│   ├── firebase-config.js  # Configuració Firebase
│   ├── app.js              # Lògica principal, navegació
│   ├── map.js              # Mapa mundial interactiu
│   ├── restaurants.js      # Gestió de restaurants
│   ├── movies.js           # Pel·lícules i sèries
│   └── plans.js            # Plans i activitats
└── README.md               # Aquest arxiu
```

## Tecnologies

- **HTML5 / CSS3 / JavaScript** (Vanilla, sense frameworks)
- **Firebase** (Firestore, Auth)
- **Leaflet.js** (Mapa interactiu)
- **Font Awesome** (Icones)
- **Google Fonts** (Funnel Sans)

## Provar en Local

Simplement obre `index.html` al teu navegador. Per un millor funcionament amb Firebase, utilitza un servidor local:

```bash
# Amb Python
python3 -m http.server 8000

# Amb Node.js
npx serve .

# Amb PHP
php -S localhost:8000
```

Després obre `http://localhost:8000` al navegador.

## Codi QR

Per generar i imprimir el codi QR de la teva web, obre el fitxer [qr-print.html](qr-print.html) al navegador.

---

Fet amb ❤️ per la Júlia i en Jan
