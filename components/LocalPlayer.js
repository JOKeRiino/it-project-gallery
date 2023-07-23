import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Player } from './Player.js';

export class LocalPlayer extends Player {
	/**@type {Socket} */
	socket;
	/**
	 * @param {GalerieApp} game
	 * @param {{position:THREE.Vector3,rotation:THREE.Vector3}} startingPosition
	 */
	constructor(game, startingPosition) {
		super(game);

		const socket = io(document.URL);
		this.socket = socket;
		let localPlayer = this;

		this.position = startingPosition.position.clone();
		this.rotation = startingPosition.rotation.clone();

		socket.on('connect', function () {
			//console.log(socket.id);
			localPlayer.id = socket.id;
			//localPlayer.initSocket();
			socket.emit('players');
		});

		socket.on(
			'players',
			/**@param {Array<userData>} data */ function (data) {
				game.serverPlayers = data;
			}
		);

		socket.on(
			'update',
			/**@param {Array<userData>} data */ data => {
				data.forEach(d => {
					const playerIndex = game.serverPlayers.findIndex(v => v.id === d.id);
					if (playerIndex > -1) {
						game.serverPlayers[playerIndex] = d;
					} else {
						game.serverPlayers.push(d);
					}
				});
			}
		);

		socket.on('leave', id => {
			console.debug('player disconnected:', id);
			const index = game.serverPlayers.findIndex(p => p.id === id);
			if (index > -1) game.serverPlayers.splice(index, 1);
		});

		socket.on('message', data => {
			console.log('received msg: ' + data.message + ' from user: ' + data.sender);
			this.appendMessage(data);
		});
	}

	// TODO Add information about the player model like colour, character model,...
	initSocket() {
		console.log('PlayerLocal.initSocket', this);
		this.socket.emit('init', {
			model: this.model,
			name: this.userName,
			x: this.position.x,
			y: this.position.y,
			z: this.position.z,
			ry: this.rotation.y,
			rx: this.rotation.x,
			rz: this.rotation.z,
			velocity: this.velocity,
		});
	}

	/**@param {THREE.Camera} camera */
	updatePosition(camera, velocity) {
		// console.log("Camera: ");
		// console.log(camera);
		this.velocity = velocity;
		if (
			!camera.position.equals(this.position) ||
			!this.rotation.equals(camera.rotation)
		) {
			this.position.copy(camera.position);
			this.rotation.copy(camera.rotation);
			this.updateSocket();
		}
	}

	updateSocket() {
		if (this.socket !== undefined) {
			this.socket.emit('update', {
				x: this.position.x,
				y: this.position.y,
				z: this.position.z,
				ry: this.rotation.y,
				rx: this.rotation.x,
				rz: this.rotation.z,
				velocity: this.velocity,
			});
		}
	}

	sendMessage(message) {
		console.log('sendMessage(): ' + message);
		if (this.socket !== undefined) {
			this.socket.emit('message', {
				message: message,
			});
		}
	}

	appendMessage(data) {
		if (data != null) {
			let message = document.createElement('p');
			message.textContent = `[${new Date(data.timestamp).toLocaleTimeString()}] ${
				data.sender
			}: ${data.message}`;
			messagesContainer.append(message);
		}
	}
}
