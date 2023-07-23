import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Player } from './Player.js';
import { ChatError } from './errors/ChatError.js';

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

		socket.on('whisper', data => {
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

	// TODO display all System messages in different colour
	checkCommands(message) {
		// Check if the message starts with a '/'
		if (message.charAt(0) === '/') {
			// Split the message into the command and the argument
			const [command, ...args] = message.substring(1).split(' ');

			switch (command) {
				case 'tp':
					if (args.length === 0) {
						// User didn't provide a target player name
						this.appendMessage(new ChatError('Usage: /tp [player name]', 'Sytem'));
					} else {
						try {
							this.teleportTo(args[0]);
						} catch (error) {
							console.log(error);
							this.appendMessage(error);
						}
					}
					break;
				case 'whisper':
					try {
						this.whisper(args);
					} catch (error) {
						this.appendMessage(error);
					}
					break;

				case 'help':
					const availableCommands = [
						'/tp [player name] - Teleport to given player.',
						'/whisper [player name] [message] - Send a private message to a player.',
						// add descriptions of other commands here
					];
					this.appendMessage(
						new ChatError(
							`Available commands:\n${availableCommands.join('\n')}`,
							'System'
						)
					);

					break;

				// Add more cases for additional commands
				default:
					this.appendMessage(
						new ChatError(
							`Invalid command: ${command} \n Type /help to see list of available commands`,
							'Sytem'
						)
					);
			}

			return true;
		} else return false;
	}

	teleportTo(target) {
		console.log(this.game.localPlayers);

		const playersArray = Object.values(this.game.localPlayers);
		const targetPlayer = playersArray.find(player => player.userName === target);

		if (this.game.player.userName === target) {
			throw new ChatError('You cannot teleport to yourself.', 'System');
		}

		if (!targetPlayer) {
			throw new ChatError(`Player ${target} not found.`, 'System');
		}

		this.game.camera.position.copy(targetPlayer.position);

		// Not working perfectly
		this.game.camera.lookAt(
			targetPlayer.rotation.x,
			targetPlayer.rotation.y,
			targetPlayer.rotation.z
		);
	}

	whisper(args) {
		if (args.length < 2) {
			// If there aren't enough arguments, send an error message
			throw new ChatError('Usage: /whisper [user] [message]', 'System');
		}

		const [target, ...messageParts] = args;
		const message = messageParts.join(' ');

		const playersArray = Object.entries(this.game.localPlayers);
		const targetEntry = playersArray.find(
			([id, player]) => player.userName === target
		);

		if (!targetEntry) {
			throw new ChatError(`Player ${target} not found.`, 'System');
		} else if (this.game.player.userName === target) {
			throw new ChatError('You cannot whisper to yourself.', 'System');
		} else {
			const [targetId, targetPlayer] = targetEntry;
			this.socket.emit('whisper', {
				targetUserId: targetId,
				message: message,
			});
		}
	}
}
