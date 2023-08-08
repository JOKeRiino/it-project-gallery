import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import {
	CSS2DRenderer,
	CSS2DObject,
} from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
//Internal Classes
import { NoiseGenerator } from './components/noiseGenerator.js';
import { RemotePlayer } from './components/RemotePlayer.js';
import { LocalPlayer } from './components/LocalPlayer.js';

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
let controls;
/**@type {PointerLockControls} */
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

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
		this.localPlayers = {};
		/**@type {Object.<string,RemotePlayer>} */
		this.roomTiles = [];

		this.initializeRenderer_();
		this.initializeSkyBoxAndLights_();
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

		this._DEVSTATS_(); //Deactivate in production

		//Create a World and Render it
		this.initializeGallery_().then(() => {
			this.renderAnimationFrame_();
			let loadingScreen = document.getElementById('loading-screen');
			loadingScreen.style.display = 'none';
		});
	}

	//Create and maintain Renderer, Camera, and Scene
	initializeRenderer_() {
		this.renderer = new THREE.WebGLRenderer({
			canvas: document.getElementById('main'),
			antialias: true,
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
		this.camera.layers.enableAll();
		this.camera.rotation.order = 'YXZ';

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

		this.screenCenter = new THREE.Vector2(0, 0);

		this.rayCaster = new THREE.Raycaster(undefined, undefined, undefined, 7.5);

		/**
		 * Filtering via Layers:
		 * - Layer 0: Everything
		 * - Layer 1: All Room Tiles (excluding the pictures)
		 * - Layer 2: The Pictures
		 * - Layer 3: Other Players
		 * - Layer 4 to 31: Nothing
		 */

		this.rayCaster.layers.set(2);
		this.rayCaster.layers.enable(1);

		this.pictureLabelElem = document.createElement('div');
		let pictureLabelAuthor = document.createElement('h2');
		let pictureLabelTitle = document.createElement('h3');
		this.pictureLabelElem.className = 'pictureLabel';
		this.pictureLabelElem.appendChild(pictureLabelAuthor);
		this.pictureLabelElem.appendChild(pictureLabelTitle);
		this.pictureLabel = new CSS2DObject(this.pictureLabelElem);
		this.pictureLabel.position.set(0, 0, 0);
		this.pictureLabel.visible = false;
		this.scene.add(this.pictureLabel);

		//Configuring Loading Manager for Loading Screen
		THREE.Cache.enabled = true;
		const progressBar = document.getElementById('image-fetch-progress');
		this.loadingManager = new THREE.LoadingManager();
		let loader = document.getElementById('loader');
		this.loadingManager.onProgress = (url, loaded, total) => {
			loader.style.width = (loaded / total) * 100 + '%';
			progressBar.textContent = 'Loaded ' + url.split('/').at(-1);
		};
		this.gltfLoader = new GLTFLoader(this.loadingManager);
		this.fbxLoader = new FBXLoader(this.loadingManager);
		this.textureLoader = new THREE.TextureLoader(this.loadingManager);
		this.textureLoader.crossOrigin = 'Anonymous';
		this.fbxLoader.setPath('img/models/avatars/textures/');

		//EventListener to react to a change in window size.
		window.addEventListener('resize', () => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			this.renderer.setSize(width, height);
			this.cssRenderer.setSize(width, height);
			this.camera.aspect = width / height;
			this.camera.updateProjectionMatrix();
		});

		window.addEventListener(
			'mousemove',
			ev => this.checkIntersectionOnMouseMove(ev),
			false
		);
	}

	initializeAvatarPreview_(model) {
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

						//console.log(o.name);
						// Hide hat
						if (o.name === 'Hat') {
							o.visible = false;
							// o.renderOrder = -1;
						}
					}
				});

				// Load texture
				this.textureLoader.load(
					'img/models/avatars/textures/' + model + '.png',
					function (texture) {
						mdl.traverse(o => {
							if (o.isMesh) {
								console.debug('set tex', o);
								o.material.map = texture;
								o.material.needsUpdate = true;
							}
						});
						scene.add(mdl);
					}
				);
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

			//console.log('lock');
		});
		const galleryAppInstance = this;

		controls.addEventListener('unlock', function () {
			// If event is triggered by chatbox don't open the menu
			if (pointerLockForChat) {
				pointerLockForChat = false;
			} else {
				blocker.style.display = 'block';
				instructions.style.display = '';
				galleryAppInstance.initializeAvatarPreview_(
					blocker.querySelector('select#playerModel').value
				);
				pointerLockRegular = true;
			}
			//console.log('unlock');
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

	//Creating the sky and the lights
	initializeSkyBoxAndLights_() {
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
		//LIGHTS
		let hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
		hemiLight.position.set(0, 300, 0);
		this.scene.add(hemiLight);
		var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
		dirLight.position.set(75, 300, -75);
		this.scene.add(dirLight);
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
		this.imgCount = 0;
		this.noiseGeneratorSize = 1;
		try {
			const response = await fetch('/scrapeImages');
			const images = await response.json();
			let grid = null;
			do {
				this.noiseGeneratorSize++;
				grid = new NoiseGenerator(
					this.noiseGeneratorSize,
					1 //Seed for Generation
				).generateNoise_();
			} while (!this.checkRoomCapacity(grid, images.length));
			this.imgCount = await this.generateRoom_(grid, images);
		} catch (e) {
			console.error(e);
		}

		this.roomTiles.forEach(r => {
			if (r.name === 'plaque') console.debug(r);
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
				if (wallTypes.includes(matrix[i][j])) capacity += 1;
			}
		return Math.floor(capacity) > min_cap;
	}

	/**
	 *
	 * @param {Array<Array<string>>} matrix
	 * @param {Array<ImageInfo>} images
	 */
	async generateRoom_(matrix, images) {
		let imageCount = 0;
		this.plaques = [];
		this.imageElements = [];

		const boxWidth = 5;
		const boxHeight = 0.2;
		const wallHeight = 10;
		const wallDepth = 0.2;
		const boxDepth = 5;
		const wallTypes = ['tw', 'lw', 'rw', 'bw'];
		const edgeTypes = ['tr', 'tl', 'br', 'bl'];
		const uTypes = ['tu', 'bu', 'lu', 'ru'];

		//Floor Texture + Mat
		const floorTexture = await this.textureLoader.loadAsync(
			'/img/materials/carpet2.jpg'
		);
		const floorMaterial = new THREE.MeshBasicMaterial({
			map: floorTexture,
		});
		//Ceiling Texture + Mat
		const ceilingTexture = await this.textureLoader.loadAsync(
			'/img/materials/ceiling.jpg'
		);
		const ceilingMaterial = new THREE.MeshBasicMaterial({
			map: ceilingTexture,
		});

		//CeilingWindow Texture + Mat
		const ceilingWindowTexture = await this.textureLoader.loadAsync(
			'img/materials/ceilingWindow2.png'
		);
		const ceilingWindowMaterial = new THREE.MeshBasicMaterial({
			map: ceilingWindowTexture,
			transparent: true,
		});

		//Wall Texture + Mat
		const wallTexture = await this.textureLoader.loadAsync(
			'/img/materials/wall1.png'
		);
		const wallMaterial = new THREE.MeshBasicMaterial({
			map: wallTexture,
		});
		//Gallery Wall Texture + Mat
		const galleryWallTexture = await this.textureLoader.loadAsync(
			'/img/materials/gallerywall1.png'
		);
		const galleryWallMaterial = new THREE.MeshBasicMaterial({
			map: galleryWallTexture,
		});
		//Plaque Texture + Mat + Geometry
		const plaqueTexture = await this.textureLoader.loadAsync(
			'/img/materials/artistplacat.png'
		);
		const plaqueMaterial = new THREE.MeshBasicMaterial({
			map: plaqueTexture,
		});
		const plaqueGeometry = new THREE.BoxGeometry(1, 0.6, 0.05);

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
		floorMesh.layers.enable(1);
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

		// Ceiling mesh + placement function
		const ceilingGeometry = new THREE.BoxGeometry(
			boxWidth,
			boxHeight * 2,
			boxDepth
		);
		const ceilingMesh = new THREE.InstancedMesh(
			ceilingGeometry,
			ceilingMaterial,
			numFloors
		);
		ceilingMesh.layers.enable(1);
		ceilingMesh.name = 'ceiling';
		ceilingMesh.receiveShadow = true;
		this.roomTiles.push(ceilingMesh);
		let ceilingIndex = 0;
		const placeCeiling = (x, y) => {
			let mat = new THREE.Matrix4();
			mat.setPosition(
				x * boxWidth,
				ceilingMesh.geometry.parameters.height / 2 + wallHeight,
				y * boxWidth
			);
			ceilingMesh.setMatrixAt(ceilingIndex++, mat);
		};

		// Ceiling Window mesh + placement function + alpha
		const ceilingWindowAlphaMap = await this.textureLoader.loadAsync(
			'img/materials/ceilingWindowAlphaMap.png'
		);
		ceilingWindowMaterial.alphaMap = ceilingWindowAlphaMap;
		ceilingWindowMaterial.alphaMap.magFilter = THREE.NearestFilter;

		const ceilingWindowGeometry = new THREE.BoxGeometry(
			boxWidth,
			boxHeight,
			boxDepth
		);
		const ceilingWindowMesh = new THREE.InstancedMesh(
			ceilingWindowGeometry,
			ceilingWindowMaterial,
			numFloors
		);
		ceilingWindowMesh.layers.enable(1);
		ceilingWindowMesh.name = 'ceiling';
		ceilingWindowMesh.receiveShadow = true;
		this.roomTiles.push(ceilingWindowMesh);
		let ceilingWindowIndex = 0;
		const placeCeilingWindow = (x, y) => {
			let mat = new THREE.Matrix4();
			mat.setPosition(
				x * boxWidth,
				ceilingWindowMesh.geometry.parameters.height / 2 + wallHeight,
				y * boxWidth
			);
			ceilingWindowMesh.setMatrixAt(ceilingWindowIndex++, mat);
		};

		//Plaque Mesh + Placement function
		const plaqueMesh = new THREE.InstancedMesh(
			plaqueGeometry,
			plaqueMaterial,
			images.length
		);
		plaqueMesh.layers.enable(1);
		plaqueMesh.name = 'plaque';
		this.roomTiles.push(plaqueMesh);
		let plaqueIndex = 0;

		const placePlaque = (x, y, edgeType) => {
			let mat = new THREE.Matrix4();
			//ROTATION
			switch (edgeType) {
				case 'p1':
					mat.setPosition(
						x * boxWidth,
						galleryWallMesh.geometry.parameters.height * 0.15,
						y * boxWidth + (wallDepth / 2 + 0.4)
					);
					break;
				case 'p2':
					mat.setPosition(
						x * boxWidth,
						galleryWallMesh.geometry.parameters.height * 0.15,
						y * boxWidth - (wallDepth / 2 + 0.4)
					);
					break;
				case 'lw':
					mat.makeRotationY(Math.PI / 2);
					mat.setPosition(
						x * boxWidth - boxWidth / 2 + 0.1,
						wallMesh.geometry.parameters.height * 0.12,
						y * boxWidth
					);
					break;
				case 'rw':
					mat.makeRotationY(Math.PI / 2);
					mat.setPosition(
						x * boxWidth + boxWidth / 2 - 0.1,
						wallMesh.geometry.parameters.height * 0.12,
						y * boxWidth
					);
					break;
				case 'tw':
					mat.setPosition(
						x * boxWidth,
						wallMesh.geometry.parameters.height * 0.12,
						y * boxWidth - boxWidth / 2 + 0.1
					);
					break;
				case 'bw':
					mat.setPosition(
						x * boxWidth,
						wallMesh.geometry.parameters.height * 0.12,
						y * boxWidth + boxWidth / 2 - 0.1
					);
					break;
			}
			plaqueMesh.setMatrixAt(plaqueIndex++, mat);
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
		galleryWallMesh.layers.enable(1);
		galleryWallMesh.name = 'galleryWall';
		this.roomTiles.push(galleryWallMesh);
		let galleryWallIndex = 0;
		const placePillar = (x, y) => {
			let mat = new THREE.Matrix4();
			mat.setPosition(
				x * boxWidth,
				boxHeight + galleryWallMesh.geometry.parameters.height / 2,
				y * boxWidth
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
		chairMesh.layers.enable(1);
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
		plantMesh1.layers.enable(1);
		plantMesh2.layers.enable(1);
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
		wallMesh.layers.enable(1);
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
					placeCeiling(x, y);
				} else if (matrix[y][x] === 'P') {
					const oneWallGroup = new THREE.Group();
					//Pillar
					//Floor
					placeFloor(x, y);
					//The concrete Wall
					placePillar(x, y);
					//The ceiling window above
					placeCeilingWindow(x, y);
					// Add one image to every side of the concrete wall!
					//Image Canvas First Side
					if (imageCount < images.length) {
						const dims = getImgDimensions(images[imageCount], 4);
						let canvasGeometry = new THREE.BoxGeometry(dims[0], dims[1], 0.1);
						let imgTexture = await this.textureLoader.loadAsync(
							images[imageCount].url.replace(
								'http://digbb.informatik.fh-nuernberg.de',
								'/image-proxy'
							)
						);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							galleryWallMesh.geometry.parameters.height / 2 + 0.3,
							0 + (wallDepth / 2 + 0.4)
						);
						canvasMesh.layers.enable(2);
						canvasMesh.name = images[imageCount].title;
						this.imageElements.push(canvasMesh);
						this.plaques.push({
							imageId: canvasMesh.uuid,
							author: images[imageCount].author,
							title: images[imageCount].title,
						});
						oneWallGroup.add(canvasMesh);
						placePlaque(x, y, 'p1');
						imageCount++;
					}

					//Image Canvas Second Side
					if (imageCount < images.length) {
						const dims = getImgDimensions(images[imageCount], 4);
						const canvasGeometry = new THREE.BoxGeometry(dims[0], dims[1], 0.1);
						let imgTexture = await this.textureLoader.loadAsync(
							images[imageCount].url.replace(
								'http://digbb.informatik.fh-nuernberg.de',
								'/image-proxy'
							)
						);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							galleryWallMesh.geometry.parameters.height / 2 + 0.3,
							0 - (wallDepth / 2 + 0.4)
						);
						canvasMesh.layers.enable(2);
						canvasMesh.name = images[imageCount].title;
						placePlaque(x, y, 'p2');
						this.plaques.push({
							imageId: canvasMesh.uuid,
							author: images[imageCount].author,
							title: images[imageCount].title,
						});
						this.imageElements.push(canvasMesh);
						oneWallGroup.add(canvasMesh);
						imageCount++;
					}

					oneWallGroup.position.set(x * boxWidth, 0, y * boxWidth);
					//this.scene.add(oneWallGroup);
					this.roomTiles.push(oneWallGroup);
				} else if (wallTypes.includes(matrix[y][x])) {
					const oneWallGroup = new THREE.Group();
					//Any 1 Wall
					//Ground
					placeFloor(x, y);
					placeCeiling(x, y);
					//Wall
					placeOuterWall(x, y, matrix[y][x][0]);
					//Image Canvas
					if (imageCount < images.length) {
						const dims = getImgDimensions(images[imageCount], 4);
						const canvasGeometry = new THREE.BoxGeometry(dims[0], dims[1], 0.1);
						let imgTexture = await this.textureLoader.loadAsync(
							images[imageCount].url.replace(
								'http://digbb.informatik.fh-nuernberg.de',
								'/image-proxy'
							)
						);
						const canvasMaterial = new THREE.MeshBasicMaterial({
							map: imgTexture,
							side: THREE.FrontSide,
						});
						const canvasMesh = new THREE.Mesh(canvasGeometry, canvasMaterial);
						canvasMesh.position.set(
							0,
							wallMesh.geometry.parameters.height * 0.42,
							0 - boxWidth / 2 + 0.205
						);
						canvasMesh.layers.enable(2);
						canvasMesh.name = images[imageCount].title;
						placePlaque(x, y, matrix[y][x]);

						this.plaques.push({
							imageId: canvasMesh.uuid,
							author: images[imageCount].author,
							title: images[imageCount].title,
						});
						this.imageElements.push(canvasMesh);
						oneWallGroup.add(canvasMesh);
						imageCount++;
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
					placeCeiling(x, y);
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
					placeCeiling(x, y);
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
				//imageSpacer++;
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
		ceilingMesh.count = ceilingIndex;
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

	checkIntersectionOnMouseMove(event) {
		this.rayCaster.setFromCamera(this.screenCenter, this.camera);

		let intersects = this.rayCaster.intersectObjects(this.scene.children, true);

		if (intersects.length > 0) {
			//console.debug(intersects);
			let foundElement = this.plaques.find(
				el => el.imageId === intersects[0].object.uuid
			);
			if (foundElement) {
				this.pictureLabel.position.copy(intersects[0].point);
				this.pictureLabel.position.y -= 2;
				this.pictureLabel.element.children[0].innerText =
					'"' + foundElement.title + '"';
				this.pictureLabel.element.children[1].innerText = foundElement.author;
				this.pictureLabel.visible = true;
			}
		} else {
			this.pictureLabel.visible = false;
		}
	}

	//Recursive UPDATE Loop
	renderAnimationFrame_() {
		this.renderer.setAnimationLoop(time => {
			const delta = (time - prevTime) / 1000;
			this.updatePlayers();
			Object.values(this.localPlayers).forEach(p => {
				p.anims?.update(delta);
			});

			if (controls.isLocked === true) {
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
			this.renderer.render(this.scene, this.camera);
			this.cssRenderer.render(this.scene, this.camera);
			prevTime = time;
		});
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
