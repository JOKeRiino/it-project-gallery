import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import {
	CSS2DRenderer,
	CSS2DObject,
} from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { NoiseGenerator } from './components/noiseGenerator.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { io, Socket } from 'socket.io-client';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const KEYS = {
	a: 65,
	s: 83,
	w: 87,
	d: 68,
};

function getImgDimensions(img, canvasSize) {
	let w, h;
	if (img.width > img.height) {
		w = canvasSize;
		h = canvasSize * (img.height / img.width);
	} else {
		h = canvasSize;
		w = canvasSize * (img.width / img.height);
	}
	return [w, h];
}

const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');

// Chatbox selectors
const chatbox = document.querySelector('#chatbox');
const chatIcon = document.querySelector('#chat-icon');
const messageInput = document.querySelector('#message-input');
const messagesContainer = document.querySelector('#messages');

// Flags indicating the source of the pointerlock events
let pointerLockForChat = false;
let pointerLockRegular = true;
let isFormSubmitting = false;

/**@type {PointerLockControls} */
let controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
//const vertex = new THREE.Vector3(); evtl fuer kollision?

class Player {
	id = '';
	/**@type {THREE.Vector3} */
	position;
	/**@type {THREE.Vector3} */
	rotation;
	/**@type {GalerieApp} */
	game;
	/**@type {FBXLoader} */
	loader;
	name = '';
	avatar = '';
	/**@param {GalerieApp} game */
	constructor(game) {
		this.game = game;
		this.loader = new FBXLoader(game.loadingManager);
		this.textureLoader = new THREE.TextureLoader(game.loadingManager);
	}
}

class RemotePlayer extends Player {
	constructor(game, startingPosition) {
		super(game);

		this.position = new THREE.Vector3();
		this.rotation = new THREE.Vector3();

		this.position.x = startingPosition.x;
		this.position.y = startingPosition.y;
		this.position.z = startingPosition.z;

		this.rotation.y = startingPosition.ry;
		this.rotation.x = startingPosition.rx;
		this.rotation.z = startingPosition.rz;

		this.name = startingPosition.name;
		this.avatar = startingPosition.model;

		let name = document.createElement('div');
		name.textContent = startingPosition.name;
		name.className = 'player-name';

		this.nameTag = new CSS2DObject(name);
		this.nameTag.position.set(0, 2, 0);

		/**@type{Object.<string,THREE.AnimationAction>} */
		this.availableAnimations = {
			WALKING: null,
			IDLE: null,
		};

		//Create character model with starting position
		// If u want to include new animations download them from mixamo with options:
		// If available tick "In Place"
		// Format Fbx 7.4
		// Skin: Without Skin
		this.loader.load(
			`img/models/avatars/${startingPosition.model}.fbx`,
			model => {
				this.anims = new THREE.AnimationMixer(model);
				this.loader.load('img/models/animations/Idle.fbx', data => {
					this.availableAnimations.IDLE = this.anims.clipAction(data.animations[0]);
					this.availableAnimations.IDLE.setEffectiveWeight(1);
					this.availableAnimations.IDLE.play();
				});
				this.loader.load('img/models/animations/Walking.fbx', data => {
					this.availableAnimations.WALKING = this.anims.clipAction(
						data.animations[0]
					);
					this.availableAnimations.WALKING.setEffectiveWeight(0);
					this.availableAnimations.WALKING.play();
				});
				model.traverse(o => {
					if (o.isMesh) {
						o.castShadow = true;
						o.receiveShadow = true;

						console.log(o.name);
						// Hide hat
						if (o.name === 'Hat') {
							o.visible = false;
							// o.renderOrder = -1;
						}
					}
				});

				// Load texture
				this.textureLoader.load(
					`img/models/avatars/textures/${startingPosition.model}.png`,
					function (texture) {
						model.traverse(o => {
							if (o.isMesh) {
								o.material.map = texture;
								o.material.needsUpdate = true;
							}
						});
					}
				);

				model.scale.set(0.02, 0.02, 0.02);
				// mixamo model is rotated inverse to the camera view
				model.rotateY(Math.PI);
				this.model = new THREE.Group();
				this.model.add(model);
				this.model.add(this.nameTag);
				//this.model = model;
				this.game.scene.add(this.model);
				this.model.position.set(this.position.x, 0.2, this.position.z); //this.position.y
				this.model.rotation.order = 'YXZ';
				//this.model.rotation.x = startingPosition.rx;
				this.model.rotation.y = startingPosition.ry;
				//this.model.rotation.z = startingPosition.rz;
			}
		);

		console.log('New Remote Player created');
	}

	updatePosition(position) {
		this.position.x = position.x;
		this.position.y = position.y;
		this.position.z = position.z;

		this.rotation.y = position.ry;
		// this.rotation.x = position.rx;
		// this.rotation.z = position.rz;

		this.velocity = position.velocity;
		if (position.name) {
			this.name = position.name;
			this.nameTag.element.innerText = this.name;
		}
		if (position.model) {
			this.avatar = position.model;
			delete position.model;
			this.game.scene.remove(this.model);
			this.loader.load(`img/models/avatars/${this.avatar}.fbx`, model => {
				this.anims = new THREE.AnimationMixer(model);
				let avan = this.availableAnimations;
				this.availableAnimations = {};
				console.debug(avan);
				Object.entries(avan).forEach(([k, v]) => {
					this.availableAnimations[k] = this.anims.clipAction(v.getClip());
					this.availableAnimations[k].play();
				});
				model.traverse(o => {
					if (o.isMesh) {
						o.castShadow = true;
						o.receiveShadow = true;

						console.log(o.name);
						// Hide hat
						if (o.name === 'Hat') {
							o.visible = false;
							// o.renderOrder = -1;
						}
					}
				});

				// Load texture
				this.textureLoader.load(
					`img/models/avatars/textures/${this.avatar}.png`,
					function (texture) {
						model.traverse(o => {
							if (o.isMesh) {
								o.material.map = texture;
								o.material.needsUpdate = true;
							}
						});
					}
				);

				model.scale.set(0.02, 0.02, 0.02);
				// mixamo model is rotated inverse to the camera view
				model.rotateY(Math.PI);
				this.model = new THREE.Group();
				this.model.add(model);
				this.model.add(this.nameTag);
				//this.model = model;
				this.game.scene.add(this.model);
				this.model.position.set(this.position.x, 0.2, this.position.z); //this.position.y
				this.model.rotation.order = 'YXZ';
				//this.model.rotation.x = position.rx;
				//this.model.rotation.y = position.ry;
				//this.model.rotation.z = position.rz;
			});
			// TODO: Change Model
		}

		if (this.model) {
			// update the position of the block
			this.model.position.set(position.x, 0.2, position.z); // position.y
			// update the rotation of the block
			//this.model.rotation.x = position.rx;
			this.model.rotation.y = position.ry;
			//this.model.rotation.z = position.rz;

			if (this.velocity > 0.5) {
				this.availableAnimations.WALKING?.setEffectiveWeight(2);
				this.availableAnimations.IDLE?.setEffectiveWeight(0);
			} else if (this.velocity < 0.001) {
				this.availableAnimations.WALKING?.setEffectiveWeight(0);
				this.availableAnimations.IDLE?.setEffectiveWeight(1);
			} else {
				this.availableAnimations.WALKING?.setEffectiveWeight(this.velocity * 2);
				this.availableAnimations.IDLE?.setEffectiveWeight(1 / this.velocity);
			}
			// console.log(this.velocity);

			this.model.position.needsUpdate = true; // tell three.js to update the position
		}
	}

	deletePlayer() {
		if (this.model) {
			this.game.scene.remove(this.model);
			this.nameTag.element.remove();
			// this.block.texture.dispose(); // dispose its texture
			this.model = undefined; // set it to undefined
		}
	}
}

class LocalPlayer extends Player {
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
			console.log(socket.id);
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
			name: this.name,
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

class GalerieApp {
	constructor() {
		// TODO: In the future we might have to change the z rotation
		// Initialize local player
		this.startingPosition = {
			position: new THREE.Vector3(2, 3, 0),
			rotation: new THREE.Vector3(0, 0, -10),
		};
		this.player = new LocalPlayer(this, this.startingPosition);

		// Two seperate variables to check wether the server sends new players or if players are missing
		this.serverPlayers = [];
		/**@type {Object.<string,RemotePlayer>} */
		this.localPlayers = {};
		this.roomTiles = [];

		this.initializeRenderer_();
		this.initializeLights_();
		this.initializeScene_();
		this.initializePointerlock();
		fetch('/avatars').then(r =>
			r.json().then(r => {
				let sel = document.getElementById('playerModel');
				sel.append(
					...r.map((model, i) => {
						let op = document.createElement('option');
						if (i === 0) {
							op.selected = true;
						}
						op.value = model;
						op.innerText = model;
						return op;
					})
				);
				sel.addEventListener('change', e => {
					this.initializeAvatarPreview_(e.target.value);
				});
				this.initializeAvatarPreview_(document.getElementById('playerModel').value);
			})
		);

		this._DEVSTATS_();
		//Create a World and Render it
		this.initializeGallery_().then(() => {
			this.renderAnimationFrame_();
			let loadingScreen = document.getElementById('loading-screen');
			loadingScreen.style.display = 'none';
		});

		//this.renderAnimationFrame_();
		//this._DEVSTATS_(); //Disable in FINAL BUILD
	}

	//Create and maintain Renderer, Camera, and Scene
	initializeRenderer_() {
		this.renderer = new THREE.WebGLRenderer({
			canvas: document.getElementById('main'),
		});
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.renderer.domElement);
		this.renderer.shadowMap.enabled = true;

		this.cssRenderer = new CSS2DRenderer({
			element: document.getElementById('cssRenderer'),
		});
		this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.cssRenderer.domElement);

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(
			80,
			window.innerWidth / window.innerHeight,
			0.1,
			1000
		);

		this.camera.rotation.order = 'YXZ';

		//Configuring Loading Manager for Loading Screen
		THREE.Cache.enabled = true;
		this.loadingManager = new THREE.LoadingManager();
		let loader = document.getElementById('loader');
		this.loadingManager.onProgress = (url, loaded, total) => {
			loader.style.width = (loaded / total) * 100 + '%';
		};
		this.gltfLoader = new GLTFLoader(this.loadingManager);
		this.fbxLoader = new FBXLoader(this.loadingManager);
		this.textureLoader = new THREE.TextureLoader(this.loadingManager);
		this.fbxLoader.setPath('img/models/avatars/textures/');
		this.textureLoader.setPath('img/models/avatars/textures/');

		this.camera.position.set(
			this.startingPosition.position.x,
			this.startingPosition.position.y,
			this.startingPosition.position.z
		);
		this.camera.lookAt(
			this.startingPosition.rotation.x,
			this.startingPosition.rotation.y,
			this.startingPosition.rotation.z
		);

		//EventListener to react to a change in window size.
		window.addEventListener('resize', () => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			this.renderer.setSize(width, height);
			this.cssRenderer.setSize(width, height);
			this.camera.aspect = width / height;
			this.camera.updateProjectionMatrix();
		});
	}

	initializeAvatarPreview_(model) {
		console.debug(model);
		const width = window.innerWidth / 10;
		const height = window.innerHeight / 5;
		let scene = new THREE.Scene();
		let light = new THREE.AmbientLight('white');
		scene.add(light);

		let avatar;

		if (model) {
			this.fbxLoader.load('../' + model + '.fbx', mdl => {
				let anims = new THREE.AnimationMixer(mdl);
				this.fbxLoader.load('../../animations/Idle.fbx', data => {
					let clip = anims.clipAction(data.animations[0]);
					clip.play();
				});

				mdl.scale.set(0.02, 0.02, 0.02);

				let bbox = new THREE.Box3();
				bbox.setFromObject(mdl);
				let width = bbox.max.x - bbox.min.x;
				let height = bbox.max.y - bbox.min.y;
				const pad_height = height / 10;
				width += width / 10;
				height += pad_height;

				mdl.position.y = pad_height / 2;

				let camera = new THREE.OrthographicCamera(
					-width / 2,
					width / 2,
					height / 2,
					-height / 2
				);
				camera.position.set(5, height / 2, 5);
				camera.lookAt(0, height / 2, 0);
				scene.add(camera);

				if (!this.avatarRenderer) {
					this.avatarRenderer = new THREE.WebGLRenderer({
						canvas: document.getElementById('avatarPreview'),
						antialias: true,
						alpha: true,
					});
					this.avatarRenderer.setSize(width * 50, height * 50);
					this.avatarRenderer.setPixelRatio(window.devicePixelRatio);
				}
				let last = performance.now();

				this.avatarRenderer.setAnimationLoop((time, frame) => {
					const delta = (time - last) / 1000;
					if (avatar) avatar.rotation.y += delta;
					anims.update(delta);
					this.avatarRenderer.render(scene, camera);
					last = time;
				});

				mdl.traverse(o => {
					if (o.isMesh) {
						// o.castShadow = true;
						// o.receiveShadow = true;

						console.log(o.name);
						// Hide hat
						if (o.name === 'Hat') {
							o.visible = false;
							// o.renderOrder = -1;
						}
					}
				});

				// Load texture
				this.textureLoader.load(model + '.png', function (texture) {
					mdl.traverse(o => {
						if (o.isMesh) {
							console.debug('set tex', o);
							o.material.map = texture;
							o.material.needsUpdate = true;
						}
					});
					scene.add(mdl);
				});
				avatar = mdl;
			});
		}
	}

	initializePointerlock() {
		controls = new PointerLockControls(this.camera, document.body);

		const blocker = document.getElementById('blocker');
		const instructions = document.getElementById('instructions');

		instructions.querySelector('form').addEventListener('submit', e => {
			if (instructions.querySelector('form').checkValidity()) {
				// To not trigger the chatbox
				isFormSubmitting = true;

				// TODO: Validate and save player name / model etc.
				this.player.name = instructions.querySelector('#playerName').value;
				this.player.model = instructions.querySelector('#playerModel').value;
				this.player.initSocket();
				if (!this.updater)
					this.updater = setInterval(() => {
						this.player.updatePosition(this.camera, velocity.length() / 4.3);
					}, 40);
				controls.lock();
				this.avatarRenderer.setAnimationLoop(null);
				this.avatarRenderer.dispose();
				this.avatarRenderer = undefined;

				// Timeout so the enter event handler has enough time to check if it was triggered by the submit
				setTimeout(() => {
					isFormSubmitting = false;
				}, 1000);
			}
		});

		// instructions.addEventListener('click', function () {
		// 	controls.lock();
		// });

		controls.addEventListener('lock', function () {
			// If the menu and the chatbox is open and the menu is being closed, hide the chatbox as well
			if (pointerLockRegular && chatbox.classList.contains('visible')) {
				chatbox.classList.remove('visible');
			}
			instructions.style.display = 'none';
			blocker.style.display = 'none';

			// Reset flags
			pointerLockForChat = false;
			pointerLockRegular = false;

			console.log('lock');
		});
		const that = this;

		controls.addEventListener('unlock', function () {
			// If event is triggered by chatbox don't open the menu
			if (pointerLockForChat) {
				pointerLockForChat = false;
			} else {
				blocker.style.display = 'block';
				instructions.style.display = '';
				that.initializeAvatarPreview_(
					blocker.querySelector('select#playerModel').value
				);
				pointerLockRegular = true;
			}
			console.log('unlock');
		});

		this.scene.add(controls.getObject());

		let player = this.player;

		const onKeyDown = function (event) {
			switch (event.code) {
				case 'ArrowUp':
				case 'KeyW':
					moveForward = true;
					break;

				case 'ArrowLeft':
				case 'KeyA':
					moveLeft = true;
					break;

				case 'ArrowDown':
				case 'KeyS':
					moveBackward = true;
					break;

				case 'ArrowRight':
				case 'KeyD':
					moveRight = true;
					break;

				case 'Space':
					if (canJump === true) velocity.y += 350;
					canJump = false;
					break;
			}
		};

		const onKeyUp = function (event) {
			switch (event.code) {
				case 'ArrowUp':
				case 'KeyW':
					moveForward = false;
					break;

				case 'ArrowLeft':
				case 'KeyA':
					moveLeft = false;
					break;

				case 'ArrowDown':
				case 'KeyS':
					moveBackward = false;
					break;

				case 'ArrowRight':
				case 'KeyD':
					moveRight = false;
					break;
				case 'Enter':
					// Check if the enter event is triggered by the submit of the menu form
					if (!isFormSubmitting) {
						if (
							chatbox.classList.contains('visible') &&
							messageInput.value.trim() !== ''
						) {
							player.sendMessage(messageInput.value);
							messageInput.value = '';
						}
						toggleChatbox();
					}
					break;
			}
		};

		function toggleChatbox() {
			chatbox.classList.toggle('visible');
			if (chatbox.classList.contains('visible')) {
				messageInput.focus();
				scrollToEnd();
				pointerLockForChat = true;
				controls.unlock();
			} else if (!pointerLockRegular) {
				pointerLockForChat = true;
				controls.lock();
			}
		}

		function scrollToEnd() {
			window.requestAnimationFrame(() => {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			});
		}

		// Show the chatbox when the chat icon is clicked
		chatIcon.addEventListener('click', function () {
			toggleChatbox();
		});

		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('keyup', onKeyUp);
	}

	//Add Lights to App
	initializeLights_() {
		var hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
		hemiLight.position.set(0, 300, 0);
		this.scene.add(hemiLight);

		var dirLight = new THREE.DirectionalLight(0xffffff);
		dirLight.position.set(75, 300, -75);
		this.scene.add(dirLight);
	}

	//Creating the Scene
	initializeScene_() {
		//SKY
		this.scene.background = new THREE.CubeTextureLoader()
			.setPath('img/skybox/')
			.load([
				'sky_right.webp',
				'sky_left.webp',
				'sky_up.webp',
				'sky_down.webp',
				'sky_front.webp',
				'sky_back.webp',
			]);

		//FLOOR
		let floorGeo = new THREE.PlaneGeometry(1000, 1000);
		floorGeo.rotateY(Math.PI);
		let floorTexture = new THREE.TextureLoader().load(
			'img/materials/grass_0.png'
		);
		floorTexture.wrapS = THREE.RepeatWrapping;
		floorTexture.wrapT = THREE.RepeatWrapping;
		floorTexture.repeat.set(512, 512);
		let floorMat = new THREE.MeshBasicMaterial({
			map: floorTexture,
			side: THREE.FrontSide,
		});
		let floorMesh = new THREE.Mesh(floorGeo, floorMat);
		floorMesh.receiveShadow = true;
		// rotation immer in Radianten angeben -> 90° === Math.PI/2
		floorMesh.rotation.x = Math.PI / 2;
		this.scene.add(floorMesh);

		//Other
		this.objects = [];
	}

	/**
	 * @typedef ImageInfo
	 * @property {string} url
	 * @property {string} alt
	 * @property {number} width
	 * @property {number} height
	 * @property {string} author
	 * @property {string} profileUrl
	 */

	async initializeGallery_() {
		//Funktion generiert so lange Räume bis die Größe passt.
		//Erst dann wird der Raum gerendert.
		//So sollten wir das auf den Server packen und als JSON verschicken können.
		this.score = 26;
		this.imgCount = 0;
		this.noiseGeneratorSize = 1;

		//Make the API Call to unsplash for this.score amount of images.
		const apiKey = 'sWgSDWNA9FkyrQ0TMq6jgVOFO-mBQcADR5DUCMVJNJw'; // Replace with your own API key
		const apiUrl = `https://api.unsplash.com/photos/random?client_id=${apiKey}&count=${this.score}`;

		try {
			const response = await fetch(apiUrl);
			const imageData = await response.json();
			/**@type{Array<ImageInfo>} */
			const images = [];

			imageData.forEach((data, index) => {
				images[index] = {
					url: data.urls.regular,
					alt: data.alt_description,
					width: data.width,
					height: data.height,
					author: data.user.name,
					profileUrl: data.user.links.html,
				};
			});

			//If API Call is successful, iteratively generate a room until the min. size is reached.
			let grid = null;
			do {
				this.noiseGeneratorSize += 2;
				grid = new NoiseGenerator(
					this.noiseGeneratorSize,
					1 //Seed for Generation
				).generateNoise_();
			} while (!this.checkRoomCapacity(grid, images.length));
			this.imgCount = await this.generateRoom_(grid, images);
			console.log(this.imgCount, this.roomTiles);
		} catch (e) {
			console.error(e);
		}

		this.roomTiles.forEach(r => {
			this.scene.add(r);
		});
	}

	/**
	 * Check if room is big enough for the number of images without actually rendering it
	 * @param {string[][]} matrix
	 * @param {number} min_cap
	 */
	checkRoomCapacity(matrix, min_cap) {
		const wallTypes = ['tw', 'lw', 'rw', 'bw'];
		let capacity = 0;
		for (let i = 0; i < matrix.length; i++)
			for (let j = 0; j < matrix[0].length; j++) {
				if (matrix[i][j] == 'P') capacity += 2;
				if (wallTypes.includes(matrix[i][j])) capacity += 0.5;
			}
		return Math.floor(capacity) > min_cap;
	}

	/**
	 *
	 * @param {Array<Array<string>>} matrix
	 * @param {Array<ImageInfo>} images
	 */
	async generateRoom_(matrix, images) {
		let imageSpacer = 0;
		// TODO: Separate Capacity counting from actual rendering!
		let imageCount = 0;

		const boxWidth = 5;
		const boxHeight = 0.2;
		const wallHeight = 10;
		const wallDepth = 0.2;
		const boxDepth = 5;
		const wallTypes = ['tw', 'lw', 'rw', 'bw'];
		const edgeTypes = ['tr', 'tl', 'br', 'bl'];
		const uTypes = ['tu', 'bu', 'lu', 'ru'];

		const texLoader = new THREE.TextureLoader();
		texLoader.crossOrigin = 'Anonymous';

		//Floor Texture + Mat
		const floorTexture = new THREE.TextureLoader().load(
			'/img/materials/carpet2.jpg'
		);
		const floorMaterial = new THREE.MeshBasicMaterial({
			map: floorTexture,
		});
		//Wall Texture + Mat
		const wallTexture = new THREE.TextureLoader().load(
			'/img/materials/wall1.png'
		);
		const wallMaterial = new THREE.MeshBasicMaterial({
			map: wallTexture,
		});
		//Gallery Wall Texture + Mat
		const galleryWallTexture = new THREE.TextureLoader().load(
			'/img/materials/gallerywall1.png'
		);
		const galleryWallMaterial = new THREE.MeshBasicMaterial({
			map: galleryWallTexture,
		});

		// count number of floors etc. needed to create instanced meshes
		let numFloors = 0;
		let numGalleryWalls = 0;
		let numEdges = 0;
		let numOuterWalls = 0;
		for (let i = 0; i < matrix.length; i++)
			for (let j = 0; j < matrix[0].length; j++) {
				if (matrix[i][j] != ' ') {
					numFloors++;
				}
				if (wallTypes.includes(matrix[i][j])) {
					numOuterWalls++;
				} else if (edgeTypes.includes(matrix[i][j])) {
					numOuterWalls += 2;
				} else if (uTypes.includes(matrix[i][j])) {
					numOuterWalls += 3;
				}
				if (matrix[i][j] == 'P') {
					numGalleryWalls++;
				} else if (edgeTypes.includes(matrix[i][j])) {
					numEdges++;
				}
			}

		// Floor mesh + placement function
		const floorGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
		const floorMesh = new THREE.InstancedMesh(
			floorGeometry,
			floorMaterial,
			numFloors
		);
		floorMesh.name = 'floor';
		floorMesh.receiveShadow = true;
		this.roomTiles.push(floorMesh);
		let floorIndex = 0;
		const placeFloor = (x, y) => {
			let mat = new THREE.Matrix4();
			mat.setPosition(
				x * boxWidth,
				floorMesh.geometry.parameters.height / 2,
				y * boxWidth
			);
			floorMesh.setMatrixAt(floorIndex++, mat);
		};

		// Gallery wall mesh + placement function
		const galleryWallGeometry = new THREE.BoxGeometry(
			boxWidth,
			wallHeight * 0.6,
			wallDepth * 5
		);
		const galleryWallMesh = new THREE.InstancedMesh(
			galleryWallGeometry,
			galleryWallMaterial,
			numGalleryWalls
		);
		galleryWallMesh.name = 'galleryWall';
		this.roomTiles.push(galleryWallMesh);
		let galleryWallIndex = 0;
		const placePillar = (x, y) => {
			let mat = new THREE.Matrix4();
			mat.setPosition(
				x * boxWidth,
				boxHeight + galleryWallMesh.geometry.parameters.height / 2,
				y * boxWidth - boxWidth / 2
			);
			galleryWallMesh.setMatrixAt(galleryWallIndex++, mat);
		};

		//deco loading + placement funcs
		let _chairgltf = await this.gltfLoader.loadAsync('img/models/chair.gltf');
		//_chairgltf.scene.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2 * Math.PI));
		/**@type{THREE.Mesh} */
		const _origMesh = _chairgltf.scene.getObjectByName('koltuk');
		const chairMesh = new THREE.InstancedMesh(
			_origMesh.geometry,
			_origMesh.material,
			numEdges
		);
		chairMesh.name = 'chair';

		const placeChair = (x, y, edgeType) => {
			let mat = new THREE.Matrix4();
			let quaternion;
			//ROTATION
			if (edgeType === 'tr') {
				quaternion = new THREE.Quaternion().setFromAxisAngle(
					new THREE.Vector3(0, 1, 0),
					(-3 * Math.PI) / 4
				);
			} else if (edgeType === 'bl') {
				quaternion = new THREE.Quaternion().setFromAxisAngle(
					new THREE.Vector3(0, 1, 0),
					Math.PI / 4
				);
			} else if (edgeType === 'br') {
				quaternion = new THREE.Quaternion().setFromAxisAngle(
					new THREE.Vector3(0, 1, 0),
					(3 * Math.PI) / 4
				);
			} else {
				quaternion = new THREE.Quaternion().setFromAxisAngle(
					new THREE.Vector3(0, 1, 0),
					-Math.PI / 4
				);
			}
			mat.compose(
				new THREE.Vector3(x * boxWidth, boxHeight, y * boxWidth),
				quaternion,
				new THREE.Vector3(3, 3, 3)
			);

			chairMesh.setMatrixAt(chairIndex++, mat);
		};
		this.roomTiles.push(chairMesh);
		let chairIndex = 0;

		let _plantgltf = await this.gltfLoader.loadAsync('img/models/plant.glb');
		/**@type{THREE.Mesh} */
		const _origPltMesh1 = _plantgltf.scene.getObjectByName('Circle006');
		const _origPltMesh2 = _plantgltf.scene.getObjectByName('Circle006_1');
		const plantMesh1 = new THREE.InstancedMesh(
			_origPltMesh1.geometry,
			_origPltMesh1.material,
			numEdges
		);
		const plantMesh2 = new THREE.InstancedMesh(
			_origPltMesh2.geometry,
			_origPltMesh2.material,
			numEdges
		);
		plantMesh1.name = 'plant_1';
		plantMesh2.name = 'plant_2';

		const placePlant = (x, y) => {
			let mat = new THREE.Matrix4();
			let quaternion = new THREE.Quaternion().setFromAxisAngle(
				new THREE.Vector3(0, 1, 0),
				Math.PI * Math.random()
			);
			mat.compose(
				new THREE.Vector3(x * boxWidth, boxHeight, y * boxWidth),
				quaternion,
				new THREE.Vector3(3, 3, 3)
			);

			plantMesh1.setMatrixAt(plantIndex, mat);
			plantMesh2.setMatrixAt(plantIndex++, mat);
		};
		this.roomTiles.push(plantMesh1, plantMesh2);
		let plantIndex = 0;

		// outer wall mesh + placement
		const wallGeometry = new THREE.BoxGeometry(boxWidth, wallHeight, wallDepth);
		const wallMesh = new THREE.InstancedMesh(
			wallGeometry,
			wallMaterial,
			numOuterWalls
		);
		wallMesh.name = 'outerWall';
		this.roomTiles.push(wallMesh);
		let outerWallIndex = 0;
		/**@param{'t'|'b'|'l'|'r'} wallPos */
		const placeOuterWall = (x, y, wallPos) => {
			let mat = new THREE.Matrix4();
			let quaternion = new THREE.Quaternion();
			let pos = new THREE.Vector3();
			switch (wallPos) {
				case 't':
					pos.set(
						x * boxWidth,
						boxHeight + wallMesh.geometry.parameters.height / 2,
						y * boxWidth - boxWidth / 2
					);
					break;
				case 'b':
					pos.set(
						x * boxWidth,
						boxHeight + wallMesh.geometry.parameters.height / 2,
						y * boxWidth + boxWidth / 2
					);
					break;
				case 'l':
					quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
					pos.set(
						x * boxWidth - boxWidth / 2,
						boxHeight + wallMesh.geometry.parameters.height / 2,
						y * boxWidth
					);
					break;
				case 'r':
					quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
					pos.set(
						x * boxWidth + boxWidth / 2,
						boxHeight + wallMesh.geometry.parameters.height / 2,
						y * boxWidth
					);
					break;
			}
			mat.compose(pos, quaternion, new THREE.Vector3(1, 1, 1));
			wallMesh.setMatrixAt(outerWallIndex++, mat);
		};

		for (let y = 0; y < matrix.length; y++) {
			for (let x = 0; x < matrix.length; x++) {
				if (matrix[y][x] === 'f') {
					//All tiles that are just floor
					placeFloor(x, y);
				} else if (matrix[y][x] === 'P') {
					const oneWallGroup = new THREE.Group();
					//Pillar
					//Floor
					placeFloor(x, y);
					//The concrete Wall
					placePillar(x, y);
					// Add one image to every side of the concrete wall!
					//Image Canvas First Side
					if (imageCount < images.length) {
						const dims = getImgDimensions(images[imageCount], 4);
						const canvasGeometry = new THREE.BoxGeometry(dims[0], dims[1], 0.1);
						let imgTexture = texLoader.load(images[imageCount].url);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							galleryWallMesh.geometry.parameters.height / 2 + 0.3,
							0 - boxWidth / 2 + (wallDepth / 2 + 0.4)
						);
						oneWallGroup.add(canvasMesh);
						imageCount++;
					} else {
						const canvasGeometry = new THREE.BoxGeometry(3, 3, 0.1);
						let imgTexture = texLoader.load(
							`/img/materials/ad${Math.random() > 0.5 ? '1' : '2'}.jpg`
						);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							galleryWallMesh.geometry.parameters.height / 2 + 0.3,
							0 - boxWidth / 2 + (wallDepth / 2 + 0.4)
						);
						oneWallGroup.add(canvasMesh);
					}

					//Image Canvas Second Side
					if (imageCount < images.length) {
						const dims = getImgDimensions(images[imageCount], 4);
						const canvasGeometry = new THREE.BoxGeometry(dims[0], dims[1], 0.1);
						let imgTexture = texLoader.load(images[imageCount].url);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							galleryWallMesh.geometry.parameters.height / 2 + 0.3,
							0 - boxWidth / 2 - (wallDepth / 2 + 0.4)
						);
						oneWallGroup.add(canvasMesh);
						imageCount++;
					} else {
						const canvasGeometry = new THREE.BoxGeometry(3, 3, 0.1);
						let imgTexture = texLoader.load(
							`/img/materials/ad${Math.random() > 0.5 ? '1' : '2'}.jpg`
						);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							galleryWallMesh.geometry.parameters.height / 2 + 0.3,
							0 - boxWidth / 2 - (wallDepth / 2 + 0.4)
						);
						oneWallGroup.add(canvasMesh);
					}

					oneWallGroup.position.set(x * boxWidth, 0, y * boxWidth);
					//this.scene.add(oneWallGroup);
					this.roomTiles.push(oneWallGroup);
				} else if (wallTypes.includes(matrix[y][x])) {
					const oneWallGroup = new THREE.Group();
					//Any 1 Wall
					//Ground
					placeFloor(x, y);
					//Wall
					placeOuterWall(x, y, matrix[y][x][0]);
					//Image Canvas
					if (imageSpacer % 2 === 0) {
						if (imageCount < images.length) {
							const dims = getImgDimensions(images[imageCount], 5);
							const canvasGeometry = new THREE.BoxGeometry(dims[0], dims[1], 0.1);
							let imgTexture = texLoader.load(images[imageCount].url);
							const canvasMaterial = new THREE.MeshBasicMaterial({
								map: imgTexture,
								side: THREE.FrontSide,
							});
							const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
							canvasMesh.position.set(
								0,
								wallMesh.geometry.parameters.height / 2,
								0 - boxWidth / 2 + 0.205
							);
							oneWallGroup.add(canvasMesh);
							imageCount++;
						} else {
							const canvasGeometry = new THREE.BoxGeometry(3, 3, 0.1);
							let imgTexture = texLoader.load(
								`/img/materials/ad${Math.random() > 0.5 ? '1' : '2'}.jpg`
							);
							const canvasMaterial = new THREE.MeshBasicMaterial({
								map: imgTexture,
								side: THREE.FrontSide,
							});
							const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
							canvasMesh.position.set(
								0,
								wallMesh.geometry.parameters.height / 2,
								0 - boxWidth / 2 + 0.205
							);
							oneWallGroup.add(canvasMesh);
						}
					}

					//ROTATION
					if (matrix[y][x] === 'lw') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							Math.PI / 2
						);
						oneWallGroup.applyQuaternion(quaternion);
					}
					if (matrix[y][x] === 'rw') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI / 2
						);
						oneWallGroup.applyQuaternion(quaternion);
					}
					if (matrix[y][x] === 'bw') {
						const quaternion = new THREE.Quaternion().setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI
						);
						oneWallGroup.applyQuaternion(quaternion);
					}

					oneWallGroup.position.set(x * boxWidth, 0, y * boxWidth);
					//this.scene.add(oneWallGroup);
					this.roomTiles.push(oneWallGroup);
				} else if (edgeTypes.includes(matrix[y][x])) {
					//Any 2 Wall 'Edge'
					//Ground
					placeFloor(x, y);
					//Wall1
					placeOuterWall(x, y, matrix[y][x][0]);
					//Wall2
					placeOuterWall(x, y, matrix[y][x][1]);
					//Random Plant
					const random = Math.random();
					if (random > 0.7) {
						placePlant(x, y);
					} else if (random > 0.4) {
						placeChair(x, y, matrix[y][x]);
					}
				} else if (uTypes.includes(matrix[y][x])) {
					//Any 3 Wall 'U'
					//Floor
					placeFloor(x, y);
					// Walls
					if (matrix[y][x][0] !== 't') {
						placeOuterWall(x, y, 't');
					}
					if (matrix[y][x][0] !== 'b') {
						placeOuterWall(x, y, 'b');
					}
					if (matrix[y][x][0] !== 'l') {
						placeOuterWall(x, y, 'l');
					}
					if (matrix[y][x][0] !== 'r') {
						placeOuterWall(x, y, 'r');
					}
				}
				imageSpacer++;
			}
		}
		// TODO: in the future we might have to change the y axis to fit the model
		//set Player at the middle of the room!
		this.camera.position.set((matrix.length / 2) * 5, 3, (matrix.length / 2) * 5);
		//console.log(this.roomTiles);
		console.log('Image Count: ' + imageCount, '/', images.length);
		// correct chair / plant count
		chairMesh.count = chairIndex;
		plantMesh1.count = plantIndex;
		plantMesh2.count = plantIndex;
		return imageCount;
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

	updatePlayers() {
		const game = this;

		const serverPlayersIds = game.serverPlayers.map(player => player.id);

		// Check for deleted local players
		Object.keys(game.localPlayers).forEach(function (playerId) {
			if (!serverPlayersIds.includes(playerId)) {
				game.localPlayers[playerId].deletePlayer();
				delete game.localPlayers[playerId];
				console.log(`Player ${playerId} deleted from local players`);
			}
		});

		this.serverPlayers.forEach(
			/**@param {userData} data */ function (data) {
				if (game.player.id == data.id) {
					// console.log("we hit a local player");
					// do ...
				} else if (game.localPlayers.hasOwnProperty(data.id)) {
					// Check if coordinates etc. have changed
					const prevElem = game.localPlayers[data.id];
					if (
						data.x !== prevElem.position.x ||
						data.y !== prevElem.position.y ||
						data.z !== prevElem.position.z ||
						data.ry !== prevElem.rotation.y ||
						data.rx !== prevElem.rotation.x ||
						data.rz !== prevElem.rotation.z ||
						data.model ||
						data.name
					) {
						// Update dictionary
						// console.log(data);
						game.localPlayers[data.id].updatePosition(data);
						console.log(`Player ${data.id} updated in local players`);
					}
				} else {
					// If it's a new player
					console.log(data);
					game.localPlayers[data.id] = new RemotePlayer(
						game,
						Object.assign({}, data)
					);
					delete data.model;
					delete data.name;
					console.log(`Player ${data.id} added to local players`);
				}
			}
		);
	}

	//Recursive UPDATE Loop
	renderAnimationFrame_() {
		const time = performance.now();
		const delta = (time - prevTime) / 1000;
		requestAnimationFrame(f => {
			this.renderer.render(this.scene, this.camera);
			this.cssRenderer.render(this.scene, this.camera);
			this.updatePlayers();
			Object.values(this.localPlayers).forEach(p => {
				p.anims?.update(delta);
			});
			this.renderAnimationFrame_();
		});

		if (controls.isLocked === true) {
			//raycaster.ray.origin.copy( controls.getObject().position );
			//raycaster.ray.origin.y -= 10;

			//const intersections = raycaster.intersectObjects( objects, false );

			//const onObject = intersections.length > 0;

			velocity.x -= velocity.x * 10.0 * delta;
			velocity.z -= velocity.z * 10.0 * delta;

			//velocity.y -= 9.8 * 200 * delta; // 100.0 = mass

			direction.z = Number(moveForward) - Number(moveBackward);
			direction.x = Number(moveRight) - Number(moveLeft);
			direction.normalize(); // this ensures consistent movements in all directions

			if (moveForward || moveBackward) velocity.z -= direction.z * 43.0 * delta;
			if (moveLeft || moveRight) velocity.x -= direction.x * 43.0 * delta;

			// if ( onObject === true ) {

			// 	velocity.y = Math.max( 0, velocity.y );
			// 	canJump = true;

			// }

			controls.moveRight(-velocity.x * delta);
			controls.moveForward(-velocity.z * delta);
		}

		prevTime = time;
	}

	//FPS and RAM stats
	_DEVSTATS_() {
		var script = document.createElement('script');
		script.onload = function () {
			var stats = new Stats();
			document.body.appendChild(stats.dom);
			requestAnimationFrame(function loop() {
				stats.update();
				requestAnimationFrame(loop);
			});
		};
		script.src = 'https://mrdoob.github.io/stats.js/build/stats.min.js';
		document.head.appendChild(script);
	}
}

let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
	_APP = new GalerieApp();
});
