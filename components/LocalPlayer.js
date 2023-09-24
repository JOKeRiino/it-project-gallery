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
	startVote: '/startVote - Start the voting on pictures.',
	stopVote: '/stopVote - Stop the voting process.',
	votesFrom:
		'/votesFrom [pictureID] - Display the votes from a specific picture.',
	reset: '/reset - Teleports you to your starting position',
	help: '/help - Display a list of available commands.',
};
// Almost like an enum
const SYSTEM_MESSAGE_STATUS = Object.freeze({
	INFO: 'system-info',
	WARNING: 'system-warning',
	ERROR: 'system-error',
	SUCCESS: 'system-success',
});

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
			this.appendSystemMessage(
				'You can now vote on pictures using /vote',
				SYSTEM_MESSAGE_STATUS.INFO
			);
		});

		socket.on('stopVoting', mostVotedImages => {
			if (mostVotedImages && mostVotedImages.length > 0) {
				if (mostVotedImages.length === 1) {
					const item = mostVotedImages[0];
					this.appendSystemMessage(
						`The voting has been stopped. Picture "${item.title}" by ${item.author} won`,
						SYSTEM_MESSAGE_STATUS.SUCCESS
					);
				} else {
					const descriptions = mostVotedImages
						.map(item => `"${item.title}" by ${item.author}`)
						.join(' & ');
					this.appendSystemMessage(
						`The voting has been stopped. There was a tie. Pictures ${descriptions} won.`,
						SYSTEM_MESSAGE_STATUS.SUCCESS
					);
				}
			} else {
				this.appendSystemMessage(
					`No votes have been cast.`,
					SYSTEM_MESSAGE_STATUS.INFO
				);
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

	appendSystemMessage(message, status) {
		let messageElement = document.createElement('p');
		messageElement.textContent = `[${new Date().toLocaleTimeString()}] System: ${message}`;

		messageElement.classList.add(status);
		messagesContainer.append(messageElement);
		this.scrollToEnd();
	}

	appendWhisperMessage(data) {
		if (data != null) {
			let messageElement = document.createElement('p');
			messageElement.textContent = `[${new Date(
				data.timestamp
			).toLocaleTimeString()}] (Whisper from ${data.sender}): ${data.message}`;
			messageElement.classList.add('whisper-message');
			messagesContainer.append(messageElement);
			this.scrollToEnd();
		}
	}

	scrollToEnd() {
		window.requestAnimationFrame(() => {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		});
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
					this.appendSystemMessage(error.message, SYSTEM_MESSAGE_STATUS.ERROR);
				}

				break;

			case 'whisper':
				try {
					this.whisper(args);
				} catch (error) {
					this.appendSystemMessage(error.message, SYSTEM_MESSAGE_STATUS.ERROR);
				}
				break;

			case 'vote':
				try {
					this.vote(args);
				} catch (error) {
					this.appendSystemMessage(error.message, SYSTEM_MESSAGE_STATUS.ERROR);
				}
				break;

			case 'mostVotes':
				try {
					await this.mostVotes(args);
				} catch (error) {
					this.appendSystemMessage(error.message, SYSTEM_MESSAGE_STATUS.ERROR);
				}
				break;

			case 'votesFrom':
				try {
					await this.votesFrom(args);
				} catch (error) {
					this.appendSystemMessage(error.message, SYSTEM_MESSAGE_STATUS.ERROR);
				}
				break;

			case 'startVote':
				try {
					this.startVoting(args);
				} catch (error) {
					this.appendSystemMessage(error.message, SYSTEM_MESSAGE_STATUS.ERROR);
				}
				break;

			case 'stopVote':
				try {
					this.stopVoting(args);
				} catch (error) {
					this.appendSystemMessage(error.message, SYSTEM_MESSAGE_STATUS.ERROR);
				}
				break;

			case 'reset':
				try {
					this.resetPosition(args);
				} catch (error) {
					this.appendSystemMessage(error.message, SYSTEM_MESSAGE_STATUS.ERROR);
				}

			case 'help':
				const commandsString = Object.values(availableCommands).join('\n');
				this.appendSystemMessage(
					`Available commands:\n${commandsString}`,
					SYSTEM_MESSAGE_STATUS.INFO
				);
				break;

			default:
				this.appendSystemMessage(
					`Invalid command: ${command}. Type /help to see a list of available commands`,
					SYSTEM_MESSAGE_STATUS.WARNING
				);
		}

		return true;
	}

	resetPosition(args) {
		if (!this.checkArgs(args, 0, 'reset')) return;

		this.game.camera.position.copy(this.startingPosition);
	}

	teleportTo(args) {
		if (!this.checkArgs(args, 1, 'tp')) return;
		let target = args[0];

		if (this.game.player.userName === target) {
			this.appendSystemMessage(
				'You cannot teleport to yourself.',
				SYSTEM_MESSAGE_STATUS.WARNING
			);
			return;
		}

		const playersArray = Object.values(this.game.localPlayers);
		// RemotePlayer.userName wurde zu RemotPlayer.name
		const targetPlayer = playersArray.find(player => player.name === target);

		if (!targetPlayer) {
			this.appendSystemMessage(
				`Player ${target} not found.`,
				SYSTEM_MESSAGE_STATUS.WARNING
			);
			return;
		}

		this.game.camera.position.copy(targetPlayer.position);

		this.game.camera.lookAt(
			targetPlayer.rotation.x,
			targetPlayer.rotation.y,
			targetPlayer.rotation.z
		);
	}

	whisper(args) {
		if (args.length < 2) {
			this.appendSystemMessage(availableCommands[cmd], SYSTEM_MESSAGE_STATUS.INFO);
			return;
		}

		const [target, ...messageParts] = args;
		const message = messageParts.join(' ');

		if (this.game.player.userName === target) {
			this.appendSystemMessage(
				'You cannot whisper to yourself.',
				SYSTEM_MESSAGE_STATUS.WARNING
			);
			return;
		}

		const playersArray = Object.entries(this.game.localPlayers);
		const targetEntry = playersArray.find(
			([id, player]) => player.name === target
		);

		if (!targetEntry) {
			this.appendSystemMessage(
				`Player ${target} not found.`,
				SYSTEM_MESSAGE_STATUS.WARNING
			);
			return;
		}

		const [targetId, targetPlayer] = targetEntry;
		this.socket.emit('whisper', { targetUserId: targetId, message: message });
	}

	vote(args) {
		if (!this.checkArgs(args, 1, 'vote')) return;

		let voting_id = Number(args);

		this.appendSystemMessage(
			`You voted for picture ${voting_id}.`,
			SYSTEM_MESSAGE_STATUS.SUCCESS
		);

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
					`Picture ${item.title} by ${item.author} currently has the most votes.`,
					SYSTEM_MESSAGE_STATUS.SUCCESS
				);
			} else {
				const descriptions = mostVotedImages
					.map(item => `"${item.title}" by ${item.author}`)
					.join(' & ');
				this.appendSystemMessage(
					`There is a tie currently between pictures ${descriptions}.`,
					SYSTEM_MESSAGE_STATUS.SUCCESS
				);
			}
		} else {
			this.appendSystemMessage(
				`No votes have been cast.`,
				SYSTEM_MESSAGE_STATUS.INFO
			);
		}
	}

	async votesFrom(args) {
		if (!this.checkArgs(args, 1, 'votesFrom')) return;

		let voting_id = Number(args);

		let votes = await new Promise((resolve, reject) => {
			this.socket.emit('getVotesFrom', voting_id, result => {
				resolve(result);
			});
		});

		if (votes != null) {
			this.appendSystemMessage(
				`Picture ${voting_id} has ${votes} vote(s).`,
				SYSTEM_MESSAGE_STATUS.INFO
			);
		} else {
			this.appendSystemMessage(
				`This shouldn't happen :'(`,
				SYSTEM_MESSAGE_STATUS.ERROR
			);
		}
	}

	async getVotesFrom(args) {
		let voting_id = Number(args);

		let votes = await new Promise((resolve, reject) => {
			this.socket.emit('getVotesFrom', voting_id, result => {
				resolve(result);
			});
		});

		return votes;
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
			this.appendSystemMessage(availableCommands[cmd], SYSTEM_MESSAGE_STATUS.INFO);
			return false;
		}
		return true;
	}
}
