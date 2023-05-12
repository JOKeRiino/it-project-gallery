const express = require('express');
const app = express();
const _hserver = require('http').Server;
const http = new _hserver(app);
const SIOServer = require('socket.io').Server;
const io = new SIOServer(http);

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
 * @  property {any?} model user chosen model
 * @  property {any?} colour skin color or similar
 */

io.on('connection', function (socket) {
	socket.userData = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }; //Default values;
	socket.changed = true;

	console.log(`${socket.id} connected`);
	socket.on('disconnect', function () {
		console.log(`Player ${socket.id} disconnected`);
		io.emit('leave',socket.id)
	});

	socket.on('init', function (data) {
		console.log(`socket init ${socket.id}`);
		// socket.userData.model = data.model;
		// socket.userData.colour = data.colour;
		socket.userData.x = data.x;
		socket.userData.y = data.y;
		socket.userData.z = data.z;
		socket.userData.ry = data.ry;
		socket.userData.rx = data.rx;
		socket.userData.rz = data.rz;
		socket.userData.velocity = data.velocity;
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
			// console.log(socket);
			players.push({
				id: socket.id,
				// model: socket.userData.model,
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
				// model: socket.userData.model,
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
