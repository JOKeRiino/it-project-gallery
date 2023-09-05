import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Player } from './Player.js';

const messagesContainer = document.querySelector('#messages');
const availableCommands = {
	tp: '/tp [playerName] - Teleport to given player.',
	whisper:
		'/whisper [playerName] [message] - Send a private message to a player.',
	vote: '/vote [pictureID] - Vote for a picture with the given ID.',
	mostVotes: '/mostVotes - Display the picture with the most votes.',
	startVote: '/startVote - Start the voting on pictures',
	stopVote: '/stopVote - Stop the voting process.',
	votesFrom:
		'/votesFrom [pictureID] - Display the votes from a specific picture.',
	help: '/help - Display a list of available commands.',
};

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

		socket.on('startVoting', () => {
			this.appendSystemMessage('You can now vote on picture using /vote');
		});

		socket.on('stopVoting', mostVotedImages => {
			if (mostVotedImages && mostVotedImages.length > 0) {
				if (mostVotedImages.length === 1) {
					const item = mostVotedImages[0];
					this.appendSystemMessage(
						`The voting has been stopped. Image "${item.title}" by ${item.author} won.`
					);
				} else {
					const descriptions = mostVotedImages
						.map(item => `"${item.title}" by ${item.author}`)
						.join(' & ');
					this.appendSystemMessage(
						`The voting has been stopped. There was a tie. Images ${descriptions} won.`
					);
				}
			} else {
				this.appendSystemMessage(`No votes have been cast.`);
			}
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

		switch (command) {
			case 'tp':
				try {
					this.teleportTo(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
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
					this.startVoting(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
				}
				break;

			case 'stopVote':
				try {
					this.stopVoting(args);
				} catch (error) {
					this.appendSystemMessage(error.message);
				}
				break;

			case 'help':
				const commandsString = Object.values(availableCommands).join('\n');
				this.appendSystemMessage(`Available commands:\n${commandsString}`);
				break;

			default:
				this.appendSystemMessage(
					`Invalid command: ${command}. Type /help to see list of available commands`
				);
		}

		return true;
	}

	teleportTo(args) {
		if (!this.checkArgs(args, 1, 'tp')) return;
		let target = args[0];

		if (this.game.player.userName === target) {
			this.appendSystemMessage('You cannot teleport to yourself.');
			return;
		}

		const playersArray = Object.values(this.game.localPlayers);
		// RemotePlayer.userName wurde zu RemotPlayer.name
		const targetPlayer = playersArray.find(player => player.name === target);

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
		if (!this.checkArgs(args, 2, 'whisper')) return;

		const [target, ...messageParts] = args;
		const message = messageParts.join(' ');

		if (this.game.player.userName === target) {
			this.appendSystemMessage('You cannot whisper to yourself.');
			return;
		}

		const playersArray = Object.entries(this.game.localPlayers);
		const targetEntry = playersArray.find(
			([id, player]) => player.name === target
		);

		if (!targetEntry) {
			this.appendSystemMessage(`Player ${target} not found.`);
			return;
		}

		const [targetId, targetPlayer] = targetEntry;
		this.socket.emit('whisper', { targetUserId: targetId, message: message });
	}

	vote(args) {
		if (!this.checkArgs(args, 1, 'vote')) return;

		let voting_id = Number(args);

		// TODO Das zeigt nur lokal an! || Evtl. andere farbe für diese art von msgs -> system msgs mit 2tn parameter: warning, info, ...
		this.appendSystemMessage(`You voted for image ${voting_id}.`);

		this.socket.emit('vote', voting_id);
	}

	async mostVotes(args) {
		if (!this.checkArgs(args, 0, 'mostVotes')) return;

		let mostVotedImages = await new Promise((resolve, reject) => {
			this.socket.emit('mostVotes', result => {
				resolve(result);
			});
		});

		if (mostVotedImages && mostVotedImages.length > 0) {
			if (mostVotedImages.length === 1) {
				const item = mostVotedImages[0];
				this.appendSystemMessage(
					`The voting has been stopped. Image ${item.title} by ${item.author} won.`
				);
			} else {
				const descriptions = mostVotedImages
					.map(item => `"${item.title}" by ${item.author}`)
					.join(' & ');
				this.appendSystemMessage(
					`The voting has been stopped. There was a tie. Images ${descriptions} won.`
				);
			}
		} else {
			this.appendSystemMessage(`No votes have been cast.`);
		}
	}

	//TODO das ist lokal. Sollte eine Nachricht global geben || Sollte es?
	async votesFrom(args) {
		if (!this.checkArgs(args, 1, 'votesFrom')) return;

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

	startVoting(args) {
		if (!this.checkArgs(args, 0, 'startVoting')) return;

		this.socket.emit('startVoting');
	}

	stopVoting(args) {
		if (!this.checkArgs(args, 0, 'stopVoting')) return;

		this.socket.emit('stopVoting');
	}

	checkArgs(args, numberParams, cmd) {
		if (args.length != numberParams) {
			this.appendSystemMessage(availableCommands[cmd]);
			return false;
		}
		return true;
	}

	// TODO Pictures bvw. images umbenennen
}
