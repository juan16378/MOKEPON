
//carga de componentes
window.addEventListener('load', startGame)

// Si abres el juego desde el servidor (http://localhost:8080) queda vacío.
// Si lo abres con Live Server, apunta al servidor de Node en el puerto 8080.
const SERVIDOR = location.port === "8080" ? "" : "http://localhost:8080"

//lista de mascota
let animalEmojis = [
    { name: "Hipodoge", emoji: "🐘", img: "./assets/mokepons_mokepon_hipodoge_attack.png" },
    { name: "Capipepo", emoji: "🦔", img: "./assets/mokepons_mokepon_capipepo_attack.png" },
    { name: "Ratigueya", emoji: "🦝", img: "./assets/mokepons_mokepon_ratigueya_attack.webp" }
];

//lista de ataques
let attacksEmojis = [
    { name: "Fuego", emoji: "🔥" },
    { name: "Agua", emoji: "💧" },
    { name: "Tierra", emoji: "🌱" }
]

//vidas
let vidasJugador = ["❤️","❤️","❤️"]
let vidasEnemigo = ["❤️","❤️","❤️"]

//mascotas seleccionadas
let nameAnimalSelected = "";
let nameAnimalSelectedEnemy = "";
let emojiAnimalSelected = "";
let emojiAnimalSelectedEnemy = "";

//combate
let attackPlayer = ""
let attackEnemy = "";
let combatStatus = ""
let juegoTerminado = false

// ===== MAPA =====
const ANCHO_MAPA = 640
const ALTO_MAPA = 480
const TAMANO = 70        // tamaño de cada mokepon en el mapa
const VELOCIDAD = 4
const MARGEN_CHOQUE = 14 // las imágenes tienen bordes vacíos; achicamos la caja de choque

let lienzo = null
let mapa = null
let imagenes = {}
let miMokepon = null       // { nombre, emoji, x, y }
let bots = []              // mokepones salvajes (controlados por la computadora)
let enemigosOnline = []    // otros jugadores conectados
let teclas = {}
let animacion = null
let enCombate = false

// ===== MULTIJUGADOR =====
let jugadorId = null
let enLinea = false
let enemigoActual = null   // { id, nombre, bot }
let ronda = 1
let esperandoEnemigo = false
let intervaloRed = null
let pidiendoCombate = false
let ignorados = {}         // enemigos que rechazaron combate hace poco

//ataques del jugador
function startGame(){
    let sectionSeleccionarAtaque = document.getElementById("seleccionar_ataque");
    sectionSeleccionarAtaque.style.display = 'none'

    document.getElementById("ver_mapa").style.display = 'none'

    let btnSelect = document.getElementById("btn-select")
    btnSelect.addEventListener("click", selectJugador)

    let btnReset = document.getElementById('btn-reset')
    btnReset.style.display = "none";
    btnReset.addEventListener("click", reiniciarJuego)

    let btnFuego = document.getElementById("btn-fuego")
    btnFuego.addEventListener("click", showAttack)

    let btnAgua = document.getElementById("btn-agua")
    btnAgua.addEventListener("click", showAttack)

    let btnTierra = document.getElementById("btn-tierra")
    btnTierra.addEventListener("click", showAttack)

    cargarImagenes()
    configurarControles()
    unirseAlJuego()

    // Avisar al servidor cuando el jugador cierra o recarga la página
    window.addEventListener("pagehide", () => {
        if (enLinea && jugadorId) {
            navigator.sendBeacon(`${SERVIDOR}/mokepon/${jugadorId}/salir`)
        }
    })
}

function cargarImagenes(){
    animalEmojis.forEach((animal) => {
        let imagen = new Image()
        imagen.src = animal.img
        imagenes[animal.name] = imagen
    })
}

function buscarAnimal(nombre){
    return animalEmojis.find((animal) => animal.name === nombre) || animalEmojis[0]
}

// ===== CONEXIÓN CON EL SERVIDOR =====
async function unirseAlJuego(){
    try {
        let respuesta = await fetch(`${SERVIDOR}/unirse`)
        if (!respuesta.ok) throw new Error("Sin servidor")
        jugadorId = await respuesta.text()
        enLinea = true
    } catch (error) {
        enLinea = false
    }
}

//mascota del jugador
function selectJugador(){
    let numSelect = 0
    if(document.getElementById("hipodoge").checked){
        numSelect = 1
    }else if(document.getElementById("capipepo").checked){
        numSelect = 2
    }else if(document.getElementById("ratigueya").checked){
        numSelect = 3
    }else{
        alert("Debes seleccionar una mascota");
        return
    }

    let animal = animalEmojis[numSelect - 1]
    let spanNameAnimal = document.getElementById("name-player");

    nameAnimalSelected = animal.emoji + animal.name;
    emojiAnimalSelected = animal.emoji;
    spanNameAnimal.innerHTML = `Jugador: ${nameAnimalSelected}`;
    document.getElementById("img-player").src = animal.img

    let sectionElegirMascota = document.getElementById('seleccionar_mascota');
    sectionElegirMascota.style.display="none";

    if (enLinea) {
        fetch(`${SERVIDOR}/mokepon/${jugadorId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mokepon: animal.name })
        }).catch(() => {})
    }

    iniciarMapa(animal)
}

// ===== MAPA CON CANVAS =====
function iniciarMapa(animal){
    document.getElementById("ver_mapa").style.display = 'flex'

    lienzo = document.getElementById("mapa")
    lienzo.width = ANCHO_MAPA
    lienzo.height = ALTO_MAPA
    mapa = lienzo.getContext("2d")

    miMokepon = {
        nombre: animal.name,
        emoji: animal.emoji,
        x: getRandom(20, ANCHO_MAPA - TAMANO - 20),
        y: getRandom(20, ALTO_MAPA - TAMANO - 20)
    }

    crearBots()

    animacion = requestAnimationFrame(cicloDelJuego)

    if (enLinea) {
        intervaloRed = setInterval(enviarPosicion, 100)
    }
}

function crearBots(){
    bots = []
    animalEmojis.forEach((animal, i) => {
        let x, y, intentos = 0
        // Buscar un lugar lejos del jugador y de los otros bots
        do {
            x = getRandom(10, ANCHO_MAPA - TAMANO - 10)
            y = getRandom(10, ALTO_MAPA - TAMANO - 10)
            intentos++
        } while (intentos < 50 && (
            distancia(x, y, miMokepon.x, miMokepon.y) < 180 ||
            bots.some((b) => distancia(x, y, b.x, b.y) < 110)
        ))

        bots.push({ id: `bot-${i}`, nombre: animal.name, x, y, bot: true })
    })
}

function cicloDelJuego(){
    if (enCombate) return

    moverMiMokepon()
    pintarMapa()
    revisarColisiones()

    animacion = requestAnimationFrame(cicloDelJuego)
}

function moverMiMokepon(){
    if (teclas.arriba) miMokepon.y -= VELOCIDAD
    if (teclas.abajo) miMokepon.y += VELOCIDAD
    if (teclas.izquierda) miMokepon.x -= VELOCIDAD
    if (teclas.derecha) miMokepon.x += VELOCIDAD

    // No salirse del mapa
    miMokepon.x = Math.max(0, Math.min(ANCHO_MAPA - TAMANO, miMokepon.x))
    miMokepon.y = Math.max(0, Math.min(ALTO_MAPA - TAMANO, miMokepon.y))
}

function pintarMapa(){
    pintarFondo()

    bots.forEach((bot) => pintarMokepon(bot, "Salvaje", "#ffffff"))
    enemigosOnline.forEach((enemigo) => pintarMokepon(enemigo, "Jugador", "#ff90e8"))
    pintarMokepon(miMokepon, "Tú", "#feed01")
}

function pintarFondo(){
    // Pasto a cuadros
    for (let x = 0; x < ANCHO_MAPA; x += 40) {
        for (let y = 0; y < ALTO_MAPA; y += 40) {
            mapa.fillStyle = ((x + y) / 40) % 2 === 0 ? "#8fd16a" : "#86c962"
            mapa.fillRect(x, y, 40, 40)
        }
    }

    // Caminos
    mapa.fillStyle = "#e8d39a"
    mapa.fillRect(0, ALTO_MAPA / 2 - 25, ANCHO_MAPA, 50)
    mapa.fillRect(ANCHO_MAPA / 2 - 25, 0, 50, ALTO_MAPA)

    // Lago
    mapa.fillStyle = "#6ec6f0"
    mapa.strokeStyle = "black"
    mapa.lineWidth = 2
    mapa.beginPath()
    mapa.ellipse(530, 100, 70, 42, 0, 0, Math.PI * 2)
    mapa.fill()
    mapa.stroke()

    // Árboles
    const arboles = [[60, 60], [140, 380], [470, 400], [580, 330], [90, 300], [230, 90]]
    arboles.forEach(([x, y]) => {
        mapa.fillStyle = "#8b5a2b"
        mapa.fillRect(x - 5, y, 10, 18)
        mapa.fillStyle = "#3f9b3f"
        mapa.beginPath()
        mapa.arc(x, y, 20, 0, Math.PI * 2)
        mapa.fill()
        mapa.stroke()
    })
}

function pintarMokepon(mokepon, etiqueta, color){
    let imagen = imagenes[mokepon.nombre]
    if (imagen && imagen.complete) {
        mapa.drawImage(imagen, mokepon.x, mokepon.y, TAMANO, TAMANO)
    }

    // Etiqueta encima del mokepon
    mapa.font = "500 13px Oswald, sans-serif"
    let ancho = mapa.measureText(etiqueta).width + 12
    let x = mokepon.x + TAMANO / 2 - ancho / 2
    let y = mokepon.y - 16
    mapa.fillStyle = color
    mapa.strokeStyle = "black"
    mapa.lineWidth = 2
    mapa.fillRect(x, y, ancho, 18)
    mapa.strokeRect(x, y, ancho, 18)
    mapa.fillStyle = "black"
    mapa.fillText(etiqueta, x + 6, y + 14)
}

// ===== COLISIONES =====
function revisarColisiones(){
    if (pidiendoCombate) return

    let todos = [...bots, ...enemigosOnline]
    for (let enemigo of todos) {
        if (ignorados[enemigo.id] && Date.now() < ignorados[enemigo.id]) continue
        if (hayColision(miMokepon, enemigo)) {
            iniciarCombate(enemigo)
            return
        }
    }
}

function hayColision(a, b){
    const arribaA = a.y + MARGEN_CHOQUE
    const abajoA = a.y + TAMANO - MARGEN_CHOQUE
    const izquierdaA = a.x + MARGEN_CHOQUE
    const derechaA = a.x + TAMANO - MARGEN_CHOQUE

    const arribaB = b.y + MARGEN_CHOQUE
    const abajoB = b.y + TAMANO - MARGEN_CHOQUE
    const izquierdaB = b.x + MARGEN_CHOQUE
    const derechaB = b.x + TAMANO - MARGEN_CHOQUE

    if (abajoA < arribaB || arribaA > abajoB || derechaA < izquierdaB || izquierdaA > derechaB) {
        return false
    }
    return true
}

async function iniciarCombate(enemigo){
    if (enemigo.bot) {
        entrarAlCombate(enemigo)
        return
    }

    // Contra otro jugador: pedirle al servidor que nos empareje
    pidiendoCombate = true
    try {
        let respuesta = await fetch(`${SERVIDOR}/mokepon/${jugadorId}/combate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enemigoId: enemigo.id })
        })
        if (respuesta.ok) {
            entrarAlCombate(enemigo)
        } else {
            ignorados[enemigo.id] = Date.now() + 2000
        }
    } catch (error) {
        ignorados[enemigo.id] = Date.now() + 2000
    }
    pidiendoCombate = false
}

async function enviarPosicion(){
    try {
        let respuesta = await fetch(`${SERVIDOR}/mokepon/${jugadorId}/posicion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x: miMokepon.x, y: miMokepon.y })
        })
        if (!respuesta.ok) return
        let { enemigos, reto } = await respuesta.json()

        if (enCombate) return

        // Otro jugador chocó conmigo: entro al combate
        if (reto) {
            entrarAlCombate({ id: reto.id, nombre: reto.mokepon, bot: false })
            return
        }

        enemigosOnline = enemigos.map((e) => ({ id: e.id, nombre: e.mokepon, x: e.x, y: e.y, bot: false }))
    } catch (error) {
        // Si falla una vez no pasa nada, lo intentamos en el siguiente envío
    }
}

// ===== CONTROLES =====
function configurarControles(){
    const mapaTeclas = {
        ArrowUp: "arriba", w: "arriba", W: "arriba",
        ArrowDown: "abajo", s: "abajo", S: "abajo",
        ArrowLeft: "izquierda", a: "izquierda", A: "izquierda",
        ArrowRight: "derecha", d: "derecha", D: "derecha"
    }

    window.addEventListener("keydown", (e) => {
        if (mapaTeclas[e.key] && miMokepon && !enCombate) {
            teclas[mapaTeclas[e.key]] = true
            e.preventDefault()
        }
    })
    window.addEventListener("keyup", (e) => {
        if (mapaTeclas[e.key]) teclas[mapaTeclas[e.key]] = false
    })

    // Botones en pantalla (sirven en celular)
    const botones = { "btn-arriba": "arriba", "btn-abajo": "abajo", "btn-izquierda": "izquierda", "btn-derecha": "derecha" }
    Object.entries(botones).forEach(([id, direccion]) => {
        let boton = document.getElementById(id)
        boton.addEventListener("pointerdown", () => teclas[direccion] = true)
        boton.addEventListener("pointerup", () => teclas[direccion] = false)
        boton.addEventListener("pointerleave", () => teclas[direccion] = false)
        boton.addEventListener("pointercancel", () => teclas[direccion] = false)
    })
}

//mascota del enemigo (la que chocamos en el mapa)
function entrarAlCombate(enemigo){
    if (enCombate) return
    enCombate = true
    enemigoActual = enemigo
    teclas = {}
    cancelAnimationFrame(animacion)
    // El intervalo de posición sigue activo en línea: le dice al servidor que seguimos conectados

    let animal = buscarAnimal(enemigo.nombre)
    let spanNameAnimalEnemy = document.getElementById("name-enemy");

    nameAnimalSelectedEnemy = animal.emoji + animal.name;
    emojiAnimalSelectedEnemy = animal.emoji;

    let tipo = enemigo.bot ? "Salvaje" : "Jugador"
    spanNameAnimalEnemy.innerHTML = `${tipo}: ${nameAnimalSelectedEnemy}`
    document.getElementById("img-enemy").src = animal.img

    document.getElementById("ver_mapa").style.display = 'none'

    let sectionSeleccionarAtaque = document.getElementById("seleccionar_ataque");
    let boxInfoPelea = document.getElementById("mensajes");
    sectionSeleccionarAtaque.style.display = 'flex';
    boxInfoPelea.style.display = 'flex'
}

function showAttack(e){
    if (esperandoEnemigo || juegoTerminado) return

    let btn = e.currentTarget;
    attackPlayer = btn.textContent.trim();

    if (enemigoActual.bot) {
        selectAttackEnemy();
        resolverRonda();
    } else {
        enviarAtaqueOnline();
    }
}

function resolverRonda(){
    resultCombat();
    mensaje();
    showLiveStatus();
    reviewlives();
}

//ataque del enemigo (salvaje)
function selectAttackEnemy(){
    let numRandom = getRandom(1,3);
    attackEnemy = attacksEmojis[numRandom - 1].name + attacksEmojis[numRandom -1 ].emoji;
}

//ataque del enemigo (otro jugador, llega por el servidor)
async function enviarAtaqueOnline(){
    esperandoEnemigo = true
    activarAtaques(false)
    let estado = document.getElementById("estado-ronda")
    estado.textContent = "⏳ Esperando el ataque del enemigo..."

    let rondaActual = ronda
    try {
        await fetch(`${SERVIDOR}/mokepon/${jugadorId}/ataques`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ronda: rondaActual, ataque: attackPlayer })
        })
    } catch (error) {
        estado.textContent = "⚠️ No se pudo enviar el ataque, inténtalo otra vez"
        esperandoEnemigo = false
        activarAtaques(true)
        return
    }

    let sondeo = setInterval(async () => {
        try {
            let respuesta = await fetch(`${SERVIDOR}/mokepon/${jugadorId}/ataques/${rondaActual}`)
            if (respuesta.status === 410) {
                clearInterval(sondeo)
                estado.textContent = ""
                esperandoEnemigo = false
                mensajeFinal("🔌 Tu enemigo se desconectó.")
                disabledAttack()
                juegoTerminado = true
                return
            }
            let datos = await respuesta.json()
            if (datos.ataque) {
                clearInterval(sondeo)
                attackEnemy = datos.ataque
                estado.textContent = ""
                esperandoEnemigo = false
                ronda++
                resolverRonda()
                if (!juegoTerminado) activarAtaques(true)
            }
        } catch (error) {
            // Reintentamos en el siguiente sondeo
        }
    }, 500)
}

// agua > fuego
// fuego > tierra
// tiera > agua
function resultCombat(){

    if(attackPlayer == attackEnemy){
        combatStatus = "EMPATE ⭕"
    }else if(attackPlayer == "Fuego🔥" && attackEnemy == "Tierra🌱"){
        combatStatus = "GANASTE ✅"
        vidasEnemigo.pop();
    }else if(attackPlayer == "Agua💧" && attackEnemy == "Fuego🔥"){
        combatStatus= "GANASTE ✅"
        vidasEnemigo.pop();
    }else if(attackPlayer == "Tierra🌱" && attackEnemy == "Agua💧"){
        combatStatus = "GANASTE ✅"
        vidasEnemigo.pop();
    }else{
        combatStatus = "PERDISTE ❌"
        vidasJugador.pop();
    }
}

//actualizar vidas
function showLiveStatus(){
    let span_lives_player = document.getElementById("lives-player");
    let span_lives_enemy = document.getElementById("lives-enemy");

    span_lives_player.textContent = vidasJugador.join("") || "💀";
    span_lives_enemy.textContent = vidasEnemigo.join("") || "💀";
}

function reviewlives(){
    if (vidasEnemigo.length == 0){
        juegoTerminado = true
        mensajeFinal("🎊 GANASTE !!! 😄");
        disabledAttack();

    }else if(vidasJugador.length == 0){
        juegoTerminado = true
        mensajeFinal("💔 PERDISTE 😔");
        disabledAttack();
    }
}

function activarAtaques(activo){
    ["btn-fuego", "btn-agua", "btn-tierra"].forEach((id) => {
        document.getElementById(id).disabled = !activo
    })
}

function disabledAttack(){
    activarAtaques(false)
}

//Impresión ataques y resultados
function mensaje(){
    let newP = document.createElement("p");
    let secctionMessage = document.getElementById('mensajes');
    newP.innerHTML = `Jugador ${emojiAnimalSelected}: ${attackPlayer} - Enemigo ${emojiAnimalSelectedEnemy}: ${attackEnemy} ➡ ${combatStatus}`;
    secctionMessage.appendChild(newP);
}

function mensajeFinal(texto){
    let newh = document.createElement("h2");
    let secctionMessage = document.getElementById('mensajes');
    newh.innerHTML = texto + ' GAME OVER'
    secctionMessage.appendChild(newh);

    let btnReset = document.getElementById('btn-reset')
    btnReset.style.display = "block";
}

//Reiniciar juego
function reiniciarJuego(){
    location.reload();
}

//obtención de números aleatorios
function getRandom(min, max){
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function distancia(x1, y1, x2, y2){
    return Math.hypot(x1 - x2, y1 - y2)
}
