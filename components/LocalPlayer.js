import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Player } from './Player.js';

const messagesContainer = document.querySelector('#messages');

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
			localPlayer.id = socket.id;
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

		socket.on('whisper', data => {
			this.appendWhisperMessage(data);
		});
	}

	requestUsernameCheck(usernameRequested) {
		return new Promise((resolve, reject) => {
			this.socket.emit('usernameCheck', usernameRequested, result => {
				resolve(result);
			});
		});
	}

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
		if (this.socket === undefined) {
			throw new Error('Socket is undefined');
		}

		let isCommand = this.checkCommands(message);
		if (!isCommand) {
			this.socket.emit('message', { message: message });
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

	appendSystemMessage(message) {
		let messageElement = document.createElement('p');
		messageElement.textContent = `[${new Date().toLocaleTimeString()}] System: ${message}`;
		messageElement.classList.add('system-message');
		messagesContainer.append(messageElement);
	}

	appendWhisperMessage(data) {
		if (data != null) {
			let messageElement = document.createElement('p');
			messageElement.textContent = `[${new Date(
				data.timestamp
			).toLocaleTimeString()}] (Whisper from ${data.sender}): ${data.message}`;
			messageElement.classList.add('whisper-message');
			messagesContainer.append(messageElement);
		}
	}

	checkCommands(message) {
		if (message.charAt(0) !== '/') {
			return false;
		}

		const [command, ...args] = message.substring(1).split(' ');

		switch (command) {
			case 'tp':
				if (args.length === 0) {
					this.appendSystemMessage('Usage: /tp [player name]');
				} else {
					try {
						this.teleportTo(args[0]);
					} catch (error) {
						console.log(error);
						this.appendSystemMessage(error.message);
					}
				}
				break;

			case 'whisper':
				try {
					this.whisper(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
				}
				break;

			case 'help':
				const availableCommands = [
					'/tp [player name] - Teleport to given player.',
					'/whisper [player name] [message] - Send a private message to a player.',
				];
				this.appendSystemMessage(
					`Available commands:\n${availableCommands.join('\n')}`
				);
				break;

			case 'vote':
				try {
					this.vote(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
				}
				break;

			default:
				this.appendSystemMessage(
					`Invalid command: ${command}. Type /help to see list of available commands`
				);
		}

		return true;
	}

	teleportTo(target) {
		if (this.game.player.userName === target) {
			this.appendSystemMessage('You cannot teleport to yourself.');
			return;
		}

		const playersArray = Object.values(this.game.localPlayers);
		const targetPlayer = playersArray.find(player => player.userName === target);

		if (!targetPlayer) {
			this.appendSystemMessage(`Player ${target} not found.`);
			return;
		}

		this.game.camera.position.copy(targetPlayer.position);

		// Doesnt work perfectly
		this.game.camera.lookAt(
			targetPlayer.rotation.x,
			targetPlayer.rotation.y,
			targetPlayer.rotation.z
		);
	}

	whisper(args) {
		if (args.length < 2) {
			this.appendSystemMessage('Usage: /whisper [user] [message]');
			return;
		}

		const [target, ...messageParts] = args;
		const message = messageParts.join(' ');

		if (this.game.player.userName === target) {
			this.appendSystemMessage('You cannot whisper to yourself.');
			return;
		}

		const playersArray = Object.entries(this.game.localPlayers);
		const targetEntry = playersArray.find(
			([id, player]) => player.userName === target
		);

		if (!targetEntry) {
			this.appendSystemMessage(`Player ${target} not found.`);
			return;
		}

		const [targetId, targetPlayer] = targetEntry;
		this.socket.emit('whisper', { targetUserId: targetId, message: message });
	}

	vote(args) {
		console.log('You voted for' + args);
		this.appendSystemMessage(
			`Player '${this.game.player.userName}' voted for an image!`
		);
		//this.socket.emit('vote_update', args);
	}
}
