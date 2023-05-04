import * as THREE from 'three';
import { FirstPersonControls } from 'three/examples/jsm/controls/FirstPersonControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { NoiseGenerator } from './components/noiseGenerator.js';

const KEYS = {
	a: 65,
	s: 83,
	w: 87,
	d: 68,
};

const blocker = document.getElementById( 'blocker' );
const instructions = document.getElementById( 'instructions' );
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
	constructor(game) {
		this.game = game;
	}
}

class LocalPlayer extends Player {
	constructor(game) {
		super(game);

		const socket = io.connect('http://localhost:3000');
		let localPlayer = this;

		socket.on('connect', function () {
			console.log(socket.id);
			localPlayer.id = socket.id;
		});

		socket.on('players', function (data) {
			game.serverPlayers = data;
		});
	}
}

class RemotePlayer extends Player {
	// Create Models for remote players
}

class GalerieApp {
	constructor() {
		// Initialize local player
		this.player = new LocalPlayer(this);

		// Two seperate variables to check wether the server sends new players or if players are missing
		this.serverPlayers = [];
		this.localPlayers = {};
		this.roomTiles = [];

		this.initializeRenderer_();
		this.initializeLights_();
		this.initializeScene_();
		//this.loadModel_();
		//this.createAndLoadImages_(10);
		this.initializePointerlock();

		let nG = new NoiseGenerator(18, 34);
		let grid = nG.generateNoise_();
		this.generateRoom_(grid);

		this.renderAnimationFrame_();
		this._DEVSTATS_(); //Disable in FINAL BUILD
	}

	//Create and maintain Renderer, Camera, and Scene
	initializeRenderer_() {
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.renderer.domElement);
		this.renderer.shadowMap.enabled = true;

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(
			80,
			window.innerWidth / window.innerHeight,
			0.1,
			1000
		);

		this.camera.position.set(2, 3, 0);
		this.camera.lookAt(0, 0, -10);

		//EventListener to react to a change in window size.
		window.addEventListener('resize', () => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			this.renderer.setSize(width, height);
			this.camera.aspect = width / height;
			this.camera.updateProjectionMatrix();
		});
	}

	initializePointerlock() {
		controls = new PointerLockControls( this.camera, document.body );

		const blocker = document.getElementById( 'blocker' );
		const instructions = document.getElementById( 'instructions' );

		instructions.addEventListener( 'click', function () {

				controls.lock();

			} );

		controls.addEventListener( 'lock', function () {

			instructions.style.display = 'none';
			blocker.style.display = 'none';
			console.log("lock");

		} );

		controls.addEventListener( 'unlock', function () {

			blocker.style.display = 'block';
			instructions.style.display = '';
			console.log("unlock");

		} );

		this.scene.add(controls.getObject());

		const onKeyDown = function ( event ) {

			switch ( event.code ) {

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
					if ( canJump === true ) velocity.y += 350;
					canJump = false;
					break;

			}

		};

		const onKeyUp = function ( event ) {

			switch ( event.code ) {

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

		document.addEventListener( 'keydown', onKeyDown );
		document.addEventListener( 'keyup', onKeyUp );

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

	generateRoom_(matrix) {
		console.log(matrix);
		const boxWidth = 5;
		const boxHeight = 0.2;
		const wallHeight = 10;
		const wallDepth = 0.2;
		const boxDepth = 5;

		const wallTypes = ['tw', 'lw', 'rw', 'bw'];
		const edgeTypes = ['tr', 'tl', 'br', 'bl'];
		const uTypes = ['tu', 'bu', 'lu', 'ru'];

		for (let y = 0; y < matrix.length; y++) {
			for (let x = 0; x < matrix.length; x++) {
				if (matrix[y][x] === 'f') {
					//All floor tiles
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
					const mesh = new THREE.Mesh(geometry, material);
					mesh.position.x = x * boxWidth;
					mesh.position.y = mesh.geometry.parameters.height / 2;
					mesh.position.z = y * boxWidth;
					this.scene.add(mesh);
					this.roomTiles.push(mesh);
				} else if (matrix[y][x] === 'P') {
					//Pillar
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
					const mesh = new THREE.Mesh(geometry, material);
					mesh.position.x = x * boxWidth;
					mesh.position.y = mesh.geometry.parameters.height / 2;
					mesh.position.z = y * boxWidth;
					this.scene.add(mesh);
				} else if (wallTypes.includes(matrix[y][x])) {
					//Any 1 Wall
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
					const mesh = new THREE.Mesh(geometry, material);
					mesh.position.x = 0;
					mesh.position.y = mesh.geometry.parameters.height / 2;
					mesh.position.z = 0;

					const wallGeometry = new THREE.BoxGeometry(
						boxWidth,
						wallHeight,
						wallDepth
					);
					const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
					const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
					wallMesh.position.x = 0;
					wallMesh.position.y = wallMesh.geometry.parameters.height / 2;
					wallMesh.position.z = 0 - boxWidth / 2;

					const oneWallGroup = new THREE.Group();
					oneWallGroup.add(mesh);
					oneWallGroup.add(wallMesh);

					if (matrix[y][x] === 'lw') {
						const quaternion = new THREE.Quaternion();
						quaternion.setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							Math.PI / 2
						);
						oneWallGroup.applyQuaternion(quaternion);
					}

					if (matrix[y][x] === 'rw') {
						const quaternion = new THREE.Quaternion();
						quaternion.setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI / 2
						);
						oneWallGroup.applyQuaternion(quaternion);
					}

					if (matrix[y][x] === 'bw') {
						const quaternion = new THREE.Quaternion();
						quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI);
						oneWallGroup.applyQuaternion(quaternion);
					}

					oneWallGroup.position.set(x * boxWidth, 0, y * boxWidth);

					this.scene.add(oneWallGroup);
					this.roomTiles.push(oneWallGroup);
				} else if (edgeTypes.includes(matrix[y][x])) {
					//Any 2 Wall 'Edge'
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
					const mesh = new THREE.Mesh(geometry, material);
					mesh.position.x = 0;
					mesh.position.y = mesh.geometry.parameters.height / 2;
					mesh.position.z = 0;

					const wallGeometry = new THREE.BoxGeometry(
						boxWidth,
						wallHeight,
						wallDepth
					);
					const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
					const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
					wallMesh.position.x = 0;
					wallMesh.position.y = wallMesh.geometry.parameters.height / 2;
					wallMesh.position.z = 0 - boxWidth / 2;

					const wall2Geometry = new THREE.BoxGeometry(
						wallDepth,
						wallHeight,
						boxWidth
					);
					const wall2Material = new THREE.MeshBasicMaterial({
						color: 0x333333,
					});
					const wall2Mesh = new THREE.Mesh(wall2Geometry, wall2Material);
					wall2Mesh.position.x = 0 - boxWidth / 2;
					wall2Mesh.position.y = wall2Mesh.geometry.parameters.height / 2;
					wall2Mesh.position.z = 0;

					const twoWallGroup = new THREE.Group();
					twoWallGroup.add(mesh);
					twoWallGroup.add(wallMesh);
					twoWallGroup.add(wall2Mesh);

					if (matrix[y][x] === 'tr') {
						const quaternion = new THREE.Quaternion();
						quaternion.setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							-Math.PI / 2
						);
						twoWallGroup.applyQuaternion(quaternion);
					}

					if (matrix[y][x] === 'bl') {
						const quaternion = new THREE.Quaternion();
						quaternion.setFromAxisAngle(
							new THREE.Vector3(0, 1, 0),
							Math.PI / 2
						);
						twoWallGroup.applyQuaternion(quaternion);
					}

					if (matrix[y][x] === 'br') {
						const quaternion = new THREE.Quaternion();
						quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI);
						twoWallGroup.applyQuaternion(quaternion);
					}

					twoWallGroup.position.set(x * boxWidth, 0, y * boxWidth);

					this.scene.add(twoWallGroup);
					this.roomTiles.push(twoWallGroup);
				} else if (uTypes.includes(matrix[y][x])) {
					//Any 3 Wall 'U'
					const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
					const material = new THREE.MeshBasicMaterial({ color: 0xaa00aa });
					const mesh = new THREE.Mesh(geometry, material);
					mesh.position.x = x * boxWidth;
					mesh.position.y = mesh.geometry.parameters.height / 2;
					mesh.position.z = y * boxWidth;
					this.scene.add(mesh);
				}
			}
		}

		//set Player at the middle of the room!
		this.camera.position.set(
			(matrix.length / 2) * 5,
		3,
		(matrix.length / 2) * 5);
		console.log(this.roomTiles);
	}

	async createAndLoadImages_(count) {
		const apiKey = 'sWgSDWNA9FkyrQ0TMq6jgVOFO-mBQcADR5DUCMVJNJw'; // Replace with your own API key
		const apiUrl = `https://api.unsplash.com/photos/random?client_id=${apiKey}&count=${count}`;

		try {
			const response = await fetch(apiUrl);
			const imageData = await response.json();
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

			const squares = []; // Array to hold the squares

			const canvasSize = 5;
			const radius = count;

			for (let i = 0; i < images.length; i++) {
				//Dimensions of the images for ThreeJS, biggest side is set to canvasSize
				// [0] returns width, [1] returns height
				const imgDimensions = ((img, canvasSize) => {
					let w, h;
					if (img.width > img.height) {
						w = canvasSize;
						h = canvasSize * (img.height / img.width);
					} else {
						h = canvasSize;
						w = canvasSize * (img.width / img.height);
					}

					return [w, h];
				})(images[i], canvasSize);

				//Angles for positioning as a polygon
				const angle = (i / count) * Math.PI * 2;
				const position = new THREE.Vector3(
					Math.cos(angle) * radius,
					imgDimensions[1] / 2,
					Math.sin(angle) * radius
				); // Position of the square in 3D space

				//Set size of canvas
				const geometry = new THREE.BoxGeometry(
					imgDimensions[0],
					imgDimensions[1],
					0
				);

				//Set URL Image as Canvas Material
				const texLoader = new THREE.TextureLoader();
				texLoader.crossOrigin = 'Anonymous';
				let imgTexture = texLoader.load(images[i].url);
				const material = new THREE.MeshBasicMaterial({
					map: imgTexture,
					side: THREE.FrontSide,
				});

				const square = new THREE.Mesh(geometry, material); // Square mesh
				square.position.copy(position); // Set square position

				// Calculate angle between square position and origin
				const target = new THREE.Vector3(0, imgDimensions[1] / 2, 0);
				square.lookAt(target);
				//square.rotation.x = Math.PI; // Rotate square to stand up towards origin
				squares.push(square); // Add square to array
			}

			// Add all squares to a group
			const group = new THREE.Group();
			squares.forEach(square => group.add(square));
			this.scene.add(group);
		} catch (e) {
			console.error(e);
		}
	}

	updatePlayers() {
		const game = this;
		// console.log(this.serverPlayers);
		// console.log(game.player);
		this.serverPlayers.forEach(function (data) {
			if (game.player.id == data.id) {
				// console.log("we hit a local player");
				// do ...
			} else if (game.localPlayers.hasOwnProperty(data.id)) {
				// Check if coordinates etc. have changed
				const prevElem = game.localPlayers[data.id];
				if (
					data.x !== prevElem.x ||
					data.y !== prevElem.y ||
					data.z !== prevElem.z
				) {
					// Update dictionary
					game.localPlayers[data.id] = data;
					console.log(`Player ${data.id} updated in local players`);
				}
				// console.log(data);
			} else {
				// If it's a new player
				game.localPlayers[data.id] = data;
				console.log(`Player ${data.id} added to local players`);
			}
		});
	}

	//Recursive UPDATE Loop
	renderAnimationFrame_() {
		requestAnimationFrame(f => {
			this.renderer.render(this.scene, this.camera);
			this.updatePlayers();
			this.renderAnimationFrame_();
		});
		const time = performance.now();

				if ( controls.isLocked === true ) {

					//raycaster.ray.origin.copy( controls.getObject().position );
					//raycaster.ray.origin.y -= 10;

					//const intersections = raycaster.intersectObjects( objects, false );

					//const onObject = intersections.length > 0;

					const delta = ( time - prevTime ) / 1000;

					velocity.x -= velocity.x * 10.0 * delta;
					velocity.z -= velocity.z * 10.0 * delta;

					//velocity.y -= 9.8 * 200 * delta; // 100.0 = mass

					direction.z = Number( moveForward ) - Number( moveBackward );
					direction.x = Number( moveRight ) - Number( moveLeft );
					direction.normalize(); // this ensures consistent movements in all directions

					if ( moveForward || moveBackward ) velocity.z -= direction.z * 200.0 * delta;
					if ( moveLeft || moveRight ) velocity.x -= direction.x * 200.0 * delta;

					// if ( onObject === true ) {

					// 	velocity.y = Math.max( 0, velocity.y );
					// 	canJump = true;

					// }

					controls.moveRight( - velocity.x * delta );
					controls.moveForward( - velocity.z * delta );

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

	loadModel_() {
		const log_error = function (error) {
			console.error(error);
		};
		//Car
		let mtlLoader = new MTLLoader();
		mtlLoader.setMaterialOptions({
			side: THREE.FrontSide,
			ignoreZeroRGBs: true,
		});
		mtlLoader.setPath('./img/models/');
		mtlLoader.load(
			'jeep.mtl',
			mat => {
				mat.preload();
				mat.materials.car_jeep_ren.color.setHex(0xffffff);
				let objLoader = new OBJLoader();
				objLoader.setMaterials(mat);
				objLoader.setPath('./img/models/').load(
					'jeep.obj',
					obj => {
						obj.traverse(o => {
							o.castShadow = true;
							//o.receiveShadow = false;
						});
						obj.position.set(20, 0, 20);
						obj.scale.set(1.6, 1.6, 1.6);
						obj.baseColor = 0xffffff;
						this.scene.add(obj);
					},
					undefined,
					log_error
				);
			},
			undefined,
			log_error
		);
	}
}

let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
	_APP = new GalerieApp();
});
