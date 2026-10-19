// =====================================================
//  SERVIDOR MOKEPON (backend multijugador)
//  Ejecutar con:  npm install   y luego   npm start
//  Después abre en el navegador:  http://localhost:8080
// =====================================================
const express = require("express")
const cors = require("cors")
const path = require("path")
const crypto = require("crypto")

const app = express()
const PUERTO = 8080

app.use(cors())
app.use(express.json())

// El servidor también entrega el juego (carpeta public),
// así no necesitas Live Server: todo está en http://localhost:8080
app.use(express.static(path.join(__dirname, "public")))

// Lista de jugadores conectados
const jugadores = []

class Jugador {
    constructor(id) {
        this.id = id
        this.mokepon = null      // nombre de la mascota
        this.x = 0
        this.y = 0
        this.enemigoId = null    // con quién está peleando
        this.ataques = {}        // { 1: "Fuego🔥", 2: "Agua💧", ... } por ronda
        this.ultimaVez = Date.now()
    }
}

// Busca un jugador y marca que sigue conectado
function buscarJugador(id) {
    const jugador = jugadores.find((j) => j.id === id)
    if (jugador) jugador.ultimaVez = Date.now()
    return jugador
}

function quitarJugador(id) {
    const indice = jugadores.findIndex((j) => j.id === id)
    if (indice >= 0) jugadores.splice(indice, 1)
}

// 1. Unirse al juego: devuelve un id único
app.get("/unirse", (req, res) => {
    const id = crypto.randomUUID()
    jugadores.push(new Jugador(id))
    res.send(id)
})

// 2. Guardar qué mokepon eligió el jugador
app.post("/mokepon/:jugadorId", (req, res) => {
    const jugador = buscarJugador(req.params.jugadorId)
    if (!jugador) return res.status(404).send({ error: "Jugador no encontrado" })

    jugador.mokepon = req.body.mokepon || null
    res.send({ ok: true })
})

// 3. Actualizar posición y recibir la de los demás
app.post("/mokepon/:jugadorId/posicion", (req, res) => {
    const jugador = buscarJugador(req.params.jugadorId)
    if (!jugador) return res.status(404).send({ error: "Jugador no encontrado" })

    jugador.x = Number(req.body.x) || 0
    jugador.y = Number(req.body.y) || 0

    // Enemigos visibles: tienen mascota y no están peleando
    const enemigos = jugadores
        .filter((j) => j.id !== jugador.id && j.mokepon && !j.enemigoId)
        .map((j) => ({ id: j.id, mokepon: j.mokepon, x: j.x, y: j.y }))

    // Si alguien chocó conmigo, aviso que me retaron
    let reto = null
    if (jugador.enemigoId) {
        const enemigo = jugadores.find((j) => j.id === jugador.enemigoId)
        if (enemigo) reto = { id: enemigo.id, mokepon: enemigo.mokepon }
    }

    res.send({ enemigos, reto })
})

// 4. Iniciar combate (cuando dos mokepones chocan en el mapa)
app.post("/mokepon/:jugadorId/combate", (req, res) => {
    const jugador = buscarJugador(req.params.jugadorId)
    const enemigo = jugadores.find((j) => j.id === req.body.enemigoId)
    if (!jugador || !enemigo) return res.status(404).send({ error: "Jugador no encontrado" })

    const yoOcupado = jugador.enemigoId && jugador.enemigoId !== enemigo.id
    const elOcupado = enemigo.enemigoId && enemigo.enemigoId !== jugador.id
    if (yoOcupado || elOcupado) return res.status(409).send({ error: "Ya está en combate" })

    if (!jugador.enemigoId) {
        jugador.enemigoId = enemigo.id
        enemigo.enemigoId = jugador.id
        jugador.ataques = {}
        enemigo.ataques = {}
    }

    res.send({ ok: true, enemigo: { id: enemigo.id, mokepon: enemigo.mokepon } })
})

// 5. Enviar mi ataque de una ronda
app.post("/mokepon/:jugadorId/ataques", (req, res) => {
    const jugador = buscarJugador(req.params.jugadorId)
    if (!jugador) return res.status(404).send({ error: "Jugador no encontrado" })

    jugador.ataques[req.body.ronda] = req.body.ataque
    res.send({ ok: true })
})

// 6. Consultar el ataque del enemigo en una ronda
app.get("/mokepon/:jugadorId/ataques/:ronda", (req, res) => {
    const jugador = buscarJugador(req.params.jugadorId)
    if (!jugador) return res.status(404).send({ error: "Jugador no encontrado" })

    const enemigo = jugadores.find((j) => j.id === jugador.enemigoId)
    if (!enemigo) return res.status(410).send({ desconectado: true })

    res.send({ ataque: enemigo.ataques[req.params.ronda] || null })
})

// 7. Salir del juego (al cerrar o recargar la página)
app.post("/mokepon/:jugadorId/salir", (req, res) => {
    quitarJugador(req.params.jugadorId)
    res.send({ ok: true })
})

// Limpieza: quita a quien lleva más de 10 segundos sin dar señales
setInterval(() => {
    const ahora = Date.now()
    jugadores
        .filter((j) => ahora - j.ultimaVez > 10000)
        .forEach((j) => quitarJugador(j.id))
}, 3000)

app.listen(PUERTO, () => {
    console.log(`Servidor Mokepon listo 👉 http://localhost:${PUERTO}`)
})
