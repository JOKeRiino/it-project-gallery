const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
	socket.userData = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }; //Default values;

	console.log(`${socket.id} connected`);
	socket.on('disconnect', function () {
		console.log(`Player ${socket.id} disconnected`);
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
	});

	socket.on('update', function (data) {
		// console.log(`socket update ${socket.id}`);
		socket.userData.x = data.x;
		socket.userData.y = data.y;
		socket.userData.z = data.z;
		socket.userData.ry = data.ry;
		socket.userData.rx = data.rx;
		socket.userData.rz = data.rz;
	});
});

http.listen(3000, function () {
	console.log('Listening on port 3000: http://localhost:3000/');
});

setInterval(function () {
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
		});
	}

	if (players.length > 0) io.emit('players', players);
}, 40);
