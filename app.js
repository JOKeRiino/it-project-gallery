const express = require('express');
const app = express();
const _hserver = require('http').Server;
const http = new _hserver(app);
const sio = require('socket.io')
const io = new sio.Server(http);

app.use(express.static(__dirname));
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/index.html');
});

/**
 * @typedef userData
 * @property {number} x current x position
 * @property {number} y current y position
 * @property {number} z current z position
 * @property {number} rx current x rotation
 * @property {number} ry current y rotation
 * @property {number} rz current z rotation
 * @property {number} velocity current movement speed
 * @property {string} model user chosen model
 * @property {string} name user chosen nickname
 */

/**
 * @typedef SocketExtensions
 * @property {userData} userData
 * @property {boolean} changed
 * @property {boolean} reinit
 * 
 * @typedef {sio.Socket & SocketExtensions} ExtendedSocket
 */

io.on('connection', /**@param {ExtendedSocket} socket*/function (socket) {
	/**@type {userData} */
	socket.userData = null;
	socket.changed = false;
	socket.reinit = false

	console.log(`${socket.id} connected`);
	socket.on('disconnect', function () {
		console.log(`Player ${socket.id} disconnected`);
		io.emit('leave',socket.id)
	});

	socket.on('init', function (data) {
		console.log(`socket init ${socket.id}`);
		socket.userData = {}
		socket.userData.model = data.model;
		// socket.userData.colour = data.colour;
		socket.userData.x = data.x;
		socket.userData.y = data.y;
		socket.userData.z = data.z;
		socket.userData.ry = data.ry;
		socket.userData.rx = data.rx;
		socket.userData.rz = data.rz;
		socket.userData.velocity = data.velocity;
		socket.userData.name = data.name;
		socket.changed = true
		socket.reinit = true
	});

	socket.on('update', function (data) {
		// console.log(`socket update ${socket.id}`);
		socket.userData.x = data.x;
		socket.userData.y = data.y;
		socket.userData.z = data.z;
		socket.userData.ry = data.ry;
		socket.userData.rx = data.rx;
		socket.userData.rz = data.rz;
		socket.userData.velocity = data.velocity;

		socket.changed = true;
	});

	//Client requests the current full player state
	socket.on('players', () => {
		let players = [];

		for (const [_, socket] of io.of('/').sockets) {
			if(!socket.userData) continue
			// console.log(socket);
			players.push({
				id: socket.id,
				name: socket.userData.name,
				model: socket.userData.model,
				x: socket.userData.x,
				y: socket.userData.y,
				z: socket.userData.z,
				ry: socket.userData.ry,
				rx: socket.userData.rx,
				rz: socket.userData.rz,
				velocity: socket.userData.velocity
			});
		}

		socket.emit('players', players);
	});
});

http.listen(3000, function () {
	console.log('Listening on port 3000: http://localhost:3000/');
});

setInterval(function () {
	let players = [];

	for (const [_, socket] of io.of('/').sockets) {
		// console.log(socket);
		if (socket.changed) {
			players.push({
				id: socket.id,
				model: socket.reinit?socket.userData.model:null,
				name: socket.reinit?socket.userData.name:null,
				x: socket.userData.x,
				y: socket.userData.y,
				z: socket.userData.z,
				ry: socket.userData.ry,
				rx: socket.userData.rx,
				rz: socket.userData.rz,
				velocity: socket.userData.velocity,
			});
			socket.changed = false;
		}
	}

	if (players.length > 0) io.emit('update', players);
}, 40);
