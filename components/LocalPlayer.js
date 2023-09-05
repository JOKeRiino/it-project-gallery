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

	async sendMessage(message) {
		if (this.socket === undefined) {
			throw new Error('Socket is undefined');
		}

		let isCommand = await this.checkCommands(message);
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

	async checkCommands(message) {
		if (message.charAt(0) !== '/') {
			return false;
		}

		const [command, ...args] = message.substring(1).split(' ');

		//TODO Redo the arg.length checks
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

			case 'vote':
				try {
					this.vote(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
				}
				break;

			case 'mostVotes':
				try {
					await this.mostVotes(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
				}
				break;

			case 'votesFrom':
				try {
					await this.votesFrom(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
				}
				break;

			case 'startVote':
				try {
					await this.votesFrom(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
				}
				break;

			case 'help':
				const availableCommands = [
					'/tp [playerName] - Teleport to given player.',
					'/whisper [playerName] [message] - Send a private message to a player.',
					'/vote [pictureID] - Vote for a picture with the given ID.',
					'/startVoting - Start the voting process.',
					'/stopVoting - Stop the voting process.',
					'/mostVotes - Display the picture with the most votes.',
					'/startVote - Start the voting on pictures',
					'/votesFrom [pictureID] - Display the votes from a specific picture.',
					'/help - Display a list of available commands.',
				];
				this.appendSystemMessage(
					`Available commands:\n${availableCommands.join('\n')}`
				);
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
		if (args.length != 1) {
			this.appendSystemMessage(
				'/vote [pictureID] - Vote for a picture with the given ID.'
			);
			return;
		}
		let voting_id = Number(args);

		// TODO Das zeigt nur lokal an! || Evtl. andere farbe für diese art von msgs -> system msgs mit 2tn parameter: warning, info, ...
		this.appendSystemMessage(`You voted for image ${voting_id}.`);

		this.socket.emit('vote', voting_id);
	}

	async mostVotes(args) {
		//TODO Diesen check auslagern
		if (args.length != 0) {
			this.appendSystemMessage(
				'/mostVotes - Display the picture with the most votes.'
			);
			return;
		}
		let mostVoted = await new Promise((resolve, reject) => {
			this.socket.emit('mostVotes', result => {
				resolve(result);
			});
		});

		if (mostVoted != null) {
			this.appendSystemMessage(
				`The image with the most votes is image ${mostVoted}.`
			);
		} else {
			this.appendSystemMessage(`No votes have been casted.`);
		}
	}

	//TODO das ist lokal. Sollte eine Nachricht global geben
	async votesFrom(args) {
		//TODO Diesen check auslagern
		if (args.length != 1) {
			this.appendSystemMessage(
				'/votesFrom [pictureID] - Display the votes from a specific picture.'
			);
			return;
		}

		let voting_id = Number(args);

		let votes = await new Promise((resolve, reject) => {
			this.socket.emit('getVotesFrom', voting_id, result => {
				resolve(result);
			});
		});

		if (votes != null) {
			this.appendSystemMessage(`Image ${voting_id} has ${votes} vote(s).`);
		} else {
			this.appendSystemMessage(`This shouldn't happen :'(`);
		}
	}

	// TODO start & stop
	// TODO Pictures bvw. images umbenennen
}
