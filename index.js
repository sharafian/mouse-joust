const WebSocket = require('ws')
const Koa = require('koa')
const router = require('koa-router')()
const fs = require('fs-extra')
const path = require('path')
const app = new Koa()

const RADIUS = 30
const WIDTH = 400
const HEIGHT = 400

process.on('unhandledRejection', function (e) {
  console.error(e)
  process.exit(1)
})

;(async function run () {
  router.get('/', async ctx => {
    ctx.set('Content-Type', 'text/html')
    ctx.body = await fs.readFile(path.resolve(__dirname, 'static/index.html'))
  })

  const server = app
    .use(router.routes())
    .use(router.allowedMethods())
    .listen(process.env.PORT || 8080)

  const wss = new WebSocket.Server({ server })
  const games = {}

  wss.on('connection', ws => {
    let gameId = ''
    let playerId = ''

    ws.on('message', data => {
      const msg = JSON.parse(data)
      console.log('got message:', data)

      try {
        if (msg.type === 'join') {
          console.log('adding player')
          gameId = msg.game_id 
          games[gameId] = games[gameId] || {
            gameId,
            players: [],
            positions: {},
            eliminated: {},
            connections: {}
          }

          playerId = msg.player_id
          games[gameId].players.push(playerId)
          games[gameId].connections[playerId] = ws
          console.log('added ' + playerId + ' to ' + gameId)
        } else if (msg.type === 'start') {
          if (!gameId) throw new Error('error: no game id')
          if (games[gameId].started) throw new Error('error: already started')
          if (games[gameId].players.length < 2) throw new Error('error: not enough players')
          console.log('starting game')

          games[gameId].players.forEach(player => {
            games[gameId].positions[player] = {
              x: Math.floor(Math.random() * WIDTH),
              y: Math.floor(Math.random() * HEIGHT)
            }
          })

          games[gameId].started = true
          Object.values(games[gameId].connections).forEach(w => {
            w.send(JSON.stringify({ type: 'start', positions: games[gameId].positions }))
          })
          console.log('started game')
        } else if (msg.type === 'move') {
          if (!gameId) throw new Error('error: no game id')
          const g = games[gameId]
          if (!g.started) throw new Error('error: game not started')
          if (g.eliminated[playerId]) throw new Error('error: eliminated')
          if (msg.x > WIDTH || msg.y > HEIGHT || msg.x < 0 || msg.y < 0) {
            throw new Error('error: position is outside field')
          }

          g.positions[playerId] = { x: msg.x, y: msg.y }
          for (const player of Object.keys(g.positions)) {
            const squaredXDiff = Math.pow(msg.x - g.positions[player].x, 2)
            const squaredYDiff = Math.pow(msg.y - g.positions[player].y, 2)
            const distance = Math.sqrt(squaredXDiff + squaredYDiff)

            if (player !== playerId && distance < RADIUS) {
              g.eliminated[player] = true
              console.log('eliminated', player)
              if (Object.keys(g.eliminated).length === g.players.length - 1) {
                console.log('winner is', playerId)
                g.winner = playerId
                Object.values(games[gameId].connections).forEach(w => {
                  w.send(JSON.stringify({
                    type: 'winner',
                    player_id: playerId
                  }))
                })
              }
            }
          }
          Object.values(games[gameId].connections).forEach(w => {
            w.send(JSON.stringify({
              type: 'move',
              player_id: playerId,
              x: msg.x,
              y: msg.y
            }))
          })
        }
      } catch (e) {
        console.error('processing error:', e)
      }
    })
  })
})()
