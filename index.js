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

// TODO Klassen LocalPlayer und RemotePlayer erstellen?
class Player {
	id = '';
	/**@type {THREE.Vector3} */
	position;
	/**@type {THREE.Vector3} */
	rotation;
	/**@type {GalerieApp} */
	game;
	name = '';
	model = '';
	/**@param {GalerieApp} game */
	constructor(game) {
		this.game = game;
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

		const fontloader = new FontLoader();

		//TODO Create character model with starting position
		// create a material with vertex coloring enabled
		var material = new THREE.MeshBasicMaterial({ vertexColors: true });

		// create a box geometry
		var geometry = new THREE.BoxGeometry(1, 1, 1);

		// get the position and color attributes of the geometry
		var position = geometry.getAttribute('position');
		var color = geometry.getAttribute('color');

		// create an array to store the color data
		var colors = [];

		// loop through the vertices of the geometry
		for (var i = 0; i < geometry.attributes.position.count; i++) {
			// generate a random color for each vertex
			var color = new THREE.Color(Math.random() * 0xffffff);

			// push the color components to the array
			colors.push(color.r, color.g, color.b);
		}

		// create a BufferAttribute object from the array
		var colorAttribute = new THREE.Float32BufferAttribute(colors, 3);

		// add the color attribute to the geometry
		geometry.setAttribute('color', colorAttribute);

		let name = document.createElement('div');
		name.textContent = startingPosition.name;
		name.className = 'player-name';

		this.nameTag = new CSS2DObject(name);

		this.block = new THREE.Mesh(geometry, material);
		this.block.add(this.nameTag);
		this.game.scene.add(this.block);

		// set the initial position of the block
		this.block.position.set(this.position.x, this.position.y, this.position.z);
		this.nameTag.position.copy(this.block.position);
		this.block.rotation.x = startingPosition.rx;
		this.block.rotation.y = startingPosition.ry;
		this.block.rotation.z = startingPosition.rz;

		console.log('New Remote Player created');
	}

	updatePosition(position) {
		this.position.x = position.x;
		this.position.y = position.y;
		this.position.z = position.z;

		this.rotation.y = position.ry;
		this.rotation.x = position.rx;
		this.rotation.z = position.rz;

		if (position.name) {
			this.name = position.name;
			this.nameTag.element.innerText = this.name;
		}
		if (position.model) {
			this.model = position.model;
			// TODO: Change Model
		}

		// update the position of the block
		this.block.position.set(position.x, position.y, position.z);
		// update the rotation of the block
		this.block.rotation.x = position.rx;
		this.block.rotation.y = position.ry;
		this.block.rotation.z = position.rz;

		this.block.position.needsUpdate = true; // tell three.js to update the position
	}

	deletePlayer() {
		this.game.scene.remove(this.block);
		this.game.scene.remove(this.nameTag);
		this.block.geometry.dispose(); // dispose its geometry
		this.block.material.dispose(); // dispose its material
		// this.block.texture.dispose(); // dispose its texture
		this.block = undefined; // set it to undefined
		this.nameTag = undefined;
	}
}

class LocalPlayer extends Player {
	/**@type {Socket} */
	socket;
	/**
	 * @param {GalerieApp} game
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
		});
	}

	/**@param {THREE.Camera} camera */
	updatePosition(camera) {
		// console.log("Camera: ");
		// console.log(camera);
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
			});
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
		this.renderer = new THREE.WebGLRenderer();
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

		//Configuring Loading Manager for Loading Screen
		this.loadingManager = new THREE.LoadingManager();
		let loader = document.getElementById('loader');
		this.loadingManager.onProgress = (url, loaded, total) => {
			loader.style.width = (loaded / total) * 100 + '%';
		};
		this.gltfLoader = new GLTFLoader(this.loadingManager);

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

	initializePointerlock() {
		controls = new PointerLockControls(this.camera, document.body);

		const blocker = document.getElementById('blocker');
		const instructions = document.getElementById('instructions');

		instructions.querySelector('form').addEventListener('submit', e => {
			if (instructions.querySelector('form').checkValidity()) {
				// TODO: Validate and save player name / model etc.
				this.player.name = instructions.querySelector('#playerName').value;
				this.player.model = instructions.querySelector('#playerModel').value;
				this.player.initSocket();
				if (!this.updater)
					this.updater = setInterval(() => {
						this.player.updatePosition(this.camera);
					}, 40);
				controls.lock();
			}
		});

		// instructions.addEventListener('click', function () {
		// 	controls.lock();
		// });

		controls.addEventListener('lock', function () {
			instructions.style.display = 'none';
			blocker.style.display = 'none';
			console.log('lock');
		});

		controls.addEventListener('unlock', function () {
			blocker.style.display = 'block';
			instructions.style.display = '';
			console.log('unlock');
		});

		this.scene.add(controls.getObject());

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
			}
		};

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
	 * @  property {any?} model user chosen model
	 * @  property {any?} colour skin color or similar
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
						data.rz !== prevElem.rotation.z
					) {
						// Update dictionary
						console.log(data);
						game.localPlayers[data.id].updatePosition(data);
						console.log(`Player ${data.id} updated in local players`);
					}
					// console.log(data);
				} else {
					// If it's a new player
					console.log(data);
					game.localPlayers[data.id] = new RemotePlayer(game, data);
					console.log(`Player ${data.id} added to local players`);
				}
			}
		);
	}

	//Recursive UPDATE Loop
	renderAnimationFrame_() {
		requestAnimationFrame(f => {
			this.renderer.render(this.scene, this.camera);
			this.cssRenderer.render(this.scene, this.camera);
			this.updatePlayers();
			this.renderAnimationFrame_();
		});
		const time = performance.now();

		if (controls.isLocked === true) {
			//raycaster.ray.origin.copy( controls.getObject().position );
			//raycaster.ray.origin.y -= 10;

			//const intersections = raycaster.intersectObjects( objects, false );

			//const onObject = intersections.length > 0;

			const delta = (time - prevTime) / 1000;

			velocity.x -= velocity.x * 10.0 * delta;
			velocity.z -= velocity.z * 10.0 * delta;

			//velocity.y -= 9.8 * 200 * delta; // 100.0 = mass

			direction.z = Number(moveForward) - Number(moveBackward);
			direction.x = Number(moveRight) - Number(moveLeft);
			direction.normalize(); // this ensures consistent movements in all directions

			if (moveForward || moveBackward) velocity.z -= direction.z * 200.0 * delta;
			if (moveLeft || moveRight) velocity.x -= direction.x * 200.0 * delta;

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
