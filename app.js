// Importation de Firebase depuis les serveurs de Google (Modules ES6)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Configuration Firebase (issue de ta capture, avec la databaseURL ajoutée)
const firebaseConfig = {
  apiKey: "AIzaSyAs3mhCIfxqWQ1tsuTvSkDpZThzxqvyOL0",
  authDomain: "wikicourse.firebaseapp.com",
  // REMPLACE LA LIGNE CI-DESSOUS PAR LE LIEN DE TA REALTIME DATABASE
  databaseURL: "https://wikicourse-default-rtdb.europe-west1.firebasedatabase.app", 
  projectId: "wikicourse",
  storageBucket: "wikicourse.firebasestorage.app",
  messagingSenderId: "350809875674",
  appId: "1:350809875674:web:5da6fac4c619bd3e04b1e3"
};

// Initialisation
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Variables globales du jeu
let currentRoom = null;
let playerId = Math.random().toString(36).substring(2, 9); // Un ID unique généré au hasard pour ce joueur
let isHost = false;

// Récupération des éléments HTML (Interface)
const mainMenu = document.getElementById('main-menu');
const lobbyScreen = document.getElementById('lobby-screen');
const btnCreateRoom = document.getElementById('btn-create-room');
const roomCodeDisplay = document.getElementById('room-code-display');
const btnJoinRoom = document.getElementById('btn-join-room');
const inputJoinCode = document.getElementById('input-join-code');

//infos joueurs dans salon
const playerCountDisplay = document.getElementById('player-count');
const playerListDisplay = document.getElementById('player-list');

//inputs de choix des pages
const inputStartPage = document.getElementById('input-start-page');
const inputEndPage = document.getElementById('input-end-page');

//boutons de choix aléatoire pour start et end
const btnRandomStart = document.getElementById('btn-random-start');
const btnRandomEnd = document.getElementById('btn-random-end');

// input suggestions
const startSuggestions = document.getElementById('start-suggestions');
const endSuggestions = document.getElementById('end-suggestions');

//results
const resultScreen = document.getElementById('result-screen'); 
const resultsContainer = document.getElementById('results-container'); 
const btnBackToLobby = document.getElementById('btn-back-to-lobby'); 

//pseudo modal
const pseudoModal = document.getElementById('pseudo-modal');
const inputPseudo = document.getElementById('input-pseudo');
const btnValidatePseudo = document.getElementById('btn-validate-pseudo');
const btnCancelPseudo = document.getElementById('btn-cancel-pseudo');

// btn surrender
const btnSurrender = document.getElementById('btn-surrender');

// --- Anti-XSS ---
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Variables pour mémoriser l'action du joueur
let pendingAction = null; // Vaudra 'create' ou 'join'
let pendingJoinCode = null;

// --- FONCTION DE NETTOYAGE DES VIEUX SALONS CREES IL Y A PLUS DE 2 HEURES ---
async function cleanOldRooms() {
    const roomsRef = ref(db, 'rooms');
    const snapshot = await get(roomsRef);
    
    if (!snapshot.exists()) return;
    
    const rooms = snapshot.val();
    const now = Date.now();
    const twoHoursInMs = 2 * 60 * 60 * 1000; // 2 heures en millisecondes

    for (const code in rooms) {
        // Si le salon a un timestamp et qu'il est trop vieux
        if (rooms[code].createdAt && (now - rooms[code].createdAt > twoHoursInMs)) {
            // On supprime le salon (en l'écrasant avec null)
            await set(ref(db, 'rooms/' + code), null);
        }
    }
}

// --- BOUTON : CRÉER UN SALON ---
btnCreateRoom.addEventListener('click', () => {
    pendingAction = 'create'; // On mémorise l'état
    inputPseudo.value = '';
    pseudoModal.style.display = 'flex'; // On affiche la jolie fenêtre
    inputPseudo.focus();
});

// --- BOUTON : REJOINDRE UN SALON ---
btnJoinRoom.addEventListener('click', async () => {
    const code = inputJoinCode.value.trim(); 
    if (code.length !== 4) {
        alert("Le code doit faire 4 chiffres !");
        return;
    }

    const roomRef = ref(db, 'rooms/' + code);
    const snapshot = await get(roomRef);

    if (snapshot.exists()) {
        pendingAction = 'join'; // On mémorise qu'il veut rejoindre
        pendingJoinCode = code; // On mémorise le code
        inputPseudo.value = '';
        pseudoModal.style.display = 'flex'; // On affiche la jolie fenêtre
        inputPseudo.focus();
    } else {
        alert("Ce salon n'existe pas !");
    }
});

// --- BOUTONS DE LA MODALE PSEUDO ---
btnCancelPseudo.addEventListener('click', () => {
    pseudoModal.style.display = 'none';
    pendingAction = null;
});

btnValidatePseudo.addEventListener('click', async () => {
    const pseudo = inputPseudo.value.trim();
    if (!pseudo) return; // Si c'est vide, on ne fait rien

    pseudoModal.style.display = 'none'; // On cache la fenêtre

    // S'IL VOULAIT CRÉER LE SALON :
    if (pendingAction === 'create') {
        
        // On vire les vieux salons avant
        await cleanOldRooms();

        isHost = true; 
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        currentRoom = roomCode;

        const roomData = {
            status: "waiting",
            createdAt: Date.now(), // 🕒 ON ENREGISTRE L'HEURE EXACTE DE CRÉATION ICI
            players: {
                [playerId]: { score: 0, pseudo: pseudo } // On met le pseudo ici
            },
            settings: { startPage: "", endPage: "" }
        };

        await set(ref(db, 'rooms/' + roomCode), roomData);

        mainMenu.style.display = 'none';
        lobbyScreen.style.display = 'block';
        roomCodeDisplay.innerText = roomCode;
        listenToRoom(roomCode);
    } 
    // S'IL VOULAIT REJOINDRE LE SALON :
    else if (pendingAction === 'join') {
        currentRoom = pendingJoinCode;
        
        await update(ref(db, `rooms/${pendingJoinCode}/players`), {
            [playerId]: { score: 0, pseudo: pseudo } // On met le pseudo ici
        });

        mainMenu.style.display = 'none';
        lobbyScreen.style.display = 'block';
        roomCodeDisplay.innerText = pendingJoinCode;
        listenToRoom(pendingJoinCode);
    }
});

// --- MOTEUR WIKIPÉDIA (API) ---
// --- SYNCHRONISATION HÔTE -> INVITÉS ---
const syncSettings = () => {
    if (!isHost) return;
    update(ref(db, `rooms/${currentRoom}/settings`), {
        startPage: inputStartPage.value,
        endPage: inputEndPage.value
    });
};

inputStartPage.addEventListener('input', syncSettings);
inputEndPage.addEventListener('input', syncSettings);

const WIKI_API_URL = "https://fr.wikipedia.org/w/api.php";

// Fonction pour le bouton DÉ 🎲 donne un article au hasard
async function fetchRandomArticle() {
    // origin=* est obligatoire pour éviter que le navigateur bloque la requête (CORS)
    const url = `${WIKI_API_URL}?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    return data.query.random[0].title;
}

// Fonction pour l'autocomplétion (Recherche articles à partir des lettres tapées)
async function fetchSuggestions(query) {
    const url = `${WIKI_API_URL}?action=opensearch&search=${query}&limit=5&namespace=0&format=json&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    return data[1]; // Retourne un tableau avec 5 titres d'articles
}

// Activer les boutons DÉ 🎲
btnRandomStart.addEventListener('click', async () => {
    inputStartPage.value = "Chargement...";
    inputStartPage.value = await fetchRandomArticle();
    syncSettings();
});

btnRandomEnd.addEventListener('click', async () => {
    inputEndPage.value = "Chargement...";
    inputEndPage.value = await fetchRandomArticle();
    syncSettings();
});

// Activer l'autocomplétion quand on tape au clavier
async function handleInput(e) {
    if (!isHost) return; // Seul l'hôte peut chercher

    const query = e.target.value;
    // On détermine quelle liste ouvrir selon le champ modifié
    const suggestionBox = e.target.id === 'input-start-page' ? startSuggestions : endSuggestions;

    if (query.length < 3) {
        suggestionBox.style.display = 'none'; // On cache si moins de 3 lettres
        return;
    }

    const suggestions = await fetchSuggestions(query);
    
    // On vide l'ancienne liste
    suggestionBox.innerHTML = ''; 
    
    if (suggestions.length === 0) {
        suggestionBox.style.display = 'none';
        return;
    }

    // On affiche la boîte
    suggestionBox.style.display = 'block';

    // On remplit avec les nouveaux mots sous forme de <li>
    suggestions.forEach(title => {
        const li = document.createElement('li');
        li.textContent = title;
        
        // Que se passe-t-il quand l'hôte CLIQUE sur une suggestion ?
        li.addEventListener('click', () => {
            e.target.value = title; // On remplit le champ avec le vrai nom
            suggestionBox.style.display = 'none'; // On cache le menu
            syncSettings(); // On envoie immédiatement le choix aux invités via Firebase
        });
        
        suggestionBox.appendChild(li);
    });
}

inputStartPage.addEventListener('input', handleInput);
inputEndPage.addEventListener('input', handleInput);
// Cacher les menus si on clique n'importe où ailleurs sur la page
document.addEventListener('click', (e) => {
    if (e.target !== inputStartPage) startSuggestions.style.display = 'none';
    if (e.target !== inputEndPage) endSuggestions.style.display = 'none';
});


// --- VARIABLES ÉCRAN DE JEU ---
const btnStartGame = document.getElementById('btn-start-game');
const gameScreen = document.getElementById('game-screen');
const targetPageDisplay = document.getElementById('target-page');
const clickCountDisplay = document.getElementById('click-count');
const wikiContent = document.getElementById('wiki-content');

let currentClicks = 0;
let targetArticle = "";

// --- LANCER LA PARTIE ---
// On dégrise le bouton "Lancer" uniquement si on a bien deux mots
setInterval(() => {
    if (inputStartPage.value && inputEndPage.value) {
        btnStartGame.disabled = false;
    } else {
        btnStartGame.disabled = true;
    }
}, 500);

btnStartGame.addEventListener('click', async () => {
    await update(ref(db, 'rooms/' + currentRoom), {
        status: "playing",
        surrenders: null,  
        settings: {
            startPage: inputStartPage.value,
            endPage: inputEndPage.value
        }
    });
});

// --- BOUTON ABANDON ---
btnSurrender.addEventListener('click', async () => {
    btnSurrender.disabled = true;
    // On ajoute un vote d'abandon dans Firebase pour ce joueur
    await update(ref(db, `rooms/${currentRoom}/surrenders`), {
        [playerId]: true
    });
});

// --- FONCTION DE SYNCHRONISATION EN TEMPS RÉEL (MISE À JOUR) ---
function listenToRoom(roomCode) {
    const roomRef = ref(db, 'rooms/' + roomCode);
    
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Synchro des champs de texte (pour les invités uniquement)
        if (!isHost) {
            inputStartPage.value = data.settings.startPage || "";
            inputEndPage.value = data.settings.endPage || "";
            inputStartPage.disabled = true; // On bloque pour les invités
            inputEndPage.disabled = true;
            btnRandomStart.style.display = 'none'; // On cache les dés
            btnRandomEnd.style.display = 'none';
            btnStartGame.style.display = 'none'; // Seul l'hôte voit le bouton Lancer
        }

        // Mise à jour du nombre de joueurs ET de la liste des pseudos
        const playersList = data.players || {};
        playerCountDisplay.innerText = Object.keys(playersList).length;

        playerListDisplay.innerHTML = ''; // On vide l'ancienne liste
        for (const id in playersList) {
            const li = document.createElement('li');
            li.innerText = playersList[id].pseudo || "Anonyme";
            playerListDisplay.appendChild(li);
        }

        // --- GESTION DE L'ABANDON EN DIRECT ---
        if (data.status === "playing") {
            const numPlayers = Object.keys(playersList).length;
            const surrenders = data.surrenders || {};
            const numSurrenders = Object.keys(surrenders).length;
            
            // Mise à jour du texte du bouton
            btnSurrender.innerText = `SURREND ${numSurrenders}/${numPlayers}`;
            
            // Si ce joueur a déjà voté, on laisse grisé, sinon on active
            btnSurrender.disabled = !!surrenders[playerId];

            // Si TOUT LE MONDE a abandonné ! 🏳️
            if (numSurrenders === numPlayers && numPlayers > 0 && !data.winner) {
                if (isHost) { 
                    // Seul l'hôte déclare la fin pour éviter que tout le monde envoie l'ordre en même temps
                    update(ref(db, 'rooms/' + currentRoom), {
                        winner: { id: "surrender" } // Code spécial pour l'abandon
                    });
                }
            }
        }

        // Lancement de la partie
        if (data.status === "playing" && lobbyScreen.style.display === 'block') {
            lobbyScreen.style.display = 'none';
            resultScreen.style.display = 'none'; // Au cas où on revient d'une partie
            gameScreen.style.display = 'block';
            targetArticle = data.settings.endPage;
            targetPageDisplay.innerText = targetArticle;
            
            // On initialise notre chemin avec la page de départ
            currentClicks = 0;
            clickCountDisplay.innerText = "0";
            update(ref(db, `rooms/${currentRoom}/players/${playerId}`), {
                path: [data.settings.startPage] 
            });

            loadWikiPage(data.settings.startPage);
        }

        // Gestion de la Victoire et affichage des résultats
        if (data.winner) {
            showResults(data);
        }

        // Retour au lobby (si l'hôte reset la partie)
        if (data.status === "waiting" && lobbyScreen.style.display === 'none' && !data.winner) {
            gameScreen.style.display = 'none';
            resultScreen.style.display = 'none';
            lobbyScreen.style.display = 'block';
        }
    });
}

// --- MOTEUR D'AFFICHAGE DE L'ARTICLE WIKI ---
async function loadWikiPage(pageTitle) {
    wikiContent.innerHTML = "<h2>Chargement de l'article... ⏳</h2>";

    // On demande le code HTML de l'article à l'API
    const url = `${WIKI_API_URL}?action=parse&page=${pageTitle}&format=json&origin=*&disableeditsection=true`;
    const response = await fetch(url);
    const data = await response.json();
    
    // On récupère le texte ET on fabrique notre propre sommaire
    const htmlBrut = data.parse.text['*'];
    const sections = data.parse.sections; // La liste des titres fournie par l'API

    let tocHtml = '';
    if (sections && sections.length > 0) {
        tocHtml = '<div class="custom-toc"><h3>Sommaire</h3><ul>';
        sections.forEach(sec => {
            // sec.toclevel nous donne l'indentation (Titre 1, Titre 2, etc.)
            // sec.anchor nous donne le lien vers le paragraphe
            tocHtml += `<li class="toc-level-${sec.toclevel}"><a href="#${sec.anchor}">${sec.number} ${sec.line}</a></li>`;
        });
        tocHtml += '</ul></div>';
    }

    // On injecte le tout : Le grand Titre + Le Sommaire + L'article
    wikiContent.innerHTML = `<h1>${pageTitle}</h1>` + tocHtml + htmlBrut;

    // ON INTERCEPTE TOUS LES CLICS
    const links = wikiContent.querySelectorAll('a');
    
    links.forEach(link => {
        link.addEventListener('click', async (e) => {
            const href = link.getAttribute('href');

            // Si le joueur clique sur le sommaire (lien commençant par #)
            if (href && href.startsWith('#')) {
                return; // On arrête le script ici. Le navigateur va défiler tout seul, et ça ne compte pas de clic !
            }

            e.preventDefault(); // Pour tous les autres liens, on bloque le comportement normal

            // On vérifie si c'est un lien valide (qui commence par /wiki/ et qui n'est pas un fichier/image)
            if (href && href.startsWith('/wiki/') && !href.includes(':')) {
                
                // EXTRACTION PROPRE : On enlève /wiki/, on décode les caractères spéciaux (%20...), et on remplace les "_" par des espaces
                const rawName = href.replace('/wiki/', '');
                const nextPage = decodeURIComponent(rawName).replaceAll('_', ' ');
                
                // On incrémente le score
                currentClicks++;
                clickCountDisplay.innerText = currentClicks;

                // On sauvegarde dans Firebase (avec le joli nom sans tirets)
                const snapshot = await get(ref(db, `rooms/${currentRoom}/players/${playerId}/path`));
                let currentPath = snapshot.val() || [];
                currentPath.push(nextPage);

                await update(ref(db, `rooms/${currentRoom}/players/${playerId}`), {
                    path: currentPath,
                    score: currentClicks
                });

                // NORMALISATION SI ON A DES ESPACES OU UNDERSCORES
                // On met tout en minuscules, on retire les espaces superflus pour être sûr à 100%
                const cleanNextPage = nextPage.toLowerCase().trim();
                const cleanTarget = targetArticle.toLowerCase().trim().replaceAll('_', ' ');

                if (cleanNextPage === cleanTarget) {
                    
                    // On prévient TOUT LE MONDE via Firebase qu'on a gagné
                    update(ref(db, 'rooms/' + currentRoom), {
                        winner: {
                            id: playerId,        
                            clicks: currentClicks 
                        }
                    });
                    
                } else {
                    // Sinon, on charge la page suivante (qui s'affichera proprement sans tirets du bas)
                    loadWikiPage(nextPage);
                }
            } else {
                alert("🚫 Lien invalide ! Reste sur les articles de l'encyclopédie.");
            }
        });
    });
}

// --- GESTION DES RÉSULTATS (FIN DE PARTIE) ---
function showResults(data) {
    gameScreen.style.display = 'none';
    resultScreen.style.display = 'block';

    resultsContainer.innerHTML = ''; // On vide les anciens résultats

    // On change le titre principal si c'est un abandon collectif
    const titleElement = document.querySelector('#result-screen h1');
    if (data.winner && data.winner.id === "surrender") {
        titleElement.innerText = "🏳️ Tout le monde a abandonné !";
    } else {
        titleElement.innerText = "🏁 Fin de la course !";
    }

    // On boucle sur tous les joueurs
    for (const id in data.players) {
        const player = data.players[id];
        const isWinner = data.winner && data.winner.id === id;
        const path = player.path || [];

        const playerDiv = document.createElement('div');
        playerDiv.style.margin = "20px 0";
        playerDiv.style.padding = "15px";
        playerDiv.style.background = isWinner ? "#d4edda" : "#f8f9fa";
        playerDiv.style.border = isWinner ? "2px solid #28a745" : "1px solid #ccc";
        playerDiv.style.borderRadius = "8px";

        // On gère l'orthographe : "clic" ou "clics"
        const nbClics = path.length - 1;
        const textClics = nbClics <= 1 ? "clic" : "clics";

        // On récupère le pseudo ET on le nettoie contre les failles XSS
        const rawPseudo = player.pseudo || "Anonyme";
        const pseudo = escapeHTML(rawPseudo);

        playerDiv.innerHTML = `
            <h3>${isWinner ? '🏆 GAGNANT : ' + pseudo : '🏃 ' + pseudo} (${nbClics} ${textClics})</h3>
            <p style="line-height: 1.6;">${path.join(' ➔ ')}</p>
        `;
        resultsContainer.appendChild(playerDiv);
    }

    // Seul l'hôte voit le bouton pour relancer
    if (isHost) {
        btnBackToLobby.style.display = 'inline-block';
    } else {
        btnBackToLobby.style.display = 'none';
        // Petit message d'attente pour les invités
        const waitMessage = document.createElement('p');
        waitMessage.innerText = "En attente de l'hôte pour rejouer...";
        resultsContainer.appendChild(waitMessage);
    }
}

// L'hôte clique sur "Retour au salon"
btnBackToLobby.addEventListener('click', () => {
    // On remet la partie à zéro dans Firebase
    update(ref(db, 'rooms/' + currentRoom), {
        status: "waiting",
        winner: null
    });
});