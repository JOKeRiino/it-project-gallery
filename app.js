const express = require('express');
const app = express();
const http = require('http').createServer(app);
const sio = require('socket.io');
const io = new sio.Server(http);
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const proxy = require('express-http-proxy');

app.use(express.static(__dirname));
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/index.html');
});

// app.get('/image-proxy', async (req, res) => {
// 	const imageUrl = req.query.url;
	
// 	const response = await axios.get(imageUrl, {
// 		responseType: 'arraybuffer',
// 	});
// 	axios(imageUrl).

// 	res.set('Content-Type', response.headers['content-type']);
// 	res.send(response.data);
// });

app.use('/image-proxy', proxy('http://digbb.informatik.fh-nuernberg.de',{
	}
}))

app.get('/avatars', (req, res) => {
	let avail_avatars = fs.readdirSync(__dirname + '/img/models/avatars', {
		withFileTypes: true,
	});
	res.send(
		avail_avatars
			.filter(f => f.isFile() || f.isSymbolicLink())
			.map(f => f.name.replace(/.fbx$/, ''))
	);
});

app.get('/scrapeImages', (req, res) => {
	if (!fs.existsSync('imageData.json')) {
		console.log("file doesn't exist");
		getLatestImagesUrl().then(images => {
			res.send(JSON.stringify(images));
		});
	} else {
		console.log('file exists');
		res.send(JSON.parse(fs.readFileSync('imageData.json')));
	}
});

async function getLatestImagesUrl() {
	const { data } = await axios.get('http://digbb.informatik.fh-nuernberg.de/');
	const $ = cheerio.load(data);
	const matchingElements = $('.menu-item');
	let found = false;
	matchingElements.each((index, element) => {
		if ($(element).children('a').text() === 'Wettbewerbe' && !found) {
			found = true;
			const listItems = $(element).children('ul').children('li');
			const href = $(listItems[0]).children('a').attr('href').toString();
			scrapeData(href);
		}
	});
}

async function scrapeData(url) {
	console.log('Starting scraping....');
	let images = [];
	let count = 0;

	let pageElements;
	do {
		count++;
		let pagination = `page/${count}/`;
		const { data } = await axios.get(url + pagination);
		const $ = cheerio.load(data);
		pageElements = $('.pcdesktop');
		//console.log(url + pagination);
		pageElements.each((idx, el) => {
			//console.log('Page ' + count + ' of 8. Scraping element ' + idx);
			let metaData = $(el)
				.children('.gallery-title-autor')
				.children('.author')
				.attr('title')

			let i = metaData.lastIndexOf('-')
			let author = metaData.substring(i + 1)
			let title = metaData.substring(0,i)

			if (metaData && metaData.includes('-')) {
				let img = {
					url: $(el)
						.children('.imagebox')
						.children('a')
						.children('img')
						.attr('src')
						.replace('-350x350', ''),
					author: author.trim(),
					title: title.trim(),
				};

				images.push(img);
			}
		});
	} while (pageElements.length > 0);

	fs.writeFile('imageData.json', JSON.stringify(images, null, 2), err => {
		if (err) {
			console.log(err);
			return;
		}
		console.log('File created successfully');
	});

	console.log(images.length);

	return images;
}

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
const that = this;
io.on(
	'connection',
	/**@param {ExtendedSocket} socket*/ function (socket) {
		/**@type {userData} */
		socket.userData = null;
		socket.changed = false;
		socket.reinit = false;

		console.log(`${socket.id} connected`);
		if (!that.interval) {
			console.debug('waking up 🥱. Starting periodic update loop...');
			that.interval = setInterval(() => {
				let players = [];

				for (const [_, socket] of io.of('/').sockets) {
					// console.log(socket);
					if (socket.changed) {
						let pl = {
							id: socket.id,
							x: socket.userData.x,
							y: socket.userData.y,
							z: socket.userData.z,
							ry: socket.userData.ry,
							rx: socket.userData.rx,
							rz: socket.userData.rz,
							velocity: socket.userData.velocity,
						};
						if (socket.reinit) {
							console.debug('reinit', socket.id);
							socket.reinit = false;
							pl.model = socket.userData.model;
							pl.name = socket.userData.name;
						}
						players.push(pl);
						socket.changed = false;
					}
				}

				if (players.length > 0) io.emit('update', players);
			}, 40);
		}

		socket.on('disconnect', function () {
			console.log(`Player ${socket.id} disconnected`);
			io.emit('leave', socket.id);
			if (io.of('/').sockets.size < 1) {
				clearInterval(that.interval);
				that.interval = undefined;
				console.debug(
					'sleeping 😴. stopping periodic update loop, no one connected anymore.'
				);
			}
		});

		socket.on('init', function (data) {
			console.log(`socket init ${socket.id}`);
			socket.userData = {
				model: data.model,
				// colour: data.colour,
				x: data.x,
				y: data.y,
				z: data.z,
				ry: data.ry,
				rx: data.rx,
				rz: data.rz,
				velocity: data.velocity,
				name: data.name,
			};
			socket.changed = true;
			socket.reinit = true;
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
				if (!socket.userData) continue;
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
					velocity: socket.userData.velocity,
				});
			}

			socket.emit('players', players);
		});

		socket.on('message', function (data) {
			let username = socket.userData?.name ? socket.userData.name : socket.id;
			let timestamp = new Date();
			io.emit('message', {
				timestamp: timestamp,
				sender: username,
				message: data.message,
			});
		});
	}
);

http.listen(3000, function () {
	console.log('🚀 Listening on port 3000: http://localhost:3000/');
});
